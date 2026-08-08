/**
 * A-3 の複数シード確認。
 *
 * ★条件: races ≫ M（A-3 の顛末で学んだ）。M=4000 / races=32000（8倍）で
 *   seed 42 は 82.62%（+0.62pt）に収束済み。他シードでも同じか。
 *
 * ★1シードでの収束は「そのシードで収束した」だけです。
 *   判定域 ±1% を主張するには複数シードが要ります。
 */
import { execSync } from 'node:child_process';
const M = 4000, RACES = 32000;
console.log(`# A-3 複数シード確認  M=${M} races=${RACES}（races = M × 8）`);
console.log(`  ${'seed'.padStart(6)} | ${'払戻率'.padStart(9)} | 残差`);
const results = [];
for (const seed of [42, 7, 2026, 31337]) {
  const out = execSync(`npx tsx apps/cli/src/diag-win.ts --races ${RACES} --odds-trials ${M} --seed ${seed}`, {
    encoding: 'utf8', maxBuffer: 1 << 24,
  });
  const m = out.match(/払戻率\(売り目で割る\) = ([\d.]+)%/);
  if (!m) throw new Error(`seed ${seed}: 払戻率を読み取れませんでした（R-21）`);
  const r = Number(m[1]);
  results.push(r);
  console.log(`  ${String(seed).padStart(6)} | ${r.toFixed(2).padStart(8)}% | ${(r - 82).toFixed(2).padStart(6)}pt`);
}
const mean = results.reduce((a,b)=>a+b,0)/results.length;
const sd = Math.sqrt(results.reduce((a,b)=>a+(b-mean)**2,0)/(results.length-1));
console.log(`\n  平均 ${mean.toFixed(2)}%  SD ${sd.toFixed(2)}  SE ${(sd/Math.sqrt(results.length)).toFixed(2)}`);
console.log(`  ★全シードが ±1% 以内: ${results.every(r=>Math.abs(r-82)<=1) ? 'PASS' : 'FAIL'}`);
