/**
 * ★**競り合っている場所へカメラを向ける**（`contest-focus.ts`）
 *
 *   ⚠️ ★これは**カメラの向け先**の検査です。馬の位置は動きません。
 */
import { describe, expect, it } from 'vitest';
import {
  contestFocusMeters, contestFocusWithLeadInFrame,
  CONTEST_SIGMA_M, CONTEST_MAX_LAG_M, CONTEST_LAG_SOFT_M, CONTEST_LEAD_MARGIN_M,
} from '../src/index.js';

const lead = (xs: readonly number[]): number => Math.max(...xs);

describe('競り合っている場所へカメラを向ける', () => {
  it('★競り合いが無ければ先頭を見る（退行防止）', () => {
    /**
     * ★5 頭が 40m に等間隔（10m 刻み）で伸びている＝誰も競っていない。
     *   ⚠️ ★5m 刻みは「競っていない」ではありません。46% の画面（9.3m）に
     *      2 頭とも入るので、★少し引いて 2 頭を入れるのが正しい振る舞いです。
     */
    const spread = [1300, 1290, 1280, 1270, 1260];
    expect(contestFocusMeters(spread)).toBeCloseTo(lead(spread), 1);
  });

  it('★先頭付近で 2 頭が競っていれば、その 2 頭を見る', () => {
    /** 4 番と 10 番が 0.9m 差（seed 42・残り241m の実データ相当） */
    const xs = [1359.1, 1358.2, 1344.8, 1342.2, 1340.2];
    const f = contestFocusMeters(xs);
    expect(f).toBeGreaterThan(1357.5);
    expect(f).toBeLessThanOrEqual(1359.1);
  });

  /**
   * ★**これが実際に出たバグです。**
   *   前に 2 頭・14m 後ろに 3 頭という形で、注視点が★**その中間の誰もいない場所**へ行き、
   *   画面（9.3m）にどちらの集団も入らず主役が 1 頭しか映りませんでした。
   */
  it('★離れた 2 つの集団の「あいだの誰もいない場所」を見ない', () => {
    const xs = [1359.1, 1358.2, 1344.8, 1342.2, 1340.2];
    const f = contestFocusMeters(xs);
    /** ★どれかの馬から馬 2 頭ぶん以内に居ること */
    const nearest = Math.min(...xs.map((s) => Math.abs(s - f)));
    expect(nearest).toBeLessThan(4.8);
  });

  it('★後方だけで競っていても、先頭から離れすぎたら追わない', () => {
    /** 先頭は単騎、25m 後ろで 2 頭が競っている */
    const xs = [1400, 1375.5, 1375.0, 1370, 1368];
    expect(contestFocusMeters(xs)).toBeGreaterThan(1400 - CONTEST_MAX_LAG_M);
  });

  /**
   * ★**上の検査はこれだけだと空回りします**（R-16）。
   *
   *   ⚠️ ★上は戻り値が**先頭そのもの（1400）**でも通ります。
   *      ★つまり `CONTEST_MAX_LAG_M` が 0 でも 1e9 でも通る形でした。
   *      ★**機構が死んでも片側の門は通る**ので、ここで
   *      ★**この定数が実際に注視点を動かしていること**を固定します。
   *
   * ★実測（`tools/_lagprobe.mjs`）: 10m 後ろの競り合いは
   *   上限  8m → 1400.00（先頭）/ 12m → 1398.05 / 16m → 1389.59。
   */
  it('★上限の値そのものが注視点を動かしている（空回りを防ぐ）', () => {
    /** 先頭の 10m 後ろで 4 頭が競っている */
    const xs = [1400, 1390, 1389.7, 1389.4, 1389.1];
    const at8 = contestFocusMeters(xs, CONTEST_SIGMA_M, 8);
    const at12 = contestFocusMeters(xs, CONTEST_SIGMA_M, 12);
    const at16 = contestFocusMeters(xs, CONTEST_SIGMA_M, 16);
    /** ★届かない上限なら先頭を見る */
    expect(at8).toBe(1400);
    /** ★上限を広げるほど後ろへ譲る（単調） */
    expect(at12).toBeLessThan(at8);
    expect(at16).toBeLessThan(at12);
    /** ★広げても先頭より前は見ない */
    expect(at16).toBeLessThanOrEqual(1400);
  });

  /**
   * ★**1 コマの跳びを作らない。** 位置を細かく動かして、注視点が連続に動くことを見ます。
   *   ⚠️ ★過去に不連続な条件（`lead - s <= maxLag`）を入れて跳ばせた実害があります。
   */
  it('★注視点が跳ばない（馬が近づいて離れる全過程で連続）', () => {
    let prev: number | null = null;
    let maxStep = 0;
    /** 2 番手が 20m 後方から先頭に並び、また離れる */
    for (let k = 0; k <= 800; k++) {
      const gap = 20 - Math.abs(k - 400) / 20;          // 20m → 0m → 20m
      const xs = [1300, 1300 - gap, 1280, 1276, 1272];
      const f = contestFocusMeters(xs);
      if (prev !== null) maxStep = Math.max(maxStep, Math.abs(f - prev));
      prev = f;
    }
    /** ★1 ステップの入力変化は 0.05m。注視点がその 10 倍を超えて動いたら不連続 */
    expect(maxStep).toBeLessThan(0.5);
  });

  it('★決定論: 同じ入力なら必ず同じ値（憲法4）', () => {
    const xs = [1359.1, 1358.2, 1344.8, 1342.2, 1340.2];
    expect(contestFocusMeters(xs)).toBe(contestFocusMeters(xs));
  });

  it('★先頭より前は見ない / 上限より後ろへは行かない', () => {
    for (const xs of [[1300, 1299, 1298, 1297, 1296], [1400, 1370, 1369, 1368, 1367]]) {
      const f = contestFocusMeters(xs);
      expect(f).toBeLessThanOrEqual(lead(xs));
      expect(f).toBeGreaterThanOrEqual(lead(xs) - CONTEST_MAX_LAG_M);
    }
  });

  it('★0 頭・1 頭でも壊れない', () => {
    expect(contestFocusMeters([])).toBe(0);
    expect(contestFocusMeters([1234.5])).toBe(1234.5);
  });

  it('★定数の関係が壊れていない（緩い側 < 硬い側）', () => {
    expect(CONTEST_LAG_SOFT_M).toBeLessThan(CONTEST_MAX_LAG_M);
    expect(CONTEST_SIGMA_M).toBeGreaterThan(0);
  });

  /**
   * ★**先頭を枠の内側に残す**（2026-08-28）
   *
   *   ⚠️ ★これが無い間、seed 14 で **6.2 秒間、先頭（自馬）が画面の外**にいました。
   *      ★字幕は「自馬・先頭 4番」と出ていました（先頭の画面 x = 1385px / 幅 1280px）。
   */
  describe('★先頭を枠の内側に残す', () => {
    it('★先頭が枠を出るときだけ引き戻す', () => {
      const half = 5.45;
      /** ★先頭のすぐ後ろで競っている — 引き戻さない */
      expect(contestFocusWithLeadInFrame(1399, 1400, half)).toBe(1399);
      /** ★ 6m 下がっている — 先頭が外へ出るので引き戻す */
      const pulled = contestFocusWithLeadInFrame(1394, 1400, half);
      expect(pulled).toBeGreaterThan(1394);
      expect(1400 - pulled).toBeLessThanOrEqual(half - CONTEST_LEAD_MARGIN_M + 1e-9);
    });

    it('★先頭を越えて前へは行かない', () => {
      for (const raw of [1390, 1396, 1399.9]) {
        expect(contestFocusWithLeadInFrame(raw, 1400, 5.45)).toBeLessThanOrEqual(1400);
      }
    });

    /**
     * ★**1 コマの跳びを作らない。** ★`Math.max` は連続なので境目でも跳びません。
     */
    it('★境目をまたいでも連続', () => {
      let prev = contestFocusWithLeadInFrame(1390, 1400, 5.45);
      for (let raw = 1390.01; raw <= 1400; raw += 0.01) {
        const f = contestFocusWithLeadInFrame(raw, 1400, 5.45);
        expect(Math.abs(f - prev)).toBeLessThan(0.02);
        prev = f;
      }
    });

    /**
     * ★**画面の幅が分からないときは何もしない**（勝手に引き戻さない）。
     *   ⚠️ ★ここを 0 や NaN で引き戻すと、★**カメラが先頭に固定されて競り合いを抜けます**。
     */
    it('★半幅が不明ならそのまま返す', () => {
      for (const half of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
        expect(contestFocusWithLeadInFrame(1390, 1400, half)).toBe(1390);
      }
    });

    /**
     * ★**余白は絵の半幅より狭くしない。**
     *   ★横向きの絵は 2.5m × 幅高比で描かれ、実測の見えている幅は約 3.4m。
     */
    it('★余白が絵の半幅を下回らない', () => {
      expect(CONTEST_LEAD_MARGIN_M).toBeGreaterThanOrEqual(1.7);
    });
  });
});
