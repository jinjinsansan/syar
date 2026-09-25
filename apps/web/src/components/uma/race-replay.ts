import { secAtMetersLeftOf } from '@star/race-engine';

export interface ReplayRunner {
  readonly gate: number;
  readonly name: string;
  readonly strategy: 'nige' | 'senko' | 'sashi' | 'oikomi';
  readonly finishSec: number;
  readonly finishPosition: number;
  /**
   * 🔴 ★**毛色の素**（★2026-09-26・段 2・移行 `0089`）。
   *   ★毛色そのものは ★`coatOfHorseId(horseId)`（`@star/render`）が決めます — ★**唯一の出どころ**。
   *   ⚠️ ★**枠番から毛色を引かないこと。** ★枠はその日の枠で、★馬の毛色ではありません。
   *     ★`/race` は 2026-09-26 まで ★`COAT_BY_GATE`（★18 枠の表）で引いており、
   *     ★その表に ★**月毛と白毛が無い**ので ★9 色 焼いてあるのに 7 色しか出ませんでした。
   * ⚠️ ★**この 1 か所で持ちます。** ★常設帯（`race-strip`）と ★本編（`/race`）が
   *    ★**同じ `parseReplayRunners` を通る**ので、★馬番・着順・毛色が ★構造的に一致します。
   */
  readonly horseId: string;
}

export function parseReplayRunners(rows: readonly Record<string, unknown>[]): ReplayRunner[] {
  const runners: ReplayRunner[] = [];
  const gates = new Set<number>();
  for (const row of rows) {
    const gate = Number(row['gate']);
    const finishSec = Number(row['finish_time']);
    const finishPosition = Number(row['finish_pos']);
    const strategy = row['strategy'];
    /**
     * 🔴 ★**馬 ID が無ければ 1 頭も返しません**（★2026-09-26・段 2）。
     *   ⚠️ ★ここで ★**枠番を代わりに使わないこと**。★そうすると毛色が枠番由来に戻り、
     *      ★月毛と白毛が永久に出ません（★直したばかりの欠陥に戻る道）。
     *   ★`0089` を当てていない環境では ★`horse_id` が来ないので、★**空を返して「出せない」と分かる**側に倒します
     *      （★R-27・狭い側へ倒さない ＝ ★嘘の絵を出さない）。
     */
    const horseId = row['horse_id'];
    if (!Number.isInteger(gate) || gate < 1 || gates.has(gate)
      || !Number.isFinite(finishSec) || finishSec <= 0
      || !Number.isInteger(finishPosition) || finishPosition < 1
      || typeof horseId !== 'string' || horseId === ''
      || (strategy !== 'nige' && strategy !== 'senko' && strategy !== 'sashi' && strategy !== 'oikomi')) {
      return [];
    }
    gates.add(gate);
    runners.push({
      gate, name: String(row['horse_name'] ?? `${gate}番`), strategy, finishSec, finishPosition, horseId,
    });
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
