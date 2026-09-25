import { describe, expect, it } from 'vitest';
import {
  parseReplayRunners, replayDisplayProgress, replayProgress,
  REPLAY_DISPLAY_MS, REPLAY_START_DELAY_MS,
} from '../../web/src/components/uma/race-replay.js';

const rows = [
  // ⚠️ ★`horse_id` は 2026-09-26（段 2・移行 `0089`）から★必須です — ★毛色の素なので、
  //    ★無いまま通すと ★毛色が枠番由来に戻ります（★月毛・白毛が出ない形）。
  { gate: 2, horse_name: '朝風', strategy: 'nige', finish_pos: 1, finish_time: 83,
    horse_id: '11111111-1111-4111-8111-111111111111' },
  { gate: 1, horse_name: '夕雲', strategy: 'sashi', finish_pos: 2, finish_time: 84,
    horse_id: '22222222-2222-4222-8222-222222222222' },
];

describe('確定した実レースの録画表示', () => {
  it('走破タイムと着順が一致する出走表だけを受け入れる', () => {
    expect(parseReplayRunners(rows).map((r) => r.gate)).toEqual([1, 2]);
    expect(parseReplayRunners([{ ...rows[0]!, finish_pos: 2 }, rows[1]!])).toEqual([]);
    expect(parseReplayRunners([{ ...rows[0]!, finish_time: null }, rows[1]!])).toEqual([]);
  });

  /**
   * 🔴 ★**馬 ID が無ければ 1 頭も返さない**（★2026-09-26・段 2・移行 `0089`）。
   *
   * 【★なぜ ★「無ければ空」なのか】
   *   ★毛色は ★`coatOfHorseId(horseId)` が唯一の出どころです。
   *   ⚠️ ★馬 ID が無いときに ★**枠番で代用すると**、★`/race` が 2026-09-26 まで抱えていた欠陥
   *      （★`COAT_BY_GATE`・★月毛と白毛が永久に出ない）に ★**そのまま戻ります**。
   *   ★`0089` を当てていない環境では ★`horse_id` が来ないので、★**「出せない」と分かる側**に倒します
   *      （★R-27・★嘘の絵を出さない）。
   */
  it('🔴 ★馬 ID（毛色の素）が無い行は受け入れない', () => {
    const noId = rows.map(({ horse_id: _omit, ...rest }) => rest);
    expect(parseReplayRunners(noId), '🔴 ★`horse_id` が無いのに通しました（★毛色が枠番由来に戻ります）')
      .toEqual([]);
    /** ★1 頭だけ欠けても ★**全体を空にする**（★半分だけ本物の絵を出さない） */
    expect(parseReplayRunners([{ ...rows[0]!, horse_id: null }, rows[1]!])).toEqual([]);
    /** ★対照: ★揃っていれば通り、★馬 ID を運ぶ */
    const ok = parseReplayRunners(rows);
    expect(ok.map((r) => r.horseId)).toEqual([
      '22222222-2222-4222-8222-222222222222',
      '11111111-1111-4111-8111-111111111111',
    ]);
  });

  it('共通の開催時刻から再生位置を決め、開催前や再生後は走らせない', () => {
    const scheduledAt = '2026-09-21T12:00:00.000Z';
    const scheduledMs = new Date(scheduledAt).getTime();
    expect(replayDisplayProgress(scheduledAt, scheduledMs)).toBeNull();
    expect(replayDisplayProgress(scheduledAt, scheduledMs + REPLAY_START_DELAY_MS)).toBe(0);
    expect(replayDisplayProgress(scheduledAt, scheduledMs + REPLAY_START_DELAY_MS + REPLAY_DISPLAY_MS / 2)).toBe(0.5);
    expect(replayDisplayProgress(scheduledAt, scheduledMs + REPLAY_START_DELAY_MS + REPLAY_DISPLAY_MS)).toBeNull();
  });

  it('途中の補間は単調で、確定した走破時刻を動かさない', () => {
    const [runner] = parseReplayRunners(rows);
    expect(runner).toBeDefined();
    const first = runner!;
    const points = [0, 20, 40, 60, first.finishSec].map((sec) => replayProgress(first, 1200, sec));
    expect(points[0]).toBe(0);
    expect(points.at(-1)).toBe(1);
    for (let i = 1; i < points.length; i += 1) expect(points[i]!).toBeGreaterThan(points[i - 1]!);
  });
});
