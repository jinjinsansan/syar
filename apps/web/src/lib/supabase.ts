/**
 * Supabase クライアント（読み取り専用）
 *
 * ★anon キーだけを使います。service_role キーはフロントに置きません（RLS を素通りする）。
 *   §14.3 のとおり、ここは読み取り系だけです。
 */
import { createClient } from '@supabase/supabase-js';

export function readClient() {
  const url = process.env['NEXT_PUBLIC_SUPABASE_URL'];
  const key = process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'];
  // ★未設定を黙って空データで進めない。設定漏れが「レースが無い」に見えてしまう
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL / ANON_KEY が未設定です');
  return createClient(url, key);
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
