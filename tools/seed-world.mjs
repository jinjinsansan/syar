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
 *
 * 【🔴 ★2026-09-20 — ★この道具は「誰が現役か」と「いつ生まれたか」を捨てていました】
 *   ✔ ★**実測**（`evidence/20260920-world-supply/`・★DB に繋がず）:
 *     ★投入 **7,370 頭** ＝ 現役 2,400 ＋ 種牡馬 200 ＋ 繁殖牝馬 800 ＋ 5 代の祖先。
 *     ★このうち ★**4,970 頭（67%）は、★プリシード世界では走り終えた馬**です。
 *   ★しかし `insert` の列に ★**`birth_week` も `retired_at_week` もありませんでした**。
 *   → ★★**引退済みの 4,970 頭が DB では「現役」**になり、★種牡馬・繁殖牝馬まで出走表に載りえた。
 *   → ★★**`birth_week` が null なので、★育成が 1 頭も進まなかった**（★`PROD-NEVER-AGED`）。
 *   ✅ ★これは ★**`PO-8`（母数の帳簿が合わない）の答え**でした —
 *     ★正典 §10.5 の **2,500** と ★実際の現役 **2,400** は ★**ほぼ一致していました**。
 *
 *   ★**直し方は「発明」ではなく「転記」です。** ★プリシード世界は誰が現役かを知っています。
 *
 * 【★生まれた週の配り方 ＝ ★案 B-3（裁定 2026-09-20）】
 *   ★規則そのものは ★**製品側**（`@star/scheduler` の `birth-week.ts`）にあります。
 *   ★この道具は**適用するだけ**です（★D-052: ★正を道具側に置かない）。
 */
import pg from 'pg';
import { ALLOW_ALL_NAMES, NPC_STABLES } from '../packages/sim-engine/src/index.ts';
import { DEFAULT_PRESEED_OPTIONS, preseedNicks, runPreseed } from '../apps/cli/src/preseed.ts';
import {
  LIFECYCLE_WEEKS, birthWeekOf, rankByStableKey, weekIndexAt,
} from '../packages/scheduler/src/index.ts';
import { advanceTrainingWeeks } from '../apps/worker/src/training-runner.ts';

import { assertNotProduction } from './lib/guard.mjs';
import { loadEnv, positionals } from './lib/env.mjs';

/** ★フラグ（--env など）を除いた位置引数 */
const POS = positionals();
const SEED = Number(POS[0] ?? 20260833);
const GENERATIONS = Number(POS[1] ?? 50);
/**
 * ★**育成の追いつきを流すか**（★決め C）。
 *
 * ⚠️ ★既定は **流す**。★`--no-catch-up` で止められます（★所要を測るとき用）。
 * 🔴 ★止めると ★**4 歳の馬が創始のままの能力（素質開放率 0.28〜0.35）で立ちます**。
 *    ★世界としては嘘なので、★**本番の投入では止めないでください**。
 */
const CATCH_UP = !process.argv.includes('--no-catch-up');

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

// ─────────────────────────────────────────────────────────
// ★生まれた週・引退を決める（★決め A ＋ B-3）
// ─────────────────────────────────────────────────────────
/**
 * ★**基準の週**。★ゲーム内時刻の真実は Postgres の `now()` だけです（§14・憲法 §1-4）。
 *   ★`Date.now()` は使いません。
 */
const EPOCH = Date.parse(env.STAR_EPOCH_ISO);
if (!Number.isFinite(EPOCH)) throw new Error('seed-world: STAR_EPOCH_ISO を読めません');
const nowMs = Number(
  (await c.query('select (extract(epoch from now()) * 1000)::bigint as ms')).rows[0].ms,
);
/** ★「締まった週」。★いまの週はまだ締まっていないので使いません */
const referenceWeek = weekIndexAt(nowMs, EPOCH) - 1;

/** ★歳（＝ 最終年 − 生まれ年）ごとにコホートを作る */
const cohortOf = new Map();
for (const h of rows) {
  const age = pre.world.year - h.record.birthYear;
  if (!cohortOf.has(age)) cohortOf.set(age, []);
  cohortOf.get(age).push(h.record.id);
}
/** ★コホート内の順位（★プリシードの id から。★`randomUUID` からではない・決定論） */
const rankOf = new Map();
for (const [age, ids] of cohortOf) {
  const ranks = rankByStableKey(ids);
  for (const [id, r] of ranks) rankOf.set(id, { rank: r, size: ids.length, age });
}

