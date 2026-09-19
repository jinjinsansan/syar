/**
 * ★**Supabase Root 2021 CA** — ★DB 接続の TLS を検証するための根証明書（★`AUDIT-TLS`・2026-09-20）
 *
 * 【🔴 ★なぜ文字列で持つのか — ★ファイルを読む形にすると本番が止まります】
 *   ✔ ★`build:worker` は `esbuild --bundle` で ★**`dist/worker.cjs` 1 つにまとめます**。
 *   ✔ ★`tools/deploy.sh` が運ぶのも ★**`dist/worker.cjs` だけ**です（`:134` がそれだけを見ている）。
 *   → ★★**`.crt` を実行時に読む形にすると、★そのファイルはサーバに届きません。**
 *     ★`rejectUnauthorized: true` と組むと ★**ワーカーが DB に繋げなくなります**。
 *   → ★文字列にすれば ★**束に入るので、★配備を何も変えずに済みます。**
 *
 * 【⚠️ ★これは秘密ではありません】
 *   ★公開されている CA の公開鍵です。★版管理に入れて構いません
 *   （★固定する以上、★入れる必要があります）。
 *
 * 【✔ ★素性（★2026-09-20 に自分で確かめました）】
 *   subject / issuer  ★どちらも `CN=Supabase Root 2021 CA`（★**自己署名**・`CA:TRUE` critical）
 *   有効期間          2021-04-28 → ★**2031-04-26**
 *   sha256            `80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:`
 *                     `82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA`
 *   ✔ ★接続が出してきた鎖の根と **DER で一致**（★レビュー側が管理画面から採ったものとも一致）。
 *
 * 【🔴 ★2031-04-26 に切れます（★`TLS-EXPIRY`）】
 *   ★固定とは「★信頼する相手を 1 つに絞る」ことなので、
 *   ★**その 1 つが古びたときの手当てが要ります。**
 *   → ★`apps/cli/test/tls-ca.test.ts` が ★**残り 90 日を切ったら落ちます**。
 *     ★ある日 突然つながらなくなる、を避けるためです。
 *
 * ⚠️ ★**ここを手で書き換えないこと。** ★正は `apps/worker/certs/supabase-root-2021.crt` で、
 *   ★検査が ★**1 バイト違えば落ちます**（★D-052: ★正を 2 つ作らない）。
 */
export const SUPABASE_ROOT_CA_2021 = [
  '-----BEGIN CERTIFICATE-----',
  'MIIDxDCCAqygAwIBAgIUbLxMod62P2ktCiAkxnKJwtE9VPYwDQYJKoZIhvcNAQEL',
  'BQAwazELMAkGA1UEBhMCVVMxEDAOBgNVBAgMB0RlbHdhcmUxEzARBgNVBAcMCk5l',
  'dyBDYXN0bGUxFTATBgNVBAoMDFN1cGFiYXNlIEluYzEeMBwGA1UEAwwVU3VwYWJh',
  'c2UgUm9vdCAyMDIxIENBMB4XDTIxMDQyODEwNTY1M1oXDTMxMDQyNjEwNTY1M1ow',
  'azELMAkGA1UEBhMCVVMxEDAOBgNVBAgMB0RlbHdhcmUxEzARBgNVBAcMCk5ldyBD',
  'YXN0bGUxFTATBgNVBAoMDFN1cGFiYXNlIEluYzEeMBwGA1UEAwwVU3VwYWJhc2Ug',
  'Um9vdCAyMDIxIENBMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAqQXW',
  'QyHOB+qR2GJobCq/CBmQ40G0oDmCC3mzVnn8sv4XNeWtE5XcEL0uVih7Jo4Dkx1Q',
  'DmGHBH1zDfgs2qXiLb6xpw/CKQPypZW1JssOTMIfQppNQ87K75Ya0p25Y3ePS2t2',
  'GtvHxNjUV6kjOZjEn2yWEcBdpOVCUYBVFBNMB4YBHkNRDa/+S4uywAoaTWnCJLUi',
  'cvTlHmMw6xSQQn1UfRQHk50DMCEJ7Cy1RxrZJrkXXRP3LqQL2ijJ6F4yMfh+Gyb4',
  'O4XajoVj/+R4GwywKYrrS8PrSNtwxr5StlQO8zIQUSMiq26wM8mgELFlS/32Uclt',
  'NaQ1xBRizkzpZct9DwIDAQABo2AwXjALBgNVHQ8EBAMCAQYwHQYDVR0OBBYEFKjX',
  'uXY32CztkhImng4yJNUtaUYsMB8GA1UdIwQYMBaAFKjXuXY32CztkhImng4yJNUt',
  'aUYsMA8GA1UdEwEB/wQFMAMBAf8wDQYJKoZIhvcNAQELBQADggEBAB8spzNn+4VU',
  'tVxbdMaX+39Z50sc7uATmus16jmmHjhIHz+l/9GlJ5KqAMOx26mPZgfzG7oneL2b',
  'VW+WgYUkTT3XEPFWnTp2RJwQao8/tYPXWEJDc0WVQHrpmnWOFKU/d3MqBgBm5y+6',
  'jB81TU/RG2rVerPDWP+1MMcNNy0491CTL5XQZ7JfDJJ9CCmXSdtTl4uUQnSuv/Qx',
  'Cea13BX2ZgJc7Au30vihLhub52De4P/4gonKsNHYdbWjg7OWKwNv/zitGDVDB9Y2',
  'CMTyZKG3XEu5Ghl1LEnI3QmEKsqaCLv12BnVjbkSeZsMnevJPs1Ye6TjjJwdik5P',
  'o/bKiIz+Fq8=',
  '-----END CERTIFICATE-----',
].join('\n');

