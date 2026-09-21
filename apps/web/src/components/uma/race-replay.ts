import { secAtMetersLeftOf } from '@star/race-engine';

export interface ReplayRunner {
  readonly gate: number;
  readonly name: string;
  readonly strategy: 'nige' | 'senko' | 'sashi' | 'oikomi';
  readonly finishSec: number;
  readonly finishPosition: number;
}

export function parseReplayRunners(rows: readonly Record<string, unknown>[]): ReplayRunner[] {
  const runners: ReplayRunner[] = [];
  const gates = new Set<number>();
  for (const row of rows) {
    const gate = Number(row['gate']);
    const finishSec = Number(row['finish_time']);
    const finishPosition = Number(row['finish_pos']);
    const strategy = row['strategy'];
    if (!Number.isInteger(gate) || gate < 1 || gates.has(gate)
      || !Number.isFinite(finishSec) || finishSec <= 0
      || !Number.isInteger(finishPosition) || finishPosition < 1
      || (strategy !== 'nige' && strategy !== 'senko' && strategy !== 'sashi' && strategy !== 'oikomi')) {
      return [];
    }
    gates.add(gate);
    runners.push({ gate, name: String(row['horse_name'] ?? `${gate}番`), strategy, finishSec, finishPosition });
  }
  if (runners.length === 0 || new Set(runners.map((r) => r.finishPosition)).size !== runners.length) return [];
  const byTime = [...runners].sort((a, b) => a.finishSec - b.finishSec || a.gate - b.gate);
  if (byTime.some((runner, index) => runner.finishPosition !== index + 1)) return [];
  return runners.sort((a, b) => a.gate - b.gate);
}

/** 結果の走破タイムと脚質から、途中位置を画面用に補間する。 */
export function replayProgress(runner: ReplayRunner, distance: number, raceSec: number): number {
  if (!Number.isFinite(distance) || distance <= 0) return 0;
  if (raceSec <= 0) return 0;
  if (raceSec >= runner.finishSec) return 1;
  const timeAt = secAtMetersLeftOf(runner.finishSec, distance, runner.strategy, 'middle');
  let low = 0;
  let high = distance;
  for (let i = 0; i < 24; i += 1) {
    const mid = (low + high) / 2;
    if (timeAt(distance - mid) < raceSec) low = mid;
    else high = mid;
  }
  return Math.max(0, Math.min(1, (low + high) / (2 * distance)));
}

export const REPLAY_START_DELAY_MS = 75_000;
export const REPLAY_DISPLAY_MS = 45_000;

/** 開催時刻を共有時計にして、ページ移動でも同じ録画位置へ戻る。 */
export function replayDisplayProgress(scheduledAt: string, nowMs: number): number | null {
  const startMs = new Date(scheduledAt).getTime() + REPLAY_START_DELAY_MS;
  if (!Number.isFinite(startMs) || nowMs < startMs || nowMs >= startMs + REPLAY_DISPLAY_MS) return null;
  return (nowMs - startMs) / REPLAY_DISPLAY_MS;
}