const activeIdSet = new Set(pre.world.activeIds);
const stallionIdSet = new Set(pre.world.stallionIds);
const mareIdSet = new Set(pre.world.mareIds);

/**
 * ★その馬の一生の列を作る（★転記であって発明ではありません）。
 *
 * ★**現役**       … 引退の 3 列は null。★`last_processed_week` は調教開始の週
 *                    （★そこから `advanceTrainingWeeks` が追いつかせます・決め C）
 * ★**引退済み**   … 260 週で引退した、として 3 列を埋める。★役割はプリシード世界のとおり
 */
function lifeColumns(preseedId) {
  const { rank, size, age } = rankOf.get(preseedId);
  const birthWeek = birthWeekOf(referenceWeek, age, rank, size);
  if (activeIdSet.has(preseedId)) {
    return {
      birthWeek,
      lastProcessedWeek: birthWeek + LIFECYCLE_WEEKS.trainableFrom,
      retiredAtWeek: null, retirementRole: null, retirementReason: null,
    };
  }
  const retiredAtWeek = birthWeek + LIFECYCLE_WEEKS.retireAt;
  const role = stallionIdSet.has(preseedId) ? 'stallion'
    : mareIdSet.has(preseedId) ? 'broodmare'
      : 'honored';
  return {
    birthWeek,
    lastProcessedWeek: retiredAtWeek,
    retiredAtWeek,
    retirementRole: role,
    // ★§7.1 の強制引退。★プリシードに故障の記録は無いので `age` 一択
    retirementReason: 'age',
  };
}

await c.query('delete from horses');
console.log('  既存の馬を削除しました');

// UUID はアプリ側で振り、プリシードの ID と対応づける
const uuid = new Map();
const { randomUUID } = await import('node:crypto');
for (const h of rows) uuid.set(h.record.id, randomUUID());

const stableId = (sid) => Number(String(sid).replace(/\D/g, ''));
let n = 0;
const tally = { active: 0, stallion: 0, broodmare: 0, honored: 0 };
for (const h of rows) {
  const r = h.record;
  const life = lifeColumns(r.id);
  tally[life.retirementRole ?? 'active'] += 1;
  await c.query(
    `insert into horses (id, npc_stable_id, name, sex, birth_year, generation,
       sire_id, dam_id, sire_line, dam_sire_line, genotype, potential, stats, unlock_rate,
       surface_aptitude, distance_center, distance_range, strategy_aptitude, heavy_aptitude,
       growth, temper, durability, frail, skill_genes, inbreed_coeff, nicks_multiplier,
       pedigree_cache, foal_count, g1_wins,
       birth_week, last_processed_week, retired_at_week, retirement_role, retirement_reason)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,
             $30,$31,$32,$33,$34)`,
    [uuid.get(r.id), stableId(h.stableId), h.name, r.sex, r.birthYear, r.generation,
     r.sireId ? uuid.get(r.sireId) ?? null : null, r.damId ? uuid.get(r.damId) ?? null : null,
     r.sireLine, r.damSireLine, JSON.stringify(r.genotype), JSON.stringify(r.potential),
     JSON.stringify(r.stats), r.unlockRate, JSON.stringify(r.surfaceAptitude),
     r.distanceCenter, r.distanceRange, JSON.stringify(r.strategyAptitude), r.heavyAptitude,
     r.growth, r.temper, r.durability, r.frail, JSON.stringify(r.skillGenes),
     r.inbreedCoeff, r.nicksMultiplier, JSON.stringify(Object.fromEntries(r.pedigreeCache)),
     r.foalCount, r.g1Wins,
     life.birthWeek, life.lastProcessedWeek,
     life.retiredAtWeek, life.retirementRole, life.retirementReason],
  );
  n += 1;
  if (n % 2000 === 0) process.stdout.write(`\r  投入 ${n}/${rows.length}`);
}
console.log(`\r  投入 ${n} 頭 完了            `);
console.log(`  ★基準の週 ${referenceWeek}`);
console.log(`  ★現役 ${tally.active} 頭 / 種牡馬 ${tally.stallion} / 繁殖牝馬 ${tally.broodmare}`
  + ` / 功労馬 ${tally.honored}`);

