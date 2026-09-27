/**
 * ★**開発用の画面を 本番で塞ぐ関門**（★2026-09-27・裁定 `REVIEW_UI_AUDIT_20260927.md`「オーナー決裁」③）
 *
 * 【★なぜ要るか】
 *   ★絵・カメラ・映像の実験台などの開発用の画面が ★**本番で誰でも開けました**（★`middleware.ts` が在りませんでした）。
 *
 * 【★決まり（★裁定の条件）】
 *   (a) ★**サーバー側で判定**（★ここは Next.js の middleware・★クライアントの分岐ではない）
 *   (b) ★**秘密の URL に頼らない**（★本番では ★誰が来ても ★通さない）
 *   (c) ★通らない人には ★**存在しない URL と同じ 404**（★存在を明かさない）
 *   (e) ★塞いだ画面は ★「本番に無い」ので ★入口の簿の対象から落ちる
 *
 * ⚠️ ★`/design-check` は ★**ここに入れていません**（★裁定の条件 (d)「★ログイン＋許された利用者」）。
 *    ★この作品のログインは ★ブラウザの保存領域に在り（★`lib/supabase.ts` の `persistSession`）、
 *    ★**サーバーは誰がログインしているかを知りません** → ★サーバー側で判定できない（★照会中・簿 `DESIGN-CHECK-GATE-NEEDS-SERVER-SESSION`）。
 *
 * ⚠️ ★`matcher` は ★**書いた文字どおり**でなければ働きません（★Next.js が静的に読むため・★変数から組めない）。
 *    ★一覧は ★網 `apps/cli/test/dev-routes-gated.test.ts` が ★`DEV_ONLY_ROUTES` と突き合わせます。
 * ⚠️ ★`/watch` の関門は ★`/watch-race`（利用者の観戦の入口）に掛かりません（★`/watch/:path*` は区切りで判定）。
 */
import { NextResponse, type NextRequest } from 'next/server';

/** ★本番で塞ぐ開発用の画面（★網が `matcher` と 1 対 1 で見る） */
export const DEV_ONLY_ROUTES: readonly string[] = [
  '/art-lab', '/camera', '/course', '/race-next', '/race-quality-lab', '/race-world-lab',
  '/still', '/watch', '/lp-preview', '/lp-arcade',
];

export function middleware(request: NextRequest): NextResponse {
  if (process.env.NODE_ENV !== 'production') return NextResponse.next();
  /** ★存在しない URL と同じ 404 を返す（★not-found の画面に書き換える） */
  return NextResponse.rewrite(new URL('/__not-found__', request.url), { status: 404 });
}

export const config = {
  matcher: [
    '/art-lab/:path*', '/camera/:path*', '/course/:path*', '/race-next/:path*', '/race-quality-lab/:path*',
    '/race-world-lab/:path*', '/still/:path*', '/watch/:path*', '/lp-preview/:path*', '/lp-arcade/:path*',
  ],
};
