/**
 * ★**重賞の出走条件: ワーカー（TS）と enter_race（SQL）の判定が 同じ馬・同じ鞍で一致するか**（★2026-09-30・裁定 §11 ①）
 *
 * 【★なぜ要るか】
 *   ★条件の値は 1 か所（`entryConditionsOf`）だが、★**比べる場所が 2 つ**ある:
 *   ★ワーカーの選抜（`meetsEntryConditions`）と ★`enter_race` の SQL（★移行 `0100`）。
 *   ★怪しいのは (i) 齢の基準（両方 そのレースの週か）(ii) 境目（下限は含む・上限は含まない）。
 *
 * 【★何をするか】（★読むだけ・★DB に 1 行も書かない）
 *   ★最新の `enter_race` の本文から ★齢と牝馬の判定の式を ★そのまま切り出し、★staging で `values` の表に当てて評価する。
 *   ★同じ表を TS の `meetsEntryConditions` にも通し、★1 行でも食い違えば 不合格。
 *   ★境目（103/104・155/156・207/208 週）を必ず入れる。
 *
 * 使い方: npx tsx tools/verify-entry-conditions-sql.mjs --env staging
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { loadEnv } from './lib/env.mjs';
import { assertNotProduction } from './lib/guard.mjs';
import { entryConditionsOf, meetsEntryConditions, LIFECYCLE_WEEKS, WEEKS_PER_YEAR } from '../packages/scheduler/src/index.ts';

const MIG = path.resolve('db/migrations');
const files = readdirSync(MIG).filter((f) => f.endsWith('.sql')).sort();
const last = files.filter((f) => /create\s+or\s+replace\s+function\s+public\.enter_race\s*\(/i.test(readFileSync(path.join(MIG, f), 'utf8'))).at(-1);
const body = readFileSync(path.join(MIG, last), 'utf8');

/** ★本文から「拒む」条件を切り出す（★書き写さない） */
const pick = (re, label) => {
  const m = body.match(re);
  if (m === null) throw new Error(`★${last} から ${label} を切り出せません（★本文の形が変わった？）`);
  return m[1];
};
const WEEK = 'coalesce(v_race.game_week, (select game_week from world_state where id))';
const baseReject = pick(/and \(h\.birth_week is null\s+or (coalesce\(v_race\.game_week, \(select game_week from world_state where id\)\) - h\.birth_week < 104)\)/, '齢の門');
const bandReject = pick(/where h\.id = p_horse_id\s+and (\(coalesce\(v_race\.game_week[\s\S]*?max_age_weeks\)\))\s*\) then/, '齢の帯');
const filliesReject = "coalesce(v_race.fillies_only, false) and h.sex <> 'female'";
if (!body.includes("coalesce(v_race.fillies_only, false) and exists (") || !body.includes("h.sex <> 'female'")) throw new Error('★牝馬の判定の形が変わった');
const sub = (s) => s.split(WEEK).join('t.race_week').replaceAll('h.birth_week', 't.birth_week')
  .replaceAll('v_race.min_age_weeks', 't.min_age').replaceAll('v_race.max_age_weeks', 't.max_age')
  .replaceAll('v_race.fillies_only', 't.fillies').replaceAll('h.sex', 't.sex');

/** ★表: 境目の齢 × 3 種の鞍 × 牡牝 */
const two = LIFECYCLE_WEEKS.raceableFrom;
const ages = [two - 1, two, two + WEEKS_PER_YEAR - 1, two + WEEKS_PER_YEAR, two + 2 * WEEKS_PER_YEAR - 1, two + 2 * WEEKS_PER_YEAR, 259];
const races = [null, { age: '2', fillies: true }, { age: '3', fillies: false }, { age: '3+', fillies: true }];
const RACE_WEEK = 1000;
const rows = [];
for (const r of races) for (const a of ages) for (const sex of ['male', 'female']) {
  const c = entryConditionsOf(r);
  rows.push({ label: `${r === null ? '平場' : `${r.age}${r.fillies ? '牝' : ''}`}・齢${a}・${sex}`, c, a, sex });
}

const env = loadEnv();
console.log('接続先:', env.STAR_ENV, '／ 本文:', last);
const client = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
await assertNotProduction(client, 'verify-entry-conditions-sql.mjs');
await client.query('begin read only');
let bad = 0;
try {
  const values = rows.map((x, i) => `(${i}, ${RACE_WEEK}, ${RACE_WEEK - x.a}, '${x.sex}', ${x.c.minAgeWeeks}, ${x.c.maxAgeWeeks ?? 'null'}, ${x.c.filliesOnly})`).join(',\n');
  const q = `select t.i,
      not ( (${sub(baseReject)})
         or (t.min_age is not null and ${sub(bandReject)})
         or (${sub(filliesReject)}) ) as ok
    from (values ${values}) as t(i, race_week, birth_week, sex, min_age, max_age, fillies)
    order by t.i`;
  const r = await client.query(q);
  for (const row of r.rows) {
    const x = rows[row.i];
    const ts = meetsEntryConditions(x.c, { sex: x.sex, ageWeeks: x.a });
    const mark = ts === row.ok ? '✅' : '❌';
    if (ts !== row.ok) bad += 1;
    console.log(`  ${mark} ${x.label.padEnd(18)} TS=${ts ? '出られる' : '出られない'} SQL=${row.ok ? '出られる' : '出られない'}`);
  }
} finally {
  await client.query('rollback');
  await client.end();
}
console.log(`★${rows.length} 行を突き合わせた（★境目 ${ages.join('/')} 週を含む）`);
if (bad > 0) { console.log(`★不合格: 食い違い ${bad} 行`); process.exit(1); }
console.log('★合格（★TS と SQL の判定が すべての行で一致）');
