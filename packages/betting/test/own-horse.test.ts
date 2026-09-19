/**
 * ★**自馬が出走するレースの買い目**（★正典 **§9.5**・★**VT-1 ①**・2026-09-19）
 *
 * 【🔴 ★何を直したか】
 *   ★`/vote` は「★**自分の馬が出るレースは投票できません**」としていました。
 *   ★正典 §9.5 は「★**自馬を含む券しか買えない**」で、★**買えない**とは書いていません。
 *   → ★★**画面が正典より狭い規則を持っていました。**
 *
 * 【★見ている壊れ方】
 *   ① ★自馬レースを ★**まるごと塞ぐ**（★元の壊れ方）
 *   ② ★自馬が複数いるのに ★**1 頭 入っていれば通す**（★§9.5-3・★もう 1 頭を負けさせる利得が残る）
 *   ③ ★自馬レースでないのに ★**制限が掛かる**
 *   ④ ★5,000 EP の上限を ★**別の数で持つ**（★D-052）
 *   ⑤ ★「押せない」だけで ★**理由を言わない**
 */
import { describe, expect, it } from 'vitest';
import {
  BET_CAP_OWN_RACE_EP,
  checkOwnRaceSelection,
  ownRaceReasonText,
} from '../src/index.js';

describe('§9.5 自馬出走レースの買い目', () => {
  it('③ ★自馬が出ていないレースには、何も掛からない（★対照）', () => {
    expect(checkOwnRaceSelection([1, 2, 3], [], 30)).toEqual({ ok: true, reason: 'ok', missing: [] });
    /** ★1 頭も選んでいなくても、★§9.5 としては通す（★「0 頭」は別の話） */
    expect(checkOwnRaceSelection([], [], 0).ok).toBe(true);
    /** ★上限を超える額でも、★自馬が出ていなければ §9.5 は掛からない（★§9.4 の別の上限が見る） */
    expect(checkOwnRaceSelection([1], [], BET_CAP_OWN_RACE_EP + 1).ok).toBe(true);
  });

  it('① ★★自馬を含んでいれば出せる（★まるごと塞がない）', () => {
    const c = checkOwnRaceSelection([3, 7, 11], [7], 30);
    expect(c.ok, '🔴 ★自馬を含んでいるのに出せない（★元の壊れ方）').toBe(true);
    expect(c.reason).toBe('ok');
  });

  it('★自馬だけでも出せる（★単勝・複勝は自馬のみ・§9.5-1）', () => {
    expect(checkOwnRaceSelection([7], [7], 10).ok).toBe(true);
  });

  it('★自馬が入っていなければ出せない（★§9.5-1）', () => {
    const c = checkOwnRaceSelection([1, 2, 3], [7], 30);
    expect(c.ok).toBe(false);
    expect(c.reason).toBe('own_horse_missing');
    expect(c.missing).toEqual([7]);
  });

  it('② ★★自馬が 2 頭なら、全頭 入っていること（★§9.5-3・D-104）', () => {
    /**
     * 🔴 ★ここが 2026-09-16 の是正です。★D-104 で 1 人 2 頭まで出せるようになりました。
     *   ★片方だけを含む買い目を許すと、★**もう 1 頭を負けさせる利得**が残ります。
     */
    const partial = checkOwnRaceSelection([3, 7], [7, 12], 20);
    expect(partial.ok, '🔴 ★1 頭 入っていれば通している（★§9.5-3 が効いていない）').toBe(false);
    expect(partial.reason).toBe('own_horses_partial');
    expect(partial.missing).toEqual([12]);
    /** ★両方 入っていれば通る */
    expect(checkOwnRaceSelection([3, 7, 12], [7, 12], 30).ok).toBe(true);
    /** ★どちらも入っていなければ「1 頭も無い」側 */
    const none = checkOwnRaceSelection([3, 4], [7, 12], 20);
    expect(none.reason).toBe('own_horse_missing');
    expect(none.missing).toEqual([7, 12]);
  });

  it('★足りない馬番は昇順（★「12・7 番」と出さない）', () => {
    expect(checkOwnRaceSelection([], [12, 7, 3], 0).missing).toEqual([3, 7, 12]);
  });

  it('④ ★★上限は `BET_CAP_OWN_RACE_EP` から引く（★数を持たない・D-052）', () => {
    expect(BET_CAP_OWN_RACE_EP).toBe(5_000);
    /** ★境界の両側（R-2）: ★ちょうどは通る・1 EP 超えたら通らない */
    expect(checkOwnRaceSelection([7], [7], BET_CAP_OWN_RACE_EP).ok, '★ちょうどで弾いている').toBe(true);
    const over = checkOwnRaceSelection([7], [7], BET_CAP_OWN_RACE_EP + 1);
    expect(over.ok).toBe(false);
    expect(over.reason).toBe('own_race_cap');
  });

  it('★★マークシートは、上限に遠く届かない（★「普通に満たせる」の根拠）', () => {
    /**
     * ★1 頭 10 EP。★18 頭 全部 選んでも **180 EP** で、★上限 5,000 EP の **3.6%**。
     * → ★**金額の上限が理由でマークシートが止まることはありません。**
     */
    const EP_PER_PICK = 10;
    const maxField = 18;
    expect(maxField * EP_PER_PICK).toBeLessThan(BET_CAP_OWN_RACE_EP / 10);
    const all = Array.from({ length: maxField }, (_, i) => i + 1);
    expect(checkOwnRaceSelection(all, [7], maxField * EP_PER_PICK).ok).toBe(true);
  });

  it('⑤ ★★理由が言える（★「押せない」だけにしない）', () => {
    expect(ownRaceReasonText(checkOwnRaceSelection([1], [7], 10))).toContain('7 番');
    expect(ownRaceReasonText(checkOwnRaceSelection([7], [7, 12], 20))).toContain('12 番');
    expect(ownRaceReasonText(checkOwnRaceSelection([7], [7, 12], 20))).toContain('全頭');
    expect(ownRaceReasonText(checkOwnRaceSelection([7], [7], 5_001))).toContain('5,000');
    /** ★通るときは何も言わない（★空文字） */
    expect(ownRaceReasonText(checkOwnRaceSelection([7], [7], 10))).toBe('');
    /** ★対照: ★どの理由も空文字でない（★言えない理由を作っていない） */
    for (const c of [
      checkOwnRaceSelection([1], [7], 10),
      checkOwnRaceSelection([7], [7, 12], 20),
      checkOwnRaceSelection([7], [7], 5_001),
    ]) {
      expect(ownRaceReasonText(c).length, `${c.reason} の文が空`).toBeGreaterThan(5);
    }
  });

  it('★重複した選択に引きずられない（★同じ馬番を 2 回 選んでも同じ）', () => {
    expect(checkOwnRaceSelection([7, 7, 3], [7], 30).ok).toBe(true);
  });
});
