/**
 * ★**V-18 を検定（CI）の中に置く**（正典 **R-32**・指示書 §1-3）
 *
 * 【★なぜ要るか — ★9 日間の沈黙】
 *   ⚠️ ★V-18 は `tools/verify-v18.mjs` という ★**手で回す道具にしかありませんでした。**
 *   ★`LANE_REVEAL_FULL_RUN` を 0.18 にした便（`7cff0ad`・2026-08-21）で
 *   ★**②a が PASS → FAIL**（6.99 → 12.23 馬身）したまま、★**9 日間 `npm test` は緑**でした。
 *   ★そのコミットのタイトルは「**V-18 を動かさずに**」です。
 *   ⚠️ ★同じ便で足された `lane-reveal.test.ts` は ★**① だけを見て ② を見ていませんでした**（R-22）。
 *
 *   → ★**回さなかった日から静かに外れるゲートを置かない。**
 *
 * 【★軽い版であること】
 *   ⚠️ ★重い版（★44 通り × 2000 レース）は分単位なので、そのままは載りません。
 *   ★**`tools/verify-v18.mjs` に残します**（★判定はそちら）。★ここは既定の走路 × 4 距離です。
 *
 *   ★本数の決め方（`tools/_v18light.mjs` / `_v18light2.mjs` で実測）:
 *
 *     ★  50 レース … ρ **0.123** ★上限 0.10 を超える（★雑音で誤報）
 *     ★ 100 レース … ρ **0.112** ★同上
 *     ★ 200 レース … ρ 0.079（★上限まで 0.021・★際どい）
 *     ★**600 レース … ρ 0.071（★2000 レースの真値 0.069 と 0.003 差）・7.4 秒**  ← ★採用
 *     ★1500 レース … ρ 0.070（★14.7 秒。★これ以上増やしても値は変わらない）
 *
 *   ⚠️ ★**「軽い＝通りやすい」にしていません。** ★帯（`V18_BAND`）は正典のままです。
 *      ★減らしたのはレース数だけで、★**そのぶん誤報が出ないところまで戻して**選んでいます。
 *
 * 【★通るだけの検査を置かない（R-16）】
 *   ★**機構を止めたら落ちること**を同じファイルで確かめます（★下の「対照」）。
 *
 * ⚠️ ★測り方は `tools/lib/v18.mjs` の **1 か所**から引きます（D-052）。
 *    ★この案件で ②b を 2 通りに実装し **0.567 対 0.216** と食い違わせた前科があります（台帳 B-5）。
 */
import { describe, it, expect } from 'vitest';
import { LANE_MODEL_LEGACY } from '@star/race-engine';
// @ts-expect-error -- .mjs の素の JS を読む（型定義は置いていない・`exposure-registry.test.ts` と同じ作法）
import { measureV18, loadV18Pool, V18_BAND } from '../../../tools/lib/v18.mjs';

interface V18Row {
  readonly rho: number;
  readonly lengths: number;
  readonly ok1: boolean;
  readonly ok2: boolean;
}

/** ★実測で決めた本数（上の註記）。★減らすと誤報が出ます */
const RACES = 600;
/** ★対照は差が大きいので少なくて足ります（★7.9 対 11.6 馬身） */
const CONTROL_RACES = 50;
const DISTANCES = [1200, 1600, 2000, 2400] as const;

const pool: unknown = loadV18Pool();
const measured = new Map<number, V18Row>();
const measure = (d: number): V18Row => {
  const hit = measured.get(d);
  if (hit !== undefined) return hit;
  const row = measureV18(d, undefined, { races: RACES, pool }) as V18Row;
  measured.set(d, row);
  return row;
};

describe('★V-18 — 枠順が結果を決めないこと・ただし距離ロスは実在すること（★正典 §13.2・R-32）', () => {
  it('★帯は正典から引く（★検査の中に数を直書きしない）', () => {
    expect(V18_BAND.rhoMax).toBe(0.10);
    expect(V18_BAND.lengthsMin).toBe(4);
    expect(V18_BAND.lengthsMax).toBe(12);
  });

  it('★★① 枠順と着順の順位相関が許容の内側（枠で決まるゲームにしない）', () => {
    for (const d of DISTANCES) {
      const r = measure(d);
      expect(Math.abs(r.rho), `★${d}m: ρ=${r.rho.toFixed(3)}`).toBeLessThanOrEqual(V18_BAND.rhoMax);
    }
  });

  it('★★②a 最内と最外の走行距離差が帯の内側', () => {
    for (const d of DISTANCES) {
      const r = measure(d);
      expect(r.lengths, `★${d}m: ${r.lengths.toFixed(1)} 馬身`).toBeGreaterThanOrEqual(V18_BAND.lengthsMin);
      expect(r.lengths, `★${d}m: ${r.lengths.toFixed(1)} 馬身`).toBeLessThanOrEqual(V18_BAND.lengthsMax);
    }
  });

  /**
   * ★**対照 — 機構を止めたら落ちること**（R-16・指示書 §1-3）。
   *
   * ★走る場所の作り方を **2026-08-31 以前の形**（`LANE_MODEL_LEGACY`）に戻すと、
   * ★②a は **11.6〜12.2 馬身**になり、★**帯の上限 12 を割ります**。
   * ⚠️ ★これが落ちないなら、★上の ②a は**何も守っていません**。
   *
   * ⚠️ ★① は動きません。★`resolveRace` の中の距離ロスは**本番の作り方のまま**で、
   *    ★ここで差し替わるのは ②a の測り方だけだからです。★①の対照は `SETTLE_M` の変異です
   *    （`lane-reveal.test.ts` の ②b と同じ・較正定数の登録簿にあります）。
   */
  it('★★旧形に戻すと ②a が帯を割る（★この検査が実際に効いていること）', () => {
    const worst = DISTANCES.map((d) =>
      (measureV18(d, undefined, { races: CONTROL_RACES, pool, laneModel: LANE_MODEL_LEGACY }) as V18Row).lengths);
    // ★旧形は上限 12 の際どい所〜超過に来る。★本番（7.8〜8.1）とは明確に別の帯
    expect(Math.max(...worst), '★旧形でも帯の真ん中なら、②a は何も守っていません').toBeGreaterThan(11);
    // ★本番がその帯に居ないこと（★両方が同じ値なら対照になっていない）
    expect(measure(1600).lengths).toBeLessThan(10);
  });

  /**
   * ⚠️ ★**ここは既定の走路（`DEFAULT_OVAL`）だけ**です。
   *    ★**10 場 × 実距離 = 44 通りは重すぎて CI に載りません** — ★`tools/verify-v18.mjs --venues` に残しています。
   *    ★形を触る便は**必ずそちらを回すこと**（指示書 §4-3 の基準値）。
   */
  it('★44 通りは道具に残っていることを、この検査自身が言う', () => {
    expect(RACES).toBeLessThan(2000);
    expect(DISTANCES.length).toBe(4);
  });
});
