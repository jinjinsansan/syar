/**
 * ★**門を流した後、★作業ツリーが汚れていないこと**（★簿 `CI-DIRTY-TREE-UNSEEN`・2026-09-21）
 *
 *   ★分類: **READONLY**（★`git` に訊くだけ。★1 行も書きません）
 *
 * ============================================================================
 * 【🔴 ★なぜ要るか】
 *   ★2026-09-21、★門に `build:web` を入れた 1 回目で ★`git status` に 2 件 出ました
 *   （★`next build` が `next-env.d.ts` と `tsconfig.json` を distDir に合わせて書き換える）。
 *   ★★そのまま commit すると、★Vercel（`.next`）が参照できない道を指します。
 *   ★★**門を守るために入れたものが、★本番を壊す道を作っていました。**
 *
 *   ✅ ★その 1 件は `gate.mjs` が塞ぎました。🔴 ★**次に「作る」段を足す人は、同じ穴を作ります。**
 *
 * 【⚠️ ★なぜ手元の門に入れず、★CI に置くか】
 *   ★手元のツリーには ★**作業中の変更が常にあります**（★いまも 20 件ほど）。
 *   → ★手元で課すと ★**毎回 落ちて、★誰も読まなくなります**。
 *   ★CI は ★**新しいクローン**なので、★門を流した後に汚れていたら ★**それは道具のせい**です。
 *
 * 【★判定（★`CK-14` — ★空を合格と読ませない）】
 *   ★① ★git が見えている（★`git ls-files` が 1 件以上）… ★**0 なら判定不能**
 *   ★② ★`git status --porcelain` に、★許した道以外が無い
 *   ⚠️ ★判定の中身は ★**純関数**（`lib/clean-tree.mjs`）で、★`apps/cli/test/clean-tree.test.ts` が
 *     ★きれいな場合・汚れた場合・★git が答えない場合の ★**3 通りを回します**。
 *     ★★CI の中でしか試せない判定は、★CI が落ちた日にしか直せません。
 *
 * ★使い方: node tools/verify-clean-tree.mjs
 * ============================================================================
 */
import { spawnSync } from 'node:child_process';

import { cleanTreeVerdict } from './lib/clean-tree.mjs';
import { exitWithVerdict, verdictOf } from './lib/counted-verdict.mjs';

/** ★git を呼ぶ。★落ちたら `null`（★「空」と区別します） */
function git(args) {
  const r = spawnSync('git', args, { encoding: 'utf8' });
  if (r.error !== undefined && r.error !== null) return null;
  if (r.status !== 0) return null;
  return r.stdout;
}

const tracked = git(['ls-files']);
const porcelain = git(['status', '--porcelain', '--untracked-files=all']);

console.log('# ★門を流した後、★作業ツリーが汚れていないか');
if (tracked === null || porcelain === null) {
  console.log('  🔴 ★git が答えません（★リポジトリの中で走っていない？）');
  exitWithVerdict(verdictOf({
    checked: 0, failed: 0, label: '★作業ツリーの汚れ',
    skipped: { '★git が答えなかった': 1 },
  }));
}

const trackedCount = tracked.split(/\r?\n/).filter((l) => l.length > 0).length;
const v = cleanTreeVerdict(porcelain, trackedCount);

console.log(`  ${v.ok ? '✓' : '🔴'} ${v.reason}`);
for (const line of v.dirty.slice(0, 20)) console.log(`      ${line}`);
if (v.dirty.length > 20) console.log(`      … ほか ${v.dirty.length - 20} 件`);
if (!v.ok && !v.undecidable) {
  console.log('');
  console.log('  ★直し方: ★書いた道具に ★**書き戻させる**こと'
    + '（★`gate.mjs` の `buildWeb()` が手本です）。');
  console.log('  ⚠️ ★`.gitignore` に足して黙らせるのは、★出力物のときだけ。'
    + '★**追跡ファイルを書き換える段は、★書き戻すのが正しい**です。');
}

exitWithVerdict(verdictOf({
  checked: v.undecidable ? 0 : 1,
  failed: v.ok ? 0 : 1,
  label: '★作業ツリーの汚れ',
  skipped: v.undecidable ? { '★git が追跡ファイルを返さなかった': 1 } : {},
}));
