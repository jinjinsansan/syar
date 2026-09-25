// @ts-check
/**
 * ★`race_entries.jockey_frozen` の形の内訳を数える（★作業用・読むだけ）
 *
 * ★なぜ要るか: ★`0082` で凍結をサーバー側で作るように変えたので、
 *   ★**旧い形の行がどれだけ在るか**を知らないと、★返金側を「無いなら落とす」にできません
 *   （★旧い行は `{ id: ... }` で `feeEP` が無く、★料金 0 で引かれています）。
 */
import pg from 'pg';
import { loadEnv } from './lib/env.mjs';

const env = loadEnv();
console.log('接続先:', env.STAR_ENV);
const c = new pg.Client({ connectionString: env.DATABASE_URL });
await c.connect();
await c.query('begin read only');
const r = await c.query(
  `select count(*)::int total,
          count(*) filter (where jockey_frozen is null)::int nul,
          count(*) filter (where jockey_frozen ? 'v')::int newshape,
          count(*) filter (where jockey_frozen is not null and not (jockey_frozen ? 'v'))::int oldshape,
          count(*) filter (where jockey_frozen ? 'feeEP')::int hasfee
     from race_entries`,
);
console.log('  race_entries:', JSON.stringify(r.rows[0]));
const s = await c.query(
  `select distinct jockey_frozen from race_entries where jockey_frozen is not null limit 5`,
);
for (const row of s.rows) console.log('   例:', JSON.stringify(row.jockey_frozen));
await c.query('rollback');
await c.end();
