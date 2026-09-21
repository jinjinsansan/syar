import { describe, expect, it } from 'vitest';
import {
  parseReplayRunners, replayDisplayProgress, replayProgress,
  REPLAY_DISPLAY_MS, REPLAY_START_DELAY_MS,
} from '../../web/src/components/uma/race-replay.js';

const rows = [
  { gate: 2, horse_name: '朝風', strategy: 'nige', finish_pos: 1, finish_time: 83 },
  { gate: 1, horse_name: '夕雲', strategy: 'sashi', finish_pos: 2, finish_time: 84 },
];

describe('確定した実レースの録画表示', () => {
  it('走破タイムと着順が一致する出走表だけを受け入れる', () => {
    expect(parseReplayRunners(rows).map((r) => r.gate)).toEqual([1, 2]);
    expect(parseReplayRunners([{ ...rows[0]!, finish_pos: 2 }, rows[1]!])).toEqual([]);
    expect(parseReplayRunners([{ ...rows[0]!, finish_time: null }, rows[1]!])).toEqual([]);
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
