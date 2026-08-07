/**
 * F-1 再検討（レビュー側 2026-08-07）: INBREED_PENALTY_WEIGHT のトレードオフ曲線。
 *
 * ★前回の撤回は penalty=0 と 3.0 の2点、しかも 3シード対 1シードでの比較でした。
 *   有効系統数の CV は 43.7% なので、**その差はノイズに埋もれる規模**です。
 *   間の値（0.1 / 0.3 / 1.0）を、各水準で同じシード集合を使って測ります。
 *
 * ★同じシード集合を使うのが要点。水準ごとに別のシードを引くと、
 *   ペナルティの効果と世界史のばらつきが分離できません（対応のある比較にする）。
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';

const P = 'apps/cli/src/preseed.ts';
const orig = fs.readFileSync(P, 'utf8');

// ★R-18: finally は SIGTERM/SIGKILL では走らない。実際にこの掃引が停止されたとき、
//   INBREED_PENALTY_WEIGHT = 0.3 が作業ツリーに残った。
//   変異試験ハーネスには入れた対策を、こちらに入れ忘れていた。
//   → 「ファイルを一時的に書き換えるツール」全体の性質なので、シグナルでも復元する。
const restore = (signal) => {
  fs.writeFileSync(P, orig);
  console.error(`
!!! ${signal} を受けたので ${P} を復元しました`);
  process.exit(1);
};
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK']) process.on(sig, () => restore(sig));
const LEVELS = ['0', '0.1', '0.3', '1.0', '3.0'];
const SEEDS = Array.from({ length: 12 }, (_, i) => 1000 + i * 7);

const stat = (xs) => {
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
  return { m, sd, se: sd / Math.sqrt(xs.length) };
};

console.log(`# INBREED_PENALTY_WEIGHT 掃引  ${SEEDS.length}シード（全水準で共通）× 50世代`);
console.log(`  ${'penalty'.padStart(8)} | ${'有効系統数'.padStart(16)} | ${'平均F'.padStart(16)} | V-12a合格`);
try {
  for (const w of LEVELS) {
    fs.writeFileSync(P, orig.replace('export const INBREED_PENALTY_WEIGHT = 0;', `export const INBREED_PENALTY_WEIGHT = ${w};`));
    const eff = [];
    const mf = [];
    for (const seed of SEEDS) {
      const out = execSync(`npm run preseed --silent -- --seed ${seed} --generations 50`, {
        encoding: 'utf8', maxBuffer: 1 << 24,
      });
      const g = (re) => { const m = out.match(re); if (!m) throw new Error(`読み取れず: ${re}`); return Number(m[1]); };
      eff.push(g(/^y +50 .*有効=([\d.]+)/m));
      mf.push(g(/平均F=([\d.]+)/));
    }
    const e = stat(eff);
    const f = stat(mf);
    console.log(
      `  ${w.padStart(8)} | ${e.m.toFixed(2).padStart(6)} ±${e.se.toFixed(2).padEnd(5)}(SE) | ` +
        `${f.m.toFixed(4).padStart(7)} ±${f.se.toFixed(4).padEnd(6)} | ${mf.filter((x) => x <= 0.1).length}/${mf.length}`,
    );
  }
} finally {
  fs.writeFileSync(P, orig);
  console.log('\n  （preseed.ts は復元済み）');
}
