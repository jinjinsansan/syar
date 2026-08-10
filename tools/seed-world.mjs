/**
 * プリシード世界を DB へ投入する（正典 §10.5 / 合格基準3）。
 *
 * 【★全馬は入れない】
 *   50世代で 40,000頭以上が生まれますが、サービス開始に必要なのは
 *   **現役 + 種牡馬 + 繁殖牝馬 と、その5代血統に現れる祖先**だけです。
 *   全部入れると DB が重くなるうえ、参照されない馬が大半を占めます。
 *   → 必要な馬から**5代さかのぼって到達できる馬だけ**を投入します。
 *
 * 【★親を先に入れる】
 *   horses.sire_id / dam_id は自己参照の外部キーなので、
 *   **親より先に子を入れると失敗します**。世代順に並べてから投入します。
 */
import { readFileSync } from 'node:fs';
import pg from 'pg';
import { ALLOW_ALL_NAMES, NPC_STABLES } from '../packages/sim-engine/src/index.ts';
import { DEFAULT_PRESEED_OPTIONS, preseedNicks, runPreseed } from '../apps/cli/src/preseed.ts';

import { assertNotProduction } from './lib/guard.mjs';
import { loadEnv, positionals } from './lib/env.mjs';

/** ★フラグ（--env など）を除いた位置引数 */
const POS = positionals();
const SEED = Number(POS[0] ?? 20260833);
const GENERATIONS = Number(POS[1] ?? 50);

const env = loadEnv();

console.log(`# プリシード世界の投入  seed=${SEED} generations=${GENERATIONS}`);
const t0 = Date.now();
const pre = runPreseed({
  ...DEFAULT_PRESEED_OPTIONS, seed: SEED, generations: GENERATIONS,
  nicks: preseedNicks(SEED, NPC_STABLES), blocklist: ALLOW_ALL_NAMES,
});
console.log(`  生成 ${pre.world.all.size} 頭（${((Date.now()-t0)/1000).toFixed(1)}秒）`);

// --- 必要な馬 = 現役 + 種牡馬 + 繁殖牝馬、そこから5代さかのぼる ---
const need = new Set([...pre.world.activeIds, ...pre.world.stallionIds, ...pre.world.mareIds]);
let frontier = [...need];
for (let depth = 0; depth < 5; depth += 1) {
  const next = [];
  for (const id of frontier) {
    const r = pre.world.all.get(id)?.record;
    for (const p of [r?.sireId, r?.damId]) {
      if (p && !need.has(p)) { need.add(p); next.push(p); }
    }
  }
  frontier = next;
}
console.log(`  投入対象 ${need.size} 頭（現役+繁殖+5代の祖先）`);

// ★親を先に入れる。世代順に並べる
const rows = [...need].map((id) => pre.world.all.get(id)).filter(Boolean)
  .sort((a, b) => a.record.generation - b.record.generation);

const c = new pg.Client({ connectionString: env.DATABASE_URL, ssl:{rejectUnauthorized:false} });
await c.connect();
// ★状態を変えるツールなので、本番に向いていたら実行しない（R-24）
await assertNotProduction(c, 'seed-world.mjs');

await c.query('delete from horses');
console.log('  既存の馬を削除しました');

// UUID はアプリ側で振り、プリシードの ID と対応づける
const uuid = new Map();
const { randomUUID } = await import('node:crypto');
for (const h of rows) uuid.set(h.record.id, randomUUID());

const stableId = (sid) => Number(String(sid).replace(/\D/g, ''));
let n = 0;
for (const h of rows) {
  const r = h.record;
  await c.query(
    `insert into horses (id, npc_stable_id, name, sex, birth_year, generation,
       sire_id, dam_id, sire_line, dam_sire_line, genotype, potential, stats, unlock_rate,
       surface_aptitude, distance_center, distance_range, strategy_aptitude, heavy_aptitude,
       growth, temper, durability, frail, skill_genes, inbreed_coeff, nicks_multiplier,
       pedigree_cache, foal_count, g1_wins)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29)`,
    [uuid.get(r.id), stableId(h.stableId), h.name, r.sex, r.birthYear, r.generation,
     r.sireId ? uuid.get(r.sireId) ?? null : null, r.damId ? uuid.get(r.damId) ?? null : null,
     r.sireLine, r.damSireLine, JSON.stringify(r.genotype), JSON.stringify(r.potential),
     JSON.stringify(r.stats), r.unlockRate, JSON.stringify(r.surfaceAptitude),
     r.distanceCenter, r.distanceRange, JSON.stringify(r.strategyAptitude), r.heavyAptitude,
     r.growth, r.temper, r.durability, r.frail, JSON.stringify(r.skillGenes),
     r.inbreedCoeff, r.nicksMultiplier, JSON.stringify(Object.fromEntries(r.pedigreeCache)),
     r.foalCount, r.g1Wins],
  );
  n += 1;
  if (n % 2000 === 0) process.stdout.write(`\r  投入 ${n}/${rows.length}`);
}
console.log(`\r  投入 ${n} 頭 完了            `);

const chk = await c.query(`select count(*)::int total,
  count(*) filter (where sire_id is not null)::int with_sire,
  count(distinct sire_line)::int lines from horses`);
console.log('  DB:', JSON.stringify(chk.rows[0]));
await c.end();
