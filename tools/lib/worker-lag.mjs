/**
 * ★**本番のワーカーが 画面より後ろにいるとき、★その差に ワーカーに効く変更が在るか**（★2026-09-29・レビュー側）
 * ★道具 `tools/verify-worker-lag.mjs` の中身（★git と 読み取りを注入して 網で確かめる）。
 *
 * 【★ワーカーが読む所】 ★手で並べない。★`apps/worker/package.json` の `@star/*` 依存から作り、
 *   ★ソースが実際に import しているものだけに絞る（★例: race-engine の package.json は @star/render を挙げるが ★ソースは読まない）。
 *   ★依存の依存も 同じ規則で辿る。
 */

/** ★終了コードの意味（★出力に毎回 1 行出す） */
export const EXIT_MEANING = '終了コード: 0 = 効く変更 0 ／ 1 = 要判断（効く変更か移行が在る） ／ 2 = 分からない（数えられない）';

/**
 * ★ワーカーが読むパッケージの置き場（`packages/<dir>`）を出す。
 * @param {{ readJson: (rel: string) => any, listDirs: (rel: string) => string[], importsOf: (relDir: string) => Set<string> }} fs
 * @param {string} scope ★作業領域のパッケージの頭（★網は別の頭で試す）
 * @returns {string[]} 例 ['packages/betting', …]
 */
export function workerPackageDirs(fs, scope = '@star/') {
  const byName = new Map();
  for (const d of fs.listDirs('packages')) {
    const pj = fs.readJson(`packages/${d}/package.json`);
    if (pj && typeof pj.name === 'string') byName.set(pj.name, `packages/${d}`);
  }
  const depsOf = (pkgJson) => Object.keys(pkgJson?.dependencies ?? {}).filter((n) => n.startsWith(scope));
  const out = new Set();
  const queue = [];
  const workerImports = fs.importsOf('apps/worker/src');
  for (const n of depsOf(fs.readJson('apps/worker/package.json'))) if (workerImports.has(n)) queue.push(n);
  while (queue.length > 0) {
    const n = queue.shift();
    const dir = byName.get(n);
    if (dir === undefined || out.has(dir)) continue;
    out.add(dir);
    const imports = fs.importsOf(`${dir}/src`);
    for (const m of depsOf(fs.readJson(`${dir}/package.json`))) if (m !== n && imports.has(m)) queue.push(m);
  }
  return [...out].sort();
}

/**
 * ★差を数える。
 * @param {{ web: string|null, worker: string|null }} shas ★healthz が返した値
 * @param {{ has: (sha: string) => boolean, isAncestor: (a: string, b: string) => boolean,
 *           log: (range: string, paths: string[]) => string[] }} git
 * @param {string[]} workerDirs
 */
export function lagReport(shas, git, workerDirs) {
  const unknown = (why) => ({ code: 2, why, range: null, total: 0, worker: [], migrations: [], deploy: [] });
  if (!shas.web) return unknown('★healthz が 画面の sha を返さない');
  if (!shas.worker) return unknown('★healthz が ワーカーの sha を返さない（★worker: null・★0 と読まない）');
  if (!git.has(shas.web)) return unknown(`★ローカルの git に 画面の sha ${shas.web.slice(0, 7)} が無い（★fetch してから）`);
  if (!git.has(shas.worker)) return unknown(`★ローカルの git に ワーカーの sha ${shas.worker.slice(0, 7)} が無い（★fetch してから）`);
  if (!git.isAncestor(shas.worker, shas.web)) return unknown('★ワーカーの sha が 画面の sha の祖先でない（★数えられない）');
  const range = `${shas.worker}..${shas.web}`;
  const total = git.log(range, []).length;
  const worker = git.log(range, [...workerDirs.flatMap((d) => [`${d}/src`, `${d}/package.json`]), 'apps/worker']);
  const migrations = git.log(range, ['db/migrations']);
  const deploy = git.log(range, ['package-lock.json', 'package.json', 'tools/deploy.sh']);
  const code = worker.length === 0 && migrations.length === 0 && deploy.length === 0 ? 0 : 1;
  return { code, why: code === 0 ? '★後ろだが 効く変更は 0' : '★配備の要否を判断', range, total, worker, migrations, deploy };
}
