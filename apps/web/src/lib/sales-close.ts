/**
 * ★**発売の締切**（★表示だけ・★拒むのはサーバーの `place_bet`・2026-09-29・`0096`）
 *   ★締切は ★発走の `SALES_CLOSE_LEAD_MS` 前（★cycle.ts の表・★SQL の `sales_close_lead_seconds()` と網 sales-close-sql で一致）。
 *   ★純関数だけを置く（★壁時計は `components/clock.tsx` の 1 か所）。
 */
import { CYCLE_MS, PHASE_OFFSET_MS } from '@star/scheduler';
import { CLAIM_SALES_CLOSED } from './claims';

export const SALES_CLOSE_LEAD_MS = CYCLE_MS - PHASE_OFFSET_MS.salesClose;

/** ★発売の締切の時刻（★発走 − 余裕）。★画面は ★ここから出す（★画面で式を書かない） */
export function salesCloseAtMs(scheduledAtMs: number): number {
  return scheduledAtMs - SALES_CLOSE_LEAD_MS;
}

/**
 * ★発売締切までの残り（★極小の帯の「残り時間」・RACE_NOTICE_HANDOFF §2・2026-09-29）。★過ぎたら ★締め切った語。★発走が読めなければ null。
 */
export function salesLeftText(scheduledAtIso: string, nowMs: number): string | null {
  const start = Date.parse(scheduledAtIso);
  if (!Number.isFinite(start)) return null;
  const left = salesCloseAtMs(start) - nowMs;
  if (left <= 0) return CLAIM_SALES_CLOSED;
  const s = Math.floor(left / 1000);
  return `${LABEL_SALES_CLOSE}まで ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** ★見出しの語（★「締切」だけだと ★出走登録の締切と 投票の締切を 読み違える・2026-09-29） */
export const LABEL_ENTRY_CLOSE = '登録締切';
export const LABEL_SALES_CLOSE = '発売締切';

/** ★締め切ったか。★発走の時刻か 今の時刻が分からなければ 偽（★分からないときに「締め切った」と言わない） */
export function salesClosedAt(scheduledAtMs: number | null, nowMs: number | null): boolean {
  if (scheduledAtMs === null || nowMs === null || !Number.isFinite(scheduledAtMs)) return false;
  return nowMs >= salesCloseAtMs(scheduledAtMs);
}
