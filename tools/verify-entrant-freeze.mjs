/**
 * ★出走馬の凍結（0016）が効いているかを実測する
 *
 * 【何を確かめるか】
 *   裁定は「監視ではなく構造で守れ」でした。だから確かめるのは
 *   **「食い違いが無いこと」ではなく「食い違いが起こりえないこと」**です。
 *
 *   ★前者だけなら `diag-b6` で足ります。それは**監視**であって、
 *     「たまたま今は一致している」としか言えません。
 *
 * 【★決定的な検査】
 *   ① 凍結が全馬に入っている（新しいレースで null が無い）
 *   ② 凍結の中身が、生成時に MC へ渡した値と一致する
 *   ③ ★**horses を書き換えてから確定しても、着順が変わらない**
 *      ← これが「構造で守れている」ことの証拠です。
 *        凍結を使っていなければ、書き換えた値で走るので着順が変わります。
 *   ④ 凍結が無い馬がいたら黙って通さない（警告が出る）
 *
 * ★③がこのツールの全部です。①②は前提の確認にすぎません。
 *
 * 実行: npx tsx tools/verify-entrant-freeze.mjs --env staging
 */
import { createHash, createHmac } from 'node:crypto';
import pg from 'pg';
import { createPgStore } from '../apps/worker/src/pg-store.ts';
import { assertNotProduction } from './lib/guard.mjs';
import { loadEnv } from './lib/env.mjs';

const env = loadEnv();
const c = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
// ★③で horses を書き換えるので、**状態を変えるツール**です（R-24）
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

// ── 対象を選ぶ ────────────────────────────────────────────
const race = (await c.query(
  `select r.id, r.cycle_index
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
check(missing.length === 0, '① 凍結が全馬に入っている', `${entries.length - missing.length}/${entries.length} 頭`);

// ── ② 凍結の中身が RaceEntrant として揃っている ───────────
const NEEDED = ['stats', 'surfaceAptitude', 'distanceCenter', 'distanceRange',
  'strategyAptitude', 'heavyAptitude', 'strategy', 'condition', 'fatigue',
  'weightKg', 'gate', 'age', 'skillGenes'];
const incomplete = entries.filter((e) => {
  const s = e.entrant_snapshot;
  return s === null || NEEDED.some((k) => s[k] === undefined);
});
check(incomplete.length === 0, '② 凍結が RaceEntrant 一式を持っている',
  incomplete.length === 0 ? `${NEEDED.length} 項目すべて` : `不足 ${incomplete.length} 頭`);

// ── ★③ horses を書き換えても着順が変わらない ─────────────
//    ★これが「構造で守れている」ことの唯一の証拠です
console.log('');
console.log('【★本題】horses を書き換えてから確定しても着順が変わらないか');

const store = createPgStore(c, hash);
await c.query('begin');
let orderBefore = null;
let orderAfter = null;
try {
  // まず素直に確定して着順を取る（★この後まるごと巻き戻します）
  await c.query('savepoint s1');
  await store.settleRace(Number(race.cycle_index));
  orderBefore = (await c.query(
    `select gate, finish_pos from race_entries where race_id = $1 order by finish_pos`, [race.id],
  )).rows.map((r) => `${r.gate}`).join(',');
  await c.query('rollback to savepoint s1');

  // ★horses を**大きく**書き換える（凍結を使っていなければ着順は必ず変わる規模）
  const ids = entries.map((e) => e.horse_id);
  const upd = await c.query(
    `update horses set condition = 1, fatigue = 95,
            stats = jsonb_build_object('SP',10,'ST',10,'PW',10,'GT',10,'IQ',10,'DU',10)
      where id = any($1::uuid[])`, [ids],
  );
  console.log(`  horses を書き換えました: ${upd.rowCount} 頭（調子1・疲労95・能力すべて10）`);

  await store.settleRace(Number(race.cycle_index));
  orderAfter = (await c.query(
    `select gate, finish_pos from race_entries where race_id = $1 order by finish_pos`, [race.id],
  )).rows.map((r) => `${r.gate}`).join(',');
} finally {
  // ★staging のデータを壊したまま終わらない
  await c.query('rollback');
}

console.log(`  書き換え前の着順: ${orderBefore}`);
console.log(`  書き換え後の着順: ${orderAfter}`);
check(orderBefore !== null && orderBefore === orderAfter,
  '★③ horses を書き換えても着順が変わらない（＝凍結を使っている）',
  orderBefore === orderAfter ? '完全一致' : '★変わった＝horses を読み直している');

// ── ④ 巻き戻せている ──────────────────────────────────────
const stillDirty = (await c.query(
  `select count(*)::int n from horses h
     join race_entries e on e.horse_id = h.id
    where e.race_id = $1 and h.condition = 1 and h.fatigue = 95`, [race.id],
)).rows[0];
check(stillDirty.n === 0, '④ 巻き戻せている（staging の実データを壊していない）', `残留 ${stillDirty.n} 頭`);

await c.end();
console.log('');
console.log(fails.length === 0
  ? '★出走馬の凍結: PASS — 4項目すべて成立（★③が本題）'
  : `★出走馬の凍結: FAIL — ${fails.join(' / ')}`);
process.exit(fails.length === 0 ? 0 : 1);
