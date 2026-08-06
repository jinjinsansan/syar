/**
 * N-2/N-4 の実行入口: `npm run preseed -- --seed 42`
 *
 * 出力は**再現可能な成果物**（§10.5）。同じシードから同じ血統プールが出ることは
 * `apps/cli/test/preseed.test.ts` が測る。
 */
import { NPC_STABLES } from '@star/sim-engine';
import { auditPedigrees } from './pedigree-audit.js';
import { loadNameBlocklist } from './name-blocklist.js';
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
const ng = loadNameBlocklist(undefined, false);
if (ng.size === 0) {
  console.log(`⚠️ 実在馬名 NG リスト未設定（憲法 §0.1 の突合なし）。本番前に npm run blocklist:build が要ります`);
}
const { blocklist } = ng;

const r = runPreseed({
  ...DEFAULT_PRESEED_OPTIONS,
  seed,
  generations,
  nicks: preseedNicks(seed, NPC_STABLES),
  blocklist,
});
const ms = Number(process.hrtime.bigint() - t0) / 1e6;
for (const y of r.years) {
  if (y.year % 10 !== 0 && y.year !== 1) continue;
  console.log(
    `y${String(y.year).padStart(3)} foals=${y.foals} active=${y.active} ` +
      `mean=${y.meanAbility.toFixed(0)} 系統=${y.sireLines} 有効=${y.effectiveSireLines.toFixed(2)}`,
  );
}

/**
 * ★合格基準3（2026-08-06 改訂・レビュー側）:
 *   最大シェアの上限は撤廃。**有効系統数 ≥ 5** かつ **50→100世代で単調に減り続けていない**こと。
 *   ニックスが sire_line × bms_line の組で効くので、実質5系統あれば25通りが成立する。
 *   「水準でなく傾き」を見るのは V-2a と同じ論理。
 */
const effAt = (y: number): number | null => r.years.find((x) => x.year === y)?.effectiveSireLines ?? null;
const late = [50, 60, 70, 80, 90, 100].map(effAt).filter((v): v is number => v !== null);
if (late.length >= 2) {
  let monotoneDown = true;
  for (let i = 1; i < late.length; i += 1) if (late[i]! >= late[i - 1]!) monotoneDown = false;
  const last = late[late.length - 1]!;
  console.log(
    `合格基準3: 有効系統数 ${last.toFixed(2)}（≥5 ${last >= 5 ? 'PASS' : 'FAIL'}） / ` +
      `50→100 単調減 ${monotoneDown ? 'YES → FAIL' : 'NO → PASS'} / 推移 ${late.map((v) => v.toFixed(2)).join(' → ')}`,
  );
}
const lookup = (id: string) => r.world.all.get(id)?.record;
// ★系統を保つ機構は近交と表裏。閉じるほど系統は残るが F が上がる（§6.5）ので必ず併記する
const Fs = r.world.activeIds.map((id) => lookup(id)!.inbreedCoeff);
const frail = r.world.activeIds.filter((id) => lookup(id)!.frail).length;
console.log(`近交: 平均F=${(Fs.reduce((a, b) => a + b, 0) / Fs.length).toFixed(4)} 最大F=${Math.max(...Fs).toFixed(3)} 虚弱=${((frail / Fs.length) * 100).toFixed(1)}%`);
const a = auditPedigrees(r.world.activeIds, r.world.stallionIds, lookup);
console.log(`seed=${seed} all=${r.world.all.size} ${(ms / 1000).toFixed(1)}s`);
console.log(`5代完全=${(a.fullRate * 100).toFixed(1)}% 平均埋=${a.meanFilled.toFixed(1)}/62 血統内系統=${a.meanLines.toFixed(1)} クロス保有=${(a.crossRate * 100).toFixed(1)}%`);
console.log(`種牡馬: 系統${a.stallionLines.count} 最大${(a.stallionLines.topShare * 100).toFixed(1)}% 有効${a.stallionLines.effective.toFixed(1)}`);
console.log(`現役  : 系統${a.activeLines.count} 最大${(a.activeLines.topShare * 100).toFixed(1)}% 有効${a.activeLines.effective.toFixed(1)}`);
