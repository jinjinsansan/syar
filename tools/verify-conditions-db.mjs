/**
 * ★保存されたレースが「番組表どおり」で、馬場状態が §10.4 の分布に従うか（読むだけ）
 *
 * Q-P3-32 の是正の検証です。レビュー側の指定:
 *   1. `diag-conditions` が 7/7 一致
 *   2. **`track_condition` の分布が CDF と一致**（443件すべて good ではなくなる）
 *
 * 【★是正前に何が起きていたか】
 *   - `cycle-runner` は `conditionsOf(idx)` を保存し、`generateRace` は
 *     **自分で引いた**距離・馬場でオッズを計算していた（本番で 1/7 一致）
 *   - `pg-store` は `track_condition` に **`'good'` を直書き**していた
 *     → 本番443件すべてが良馬場。**道悪が一度も起きず、`heavy_aptitude` が
 *       一度も効いていなかった**（P-1 で genotype に足した形質）
 *
 * 【★このツールが見るのは「保存された結果」です】
 *   `diag-conditions.mjs` はコードの2経路を突き合わせますが、
 *   こちらは **DB に実際に入った行**を見ます。
 *   コードを直しても呼び出し側が古ければ、DB には古い値が入り続けます。
 *
 * 実行: npx tsx tools/verify-conditions-db.mjs --env staging
 */
import pg from 'pg';
import { classOf, conditionsOf, gradeOf } from '../packages/scheduler/src/index.ts';
import { loadEnv } from './lib/env.mjs';

const env = loadEnv();
const c = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

/** ★§10.4 の分布（`race-field.ts` の TRACK_CONDITION_CDF の写し・照合用） */
const EXPECTED = { good: 0.75, yielding: 0.15, soft: 0.07, bad: 0.03 };

const fails = [];
const check = (ok, label, detail) => {
  console.log(`  ${ok ? '✓' : '★'} ${label}${detail ? `  ${detail}` : ''}`);
  if (!ok) fails.push(label);
};

console.log('# 保存されたレースは番組表どおりか（Q-P3-32 の是正の検証）');
console.log('');

// ── ① 番組表との一致 ────────────────────────────────────
const rows = (await c.query(
  `select cycle_index, surface, distance, track_condition, created_at
     from races order by cycle_index desc limit 20`,
)).rows;
if (rows.length === 0) {
  console.error('★レースが1本もありません。seed-races で作ってから流してください');
  await c.end();
  process.exit(2);
}
let match = 0;
console.log('## ① 保存された条件 vs 番組表');
for (const x of rows) {
  const i = Number(x.cycle_index);
  const p = conditionsOf(i, classOf(i), gradeOf(i));
  const ok = p.surface === x.surface && p.distance === Number(x.distance);
  if (ok) match += 1;
  console.log(
    `  cycle ${String(i).padStart(6)}  DB ${`${x.surface}/${x.distance}m/${x.track_condition}`.padEnd(22)}` +
    ` 番組表 ${`${p.surface}/${p.distance}m`.padEnd(14)} ${ok ? '一致' : '★違う'}`,
  );
}
check(match === rows.length, '① 保存された条件が番組表と一致', `${match}/${rows.length}`);
console.log('');

// ── ② 馬場状態の分布 ────────────────────────────────────
console.log('## ② 馬場状態の分布（§10.4）');
const tc = (await c.query(
  'select track_condition t, count(*)::int n from races group by 1',
)).rows;
const total = tc.reduce((a, r) => a + r.n, 0);
const got = Object.fromEntries(tc.map((r) => [r.t, r.n]));
for (const k of Object.keys(EXPECTED)) {
  const n = got[k] ?? 0;
  console.log(`  ${k.padEnd(10)} ${String(n).padStart(4)} 件 (${((n / total) * 100).toFixed(1)}%)  §10.4 は ${(EXPECTED[k] * 100).toFixed(0)}%`);
}
/**
 * ★「分布が一致するか」は本数が少ないと判定できません。
 *   ここでは**良馬場以外が1件でもあるか**だけを見ます。
 *   ★是正前は 443件すべて good で、**道悪が構造的に起こりえません**でした。
 *   割合の検定は本数が揃ってから（照会 Q-P3-33）。
 */
const nonGood = total - (got['good'] ?? 0);
check(nonGood > 0, '② 良馬場以外のレースが存在する（道悪が起こりうる）',
  `${nonGood}/${total} 件が良馬場以外`);
if (total < 100) {
  console.log(`  ⚠️ ${total} 本しかないので**割合の一致は判定していません**（本数が要ります）`);
}
console.log('');

// ── ③ 是正前に作られたレースが残っていないか ───────────────
const old = (await c.query(
  `select count(*)::int n from races
    where track_condition = 'good'
      and created_at < (select min(created_at) from races where track_condition <> 'good')`,
)).rows[0]?.n ?? 0;
if (nonGood > 0 && old > 0) {
  console.log(`## ③ ★是正前に作られたレースが ${old} 本残っています`);
  console.log('   それらは「オッズと条件が食い違う」ままです。判定からは除いていません。');
}

await c.end();
console.log(fails.length === 0
  ? '★Q-P3-32 の検証: PASS'
  : `★Q-P3-32 の検証: FAIL — ${fails.join(' / ')}`);
process.exit(fails.length === 0 ? 0 : 1);
