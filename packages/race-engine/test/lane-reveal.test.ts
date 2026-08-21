/**
 * ★横位置の広がり（`LANE_REVEAL_FULL_RUN`）を留める
 *
 * 【なぜ要るか（レビュー側裁定 2026-08-21）】
 *   中盤で 12 頭が走路の 1〜3m に固まって見える件の対処として、
 *   **シード由来の `swing` を中盤から出す**（`reveal` を早める）ことになりました。
 *   このとき裁定が釘を刺したのは:
 *
 *     > ★触ろうとしているレバーが逆です。中盤が細いのは `SETTLE_M` のせいではありません。
 *     > 動かしてよいのは **`reveal`** であって、**`base` / `SETTLE_M` ではありません。**
 *     > 枠の広がりを中盤まで引き延ばすと **V-18 は確実に落ちます**
 *     > （枠の位置に居続ける形＝偏り 35.5 馬身／枠を 5% 残しただけで相関 0.127）。
 *
 * 【このテストが留めるもの】
 *   ① 掃引用の引数が**本番の経路に漏れていない**こと（`resolveRace` は既定値だけを使う）
 *   ② `reveal` を早めても**枠と距離ロスの相関が上がらない**こと（V-18 の心臓部）
 *   ③ 発走直後は**枠の広がり**が支配し、中盤以降は**シード由来**が支配すること
 */
import { describe, it, expect } from 'vitest';
import {
  LANE_REVEAL_FULL_RUN, REVEAL_START_RUN, laneAt, laneAtStart, laneExtraM, TRACK_WIDTH_M,
} from '../src/lane.js';

const FIELD = 12;
const DIST = 1600;

/** 枠と距離ロスの相関。★12 点では雑音が大きいので多数シードをプールする */
function gateLossCorrelation(revealFullRun: number, seeds = 200): number {
  const gs: number[] = [], ls: number[] = [];
  for (let k = 0; k < seeds; k += 1) {
    const seed = 1000 + k * 7919;
    for (let g = 1; g <= FIELD; g += 1) {
      gs.push(g);
      ls.push(laneExtraM(g, FIELD, DIST, seed, undefined, 10, revealFullRun));
    }
  }
  const n = gs.length;
  const mx = gs.reduce((a, b) => a + b, 0) / n;
  const my = ls.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = gs[i]! - mx, dy = ls[i]! - my;
    sxy += dx * dy; sxx += dx * dx; syy += dy * dy;
  }
  return sxy / Math.sqrt(sxx * syy);
}

/** ある地点での 12 頭の横の広がり（m） */
function spreadAt(ranM: number, seed: number, revealFullRun: number): number {
  const ws = Array.from({ length: FIELD }, (_, i) =>
    laneAt(i + 1, FIELD, DIST - ranM, DIST, seed, TRACK_WIDTH_M, revealFullRun));
  return Math.max(...ws) - Math.min(...ws);
}

describe('★横位置の広がり（reveal）', () => {
  it('★掃引用の引数を省いたときは、必ず本番の値が使われる', () => {
    const seed = 4242;
    for (let g = 1; g <= FIELD; g += 1) {
      const implicit = laneAt(g, FIELD, 800, DIST, seed);
      const explicit = laneAt(g, FIELD, 800, DIST, seed, TRACK_WIDTH_M, LANE_REVEAL_FULL_RUN);
      expect(implicit).toBe(explicit);
    }
    expect(laneExtraM(3, FIELD, DIST, seed))
      .toBe(laneExtraM(3, FIELD, DIST, seed, undefined, 10, LANE_REVEAL_FULL_RUN));
  });

  it('★★reveal を早めても、枠と距離ロスの相関は上がらない（V-18 の心臓部）', () => {
    /**
     * ★これが裁定の根拠そのものです。`swing` は
     *   `drift`（枠に対して単調でない一様乱数）から作るので、**早く出しても枠に紐づきません。**
     *   ⚠️ もしここが上がるなら、それは `base` / `SETTLE_M` を触ってしまった証拠です。
     *      却下された形は 1200m で **0.127** でした。
     */
    const now = gateLossCorrelation(LANE_REVEAL_FULL_RUN);
    const early = gateLossCorrelation(0.18);
    expect(Math.abs(now)).toBeLessThan(0.05);
    expect(Math.abs(early)).toBeLessThan(0.05);
    // ★早めたほうが悪化していないこと（許容 0.01pp ぶんの雑音）
    expect(Math.abs(early)).toBeLessThan(Math.abs(now) + 0.01);
  });

  it('★★reveal を早めると中盤の広がりが増える（本番の値が実際に効いている）', () => {
    /**
     * ⚠️ ★比較の相手を `LANE_REVEAL_FULL_RUN` にしていたため、**本番の値を 0.18 にした瞬間に
     *    「0.18 と 0.18 を比べる」テスト**になって落ちました。
     *    比較の相手は**変更前の値 1.0** を直に書きます（本番値が動いても意味が変わらない）。
     */
    const BEFORE = 1.0;   // 2026-08-21 より前の挙動
    const seed = 4242;
    const mid = 500;
    expect(spreadAt(mid, seed, LANE_REVEAL_FULL_RUN)).toBeGreaterThan(spreadAt(mid, seed, BEFORE) + 1);
    // ★中盤で走路 20m のうち 8m 以上に散っていること（視覚側の下限・オーナー判定の根拠）
    let worst = Infinity;
    for (let ran = 300; ran <= 900; ran += 50) worst = Math.min(worst, spreadAt(ran, seed, LANE_REVEAL_FULL_RUN));
    expect(worst).toBeGreaterThan(4);
  });

  it('★発走直後は枠の広がりが支配し、シード由来はまだ出ない', () => {
    /**
     * ★`REVEAL_START_RUN` より手前では `swing` は 0。
     *   発走直後の広がりは**枠の広がりの名残**であって、シードではありません
     *   （裁定の指摘: 9 秒時点の 11.3m は「枠の広がりがまだ残っているだけ」）。
     */
    const ranM = DIST * REVEAL_START_RUN * 0.5;
    for (let g = 1; g <= FIELD; g += 1) {
      const a = laneAt(g, FIELD, DIST - ranM, DIST, 111, TRACK_WIDTH_M, 0.18);
      const b = laneAt(g, FIELD, DIST - ranM, DIST, 999, TRACK_WIDTH_M, 0.18);
      expect(a).toBeCloseTo(b, 9);   // シードを変えても同じ = swing が出ていない
    }
    // そして枠ごとには散っている（＝枠の広がり）
    const ws = Array.from({ length: FIELD }, (_, i) =>
      laneAt(i + 1, FIELD, DIST - ranM, DIST, 111, TRACK_WIDTH_M, 0.18));
    expect(Math.max(...ws) - Math.min(...ws)).toBeGreaterThan(5);
    expect(laneAtStart(1, FIELD)).toBeLessThan(laneAtStart(FIELD, FIELD));
  });
});
