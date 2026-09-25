// @ts-check
/** ★市場の行に馬の名前を付けられるか（★作業用・読むだけ） */
import pg from 'pg';
import { loadEnv } from './lib/env.mjs';
const env = loadEnv();
console.log('接続先:', env.STAR_ENV);
const c = new pg.Client({ connectionString: env.DATABASE_URL });
await c.connect();
await c.query('begin read only');
/** @param {string} label @param {string} sql */
const tryAnon = async (label, sql) => {
  await c.query('savepoint sp');
  try {
    await c.query('set local role anon');
    const n = (await c.query(sql)).rows[0].n;
    console.log(`  anon ${label}: ${n}`);
  } catch (e) {
    console.log(`  anon ${label}: 🔴 ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`);
  }
  await c.query('rollback to savepoint sp');
};
await tryAnon('公開 view', 'select count(*)::int n from horse_market_listing_public');
await tryAnon('horses 直', 'select count(*)::int n from horses');
await tryAnon('retired 公開', 'select count(*)::int n from retired_horses_public');
console.log('  ---- public を含む view ----');
for (const v of (await c.query(
  "select table_name from information_schema.views where table_schema='public' and table_name like '%public%' order by table_name",
)).rows) console.log(`    ${v.table_name}`);
await c.query('rollback');
await c.end();
