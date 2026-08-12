/**
 * ★出走馬の凍結（0016）が効いているかを実測する
 *
 * 【何を確かめるか】
 *   裁定は「監視ではなく構造で守れ」でした。だから確かめるのは
 *   **「食い違いが無いこと」ではなく「食い違いが起こりえないこと」**です。
 *   ★前者だけなら `diag-b6` で足ります。それは**監視**であって、
 *     「たまたま今は一致している」としか言えません。
 *
 * 【★決定的な検査】
 *   ③ **horses を壊してから確定しても、凍結どおりの着順になる**
 *      凍結を使っていなければ、壊した値で走るので着順が変わります。
 *   ★③がこのツールの全部です。①②④は前提と後始末の確認にすぎません。
 *
 * 【なぜ確定を2回やらないか】
 *   `settleRace` は内部で begin/commit するので savepoint で巻き戻せません
 *   （実際に 25P01 で落ちました）。**確定は1回**にして、
 *   「凍結からエンジンを回した着順」と突き合わせます。
 *
 * 実行: npx tsx tools/verify-entrant-freeze.mjs --env staging
 */
import { createHash, createHmac } from 'node:crypto';
import pg from 'pg';
import { createPgStore } from '../apps/worker/src/pg-store.ts';
import { settleRace as settleRaceFair } from '../apps/worker/src/settle.ts';
import { assertNotProduction } from './lib/guard.mjs';
import { loadEnv } from './lib/env.mjs';

const env = loadEnv();
const c = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
// ★③で horses を壊すので、**状態を変えるツール**です（R-24）
await assertNotProduction(c, 'verify-entrant-freeze.mjs');

const hash = {
  sha256: (m) => createHash('sha256').update(m, 'utf8').digest('hex'),
  hmacSha256: (k, m) => createHmac('sha256', k).update(m, 'utf8').digest('hex'),
};
const fails = [];
const check = (ok, label, detail) => {
  console.log(`  ${ok ? '✓' : '★'} ${label}${detail ? `  ${detail}` : ''}`);
  if (!ok) fails.push(label);
};

console.log('# ★出走馬の凍結（0016）が構造で守っているか');
console.log('');

const race = (await c.query(
  `select r.id, r.cycle_index, r.server_seed, r.distance, r.surface, r.track_condition
     from races r
    where r.status = 'scheduled'
      and exists (select 1 from race_entries e where e.race_id = r.id and e.entrant_snapshot is not null)
    order by r.cycle_index limit 1`,
)).rows[0];
if (race === undefined) {
  console.error('★凍結を持つ発売中のレースがありません。seed-races で作ってから流してください');
  await c.end();
  process.exit(2);
}
console.log(`  対象 cycle=${race.cycle_index}`);

const entries = (await c.query(
  `select e.gate, e.horse_id, e.entrant_snapshot from race_entries e
    where e.race_id = $1 order by e.gate`, [race.id],
)).rows;

// ── ① 凍結が全馬に入っている ─────────────────────────────
const missing = entries.filter((e) => e.entrant_snapshot === null);
check(missing.length === 0, '① 凍結が全馬に入っている',
  `${entries.length - missing.length}/${entries.length} 頭`);

// ── ② 凍結が RaceEntrant 一式を持っている ─────────────────
//    ★調子・疲労だけでは足りません。確定側は能力・適性・スキル遺伝子まで読み直します
const NEEDED = ['stats', 'surfaceAptitude', 'distanceCenter', 'distanceRange',
  'strategyAptitude', 'heavyAptitude', 'strategy', 'condition', 'fatigue',
  'weightKg', 'gate', 'age', 'skillGenes'];
const incomplete = entries.filter((e) => e.entrant_snapshot === null
  || NEEDED.some((k) => e.entrant_snapshot[k] === undefined));
check(incomplete.length === 0, '② 凍結が RaceEntrant 一式を持っている',
  incomplete.length === 0 ? `${NEEDED.length} 項目すべて` : `不足 ${incomplete.length} 頭`);

if (fails.length > 0) {
  console.error('');
  console.error('★前提が崩れているので③は測れません（★「測れなかった」は「通った」ではありません）');
  await c.end();
  process.exit(1);
}

// ── ★③ horses を壊しても凍結どおりの着順になるか ──────────
console.log('');
console.log('【★本題】horses を壊してから確定し、凍結どおりの着順になるか');

// ★凍結から**自分でエンジンを回して**期待値を作る（DB の horses は一切見ない）
const expected = settleRaceFair(
  {
    conditions: {
      raceId: race.id,
      distance: Number(race.distance),
      surface: race.surface,
      trackCondition: race.track_condition,
      courseShape: 'oval',
      baseWeightKg: 55,
    },
    entrants: entries.map((e) => ({ ...e.entrant_snapshot, horseId: String(e.gate) })),
    serverSeed: race.server_seed,
  },
  hash,
).order.map((o) => o.horseId).join(',');

