/**
 * ★**本番のワーカーが 画面より後ろにいるとき、★その差に ワーカーに効く変更が在るか**（★読むだけ・2026-09-29・レビュー側）
 *
 * 【★なぜ】 ★手順書 ⑥ の記録（★b583ce2..71e7d9c・5643601..9d9689d）を ★毎回 手で数えていた。★手の記録は 次の push で腐る。
 * 【★何をする】
 *   ① ★本番の `/api/healthz` から ★画面の sha と ★ワーカーの sha を取る（★`--base` 必須・既定を置かない）
 *   ② ★ワーカーの sha が 画面の sha の祖先かを確かめる（★違えば 数えられない）
 *   ③ ★その範囲で ★ワーカーが読む所（★`tools/lib/worker-lag.mjs`・★package.json の依存から作り import で絞る）・★移行・★依存と配備の道具に触るコミットを数える
 *
 * 使い方: node tools/verify-worker-lag.mjs --base https://star-two-chi.vercel.app
 *   ⚠️ ★先に `git fetch origin`（★ローカルに無い sha は 数えられない ＝ 終了コード 2）
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';
import { EXIT_MEANING, lagReport, workerPackageDirs } from './lib/worker-lag.mjs';

const i = process.argv.indexOf('--base');
const BASE = i < 0 ? null : process.argv[i + 1];
if (!BASE) {
  console.error('★--base <本番の URL> を渡してください（★既定を置きません）');
  console.log(EXIT_MEANING);
  process.exit(2);
}

const ROOT = process.cwd();
const git = (args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' });
const gitOk = (args) => { try { execFileSync('git', args, { cwd: ROOT, stdio: 'ignore' }); return true; } catch { return false; } };

const importsOf = (relDir) => {
  const names = new Set();
  const walk = (abs) => {
    if (!existsSync(abs)) return;
    for (const n of readdirSync(abs)) {
      const p = path.join(abs, n);
      if (statSync(p).isDirectory()) { if (n !== 'node_modules') walk(p); continue; }
      if (!/\.(ts|tsx|mjs|js)$/.test(n)) continue;
      for (const m of readFileSync(p, 'utf8').matchAll(/from\s+'(@star\/[a-z-]+)/g)) names.add(m[1]);
    }
  };
  walk(path.join(ROOT, relDir));
  return names;
};
const fsIo = {
  readJson: (rel) => { try { return JSON.parse(readFileSync(path.join(ROOT, rel), 'utf8')); } catch { return null; } },
  listDirs: (rel) => readdirSync(path.join(ROOT, rel)).filter((n) => statSync(path.join(ROOT, rel, n)).isDirectory()),
  importsOf,
};

/**
 * ★healthz の `worker` は ★**設計上 null になりうる**（★1.5 秒で読めなければ null・DB のせいで healthz を落とさない）。
 *   → ★null なら ★1 度だけ数秒おいて読み直す（★2026-09-30・レビュー側）。★2 回とも null は ★分からない（2）。
 *   🔴 ★黙って再試行しない: ★「1 回目 null・2 回目 …」を ★両方 出す（★本当に止まりかけているときに気づけるように）。
 */
const RETRY_WAIT_MS = 3000;
const readShas = async () => {
  try {
    const res = await fetch(new URL('/api/healthz', BASE), { cache: 'no-store' });
    const body = await res.json();
    return { web: typeof body?.sha === 'string' ? body.sha : null, worker: typeof body?.worker?.sha === 'string' ? body.worker.sha : null };
  } catch (e) {
    console.log(`★healthz を読めませんでした: ${e instanceof Error ? e.message : String(e)}`);
    return { web: null, worker: null };
  }
};
let shas = await readShas();
if (shas.worker === null) {
  console.log(`★1 回目: healthz の worker が null（★設計上ありうる）→ ${RETRY_WAIT_MS / 1000} 秒おいて 1 度だけ読み直します`);
  await new Promise((r) => setTimeout(r, RETRY_WAIT_MS));
  shas = await readShas();
  console.log(shas.worker === null
    ? '★2 回目: また null（★2 回とも null ＝ 分からない・ワーカーが止まりかけていないか見ること）'
    : `★2 回目: OK（worker ${shas.worker.slice(0, 7)}）`);
}

const dirs = workerPackageDirs(fsIo);
const report = lagReport(shas, {
  has: (sha) => gitOk(['cat-file', '-e', `${sha}^{commit}`]),
  isAncestor: (a, b) => gitOk(['merge-base', '--is-ancestor', a, b]),
  log: (range, paths) => git(['log', '--oneline', range, ...(paths.length ? ['--', ...paths] : [])]).split('\n').filter((l) => l.trim() !== ''),
}, dirs);

console.log(`★画面 ${shas.web ? shas.web.slice(0, 7) : '？'} ／ ★ワーカー ${shas.worker ? shas.worker.slice(0, 7) : '？'}`);
console.log(`★ワーカーが読む所: apps/worker・${dirs.join('・')}（★package.json の依存から作り import で絞った）`);
if (report.range !== null) {
  console.log(`★範囲 ${report.range.split('..').map((s) => s.slice(0, 7)).join('..')}: ${report.total} コミット`);
  const list = (label, rows) => { console.log(`  ${label}: ${rows.length} 件`); for (const r of rows) console.log(`    ${r}`); };
  list('★ワーカーが読む所に触る', report.worker);
  list('★移行（db/migrations）', report.migrations);
  list('★依存・配備の道具（package.json・package-lock.json・tools/deploy.sh）', report.deploy);
}
console.log(`→ ${report.why}`);
console.log('★射程: この数は healthz が返した worker.sha からの範囲。★ローカルの git に無い sha なら 数えられない（★先に git fetch）');
console.log(EXIT_MEANING);
process.exit(report.code);
