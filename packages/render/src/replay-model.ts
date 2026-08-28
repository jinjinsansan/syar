/**
 * ★境界を守る位置モデル（正典 D-059）
 *
 * > 局面境界の位置 … エンジン＝真実
 * > 局面と局面の間 … 描画層が補間＝演出
 * > **補間は、境界の位置と最終着順を1頭も動かしてはいけない。**
 *
 * 【この層の約束】
 *   ★**境界時刻には、必ず境界の位置にいます。** 補間は「間」だけです。
 *   ⚠️ 補間の式を変えても、境界と着順は動きません。
 *      **それを機械で確かめるのが `replay-model.test.ts` です。**
 *
 * 【★位置は保存しません】
 *   凍結スナップショット＋シードから再計算します。
 *   ここは**その再計算結果を描画コマンドに変える**だけで、真実は持ちません。
 */

import type { HorseAt, PositionModel } from './scene.js';
import {
  slotOf, evenSlots, packSpreadM, convergeAt, formStartRamp,
  type FormStrategy, type FormPace,
} from './formation.js';

/** エンジンが出す境界時刻（`@star/race-engine` の `BoundaryTimes` と同じ形） */
export interface Boundaries {
  readonly gate: number;
  readonly startSec: number;
  readonly spurtSec: number;
  readonly straightSec: number;
  readonly finishSec: number;
}

export interface ReplayInput {
  readonly distanceMeter: number;
  /** 勝負所・直線に入る「残り距離」（正典 §13: 800 / 400） */
  readonly spurtMetersLeft: number;
  readonly straightMetersLeft: number;
  readonly boundaries: readonly Boundaries[];
  /**
   * ★**脚質**（Q-P4-38）。⚠️ **これが無いと道中を作れません。**
   *   道中の位置は**脚質から生成**します（走破タイムからではありません）。
   */
  readonly strategyOf?: ((gate: number) => FormStrategy) | undefined;
  /** ★ペース。隊列の伸び方に効きます */
  readonly pace?: FormPace | undefined;
  /**
   * ★**隊列の強さ**（1 = 既定／0 = 生成しない＝真の位置そのまま）。
   *   ⚠️ 0 にすると**道中から着順が読めます**（漏洩する）。検査用です。
   */
  readonly formation?: number | undefined;
  /**
   * ★**横位置 `w` を返す関数**（D-071）。★**エンジンが引いたものを渡してください。**
   *   ⚠️ 渡さないと `w` は 0 になります（＝内/外が画面に出ません）。
   */
  readonly laneOf?: ((gate: number, metersLeft: number) => number) | undefined;
  /**
   * ★**隊列のシード**（憲法4「乱数は必ず注入する」）。
   *   ⚠️ `Math.random()` は**呼びません**。同じシード → 同じ映像です。
   *   ★`resolveRace` の乱数には触れないので、**着順も較正も動きません**。
   */
  readonly formationSeed?: number | undefined;
}

/**
 * 区間の中だけ前後させる。
 *
 * ★**単調増加でなければなりません。** 位置が後戻りすると、
 *   画面では**馬が下がって見えます**。実際に踏みました
 *   （185.768 → 185.697 と戻り、テストが落ちました）。
 *
 * 【なぜ後戻りしたか】
 *   `t + a·sin(πt)·sin(2πt+φ)` は、**微分が負になる領域**があります。
 *   端で 0 になる（＝境界を動かさない）ことだけを見て、
 *   **途中で戻らないことを確かめていませんでした。**
 *
 * 【★直し方】
 *   **速度を歪めて、それを積分します。** 速度を必ず正に保てば、位置は必ず増えます。
 *     速度 v(t) = 1 + a·sin(2πt+φ)   （|a| < 1 なら v > 0）
 *     位置 x(t) = ∫v = t + (a/2π)·(cos(φ) − cos(2πt+φ))
 *   ★端で x(0)=0・x(1)=1 になるので、**境界も動きません**。
 */

/**
 * ★★**D-063 の `jostle`（揺らぎ）は撤去しました**（レビュー側裁定 2026-08-15・Q-P4-38）。
 *
 *   > あれは、この生成の**代用品**でした。
 *   > D-062（時間配分）・D-063（jostle）・そして今回 —
 *   > ★**回避策が3つとも、根の修正で不要になっています。**
 *   > 私が当てた手当ては、全部「**道中に本物が無い**」ことへの対処でした。
 *
 *   撤去したもの: `PHASE_JOSTLE` / `harmonicsFor` / `easeWithin` / `fadeOf`
 *                 `DEFAULT_JOSTLE` / `JOSTLE_FADE_M` / `boundaryFidelity`
 *   ★実測でも、どの振幅でも「漏洩を隠す」と「道中が動かない」は両立しませんでした:
 *     jostle 0 → 道中 0.03着・V-16 ③ FAIL ／ 0.25 → 道中 3.35着・③ PASS
 *
 * → いまは `formation.ts` が**道中を脚質から生成**します。隠す必要がありません。
 */

