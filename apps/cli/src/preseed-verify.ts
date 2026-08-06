/**
 * 合格基準1（P1.5）: P0 の全ゲートがプリシード後の集団でも成立するか。
 *
 * 【なぜ P0 のシミュレータをそのまま使うのか】
 *   ゲートの計算式をここで書き直すと、**P0 と測り方が違う**まま「成立した」と言えてしまう。
 *   ゲートは `runSimulation` の中の一行も変えず、**入力だけ**をプリシード集団に差し替える。
 *   V-2d / V-2e / V-2f の比較基準（founder 側）は「サービス開始時点の集団」になり、
 *   「開始状態から健全さが保てるか」を測ることになる。
 *
 * 実行: npm run preseed:verify -- --seed 42 [--preseed-generations 50] [--generations 100]
 */

import { NPC_STABLES } from '@star/sim-engine';
import { DEFAULT_BALANCE, FOUNDERS, NICKS_GEN } from '@star/sim-engine';
import { DEFAULT_OPTIONS, runSimulation, type SeedPopulation } from './simulator.js';
import { loadNameBlocklist } from './name-blocklist.js';
import { DEFAULT_PRESEED_OPTIONS, preseedNicks, runPreseed } from './preseed.js';

const argv = process.argv.slice(2);
const argOf = (name: string, fallback: number): number => {
  const i = argv.indexOf(`--${name}`);
  const v = i >= 0 ? Number(argv[i + 1]) : NaN;
  return Number.isFinite(v) ? v : fallback;
};

const seed = argOf('seed', 42);
const linesPerStable = argOf('lines-per-stable', DEFAULT_PRESEED_OPTIONS.linesPerStable);
// ★R-12: 既定は**出荷構成**（正典 §10.5 のプリシードは50世代）でなければならない。
//   ここを 100 にハードコードしていたため、合格基準1 の V-2e 0.771 を
//   「仕様の倍の深さ」で測って FAIL として報告していた。
//   厳しい構成で測って落とすのも、緩い構成で測って通すのと同じ誤り。
const preseedGenerations = argOf('preseed-generations', DEFAULT_PRESEED_OPTIONS.generations);
const generations = argOf('generations', DEFAULT_OPTIONS.generations);
const longHorizon = argOf('long-horizon', 300);

console.log(`# 合格基準1: プリシード後の集団に対する P0 ゲート`);
console.log(`  seed=${seed} プリシード=${preseedGenerations}世代 → P0=${generations}ゲーム内年`);

const ng = loadNameBlocklist(undefined, false);
if (ng.size === 0) {
  console.log(`  ⚠️ 実在馬名 NG リスト未設定（憲法 §0.1 の突合なし）。本番前に npm run blocklist:build が要ります`);
}
const { blocklist } = ng;

const pre = runPreseed({
  ...DEFAULT_PRESEED_OPTIONS,
  seed,
  generations: preseedGenerations,
  linesPerStable,
  nicks: preseedNicks(seed, NPC_STABLES, linesPerStable),
  blocklist,
});

const seedPopulation: SeedPopulation = {
  all: [...pre.world.all.values()].map((h) => h.record),
  mareIds: pre.world.mareIds,
  stallionIds: pre.world.stallionIds,
  activeIds: pre.world.activeIds,
  finalYear: pre.world.year,
};

const result = runSimulation(
  {
    ...DEFAULT_OPTIONS,
    seed,
    generations,
    longHorizonGenerations: longHorizon,
    // プリシードのプール構成に合わせる（合わせないと別の集団を測ることになる）
    population: pre.world.mareIds.length,
    stallionPool: pre.world.stallionIds.length,
    seedPopulation,
  },
  DEFAULT_BALANCE,
  FOUNDERS,
  NICKS_GEN,
);

const v = result.verification;
const row = (id: string, label: string, value: string, pass: boolean): void => {
  console.log(`  ${id.padEnd(6)} ${label.padEnd(34)} ${value.padStart(10)}  ${pass ? 'PASS' : 'FAIL'}`);
};

row('V-1', '能力CV（12〜18%）', `${(v.v1.primaryMeanCv * 100).toFixed(2)}%`, v.v1.pass);
row('V-2a', '平坦化（%/世代）', `${v.v2a.slopePctPerGeneration.toFixed(4)}`, v.v2a.pass);
row('V-2b', '天井余裕（≤80%）', `${(v.v2b.ceilingRatio * 100).toFixed(1)}%`, v.v2b.pass);
row('V-2c', '長期健全性', v.v2c.evaluated ? `${(v.v2c.v1MeanCv * 100).toFixed(2)}%` : '未評価', v.v2c.pass);
row('V-2d', '耐久の水準維持（±10%）', `${((v.v2d.worstDeviation ?? 0) * 100).toFixed(2)}%`, v.v2d.pass);
row('V-2e', `距離の分化（0.8〜1.4x・${v.v2e.worstKey ?? '-'}）`, v.v2e.worstRatio.toFixed(3), v.v2e.pass);
row('V-2f', `形質の平坦化（<0.5%/世代・${v.v2f.worstKey ?? '-'}）`, v.v2f.worstSlopePctPerGen.toFixed(4), v.v2f.pass);
row('V-3', '隔世遺伝/大物覚醒/突然変異の頻度', `${(v.v3.atavism.rate * 100).toFixed(2)}%`, v.v3.pass);

/**
 * ★F-4: V-2e を形質別に、**選抜のかかる/かからない**で分けて出す。
 *
 *   下限0.8 は D-013 までの導出（sd/√(2r−r²) ÷ 0.916）から出た値で、
 *   **方向性選抜を含んでいない**。一方 V-2f が明示するとおり
 *   芝/ダート適性・距離2種・道悪適性・気性には選抜がかかり、分散が追加で削られる。
 *   選抜のかかる形質に選抜のない前提の下限を当てているなら category 違い。
 */
const SELECTED = new Set([
  'surface.turf',
  'surface.dirt',
  'distance_center',
  'distance_range',
  'heavy_aptitude',
  'temper',
]);
console.log('\n  V-2e 形質別（下限0.8 / 上限1.4）:');
for (const t of [...v.v2e.traits].sort((a, b) => a.ratio - b.ratio)) {
  const kind = SELECTED.has(t.key) ? '選抜あり' : '選抜なし';
  console.log(
    `    ${t.key.padEnd(16)} ${kind}  ratio=${t.ratio.toFixed(3)}  ` +
      `(founderSd=${t.founderSd.toFixed(2)} finalSd=${t.finalSd.toFixed(2)})  ${t.pass ? 'PASS' : 'FAIL'}`,
  );
}
{
  const sel = v.v2e.traits.filter((t) => SELECTED.has(t.key)).map((t) => t.ratio);
  const uns = v.v2e.traits.filter((t) => !SELECTED.has(t.key)).map((t) => t.ratio);
  const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
  // SD比の SE: 標本SDの相対SE ≒ 1/√(2(n−1))。n = 最終世代の個体数
  const n = pre.world.activeIds.length;
  const relSe = 1 / Math.sqrt(2 * (n - 1));
  console.log(
    `    選抜あり平均 ${mean(sel).toFixed(3)} / 選抜なし平均 ${mean(uns).toFixed(3)}  ` +
      `（SD比の相対SE ≒ ${relSe.toFixed(4)}, n=${n}）`,
  );
}

const gates = [v.v1, v.v2a, v.v2b, v.v2c, v.v2d, v.v2e, v.v2f, v.v3];
console.log(`\n  総合: ${gates.every((g) => g.pass) ? 'PASS' : 'FAIL'}`);
