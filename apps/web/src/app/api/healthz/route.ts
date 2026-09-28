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
 * 【★DB には ★1 つだけ触ります（★2026-09-28・移行 `0092`）】★`worker_heartbeat()` を anon で呼び、★ワーカーの版と最後の周の時刻を足します。
 *   ★**best-effort**: ★読めなければ `worker: null`。★既存の項と 200 は ★必ず返します（★`lib/healthz.ts`）。
 *   ★秘密を出しません（★SHA・枝の名前・環境名・ワーカーの SHA と最後の周の時刻だけ・★exposure-registry に登録）。
 *
 * 確かめ方: `npx tsx tools/verify-deployed-build.mjs --base <本番URL>`
 */

import { healthBody } from '../../../lib/healthz';

/** ★毎回作り直す（★キャッシュされた古い SHA を返しては意味がありません） */
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(): Promise<Response> {
  const body = await healthBody(
    {
      sha: process.env['VERCEL_GIT_COMMIT_SHA'] ?? null,
      ref: process.env['VERCEL_GIT_COMMIT_REF'] ?? null,
      env: process.env['VERCEL_ENV'] ?? null,
    },
    new Date(),
    async (signal) => {
      const url = process.env['NEXT_PUBLIC_SUPABASE_URL'];
      const key = process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'];
      if (!url || !key) throw new Error('supabase env missing');
      const res = await fetch(`${url}/rest/v1/rpc/worker_heartbeat`, {
        method: 'POST', signal, cache: 'no-store',
        headers: { apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json' },
        body: '{}',
      });
      if (!res.ok) throw new Error(`worker_heartbeat ${res.status}`);
      return res.json();
    },
  );
  return Response.json(body, { status: 200, headers: { 'cache-control': 'no-store' } });
}
