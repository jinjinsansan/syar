/**
 * ★オッズを計算したレースと、DB に保存されたレースが同じか（読むだけ・判定を出す）
 *
 * 【何を見つけたか（2026-08-11）】
 *   レース条件が**2か所で別々に決まっています**:
 *
 *     ① `cycle-runner.ts` → `conditionsOf(idx, ...)`  … **DB に保存される**
 *     ② `race-field.ts` の `generateRace`              … **オッズの MC が前提にする**
 *
 *   `generateRace` は距離も馬場も**自分で引きます**（`rng.pick(DISTANCES)` /
 *   `rng.pick(SURFACES)` / `conditionRoll`）。`conditionsOf` の値は渡されていません。
 *
 *   実測: 7サイクルすべてで**芝/ダートも距離も違いました**（0/7 一致）。
 *
 *   ★確定処理（`settleRace`）は **DB の値**を読んで着順を出します。
 *     つまり **プレイヤーが見るオッズは、実際に走るレースとは別のレースのもの**です。
 *     §8 では距離適性・馬場適性が着順を大きく動かすので、
 *     「同じ馬・違う条件」は「別の馬」と同じくらい結果を変えます。
 *
 * 【★さらに track_condition】
 *   `pg-store.ts` の `createRace` は **`'good'` を直書き**しています。
 *   `generateRace` は稍重・重・不良も引くので、そこも一致しません。
 *
 * 【★これは B-6 / Q-P3-29 と同じ型の3件目です】
 *   ① 調子・疲労（B-6）… 配線済み
 *   ② 能力（PLACEHOLDER_UNLOCK・Q-P3-29）… 廃止の裁定あり
 *   ③ **レース条件（本件）** … いちばん大きい
 *
 * 実行: npx tsx tools/diag-conditions.mjs            # 本番（読むだけ）
 */
import pg from 'pg';
import { deriveRng } from '../packages/sim-engine/src/index.ts';
import { classOf, conditionsOf, gradeOf } from '../packages/scheduler/src/index.ts';
import { generateRace, sortPoolByClass } from '../apps/cli/src/race-field.ts';
import { loadRaceablePool } from '../apps/worker/src/horse-repo.ts';
import { loadEnv } from './lib/env.mjs';

const env = loadEnv();
const c = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

const EPOCH = Date.parse(env.STAR_EPOCH_ISO);
const pool = sortPoolByClass(await loadRaceablePool(c));

console.log('# オッズを計算したレースと、DB に保存されたレースは同じか');
console.log('');
console.log('## ① 生成の2経路を突き合わせる（コードから）');
console.log(`  ${'cycle'.padStart(7)} ${'DBに入る（conditionsOf）'.padEnd(26)} ${'オッズの前提（generateRace）'.padEnd(30)} 判定`);

const idxs = [100, 101, 102, 200, 300, 400, 500];
let same = 0;
for (const idx of idxs) {
  const a = conditionsOf(idx, classOf(idx), gradeOf(idx));
  // ★是正後は番組表を渡す（本番と同じ呼び方・Q-P3-32）
  const b = generateRace(pool, idx, deriveRng(EPOCH, 61, idx), undefined, undefined, undefined,
    { programme: { surface: a.surface, distance: a.distance } }).conditions;
  const ok = a.surface === b.surface && a.distance === b.distance;
  if (ok) same += 1;
  console.log(
    `  ${String(idx).padStart(7)} ${`${a.surface}/${a.distance}m`.padEnd(26)} ` +
    `${`${b.surface}/${b.distance}m/${b.trackCondition}`.padEnd(30)} ${ok ? '一致' : '★違う'}`,
  );
}
console.log(`  → ${same}/${idxs.length} 一致`);
console.log('');

console.log('## ② 実際に保存されたレースの馬場状態');
const tc = await c.query('select track_condition, count(*)::int n from races group by 1 order by 2 desc');
console.log(`  DB: ${tc.rows.map((r) => `${r.track_condition}=${r.n}`).join(' / ') || '（レース無し）'}`);
// ★§10.4 の分布と突き合わせる（是正後は good 以外も出るはず）
const drawn = {};
for (let idx = 0; idx < 2000; idx += 1) {
  const a = conditionsOf(idx, classOf(idx), gradeOf(idx));
  const t = generateRace(pool, idx, deriveRng(EPOCH, 61, idx), undefined, undefined, undefined,
    { programme: { surface: a.surface, distance: a.distance } }).conditions.trackCondition;
  drawn[t] = (drawn[t] ?? 0) + 1;
}
console.log(`  生成側（2000サイクル）: ${Object.entries(drawn).map(([k, v]) => `${k}=${(v / 20).toFixed(1)}%`).join(' / ')}`);
console.log('  ★是正前は pg-store が good を直書きしており、DB は 443件すべて good でした。');
console.log('');

console.log('## ③ なぜ気づきにくいか');
console.log('  ・P1 のゲート（V-4/V-5/V-6）は `verify-race.ts` で測っており、');
console.log('    そこでは**人気推定も着順も同じ `generateRace` の条件**を使うので整合しています。');
console.log('  ・食い違うのは**ワーカー＋DB の経路だけ**です。');
console.log('  ・DB の `races` を見ても「芝1600m」と正しく書いてあり、');
console.log('    **オッズが別の条件で計算されたことはどこにも現れません**。');
console.log('');

const fails = [];
if (same !== idxs.length) {
  fails.push('レース条件が生成と保存で食い違う');
}
console.log(fails.length === 0
  ? '★診断: 食い違いなし'
  : `★診断: ${fails.length} 件の食い違い — ${fails.join(' / ')}`);
console.log('  ★このツールは読むだけです。直し方は裁定を仰ぎます（Q-P3-32）');

await c.end();
process.exit(fails.length === 0 ? 0 : 1);
