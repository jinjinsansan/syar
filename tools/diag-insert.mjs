/**
 * ★オッズの一括投入が「速いだけ」でないことを確かめる（A-1 の余裕・2026-08-11）
 *
 * 【何を見るか】
 *   1行ずつの投入を `unnest` の一括投入に変えました。速くなるのは目的ですが、
 *   ★**行の中身が1つでも変われば、オッズが変わったということ**です。
 *   §9.2 のオッズはサーバー権威で、プレイヤーはこれを見て買います。
 *
 *   → 同じレースを**同じ種で2回**作り、
 *     ① 旧方式（1行ずつ）と ② 新方式（一括）の**行を全件突き合わせ**ます。
 *     併せて所要時間を測ります。
 *
 * 【★このツールは判定を出します】
 *   1行でも違えば FAIL。速度は参考値として出すだけです。
 *
 * 実行: npx tsx tools/diag-insert.mjs --env staging --cycle 9001
 */
import { createHash, createHmac, randomUUID } from 'node:crypto';
import pg from 'pg';
import {
  PHASE_OFFSET_MS, classOf, conditionsOf, cycleStartMs, gradeOf, prizeTierOf, purseOf,
} from '../packages/scheduler/src/index.ts';
import { buildRace } from '../apps/worker/src/build-race.ts';
import { ODDS_MC_TRIALS } from '../apps/worker/src/odds.ts';
import { loadRaceablePool, loadTrainingStates } from '../apps/worker/src/horse-repo.ts';
import { assertNotProduction } from './lib/guard.mjs';
import { loadEnv } from './lib/env.mjs';

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 ? process.argv[i + 1] : d;
};
/** ★本番と重ならない大きな番号を使う（後片付けで消す） */
const CYCLE = Number(arg('cycle', '900001'));
const TRIALS = Number(arg('trials', String(ODDS_MC_TRIALS)));

const env = loadEnv();
const c = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
await assertNotProduction(c, 'diag-insert.mjs');

const hash = {
  sha256: (m) => createHash('sha256').update(m, 'utf8').digest('hex'),
  hmacSha256: (k, m) => createHmac('sha256', k).update(m, 'utf8').digest('hex'),
};
const EPOCH = Date.parse(env.STAR_EPOCH_ISO);

const pool = await loadRaceablePool(c);
const states = await loadTrainingStates(c);

console.log('# オッズ投入の一括化: 速度と、行が変わっていないかの確認');
console.log(`  試行数 ${TRIALS.toLocaleString()}  母集団 ${pool.length} 頭`);
console.log('');

// ★同じ種・同じサイクルで組む（2回とも同じ中身になるはず）
const built = buildRace(pool, CYCLE, EPOCH, TRIALS, states);
console.log(`  出走 ${built.entrants.length} 頭 / オッズ ${built.odds.length} 点`);
console.log('');

const cleanup = async () => {
  await c.query('delete from race_odds where race_id in (select id from races where cycle_index = any($1))', [[CYCLE, CYCLE + 1]]);
  await c.query('delete from race_entries where race_id in (select id from races where cycle_index = any($1))', [[CYCLE, CYCLE + 1]]);
  await c.query('delete from races where cycle_index = any($1)', [[CYCLE, CYCLE + 1]]);
};
await cleanup();

/** レースの器だけ作る（オッズと出走表は方式ごとに入れる） */
const makeRace = async (cycleIndex) => {
  const raceClass = classOf(cycleIndex);
  const grade = gradeOf(cycleIndex);
  const cond = conditionsOf(cycleIndex, raceClass, grade);
  const id = randomUUID();
  await c.query(
    `insert into races (id, cycle_index, name, class_rank, grade, distance, surface, track_condition,
       course_id, scheduled_at, seed_commit, server_seed, purse, status)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,to_timestamp($10/1000.0),$11,$12,$13,'scheduled')`,
    [id, cycleIndex, `投入方式の比較 ${cycleIndex}`,
     ({ maiden: 1, win1: 2, win2: 3, win3: 4, open: 5, G3: 6, G2: 6, G1: 6 })[prizeTierOf(raceClass, grade)] ?? 1,
     // ★本番と同じにする: track_condition は pg-store が 'good' を直書きしている
     grade, cond.distance, cond.surface, 'good', cond.courseId,
     cycleStartMs(cycleIndex, EPOCH) + PHASE_OFFSET_MS.start,
     hash.sha256(`c-${cycleIndex}`), `s-${cycleIndex}`, purseOf(prizeTierOf(raceClass, grade))],
  );
  return id;
};

