// @ts-check
/**
 * ★**その環境に入っていない移行**を挙げる（★読むだけ）
 *
 * ★なぜ要るか: ★本番に出していない移行が積み上がると、★配備の日に
 *   ★**何が一度に入るか**が誰にも言えなくなります（★裁定 `REVIEW_DISCOVERY_AXES_20260925.md` の依頼）。
 *
 *   npx tsx tools/list-unapplied-migrations.mjs --env staging
 */
import pg from 'pg';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { loadEnv } from './lib/env.mjs';

const env = loadEnv();
console.log('接続先:', env.STAR_ENV);
const c = new pg.Client({ connectionString: env.DATABASE_URL });
await c.connect();
await c.query('begin read only');
const applied = new Set(
  (await c.query('select filename from schema_migrations')).rows.map((r) => r.filename),
);
const dir = path.resolve(import.meta.dirname, '../db/migrations');
const all = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
const missing = all.filter((f) => !applied.has(f));
console.log(`  移行 ${all.length} 本 ／ この環境に入っている ${applied.size} 本 ／ 未適用 ${missing.length} 本`);
for (const f of missing) console.log(`    🔴 ${f}`);
if (missing.length === 0) console.log('    ✅ すべて入っています');
await c.query('rollback');
await c.end();
