/**
 * ★**馬詳細の殻**（★引数を受け取って、★中身のクライアント部品へ渡すだけ）
 *
 * 【🔴 ★2026-09-25: ★本物のデータに絋ぎました】（★裁定 `REVIEW_DISCOVERY_AXES_20260925.md` §5）
 *   🔴 ★それまで ★**`demoStableRepo`**（★見本のデータ）を読んでいました。
 *     ★利用者が開ける画面で、★**他人の見本の馬が自分の馬のように出ていました**。
 *   ✔ ★`supabaseStableRepo.horse(id)` は ★**最初から在りました**（`stable-repo.ts:187`）。
 *     ★誰も絋いでいなかっただけです（★「仕組みは在る、誰も絋がなかった」の式）。
 *
 * 【★なぜ殻と中身に分けたか】
 *   ★`my_horses` は ★**ログインした本人の行だけ**を返すので（`where owner_id = auth.uid()`）、
 *   ★**セッションを持つ側（クライアント）**で読む必要があります。
 *   ⚠️ ★しかし ★`export const revalidate` は ★**クライアント部品に書けません**。
 *      ✔ ★2026-09-21 に ★`/stable` の `revalidate = 0` で ★**Vercel のビルドが落ち続け、
 *        ★本番が 31 コミット 古い版を配信していました**（★型検査は通ります）。
 *   → ★**殻はサーバー部品のまま**（★引数を解くだけ）、★読むのは中身に任せます
 *     （★`/odds/[id]` と同じ形）。
 *
 * ⚠️ ★**見た目は 1 行も変えていません。** ★JSX は ★機械で切り出して移しました（★打ち直していません）。
 *
 * 【★2026-10-01: ★中身を馬物語の画面の部品で組み直しました】（★R-26・引き渡し資料 D26-3 ②）
 *   ★殻はそのまま（★引数を解くだけ）。★見た目は ★中身（`horse-detail-view.tsx`）だけが持ちます。
 *   ★`shell-routes.ts` の `OWN_HEADER` は ★前方一致なので、★`/stable` が入れば ★ここも白い旧い枠から外れます。
 */
import { HorseDetailView } from './horse-detail-view';

export default async function HorsePage(
  { params }: { params: Promise<{ horseId: string }> },
): Promise<React.ReactElement> {
  const { horseId } = await params;
  return <HorseDetailView horseId={horseId} />;
}
