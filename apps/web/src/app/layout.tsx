import './globals.css';
import './story-theme.css';
import { StoryShell } from '../components/story-shell';
import { ConnectedBanner } from '../components/connected-banner';
import { buildStampOf } from '../lib/healthz';

/**
 * ★`star-build` ＝ ★この HTML を作った版（★healthz と同じ出どころ `buildStampOf`・2026-09-28・レビュー側）。
 *   ★古いタブを開いたままの人は ★古い印のまま。★healthz の sha と比べれば ★どの版を見ているかが分かる。
 */
export const metadata = {
  title: '馬物語',
  description: '育てる。走る。つながっていく。オンライン競馬育成ゲーム',
  other: { 'star-build': buildStampOf(process.env).sha ?? 'unknown' },
};

/**
 * ★**viewport を明示します**（★2026-09-27・裁定 `REVIEW_UI_AUDIT_20260927.md` 追記）。
 *   ★値は ★Next（App Router）が ★宣言の無いときに入れていた既定と ★**同じ**です（★見た目は動きません）。
 *   ✔ ★明示する前に ★配信された `<head>` を読みました（★`next start`・`/` `/home` `/login` `/race` `/stable`）:
 *     ★`<meta name="viewport" content="width=device-width, initial-scale=1"/>`
 *   ★暗黙のままだと ★誰かが別の値を書いた日に ★**全画面が黙って組み替わります**（★モバイルの `.show-narrow` などが前提にしている）。
 *   ★網 `viewport-declared.test.ts` が ★この値を見ます。
 */
export const viewport = { width: 'device-width', initialScale: 1 };

/**
 * ★グローバルヘッダー（アーケード筐体テーマ: design/hud-ds/components/program-board［アーケード］の実装表）
 *   青グロス帯 h56・下辺 3px 濃青／ロゴ 20px 字間 .22em 黄金＋影／ナビは錠剤（現在地 白地・青字）
 *   右に EP と PP を**別々の**カプセル（白＝EP／金＝PP）で表示（合算しない・憲法 §0.2）— ログイン導入まで表示しない
 *   `/`（未ログインの LP）ではナビと右端のボタンが LP 用に変わる（components/nav.tsx）
 *   HUD（/race のキャンバス）は暗色系のまま。body の data-theme="arcade" は DOM 画面用
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body data-theme="arcade">
        {/* Supabase が未許可の redirectTo を Site URL に戻した場合も、復旧リンクを受け取る。
            ハッシュはサーバーに送られないため、他のクライアントが読む前に移動する。 */}
        <script dangerouslySetInnerHTML={{ __html: `
          (() => {
            if (window.location.pathname !== '/') return;
            const hash = window.location.hash;
            if (!hash) return;
            const params = new URLSearchParams(hash.slice(1));
            if (params.get('type') !== 'recovery' || !params.has('access_token') || !params.has('refresh_token')) return;
            window.location.replace('/reset-password' + hash);
          })();
        ` }} />
        <StoryShell>{children}</StoryShell>
        {/* ★いまどこに繋いでいるかの帯（★本番の配信では出ない・裁定 §14） */}
        <ConnectedBanner />
      </body>
    </html>
  );
}
