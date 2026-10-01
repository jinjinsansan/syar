/**
 * Supabase クライアント（読み取り専用）
 *
 * ★anon キーだけを使います。service_role キーはフロントに置きません（RLS を素通りする）。
 *   §14.3 のとおり、ここは読み取り系だけです。
 */
import { createClient } from '@supabase/supabase-js';

/**
 * ★**ブラウザでは 1 つを使い回す**（★2026-10-01・オーナーの PC の console に
 *   「Multiple GoTrueClient instances detected」が ★305 個まで出ていた）。
 *   ★呼ぶたびに `createClient` していたので ★帯の 15 秒ごとの読み直しなどで 開いている間 増え続けた
 *   （★1 つずつ ログインの保存領域を見張り・更新の時計を持つ ＝ ★重くなる・★更新がぶつかりうる）。
 *   ★作り方（★引数）は 変えない（★読む結果は同じ）。★サーバー側（`window` が無い）では 従来どおり 毎回作る。
 */
/**
 * ★**読み取りの器は セッションを持たない**（★2026-10-01・裁定 `REVIEW_READCLIENT_SESSION_VERDICT_20261001.md`）。
 *   🔴 ★それまで ★既定値（★supabase-js の既定は `persistSession: true`・`autoRefreshToken: true`）で作っていて、
 *     ★註記の「セッションを持たない」は ★実装では守られていなかった（★2 つの器が 同じセッションを見張り・更新しあう）。
 *   ★先に洗った（★2026-10-01）: ★`readClient` で読むのは ★anon に許可された公開ビュー 8 つと `horse_starts`/`horse_wins` だけ
 *     （★`users`・`my_*`・台帳は ★すべて `authClient`）→ ★セッションを外しても 黙って空になる画面は無い。
 */
/**
 * ★**読み取りの器の保存領域の名前**（★2026-10-01・裁定 §3）。★既定は `sb-<ref>-auth-token`（★`authClient` と同じ）で、
 *   ★セッションを持たない設定にしても ★「Multiple GoTrueClient instances … under the same storage key」が 1 件 残った。
 *   ★名前を分けて ★2 つの器を 名前の上でも別物にする。
 */
export function readStorageKey(url: string): string {
  return `sb-${new URL(url).hostname.split('.')[0]}-read`;
}
const makeReadClient = (url: string, key: string) => createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: readStorageKey(url) },
});
let browserReadClient: ReturnType<typeof makeReadClient> | null = null;
let browserAuthClient: ReturnType<typeof makeAuthClient> | null = null;
const inBrowser = (): boolean => 'window' in globalThis;

export function readClient() {
  const url = process.env['NEXT_PUBLIC_SUPABASE_URL'];
  const key = process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'];
  // ★未設定を黙って空データで進めない。設定漏れが「レースが無い」に見えてしまう
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL / ANON_KEY が未設定です');
  if (inBrowser() && browserReadClient !== null) return browserReadClient;
  const client = makeReadClient(url, key);
  if (inBrowser()) browserReadClient = client;
  return client;
}

/**
 * ★セッションを持つクライアント（ログイン・登録・書き込み RPC 用）— D-113
 *
 * 【★`readClient()` と分ける理由】
 *   読み取り系（番組表・オッズ・記録）は**ログインしていなくても見られる**のが正典の立場で、
 *   `readClient()` は**セッションを持たない**。ここに `persistSession` を足すと、
 *   ★**読み取りの全経路にセッションが紛れ込み**、「ログインの有無で読み取りの結果が変わる」形になりうる。
 *   → **器を 2 つに分け、用途で呼び分ける。**
 *
 * 【★D-113（＝D-076 から引き継いだ制約）を守る】
 *   ① **自前で JWT を発行しない。セッションは Supabase Auth に発行させる**
 *      → ここは `@supabase/supabase-js` に任せるだけ。**トークンを組み立てるコードを書かない**
 *   ② **リフレッシュトークンの寿命管理を自前で抱えない**
 *      → `autoRefreshToken: true`（ライブラリに任せる）
 *   ③ **`auth.uid()` / RLS / 書き込み RPC は一切変更しない**
 *      → 呼ぶだけ。RPC の定義には手を入れない
 *
 * 【⚠️ service_role キーをここに置かない】
 *   RLS を素通りする。**フロントに置いた瞬間、誰でも任意の利用者の残高を書き換えられる**
 *   （2026-08-20 に staging で実証された事故の形・§14.3）。
 *
 * 【★V-19 ⑨ の観点】
 *   **この経路にセッションの発行口は 1 つしかない**（Supabase Auth）。
 *   自前の発行口を作らないことを、`apps/cli/test/auth-wiring.test.ts` が構文木で見る。
 */
export function authClient() {
  const url = process.env['NEXT_PUBLIC_SUPABASE_URL'];
  const key = process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'];
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL / ANON_KEY が未設定です');
  if (inBrowser() && browserAuthClient !== null) return browserAuthClient;
  const client = makeAuthClient(url, key);
  if (inBrowser()) browserAuthClient = client;
  return client;
}

/** ★セッションを持つ器の作り方（★`authClient` だけが呼ぶ・★ブラウザでは 1 回だけ） */
function makeAuthClient(url: string, key: string) {
  return createClient(url, key, {
    auth: {
      // ★ブラウザの保存領域にセッションを置く（再読み込みで消えない）
      persistSession: true,
      // ★寿命の管理はライブラリに任せる（D-113 ②・自前で抱えない）
      autoRefreshToken: true,
      // ★URL のハッシュからセッションを拾う（確認メールのリンクから戻ったとき）
      detectSessionInUrl: true,
    },
  });
}
