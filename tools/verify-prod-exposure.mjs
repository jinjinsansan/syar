/**
 * ★**公開中のサイトが、★意図した範囲しか開いていないか**（★2026-09-20・①② の検査）
 *
 * 【🔴 ★なぜ「期待する状態」を宣言させるのか】
 *   ★自動で判定すると、★**見つけた世界をそのまま合格にします**。
 *   → ★★**保護が外れた日も「合格」**になります。★それは `CK-14` の親戚です。
 *   → ★だから ★**`--expect protected|open` を必須**にしました。★人が意図を書きます。
 *
 * 【★2 つの形】
 *   ★`protected` … ★Vercel の Deployment Protection が入っている（★**推した案**）
 *                   ★開発用ページ **401** ／ ★対照: ★bypass 付きなら 200、無ければ `/home` も 401
 *   ★`open`      … ★保護は無く、★コードで塞いでいる
 *                   ★開発用ページ **404** ／ ★対照: `/home` は **200**
 *
 * 【⚠️ ★対照を必ず置きます（★**CK-14**）】
 *   ★「開発用ページが開かない」だけを見ると、★★**サイトごと落ちている**のが満点に見えます。
 *   → ★**通るべきものが通ること**を、★同じ検査の中で見ます。
 *
 * 【🔴 ★読むだけ】★HTTP の GET しかしません。★DB にも触れません。
 * ⚠️ ★bypass の token は ★**秘密**です。★環境変数から読み、★出力に出しません。
 *
 * 実行:
 *   npx tsx tools/verify-prod-exposure.mjs --base <URL> --expect protected [--record]
 */
import { exitWithVerdict, verdictOf } from './lib/counted-verdict.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : process.argv[i + 1]; };
const BASE = (arg('base', process.env['AUDIT_BASE'] ?? '') ?? '').replace(/\/$/, '');
const EXPECT = arg('expect', null);
const RECORD = process.argv.includes('--record');

if (BASE === '') {
  console.error('★--base <URL> が要ります');
  process.exit(2);
}
if (EXPECT !== 'protected' && EXPECT !== 'open') {
  console.error('🔴 ★--expect protected|open が要ります。');
  console.error('   ★**見つけた世界をそのまま合格にしない**ため、★期待する状態を宣言してください。');
  process.exit(2);
}

/** 🔴 ★外に出してはいけないページ（★開発用） */
const DEV_PAGES = [
  '/art-lab', '/design-check', '/design-preview', '/race-quality-lab',
  '/race-world-lab', '/lp-preview', '/still', '/camera', '/gait-review',
];
/** ✅ ★対照 — ★開いているべきページ */
const PUBLIC_PAGES = ['/home', '/'];

/**
 * ★bypass の token（★Vercel の Protection Bypass for Automation）。
 * ⚠️ ★**repo に入れません。** ★環境変数から読みます。★値は出力しません。
 */
const BYPASS = process.env['VERCEL_AUTOMATION_BYPASS_SECRET'] ?? null;

async function statusOf(path, withBypass) {
  const headers = { 'cache-control': 'no-cache' };
  if (withBypass && BYPASS !== null) headers['x-vercel-protection-bypass'] = BYPASS;
  try {
    const res = await fetch(`${BASE}${path}`, { headers, redirect: 'manual' });
    return res.status;
  } catch (e) {
    return `失敗: ${e.message}`;
  }
}

console.log('# ★公開中のサイトの露出（★読むだけ・HTTP GET のみ）');
console.log(`  ★宛先 ${BASE}`);
console.log(`  ★期待する状態: ★**${EXPECT}**`);
console.log(`  ★bypass token: ${BYPASS === null ? '★無し' : '★在り（★値は出しません）'}`);
console.log('');

let checked = 0;
let failed = 0;
const notes = [];

console.log('【🔴 ★外に出してはいけないページ】');
for (const p of DEV_PAGES) {
  const s = await statusOf(p, false);
  checked += 1;
  const ok = EXPECT === 'protected' ? s === 401 : s === 404;
  if (!ok) { failed += 1; notes.push(`${p} → ${s}`); }
  console.log(`  ${ok ? '✓' : '🔴'} ${p.padEnd(20)} ${s}`
    + `（★期待 ${EXPECT === 'protected' ? 401 : 404}）`);
}

console.log('');
console.log('【✅ ★対照 — ★塞ぎすぎていないか】');
/**
 * 🔴 ★**対照が無いと、★サイトごと落ちているのが満点に見えます**（★**CK-14**）。
 * ★`protected` で bypass が無い場合は、★**「通るべきもの」も 401** です。
 *   → ★その場合の対照は ★**「全部 閉じたことの確認」**になります。
 */
for (const p of PUBLIC_PAGES) {
  const useBypass = EXPECT === 'protected' && BYPASS !== null;
  const s = await statusOf(p, useBypass);
  checked += 1;
  let want;
  if (EXPECT === 'open') want = 200;
  else want = BYPASS === null ? 401 : 200;
  const ok = s === want;
  if (!ok) { failed += 1; notes.push(`${p} → ${s}`); }
  console.log(`  ${ok ? '✓' : '🔴'} ${p.padEnd(20)} ${s}（★期待 ${want}`
    + `${useBypass ? '・bypass 付き' : ''}）`);
}

if (EXPECT === 'protected' && BYPASS === null) {
  console.log('');
  console.log('  ⚠️ 🔴 ★**bypass が無いので、★「塞ぎすぎていない」を確かめられていません。**');
  console.log('     ★いま言えるのは ★**「全部 閉じた」**までです（★R-21）。');
  console.log('     → ★`O-6`（`/api/healthz`）も閉じています。★`staleness` の pending を使うこと。');
}

if (notes.length > 0) {
  console.log('');
  console.log('  🔴 ★期待と違ったもの:');
  for (const n of notes) console.log(`     ${n}`);
}

if (RECORD) {
  const { writeCheck } = await import('./lib/staleness.mjs');
  const path = writeCheck({
    what: 'prod-exposure',
    env: 'production',
    ok: failed === 0,
    detail: { base: BASE, expect: EXPECT, checked, failed, bypass: BYPASS !== null, notes },
    nowIso: new Date().toISOString(),
  });
  console.log('');
  console.log(`  ★記録しました: ${path}`);
}

exitWithVerdict(verdictOf({
  checked,
  failed,
  label: `★公開中のサイトの露出（★期待 ${EXPECT}）`,
}));
