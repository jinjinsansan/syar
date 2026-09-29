/**
 * ★**ワーカーの遅れを数える道具**（`tools/verify-worker-lag.mjs`・★2026-09-29・レビュー側）
 *
 * 【★見ている壊れ方】
 *   ① 🔴 ★worker が null なのに 0（★分からないを合格に数える）
 *   ② 🔴 ★祖先でない・ローカルに無い sha を 数えてしまう
 *   ③ 🔴 ★ワーカーの読む所に触る変更を 見落とす／★読まない依存（render）まで数える
 *   ④ 🔴 ★移行・依存の変更を 見落とす
 */
import { describe, it, expect } from 'vitest';
// @ts-expect-error ★道具の .mjs（型なし）
import { lagReport, workerPackageDirs, EXIT_MEANING, readShasWithRetry } from '../../../tools/lib/worker-lag.mjs';

type Git = { has: (s: string) => boolean; isAncestor: (a: string, b: string) => boolean; log: (range: string, paths: string[]) => string[] };
/** ★偽の git: ★コミットごとに触った所を持つ */
function fakeGit(commits: { id: string; paths: string[] }[], opts: { missing?: string; notAncestor?: boolean } = {}): Git {
  return {
    has: (s) => s !== opts.missing,
    isAncestor: () => opts.notAncestor !== true,
    log: (_range, paths) => commits
      .filter((c) => paths.length === 0 || c.paths.some((p) => paths.some((q) => p === q || p.startsWith(`${q}/`))))
      .map((c) => c.id),
  };
}
const DIRS = ['packages/betting', 'packages/sim-engine'];
const SHAS = { web: 'b'.repeat(40), worker: 'a'.repeat(40) };

describe('★差を数える（lagReport）', () => {
  it('★対照: 画面だけの変更なら 0（効く変更 0）', () => {
    const r = lagReport(SHAS, fakeGit([{ id: 'c1', paths: ['apps/web/src/x.tsx'] }, { id: 'c2', paths: ['tools/lib/open-findings.mjs'] }]), DIRS);
    expect(r.code).toBe(0);
    expect(r.total).toBe(2);
  });
  it('🔴 ③ ワーカーの読む所に触れば 1', () => {
    for (const p of ['apps/worker/src/main.ts', 'packages/betting/src/a.ts', 'packages/sim-engine/package.json']) {
      const r = lagReport(SHAS, fakeGit([{ id: 'c1', paths: [p] }]), DIRS);
      expect(r.code, p).toBe(1);
      expect(r.worker, p).toEqual(['c1']);
    }
  });
  it('🔴 ③ 読まない所（render・パッケージのテスト）は数えない', () => {
    const r = lagReport(SHAS, fakeGit([{ id: 'c1', paths: ['packages/render/src/a.ts'] }, { id: 'c2', paths: ['packages/betting/test/a.test.ts'] }]), DIRS);
    expect(r.code).toBe(0);
  });
  it('🔴 ④ 移行・依存・deploy.sh は 別に数えて 1', () => {
    expect(lagReport(SHAS, fakeGit([{ id: 'm', paths: ['db/migrations/0096_x.sql'] }]), DIRS)).toMatchObject({ code: 1, migrations: ['m'] });
    expect(lagReport(SHAS, fakeGit([{ id: 'd', paths: ['package-lock.json'] }]), DIRS)).toMatchObject({ code: 1, deploy: ['d'] });
    expect(lagReport(SHAS, fakeGit([{ id: 'd', paths: ['tools/deploy.sh'] }]), DIRS)).toMatchObject({ code: 1, deploy: ['d'] });
  });
  it('🔴 ① worker が null なら 2（★0 と読まない）', () => {
    expect(lagReport({ web: SHAS.web, worker: null }, fakeGit([]), DIRS).code).toBe(2);
    expect(lagReport({ web: null, worker: SHAS.worker }, fakeGit([]), DIRS).code).toBe(2);
  });
  it('🔴 ② 祖先でない・ローカルに無い なら 2', () => {
    expect(lagReport(SHAS, fakeGit([], { notAncestor: true }), DIRS).code).toBe(2);
    expect(lagReport(SHAS, fakeGit([], { missing: SHAS.worker }), DIRS).code).toBe(2);
  });
  it('★終了コードの意味を 1 行で持つ', () => {
    expect(EXIT_MEANING).toMatch(/0 = .*1 = .*2 = /);
  });
});

