/**
 * ★**`next build` が書き換える追跡ファイルを、★写して・戻す**（★**R-28** の後始末・2026-09-25）
 *   ★裁定 `REVIEW_OWNER_SCOPE_AND_STUD_FEE_20260925.md` §7
 *
 * 【🔴 ★なぜ部品に出したか — ★2 回目だから】
 *   ★1 回目（★2026-09-21・`0dc003d`）: ★門に `build:web` を入れた初回で、★作業ツリーが汚れました。
 *     ★→ ★`tools/gate.mjs` の中に ★写し＋書き戻しを ★**直に書いて**塞ぎました。
 *   ★2 回目（★2026-09-25・この便）: 🔴 ★**門を通さずに `npm run build:web` を直で流したので、★また汚れました。**
 *     ★`apps/web/tsconfig.json` の `include` に ★`.next-gate/types` `.next-staging/types` が積もり、
 *     ★★**未コミット 56 件の山に混ざりました**（★共有ツリーなので特に重い・CLAUDE.md）。
 *   → ★★**門の中に書いた守りは、★門を通らない道を守りません。**
 *     ★同じ形の 2 回目なので ★**部品にしました**（★簿 `RETURNS-TABLE-COLUMN-SHADOW` と同じ作法）。
 *
 * 【🔴 ★なぜ「汚れたまま」が危ないか — ★本番を壊す形です】
 *   ★`next build` は ★出力先（`STAR_NEXT_DIST_DIR`）に合わせて ★**追跡ファイルを書き換えます**:
 *     ★`apps/web/next-env.d.ts` … ★`./.next/types/routes.d.ts` の行を ★その出力先へ
 *     ★`apps/web/tsconfig.json` … ★`include` に ★その出力先の `types/**` を足す（★並びも変える）
 *   🔴 ★それを ★**commit すると、★Vercel が使う `.next` ではない道を指します。**
 *     ★★門を守るために入れたものが、★本番を壊します。
 *
 * 【⚠️ ★`git checkout` は使いません】
 *   ★人が意図して直した内容まで巻き戻す恐れがあります。★**写しは「直前の実物」**です。
 *   ★戻したときは ★**必ず言います**（★黙って戻すのも、★黙って汚すのと同じ・R-27）。
 *
 * ⚠️ ★**控えはメモリに置いています。** ★`snapshot-file.mjs`（SB-6・プロセスの外）は使いません。
 *    ★理由: ★ここで失うのは ★**`next build` が作り直せる 2 ファイルだけ**で、
 *    ★`git checkout HEAD --` でいつでも戻せます（★馬の所属厩舎のような ★戻せない値ではない）。
 *    🔴 ★ただし ★**殺されると汚れたまま残ります。** ★そのとき何が残るかは下の `NEXT_REWRITES` です。
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';

/**
 * ★**`next build` が書き換える追跡ファイル**。
 * ⚠️ ★増えたら ★ここに足すこと（★`tool-aftermath` の `build-web.mjs` の項が この一覧を指しています）。
 */
export const NEXT_REWRITES = ['apps/web/next-env.d.ts', 'apps/web/tsconfig.json'];

/**
 * ★**写して・走らせて・戻す**。
 *
 * @param {() => number} run ★ビルドを走らせて ★終了コードを返す関数
 * @param {(line: string) => void} [say] ★戻したことを言う口（★既定は標準出力）
 * @returns {{ code: number, restored: string[] }} ★終了コードと ★戻したファイル
 */
export function withNextRewritesRestored(run, say) {
  const tell = say ?? ((line) => process.stdout.write(line));
  const before = new Map();
  for (const f of NEXT_REWRITES) {
    if (existsSync(f)) before.set(f, readFileSync(f, 'utf8'));
  }

  /** ★戻したファイル（★`finally` の中で詰めるので、★`try` の外で宣言します） */
  const restored = [];

  /**
   * ⚠️ ★**`finally` で戻します。** ★ビルドが落ちても・★投げても ★汚したままにしません
   *    （★1 回目の直しは ★**落ちた場合を通っていませんでした** — ★`npmRun` の戻り値だけを見ていた）。
   */
  try {
    const code = run();
    return { code, restored };
  } finally {
    for (const [f, text] of before) {
      if (!existsSync(f)) continue;
      if (readFileSync(f, 'utf8') === text) continue;
      writeFileSync(f, text);
      restored.push(f);
    }
    if (restored.length > 0) {
      tell(`  ⚠️ ★next build が書き換えたので戻しました: ${restored.join(' / ')}\n`);
      tell('     ★（この 2 つを commit すると、★Vercel が使う `.next` ではない道を指します）\n');
    }
  }
}