// ── ① 旧方式（1行ずつ）──────────────────────────────────
const idOld = await makeRace(CYCLE);
let t0 = process.hrtime.bigint();
await c.query('begin');
for (const e of built.entrants) {
  await c.query(
    `insert into race_entries (race_id, horse_id, gate, weight, strategy, popularity) values ($1,$2,$3,$4,$5,$6)`,
    [idOld, e.horseId, e.gate, e.weightKg, e.strategy, e.popularity ?? null]);
}
for (const o of built.odds) {
  await c.query(
    `insert into race_odds (race_id, bet_type, selection, probability, odds, capped) values ($1,$2,$3::jsonb,$4,$5,$6)`,
    [idOld, o.betType, JSON.stringify(o.selection), o.probability, o.odds, o.capped]);
}
await c.query('commit');
const msOld = Number(process.hrtime.bigint() - t0) / 1e6;

// ── ② 新方式（unnest で一括）────────────────────────────
const idNew = await makeRace(CYCLE + 1);
t0 = process.hrtime.bigint();
await c.query('begin');
await c.query(
  `insert into race_entries (race_id, horse_id, gate, weight, strategy, popularity)
   select $1, t.horse_id, t.gate, t.weight, t.strategy, t.popularity
     from unnest($2::uuid[], $3::int[], $4::numeric[], $5::text[], $6::int[])
       as t(horse_id, gate, weight, strategy, popularity)`,
  [idNew, built.entrants.map((e) => e.horseId), built.entrants.map((e) => e.gate),
   built.entrants.map((e) => e.weightKg), built.entrants.map((e) => e.strategy),
   built.entrants.map((e) => e.popularity ?? null)]);
await c.query(
  `insert into race_odds (race_id, bet_type, selection, probability, odds, capped)
   select $1, t.bet_type, t.selection::jsonb, t.probability, t.odds, t.capped
     from unnest($2::text[], $3::text[], $4::numeric[], $5::numeric[], $6::boolean[])
       as t(bet_type, selection, probability, odds, capped)`,
  [idNew, built.odds.map((o) => o.betType), built.odds.map((o) => JSON.stringify(o.selection)),
   built.odds.map((o) => o.probability), built.odds.map((o) => o.odds), built.odds.map((o) => o.capped)]);
await c.query('commit');
const msNew = Number(process.hrtime.bigint() - t0) / 1e6;

// ── 突き合わせ ────────────────────────────────────────
const fails = [];
const check = (ok, label, detail) => {
  console.log(`  ${ok ? '✓' : '★'} ${label}${detail ? `  ${detail}` : ''}`);
  if (!ok) fails.push(label);
};

const diffOdds = await c.query(
  `select count(*)::int n from (
     (select bet_type, selection, probability, odds, capped from race_odds where race_id = $1
      except all
      select bet_type, selection, probability, odds, capped from race_odds where race_id = $2)
     union all
     (select bet_type, selection, probability, odds, capped from race_odds where race_id = $2
      except all
      select bet_type, selection, probability, odds, capped from race_odds where race_id = $1)
   ) t`, [idOld, idNew]);
const diffEnt = await c.query(
  `select count(*)::int n from (
     (select horse_id, gate, weight, strategy, popularity from race_entries where race_id = $1
      except all
      select horse_id, gate, weight, strategy, popularity from race_entries where race_id = $2)
     union all
     (select horse_id, gate, weight, strategy, popularity from race_entries where race_id = $2
      except all
      select horse_id, gate, weight, strategy, popularity from race_entries where race_id = $1)
   ) t`, [idOld, idNew]);
const cnt = await c.query(
  `select (select count(*) from race_odds where race_id=$1)::int a,
          (select count(*) from race_odds where race_id=$2)::int b`, [idOld, idNew]);

console.log('【判定】★速いだけでなく、行が1つも変わっていないこと');
check(cnt.rows[0].a === cnt.rows[0].b && cnt.rows[0].a === built.odds.length,
  '① オッズの行数が一致', `${cnt.rows[0].a} / ${cnt.rows[0].b}（作った ${built.odds.length}）`);
check(diffOdds.rows[0].n === 0, '② オッズの中身が全件一致', `差 ${diffOdds.rows[0].n} 行`);
check(diffEnt.rows[0].n === 0, '③ 出走表の中身が全件一致', `差 ${diffEnt.rows[0].n} 行`);

console.log('');
console.log('【速度】');
console.log(`  1行ずつ : ${(msOld / 1000).toFixed(1)} 秒`);
console.log(`  一括    : ${(msNew / 1000).toFixed(1)} 秒`);
console.log(`  ★${(msOld / Math.max(1, msNew)).toFixed(0)} 倍速く、${((msOld - msNew) / 1000).toFixed(1)} 秒短縮`);

await cleanup();
await c.end();
console.log('');
console.log(fails.length === 0 ? '★一括投入: PASS — 行は1つも変わっていません' : `★一括投入: FAIL — ${fails.join(' / ')}`);
process.exit(fails.length === 0 ? 0 : 1);