/**
 * ★**対照**: 壊した値で走らせたら、本当に違う着順になるのか。
 *   これを確かめないと、③は「壊し方が効いていないので一致した」でも成立します
 *   （R-21: 通ったことは、正しい理由で通ったことを意味しない）。
 */
const brokenOrder = settleRaceFair(
  {
    conditions: {
      raceId: race.id,
      distance: Number(race.distance),
      surface: race.surface,
      trackCondition: race.track_condition,
      courseShape: 'oval',
      baseWeightKg: 55,
    },
    // ★壊し方: **出走馬どうしで能力を入れ替える**。
    //   「全馬を同じ値にする」は値域外で NaN になりました（実際に落ちました）。
    //   入れ替えなら値域内のまま、着順は確実に変わります。
    entrants: entries.map((e, i) => ({
      ...e.entrant_snapshot,
      horseId: String(e.gate),
      stats: entries[entries.length - 1 - i].entrant_snapshot.stats,
      condition: entries[entries.length - 1 - i].entrant_snapshot.condition,
      fatigue: entries[entries.length - 1 - i].entrant_snapshot.fatigue,
    })),
    serverSeed: race.server_seed,
  },
  hash,
).order.map((o) => o.horseId).join(',');
check(brokenOrder !== expected,
  '★対照: 壊した値で走らせれば着順は変わる（＝③が空振りでない）',
  `壊した値なら ${brokenOrder}`);
if (brokenOrder === expected) {
  console.error('  ★壊し方が効いていません。この状態で③が通っても意味がないので中止します');
  await c.end();
  process.exit(1);
}

const ids = entries.map((e) => e.horse_id);
const saved = (await c.query(
  `select id, condition, fatigue, stats from horses where id = any($1::uuid[])`, [ids],
)).rows;

const store = createPgStore(c, hash);
let actual = null;
try {
  // ★大きく壊す（凍結を使っていなければ着順は必ず変わる規模）
  // ★対照と**同じ壊し方**を DB に当てる（違う壊し方だと比較にならない）
  for (let i = 0; i < entries.length; i += 1) {
    const src = entries[entries.length - 1 - i].entrant_snapshot;
    await c.query(
      'update horses set condition = $2, fatigue = $3, stats = $4 where id = $1',
      [entries[i].horse_id, src.condition, src.fatigue, JSON.stringify(src.stats)],
    );
  }
  console.log(`  horses を壊しました: ${entries.length} 頭（出走馬どうしで能力・調子・疲労を入れ替え）`);
  await store.settleRace(Number(race.cycle_index));
  actual = (await c.query(
    `select gate, finish_pos from race_entries
      where race_id = $1 and finish_pos is not null order by finish_pos`, [race.id],
  )).rows.map((r) => String(r.gate)).join(',');
} finally {
  // ★staging の実データを壊したまま終わらない
  for (const h of saved) {
    await c.query('update horses set condition = $2, fatigue = $3, stats = $4 where id = $1',
      [h.id, h.condition, h.fatigue, h.stats]);
  }
}

console.log(`  凍結から計算した着順: ${expected}`);
console.log(`  実際に確定した着順  : ${actual}`);
check(actual !== null && actual === expected,
  '★③ horses を壊しても凍結どおりの着順になる（＝確定が凍結を使っている）',
  actual === expected ? '完全一致' : '★食い違う＝horses を読み直している');

// ── ④ 壊した horses を戻せている ──────────────────────────
// ★入れ替えを戻せたか＝保存した値と DB が1頭ずつ一致するか（★平均で見ない）
const now = (await c.query(
  `select id, condition, fatigue, stats from horses where id = any($1::uuid[])`, [ids],
)).rows;
const byId = new Map(now.map((r) => [r.id, r]));
const notRestored = saved.filter((h) => {
  const r = byId.get(h.id);
  return r === undefined || Number(r.condition) !== Number(h.condition)
    || Number(r.fatigue) !== Number(h.fatigue)
    || JSON.stringify(r.stats) !== JSON.stringify(h.stats);
});
check(notRestored.length === 0, '④ 壊した horses を1頭ずつ元に戻せている',
  `${saved.length - notRestored.length}/${saved.length} 頭が一致`);

await c.end();
console.log('');
console.log(fails.length === 0
  ? '★出走馬の凍結: PASS — 4項目すべて成立（★③が本題）'
  : `★出走馬の凍結: FAIL — ${fails.join(' / ')}`);
process.exit(fails.length === 0 ? 0 : 1);
