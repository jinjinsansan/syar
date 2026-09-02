/**
 * ★**いま動いているのがどのビルドかを、外から確かめる口**（正典 R-28）
 *
 * 【★なぜ要るか — ★2026-09-02 の事故】
 *   ★`main` が **13 日間** 2026-08-20 で止まっており、★本番はそこから作られていました。
 *   ★P4 の作業は ★**1 つも本番に出ていませんでした。**
 *   ★気づいたのは ★**オーナーが「ナレーターの絵が古い」と言ったから**です。
 *   ★それが無ければ、★開発側もレビュー側も気づけませんでした。
 *
 *   ⚠️ ★**検定も型も全部緑でした。** ★正典 R-28 が言うとおり、
 *      ★「リポジトリという名のプログラム」を測っていただけで、
 *      ★**本番が別のプログラムなら、ゲートは全部通ったまま本番だけが守られていません。**
 *
 * 【★なぜ環境変数を「設定してもらう」形にしないか】
 *   ⚠️ ★この案件には ★**既に同じ目的の仕掛けがありました**（2026-08-21・`NEXT_PUBLIC_BUILD_STAMP`）。
 *      ★ところが ★**どこにも設定されておらず**、★画面には `--:--:--` と出続けていました。
 *      ★**仕掛けはあり、実装され、注記もあり、それでも一度も動いていません**（R-16 の家族）。
 *   → ★**Vercel が自動で入れる値だけ**を読みます。★人が設定する手順を挟みません。
 *      ★`VERCEL_GIT_COMMIT_SHA` は Vercel が必ず入れます。
 *
 * 【★DB に触りません】★読むだけです。★秘密を出しません（★SHA と枝の名前と環境名だけ）。
 *
 * 確かめ方: `npx tsx tools/verify-deployed-build.mjs --base <本番URL>`
 */

/** ★毎回作り直す（★キャッシュされた古い SHA を返しては意味がありません） */
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export function GET(): Response {
  /**
   * ⚠️ ★**無いときは `null` を返します。** ★`'unknown'` のような文字を返すと、
   *    ★照合の道具が「文字列としては取れた」と読んで通してしまいます（R-3・判定不能は FAIL へ）。
   */
  const sha = process.env['VERCEL_GIT_COMMIT_SHA'] ?? null;
  const ref = process.env['VERCEL_GIT_COMMIT_REF'] ?? null;
  const env = process.env['VERCEL_ENV'] ?? null;
  return Response.json(
    { sha, ref, env, at: new Date().toISOString() },
    { headers: { 'cache-control': 'no-store' } },
  );
}
