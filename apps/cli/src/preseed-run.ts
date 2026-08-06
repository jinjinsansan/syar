/**
 * N-2/N-4 の実行入口: `npm run preseed -- --seed 42`
 *
 * 出力は**再現可能な成果物**（§10.5）。同じシードから同じ血統プールが出ることは
 * `apps/cli/test/preseed.test.ts` が測る。
 */
import { DEFAULT_BALANCE, NPC_STABLES, calcInbreedCoefficient, nicksKey } from '@star/sim-engine';
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
const linesPerStable = argOf('lines-per-stable', DEFAULT_PRESEED_OPTIONS.linesPerStable);
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
  linesPerStable,
  nicks: preseedNicks(seed, NPC_STABLES, linesPerStable),
  blocklist,
});
const ms = Number(process.hrtime.bigint() - t0) / 1e6;
for (const y of r.years) {
  if (y.year % 10 !== 0 && y.year !== 1) continue;
  console.log(
    `y${String(y.year).padStart(3)} foals=${y.foals} active=${y.active} ` +
      `mean=${y.meanAbility.toFixed(0)} 系統=${y.sireLines} 有効=${y.effectiveSireLines.toFixed(2)} 種付種牡馬=${y.siresUsed}`,
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
// ★F-2: V-12a（平均F ≤ 0.10）をプリシード集団で測る。
//   F-1 以前は近交回避が実装に一切無く、しかも**誰も測っていなかった**。
const meanF = Fs.reduce((a, b) => a + b, 0) / Fs.length;
console.log(
  `V-12a  近交（平均F ≤ 0.10）  平均F=${meanF.toFixed(4)} 最大F=${Math.max(...Fs).toFixed(3)} ` +
    `虚弱=${((frail / Fs.length) * 100).toFixed(1)}%  ${meanF <= 0.1 ? 'PASS' : 'FAIL'}`,
);
/**
 * ★合格基準3 の確認測定（レビュー側 §2）: **指標ではなく機能を測る**。
 *   有効系統数 5.03 は「レビュー側が発明した閾値に対する余裕ゼロの通過」なので、
 *   指標の値だけで閉じない。実際にニックスが成立するか／配合の選択肢が残るかを見る。
 */
{
  const stallions = r.world.stallionIds.map((id) => lookup(id)!);
  const mares = r.world.mareIds.map((id) => lookup(id)!);
  // (1) 実際に成立している sire_line × bms_line の組
  const combos = new Set<string>();
  for (const st of stallions) {
    for (const m of mares) {
      if (m.sireLine !== undefined) combos.add(`${st.sireLine}|${m.sireLine}`);
    }
  }
  // ★キー形式は推測せず nicksKey() を使う（最初 '::' と '-' を推測してヒット0を出した）
  const nicksHit = [...combos].filter((k) => {
    const i = k.indexOf('|');
    return r.options.nicks.has(nicksKey(k.slice(0, i), k.slice(i + 1)));
  }).length;
  // (2) 任意の配合で高F になる割合（アウトブリードの選択肢が残っているか）
  //     牝馬200頭 × 種牡馬全頭を総当たりし、F > 0.0625（いとこ相当）の割合を出す
  const sample = mares.filter((_, i) => i % Math.max(1, Math.floor(mares.length / 200)) === 0);
  let pairs = 0;
  let highF = 0;
  for (const m of sample) {
    for (const st of stallions) {
      pairs += 1;
      if (calcInbreedCoefficient(st, m, lookup, DEFAULT_BALANCE.PEDIGREE_DEPTH).F > 0.0625) highF += 1;
    }
  }
  console.log(
    `合格基準3 確認: sire×bms の組 ${combos.size} 通り成立（ニックス表ヒット ${nicksHit}）  ` +
      `高F(>1/16)になる配合 ${((highF / pairs) * 100).toFixed(1)}%（${pairs} 通り総当たり）`,
  );
}

const a = auditPedigrees(r.world.activeIds, r.world.stallionIds, lookup);
console.log(`seed=${seed} all=${r.world.all.size} ${(ms / 1000).toFixed(1)}s`);
console.log(`5代完全=${(a.fullRate * 100).toFixed(1)}% 平均埋=${a.meanFilled.toFixed(1)}/62 血統内系統=${a.meanLines.toFixed(1)} クロス保有=${(a.crossRate * 100).toFixed(1)}%`);
console.log(`種牡馬: 系統${a.stallionLines.count} 最大${(a.stallionLines.topShare * 100).toFixed(1)}% 有効${a.stallionLines.effective.toFixed(1)}`);
console.log(`現役  : 系統${a.activeLines.count} 最大${(a.activeLines.topShare * 100).toFixed(1)}% 有効${a.activeLines.effective.toFixed(1)}`);
