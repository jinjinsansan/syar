/**
 * ★**MI-4: 自馬で荒稼ぎできないことを、数で示す**（★2026-09-19・裁定 `REVIEW_PO4_AND_CK4_VERDICT_20260919.md` §4）
 *
 * 【★何を問うているか】
 *   ★**D-117 ③** で、オッズは ★**登録の締切のあと**に計算されるようになりました。
 *   → ★自馬が強ければ ★**その馬を含んだ出走表でオッズが付く** ＝ ★**人気になり、配当は下がる**。
 *   ★これに ★**§9.5 の 5,000 EP の上限**（`BET_CAP_OWN_RACE_EP`）が重なります。
 *   → ★**自馬で荒稼ぎする経路は塞がれている**はず。★**それを数で言います。**
 *
 * 【🔴 ★なぜ「典型的なプレイヤー馬」で測らないか — ★**MI-3**】
 *   ★「典型」はまだ定義されていません（★初期馬は D-079 の帯から来ますが、その後は育成の巧拙次第）。
 *   → ★**「典型」を決めることが、測定の答えを決めてしまいます。**
 *   ✅ ★**代わりに「いちばん強い自馬」で測ります**（★**MI-4'**）。
 *     ★**安全の性質は、最悪ケースで示すもの**です。★典型より強い馬は（定義上）いません。
 *
 * 【★出す数（★**MI-4''**）】
 *   ★① ★自馬が**人気になったか**（★人気順位・単勝オッズ）
 *   ★② ★**5,000 EP の上限のもとで、期待収支がどうなるか**
 *
 * 【★測り方】
 *   ★`buildRace` を ★**2 通り**で呼びます（★同じシード・同じ番組）:
 *     ★**含む** … `mustInclude` に最強馬（★D-117 の後の姿）
 *     ★**含まない** … 素のまま（★対照。★自馬がいないレース）
 *   ★オッズは `buildRace` が出したものをそのまま使い、★勝率は**同じ MC の実測**を使います。
 *
 * ⚠️ ★**V-4 の話ではありません。** ★合成でも配備でも構いません（★素性だけ付けます・VP-8）。
 * ⚠️ ★**乱数も時刻も新しく作りません**（★`buildRace` の中の系列をそのまま使います）。
 */

import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { NICKS_GEN, ABILITY_KEYS, type HorseRecord } from '@star/sim-engine';
import { BET_CAP_OWN_RACE_EP, MARGIN } from '@star/betting';
import { classOf, conditionsOf, gradeOf } from '@star/scheduler';
import { buildRace } from '../../worker/src/build-race.js';
import { resolveRuntimeConfig } from './config.js';
import { runSimulation } from './simulator.js';
import { POOL_GENERATIONS, POOL_MARES } from './measurement.js';
import { sortPoolByClass } from './race-field.js';

const argv = process.argv.slice(2);
const num = (n: string, d: number): number => {
  const i = argv.indexOf(`--${n}`);
  const v = i >= 0 ? Number(argv[i + 1]) : NaN;
  return Number.isFinite(v) ? v : d;
};
const RACES = num('races', 60);
const SEED = num('seed', 20260919);
/** ★オッズの試行数。★既定は軽め（★これは V のゲートではないので） */
const TRIALS = num('odds-trials', 40_000);
const poolIdx = argv.indexOf('--pool');
const POOL_FILE = poolIdx >= 0 ? argv[poolIdx + 1] : undefined;

/**
 * ★**「いちばん強い」の定義**（★1 つの数で順序が付くもの）。
 *
 * 🔴 ⚠️ ★**`potential` ではなく `stats` で選びます。**
 *    ★`buildRace` は `abilityOf: (h) => h.stats` を渡すので、★**実際に走るのは `stats`** です
 *    （★Q-P3-29 で `potential × 開放率` から切り替えました）。
 *    ★最初 `potential` で選んだら、★**1 番人気になったのは 41.67% だけ**でした —
 *    ★素質が最高でも、★`stats` が高いとは限らないからです。
 *    → ★**最悪ケースを名乗るなら、★走る能力で選ばなければ意味がありません。**
 */
const total = (h: HorseRecord): number => ABILITY_KEYS.reduce((a, k) => a + h.stats[k], 0);
/** ★参考: 素質の合計（★上との差を報告に出すため） */
const potentialTotal = (h: HorseRecord): number => ABILITY_KEYS.reduce((a, k) => a + h.potential[k], 0);

function loadPool(): { pool: readonly HorseRecord[]; provenance: string } {
  if (POOL_FILE !== undefined) {
    const raw = JSON.parse(readFileSync(POOL_FILE, 'utf8')) as HorseRecord[];
    for (const h of raw) {
      const e = (h as unknown as { pedigreeCache: unknown }).pedigreeCache;
      (h as unknown as { pedigreeCache: unknown }).pedigreeCache =
        new Map((Array.isArray(e) ? e : []) as [string, readonly number[]][]);
    }
    const digest = createHash('sha256').update(readFileSync(POOL_FILE)).digest('hex').slice(0, 12);
    return { pool: raw, provenance: `★--pool ${POOL_FILE}（sha256:${digest}・${raw.length} 頭）` };
  }
  const { balance, founders } = resolveRuntimeConfig();
  const pool = runSimulation(
    { seed: SEED, generations: POOL_GENERATIONS, population: POOL_MARES,
      stallionPool: Math.round(POOL_MARES * 0.3), v1Pairs: 1, v1Repeats: 5, retainFinalPopulation: true },
    balance, founders, NICKS_GEN,
  ).finalPopulation ?? [];
  return { pool, provenance: `★合成 ${POOL_MARES} 頭（POOL_GENERATIONS ${POOL_GENERATIONS} 年）` };
}

