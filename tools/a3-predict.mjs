/**
 * ★恒等式の予測値を A-3 と同じ10シードで出し、実測と突き合わせる。
 *   測定ではなく計算です（新しくレースを回して払戻率を測ってはいません）。
 */
import { execSync } from 'node:child_process';
const M = 4000, RACES = 400;
// A-3（tools/a3-seeds.mjs）と同じシード列・同じ実測値
const OBSERVED = { 42:82.62, 7:82.26, 2026:81.97, 31337:83.73, 1231:83.67,
                   101:85.14, 202:84.16, 303:83.06, 404:82.40, 505:84.55 };
console.log(`# 恒等式の予測 vs A-3 実測   M=${M} / 予測は races=${RACES}`);
console.log(`  ${'seed'.padStart(6)} | ${'予測乖離'.padStart(9)} | ${'実測乖離'.padStart(9)} | ${'残差'.padStart(8)}`);
const pred = [], obs = [], resid = [];
for (const seed of Object.keys(OBSERVED)) {
  const out = execSync(`npx tsx apps/cli/src/diag-bias.ts --seed ${seed} --races ${RACES} --odds-trials ${M}`,
    { encoding: 'utf8', maxBuffer: 1 << 24 });
  const m = out.match(/予測される乖離\s+= \+([\d.]+)pt/);
  if (!m) throw new Error(`seed ${seed}: 予測値を読み取れませんでした（R-21）`);
  const p = Number(m[1]), o = OBSERVED[seed] - 82;
  pred.push(p); obs.push(o); resid.push(o - p);
  console.log(`  ${seed.padStart(6)} | ${('+'+p.toFixed(2)+'pt').padStart(9)} | ${((o>=0?'+':'')+o.toFixed(2)+'pt').padStart(9)} | ${((o-p>=0?'+':'')+(o-p).toFixed(2)).padStart(8)}`);
}
const mean = a => a.reduce((x,y)=>x+y,0)/a.length;
const sd = a => Math.sqrt(a.reduce((x,y)=>x+(y-mean(a))**2,0)/(a.length-1));
const mp = mean(pred), mo = mean(obs), mr = mean(resid);
const se = sd(obs)/Math.sqrt(obs.length);
console.log(`\n  ★予測の平均   +${mp.toFixed(2)}pt`);
console.log(`  ★実測の平均   +${mo.toFixed(2)}pt   (SE ${se.toFixed(2)})`);
console.log(`  ★残差         ${(mr>=0?'+':'')}${mr.toFixed(2)}pt  = ${(mr/se).toFixed(1)} SE`);
console.log(`\n  ★恒等式で説明できる割合: ${((mp/mo)*100).toFixed(0)}%`);
console.log(`  ★判定: ${Math.abs(mr/se) < 2 ? '一致（凸性で確定）→ 是正へ' : '不一致（残差が残りの正体）'}`);
