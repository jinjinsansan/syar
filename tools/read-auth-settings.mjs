/**
 * ★認証の設定の現在値を読む（裁定 C-3・V-19 の E 系の前提）
 *
 * 【なぜ要るか】
 *   裁定 `REVIEW_AUTH_EMAIL_PASSWORD_VERDICT_20260918.md` C-3:
 *   「★設定で切り替わる防御は、**設定の現在値を読んで判定する**」。
 *   E-1・E-3・E-5・E-6・E-8 がそれに当たる。
 *   ★**「設定を切れば検査が通る」形にしない**（R-16・V-19 ⑪ と同じ要請）。
 *
 * 【★どこまで読めるか — 2026-09-18 に staging で実測した】
 *   ✅ `GET /auth/v1/settings`（anon キーで読める）に載る:
 *        `disable_signup`（→ E-8）・`mailer_autoconfirm`（→ E-6）・`external.email`・
 *        `external.google` / `apple`（→ ⑥-email が効き始める便の判定）
 *   🔴 **載らない**: 率の制限（E-1）・メール変更の両側確認（E-3）・漏洩パスワード（E-5）・
 *        パスワード最低要件（E-7）
 *   🔴 `auth` スキーマにも設定の表は**無い**（27 の表はすべてデータ用。`config` 相当が無い）。
 *      ✔ `information_schema.tables where table_schema='auth'` で全走査して確認
 *   🔴 管理 API（`api.supabase.com`）のトークンは**手元に無い**
 *      （`secrets.*.env` は URL・anon・service_role・project_ref・DB URL のみ）
 *
 *   → ★**読めるものは読んで判定し、読めないものは「振る舞いで測る」と分ける。**
 *     ★**「設定が読めないから検査しない」にはしない**（それは R-16 そのもの）。
 *
 * 【★このツールは状態を変えない】
 *   GET 1 本だけ。R-24 の READONLY。
 *
 * 実行:
 *   npx tsx tools/read-auth-settings.mjs --env staging
 */
import { loadEnv } from './lib/env.mjs';

const env = loadEnv();

if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
  console.error('★SUPABASE_URL / SUPABASE_ANON_KEY が要ります');
  process.exit(2);
}

const res = await fetch(`${env.SUPABASE_URL}/auth/v1/settings`, {
  headers: { apikey: env.SUPABASE_ANON_KEY },
});
if (!res.ok) {
  console.error(`🔴 設定を読めませんでした: HTTP ${res.status}`);
  process.exit(1);
}
const s = await res.json();

/** ★期待する値と突き合わせる。★`want` は「D-113 の条件から導かれる、あるべき値」 */
const CHECKS = [
  {
    id: 'E-8',
    label: '一般の登録口が閉じている（招待制／許可リスト・D-113 ⑦）',
    got: s.disable_signup,
    want: true,
    note: '★開発期間中は招待制に限る。公開 URL で誰でも口座を作れると、出口が閉じていても NPC 在庫（D-079 ⑧）と EP 総発行量（D-077 ①）を外から削れる',
  },
  {
    id: 'E-6',
    label: 'メール確認が必須（自動確認になっていない・D-113 ④）',
    got: s.mailer_autoconfirm,
    want: false,
    note: '★true だと確認前に使えてしまい、他人のメールで登録して占拠できる。★これは設定の片側だけ。DB 側（セットアップ RPC）にも重ねること',
  },
  {
    id: '経路',
    label: 'メール＋パスワード経路が有効（D-113）',
    got: s.external?.email,
    want: true,
    note: '',
  },
  {
    id: '⑥-email',
    label: 'Supabase の標準プロバイダ（google / apple）はまだ足していない',
    got: (s.external?.google ?? false) || (s.external?.apple ?? false),
    want: false,
    note: '★足す便では、検証済みメールによる自動結合の扱いをその便の冒頭で確かめる（正典 V-19 ⑥-email）',
  },
];

console.log('\n=== ★設定から判定できるもの ===');
let ng = 0;
for (const c of CHECKS) {
  const ok = c.got === c.want;
  if (!ok) ng += 1;
  console.log(`  ${ok ? '✅' : '🔴'} ${c.id.padEnd(7)} ${c.label}`);
  console.log(`       いま=${JSON.stringify(c.got)}  あるべき=${JSON.stringify(c.want)}`);
  if (!ok && c.note !== '') console.log(`       ${c.note}`);
}

console.log('\n=== 🔴 設定からは判定できないもの（★振る舞いで測るしかない）===');
for (const x of [
  ['E-1', '総当たり／詰め込みに率の制限がある', '連続で叩いて 429 になるか（★副作用: 失敗ログが増える）'],
  ['E-2', '再設定リンクが 1 回限り・期限切れで拒否', '再設定を 1 回起こし、同じリンクを 2 回使う'],
  ['E-3', '旧アドレスの確認なしにメール変更が成立しない', '利用者を 1 人作り、変更を試す'],
  ['E-4', 'パスワード変更・再設定の後に既存セッションが失効', '2 つのセッションを作り、片方で変える'],
  ['E-5', '漏洩済みパスワードの拒否', '既知の漏洩パスワードで登録を試す'],
  ['E-7', '最低要件を満たさないパスワードの拒否', '短いパスワードで登録を試す'],
]) {
  console.log(`  ・${x[0]}  ${x[1]}`);
  console.log(`      測り方: ${x[2]}`);
}

console.log(`\n=== ${ng === 0 ? '設定の判定: 全件 合格' : `🔴 設定の判定: ${ng} 件 不合格`}（${CHECKS.length} 件中） ===`);
console.log('★これは V-19 の一部（設定から読める分）です。★合否は経路ごとの全項目で出すこと');
process.exit(ng === 0 ? 0 : 1);
