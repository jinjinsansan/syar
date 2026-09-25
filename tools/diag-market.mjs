// @ts-check
/** ★馬の市場の現状（★作業用・読むだけ）。⚠️ ★列名を推測せず、★まず列を見る */
import pg from 'pg';
import { loadEnv } from './lib/env.mjs';
const env = loadEnv();
console.log('接続先:', env.STAR_ENV);
const c = new pg.Client({ connectionString: env.DATABASE_URL });
await c.connect();
await c.query('begin read only');
/** @param {string} s @returns {Promise<any[]>} */
const q = async (s) => (await c.query(s)).rows;
for (const t of ['horse_market_listing', 'horse_market_listing_public']) {
  const cols = (await q(
    `select column_name from information_schema.columns where table_name = '${t}' order by ordinal_position`,
  )).map((r) => r.column_name);
  const n = cols.length === 0 ? '（存在しません）' : (await q(`select count(*)::int n from ${t}`))[0].n;
  console.log(`  ${t}: ${n} 行`);
  console.log(`    列: ${cols.join(', ')}`);
}

// ★出品の中身（★名前と戦績が付いたか・0085）
console.log('  ---- 出品の中身（安い順に 3 件）----');
for (const r of await q(
  'select horse_name, starts, wins, g1_wins, price_ep, sell_back_ep from horse_market_listing_public order by price_ep limit 3',
)) {
  console.log(`    ${r.horse_name}  ${r.starts}戦${r.wins}勝  G1 ${r.g1_wins}  ${r.price_ep} EP（戻り ${r.sell_back_ep}）`);
}
// ★見せない列が漏れていないか
const cols2 = (await q(
  "select column_name from information_schema.columns where table_name = 'horse_market_listing_public'",
)).map((r) => r.column_name);
for (const bad of ['potential', 'speed', 'stamina', 'guts', 'wisdom', 'genotype', 'owner_id', 'display_name']) {
  console.log(`    ${cols2.includes(bad) ? '🔴 在る' : '✅ 無い'}: ${bad}`);
}

await c.query('rollback');
await c.end();
