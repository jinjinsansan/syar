/**
 * ★**初期馬の絞り方を実測する**（★UI1-7・2026-09-19）
 *   ★裁定 `REVIEW_UI1_SELECTION_RULE_VERDICT_20260919.md`
 *
 * 【★見るもの 2 つ】
 *   ★**② 分布** … ★**D-079 ③**「再付与で得られる素質分布が初回と同じ」
 *     ★`pick_initial_horse()` を N 回引き、★**引かれた馬の段の分布**が
 *     ★**候補プールの段の分布**と一致するかを見ます。
 *   ★**④ 同時登録** … ★**別の接続が同じ馬を引かないこと**（`for update ... skip locked`）。
 *
 * 【★R-30: 測定器は評価者と同じ入力を見る】
 *   ⚠️ ★**問い合わせの写しを測りません。** ★`pick_initial_horse()` を ★**そのまま呼びます**
 *      （★`create_account` が呼ぶのと同じ関数）。★写しを測ると、★本体を変えた日に静かに乖離します。
 *
 * 【🔴 ★同じトランザクションの中では、錠は自分を除外しません】✔ 実測して直しました
 *   ★`skip locked` が飛ばすのは ★**他のトランザクションが掴んでいる行だけ**です。
 *   ★**自分が既に掴んでいる行は、そのまま返ります。**
 *   → ★この道具は 1 つのトランザクションで回すので、★**各回は独立**（★復元抽出）です。
 *     ★一様性の検査としては、これがもっとも素直な形です（★二項分布そのまま）。
 *   ⚠️ ★**錠が仕事をするのは「別の接続との間」だけ** → ★それは ④ で、接続を 2 本開いて測ります。
 *   ★**旧版は「非復元抽出になる」と書いていました — 違いました。**
 *     ★同じ馬が 2 回引かれて気づきました（★測ってから直した形）。
 *
 * 【★何も消費しません】★最後に `rollback` します。★`insert` / `update` / `delete` を 1 つも書きません。
 *
 * 【★使い方】
 *   `npx tsx tools/verify-initial-horse-distribution.mjs --env staging [--draws 1000]`
 *
 * ⚠️ ★**合否は出しません**（R-3）。★測った値と、★偏りの大きさ（SE 何個ぶんか）を出します。
 */

import pg from 'pg';
import { loadEnv } from './lib/env.mjs';
import { assertNotProduction } from './lib/guard.mjs';
import { parseArgs } from './lib/args.mjs';
import { bandOfPotential } from '../packages/sim-engine/src/index.js';

const { flags } = parseArgs(process.argv.slice(2), ['--env', '--draws']);
const DRAWS = Number(flags['--draws'] ?? 1000);
if (!Number.isInteger(DRAWS) || DRAWS < 100) {
  throw new Error(`--draws は 100 以上の整数です（受け取った値: ${flags['--draws']}）`);
}

const env = loadEnv();
const client = new pg.Client({ connectionString: env.DATABASE_URL });
await client.connect();
/**
 * 🔴 ★**本番に向けません**（★分類簿でも STATE_CHANGING）。
 *   ★データは 1 ビットも変えません（★最後に `rollback`）が、
 *   ★**`for update` で数千行の錠を数分間掴ります**。
 *   → ★本番でやると ★**ワーカーを待たせます**（★サイクルは 6 分です）。
 *   ★「読むだけなら本番でもよい」は、★**錠を掴る読み方には当てはまりません。**
 */
await assertNotProduction(client, 'verify-initial-horse-distribution.mjs');
console.log(`接続しました ／ 引く回数 ${DRAWS.toLocaleString()}`);

/** ★素質 → 段（★唯一の出どころ。★SQL では計算しない・D-052） */
const bandOf = (potential) => {
  const p = {};
  for (const k of ['sp', 'st', 'pw', 'gt', 'iq']) {
    const v = Number(potential[k]);
    if (!Number.isFinite(v)) throw new Error(`素質 ${k} を数値として読めません`);
    p[k] = v;
  }
  return bandOfPotential(p);
};

// ── ① 候補プールの段の分布（★期待値の側）────────────────────────
//    ⚠️ ★候補の条件を書き写しません。★`initial_horse_candidates()` をそのまま呼びます（D-052）
const pool = await client.query(
  `select h.id, h.potential
     from initial_horse_candidates() c
     join horses h on h.id = c`,
);
if (pool.rows.length === 0) {
  console.error('🔴 ★候補が 0 頭です。★「偏っていない」ではなく「測っていない」状態です（R-21）');
  await client.end();
  process.exit(1);
}
const poolBand = new Map();
for (const r of pool.rows) {
  const b = bandOf(r.potential);
  poolBand.set(b, (poolBand.get(b) ?? 0) + 1);
}
const potentialById = new Map(pool.rows.map((r) => [r.id, r.potential]));
console.log(`候補プール ${pool.rows.length.toLocaleString()} 頭 ／ 段の種類 ${poolBand.size}`);