describe('★ワーカーが読む所（workerPackageDirs）', () => {
  it('🔴 ③ 依存から作り import で絞る・依存の依存も辿る', () => {
    const pkgs: Record<string, { name: string; dependencies?: Record<string, string> }> = {
      'apps/worker/package.json': { name: '@t/worker', dependencies: { '@t/race-engine': '*', '@t/unused': '*' } },
      'packages/race-engine/package.json': { name: '@t/race-engine', dependencies: { '@t/sim-engine': '*', '@t/render': '*' } },
      'packages/sim-engine/package.json': { name: '@t/sim-engine' },
      'packages/render/package.json': { name: '@t/render' },
      'packages/unused/package.json': { name: '@t/unused' },
    };
    const imports: Record<string, string[]> = {
      'apps/worker/src': ['@t/race-engine'],
      'packages/race-engine/src': ['@t/sim-engine'],
    };
    const dirs = workerPackageDirs({
      readJson: (rel: string) => pkgs[rel] ?? null,
      listDirs: () => ['race-engine', 'sim-engine', 'render', 'unused'],
      importsOf: (rel: string) => new Set(imports[rel] ?? []),
    }, '@t/');
    expect(dirs).toEqual(['packages/race-engine', 'packages/sim-engine']);
  });
});

/**
 * ⑤ ★healthz の worker は ★設計上 null になりうる（★1.5 秒で読めなければ null）→ ★1 度だけ読み直す（★2026-09-30・レビュー側）。
 *   ★偽の healthz を渡して ★本物の `readShasWithRetry` を通す（★待ちは 0）。
 */
describe('★worker: null は 1 度だけ読み直す（★両方を出す）', () => {
  type Shas = { web: string | null; worker: string | null };
  const run = async (bodies: unknown[]): Promise<{ shas: Shas; reads: number; sleeps: number[]; lines: string[] }> => {
    let reads = 0;
    const sleeps: number[] = [];
    const lines: string[] = [];
    const shas = await readShasWithRetry(
      async () => { const b = bodies[Math.min(reads, bodies.length - 1)]; reads += 1; if (b instanceof Error) throw b; return b; },
      async (ms: number) => { sleeps.push(ms); },
      (line: string) => { lines.push(line); },
      0,
    ) as Shas;
    return { shas, reads, sleeps, lines };
  };
  const WEB = 'a'.repeat(40);
  const WORKER = 'b'.repeat(40);

  it('🔴 ⑤-1 1 回目 null・2 回目 sha → 読み直しは 1 回・両方の行を出す・sha を返す', async () => {
    const r = await run([{ sha: WEB, worker: null }, { sha: WEB, worker: { sha: WORKER } }]);
    expect(r.reads).toBe(2);
    expect(r.sleeps).toEqual([0]);
    expect(r.shas).toEqual({ web: WEB, worker: WORKER });
    expect(r.lines.some((l) => l.startsWith('★1 回目: healthz の worker が null'))).toBe(true);
    expect(r.lines.some((l) => l.startsWith('★2 回目: OK（worker bbbbbbb）'))).toBe(true);
  });

  it('🔴 ⑤-2 2 回とも null → 読み直しは 1 回だけ（★3 回目を読まない）・lagReport は 分からない（2）', async () => {
    const r = await run([{ sha: WEB, worker: null }, { sha: WEB, worker: null }, { sha: WEB, worker: { sha: WORKER } }]);
    expect(r.reads, '★読み直しは 1 回だけ').toBe(2);
    expect(r.shas.worker).toBeNull();
    expect(r.lines.some((l) => l.startsWith('★2 回目: また null'))).toBe(true);
    const report = lagReport(r.shas, { has: () => true, isAncestor: () => true, log: () => [] }, []);
    expect(report.code).toBe(2);
  });

  it('🔴 ⑤-3 1 回目で読めたら 読み直さない・何も出さない（★対照）', async () => {
    const r = await run([{ sha: WEB, worker: { sha: WORKER } }]);
    expect(r.reads).toBe(1);
    expect(r.sleeps).toEqual([]);
    expect(r.lines).toEqual([]);
  });

  it('🔴 ⑤-4 healthz が投げたら その旨を出し 1 度だけ読み直す', async () => {
    const r = await run([new Error('boom'), { sha: WEB, worker: { sha: WORKER } }]);
    expect(r.reads).toBe(2);
    expect(r.lines[0]).toContain('boom');
    expect(r.shas.worker).toBe(WORKER);
  });
});
