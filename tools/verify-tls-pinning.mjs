/**
 * ★**証明書の固定が、★本当に効いているか**（★`AUDIT-TLS`・読むだけ・2026-09-20）
 *
 * 【🔴 ★なぜ対照が要るか】
 *   ★「固定して繋がりました」だけでは ★**何も確かめたことになりません** —
 *   ★**何を渡しても通る**のかもしれないからです（★**R-16** / ★「✅ が別の理由で出ていないか」）。
 *   → ★**通る 1 本と、★落ちる 2 本**を対で採ります。
 *
 * 【★4 本】
 *   ★① 製品の設定（`DB_SSL` ＝ Supabase の CA を渡す）        … ★**通るはず**
 *   ★② CA を渡さず `rejectUnauthorized: true`                  … 🔴 ★**落ちるはず**
 *   ★③ **別の CA**（Node に入っている公開の根の 1 つ）を渡す   … 🔴 ★**落ちるはず**
 *   ★④ `rejectUnauthorized: false`（★旧の設定）                … ★通る（★相手が居ることの確認）
 *
 *   ★②③ が**落ちて初めて**、★①の「通った」に意味が出ます。
 *
 * 【⚠️ ★見ていないもの】
 *   ★`select 1` しか投げません。★**1 行も書きません。**
 *   ★これは ★**手元から見た接続**です。★**配備先から同じように見えるかは分かりません**
 *   （★配備は別の承認です。★`dist/worker.cjs` に束ねてあるので、★理屈の上では同じはず）。
 *
 * 実行: node tools/verify-tls-pinning.mjs --env production
 *       node tools/verify-tls-pinning.mjs --env staging
 */
import tls from 'node:tls';
import pg from 'pg';
import { loadEnv } from './lib/env.mjs';
import { SUPABASE_ROOT_CA_2021 } from '../apps/worker/src/db-ssl.ts';

const env = loadEnv();

/** ★別の CA（★Node が持っている公開の根の 1 つ）。★Supabase のものではありません */
const otherCa = tls.rootCertificates[0];

const cases = [
  ['① 製品の設定（Supabase の CA を渡す）', { ca: SUPABASE_ROOT_CA_2021, rejectUnauthorized: true }, 'pass'],
  ['② CA 無しで検証する', { rejectUnauthorized: true }, 'fail'],
  ['③ 別の CA を渡す', { ca: otherCa, rejectUnauthorized: true }, 'fail'],
  ['④ 検証しない（旧の設定）', { rejectUnauthorized: false }, 'pass'],
];

console.log('# 証明書の固定は効いているか（★読むだけ）');
const envRow = await (async () => {
  const c = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const r = (await c.query('select (select environment from app_environment limit 1) as env')).rows[0];
  await c.end();
  return r;
})();
console.log(`  接続先: app_environment = ${envRow.env}`);
console.log('');

const fails = [];
for (const [label, ssl, want] of cases) {
  const c = new pg.Client({ connectionString: env.DATABASE_URL, ssl });
  let got; let detail = '';
  try {
    await c.connect();
    await c.query('select 1');
    got = 'pass';
    await c.end();
  } catch (e) {
    got = 'fail';
    detail = `${e.code ?? ''} ${String(e.message).slice(0, 60)}`;
    try { await c.end(); } catch { /* ★閉じられないのは想定内 */ }
  }
  const ok = got === want;
  console.log(`  ${ok ? '✓' : '★'} ${label}`);
  console.log(`      期待 ${want} / 実際 ${got}${detail ? `  ${detail}` : ''}`);
  if (!ok) fails.push(label);
}

console.log('');
if (fails.length === 0) {
  console.log('✅ ★4 本とも期待どおり。★**②③ が落ちたので、★①の「通った」に意味があります。**');
} else {
  console.log(`🔴 ★${fails.length} 本 期待と違います: ${fails.join(' / ')}`);
  process.exitCode = 1;
}