function alongPath(
  pts: readonly (readonly [number, number])[], at: number, fallback: number,
): number {
  const n = pts.length;
  if (at <= pts[0]![0]) return pts[0]![1];
  if (at >= pts[n - 1]![0]) return fallback;

  // 区間の平均傾き
  const d: number[] = [];
  for (let i = 0; i < n - 1; i += 1) {
    const dt = pts[i + 1]![0] - pts[i]![0];
    d.push(dt <= 0 ? 0 : (pts[i + 1]![1] - pts[i]![1]) / dt);
  }
  // 折れ点での傾き（★単調保存: 符号が変わる/端では 0、それ以外は調和平均）
  const m: number[] = [];
  for (let i = 0; i < n; i += 1) {
    if (i === 0) m.push(d[0]!);
    else if (i === n - 1) m.push(d[n - 2]!);
    else {
      const a = d[i - 1]!, b2 = d[i]!;
      m.push(a * b2 <= 0 ? 0 : (2 * a * b2) / (a + b2));
    }
  }
  for (let i = 0; i < n - 1; i += 1) {
    const [t0, m0] = pts[i]!;
    const [t1, m1] = pts[i + 1]!;
    if (at < t0 || at > t1) continue;
    const h = t1 - t0;
    if (h <= 0) return m1;
    const s2 = (at - t0) / h;
    const h00 = 2 * s2 ** 3 - 3 * s2 ** 2 + 1;
    const h10 = s2 ** 3 - 2 * s2 ** 2 + s2;
    const h01 = -2 * s2 ** 3 + 3 * s2 ** 2;
    const h11 = s2 ** 3 - s2 ** 2;
    return h00 * m0 + h10 * h * m[i]! + h01 * m1 + h11 * h * m[i + 1]!;
  }
  return fallback;
}

/**
 * 境界時刻から位置モデルを作る。
 *
 * ★**同じ入力から同じ位置**が出ます（乱数を使いません）。
 *   ゆらぎは馬番から決まる位相で作ります。
 */
