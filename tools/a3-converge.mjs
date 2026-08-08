/**
 * A-3: M と races を**比を保ったまま**同時に上げ、払戻率が 82% に収束するか。
 *
 * ★7回の仮説を無効にした教訓: 凸性を消すには M を大きく、分子を満たすには
 *   races を M より十分大きく。**両方を同時に**満たす必要がある。
 *   M だけ上げると条件違反が強まり、平坦に見えて壊れていく。
 */
import { execSync } from 'node:child_process';
const RATIO = 8; // races = M × RATIO
console.log(`# A-3 収束測定  races = M × ${RATIO}  seed=42`);
console.log(`  ${'M'.padStart(7)} ${'races'.padStart(8)} | ${'払戻率'.padStart(9)} | 残差`);
for (const M of [1000, 2000, 4000, 8000]) {
  const R = M * RATIO;
  const out = execSync(`npx tsx apps/cli/src/diag-win.ts --races ${R} --odds-trials ${M} --seed 42`, {
    encoding: 'utf8', maxBuffer: 1 << 24,
  });
  const m = out.match(/払戻率\(売り目で割る\) = ([\d.]+)%/);
  if (!m) throw new Error('払戻率を読み取れませんでした（R-21）');
  const r = Number(m[1]);
  console.log(`  ${String(M).padStart(7)} ${String(R).padStart(8)} | ${r.toFixed(2).padStart(8)}% | ${(r - 82).toFixed(2).padStart(6)}pt`);
}
