/**
 * `HorseRecord`（遺伝エンジンの産物）→ `RaceEntrant`（レース判定の入力）の変換と、
 * モンテカルロ用の出走表生成。
 *
 * ★★★ 指示書 §3 の重要な前提 ★★★
 * レースは `stats`（調教で伸びた現在値）を使うが、**育成ループは P3**。
 * そこで P1 では**素質開放率のプレースホルダ**を置き、`current = potential × 開放率` とする。
 *
 * **この値は仮であり、P3 で実際の調教モデルに置き換わる。**
 * そして `RACE_RANDOM_K = 0.12` の較正は**この仮定に依存している**。
 * P3 で本物の育成ループが入ったら **K を再較正しなければならない**（R-7: 較正条件の明記）。
 * 開放率の分布が変われば出走馬間の能力差の分散が変わり、同じ K でも 1番人気の勝率は動く。
 */

import type { AbilityKey, HorseRecord, Rng, Strategy } from '@star/sim-engine';
import { ABILITY_KEYS, STRATEGIES } from '@star/sim-engine';
import type {
  RaceConditions,
  RaceEntrant,
  Surface,
  TrackCondition,
} from '@star/race-engine';

/**
 * 素質開放率のプレースホルダ（指示書 §3 の例示に従う）。
 *
 * ⚠️ P3 で調教モデルに置き換わる仮の値。正典 §13.1 の `INITIAL_UNLOCK_MIN/MAX`（0.28〜0.35）は
 *    **デビュー時**の開放率で、レースを走る現役馬の水準ではない。
 *    指示書 §3 が例示した 0.55〜0.85 を採用する。
 */
export const PLACEHOLDER_UNLOCK = { MIN: 0.55, MAX: 0.85 } as const;

/** 馬場状態適性の既定値（I-COND-APT-SOURCE: genotype に無いため遺伝しない） */
export const NEUTRAL_CONDITION_APTITUDE = 50;

export interface EntrantOverrides {
  strategy?: Strategy;
  condition?: number;
  fatigue?: number;
  weightKg?: number;
  gate?: number;
  age?: number;
}

/**
 * `HorseRecord` を出走馬に変換する。
 *
 * 現在値は `potential × 開放率`。開放率は馬ごとに1回サンプルし、全能力に同じ率を掛ける
 * （能力ごとに独立にサンプルすると、素質の形（SP型/ST型）が現在値で消えてしまう）。
 */
export function toEntrant(
  horse: HorseRecord,
  rng: Rng,
  overrides: EntrantOverrides = {},
  unlockRange: { MIN: number; MAX: number } = PLACEHOLDER_UNLOCK,
): RaceEntrant {
  const unlock = rng.range(unlockRange.MIN, unlockRange.MAX);
  const stats = {} as Record<AbilityKey, number>;
  for (const key of ABILITY_KEYS) stats[key] = horse.potential[key] * unlock;

  // 脚質は素質（strategyAptitude）が最も高いものを既定にする。
  // 「適性のない脚質を選ぶと露骨に弱くなる」（§8.4）ので、放置馬が理不尽に弱くならないようにする。
  let bestStrategy: Strategy = 'senko';
  let bestValue = -1;
  for (const s of STRATEGIES) {
    const v = horse.strategyAptitude[s];
    if (v > bestValue) {
      bestValue = v;
      bestStrategy = s;
    }
  }

  return {
    horseId: horse.id,
    stats,
    surfaceAptitude: { turf: horse.surfaceAptitude.turf, dirt: horse.surfaceAptitude.dirt },
    distanceCenter: horse.distanceCenter,
    distanceRange: horse.distanceRange,
    strategyAptitude: { ...horse.strategyAptitude },
    conditionAptitude: {
      good: NEUTRAL_CONDITION_APTITUDE,
      yielding: NEUTRAL_CONDITION_APTITUDE,
      soft: NEUTRAL_CONDITION_APTITUDE,
    },
    strategy: overrides.strategy ?? bestStrategy,
    condition: overrides.condition ?? 3,
    fatigue: overrides.fatigue ?? 0,
    weightKg: overrides.weightKg ?? 55,
    gate: overrides.gate ?? 1,
    age: overrides.age ?? 4,
    skillGenes: horse.skillGenes.slice(),
  };
}

