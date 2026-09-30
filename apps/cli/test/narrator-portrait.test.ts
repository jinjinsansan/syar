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
import { narratorPortrait, narratorCastForRace, narratorCastForRaceNo, ACTIVE_NARRATOR_CASTS, NARRATOR_NAMES, NARRATOR_ROLES } from '@star/render';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

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

describe('★話者の割り当て（1 レースに 1 人）', () => {
  it('★★同じシードなら必ず同じ人（決定論・憲法 4）', () => {
    for (const seed of [42, 7, 2026, 31337]) {
      expect(narratorCastForRace(seed)).toBe(narratorCastForRace(seed));
    }
  });

  it('★★4 名すべてが出番を持つ（作った人が使われないことがない）', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 400; seed += 1) seen.add(narratorCastForRace(seed));
    expect(seen).toEqual(new Set(['a', 'b', 'c', 'd']));
  });

  it('★連番のレースで同じ人が続きすぎない', () => {
    let run = 1, worst = 1;
    for (let seed = 2; seed <= 200; seed += 1) {
      run = narratorCastForRace(seed) === narratorCastForRace(seed - 1) ? run + 1 : 1;
      worst = Math.max(worst, run);
    }
    expect(worst, `同じ人が ${worst} レース続きます`).toBeLessThanOrEqual(4);
  });

  it('★名前と役割が 4 名そろっている', () => {
    for (const c of ['a', 'b', 'c', 'd'] as const) {
      expect(NARRATOR_NAMES[c].length).toBeGreaterThan(0);
      expect(NARRATOR_ROLES[c].length).toBeGreaterThan(0);
    }
    expect(NARRATOR_NAMES.a).toBe('星野 亮太');
    expect(NARRATOR_ROLES.b).toBe('解説');
  });
});

/**
 * ★**実況は 川崎 タカシ**（★2026-09-29・オーナー「写真をそのまま使い口パクをつける＆その写真を元にイラスト化 この 2 種類を作って、交互に実況中継させればいいです」）
 */
describe('★実況 川崎 タカシ（写真の版とイラストの版を交互）', () => {
  it('★その日の何 R かで 交互に替わり、どちらも 川崎 タカシ', () => {
    const seq = [1, 2, 3, 4, 5, 6].map((n) => narratorCastForRaceNo(n));
    expect(seq).toEqual(['tp', 'ti', 'tp', 'ti', 'tp', 'ti']);
    for (const c of ACTIVE_NARRATOR_CASTS) expect(NARRATOR_NAMES[c]).toBe('川崎 タカシ');
  });

  it('★画面は この 2 版だけを読み、★素材が揃っている（閉じた口 1 枚 ＋ 開いた口 3 表情）', () => {
    const page = readFileSync(path.resolve(__dirname, '../../web/src/app/race/page.tsx'), 'utf8');
    expect(page).toContain('const casts = ACTIVE_NARRATOR_CASTS;');
    expect(page).not.toContain("const casts = ['a', 'b', 'c', 'd'] as const;");
    for (const c of ACTIVE_NARRATOR_CASTS) {
      for (const f of ['closed', 'normal-open', 'hot-open', 'shout-open']) {
        expect(existsSync(path.resolve(__dirname, `../../web/public/art/narrator-${c}-${f}.webp`)), `${c}-${f}`).toBe(true);
      }
    }
  });
});

/**
 * ★**口パクは 言い終えるまで**（★2026-09-30・オーナー「川崎タカシの口パクが少ない」）。
 *   ★旧: 文字が打たれている間（★毎秒 20 字）だけ・★しかも実況の行では ★部品の数（3〜5）を文字数として渡していた → ★0.2 秒ほど。
 */
describe('★口パクの長さ', () => {
  it('🔴 20 字の発言は 2.5 秒ほど口が動く（★毎秒 7 字）・短い発言も 1.5 秒は動く', async () => {
    const { narratorSpeakingAt } = await import('@star/render');
    expect(narratorSpeakingAt(20, 2.5)).toBe(true);
    expect(narratorSpeakingAt(20, 3.0)).toBe(false);
    expect(narratorSpeakingAt(5, 1.4)).toBe(true);
    expect(narratorSpeakingAt(5, 1.6)).toBe(false);
    expect(narratorSpeakingAt(20, -0.1), '★言い出す前').toBe(false);
  });

  it('🔴 画面は 実況の行の ★文字数を渡す（★部品の数を渡さない）・3 か所とも narratorSpeakingAt', () => {
    const page = readFileSync(path.resolve(__dirname, '../../web/src/app/race/page.tsx'), 'utf8');
    expect(page).toContain('narratorSpeakingAt(last.map((p) => p.text).join(\'\').length, d - at0)');
    expect(page).not.toContain('narratorSpeakingAt(last.length');
    expect(page.match(/speaking: narratorSpeakingAt\(|narratorSpeakingAt\(last\.map/g)?.length).toBe(3);
    expect(page, '★旧い「打っている間だけ」').not.toMatch(/speaking: typedCount\(/);
  });
});