// ─────────────────────────────────────────────────────────
// ★決め C — ★能力は**本番の経路**で作る
// ─────────────────────────────────────────────────────────
/**
 * 🔴 ★`stats` を計算して直書きしません。
 *    ★正典 §10.5「NPC 馬はプレイヤー馬と**同一の遺伝エンジン**で生成。
 *    ★**専用の簡易ロジックを作らない**（同じ土俵にいることが公正性の担保）」に正面から反します。
 *
 * ⚠️ ★**引退済みの馬は追いつかせません。**
 *    ✔ ★理由（★数えました・2026-09-20）: ★`packages/sim-engine/src/breeding.ts` の `breed()` が
 *      ★親から読むのは ★**`genotype` / 血統 / `birthYear` / `foalCount` / `g1Wins`** で、
 *      ★**`stats` を 1 度も読みません**。→ ★引退馬の `stats` は何にも効きません。
 *    ★これが違っていたら、ここの `activeOnly` を外すだけで直ります。
 */
if (!CATCH_UP) {
  console.log('');
  console.log('  ⚠️ ★--no-catch-up: ★育成の追いつきを流していません。');
  console.log('     ★4 歳の馬も創始のままの能力です（★世界としては未完成）。');
} else {
  console.log('');
  console.log('  ★育成を追いつかせます（★本番と同じ `advanceTrainingWeeks` を呼びます）');
  const tCatch = process.hrtime.bigint();
  let rounds = 0;
  let advanced = 0;
  let retired = 0;
  for (;;) {
    rounds += 1;
    if (rounds > 400) throw new Error('seed-world: 400 回 呼んでも追いつきません（上限）');
    const r = await advanceTrainingWeeks(c, nowMs, EPOCH, (m) => console.log(`    ★警報: ${m}`));
    advanced += r.advanced;
    retired += r.retired;
    if (r.advanced === 0) break;
    if (rounds % 10 === 0) {
      const p = (await c.query(
        `select min(last_processed_week - birth_week)::int mn
           from horses where retired_at_week is null and birth_week is not null`,
      )).rows[0];
      process.stdout.write(`\r    ${rounds} 回目 … いちばん遅い馬の週齢 ${p.mn}      `);
    }
  }
  const sec = Number(process.hrtime.bigint() - tCatch) / 1e9;
  process.stdout.write('\r                                                        \r');
  console.log(`  ★${rounds} 回で追いつきました`
    + `（延べ ${advanced.toLocaleString()} 頭週 / 引退 ${retired} 頭 / ${sec.toFixed(0)}秒）`);
}

// ─────────────────────────────────────────────────────────
// ★確かめる
// ─────────────────────────────────────────────────────────
const chk = await c.query(`select count(*)::int total,
  count(*) filter (where sire_id is not null)::int with_sire,
  count(distinct sire_line)::int lines,
  count(*) filter (where retired_at_week is null)::int active,
  count(*) filter (where birth_week is null)::int no_birth_week,
  count(distinct birth_week) filter (where retired_at_week is null)::int active_birth_weeks
  from horses`);
console.log('  DB:', JSON.stringify(chk.rows[0]));

const fails = [];
const check = (ok, label, detail) => {
  console.log(`  ${ok ? '✓' : '★'} ${label}${detail ? `  ${detail}` : ''}`);
  if (!ok) fails.push(label);
};
const d = chk.rows[0];
check(d.no_birth_week === 0, '① ★`birth_week` が無い馬が 0 頭（★PROD-NEVER-AGED）',
  `${d.no_birth_week} 頭`);
check(d.active === tally.active, '② ★現役の頭数がプリシード世界と一致（★SEED-NOT-RETIRED）',
  `DB ${d.active} / プリシード ${tally.active}`);
check(d.active_birth_weeks >= 100, '③ ★現役の `birth_week` が散っている（★SEED-LOCKSTEP）',
  `${d.active_birth_weeks} 種類`);

await c.end();
console.log('');
console.log(fails.length === 0 ? '★世界を作りました' : `★FAIL — ${fails.join(' / ')}`);
process.exit(fails.length === 0 ? 0 : 1);
