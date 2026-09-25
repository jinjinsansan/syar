/**
 * ★**コミットの前に通す門**（★2026-09-19）
 *
 * 【🔴 ★なぜ道具にするのか — ★手順では 3 回止まりませんでした】
 *   ① `3750f17` … ★`;` で繋いで、赤いままコミットした。→ ★「次からは `&&`」と決めた
 *   ② `5ddac8d` … ★`&&` で繋いだのに、赤いままコミットした。
 *      ★`npm run verify:red | tail -8 && git commit` — ★**パイプの終了コードは `tail` のもの**（常に 0）。
 *   ③ ★同じ日に ★`npm run typecheck | tail; echo $?` で ★**型検査の失敗を「合格」と報告**した。
 *
 *   → ★★**直すべきは接続詞でも心構えでもなく、「毎回 2 つのコマンドを正しく繋ぐ」という手順そのもの**でした。
 *     ★**繋ぐのをやめて、1 つのコマンドにします。**
 *
 * 【★この道具の約束】
 *   ★① ★**出力を切りません**（★切ると判定が切れる）
 *   ★② ★**自分の終了コードは、中の判定そのもの**（★最後の `echo` が成功して 0 になる形にしない）
 *   ★③ ★**何が落ちたかを言います**（★「不合格」だけ出して黙らない）
 *
 * 【★使い方】
 *   `npm run gate && git commit -F- <<'EOF' ... EOF`
 *   ★`npm run gate` に**パイプを付けないこと**。★付けたら ② の約束が無効になります。
 */

import { spawnSync } from 'node:child_process';
/** ★`next build` が書き換える追跡ファイルの写し＋書き戻し（★1 か所・D-052） */
import { withNextRewritesRestored } from './lib/next-rewrites.mjs';

/**
 * ★**`npx` を使いません。** ★Windows で `spawnSync npx.cmd EINVAL` になります
 *   （★`tools/verify-known-red.mjs` で踏んだのと同じ）。
 */
function run(label, args, extraEnv = {}) {
  process.stdout.write(`\n=== ${label} ===\n`);
  const r = spawnSync(process.execPath, args, {
    stdio: 'inherit', env: { ...process.env, ...extraEnv },
  });
  if (r.error !== undefined && r.error !== null) {
    process.stdout.write(`🔴 ${label}: 起動できません（${r.error.message}）\n`);
    return 1;
  }
  // ★シグナルで死んだ場合 status は null。★0 に丸めない
  return r.status === null ? 1 : r.status;
}

const NPM = process.platform === 'win32'
  ? [process.env['npm_execpath'] ?? 'npm']
  : [process.env['npm_execpath'] ?? 'npm'];

/**
 * ★`npm run <script>` を、★**npm の JS 本体を直接**動かして呼びます
 *   （★`npm.cmd` を spawn すると Windows で EINVAL になる経路があるため）。
 */
function npmRun(label, script, extraEnv = {}) {
  const exec = NPM[0];
  if (typeof exec === 'string' && exec.endsWith('.js')) {
    return run(label, [exec, 'run', script], extraEnv);
  }
  // ★`npm_execpath` が無い＝直接叩かれた。★shell 経由に落とす（★ここは判定に影響しない）
  process.stdout.write(`\n=== ${label} ===\n`);
  const r = spawnSync(exec ?? 'npm', ['run', script], {
    stdio: 'inherit', shell: true, env: { ...process.env, ...extraEnv },
  });
  return r.status === null ? 1 : r.status;
}

/**
 * 🔴 ★**配る物を先に作る**（★**CI-2**・2026-09-19・★CI の 1 回目で見つかった）。
 *
 * 【★何が起きたか】
 *   ★`selfcheck.test.ts` は ★**`dist/worker.cjs` と原本の出力が 1 文字も違わない**ことを見ます
 *   （★正典 **D-043**「配る物が原本と同じ」）。
 *   🔴 ★ところが `dist/` は ★**追跡されていません**（★作られるもの）。
 *   → ★**CI は新しいクローンなので存在せず、★1 回目で赤くなりました。**
 *     ★手元では ★**前に作ったものが残っていたから緑**でした。
 *
 * 【🔴 ★なぜ「飛ばす」ではいけないか】
 *   ★D-043 の本旨は ★**「配る物」が原本と同じ**ことです。
 *   → ★★**配る物を作らずに測るのは、測っていないのと同じ**です（★R-21）。
 *   → ★だから ★**門が先に作ります**。★検査の側を緩めません。
 *
 * ⚠️ ★**ここ（門）に置きます。★CI の設定には書きません。**
 *    ★向こうに書くと ★**手元と CI で門が 2 つ**になり、★片方だけ直ります（D-052）。
 *    ★`.github/workflows/gate.yml` が呼ぶのは `npm run gate` の 1 本だけ、を保ちます。
 */
