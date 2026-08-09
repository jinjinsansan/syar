/**
 * ★M を変えて券種別の乖離がどう動くかを見る（切り分け専用・判定ではない）。
 *
 *   凸性バイアス（補正済み）  … 残っていれば 1/M で縮む
 *   c≧1 の打ち切り            … 目が多い券種ほど大きく、M が増えると縮む
 *   両者は**符号が逆**なので、M を振らないと相殺して見えません（R-16 と同じ形）。
 */
import { execSync } from 'node:child_process';
const RACES = 8000;
const MS = [250, 1000, 4000];
const rows = new Map();
for (const M of MS) {
  const out = execSync(`npx tsx apps/cli/src/verify-payout.ts --races ${RACES} --odds-trials ${M} --seeds 42`,
    { encoding: 'utf8', maxBuffer: 1 << 26 });
  let hit = 0;
  for (const line of out.split('\n')) {
    const m = line.match(/^\s+(\S+)\s+払戻率 ([\d.]+)%.*乖離 ([+-][\d.]+)pt.*未発売的中 (\d+)/);
    if (!m) continue;
    hit += 1;
    if (!rows.has(m[1])) rows.set(m[1], []);
    rows.get(m[1]).push({ M, dev: Number(m[3]), unseen: Number(m[4]) });
  }
  if (hit !== 7) throw new Error(`M=${M}: 7券種を読み取れませんでした（${hit}件）R-21`);
  console.log(`  M=${M} 読み取り完了`);
}
console.log(`\n# 補正後の乖離が M でどう動くか（races=${RACES} seed=42）`);
console.log(`  ${'券種'.padEnd(16)} ${MS.map(m=>('M='+m).padStart(9)).join('')}   未発売的中(M=4000)`);
for (const [k, v] of rows) {
  console.log(`  ${k.padEnd(16)} ${v.map(x=>((x.dev>=0?'+':'')+x.dev.toFixed(2)).padStart(9)).join('')}   ${v[v.length-1].unseen}`);
}
console.log(`\n  ★1/M で縮む = 補正の残り（高次項） / 縮まない = 別の要因`);
