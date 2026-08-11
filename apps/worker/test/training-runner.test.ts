/**
 * ★週送りの「性質」を試験します（B-5）。
 *
 *   正典 B-5: 「**週番号が時刻から決まり、再起動・遅延で欠落も重複もしない**
 *   （P2 の `cycle_index` と同じ性質）」
 *
 *   ★これは「1回動いた」では確かめられません。
 *     - 二度呼んで**二度進まない**こと
 *     - 遅れて呼んでも**飛ばさない**こと
 *     - いまの週（締まっていない）を**進めない**こと
 *   を別々に固定します。
 *
 * ★DB は使いません。`weeksToProcess` と方針関数の性質だけを見ます
 *   （DB を通す確認は `tools/verify-training-week.mjs` が staging で行います）。
 */
import { describe, expect, it } from 'vitest';
import { CYCLE_MS, weekIndexAt, weeksToProcess } from '@star/scheduler';
import { MENUS } from '@star/training';
import { MAX_WEEKS_PER_RUN, defaultMenu } from '../src/training-runner.js';

const WEEK = CYCLE_MS * 24;

describe('B-5 週番号は時刻から決まる', () => {
  it('★同じ時刻・同じ進捗なら、何度呼んでも同じ週の並びになる', () => {
    const now = WEEK * 10 + 12345;
    expect(weeksToProcess(now, 0, 5)).toEqual(weeksToProcess(now, 0, 5));
    expect(weeksToProcess(now, 0, 5)).toEqual([6, 7, 8, 9]);
  });

  it('★いまの週は進めない（締まっていないので）', () => {
    const now = WEEK * 10 + 1;
    // いまは 10週目。処理するのは 9 まで
    expect(weekIndexAt(now, 0)).toBe(10);
    expect(weeksToProcess(now, 0, 8)).toEqual([9]);
  });

  it('★処理済みなら空を返す（二度進まない）', () => {
    const now = WEEK * 10 + 1;
    expect(weeksToProcess(now, 0, 9)).toEqual([]);
    expect(weeksToProcess(now, 0, 10)).toEqual([]);
  });

  it('★遅れても飛ばさない（止まっていた週がすべて出る）', () => {
    const now = WEEK * 20 + 1;
    const out = weeksToProcess(now, 0, 3);
    expect(out[0]).toBe(4);
    expect(out.at(-1)).toBe(19);
    expect(out.length).toBe(16);
    // ★連番であること（1つも欠けない）
    for (let i = 1; i < out.length; i += 1) expect(out[i]! - out[i - 1]!).toBe(1);
  });

  it('★初回（lastProcessed が null）は1週だけ', () => {
    const now = WEEK * 10 + 1;
    expect(weeksToProcess(now, 0, null)).toEqual([9]);
  });

  it('★週の境界の両側（R-2）', () => {
    // 9週目の終わり = 10週目の始まり
    expect(weeksToProcess(WEEK * 10 - 1, 0, 8)).toEqual([]);
    expect(weeksToProcess(WEEK * 10, 0, 8)).toEqual([9]);
  });
});

describe('★育成方針は較正した世界と同じ（Q-P3-24 の暫定）', () => {
  it('疲労70以上で休養（§7.4 の閾値）', () => {
    expect(defaultMenu(100, 70)).toBe('rest');
    expect(defaultMenu(100, 100)).toBe('rest');
  });

  it('★疲労69では休養しない（境界の両側・R-2）', () => {
    expect(defaultMenu(100, 69)).not.toBe('rest');
  });

  it('4週周期で 追い切り→坂路→ウッド→軽め', () => {
    expect(defaultMenu(100, 0)).toBe('hard');
    expect(defaultMenu(101, 0)).toBe('hill');
    expect(defaultMenu(102, 0)).toBe('wood');
    expect(defaultMenu(103, 0)).toBe('light');
    expect(defaultMenu(104, 0)).toBe('hard');
  });

  it('★V-7 / V-14 / V-15 / B-6 の錨と同じ4種しか使わない', () => {
    const used = new Set<string>();
    for (let w = 0; w < 200; w += 1) used.add(defaultMenu(w, 0));
    for (let w = 0; w < 200; w += 1) used.add(defaultMenu(w, 80));
    expect([...used].sort()).toEqual(['hard', 'hill', 'light', 'rest', 'wood']);
  });

  it('★返すメニューはすべて §7.2 の表にある', () => {
    for (let w = 0; w < 50; w += 1) {
      expect(MENUS[defaultMenu(w, w % 100)]).toBeDefined();
    }
  });
});

describe('★暴走しない', () => {
  it('1回の実行で進める上限がある', () => {
    expect(MAX_WEEKS_PER_RUN).toBeGreaterThan(0);
    expect(MAX_WEEKS_PER_RUN).toBeLessThanOrEqual(24);
  });
});