/**
 * 🔴 ★**`next build` は、★追跡されているファイルを書き換えます**（★2026-09-21・★入れた直後に出ました）。
 *
 * ✅ ★**写し＋書き戻しは ★`tools/lib/next-rewrites.mjs` に出しました**
 *    （★2026-09-25・裁定 `REVIEW_OWNER_SCOPE_AND_STUD_FEE_20260925.md` §7）。
 *
 * 【🔴 ★なぜ出したか — ★門の中に書いた守りは、★門を通らない道を守らなかった】
 *   ★1 回目（`0dc003d`）は ★**ここに直に書いて**塞ぎました。
 *   ★2 回目（2026-09-25）は ★`npm run build:web` を ★**直で流して**同じことが起きました。
 *   → ★同じ形の 2 回目なので ★部品にし、★`tools/build-web.mjs`（★直で流す道）も ★同じ部品を通します。
 *   ★詳しい経緯と「なぜ commit すると本番を壊すか」は ★その部品の註記にあります。
 */
function buildWeb() {
  /**
   * ⚠️ ★**`build:web:raw`（素の `next build`）を呼びます。**
   *    ★`build:web` は ★`tools/build-web.mjs` を経由するので、★ここから呼ぶと ★写し＋戻しが二重になります。
   */
  const { code } = withNextRewritesRestored(
    () => npmRun('★画面を作る（build:web・R-28）', 'build:web:raw',
      { STAR_NEXT_DIST_DIR: '.next-gate' }),
  );
  return code;
}

const results = [
  ['★配る物を作る（dist/worker.cjs・D-043）', npmRun('★配る物を作る（dist/worker.cjs・D-043）', 'build:worker')],
  ['★型検査（tsc・strict）', npmRun('★型検査（tsc・strict）', 'typecheck')],
  /**
   * 🔴 ★**画面も作る**（★2026-09-21・レビュー側の裁定・★**R-28**）。
   *
   * 【★何が起きたか — ★数時間を誤診に使いました】
   *   ★`/stable` を `'use client'` にしたとき `export const revalidate = 0` を残しました。
   *   ★`npm run build:web` が落ちます。★★**Vercel は push のたびに作り直しを試み、**
   *   ★★**落ちるので最後に成功した版を配信し続けました**（★31 コミット 前・1 時間半）。
   *   ★オーナーの目には ★**「古いデザイン」**として出ました。
   *   🔴 ★型検査は通ります（★`revalidate = 0` は型として正しい `number`）。
   *   🔴 ★門にも `build:web` が在りませんでした。
   *   → ★★**門が緑で、★本番だけが作り直せない。** ★これは門の存在意義に関わります。
   *
   * 【⚠️ ★なぜ今まで入れなかったか、★どう解いたか】
   *   ★理由は ★**`next dev` と `.next` を奪い合う**ことでした（★オーナーの画面が落ちる）。
   *   ✅ ★**出力先を分けて解きました**: ★`STAR_NEXT_DIST_DIR=.next-gate`。
   *     ★`apps/web/next.config.mjs` が読みます。★**既定（`.next`）は変えていません** —
   *     ★Vercel はこの環境変数を設定しないので、★**本番の作り方は 1 文字も変わりません**。
   *
   * ⚠️ ★**静的な網（`client-page-segment-config.test.ts`）は残します。**
   *    ★網は ★**秒で落ちて原因を名指し**します。★ビルドは ★**2 分かかるが漏れません**。
   *    ★★どちらも要ります（★網が先に落ちれば、★2 分 待たずに原因が分かります）。
   */
  ['★画面を作る（build:web・R-28）', buildWeb()],
  ['★検査と赤の照合（vitest ＋ 登録簿）', npmRun('★検査と赤の照合（vitest ＋ 登録簿）', 'verify:red')],
  /**
   * 🔴 ★**まだ直っていない指摘の期限**（★**NT-3**・2026-09-19）。
   *   ★`REPORT_AUDIT_20260914.md` の 22 項目のうち ★**12 件が 5 日 そのまま**でした。
   *   ★報告書は期限を持ちません。★**期限を持たせ、切れたら門で落とします。**
   * ⚠️ ★数秒で終わります（★検査は流しません。★簿の期限を見るだけ）。
   */
  ['★開いている指摘の期限（NT-3）', npmRun('★開いている指摘の期限（NT-3）', 'verify:open')],
];

process.stdout.write('\n=== ★門の結果 ===\n');
let failed = 0;
for (const [label, code] of results) {
  process.stdout.write(`  ${code === 0 ? '✅' : '🔴'} ${label}（終了コード ${code}）\n`);
  if (code !== 0) failed += 1;
}

if (failed === 0) {
  process.stdout.write('\n✅ ★通りました。コミットしてよい状態です。\n');
  process.exit(0);
}
process.stdout.write(
  `\n🔴 ★${failed} 件が落ちました。★**コミットしないこと。**\n`
  + '   ★赤を直すか、★理由・担当・期限を書いて tools/lib/known-red.mjs に載せてください。\n',
);
process.exit(1);