// ── ② N 回引く（★1 往復・★何も消費しない）───────────────────────
//
//   【★なぜ 1 往復にまとめるのか】✔ 実測しました
//     ★1 回ごとに `begin` / `select` / `rollback` を送る形は ★300 回で 217 秒でした。
//     ★内訳の大半は ★網の往復です（★1 回につき 3 往復 × 300 ＝ 900 往復）。
//     → ★測りたいのは分布であって網の速さではありません。★サーバー側で回します。
//
//   ⚠️ ★**文の制限時間を伸ばします**（★`set local` なのでこのトランザクション限り）。
//      ★`pick_initial_horse()` は ★1 回 64 ms（★候補 6,601 頭・staging 実測・2026-09-19）で、
//      ★1,000 回なら約 64 秒です。★既定の制限だと 2,000 回で落ちました。
const t0 = Date.now();
await client.query('begin');
await client.query("set local statement_timeout = '600s'");
// ⚠️ ★**一時表を使いません** — ★`insert into` を 1 つも書かないためです
//    （★分類簿の裏取りが「読取専用なのに書き込み文がある」と正しく指摘しました）。
//    ★行をそのまま受け取れば足ります。
const got = await client.query(
  `select pick_initial_horse() as id from generate_series(1, ${DRAWS})`,
);
await client.query('rollback');   // ★何も残しません（★掴んだ錠もここで全部外れます）
const elapsed = (Date.now() - t0) / 1000;

const drawnBand = new Map();
let nulls = 0;
for (const row of got.rows) {
  if (row.id === null) { nulls += 1; continue; }
  // ⚠️ ★同じ馬が何度も出ます（★復元抽出・上の註記）。★壊れではありません
  const potential = potentialById.get(row.id);
  if (potential === undefined) {
    // ★候補の集合に無い馬が返った ＝ 述語と選び方が食い違っている
    throw new Error(`🔴 ★候補に無い馬が返りました: ${row.id}（★述語と選び方が食い違っています）`);
  }
  const b = bandOf(potential);
  drawnBand.set(b, (drawnBand.get(b) ?? 0) + 1);
}
const drawn = got.rows.length - nulls;
console.log(
  `引けた ${drawn.toLocaleString()} / ${DRAWS.toLocaleString()}（★null ${nulls}）` +
  `／ 所要 ${elapsed.toFixed(1)} 秒 ＝ 1 回あたり ${((elapsed * 1000) / DRAWS).toFixed(1)} ms`,
);
if (nulls > 0) {
  console.log('  ⚠️ ★null は「掴めなかった」回です（★他の接続が掴んでいた／候補が尽きた）');
}

// ── ③ 突き合わせ（★偏りを SE 何個ぶんかで出す）──────────────────
console.log('');
console.log('  段    候補プール    期待     実測    ずれ（SE）');
console.log('  ----------------------------------------------');
let maxZ = 0;
let maxZBand = null;
let plus = 0;
let minus = 0;
for (const b of [...poolBand.keys()].sort((x, y) => x - y)) {
  const share = (poolBand.get(b) ?? 0) / pool.rows.length;
  const expected = share * drawn;
  const observed = drawnBand.get(b) ?? 0;
  /**
   * ★**二項分布の標準偏差**。
   * ⚠️ ★有限母集団修正は入れません — ★**復元抽出だから**です（★上の註記）。
   */
  const se = Math.sqrt(drawn * share * (1 - share));
  const z = se === 0 ? 0 : (observed - expected) / se;
  if (Math.abs(z) > Math.abs(maxZ)) { maxZ = z; maxZBand = b; }
  if (z > 0) plus += 1; else if (z < 0) minus += 1;
  console.log(
    `  ${String(b).padStart(3)}  ${String(poolBand.get(b) ?? 0).padStart(9)}  ${expected.toFixed(1).padStart(8)}  ${String(observed).padStart(7)}  ${z >= 0 ? '+' : ''}${z.toFixed(2).padStart(6)}`,
  );
}
console.log('');
console.log(`  ★いちばん外れた段: 段 ${maxZBand} で ${maxZ >= 0 ? '+' : ''}${maxZ.toFixed(2)} SE`);
console.log(`  ★向きの内訳: 上に外れた段 ${plus} / 下に外れた段 ${minus}（★偏りがあれば、どちらかに寄ります）`);

// ── ④ 同時登録（★接続を 2 本開く。★錠が仕事をするのはここ）──────────
console.log('');
console.log('  ★同時登録（★接続 2 本）');
const other = new pg.Client({ connectionString: env.DATABASE_URL });
await other.connect();
try {
  await client.query('begin');
  const a = (await client.query('select pick_initial_horse() as id')).rows[0].id;
  await other.query('begin');
  const t1 = Date.now();
  const b = (await other.query('select pick_initial_horse() as id')).rows[0].id;
  const waited = Date.now() - t1;
  await client.query('rollback');
  await other.query('rollback');
  console.log(`    接続 A: ${a}`);
  console.log(`    接続 B: ${b}`);
  console.log(`    ${a !== b ? '✔ ★別の馬でした' : '🔴 ★同じ馬でした（★skip locked が効いていません）'}`);
  console.log(`    ★B の所要: ${waited} ms（★skip locked なので、待たずに次の候補へ行くはず）`);
} finally {
  await other.end();
}

console.log('');
console.log('  ★読み方');
console.log('    - ★段の数だけ試行があるので、★|SE| が 2 を超える段が 1 つあっても異常とは限りません。');
console.log('    - 🔴 ★同じ向きに揃って外れているなら、★それは偏りです（★order by id はこの形）。');
console.log('    - ⚠️ ★本ツールは合否を出しません（R-3）。');

await client.end();
