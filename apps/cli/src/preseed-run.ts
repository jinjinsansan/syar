/**
 * N-2/N-4 の実行入口: `npm run preseed -- --seed 42`
 *
 * 出力は**再現可能な成果物**（§10.5）。同じシードから同じ血統プールが出ることは
 * `apps/cli/test/preseed.test.ts` が測る。
 */
import { ALLOW_ALL_NAMES, NPC_STABLES } from '@star/sim-engine';
import { auditPedigrees } from './pedigree-audit.js';
import { DEFAULT_PRESEED_OPTIONS, preseedNicks, runPreseed } from './preseed.js';

const argv = process.argv.slice(2);
const argOf = (name: string, fallback: number): number => {
  const i = argv.indexOf(`--${name}`);
  const v = i >= 0 ? Number(argv[i + 1]) : NaN;
  return Number.isFinite(v) ? v : fallback;
};
const seed = argOf('seed', 42);
const generations = argOf('generations', DEFAULT_PRESEED_OPTIONS.generations);
const t0 = process.hrtime.bigint();
const r = runPreseed({
  ...DEFAULT_PRESEED_OPTIONS,
  seed,
  generations,
  nicks: preseedNicks(seed, NPC_STABLES),
  blocklist: ALLOW_ALL_NAMES,
});
const ms = Number(process.hrtime.bigint() - t0) / 1e6;
for (const y of r.years) {
  if (y.year % 10 !== 0 && y.year !== 1) continue;
  console.log(`y${String(y.year).padStart(2)} foals=${y.foals} active=${y.active} mean=${y.meanAbility.toFixed(0)} lines=${y.sireLines}`);
}
const lookup = (id: string) => r.world.all.get(id)?.record;
const a = auditPedigrees(r.world.activeIds, r.world.stallionIds, lookup);
console.log(`seed=${seed} all=${r.world.all.size} ${(ms / 1000).toFixed(1)}s`);
console.log(`5代完全=${(a.fullRate * 100).toFixed(1)}% 平均埋=${a.meanFilled.toFixed(1)}/62 血統内系統=${a.meanLines.toFixed(1)} クロス保有=${(a.crossRate * 100).toFixed(1)}%`);
console.log(`種牡馬: 系統${a.stallionLines.count} 最大${(a.stallionLines.topShare * 100).toFixed(1)}% 有効${a.stallionLines.effective.toFixed(1)}`);
console.log(`現役  : 系統${a.activeLines.count} 最大${(a.activeLines.topShare * 100).toFixed(1)}% 有効${a.activeLines.effective.toFixed(1)}`);
