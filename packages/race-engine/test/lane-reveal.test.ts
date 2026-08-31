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
  LANE_REVEAL_FULL_RUN, laneAt, laneAtStart, laneExtraM, TRACK_WIDTH_M,
  LANE_MODEL_LEGACY, RAIL_W, STALL_W_M, HORSE_LENGTH_M,
} from '../src/lane.js';

const FIELD = 12;
const DIST = 1600;

/**
 * ★**V-18 ②b — 枠順由来の内外差（馬身）**（正典 **D-090**・2026-08-31）
 *
 * ★定義（裁定の文言そのまま）: ★**多数シードで均した枠間の平均差**。
 *   ★= 枠ごとに距離ロスを多数シードで平均し、★その**枠間の最大 − 最小**を馬身にする。
 *
 * ⚠️ ★**1 レースごとに出して平均しないこと**（台帳 B-5）。★n=12 の偶然がそのまま残ります。
 * ⚠️ ★**seed の本数が足りないと、雑音がそのまま「幅」として出ます。** ★実測（DEFAULT_OVAL 1600m）:
 *      ★200 本 **0.348** ／ 500 本 **0.365** ／ ★**1000 本 0.216** ／ 2000 本 **0.216**
 *    → ★**1000 本で落ち着きます。** ★ここを削ると、測っているのは自分の標本です。
 * ⚠️ ★seed の作り方は `verify-v18.mjs` / `tools/_gatebias.mjs` と**同じ**にしてあります（R-30）。
 */
const BIAS_SEEDS = 1000;
function gateBiasLengths(distance = DIST, revealFullRun?: number, laneModel?: typeof LANE_MODEL_LEGACY): number {
  const sum = new Array<number>(FIELD).fill(0);
  for (let r = 0; r < BIAS_SEEDS; r += 1) {
    const seed = r * 2654435761 + distance;
    for (let g = 1; g <= FIELD; g += 1) {
      /** ⚠️ ★`noUncheckedIndexedAccess` が効いているので `??` で受けます（★`+=` は型が通りません） */
      sum[g - 1] = (sum[g - 1] ?? 0) + laneExtraM(g, FIELD, distance, seed, undefined, 10, revealFullRun, laneModel);
    }
  }
  const mean = sum.map((s) => s / BIAS_SEEDS);
  return (Math.max(...mean) - Math.min(...mean)) / HORSE_LENGTH_M;
}

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

  /**
   * ★**ここからは「絵の条件」です**（★2026-08-31 に新設）。
   *
   * ⚠️ ★**この検査が無かったのが、在り得ない絵が出荷された理由です**（レビュー側 R-22）。
   *    ★2026-08-21 の便は `LANE_REVEAL_FULL_RUN` を 1.0 → 0.18 にし、
   *    ★「最外 − 最内」を 2.13m → 8.19m に上げましたが、
   *    ★**内ラチに重なる頭数は 6.2 頭のまま**でした。
   *    ★つまり ★**指標だけを動かしていました**（R-16 の家族）。
   *    → ★オーナー評（2026-08-31）「★**正しくないです　こんな競馬は在りません**」。
   *
   * ★**「最外 − 最内」だけでは二度と判定しません。**
   *    ★あれは「隊列の広がり」ではなく「いちばん外を回った 1 頭までの距離」です。
   */
  it('★★内ラチに同じ位置で重なる馬が居ない（★旧形は 12 頭中 6.2 頭）', () => {
    let worst = 0;
    for (let k = 0; k < 50; k += 1) {
      const seed = 1000 + k * 7919;
      for (const ran of [288, 500, 700, 900, 1200]) {
        const ws = Array.from({ length: FIELD }, (_, i) =>
          laneAt(i + 1, FIELD, DIST - ran, DIST, seed)).sort((a, b) => a - b);
        let dup = 0;
        for (let i = 1; i < ws.length; i += 1) if (Math.abs(ws[i]! - ws[i - 1]!) < 1e-9) dup += 1;
        worst = Math.max(worst, dup);
      }
    }
    expect(worst, '★同じ横位置に重なっている馬が居ます').toBe(0);
  });

  it('★★旧形に戻すとこの検査は落ちる（★検査が実際に効いていること）', () => {
    let worst = 0;
    for (let k = 0; k < 20; k += 1) {
      const seed = 1000 + k * 7919;
      const ws = Array.from({ length: FIELD }, (_, i) =>
        laneAt(i + 1, FIELD, DIST - 500, DIST, seed, TRACK_WIDTH_M, undefined, undefined, LANE_MODEL_LEGACY))
        .sort((a, b) => a - b);
      let dup = 0;
      for (let i = 1; i < ws.length; i += 1) if (Math.abs(ws[i]! - ws[i - 1]!) < 1e-9) dup += 1;
      worst = Math.max(worst, dup);
    }
    expect(worst, '★旧形で重なりが出ないなら、上の検査は何も守っていません').toBeGreaterThan(3);
  });

  it('★★いちばん外を回る馬が「大外」の範囲に収まる', () => {
    /**
     * ⚠️ ★旧形は実測で ★**9〜13 頭分外**（★走路 20m の外ラチのすぐ内側）でした。
     *    ★実際の競馬の「大外」は 4〜6 頭分程度です。
     */
    let worst = 0;
    for (let k = 0; k < 50; k += 1) {
      const seed = 1000 + k * 7919;
      for (const ran of [288, 500, 700, 900, 1200]) {
        const ws = Array.from({ length: FIELD }, (_, i) => laneAt(i + 1, FIELD, DIST - ran, DIST, seed));
        worst = Math.max(worst, (Math.max(...ws) - RAIL_W) / STALL_W_M);
      }
    }
    expect(worst, '★外を回りすぎています').toBeLessThan(8);
  });

  it('★発走直後は枠の広がりが支配し、シード由来はまだ出ない', () => {
    /**
     * ★`REVEAL_START_RUN` より手前では `swing` は 0。
     *   発走直後の広がりは**枠の広がりの名残**であって、シードではありません
     *   （裁定の指摘: 9 秒時点の 11.3m は「枠の広がりがまだ残っているだけ」）。
     */
    const ranM = 0;   // ★発走の瞬間
    for (let g = 1; g <= FIELD; g += 1) {
      const a = laneAt(g, FIELD, DIST - ranM, DIST, 111);
      const b = laneAt(g, FIELD, DIST - ranM, DIST, 999);
      expect(a).toBeCloseTo(b, 9);   // シードを変えても同じ = 枠の広がりだけ
    }
    // そして枠ごとには散っている（＝枠の広がり）
    const ws = Array.from({ length: FIELD }, (_, i) =>
      laneAt(i + 1, FIELD, DIST - ranM, DIST, 111));
    expect(Math.max(...ws) - Math.min(...ws)).toBeGreaterThan(5);
    expect(laneAtStart(1, FIELD)).toBeLessThan(laneAtStart(FIELD, FIELD));
  });
});

