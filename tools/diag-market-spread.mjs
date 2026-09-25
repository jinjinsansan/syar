// @ts-check
/**
 * 🔴 ★**同じ値段の中で、戦績に「観測できる差」が在るか**（★D-102 ③・作業用・読むだけ）
 *
 * ★なぜ измер るか: ★D-102 ③ は「★振り直しを止めるのは決定性ではなく ★**観測できる差が無いこと**」。
 *   ★`0085` で戦績を出したので、★同じ値段の中で戦績がばらつくなら ★**振り直しの動機を作った**ことになります。
 */
import pg from 'pg';
import { loadEnv } from './lib/env.mjs';
const env = loadEnv();
console.log('接続先:', env.STAR_ENV);
const c = new pg.Client({ connectionString: env.DATABASE_URL });
await c.connect();
await c.query('begin read only');
/** @param {string} s @returns {Promise<any[]>} */
const q = async (s) => (await c.query(s)).rows;
console.log('  ---- 値段ごとの戦績のばらつき ----');
for (const r of await q(
  `select price_ep,
          count(*)::int n,
          min(starts)::int min_s, max(starts)::int max_s,
          min(wins)::int min_w, max(wins)::int max_w,
          count(distinct (starts, wins))::int shapes
     from horse_market_listing_public
    group by price_ep order by price_ep`,
)) {
  const same = r.shapes === 1;
  console.log(
    `    ${String(r.price_ep).padStart(6)} EP: ${r.n} 頭  出走 ${r.min_s}〜${r.max_s}  勝 ${r.min_w}〜${r.max_w}`
    + `  戦績の形 ${r.shapes} 通り  ${same ? '✅ 同じ' : '🔴 ばらつく'}`,
  );
}
await c.query('rollback');
await c.end();
