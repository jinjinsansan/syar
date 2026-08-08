/**
 * A-3 の判定（正典 §13.2 V-10）。
 *
 * ★**シードごとの判定は誤り**でした。
 *   §13.2 は「券種別に設定 margin ±1%（10万レース）」で、
 *   10万レースは**総標本数の指定**です。「1シードあたり」とも
 *   「全シードが個別に」とも書いていません。
 *   ゲートは**プールされた推定量**に当てます。
 *
 *   シードごとの判定は統計的にも成立しません。各シードの通過確率が p なら
 *   4シード全通過は p^4 で、**シード数を増やすほど落ちやすくなります**
 *   （実測: 4シードで全通過確率 ≒ 41%）。
 *
 * ★条件: races ≫ M。M=4000 / races=32000（8倍）を守ります。
 *   計算量が跳ねる「M を上げる」案は不要です（レビュー側の裁定）。
 */
import { execSync } from 'node:child_process';
const M = 4000, RACES = 32000;
console.log(`# A-3 複数シード確認  M=${M} races=${RACES}（races = M × 8）`);
console.log(`  ${'seed'.padStart(6)} | ${'払戻率'.padStart(9)} | 残差`);
const results = [];
const SEEDS = [42, 7, 2026, 31337, 1231, 101, 202, 303, 404, 505];
for (const seed of SEEDS) {
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
