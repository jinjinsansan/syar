/**
 * ★**出走登録のデータ層**（`apps/web/src/lib/entry-repo.ts`・UI-1・2026-09-18）
 *
 * 【★見ている壊れ方】
 *   ① ★**資格の情報が無いレースを「出られる」と表示する**（★R-27: 分からないなら狭い側）
 *   ② ★**締切を過ぎたレースを出せると表示する**（§10.4「発走 60 分前まで」）
 *   ③ ★**段の判定が DB 側（`enter_race`）と食い違う**（★押してから弾かれる・CL-4 が禁じた形）
 *   ④ ★**失敗の理由を握りつぶす**（★`ST001` EP 不足・`ST002` 出走資格を出さない）
 *
 * ⚠️ ★ここは**判断の規則だけ**を見ます（★DB には触りません）。
 */
import { describe, it, expect } from 'vitest';
import { isEligibleFor, winsRangeFor } from '@star/scheduler';
import {
  ENTERABLE_RACE_STATUS, entryStateOf, readEntryError, type EntryRaceRow,
} from '../../web/src/lib/entry-repo.js';

const NOW = 1_700_000_000_000;
/**
 * ★**締切はサーバーが行に書いた値**（★2026-09-19・**ED-1**・移行 `0041`）。
 * 🔴 ★旧は画面が `scheduledAtMs - 60 分` で計算していました —
 *   ★それは SQL の `interval '60 minutes'` の写しで、★**画面が時計を持つ**形でした（§14）。
 */
const race = (over: Partial<EntryRaceRow> = {}): EntryRaceRow => ({
  id: 'r1',
  scheduledAtMs: NOW + 3 * 60 * 60 * 1000, // ★3 時間後
  entryDeadlineAtMs: NOW + 60 * 60 * 1000, // ★締切は 1 時間後（★まだ登録できる）
  entryFeeEP: 200,
  weightKg: 55,
  cycleIndex: 1,
  classRank: 2,
  surface: 'turf',
  distance: 1600,
  trackCondition: 'good',
  courseId: 'ookawara',
  minWins: 1,
  maxWins: 1,
  /**
   * 🔴 ★**受け付ける段を、★画面の定数から取ります**（★2026-09-25）。
   *    ★旧は `'scheduled'` と書き写してありました。★D-117（`0051`）で DB が `'announced'` に
   *    ★変わったのに ★**この写しが古いまま**で、★検査は緑のままでした。
   *    ★本番では ★**誰も一度も登録できていません**でした（★持ち主の居る馬の登録 0 件）。
   * ⚠️ ★ここに段の名前を書かないこと（★写した瞬間に、また古びます）。
   */
  status: ENTERABLE_RACE_STATUS,
  ...over,
});

describe('UI-1 出走できるかの判定', () => {
  it('★資格が合えば ok', () => {
    expect(entryStateOf(race(), 1, NOW)).toBe('ok');
  });

  it('★段が違えば class（★上も下も）', () => {
    expect(entryStateOf(race(), 0, NOW)).toBe('class');
    expect(entryStateOf(race(), 2, NOW)).toBe('class');
  });

  it('★オープン（上限なし）は 4 勝以上なら ok', () => {
    const open = race({ minWins: 4, maxWins: null });
    expect(entryStateOf(open, 3, NOW)).toBe('class');
    expect(entryStateOf(open, 4, NOW)).toBe('ok');
    expect(entryStateOf(open, 30, NOW)).toBe('ok');
  });

  it('🔴 ★資格の情報が無いレースは出られない（★分からないなら狭い側・R-27）', () => {
    expect(entryStateOf(race({ minWins: null, maxWins: null }), 1, NOW)).toBe('class');
  });

  it('★締切の両側（★ちょうどは締切・R-2）', () => {
    /**
     * ★締切は ★**行に書かれた値**です（ED-1）。★`enter_race` も `now() >= entry_deadline_at`
     * ★と見ており、★**ちょうどは両方とも「締切」**です。
     */
    const at = (deadlineMs: number): EntryRaceRow => race({ entryDeadlineAtMs: deadlineMs });
    expect(entryStateOf(at(NOW + 1000), 1, NOW)).toBe('ok');
    expect(entryStateOf(at(NOW), 1, NOW)).toBe('closed');       // ★ちょうどは締切
    expect(entryStateOf(at(NOW - 1000), 1, NOW)).toBe('closed');
  });

  it('🔴 ★締切の情報が無いレースは出られない（★R-27・`enter_race` と同じ）', () => {
    expect(entryStateOf(race({ entryDeadlineAtMs: null }), 1, NOW)).toBe('closed');
  });

  it('★発走を過ぎた・中止になったレースは closed', () => {
    expect(entryStateOf(race({ status: 'settled' }), 1, NOW)).toBe('closed');
    expect(entryStateOf(race({ status: 'cancelled' }), 1, NOW)).toBe('closed');
  });

  /**
   * ⚠️ ★**この検査の名前は、★中身より広いことを言っていました**（★2026-09-25 に気づいた）。
   *    ★見ているのは ★**勝利数の資格だけ**で、★**レースの段は見ていません**。
   *    ★だから D-117 で段が変わったとき、★この検査は ★**緑のまま**でした。
   *    → ★段の突き合わせは ★`apps/cli/test/entry-stage-matches-rpc.test.ts` が見ます
   *      （★移行の原文から段を取り出して比べる）。
   */
  it('🔴 ★画面の資格の判定が DB 側（enter_race）と食い違わない（★勝利数のみ）', () => {
    // ★`enter_race` は min_wins / max_wins と比べる。★画面も同じ数で比べているか、
    //   ★段の定義（@star/scheduler）から作った範囲で総当たりして確かめる
    for (const cls of ['maiden', 'win1', 'win2', 'win3', 'open', 'graded'] as const) {
      const { min, max } = winsRangeFor(cls);
      for (let wins = 0; wins <= 8; wins += 1) {
        const state = entryStateOf(race({ minWins: min, maxWins: max }), wins, NOW);
        expect(state === 'ok', `${cls} wins=${wins}`).toBe(isEligibleFor(cls, wins));
      }
    }
  });
});

describe('UI-1 失敗の読み方（★黙って握らない・R-27）', () => {
  it('★ST001 は EP 不足', () => {
    const f = readEntryError({ code: 'ST001', message: 'EP が不足している（残高 100 / 必要 200）' });
    expect(f.kind).toBe('insufficient_ep');
    expect(f.message).toContain('EP が不足');
  });

  it('★ST002 は出走資格', () => {
    const f = readEntryError({ code: 'ST002', message: 'この馬はこのレースに出られません（勝利数 0 ／ …）' });
    expect(f.kind).toBe('not_eligible');
  });

  it('★当てはまらないものは原文をそのまま出す（★推測で言い換えない）', () => {
    const f = readEntryError({ code: 'P0001', message: '登録の受付は終わっています（発走 60 分前まで）' });
    expect(f.kind).toBe('other');
    expect(f.message).toBe('登録の受付は終わっています（発走 60 分前まで）');
  });

  it('★理由が無くても、無言にしない', () => {
    expect(readEntryError(null).message.length).toBeGreaterThan(0);
  });
});
