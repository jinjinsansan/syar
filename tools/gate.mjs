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

/**
 * ★**`npx` を使いません。** ★Windows で `spawnSync npx.cmd EINVAL` になります
 *   （★`tools/verify-known-red.mjs` で踏んだのと同じ）。
 */
function run(label, args) {
  process.stdout.write(`\n=== ${label} ===\n`);
  const r = spawnSync(process.execPath, args, { stdio: 'inherit' });
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
function npmRun(label, script) {
  const exec = NPM[0];
  if (typeof exec === 'string' && exec.endsWith('.js')) {
    return run(label, [exec, 'run', script]);
  }
  // ★`npm_execpath` が無い＝直接叩かれた。★shell 経由に落とす（★ここは判定に影響しない）
  process.stdout.write(`\n=== ${label} ===\n`);
  const r = spawnSync(exec ?? 'npm', ['run', script], { stdio: 'inherit', shell: true });
  return r.status === null ? 1 : r.status;
}

const results = [
  ['★型検査（tsc・strict）', npmRun('★型検査（tsc・strict）', 'typecheck')],
  ['★検査と赤の照合（vitest ＋ 登録簿）', npmRun('★検査と赤の照合（vitest ＋ 登録簿）', 'verify:red')],
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
