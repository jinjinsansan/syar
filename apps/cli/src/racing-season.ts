/**
 * K-4: 実レース結果にもとづく種牡馬選抜
 *
 * P0 の選抜は「真の potential ＋ 観測ノイズ（h²=0.3）」という近似だった。
 * P1 では実際にレースを走らせ、その成績で選ぶ。
 *
 * 【選抜指標の提案（指示書 K-4「レビュー側が指定しません」）】
 *   既定は **累計獲得賞金（prize）**。理由:
 *   1. **正典が既にそれを使っている** — §10.5 は NPC 種牡馬の種付料を
 *      `3,000 + G1勝利数 × 8,000 + 総獲得賞金/20` と定めており、繁殖価値の代理指標は賞金。
 *      選抜指標を別物にすると、市場価格と選抜圧が食い違う。
 *   2. **勝率より分散が小さい** — 1着以外にも配点があるため、少ない出走数でも実力を反映する。
 *      勝率は 8〜18頭立てでは 0/4 に潰れる馬が大量に出て、順位付けがほぼ運になる。
 *   3. **実装が素直** — 着順から一意に決まり、追加の恣意的な重みが要らない。
 *   `winRate` / `composite` も実装し、報告書で実測比較する（どれを選ぶかを数字で示すため）。
 *
 * ⚠️ 賞金表は正典 §11 が未執筆のためプレースホルダ。P2/P3 で正典が定まったら差し替える（R-7）。
 */

import {
  CALIBRATED_RACE_RANDOM_K,
  DEFAULT_RACE_BALANCE,
  resolveRace,
  type RaceBalance,
} from '@star/race-engine';
import type { HorseId, HorseRecord, Rng } from '@star/sim-engine';
import { generateRace, sortPoolByClass } from './race-field.js';

/**
 * 着順ごとの賞金（プレースホルダ・正典 §11 未執筆）。
 * 1着を100とした相対値。実在の賞金体系に寄せた「上位に厚く、5着まで出る」形。
 */
export const PRIZE_BY_POSITION: readonly number[] = [100, 40, 25, 15, 10];

/**
 * クラス係数の傾き（最下級 → 最上級で賞金が何倍になるか）。
 *
 * 実在の競馬でも下級条件と最高格では賞金が2桁違う。ここは較正対象のプレースホルダで、
 * 正典 §11（賞金テーブル）が確定したら差し替える（R-7）。
 */
export const CLASS_PRIZE_TOP_MULT = 40;

/** クラス水準(0〜1) → 賞金倍率。指数的に上級を厚くする */
export function classPrizeMultiplier(classLevel: number): number {
  const t = classLevel < 0 ? 0 : classLevel > 1 ? 1 : classLevel;
  return CLASS_PRIZE_TOP_MULT ** t;
}

export interface CareerRecord {
  starts: number;
  wins: number;
  top3: number;
  prize: number;
}

export function emptyCareer(): CareerRecord {
  return { starts: 0, wins: 0, top3: 0, prize: 0 };
}

/** 1シーズン（= 1ゲーム内年）ぶんのレースを走らせ、成績を累積する */
export function runSeason(
  pool: readonly HorseRecord[],
  careers: Map<HorseId, CareerRecord>,
  rng: Rng,
  racesPerHorse: number,
  balance: RaceBalance = { ...DEFAULT_RACE_BALANCE, RACE_RANDOM_K: CALIBRATED_RACE_RANDOM_K },
): void {
  if (pool.length < 8) return; // 出走頭数（§10.4 の下限）に満たない年は開催しない

  const sorted = sortPoolByClass(pool);
  // 各馬が概ね racesPerHorse 回走るだけのレース数（平均13頭立てとして）
  const raceCount = Math.max(1, Math.round((pool.length * racesPerHorse) / 13));

  for (let i = 0; i < raceCount; i++) {
    const race = generateRace(sorted, i, rng);
    const result = resolveRace({
      conditions: race.conditions,
      entrants: race.entrants,
      seed: rng.nextUint32() >>> 0,
      balance,
    });
    // ★クラス係数。上級条件ほど賞金が大きい。
    //   これが無いと賞金は「そのクラスの中で強いか」しか測らず、下級で稼ぐ弱い馬と
    //   上級で稼ぐ強い馬が同評価になる。実測では V-1 が 19.7%（合格域 12〜18%）まで上がった。
    const classMult = classPrizeMultiplier(race.classLevel);
    for (const row of result.order) {
      const c = careers.get(row.horseId) ?? emptyCareer();
      c.starts += 1;
      if (row.finishPosition === 1) c.wins += 1;
      if (row.finishPosition <= 3) c.top3 += 1;
      c.prize += (PRIZE_BY_POSITION[row.finishPosition - 1] ?? 0) * classMult;
      careers.set(row.horseId, c);
    }
  }
}

/**
 * 選抜スコア。大きいほど良い。
 *
 * ★出走のない馬（starts=0）は 0 を返す。**選抜から自動的に落ちる**ので、
 *   「走っていないのに種牡馬になる」経路を作らない。
 */
export function selectionScore(
  career: CareerRecord | undefined,
  metric: 'prize' | 'prizePerStart' | 'winRate' | 'composite',
): number {
  if (career === undefined || career.starts === 0) return 0;
  switch (metric) {
    case 'prize':
      return career.prize;
    // ★出走数で正規化した指標（O-5）。
    //   `prize`（累計）は「長く走ったこと」も測ってしまう — 監査の実測で
    //   r(累計賞金, 在籍年数) = 0.353 / r(累計賞金, 能力合計) = 0.440 に対し
    //   r(1走あたり賞金, 能力合計) = 0.503 と、正規化した方が能力をよく測る。
    //   **選抜指標は「強さ」を測るべきで「長く走ったこと」を測るべきではない。**
    case 'prizePerStart':
      return career.prize / career.starts;
    case 'winRate':
      return career.wins / career.starts;
    case 'composite':
      // 賞金（実力の総量）と複勝率（安定性）の積。どちらか一方だけ突出した馬を過大評価しない
      return career.prize * (career.top3 / career.starts);
    default:
      return 0;
  }
}