// ---------------------------------------------------------------------------
// 出走表の生成
// ---------------------------------------------------------------------------

/** 正典 §10.4: 1レース 8〜18頭 */
export const FIELD_SIZE = { MIN: 8, MAX: 18 } as const;

const SURFACES: readonly Surface[] = ['turf', 'dirt'];
/** 実在の番組に寄せた距離の刻み。§8.2 の5距離帯すべてを踏む */
const DISTANCES = [1200, 1400, 1600, 1800, 2000, 2200, 2400, 2600, 3000, 3200] as const;

export interface GeneratedRace {
  conditions: RaceConditions;
  entrants: RaceEntrant[];
  /**
   * このレースのクラス水準（0=最下級 〜 1=最上級）。
   *
   * ★賞金をクラスで重み付けするために要る。クラス分けを入れた結果、賞金が
   *   「**そのクラスの中で強いか**」しか測らなくなり、下級条件で稼ぐ弱い馬と
   *   上級で稼ぐ強い馬が同じ評価になっていた（K-4 の実測で V-1 が 19.7% まで上昇）。
   *   実際の競馬でも上級条件の賞金は桁違いで、これが絶対能力への選抜圧を作っている。
   */
  classLevel: number;
}

/**
 * レース条件と出走表を1つ生成する。
 *
 * ★条件（距離・馬場・馬場状態）を振るのは重要。単一条件で較正すると、
 *   「その条件でだけ 1番人気が30%」という K になる（R-7 の趣旨）。
 */
/**
 * 能力順に並べた母集団（クラス分けの土台）。
 *
 * ★これが無いと V-4〜V-6 は構造的に成立しない。
 *   血統プール全体から無作為に18頭選ぶと、最強馬と最弱馬の能力差が実際の番組より遥かに広くなり、
 *   **1番人気の勝率が60%近くまで跳ね上がる**（実測）。正典 §10.3 は番組表を持ち、
 *   §10.5 は NPC を「プレイヤー上位30%×0.92」に追従させると定めている＝**同格が集まる**設計。
 *   したがって出走表は能力帯（クラス）から引く。
 *
 * ⚠️ クラス幅は開発側の較正対象であって正典の値ではない（報告書 §6 に調整履歴を書く）。
 *   ここを調整するのは、正典が定める `RACE_RANDOM_K = 0.12` を動かさずに済ませるため。
 *   **自分のプレースホルダの粗さを、正典の定数を曲げて埋めない。**
 */
export function sortPoolByClass(pool: readonly HorseRecord[]): readonly HorseRecord[] {
  return [...pool].sort((a, b) => {
    let ta = 0;
    let tb = 0;
    for (const k of ABILITY_KEYS) {
      ta += a.potential[k];
      tb += b.potential[k];
    }
    return ta - tb;
  });
}

/** クラス幅（母集団に対する割合）の既定値。較正で決めた値 */
export const DEFAULT_CLASS_BAND = 0.06;

/**
 * 不向きな馬場のレースに出る割合（K-4 の是正）。
 *
 * 0 にすると「向いた馬場しか走らない」完全分離になり、頭数が埋まらない番組が出る。
 * 1 にすると馬場を無視した混合番組になり、万能型が一方的に有利になる（V-2d が割れる）。
 */
export const OFF_SURFACE_ENTRY_RATE = 0.15;

/**
 * 距離が向かないレースに出る割合と、「向いている」と見なす距離適性の下限（O-2）。
 *
 * ★V-6（最低人気の勝率 0.5〜2%）が成立しないのは、**出走表の下側の裾が長すぎる**ため。
 *   現実の競馬は1番人気32%・大穴1〜2%で比 20〜30倍だが、実装は 34% 対 0.27% で **比126倍**。
 *   距離が全く合わない馬が混ざると、その馬は勝ち目がゼロに近くなり裾を伸ばす。
 *   正典 §10.4「自馬の出走レースは自分で時刻を選んでエントリー」＝オーナーは
 *   **自馬に向いたレースを選ぶ**ので、距離でも絞るのが実態に近い。
 */
export const DISTANCE_SUIT_MIN = 55;
export const OFF_DISTANCE_ENTRY_RATE = 0.12;

