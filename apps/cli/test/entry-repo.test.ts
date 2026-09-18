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
  ENTRY_DEADLINE_MS, entryStateOf, readEntryError, type EntryRaceRow,
} from '../../web/src/lib/entry-repo.js';

const NOW = 1_700_000_000_000;
const race = (over: Partial<EntryRaceRow> = {}): EntryRaceRow => ({
  id: 'r1',
  scheduledAtMs: NOW + 3 * 60 * 60 * 1000, // ★3 時間後（★締切の外）
  classRank: 2,
  surface: 'turf',
  distance: 1600,
  trackCondition: 'good',
  courseId: 'ookawara',
  minWins: 1,
  maxWins: 1,
  status: 'scheduled',
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

  it('★締切の両側（★発走 60 分前ちょうどは締切・R-2）', () => {
    const at = (msBefore: number): EntryRaceRow => race({ scheduledAtMs: NOW + msBefore });
    expect(entryStateOf(at(ENTRY_DEADLINE_MS + 1000), 1, NOW)).toBe('ok');
    expect(entryStateOf(at(ENTRY_DEADLINE_MS), 1, NOW)).toBe('closed'); // ★ちょうどは締切
    expect(entryStateOf(at(ENTRY_DEADLINE_MS - 1000), 1, NOW)).toBe('closed');
  });

  it('★発走を過ぎた・中止になったレースは closed', () => {
    expect(entryStateOf(race({ status: 'settled' }), 1, NOW)).toBe('closed');
    expect(entryStateOf(race({ status: 'cancelled' }), 1, NOW)).toBe('closed');
  });

  it('🔴 ★画面の判定が DB 側（enter_race）と食い違わない', () => {
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
