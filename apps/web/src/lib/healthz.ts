/**
 * ★**`/api/healthz` の中身を組み立てる**（★2026-09-28・移行 `0092`・レビュー側の決定 (ii)）
 *
 * ★これまでの項（★画面の sha・枝・環境・時刻）に ★**ワーカーの版と最後の周の時刻**を足します。
 *
 * 🔴 ★**healthz は 配備の確認の口です。★DB のせいで落とさない**（★レビュー側の条件）。
 *   ★ワーカーの項は ★best-effort: ★読めなければ `worker: null`。★既存の項は ★必ず返し、★呼ぶ側は ★必ず 200 を返します。
 *   ★待つのも ★短く（`WORKER_READ_TIMEOUT_MS`）。★DB が遅くても ★配備の確認を待たせません。
 *   ★網 `apps/cli/test/healthz-worker.test.ts` が ★読めない・遅い・形が違う の 3 つで ★既存の項が残ることを見ます。
 */
export const WORKER_READ_TIMEOUT_MS = 1500;

/**
 * ★**この画面の版**（★Vercel が自動で入れる値だけ・★人が設定しない）。★healthz と ★画面の印（`layout.tsx` の `star-build`）が ★この 1 か所を読む。
 *   ★2026-09-28: ★オーナーの画面写しが 現行と違い、★配信物の束を読んで「古いタブ」と確かめるまで 推測で止まった。★印があれば 画面から版が読める。
 */
export function buildStampOf(env: Readonly<Record<string, string | undefined>>): { readonly sha: string | null; readonly ref: string | null; readonly env: string | null } {
  return {
    sha: env['VERCEL_GIT_COMMIT_SHA'] ?? null,
    ref: env['VERCEL_GIT_COMMIT_REF'] ?? null,
    env: env['VERCEL_ENV'] ?? null,
  };
}

export interface WorkerBeat {
  readonly sha: string;
  readonly lastCycleAt: string;
}

export interface HealthBody {
  readonly sha: string | null;
  readonly ref: string | null;
  readonly env: string | null;
  readonly at: string;
  /** ★ワーカー（★読めなければ null） */
  readonly worker: WorkerBeat | null;
}

/** ★`worker_heartbeat()` の返り値の形を確かめる（★形が違えば null・★余計な列を画面に流さない） */
export function workerBeatOf(rows: unknown): WorkerBeat | null {
  const row = Array.isArray(rows) ? rows[0] : null;
  if (row === null || typeof row !== 'object') return null;
  const sha = (row as Record<string, unknown>)['release_sha'];
  const last = (row as Record<string, unknown>)['last_cycle_at'];
  if (typeof sha !== 'string' || typeof last !== 'string') return null;
  return { sha, lastCycleAt: last };
}

/**
 * ★組み立てる。★`readWorker` が投げても ★遅くても ★既存の項は返す。
 * ★`now` は 呼ぶ側が渡す（★時計を注入・憲法 4）。
 */
export async function healthBody(
  env: { readonly sha: string | null; readonly ref: string | null; readonly env: string | null },
  now: Date,
  readWorker: (signal: AbortSignal) => Promise<unknown>,
): Promise<HealthBody> {
  let worker: WorkerBeat | null = null;
  const ctl = new AbortController();
  const timer = setTimeout(() => { ctl.abort(); }, WORKER_READ_TIMEOUT_MS);
  try {
    const rows = await Promise.race([
      readWorker(ctl.signal),
      new Promise<never>((_, reject) => { ctl.signal.addEventListener('abort', () => { reject(new Error('timeout')); }); }),
    ]);
    worker = workerBeatOf(rows);
  } catch {
    worker = null;
  } finally {
    clearTimeout(timer);
  }
  return { ...env, at: now.toISOString(), worker };
}
