/**
 * ★AL-6 の測定 ①— 出走馬を JSON に出す（★両方のエンジン版が**同じ入力**を読むため・R-30）
 *
 * ★裁定 `REVIEW_CONSULT_ARCADE_LOOP_ANSWER_20260918.md` AL-6 の測定に使います。
 *
 * 【★なぜ JSON に出すのか】
 *   ★`generateRace` は**版によって違う出走馬を返しえます**（プールの生成も番組表も版で変わる）。
 *   ★測定器が版ごとに別の馬を測ると、★**速さの比ではなく馬の違いを測ります**（R-30）。
 *   → ★**現エンジンで 1 回出して、両方の版がそのファイルを読みます。**
 *
 * 【★この道具は DB に触りません】読むだけ・書くのはローカルの JSON 1 本（R-24: readonly）。
 *
 * 【★なぜ `.mjs`（型なし）で書くか】
 *   ★`apps/cli/test/tool-guard.test.ts` の走査は **`.mjs` しか見ません**。
 *   ★`.mts` で書くと ★**分類登録簿（R-24）の外に出ます** — ★2026-09-18 に
 *   ★「登録簿の外で増えた」事例が 3 件挙がったばかりなので、★4 例目を作りません。
 *
 * 実行: npx tsx tools/bench-odds-entrants.mjs [--out tmp/bench-entrants.json]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { NICKS_GEN, deriveRng, VERIFY_PAYOUT_STREAM as S } from '@star/sim-engine';
import { generateRace, sortPoolByClass } from '../apps/cli/src/race-field.js';
import { resolveRuntimeConfig } from '../apps/cli/src/config.js';
import { runSimulation } from '../apps/cli/src/simulator.js';
import { POOL_GENERATIONS, POOL_MARES } from '../apps/cli/src/measurement.js';

const argv = process.argv.slice(2);
const argOf = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : fallback;
};
const OUT = argOf('out', 'tmp/bench-entrants.json');

const { balance, founders } = resolveRuntimeConfig();
const sim = runSimulation(
  {
    seed: 42,
    generations: POOL_GENERATIONS,
    population: POOL_MARES,
    stallionPool: Math.round(POOL_MARES * 0.3),
    v1Pairs: 1,
    v1Repeats: 5,
    retainFinalPopulation: true,
  },
  balance,
  founders,
  NICKS_GEN,
);
const pool = sortPoolByClass(sim.finalPopulation ?? []);
const race = generateRace(pool, 0, deriveRng(42, S.FIELD, 0));
// ★馬 ID は H1..Hn に付け替える（★`bench-mc.ts` と同じ形。的中目の集計が番号を読むため）
const entrants = race.entrants.map((e, k) => ({ ...e, horseId: `H${k + 1}` }));

mkdirSync(path.dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(entrants, null, 1));
console.log(`出走馬 ${entrants.length} 頭 → ${OUT}`);
console.log(`  ★この馬で両方の版を測ってください（★片方だけ作り直すと、速さの比になりません）`);
