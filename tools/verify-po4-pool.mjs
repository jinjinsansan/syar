/**
 * ★**PO-4 ①: 出走プールが実際に広がったか**（★2026-09-19・読むだけ）
 *
 * ✅ ★採った理由は ★**`generation` が「現役」を意味していなかった**こと（PO-4）。
 * ⚠️ ★**V が壊れないことは、採れる条件であって採る理由ではありません。**
 * 🔴 ★**「V は動かない」とは言えません**（A→D は 2.04σ）。★「入れた結果 D になった」まで。
 */
import pg from 'pg';
import { loadEnv } from './lib/env.mjs';
import { ACTIVE_WHERE, RACEABLE_WHERE, RACEABLE_POOL_LIMIT, loadRaceablePool } from '../apps/worker/src/horse-repo.ts';
const env = loadEnv();
console.log('接続先:', env.STAR_ENV);
const c = new pg.Client({ connectionString: env.DATABASE_URL });
await c.connect();
const n = async (w) => Number((await c.query(`select count(*)::int as n from horses where ${w}`)).rows[0].n);
console.log(`\n旧の述語 RACEABLE_WHERE : ${await n(RACEABLE_WHERE)} 頭`);
console.log(`新の述語 ACTIVE_WHERE   : ${await n(ACTIVE_WHERE)} 頭`);
let truncated = null;
const pool = await loadRaceablePool(c, undefined, (e, u) => { truncated = { e, u }; });
console.log(`\n★既定で読んだプール: ${pool.length} 頭（上限 ${RACEABLE_POOL_LIMIT}）`);
if (truncated) console.log(`  ⚠️ 上限で切った: 条件に合う ${truncated.e} 頭 / 読んだ ${truncated.u} 頭`);
const gens = {};
for (const h of pool) gens[h.generation] = (gens[h.generation] ?? 0) + 1;
console.log(`  世代: ${Object.entries(gens).sort((a,b)=>a[0]-b[0]).map(([g,k])=>`${g}:${k}`).join(' ')}`);
const old = Object.keys(gens).filter((g) => Number(g) < 5).length;
console.log(`  ★第 0〜4 世代が入っているか: ${old > 0 ? '✅ 入っている（★PO-4 ① が効いている）' : '🔴 入っていない（★戻っている？）'}`);
await c.end();