/**
 * ★**V-18 ②b**（正典 D-090・2026-08-31・指示書 §1-2）
 *
 * 【★なぜ ②b が要るか】★②a（4〜12 馬身）が測る 12 馬身のうち、★枠順由来は **0.2〜0.4 馬身**です。
 *   ★つまり ②a は「枠順の不公平」ではなく ★**「その日の trip」**を測っています（D-071 / D-073 の姿）。
 *   → ★**「枠で決まるゲームにしない」という目的そのもの**を測るのが ②b です。
 *
 * ⚠️ ★**指示書 §1-2 の「旧形（`LANE_MODEL_LEGACY`）に戻すとこの検査が落ちる」は成立しません。**
 *    ★実測（2000 本・DEFAULT_OVAL 1600m）: ★本番 **0.216** ／ ★**旧形 0.322** — ★どちらも 1 馬身の内側。
 *    ★理由は構造です — ★**どちらの作り方も通り道をシードから引き、枠に依存させていません**（D-069 / D-073）。
 *    ★旧形の欠陥は**内ラチへの重なり**であって**枠順の偏り**ではないので、★②b は 2 つを区別できません。
 *    → ★**対照は `SETTLE_M` の変異**です（下）。★報告書に出しています。
 */
describe('★V-18 ②b — 枠順由来の内外差', () => {
  it('★★枠間の平均差が 1 馬身以内（正典 D-090）', () => {
    const b = gateBiasLengths();
    expect(b, '★枠順で決まるゲームになっています').toBeLessThanOrEqual(1);
    // ★0 になるなら、測っていないか laneExtraM が死んでいる（R-21）
    expect(b).toBeGreaterThan(0);
  });

  /**
   * ★**対照 — この検査が実際に効いていること**（R-14）。
   *
   * ⚠️ ★**距離を短くする対照は使えません。** ★`DEFAULT_OVAL` の 400m は**全部が直線**で、
   *    ★コーナーが 1 本も無いので距離ロスが全馬 0 になります（★実際に書いて 0 になりました）。
   *
   * ★正典が記録している壊れ方はこれです:
   *   > ★枠の位置に居続ける形にしたら、★**枠による偏り 35.5 馬身＝枠順で決まるゲーム**になりました。
   *
   * ★それを作るのは **`SETTLE_M`**（発走後どれだけで枠の位置が消えるか）で、★**定数**です。
   * ★`SETTLE_M` は較正定数の登録簿にあり（`apps/cli/src/calibration.ts`・★変異値 **2000**）、
   * ★`npm run mutation` がこの検査を落とします。★開発側でも手で確かめ、報告書 §5 に数字を載せます。
   *
   * ★ここでは ★**②b が「枠の位置がどれだけ残るか」に反応する量である**ことだけを、
   * ★定数を触らずに固定します — ★発走直後は枠の位置そのものなので、
   * ★**発走時の枠間の広がりは 1 馬身をはるかに超えている**（＝もし消えなければ落ちる）。
   */
  it('★★発走時の枠の広がりは 1 馬身をはるかに超える（★消えなければ ②b は落ちる）', () => {
    const starts = Array.from({ length: FIELD }, (_, i) => laneAtStart(i + 1, FIELD));
    const spreadLengths = (Math.max(...starts) - Math.min(...starts)) / HORSE_LENGTH_M;
    // ★発走時点では枠の位置そのもの。★これが道中まで残れば ②b は一発で 1 馬身を超える
    expect(spreadLengths, '★発走時に枠が散っていないなら、②b の対照が成り立ちません').toBeGreaterThan(4);
  });

  /**
   * ★**演出の値（reveal）で通せないこと**（R-16・裁定の中心）。
   *   ★②b が reveal で動くなら、★**画の都合で合否を動かせて**しまいます。
   */
  it('★★reveal を振っても ②b はほとんど動かない（演出でゲートを通せない）', () => {
    const now = gateBiasLengths(DIST, LANE_REVEAL_FULL_RUN);
    const full = gateBiasLengths(DIST, 1.0);
    expect(Math.abs(full - now)).toBeLessThan(0.1);
    expect(now).toBeLessThanOrEqual(1);
    expect(full).toBeLessThanOrEqual(1);
  });
});
