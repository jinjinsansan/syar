/**
 * ★実況の立ち絵の選び方（表情と口）を留める
 *
 * 【仕様】`design/hud-ds/components/narrator-cast/index.html`
 *   表情 3（通常／熱／絶叫）× 口 2（閉／開）= 6 枚
 *   ★**口パクは同一頭部で口だけ差し替え（頭が動かないこと）**
 *
 * ⚠️ ★`Date.now()` も乱数も使わないこと（憲法 4）。**表示時刻から決定論**で決める。
 *    撮影用シークで時刻を戻しても同じ絵になること。
 */
import { describe, it, expect } from 'vitest';
import { narratorPortrait } from '@star/render';

const img = (tag: string) => ({ tag, width: 300, height: 344 });
const SET = {
  normal: { closed: img('n-c'), open: img('n-o') },
  hot: { closed: img('h-c'), open: img('h-o') },
  shout: { closed: img('s-c'), open: img('s-o') },
};
const FALLBACK = img('fallback');
const tagOf = (r: { image: unknown }) => (r.image as { tag: string }).tag;

describe('★実況の立ち絵', () => {
  it('★表情は残り距離で決まる（序盤=通常 / 勝負所=熱 / ゴール前=絶叫）', () => {
    expect(tagOf(narratorPortrait(FALLBACK, SET, { metersLeft: 1200, displaySec: 0, speaking: false }))).toBe('n-c');
    expect(tagOf(narratorPortrait(FALLBACK, SET, { metersLeft: 500, displaySec: 0, speaking: false }))).toBe('h-c');
    expect(tagOf(narratorPortrait(FALLBACK, SET, { metersLeft: 80, displaySec: 0, speaking: false }))).toBe('s-c');
  });

  it('★★喋っていないときは口を閉じる', () => {
    for (const t of [0, 0.06, 0.13, 0.25, 1.7]) {
      expect(tagOf(narratorPortrait(FALLBACK, SET, { metersLeft: 1200, displaySec: t, speaking: false }))).toBe('n-c');
    }
  });

  it('★★喋っている間は口が開閉する', () => {
    const seen = new Set<string>();
    for (let t = 0; t < 1; t += 1 / 60) {
      seen.add(tagOf(narratorPortrait(FALLBACK, SET, { metersLeft: 1200, displaySec: t, speaking: true })));
    }
    expect(seen, '口が動いていません').toEqual(new Set(['n-c', 'n-o']));
  });

  it('★★同じ表示時刻なら必ず同じ絵（決定論・撮影用シークで戻しても同じ）', () => {
    for (const t of [0.37, 1.02, 5.55]) {
      const a = tagOf(narratorPortrait(FALLBACK, SET, { metersLeft: 300, displaySec: t, speaking: true }));
      const b = tagOf(narratorPortrait(FALLBACK, SET, { metersLeft: 300, displaySec: t, speaking: true }));
      expect(a).toBe(b);
    }
  });

  it('★素材が揃っていなければ従来の 1 枚に落ちる（読み込み失敗で演出を止めない）', () => {
    expect(tagOf(narratorPortrait(FALLBACK, undefined, { metersLeft: 100, displaySec: 0.1, speaking: true }))).toBe('fallback');
  });
});