export function replayPositionModel(input: ReplayInput): PositionModel {
  const {
    distanceMeter, spurtMetersLeft, straightMetersLeft, boundaries,
  } = input;
  const strategyOf = input.strategyOf ?? ((): FormStrategy => 'senko');
  const pace: FormPace = input.pace ?? 'middle';
  const strength = input.formation ?? 1;
  const seed = input.formationSeed ?? 0;
  if (boundaries.length === 0) throw new Error('境界時刻がありません');

  const spurtM = distanceMeter - spurtMetersLeft;
  const straightM = distanceMeter - straightMetersLeft;
  const raceSec = Math.max(...boundaries.map((b) => b.finishSec));

  /** ★脚質から決まる隊列スロット。**レース中ずっと変わりません**（通過順位が揃う） */
  const slots = evenSlots(boundaries.map((b) => ({ gate: b.gate, slot: slotOf(strategyOf(b.gate), b.gate, seed) })));

  /**
   * ★**真の位置**（結果から作られたもの）。折れ点＝境界＝真実。
   *   ⚠️ これをそのまま画面に出すと、★**道中の順位＝着順**になり漏れます。
   */
  const truthOf = (b: Boundaries, sec: number): number => {
    const pts: readonly [number, number][] = [
      [b.startSec, 0],
      [b.spurtSec, spurtM],
      [b.straightSec, straightM],
      [b.finishSec, distanceMeter],
    ];
    if (sec <= b.startSec) return 0;
    if (sec >= b.finishSec) return distanceMeter;
    return alongPath(pts, sec, distanceMeter);
  };

  /**
   * ★★**画面に出す位置**（Q-P4-38）。
   *
   * ```
   * 位置(t) = 真の位置 + a(t) · ( 脚質から作った隊列の位置 − 真の位置 )
   *   a = 1（序盤）… ★脚質しか語らない＝漏れない
   *   a = 0（残り200m 以降）… ★真実そのもの＝着順は厳密に一致（D-059）
   * ```
   *
   * 【★なぜ「隊列の位置」が漏れないか】
   *   隊列の中心は**全馬の平均**なので、どの馬についても同じ値です（個体の情報がない）。
   *   そこからのずれは**脚質のスロットだけ**で決まり、脚質は**出走表に既にあります**。
   *   → ★**画面が新しく漏らすものがありません。**
   *
   * 【★単調性】
   *   `a` は**全馬で共通**（隊列の中心の残り距離で決まる）なので、
   *   `d/dt = (1−a)·真の速度 + a·中心の速度 + a'·(隊列−真)` の第3項だけが負になり得ます。
   *   `|a'| ≒ 0.02/s`・`|隊列−真| ≤ 30m` で **0.6 m/s** 程度、馬速 17m/s に対して十分小さい。
   *   ⚠️ **それでも検査で押さえます**（以前ここで「馬が後ろに下がる」を出しました）。
   */
  const centreOf = (sec: number): number => {
    let sum = 0;
    for (const b of boundaries) sum += truthOf(b, sec);
    return sum / boundaries.length;
  };

  const metersOf = (b: Boundaries, sec: number): number => {
    const truth = truthOf(b, sec);
    if (strength <= 0 || sec <= b.startSec || sec >= b.finishSec) return truth;
    const centre = centreOf(sec);
    /**
     * ★発走の立ち上がりを掛けます。
     *   ⚠️ ★これが無いと**ゲートが開いた瞬間に隊列へ飛びます**（実測 0.25秒で 18.3m）。
     */
    const a = convergeAt(distanceMeter - centre)
      * formStartRamp(centre)
      * Math.max(0, Math.min(1, strength));
    if (a <= 0) return truth;
    const spread = packSpreadM(distanceMeter - centre, pace, centre);
    const slot = slots.get(b.gate) ?? 0.5;
    // ★スロット 0 = 先頭寄り → 中心より前
    const form = centre + spread * (0.5 - slot);
    return Math.max(0, Math.min(distanceMeter, truth + a * (form - truth)));
  };

  /**
   * ★**横位置（内=0）は、エンジンから受け取ります**（D-071）。
   *   ⚠️ ★**この層では引きません。** 引くと2か所になり、必ず離れます。
   */
  const laneOfHorse = (b: Boundaries, meters: number): number =>
    input.laneOf?.(b.gate, distanceMeter - meters) ?? 0;

  /**
   * ★余力（§12.6 のゲージ）。
   *   正典 §13 は「**減るのは勝負所（残り800m）以降**」と定めています。
   *   その前は 1 のままです。
   */
  const staminaOf = (b: Boundaries, sec: number): number => {
    /**
     * ★**ここは「余力」ではありません。「勝負所をどこまで進んだか」です。**
     *
     * 【★以前の式は逆を向いていました（実測で確認）】
     *   `1 − (sec − spurtSec) / (finishSec − spurtSec)`
     *   分母は**その馬が勝負所からゴールまでにかかる時間**です。
     *   → **上がりが速い馬ほど分母が小さく、同じ時刻で余力が低く見えます。**
     *   ★つまり**勝つ馬ほどバテて見えていました。**
     *
     *   実測（400レース・余力と最終着順の順位相関。+ が正しい向き）:
     *     残り800m −0.142 / 600m −0.101 / 400m −0.349 / ★**200m −0.653**
     *
     *   ⚠️ ゲージは §12.6 の**自馬の唯一の読み取り**で、C-6（仕掛け）の判断材料です。
     *      向きが逆なら、**仕掛けの判断を毎回裏切ります。**
     *
     * 【★なぜ「正しい余力」にしていないか】
     *   本当の余力は `intervention.ts` の `emptyAtMeter`（どこでバテるか）です。
     *   ★**`BoundaryTimes` に載っていないので、ここからは作れません。**
     *   → **発明しません**（Q-P4-21 で照会）。
     *     いまは**位置だけで決まる形**にして、**嘘をつかない状態**にしてあります。
     *     ⚠️ この形は**馬ごとの情報を持ちません**。V-16 の材料にはなりません。
     */
    if (sec <= b.spurtSec) return 1;
    const m = metersOf(b, sec);
    if (m <= spurtM) return 1;
    const span = Math.max(1e-6, distanceMeter - spurtM);
    return Math.max(0, Math.min(1, 1 - (m - spurtM) / span));
  };;

  return {
    raceSec,
    distanceMeter,
    at(sec: number): readonly HorseAt[] {
      return boundaries.map((b) => {
        const meters = metersOf(b, sec);
        return {
          gate: b.gate,
          meters,
          staminaRatio: staminaOf(b, sec),
          /** ★内ラチからの距離 [m]。**位置と同じ生成器から出します**（Q-P4-29） */
          w: laneOfHorse(b, meters),
        };
      });
    },
  };
}

/**
 * ゴール到達後の表示用ランアウト。確定時刻や着順は変えず、描画座標だけを
 * 決勝線の先へ進める。先着馬ほど長く進むため、全馬が一点へ潰れない。
 */
