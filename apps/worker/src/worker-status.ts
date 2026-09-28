/**
 * ★**ワーカーの版と周の記録を DB に書く**（★2026-09-28・移行 `0092`・レビュー側の決定 (ii)）
 *
 * 【なぜ】
 *   ★本番のワーカーの版は ★VPS に入らないと分かりませんでした。★`/api/healthz` が ★`worker_heartbeat()` で読めるようにします。
 *
 * 【版の出どころ】
 *   ★systemd の `WorkingDirectory=/opt/star-current`。★`deploy.sh` が その先を ★`/opt/star-releases/<40 桁の sha>/` に張り替えます。
 *   ★作業フォルダの実体の ★末尾を読みます。★40 桁の 16 進でなければ ★`'unknown'`（★分からないときに嘘を書かない）。
 *   ★deploy.sh は変えません。
 *
 * ⚠️ ★書けなくても ★周は止めません（★記録は本業ではない）。★呼ぶ側が失敗を 1 行 出すだけ。
 */
import { realpathSync } from 'node:fs';
import path from 'node:path';

export const WORKER_STATUS_NAME = 'star-worker';
const SHA_RE = /^[0-9a-f]{40}$/;

/** ★作業フォルダの実体（★`/opt/star-releases/<sha>`）から ★版を読む。★読めない・形が違えば 'unknown' */
export function releaseShaOf(dir: string): string {
  let real = dir;
  try { real = realpathSync(dir); } catch { return 'unknown'; }
  const base = path.basename(real);
  return SHA_RE.test(base) ? base : 'unknown';
}

/** ★周の記録（★1 行を upsert）。★`last_cycle_at` は ★DB の now()（★ワーカーの時計を信じない） */
export interface StatusQuery {
  query(text: string, values?: readonly unknown[]): Promise<unknown>;
}
export async function recordWorkerStatus(
  db: StatusQuery,
  row: { readonly releaseSha: string; readonly startedAtIso: string; readonly cycleMs: number; readonly cyclePct: number },
): Promise<void> {
  await db.query(
    `insert into worker_status (name, release_sha, started_at, last_cycle_at, cycle_ms, cycle_pct)
     values ($1, $2, $3, now(), $4, $5)
     on conflict (name) do update
       set release_sha = excluded.release_sha, started_at = excluded.started_at,
           last_cycle_at = now(), cycle_ms = excluded.cycle_ms, cycle_pct = excluded.cycle_pct`,
    [WORKER_STATUS_NAME, row.releaseSha, row.startedAtIso, Math.max(0, Math.round(row.cycleMs)), Math.round(row.cyclePct * 10) / 10],
  );
}
