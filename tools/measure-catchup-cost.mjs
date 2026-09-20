/**
 * ★**世界を作り直すときの「育成の追いつき」に、★どれだけかかるか**（★決め C・裁定 2026-09-20）
 *
 * 🔴 ★**DB に繋ぎません。★読むだけですらありません — ★何も読みません。**
 *    ★合成の馬を作って `advanceWeek`（★製品の純関数）を回し、★**1 秒あたり何頭週 進むか**を測ります。
 *
 * 🔴🔴 ★**これは外挿です**（★**R-28**）。★言えるのは ★**CPU の分だけ**です。
 *    ⚠️ ★**外しているもの**（★小さくありません）:
 *      ★① ★**DB の往復** — ★`advanceTrainingWeeks` は 2,000 頭ごとに `select` し、
 *         ★1 頭ずつ `update` します。★実際はここが支配します。
 *      ★② ★EP の引き落とし（★NPC は課金されないので 0 回。★作り直しでは効きません）
 *      ★③ ★`horse_week_log` への書き込み
 *    → ★★**「この秒数で終わる」とは読まないでください。★下限です。**
 *
 * 【★必要な頭週の数え方】
 *   ★現役だけ追いつかせます（★引退馬の `stats` は `breed()` が読まないため）。
 *   ★1 頭あたり `週齢 − trainableFrom` 週。★週齢は案 B-3 で 104〜259 に散ります。
 *
 * 実行: npx tsx tools/measure-catchup-cost.mjs [--horses 40] [--weeks 120]
 */
import {
  ABILITY_KEYS, deriveRng,
} from '../packages/sim-engine/src/index.ts';
import { advanceWeek } from '../packages/training/src/index.ts';
import {
  LIFECYCLE_WEEKS, WEEKS_PER_YEAR, ageWeeksOf,
} from '../packages/scheduler/src/index.ts';
import { defaultMenu } from '../apps/worker/src/training-runner.ts';

const argNum = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? Number(process.argv[i + 1]) : fallback;
};
/** ★標本の頭数。★小さくてよい（★1 頭週あたりの秒数を測るだけ） */
const SAMPLE_HORSES = argNum('horses', 40);
/** ★1 頭あたり回す週数 */
const SAMPLE_WEEKS = argNum('weeks', 120);

/** ✔ `evidence/20260920-world-supply/` の実測 */
const COHORT = 800;
const ACTIVE_AGES = [2, 3, 4];

console.log('# 育成の追いつきの所要（★外挿・CPU のみ）');
console.log('');

// ── ① 要る頭週を**正確に**数える（★測定ではなく算術） ────────────
let horseWeeks = 0;
let activeHorses = 0;
const ageHistogram = [];
for (const age of ACTIVE_AGES) {
  for (let rank = 0; rank < COHORT; rank += 1) {
    const weeks = ageWeeksOf(age, rank, COHORT);
    horseWeeks += weeks - LIFECYCLE_WEEKS.trainableFrom;
    activeHorses += 1;
    ageHistogram.push(weeks);
  }
}
const minAge = Math.min(...ageHistogram);
const maxAge = Math.max(...ageHistogram);
console.log(`【要る仕事の量】★算術です（★測っていません）`);
console.log(`  現役 ${activeHorses.toLocaleString()} 頭（${COHORT} × ${ACTIVE_AGES.length} コホート）`);
console.log(`  週齢 ${minAge}〜${maxAge}（★1 年 = ${WEEKS_PER_YEAR} 週・案 B-3）`);
console.log(`  調教開始 ${LIFECYCLE_WEEKS.trainableFrom} 週 から追いつかせる`);
console.log(`  → ★**延べ ${horseWeeks.toLocaleString()} 頭週**（★1 頭あたり平均 `
  + `${(horseWeeks / activeHorses).toFixed(1)} 週）`);
console.log('');

