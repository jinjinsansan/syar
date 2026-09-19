/**
 * ★**固定した CA が、★古びないように／★二重にならないように**（★`AUDIT-TLS` / `TLS-EXPIRY`・2026-09-20）
 *
 * 【★何を守るか】
 *   ★`apps/worker/src/db-ssl.ts` は CA を ★**文字列で**持っています。
 *   ★理由: ★`deploy.sh` が運ぶのは `dist/worker.cjs` **だけ**なので、
 *   ★`.crt` を実行時に読む形にすると ★**サーバにファイルが届かず、★本番が DB に繋げなくなります**。
 *
 *   → ★そのかわり ★**正が 2 つ**になります（★`.crt` と ★文字列）。★**D-052 の逆**です。
 *   → ★だから ★**1 バイト違えば落ちる**検査を置きます。
 *
 * 【⚠️ 🔴 ★**この 1 本だけ、★現在時刻を読みます**】
 *   ★下の `TLS-EXPIRY` の検査（★残り 90 日）は ★**`Date.now()` を読みます**。
 *   ★このファイルの他の 5 本も、★他のほとんどの検査も ★**決定論**です — ★入力が同じなら結果が同じ。
 *   → ★★**これは例外です。★日が経つだけで、★いつか落ちます。**
 *   ★**それが目的**です（★「切れる前に落ちる」を作るには、★時刻を見るしかありません）。
 *   ⚠️ ★憲法 4（★`Date.now()` を直接 呼ばない）は ★**製品コードの規則**です。
 *     ★この検査は製品ではなく、★**「いま何日 残っているか」を見るのが仕事**なので読みます。
 *   🔴 ★**落ちたら証明書を差し替えること。★「90 を小さくする」ではありません。**
 *
 * 【🔴 ★`TLS-EXPIRY`】
 *   ★この証明書は ★**2031-04-26 に切れます**。
 *   ★固定とは「★信頼する相手を 1 つに絞る」ことなので、
 *   ★**その 1 つが古びたとき、★ある日 突然つながらなくなります。**
 *   → ★**残り 90 日を切ったら、★この検査が落ちます。** ★切れる前に気づくために。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { X509Certificate } from 'node:crypto';
import path from 'node:path';
import { SUPABASE_ROOT_CA_2021, DB_SSL, assertSslModeDoesNotWeaken } from '../../worker/src/db-ssl.js';

const ROOT = path.resolve(__dirname, '../../..');
const CRT = path.join(ROOT, 'apps/worker/certs/supabase-root-2021.crt');

/** ★改行の違いは中身の違いではないので、★揃えてから比べます */
const norm = (s: string) => s.replace(/\r\n/g, '\n').trim();

describe('★AUDIT-TLS: 固定した CA', () => {
  it('🔴 ★埋め込んだ文字列が、★`.crt` と**1 バイトも違わない**（★正を 2 つ作らない）', () => {
    const fromFile = norm(readFileSync(CRT, 'utf8'));
    expect(norm(SUPABASE_ROOT_CA_2021), '🔴 ★`db-ssl.ts` と `.crt` が食い違っています').toBe(fromFile);
  });

  it('★素性が変わっていない（★別の証明書に差し替えられていない）', () => {
    const x = new X509Certificate(SUPABASE_ROOT_CA_2021);
    expect(x.subject).toContain('Supabase Root 2021 CA');
    expect(x.issuer).toContain('Supabase Root 2021 CA');   // ★自己署名
    expect(x.ca, '★CA:TRUE でない証明書を根にしている').toBe(true);
    expect(x.fingerprint256).toBe(
      '80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA',
    );
  });

  it('🔴 ★`TLS-EXPIRY`: ★残り 90 日を切ったら落ちる（★切れる前に気づく）', () => {
    /**
     * ⚠️ ★ここは ★**時刻に依存する検査**です（★憲法 4 の「時刻を注入する」は製品の話で、
     *   ★この検査は「いま何日 残っているか」を見るのが目的なので、★現在時刻を読みます）。
     * 🔴 ★落ちたら ★**証明書を差し替える**こと。★「検査を伸ばす」ではありません。
     */
    const x = new X509Certificate(SUPABASE_ROOT_CA_2021);
    const until = new Date(x.validTo);
    const daysLeft = Math.floor((until.getTime() - Date.now()) / 86_400_000);
    expect(
      daysLeft,
      `🔴 ★CA の残りが ${daysLeft} 日です（${x.validTo}）。`
        + '★差し替えてください — ★切れると本番のワーカーが DB に繋げなくなります。'
        + '★`apps/worker/certs/supabase-root-2021.crt` と `apps/worker/src/db-ssl.ts` の両方を。',
    ).toBeGreaterThan(90);
  });

  it('🔴 ★製品の設定が、★検証を切っていない', () => {
    expect(DB_SSL.rejectUnauthorized, '🔴 ★検証が切られています').toBe(true);
    expect(DB_SSL.ca, '★CA が渡されていない（★Supabase は私的 CA なので、★true だけでは通らない）')
      .toBe(SUPABASE_ROOT_CA_2021);
  });

  it('🔴 ★接続文字列で固定を打ち消せない（★`pg` が ssl を書き換える穴）', () => {
    /**
     * 🔴 ★束（`dist/worker.cjs`）を grep したら `rejectUnauthorized: false` が **4 件**残っており、
     *   ★全部 ★**`pg` 自身の `sslmode` 解釈**でした。
     *   ★`pg` は ★**渡した object を書き換える**ので、★`?sslmode=no-verify` が付いた日に
     *   ★**固定が黙って無効**になります。★例外も出ません。
     */
    for (const bad of ['no-verify', 'prefer', 'allow', 'disable']) {
      expect(
        () => assertSslModeDoesNotWeaken(`postgres://u:p@h:5432/db?sslmode=${bad}`),
        `🔴 ★sslmode=${bad} を通しています`,
      ).toThrow(/AUDIT-TLS/);
    }
    // ⚠️ ★弱めないものは通すこと（★何でも投げる検査は、★使われなくなります）
    for (const ok of ['require', 'verify-ca', 'verify-full']) {
      expect(() => assertSslModeDoesNotWeaken(`postgres://u:p@h:5432/db?sslmode=${ok}`)).not.toThrow();
    }
    expect(() => assertSslModeDoesNotWeaken('postgres://u:p@h:5432/db')).not.toThrow();
  });

  it('🔴 ★製品コードに `rejectUnauthorized: false` が戻っていない', () => {
    /**
     * ⚠️ ★註記の中の引用（★「旧は …」）に当たらないよう、★**実行される行の形**で探します。
     */
    const files = ['apps/worker/src/main.ts', 'apps/worker/src/schemacheck.ts'];
    for (const f of files) {
      const body = readFileSync(path.join(ROOT, f), 'utf8')
        .split('\n')
        .filter((l) => {
          const t = l.trimStart();
          return !t.startsWith('*') && !t.startsWith('//') && !t.startsWith('/*');
        })
        .join('\n');
      expect(body, `🔴 ★${f} で検証が切られています`).not.toMatch(/rejectUnauthorized:\s*false/);
      expect(body, `★${f} が DB_SSL を使っていません`).toMatch(/ssl:\s*DB_SSL/);
    }
  });
});