/**
 * 1レース内の能力レンジの下限（O-2。レビュー側の助言「1レース内の能力レンジに上限を設ける」）。
 *
 * ★V-4 と V-6 は**スケールを変えるだけでは両立しない**。K や開放率の幅を動かすと
 *   1番人気の勝率と最低人気の勝率は必ず逆方向に動き、比（実測で約126倍）が変わらないため。
 *   現実の競馬の比は 20〜30倍で、違いは**分布の形**にある — 実際の番組では
 *   「勝ち目のない馬」は出走してこない（オーナーが出さない・条件で弾かれる）。
 *   そこでレース内で最強馬のこの割合を下回る馬は出走させない＝**下側の裾を切る**。
 */
export const FIELD_STRENGTH_FLOOR = 0.5;

/**
 * 候補を何倍引いてから絞るか（Q-4）。
 *
 * ★これが実質1倍だったために、床フィルタが**頭数を削って**いた。
 *   多めに引いておけば、能力レンジを締めても正典 §10.4 の頭数を維持できる。
 */
export const OVERSAMPLE_RATIO = 3;

/**
 * 床を割る馬を差し替える最大回数（Q-4）。
 * 上限を置くのは、候補が尽きたときに無限ループしないため。
 */
export const FLOOR_REDRAW_PASSES = 12;

/**
 * 頭数に応じた床（P-4）。
 *
 * ★裾（最低人気の勝率）は**多頭数レースほど死ぬ**。18頭立てでは最下位人気が
 *   10万レース中一度も勝たなかった。同じ床を全頭数に当てると、
 *   少頭数では締めすぎ（V-4 が落ちる）／多頭数では緩すぎ（裾が死ぬ）になる。
 *   頭数が増えるほど床を上げて、1頭あたりの勝ち目を確保する。
 */
export function floorForFieldSize(fieldSize: number, base = FIELD_STRENGTH_FLOOR): number {
  const t = (fieldSize - FIELD_SIZE.MIN) / (FIELD_SIZE.MAX - FIELD_SIZE.MIN);
  return base + Math.max(0, Math.min(1, t)) * FLOOR_FIELD_SIZE_SLOPE;
}

/** 8頭→18頭で床がどれだけ上がるか（P-4 の較正対象） */
export const FLOOR_FIELD_SIZE_SLOPE = 0.2;

/**
 * 強さ降順に並んだ配列から、`size` 個の連続した窓のうち**最大/最小の比が最も1に近い**開始位置を返す。
 *
 * ★「レース内の能力レンジを締める」を、頭数を削らずに実現する方法（Q-4）。
 *   床を下回る馬を落とす方式は頭数が減るため、正典 §10.4 の分布が壊れる。
 */
export function tightestWindow(sortedDesc: readonly number[], size: number): number {
  if (size >= sortedDesc.length) return 0;
  let bestStart = 0;
  let bestRatio = Number.POSITIVE_INFINITY;
  for (let i = 0; i + size <= sortedDesc.length; i++) {
    const hi = sortedDesc[i] ?? 0;
    const lo = sortedDesc[i + size - 1] ?? 0;
    const ratio = lo > 0 ? hi / lo : Number.POSITIVE_INFINITY;
    if (ratio < bestRatio) {
      bestRatio = ratio;
      bestStart = i;
    }
  }
  return bestStart;
}

/**
 * 床（`FIELD_STRENGTH_FLOOR`）を満たす窓の中から**抽選**で1つ選ぶ（Q-4 / P-4）。
 *
 * ★常に「最も狭い窓」を採ると締めすぎる（実測 V-4 22.7% で下限を大きく割った）。
 *   床は「これ以上は開かない」という上限であって、最小化する目的関数ではない。
 *   満たす窓が無ければ最も狭い窓に落とす（＝できる範囲で締める）。
 */
export function pickWindow(
  sortedDesc: readonly number[],
  size: number,
  floor: number,
  rng: Rng,
): number {
  if (size >= sortedDesc.length) return 0;
  const valid: number[] = [];
  for (let i = 0; i + size <= sortedDesc.length; i++) {
    const hi = sortedDesc[i] ?? 0;
    const lo = sortedDesc[i + size - 1] ?? 0;
    if (hi > 0 && lo >= hi * floor) valid.push(i);
  }
  if (valid.length === 0) return tightestWindow(sortedDesc, size);
  return valid[rng.int(0, valid.length - 1)] ?? 0;
}