// ── ② 1 頭週あたりの CPU を測る ────────────────────────────
const mkState = (i) => {
  const potential = {};
  const current = {};
  for (const k of ABILITY_KEYS) {
    potential[k] = 600 + ((i * 37 + k.charCodeAt(0)) % 300);
    current[k] = Math.round(potential[k] * 0.31);
  }
  return {
    ageWeeks: LIFECYCLE_WEEKS.trainableFrom,
    potential, current,
    durability: 60, temper: 55, fatigue: 10, condition: 3,
    restUntilWeek: -1, careerEnded: false, retirement: null,
  };
};
const traits = { sex: 'male', growth: 'normal', injuryRateMult: 1, birthTemper: 55 };

let done = 0;
const t0 = process.hrtime.bigint();
for (let h = 0; h < SAMPLE_HORSES; h += 1) {
  let state = mkState(h);
  for (let w = 0; w < SAMPLE_WEEKS; w += 1) {
    if (state.retirement !== null) break;
    const out = advanceWeek({
      state,
      traits,
      menu: defaultMenu(state.ageWeeks, state.fatigue),
      // ★本番と同じ条件（`training-runner.ts` は true で呼びます）
      enableEvents: true,
      rngFor: (stream) => deriveRng(h * 7919 + 13, stream, state.ageWeeks),
    });
    state = out.state;
    done += 1;
  }
}
const sec = Number(process.hrtime.bigint() - t0) / 1e9;
const perSec = done / sec;

console.log('【測ったもの】★`advanceWeek`（★製品の純関数）だけ');
console.log(`  標本 ${SAMPLE_HORSES} 頭 × ${SAMPLE_WEEKS} 週 → ★実施 ${done.toLocaleString()} 頭週 / `
  + `${sec.toFixed(2)} 秒`);
console.log(`  → ★**${Math.round(perSec).toLocaleString()} 頭週/秒**（★CPU のみ・★この機械で）`);
console.log('');

// ── ③ 外挿（★外挿だと明記する） ──────────────────────────
const cpuSec = horseWeeks / perSec;
console.log('🔴【外挿】★**これは外挿です。★下限です**（★R-28）');
console.log(`  ${horseWeeks.toLocaleString()} 頭週 ÷ ${Math.round(perSec).toLocaleString()} 頭週/秒 `
  + `= ★**約 ${cpuSec.toFixed(0)} 秒（${(cpuSec / 60).toFixed(1)} 分）**`);
console.log('');
console.log('  ⚠️ ★**外しているもの**:');
console.log('    ① ★DB の往復（★1 頭ずつ `update`。★実際はここが支配します）');
console.log('    ② ★`horse_week_log` への書き込み');
console.log('    ③ ★この機械と本番機の差');
console.log('  → ★★**「この秒数で終わる」と読まないでください。**');
console.log('');

// ── ④ 支配するのは DB の往復（★仮定を置いた算術。★測っていません） ──
console.log('🔴【★支配するのは DB の往復】★**CPU は問題ではありませんでした**');
console.log(`  ★CPU は ${cpuSec.toFixed(0)} 秒。★一方 \`update\` は ★**${horseWeeks.toLocaleString()} 回**です。`);
console.log('  ⚠️ ★**1 往復にかかる時間は測っていません**（★DB に繋がないため）。★仮定を置きます:');
for (const ms of [0.5, 1, 3, 5]) {
  const s = (horseWeeks * ms) / 1000;
  console.log(`    ★1 往復 ${ms} ms なら … ★${(s / 60).toFixed(1)} 分`);
}
console.log('  → ★★**効く梃子は CPU ではなく、★往復の回数です。**');
console.log('    ★一括更新（★1 文で複数頭）に変えれば桁で縮みますが、');
console.log('    ★それは ★**`advanceTrainingWeeks` の作りを変える話**なので、★この便ではしません。');
console.log('');
console.log('  → ★実際の所要は ★**staging で 1 回 流して測る**しかありません（★未実施）。');