/**
 * ★DB に繋ぐときの TLS の設定。★製品の 2 か所（`main.ts` / `schemacheck.ts`）がこれを使います。
 *
 * ⚠️ ★旧: `{ rejectUnauthorized: false }` — ★暗号化はされていましたが、
 *   ★**中間者を防げていませんでした**（★`AUDIT-TLS`）。
 */
export const DB_SSL = { ca: SUPABASE_ROOT_CA_2021, rejectUnauthorized: true } as const;

/**
 * 🔴 ★**接続文字列が、★上の固定を打ち消していないか**（★2026-09-20）。
 *
 * 【★なぜ要るか — ★束の中を見て気づきました】
 *   ✔ ★`dist/worker.cjs` を grep したら `rejectUnauthorized: false` が ★**4 件**残っていました。
 *     ★全部 ★**`pg` 自身の `sslmode` 解釈**で、★私たちのコードではありません。
 *   🔴 ★しかし `pg` は ★**`config.ssl.rejectUnauthorized = false` と、★渡した object を書き換えます**。
 *     → ★`DATABASE_URL` に `?sslmode=no-verify`（か `prefer`）が付いた日、
 *       ★**この固定は黙って無効になります。** ★例外も出ません。
 *
 * ✔ ★2026-09-20 時点では本番・staging とも `sslmode` は付いていません
 *   （★`verify-tls-pinning.mjs` の対照②が落ちることでも裏が取れています —
 *     ★もし打ち消されていたら、★②は通ってしまいます）。
 *
 * ⚠️ ★`require` / `verify-ca` / `verify-full` は**弱めません**ので通します。
 *
 * @throws ★固定を打ち消す `sslmode` が付いていたら投げます（★**fail-closed**）
 */
export function assertSslModeDoesNotWeaken(connectionString: string): void {
  const m = /[?&]sslmode=([a-zA-Z-]+)/.exec(connectionString);
  if (m === null) return;
  const mode = m[1]!.toLowerCase();
  if (mode === 'no-verify' || mode === 'prefer' || mode === 'allow' || mode === 'disable') {
    throw new Error(
      `★DATABASE_URL の sslmode=${mode} が、★証明書の固定を打ち消します（AUDIT-TLS）。`
        + '★pg は渡した ssl の object を書き換えるので、★例外も出ずに検証が切れます。'
        + '★sslmode を外すか、★verify-full にしてください。',
    );
  }
}
