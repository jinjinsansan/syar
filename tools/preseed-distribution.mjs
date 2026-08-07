/**
 * P1.5 再開（レビュー側 2026-08-07）: 指標と機能量の分布を出す。
 *
 * ★R-20: 有効系統数は「50世代の歴史を1回だけ走らせた**1つの実現値**」で、
 *   60,000レースの平均とは標本の性質が違う。3シードでは判定できない。
 *
 * ★機能量（sire×bms の成立組数・高F配合の割合）は**集団内の多数のペアを数える**ので
 *   分散が小さいはず。「はず」で終わらせず、両方の分布を出して比べる。
 */
import { execSync } from 'node:child_process';

const SEEDS = Number(process.argv[2] ?? 40);
const rows = [];
for (let i = 0; i < SEEDS; i += 1) {
  const seed = 1000 + i * 7;
  const out = execSync(`npm run preseed --silent -- --seed ${seed} --generations 50`, {
    encoding: 'utf8', maxBuffer: 1 << 24,
  });
  const g = (re) => { const m = out.match(re); return m ? Number(m[1]) : Number.NaN; };
  const row = {
    seed,
    // ★合格基準3の行は y50〜y100 の推移が要るので --generations 50 では出力されない。
    //   当初これを読もうとして全件 NaN になり、集計が「0/40」という**存在しない結論**を出した。
    //   R-11: 事後条件を検査していなかった。y50 の行から直接取る。
    eff: g(/^y +50 .*有効=([\d.]+)/m),
    combos: g(/sire×bms の組 (\d+) 通り/),
    nicks: g(/ニックス表ヒット (\d+)/),
    highF: g(/高F\(>1\/16\)になる配合 ([\d.]+)%/),
    meanF: g(/平均F=([\d.]+)/),
  };
  // ★事後条件: 1つでも読み取れなければその場で落とす（NaN のまま集計しない）
  for (const [k, v] of Object.entries(row)) {
    if (!Number.isFinite(v)) throw new Error(`seed ${seed}: ${k} を出力から読み取れませんでした`);
  }
  rows.push(row);
  process.stdout.write(`.`);
}
console.log('');

const stat = (key) => {
  const xs = rows.map((r) => r[key]).filter(Number.isFinite).sort((a, b) => a - b);
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (xs.length - 1));
  const q = (p) => xs[Math.min(xs.length - 1, Math.floor(p * xs.length))];
  return { n: xs.length, mean, sd, cv: sd / mean, min: xs[0], p10: q(0.1), med: q(0.5), p90: q(0.9), max: xs[xs.length - 1] };
};

console.log(`# プリシード分布  ${SEEDS}シード × 50世代`);
console.log(`  ${'量'.padEnd(22)} ${'平均'.padStart(8)} ${'SD'.padStart(8)} ${'CV'.padStart(7)} ${'最小'.padStart(8)} ${'中央'.padStart(8)} ${'最大'.padStart(8)}`);
for (const [key, label] of [
  ['eff', '有効系統数（指標）'],
  ['combos', 'sire×bms 成立組数（機能）'],
  ['nicks', 'ニックス表ヒット（機能）'],
  ['highF', '高F配合の割合%（機能）'],
  ['meanF', '平均F'],
]) {
  const s = stat(key);
  console.log(
    `  ${label.padEnd(22)} ${s.mean.toFixed(2).padStart(8)} ${s.sd.toFixed(2).padStart(8)} ` +
      `${(s.cv * 100).toFixed(1).padStart(6)}% ${String(s.min).padStart(8)} ${String(s.med).padStart(8)} ${String(s.max).padStart(8)}`,
  );
}
const eff = rows.map((r) => r.eff);
const pass5 = eff.filter((x) => x >= 5).length;
const f = rows.map((r) => r.meanF);
console.log(`\n  ★「有効系統数 ≥5」を満たすシード: ${pass5}/${rows.length}（${((pass5 / rows.length) * 100).toFixed(0)}%）`);
console.log(`  ★V-12a「平均F ≤ 0.10」を満たすシード: ${f.filter((x) => x <= 0.1).length}/${rows.length}`);
