// @ts-check
/**
 * ★**画面を作る（★直で流す用）**（★2026-09-25・裁定 `REVIEW_OWNER_SCOPE_AND_STUD_FEE_20260925.md` §7）
 *
 *   npm run build:web                      … ★`.next`（★Vercel と同じ出力先）
 *   STAR_NEXT_DIST_DIR=.next-staging npm run build:web   … ★別の出力先（★dev を落とさずに確かめる）
 *
 * 【🔴 ★なぜ道具を挟むか】
 *   ★`next build` は ★**追跡ファイル 2 つを書き換えます**（★`tools/lib/next-rewrites.mjs` の註記）。
 *   ★門（`tools/gate.mjs`）は ★2026-09-21 から写して戻していましたが、
 *   🔴 ★**門を通らない `npm run build:web` は 守られていませんでした。**
 *   ★2026-09-25、★それで `apps/web/tsconfig.json` が汚れ、★未コミット 56 件の山に混ざりました。
 *   → ★★**直で流す道も、★同じ部品を通します。**
 *
 * ⚠️ ★**素の `next build` は `build:web:raw` に残してあります。**
 *    ★門はそれを ★自分で写して戻しながら呼びます（★写し＋戻しは 1 か所・D-052）。
 *
 * 【⚠️ ★dev が動いているときに `.next` へ作らないこと】
 *   ★開発サーバーと ★`next build` は ★**同じ `.next` を奪い合います**（★オーナーの画面が落ちます）。
 *   → ★そのときは ★`STAR_NEXT_DIST_DIR=.next-staging` を渡してください（★`.gitignore` 済み）。
 */

import { spawnSync } from 'node:child_process';
import { withNextRewritesRestored } from './lib/next-rewrites.mjs';

const dist = process.env['STAR_NEXT_DIST_DIR'] ?? '.next';
process.stdout.write(`★画面を作ります（出力先 ${dist}）\n`);

const { code, restored } = withNextRewritesRestored(() => {
  const r = spawnSync('npm', ['run', 'build:web:raw'], { stdio: 'inherit', shell: true });
  /** ★シグナルで死んだときは 0 を返しません（★`status` が null になります） */
  return r.status ?? 1;
});

if (restored.length === 0) {
  process.stdout.write('  ✅ ★追跡ファイルは汚れていません\n');
}
process.exit(code);