/**
 * 出走可否の判定に使う強さの近似（レース判定そのものではない）。
 *
 * ★`resolveRace` を呼んで正確なスコアを出すこともできるが、
 *   出走表を作る段階で本番の判定を回すのは循環的で重い。
 *   支配的な3要素（現在値・距離適性・馬場適性）だけの近似で足りる。
 */
export function entryStrength(entrant: RaceEntrant, distance: number, surface: Surface): number {
  const total = ABILITY_KEYS.reduce((acc, k) => acc + entrant.stats[k], 0) / ABILITY_KEYS.length;
  const d = distance - entrant.distanceCenter;
  const distanceFit = Math.exp(-(d * d) / (2 * entrant.distanceRange * entrant.distanceRange));
  const surfaceFit = 0.7 + (entrant.surfaceAptitude[surface] / 100) * 0.35;
  return total * (0.75 + distanceFit * 0.3) * surfaceFit;
}

export function generateRace(
  pool: readonly HorseRecord[],
  raceIndex: number,
  rng: Rng,
  /** クラス幅。1.0 なら母集団全体から無作為（＝クラス分けなし） */
  classBand: number = DEFAULT_CLASS_BAND,
  unlockRange: { MIN: number; MAX: number } = PLACEHOLDER_UNLOCK,
): GeneratedRace {
  if (pool.length < FIELD_SIZE.MIN) {
    throw new Error(`generateRace: 母集団が少なすぎる (${pool.length}頭)`);
  }
  const fieldSize = rng.int(FIELD_SIZE.MIN, Math.min(FIELD_SIZE.MAX, pool.length));
  const distance = rng.pick(DISTANCES);
  const surface = rng.pick(SURFACES);
  // 良馬場が大半（稍重・重は少数）
  const conditionRoll = rng.float();
  const trackCondition: TrackCondition =
    conditionRoll < 0.75 ? 'good' : conditionRoll < 0.93 ? 'yielding' : 'soft';

  // クラス帯（能力順の連続した窓）から重複なしで fieldSize 頭を引く。
  // ★`pool` は能力昇順に並んでいる前提（`sortPoolByClass`）。並んでいなければクラス分けは効かない
  // ★候補は必ず fieldSize × OVERSAMPLE_RATIO 頭ぶん確保する（Q-4 / P-4）。
  //   クラス幅だけで決めると、18頭立てのとき候補が頭数と同数近くになり
  //   「能力レンジの最も狭い窓を選ぶ」自由度が消える＝**大頭数ほど裾が締まらない**。
  //   クラス幅は**下限**として扱う。
  const bandSize = Math.min(
    pool.length,
    Math.max(fieldSize * OVERSAMPLE_RATIO, Math.round(pool.length * classBand)),
  );
  const bandStart = rng.int(0, Math.max(0, pool.length - bandSize));
  // ★★ Q-4: **必ず fieldSize 頭を出走させる**（正典 §10.4「1レース 8〜18頭」）
  //
  //   以前は「多めに作ってから絞る」と書きながら、ここで fieldSize 頭ちょうどしか引いていなかった。
  //   その結果 oversample = fieldSize となり、能力レンジの床フィルタが**頭数を直接削って**いた。
  //   実測で 8頭 21.4% / 18頭 3.4%・平均 10.97頭（仕様どおりなら各9.1%・平均13.00）。
  //   **頭数が減れば1頭あたりの勝率は機械的に上がる**ので、V-4/V-6 の較正が
  //   この意図せぬ副作用の上に乗っていた。**候補を多めに引き、絞ったあとも頭数は維持する。**
  const candidateCount = Math.min(bandSize, fieldSize * OVERSAMPLE_RATIO);
  const picked: HorseRecord[] = [];
  const used = new Set<number>();
  let attempts = 0;
  while (picked.length < candidateCount) {
    const idx = bandStart + rng.int(0, bandSize - 1);
    attempts += 1;
    if (used.has(idx)) continue;
    const horse = pool[idx];
    if (horse === undefined) continue;
    // ★出走馬は「その馬に向いた馬場のレース」に出る（正典 §10.4:
    //   自馬の出走レースはオーナーが選んでエントリーする）。
    //   これが無いと**芝もダートも走れる万能型が一方的に得**をして、
    //   選抜圧が芝適性とダート適性を**揃って押し上げる**（K-4 の実測で
    //   surface.turf +5.3% / surface.dirt +6.0% と両方が上昇し V-2d を割った）。
    //   自分に向いた馬場だけ走るなら、専門型は自分の土俵で満点を取れるので万能プレミアムが消える。
    //   ★ただし全馬を厳密に絞ると出走頭数が埋まらないので、不向きな馬も一定割合で出す。
    const suited = horse.surfaceAptitude[surface] >= horse.surfaceAptitude[surface === 'turf' ? 'dirt' : 'turf'];
    if (!suited && attempts < bandSize * 4 && !rng.bool(OFF_SURFACE_ENTRY_RATE)) continue;
    // ★距離でも同じ理屈で絞る（O-2）。距離適性は §5.2 の正規分布カーブ（0〜100）
    const distanceFit =
      100 *
      Math.exp(
        -((distance - horse.distanceCenter) ** 2) / (2 * horse.distanceRange * horse.distanceRange),
      );
    if (distanceFit < DISTANCE_SUIT_MIN && attempts < bandSize * 6 && !rng.bool(OFF_DISTANCE_ENTRY_RATE))
      continue;
    used.add(idx);
    picked.push(horse);
  }

  const candidates = picked.map((horse) =>
    toEntrant(
      horse,
      rng,
      {
        // 調子・年齢・斤量にレースごとのばらつきを持たせる（P3 の育成が入るまでの仮定）
        condition: rng.int(2, 4),
        age: rng.int(3, 5),
        weightKg: 55 + rng.range(-2, 2),
      },
      unlockRange,
    ),
  );

  // ★**頭数は必ず fieldSize に保ったまま、床を割る馬だけを引き直す**（Q-4）。
  //
  //   以前の「床を下回る馬を落とす」方式は**頭数を直接削って**いた（実測 平均10.97頭）。
  //   代わりに「能力差の最も小さい連続窓」を採る方式も試したが、**締めすぎて V-4 が 24.5%**
  //   まで落ちた — 床は「これ以上は開かない」上限であって、最小化する目的関数ではない。
  //   最も素直なのは「弱すぎる馬を別の候補と差し替える」で、これは
  //   「勝ち目のない馬は出走してこない」という現実の番組の姿そのもの。
  const withStrength = candidates.map((e) => ({ e, s: entryStrength(e, distance, surface) }));
  const chosen = withStrength.slice(0, Math.min(fieldSize, withStrength.length));
  // ★差し替え先は**強い順**に使う。ランダムな候補から取ると弱い馬を弱い馬に替えるだけで、
  //   床がほとんど効かない（実測で床 0.78 と 0.86 の差が 0.3pp しか出なかった）
  const spare = withStrength.slice(chosen.length).sort((a, b) => a.s - b.s);
  for (let pass = 0; pass < FLOOR_REDRAW_PASSES && spare.length > 0; pass++) {
    let best = 0;
    for (const x of chosen) if (x.s > best) best = x.s;
    let weakestIndex = -1;
    let weakest = Number.POSITIVE_INFINITY;
    for (let i = 0; i < chosen.length; i++) {
      const s = chosen[i]?.s ?? 0;
      if (s < weakest) {
        weakest = s;
        weakestIndex = i;
      }
    }
    if (weakestIndex < 0 || weakest >= best * floorForFieldSize(fieldSize)) break;
    const replacement = spare.pop();
    if (replacement === undefined) break;
    chosen[weakestIndex] = replacement;
  }
  // 枠順は強さ順ではなく抽選（強い馬が常に内枠になると gateCoef と交絡する）
  const entrants = rng.shuffled(chosen.map((x) => x.e)).map((e, i) => ({ ...e, gate: i + 1 }));

  const classLevel =
    pool.length <= bandSize ? 0.5 : bandStart / (pool.length - bandSize);

  return {
    classLevel,
    conditions: {
      raceId: `MC-${String(raceIndex).padStart(7, '0')}`,
      distance,
      surface,
      trackCondition,
      courseShape: distance <= 1400 && rng.bool(0.2) ? 'straight' : 'oval',
      baseWeightKg: 55,
    },
    entrants,
  };
}
