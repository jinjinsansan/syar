/**
 * ★**「着順を再計算して照合する」検査の、★費用と露出を測る**（★F-3 案③・2026-09-20）
 *
 * 【★なぜ要るか】
 *   ★`F-3`（★結果の事後差し替えが一度も無い）は、★**監査証跡ではなく再計算で示す**と裁定されました。
 *   ★理由: ★**証跡も書き換えられますが、★再計算は嘘をつけません。**
 *   🔴 ★しかし ★**再計算は、★走らせなければ 0 の証明**です（★`DP-1`）。
 *   → ★**定期に走らせる**形が要り、★その **N（何日ごと）** を決める材料がこれです。
 *
 * 【🔴 ★N をここで決めません】
 *   ★2 つの数を並べるだけです。★決めるのはレビュー側（★`DP-1` の 7 日と同じ作法）。
 *   ★① ★**費用**: ★1 本 再計算するのに何 ms か → ★全部で何分か
 *   ★② ★**露出**: ★書き換えが起きてから、★次の再計算までに何本が検査されないままか
 *
 * 【🔴 ★読むだけ・★DB に繋ぎません】
 *   ★合成の出走表で ★**製品の `settleRace`** を回し、★時間を測るだけです。
 *   ⚠️ ★**本番の実データは読んでいません** — ★頭数と本数は実測値を**引数として**渡します。
 *
 * 実行: npx tsx tools/measure-recheck-cost.mjs [--races 6141] [--field 13]
 */
import { createHash, createHmac } from 'node:crypto';
import { settleRace } from '../apps/worker/src/settle.ts';

const argNum = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : Number(process.argv[i + 1]); };

/** ✔ ★本番の実測（2026-09-20・読むだけ）: ★確定したレース */
const RACES = argNum('races', 6141);
/** ✔ ★D-007 が使った実測の平均出走頭数 */
const FIELD = argNum('field', 13);
/** ★1 日の本数（★正典 D-007・6 分サイクル） */
const RACES_PER_DAY = 240;
/** ★標本（★これだけ実際に回して 1 本あたりを出す） */
const SAMPLE = argNum('sample', 200);

const hash = {
  sha256: (m) => createHash('sha256').update(m, 'utf8').digest('hex'),
  hmacSha256: (k, m) => createHmac('sha256', k).update(m, 'utf8').digest('hex'),
};

const entrant = (id, gate) => ({
  horseId: id,
  stats: { sp: 500 + gate, st: 500, pw: 500, gt: 500, iq: 500 },
  surfaceAptitude: { turf: 50, dirt: 50 },
  distanceCenter: 2000,
  distanceRange: 600,
  strategyAptitude: { nige: 50, senko: 50, sashi: 50, oikomi: 50 },
  heavyAptitude: 55,
  strategy: 'senko',
  condition: 3,
  fatigue: 0,
  weightKg: 55,
  gate,
  age: 4,
  skillGenes: [],
});

const input = (i) => ({
  conditions: {
    raceId: `race-${i}`,
    surface: 'turf',
    distance: 2000,
    trackCondition: 'good',
    courseShape: 'oval',
    baseWeightKg: 55,
  },
  entrants: Array.from({ length: FIELD }, (_, g) => entrant(`H${g + 1}`, g + 1)),
  serverSeed: 'a'.repeat(64),
});

console.log('# ★再計算の費用と露出（★F-3 案③の材料）');
console.log(`  ★前提: ★確定 ${RACES.toLocaleString()} 本 / ★平均 ${FIELD} 頭 / ★1 日 ${RACES_PER_DAY} 本`);
console.log('  ⚠️ ★DB に繋いでいません。★CPU だけを測ります');
console.log('');

// ★温め
for (let i = 0; i < 20; i += 1) settleRace(input(i), hash);

const t0 = process.hrtime.bigint();
for (let i = 0; i < SAMPLE; i += 1) settleRace(input(i), hash);
const sec = Number(process.hrtime.bigint() - t0) / 1e9;
const perRaceMs = (sec * 1000) / SAMPLE;

console.log('【① ★費用】');
console.log(`  ★標本 ${SAMPLE} 本 / ${sec.toFixed(2)} 秒 → ★**1 本 ${perRaceMs.toFixed(2)} ms**（★CPU のみ）`);
const allSec = (perRaceMs * RACES) / 1000;
console.log(`  → ★${RACES.toLocaleString()} 本 なら ★**${allSec.toFixed(0)} 秒（${(allSec / 60).toFixed(1)} 分）**`);
console.log('');
console.log('  ⚠️ ★**これは CPU だけ**です。★入れていないもの:');
console.log('     ★① 出走表を読む往復（★1 往復 本番 約 50 ms・★まとめれば 1 回で済む見込み）');
console.log('     ★② 照合そのもの（★着順の配列を比べるだけなので、★CPU に対して小さい）');
console.log('     ★③ ★**本番のレースは頭数も距離も場もばらばら**（★ここは 1 通りで測っています）');
console.log('     🔴 ★④ ★**凍結した 2 次元走路（`races.course_frozen`・D-065）を渡していません。**');
console.log('        ★本番のレースはそれを持つので、★**ここより遅くなるはず**です（★未測定）。');
console.log('        ⚠️ ★ただし 10 倍 遅くても ★**全部で 10 秒 程度**です。★桁は変わりません。');
console.log('');

console.log('【② ★露出】★書き換えが起きてから、★次の再計算までに検査されない本数');
for (const n of [1, 3, 7, 14, 30]) {
  const races = RACES_PER_DAY * n;
  console.log(`  ★N = ${String(n).padStart(2)} 日 … ★**${races.toLocaleString()} 本**が検査されないまま`
    + `（★費用 ${((perRaceMs * races) / 1000 / 60).toFixed(1)} 分／回）`);
}
console.log('');
console.log('🔴 ★**N はここで決めません。** ★2 つの数を並べるだけです（★裁定はレビュー側）。');
console.log('⚠️ ★**全部を毎回 再計算する必要は無いかもしれません**（★標本でもよい）。');
console.log('   ★ただし ★**標本なら「標本である」と書くこと**（★**R-21**）。');
