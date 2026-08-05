/**
 * K-4 の診断: 選抜方式ごとに「どの形質がどちらへ動くか」を並べて見る
 *
 *   npx tsx apps/cli/src/selection-compare.ts [--generations 60] [--population 400] [--seeds 42,7]
 *
 * ★なぜ要るか:
 *   実レース選抜に切り替えたら V-2d（非能力形質の水準維持）が落ちた。
 *   「落ちた」だけでは対処できない。**どの形質がどちらへ動いたか**が分かって初めて、
 *   選抜圧の形（例: 混合番組が万能型を有利にする）を特定できる。
 *   P0 の丈夫さ 650→450 のときと同じで、**測っていないものは直せない**。
 */

import { NICKS_GEN } from '@star/sim-engine';
import { resolveRuntimeConfig } from './config.js';
import { runSimulation } from './simulator.js';
import { mean, round } from './stats.js';

function parseNumber(flag: string, fallback: number): number {
  const i = process.argv.indexOf(flag);
  if (i < 0) return fallback;
  const v = Number(process.argv[i + 1]);
  return Number.isFinite(v) ? v : fallback;
}

function parseList(flag: string, fallback: number[]): number[] {
  const i = process.argv.indexOf(flag);
  if (i < 0) return fallback;
  const raw = process.argv[i + 1];
  if (raw === undefined) return fallback;
  const out = raw.split(',').map((s) => Number(s.trim())).filter((n) => Number.isFinite(n));
  return out.length > 0 ? out : fallback;
}

const GENERATIONS = parseNumber('--generations', 60);
const POPULATION = parseNumber('--population', 400);
const SEEDS = parseList('--seeds', [42, 7]);

const MODES = [
  { label: 'proxy（P0 の近似）', selection: 'proxy' as const, metric: 'prize' as const },
  { label: 'race / prize', selection: 'race' as const, metric: 'prize' as const },
  { label: 'race / prize/starts', selection: 'race' as const, metric: 'prizePerStart' as const },
  { label: 'race / winRate', selection: 'race' as const, metric: 'winRate' as const },
  { label: 'race / composite', selection: 'race' as const, metric: 'composite' as const },
];

const { balance, founders } = resolveRuntimeConfig();

interface Row {
  label: string;
  v1: number;
  traits: Map<string, number>;
  sdRatios: Map<string, number>;
}

const rows: Row[] = [];

for (const mode of MODES) {
  const traitDevs = new Map<string, number[]>();
  const sdRatios = new Map<string, number[]>();
  const v1s: number[] = [];
  for (const seed of SEEDS) {
    const r = runSimulation(
      {
        seed,
        generations: GENERATIONS,
        population: POPULATION,
        stallionPool: Math.round(POPULATION * 0.3),
        selection: mode.selection,
        selectionMetric: mode.metric,
      },
      balance,
      founders,
      NICKS_GEN,
    );
    v1s.push(r.verification.v1.primaryMeanCv);
    for (const t of r.verification.v2d.traits) {
      if (t.deviation === null) continue;
      const list = traitDevs.get(t.key) ?? [];
      list.push(t.deviation);
      traitDevs.set(t.key, list);
    }
    for (const t of r.verification.v2e.traits) {
      const list = sdRatios.get(t.key) ?? [];
      list.push(t.ratio);
      sdRatios.set(t.key, list);
    }
  }
  rows.push({
    label: mode.label,
    v1: mean(v1s),
    traits: new Map([...traitDevs].map(([k, v]) => [k, mean(v)])),
    sdRatios: new Map([...sdRatios].map(([k, v]) => [k, mean(v)])),
  });
}

const traitKeys = [...(rows[0]?.traits.keys() ?? [])];

console.log(
  `${GENERATIONS}ゲーム内年 / 繁殖牝馬${POPULATION}頭 / シード=${SEEDS.join(',')}（シード平均）`,
);
console.log('');
console.log('--- V-2d: 非能力形質の平均が創始水準からどれだけ動いたか（合格域 ±10%）---');
const header = ['形質'.padEnd(18), ...rows.map((r) => r.label.padStart(20))].join('');
console.log(header);
console.log('-'.repeat(header.length));
for (const key of traitKeys) {
  const cells = rows.map((r) => {
    const v = r.traits.get(key);
    const s = v === undefined ? '-' : `${round(v * 100, 2)}%`;
    const flag = v !== undefined && Math.abs(v) > 0.1 ? ' !' : '  ';
    return (s + flag).padStart(20);
  });
  console.log(key.padEnd(18) + cells.join(''));
}

console.log('');
console.log('--- V-2e: 集団SD比（合格域 0.8〜1.4倍）---');
console.log(header);
console.log('-'.repeat(header.length));
for (const key of traitKeys) {
  const cells = rows.map((r) => {
    const v = r.sdRatios.get(key);
    const s = v === undefined ? '-' : `${round(v, 3)}x`;
    const flag = v !== undefined && (v < 0.8 || v > 1.4) ? ' !' : '  ';
    return (s + flag).padStart(20);
  });
  console.log(key.padEnd(18) + cells.join(''));
}

console.log('');
console.log('--- V-1: 同一配合100回の能力CV（合格域 12〜18%）---');
for (const r of rows) {
  const flag = r.v1 < 0.12 || r.v1 > 0.18 ? ' !' : '';
  console.log(`  ${r.label.padEnd(22)} ${round(r.v1 * 100, 2)}%${flag}`);
}
