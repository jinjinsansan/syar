/**
 * A-3 の第1段（照会 Q-1 の回答に従う）: **MC 回数のバイアス掃引**。
 *
 * odds = (1/p̂)(1−margin) で 1/x は凸なので、p̂ に誤差がある限り
 * オッズは**系統的に高く**出る。これはレース数を増やしても消えない（バイアス）。
 * → レース数を1,000に固定して MC 回数だけを振り、払戻率が平坦になる点を探す。
 *
 * ★予測: 低 MC ほど払戻率が目標より**上**に出て、MC を増やすと下がって平坦になる。
 *   この形が出なければ、バイアスの説明が間違っているか別の要因がある。
 */
import { execSync } from 'node:child_process';

const RACES = 1000;
const TRIALS = [250, 500, 1000, 2000, 4000, 8000];
const KINDS = ['win', 'place', 'quinella', 'trifecta'];

console.log(`# MC バイアス掃引  races=${RACES}（固定） seeds=42`);
console.log(`  総レース解決数 ≒ ${(RACES * TRIALS.reduce((a, b) => a + b, 0)).toExponential(1)}`);
console.log(`  ${'MC'.padStart(6)} | ${KINDS.map((k) => k.padStart(9)).join(' ')}`);

for (const t of TRIALS) {
  const out = execSync(
    `npm run verify:payout --silent -- --races ${RACES} --odds-trials ${t} --seeds 42`,
    { encoding: 'utf8', maxBuffer: 1 << 24 },
  );
  const cells = KINDS.map((k) => {
    const line = out.split('\n').find((x) => x.trim().startsWith(k));
    const m = line?.match(/払戻率\s+([\d.]+)%/);
    return (m ? `${m[1]}%` : '-').padStart(9);
  });
  console.log(`  ${String(t).padStart(6)} | ${cells.join(' ')}`);
}
console.log(`\n  目標: win/place 82% / quinella 80% / trifecta 77%`);