export function withFinishRunOut(
  horses: readonly HorseAt[],
  finishSecOf: (gate: number) => number | undefined,
  raceSec: number,
  distanceMeter: number,
  postDisplaySec = 0,
  speedMps = 14,
  /**
   * ★**その馬がゴール線を通ったときの速さ**（m/s）。省略すると `speedMps` を使います。
   *
   * ⚠️ ★**リプレイでは必ず渡してください**（2026-08-28・オーナー指摘
   *    「リプレイのゴール前で必ず 1 度がくっとする」）。
   *
   * 【★何が起きていたか】
   *   `elapsed = (raceSec − その馬の finishSec) + postDisplaySec` の
   *   ★`postDisplaySec` は**勝馬の通過**を基準にした値です。本編では
   *   `raceSec` が止まっているので問題になりませんが、★**リプレイでは
   *   `raceSec` が進み続けます。** すると 2 着以降が線を越えた瞬間、
   *   ★**既に正の `postDisplaySec` の分だけ前へ飛びます。**
   *   実測（seed 42・2 着）: ★**1 コマで 1.42m（約 185px）**、速さ 14.56 → 57.04 → 14.56 m/s。
   *
   * ★**自分の速さでそのまま走り抜ければ、線の前後で速さが変わりません。**
   */
  speedOf?: (gate: number) => number | undefined,
): readonly HorseAt[] {
  return horses.map((horse) => {
    const finishSec = finishSecOf(horse.gate);
    if (finishSec === undefined || raceSec < finishSec) return horse;
    const elapsed = Math.max(0, raceSec - finishSec) + Math.max(0, postDisplaySec);
    const v = speedOf?.(horse.gate);
    return { ...horse, meters: distanceMeter + elapsed * (v !== undefined && v > 0 ? v : speedMps) };
  });
}

/**
 * ★**各馬がゴール線を通ったときの速さ**（m/s）を位置モデルから測る。
 *
 * ⚠️ ★`Date.now()` も乱数も使いません。モデルを読むだけです（憲法4）。
 * ★`dt` 秒手前との差から求めます。★短すぎると数値誤差、長すぎると減速を拾います。
 */
export function finishSpeedsOf(
  model: PositionModel,
  finishSecOf: (gate: number) => number | undefined,
  gates: readonly number[],
  dt = 0.4,
): ReadonlyMap<number, number> {
  const out = new Map<number, number>();
  for (const gate of gates) {
    const fin = finishSecOf(gate);
    if (fin === undefined) continue;
    const before = model.at(Math.max(0, fin - dt)).find((h) => h.gate === gate)?.meters;
    const at = model.at(fin).find((h) => h.gate === gate)?.meters;
    if (before === undefined || at === undefined) continue;
    const v = (at - before) / dt;
    if (v > 0) out.set(gate, v);
  }
  return out;
}

/**
 * ★**ゲート**: この位置モデルから出る最終順が、確定済みの着順と一致すること（D-059）。
 *
 * 【★1度間違えました】
 *   最初は `model.at(raceSec)` の**位置**で並べていました。
 *   → **レース終了時刻には全馬がゴール線上にいる**ので位置に差が無く、
 *     同着扱いで**馬番順（1,2,3,…）**が返っていました。
 *   ★**着順は「どこにいるか」ではなく「いつ着いたか」で決まります。**
 *
 * → 各馬が**ゴールに到達した時刻**を二分探索で求め、その順に並べます。
 *   ⚠️ 「近い」では通しません。1頭でも違えば呼び出し側が落とします。
 */
export function finalOrderOf(model: PositionModel): number[] {
  const gates = model.at(0).map((h) => h.gate);
  const finishSecOf = (gate: number): number => {
    // ★位置は単調増加なので、二分探索が必ず1点に収束します
    let lo = 0, hi = model.raceSec;
    const at = (sec: number): number => {
      const h = model.at(sec).find((x) => x.gate === gate);
      if (h === undefined) throw new Error(`馬番 ${gate} が位置モデルにありません`);
      return h.meters;
    };
    if (at(hi) < model.distanceMeter - 1e-6) return Number.POSITIVE_INFINITY;
    for (let i = 0; i < 60; i += 1) {
      const mid = (lo + hi) / 2;
      if (at(mid) < model.distanceMeter - 1e-9) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  };
  return gates
    .map((gate) => ({ gate, sec: finishSecOf(gate) }))
    .sort((a, b) => {
      if (a.sec !== b.sec) return a.sec - b.sec;
      return a.gate - b.gate;   // ★同着は馬番順（確定側と同じ規則）
    })
    .map((r) => r.gate);
}