const { pool: raw, provenance } = loadPool();
const pool = sortPoolByClass(raw);
if (pool.length === 0) throw new Error('母集団が空です');

/** 🔴 ★**いちばん強い馬**（★最悪ケース・MI-4'） */
const strongest = [...pool].sort((a, b) => total(b) - total(a))[0]!;

console.log('=== ★この測定の素性（★VP-8）===');
console.log(`  ★日付   : ${new Date().toISOString()}`);
console.log(`  ★母集団 : ${provenance}`);
console.log(`  ★標本   : ${RACES} レース / オッズ試行 ${TRIALS.toLocaleString('ja-JP')}`);
console.log(`  ★自馬   : ★**いちばん強い馬**（★**stats 合計 ${total(strongest).toFixed(0)}**・素質合計 ${potentialTotal(strongest).toFixed(0)}）`);
// ⚠️ ★テンプレート文字列の中にバッククォートを書かないこと（★閉じてしまう・記憶どおりの罠）
console.log('           ⚠️ ★**走る能力（stats）で選んでいます** — buildRace は abilityOf: h.stats を渡すため');
console.log(`           ⚠️ ★「典型」ではありません（MI-3）。★安全は最悪ケースで示します（MI-4'）`);
console.log('');

interface Row { rank: number; odds: number; p: number }
const withMine: Row[] = [];
let ranSelf = 0;

for (let i = 0; i < RACES; i += 1) {
  const raceClass = classOf(i);
  const prog = conditionsOf(i, raceClass, gradeOf(i));
  /** ★自馬を **必ず入れる**（★D-117 の後の姿） */
  const built = buildRace(pool, i, SEED, TRIALS, undefined, prog, undefined, [strongest]);
  const mine = built.entrants.find((e) => e.horseId === strongest.id);
  if (mine === undefined) continue;
  ranSelf += 1;
  /** ★単勝のオッズと、★同じ MC が出した勝率 */
  const win = built.odds.find((o) => o.betType === 'win' && o.selection[0] === mine.gate);
  if (win === undefined) continue;
  withMine.push({ rank: mine.popularity ?? 99, odds: win.odds, p: win.probability });
}

const mean = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;
const pct = (x: number): string => `${(x * 100).toFixed(2)}%`;

console.log(`--- ① ★自馬は人気になったか（${ranSelf} レース）---`);
const ranks = withMine.map((r) => r.rank);
const favCount = ranks.filter((r) => r === 1).length;
console.log(`  ★1 番人気になった割合 : ${pct(favCount / withMine.length)}（${favCount}/${withMine.length}）`);
console.log(`  ★人気順位の平均       : ${mean(ranks).toFixed(2)} 番人気`);
console.log(`  ★単勝オッズの平均     : ${mean(withMine.map((r) => r.odds)).toFixed(2)} 倍`);
console.log(`  ★MC の勝率の平均      : ${pct(mean(withMine.map((r) => r.p)))}`);
console.log('');
console.log('  → ★★**オッズは、自馬が強いことを「知って」います**（★D-117 ③: 締切の後に計算する）。');

console.log('');
console.log(`--- ② ★5,000 EP の上限のもとで、期待収支はどうなるか ---`);
/**
 * ★期待収支 ＝ Σ(勝率 × オッズ) / n − 1。
 * ⚠️ ★オッズも勝率も ★**同じモンテカルロ**から出ているので、
 *    ★理論上は ★**−（控除率）**に張り付くはずです。★それが「荒稼ぎできない」の意味です。
 */
const evPerUnit = mean(withMine.map((r) => r.p * r.odds)) - 1;
const cap = BET_CAP_OWN_RACE_EP;
console.log(`  ★1 EP あたりの期待収支 : ${evPerUnit >= 0 ? '+' : ''}${(evPerUnit * 100).toFixed(2)}%`);
console.log(`  ★単勝の控除率（§9.4）  : −${(MARGIN.win * 100).toFixed(0)}%`);
console.log(`  ★上限（§9.5・自馬）    : ${cap.toLocaleString('ja-JP')} EP / レース`);
console.log(`  ★上限いっぱい張ったときの 1 レースの期待収支 : ${evPerUnit >= 0 ? '+' : ''}${Math.round(evPerUnit * cap).toLocaleString('ja-JP')} EP`);
console.log('');
const ok = evPerUnit < 0;
console.log(ok
  ? `  ✅ ★**期待収支は負**です。★いちばん強い自馬に、上限いっぱい張っても ★**負けます**。`
  : `  🔴 ★**期待収支が正**です。★荒稼ぎの経路が開いています。★調べてください。`);
console.log('');
console.log('⚠️ ★これは ★**単勝の 1 点張り**の数です。★他の券種・組み合わせは測っていません。');
console.log('⚠️ ★**着順の操作（介入・§8b）は入っていません。** ★入れた場合は別に測る必要があります。');
process.exitCode = ok ? 0 : 1;
