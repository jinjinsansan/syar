/**
 * ★**ワーカーの版を SSH なしで確かめる口**（★2026-09-28・移行 `0092`・レビュー側の決定 (ii)）
 *
 * 【★見ている壊れ方】
 *   ① 🔴 ★**healthz が DB のせいで落ちる**（★配備の確認の口が 読めない・遅い・形が違う で 500 や空になる）
 *   ② 🔴 ★**関数が余計な値を返す**（★周の重さ・エラーの文言・env を混ぜる）／★definer が無くて anon で読めない／★public に execute が残る
 *   ③ ★**表を anon に開ける**（★表は閉じたまま・★読むのは関数の 2 つだけ）
 *   ④ ★**ワーカーが書かない**（★周の終わりの記録が抜ける）／★版を推測で書く（★40 桁でないのに sha と書く）
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { healthBody, workerBeatOf, WORKER_READ_TIMEOUT_MS } from '../../web/src/lib/healthz.js';
import { releaseShaOf, recordWorkerStatus } from '../../worker/src/worker-status.js';
// @ts-expect-error -- .mjs の素の JS を読む（型定義は置いていない・`exposure-registry.test.ts` と同じ作法）
import { EXPECTED_EXPOSURE, EXPECTED_FUNCTION_EXECUTE, CLOSED } from '../../../tools/lib/exposure-registry.mjs';

const ROOT = path.resolve(__dirname, '../../..');
const SQL = readFileSync(path.join(ROOT, 'db/migrations/0092_worker_heartbeat.sql'), 'utf8');
const ROUTE = readFileSync(path.join(ROOT, 'apps/web/src/app/api/healthz/route.ts'), 'utf8');
const MAIN = readFileSync(path.join(ROOT, 'apps/worker/src/main.ts'), 'utf8');
const ENV = { sha: 'a'.repeat(40), ref: 'main', env: 'production' };
const NOW = new Date('2026-09-28T00:00:00.000Z');
const SHA = 'b583ce289c6186f94aa3666af32db02511453823';

afterEach(() => { vi.useRealTimers(); });

describe('★① healthz は DB のせいで落ちない（★worker は best-effort）', () => {
  it('🔴 ★DB が落ちている（★投げる）: ★既存の項は返し、★worker は null', async () => {
    const b = await healthBody(ENV, NOW, () => Promise.reject(new Error('connection refused')));
    expect(b).toEqual({ ...ENV, at: NOW.toISOString(), worker: null });
  });

  it('🔴 ★DB が遅い（★返ってこない）: ★待ちは短く打ち切り、★既存の項は返す', async () => {
    vi.useFakeTimers();
    const p = healthBody(ENV, NOW, () => new Promise(() => { /* ★返らない */ }));
    await vi.advanceTimersByTimeAsync(WORKER_READ_TIMEOUT_MS + 1);
    const b = await p;
    expect(b.sha).toBe(ENV.sha);
    expect(b.worker).toBeNull();
    expect(WORKER_READ_TIMEOUT_MS, '★配備の確認を長く待たせない').toBeLessThanOrEqual(2000);
  });

  it('★形が違う・余計な列: ★2 つだけを取り出す（★余計な値を流さない）', () => {
    expect(workerBeatOf([])).toBeNull();
    expect(workerBeatOf({ release_sha: SHA })).toBeNull();
    expect(workerBeatOf([{ release_sha: SHA, last_cycle_at: null }])).toBeNull();
    expect(workerBeatOf([{ release_sha: SHA, last_cycle_at: '2026-09-28T00:00:00Z', cycle_pct: 28.9, secret: 'x' }]))
      .toEqual({ sha: SHA, lastCycleAt: '2026-09-28T00:00:00Z' });
  });

  it('★読めたら ★worker を足す（★対照）', async () => {
    const b = await healthBody(ENV, NOW, () => Promise.resolve([{ release_sha: SHA, last_cycle_at: '2026-09-28T00:00:00Z' }]));
    expect(b.worker).toEqual({ sha: SHA, lastCycleAt: '2026-09-28T00:00:00Z' });
  });

  it('🔴 ★画面の口は ★必ず 200・★読むのは worker_heartbeat の 1 つだけ', () => {
    expect(ROUTE).toContain("return Response.json(body, { status: 200, headers: { 'cache-control': 'no-store' } });");
    expect(ROUTE).toContain('await healthBody(');
    expect(ROUTE).toContain('/rest/v1/rpc/worker_heartbeat');
    expect(ROUTE, '★service role の鍵を使っている').not.toMatch(/SERVICE_ROLE/);
    expect(ROUTE.match(/\/rest\/v1\//g)?.length, '★他の表や関数を読んでいる').toBe(1);
  });
});

