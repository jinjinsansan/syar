/**
 * ★**画面が呼ぶ DB の口が、その環境に在るかを確かめる**（★2026-09-24・手順書 ⑦ の前）
 *
 * 【🔴 ★なぜ要るか — ★2026-09-24 に順が逆になった】
 *   ★`/stable/foal` を `main` に push した時点で、★その画面が呼ぶ `initial_breeding_dams`（`0077`）が
 *   ★**本番にありませんでした**。★開くと「候補を読み込めませんでした」になります。
 *   ★害が小さかったのは ★**たまたまリンクを 1 本も張っていなかった**からです。★運が良かっただけです。
 *   → ★**押す前に、機械で突き合わせます**（★手順書 `RUNBOOK_PROD_DEPLOY_20260922.md` ⑦ の前に書いた約束）。
 *
 * 【★どう測るか】
 *   ★① `apps/web/src` から ★**画面が呼ぶ名前**を拾う（★`.rpc('…')`）
 *   ★② その環境の `pg_proc` に ★**その名前が在るか**を見る
 *   ★③ 無いものを挙げる
 *   ⚠️ ★一覧を手で書きません（★`side-walk` を数え落とした形を繰り返さない）。★原文から拾います。
 *
 * 【★この道具が言えないこと】
 *   ⚠️ ★**引数の形までは見ません**（★名前だけ）。★引数を変えた移行は、これでは捕まりません。
 *   ⚠️ ★**権限は見ますが、呼べることの保証ではありません**（★RLS・`security definer` の中身までは見ない）。
 *   ★ここが言えるのは ★**「名前ごと無い」を止める**までです。★それが今日 起きた形です。
 *
 * ⚠️ ★**読むだけ**です。★1 行も書きません。★本番にも向けられます（★`--env production`）。
 *
 * ★実行: npx tsx tools/verify-screen-rpcs-live.mjs --env production
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';
import { loadEnv } from './lib/env.mjs';

const SRC = 'apps/web/src';

/** ★画面が呼ぶ名前を原文から拾う（★`.rpc('…')`） */
function screenRpcs() {
  const names = new Map();
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name);
      if (entry.isDirectory()) { walk(p); continue; }
      if (!/\.(tsx|ts)$/.test(entry.name)) continue;
      const src = readFileSync(p, 'utf8');
      for (const m of src.matchAll(/\.rpc\(\s*'([a-z0-9_]+)'/g)) {
        const at = names.get(m[1]) ?? [];
        at.push(p.replace(/\\/g, '/'));
        names.set(m[1], at);
      }
    }
  };
  walk(SRC);
  return names;
}

const found = screenRpcs();
if (found.size === 0) {
  console.error('🔴 ★画面が呼ぶ口を 1 つも拾えませんでした（★走査が壊れています・R-21）');
  process.exit(2);
}

const env = loadEnv();
const c = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
await c.query('begin read only');

/**
 * 🔴 ★**対照**: ★在るはずのない名前を 1 つ混ぜて問い合わせます。
 *   ★これが「在る」と返ったら、★問い合わせが名前で絞れていません（★何を渡しても合格になる）。
 *   ★`CK-14`（★0 件 通過を合格にしない）の形です。
 */
const SENTINEL = 'star_probe_should_not_exist';

const rows = (await c.query(
  "select p.proname, pg_get_function_identity_arguments(p.oid) args,"
  + " has_function_privilege('authenticated', p.oid, 'execute') can_auth"
  + ' from pg_proc p join pg_namespace n on n.oid = p.pronamespace'
  + " where n.nspname = 'public' and p.proname = any($1)",
  [[...found.keys(), SENTINEL]],
)).rows;
if (rows.some((r) => r.proname === SENTINEL)) {
  console.error(`🔴 ★対照が通ってしまいました（★${SENTINEL} が「在る」と返った）。★問い合わせが壊れています`);
  await c.query('rollback');
  await c.end();
  process.exit(2);
}
const live = new Map();
for (const r of rows) {
  const at = live.get(r.proname) ?? [];
  at.push(r);
  live.set(r.proname, at);
}

console.log(`=== 画面が呼ぶ口 ${found.size} 件 ／ 接続先 ${env.STAR_ENV ?? '(不明)'} ===`);
const missing = [];
const noGrant = [];
for (const name of [...found.keys()].sort()) {
  const defs = live.get(name);
  if (defs === undefined) {
    missing.push(name);
    console.log(`  🔴 ${name.padEnd(28)} 無い          ← ${found.get(name)[0]}`);
    continue;
  }
  const ok = defs.some((d) => d.can_auth === true);
  if (!ok) noGrant.push(name);
  console.log(`  ${ok ? '✅' : '⚠️'} ${name.padEnd(28)} ${defs.length} 定義  ${ok ? 'authenticated 可' : '🔴 authenticated 不可'}`);
}

await c.query('rollback');
await c.end();

if (missing.length > 0) {
  console.error(`\n🔴 ★不合格: ★画面が呼ぶのに、この環境に無い口が ${missing.length} 件`);
  console.error(`   ${missing.join(' / ')}`);
  console.error('   → ★**移行を先に当ててから**画面を出してください（★手順書 ⑦ の前）');
  process.exit(1);
}
if (noGrant.length > 0) {
  console.error(`\n🔴 ★不合格: ★利用者が呼べない口が ${noGrant.length} 件（${noGrant.join(' / ')}）`);
  process.exit(1);
}
console.log('\n✅ ★合格（★画面が呼ぶ口はすべて在り、★利用者が呼べる）');
console.log('⚠️ ★引数の形までは見ていません（★名前だけ）。★引数を変えた移行はこれでは捕まりません。');