describe('★② 関数は 2 つだけを返し、★definer・search_path 固定・public から剥がす', () => {
  it('🔴 ★返すのは release_sha と last_cycle_at だけ', () => {
    expect(SQL).toMatch(/returns table \(release_sha text, last_cycle_at timestamptz\)/);
    const body = /as \$\$([\s\S]*?)\$\$/.exec(SQL)?.[1] ?? '';
    expect(body).toMatch(/select s\.release_sha, s\.last_cycle_at\s+from public\.worker_status s/);
    expect(body, '★周の重さを返している').not.toMatch(/cycle_pct|cycle_ms|started_at/);
  });

  it('🔴 ★security definer ＋ search_path 固定 ＋ public から剥がして anon / authenticated にだけ', () => {
    expect(SQL).toMatch(/security definer\s+set search_path = public, pg_temp/);
    expect(SQL).toContain('revoke all on function public.worker_heartbeat() from public;');
    expect(SQL).toContain('grant execute on function public.worker_heartbeat() to anon, authenticated;');
    expect(SQL, '★drop で権限が消える形').not.toMatch(/drop function/);
  });

  it('★登録簿: 関数は anon / authenticated に execute（★healthz と同じ 2 つを公開）', () => {
    expect(EXPECTED_FUNCTION_EXECUTE['worker_heartbeat()']).toEqual({ anon: true, authenticated: true });
  });
});

describe('★③ 表は閉じたまま', () => {
  it('🔴 ★表は RLS ・anon / authenticated から剥がす・★登録簿は closed', () => {
    expect(SQL).toContain('alter table worker_status enable row level security;');
    expect(SQL).toContain('revoke all on table worker_status from public, anon, authenticated;');
    expect(SQL, '★表に grant している').not.toMatch(/grant [a-z, ]+ on (table )?worker_status/);
    expect(SQL, '★公開ビューを作っている').not.toMatch(/create (or replace )?view/);
    expect(EXPECTED_EXPOSURE['worker_status']).toBe(CLOSED);
  });
});

describe('★④ ワーカーが周ごとに書く・★版を推測しない', () => {
  it('🔴 ★周の終わりに ★記録を書く（★書けなくても周は止めない）', () => {
    expect(MAIN).toMatch(/周の全体=[\s\S]{0,400}await recordWorkerStatus\(client, \{ releaseSha, startedAtIso, cycleMs: elapsed/);
    expect(MAIN).toMatch(/catch \(e\) \{\s*console\.error\('\[worker\] 版と周の記録に失敗:'/);
    expect(MAIN).toContain('const releaseSha = releaseShaOf(process.cwd());');
  });

  it('🔴 ★版は ★作業フォルダの実体の末尾・★40 桁でなければ unknown', () => {
    const base = mkdtempSync(path.join(tmpdir(), 'star-rel-'));
    const good = path.join(base, SHA);
    mkdirSync(good);
    expect(releaseShaOf(good)).toBe(SHA);
    const bad = path.join(base, 'not-a-sha');
    mkdirSync(bad);
    expect(releaseShaOf(bad)).toBe('unknown');
    expect(releaseShaOf(path.join(base, 'no-such-dir'))).toBe('unknown');
  });

  it('★記録は ★1 行の upsert・★最後の周の時刻は DB の now()', async () => {
    const calls: { text: string; values: readonly unknown[] | undefined }[] = [];
    await recordWorkerStatus({ query: (text, values) => { calls.push({ text, values }); return Promise.resolve(); } },
      { releaseSha: SHA, startedAtIso: '2026-09-28T00:00:00.000Z', cycleMs: 103912.4, cyclePct: 28.86 });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.text).toMatch(/on conflict \(name\) do update/);
    expect(calls[0]!.text).toMatch(/last_cycle_at = now\(\)/);
    expect(calls[0]!.values).toEqual(['star-worker', SHA, '2026-09-28T00:00:00.000Z', 103912, 28.9]);
  });
});
