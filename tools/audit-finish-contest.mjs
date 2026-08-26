/**
 * ★**ゴール前に何頭が競り合っているか**（読取専用・エンジンの結果を読むだけ）
 *
 *   オーナー要望「直線で 4〜5 頭のせめぎ合いを見せたまま決着させたい」に対して、
 *   ★**そもそもエンジンがそういうレースを出しているのか**を先に数えます。
 *   カメラは**あるものしか映せません**（着順・馬の位置はサーバー権威・憲法 3）。
 *
 * ⚠️ 乱数・時刻を直接呼びません。シードを渡すだけです（憲法 4）。
 *
 * 実行: npx tsx tools/audit-finish-contest.mjs [--seeds 40]
 */
import { HORSE_LENGTH_M } from '@star/render';
import { buildAuditRace, RACE_DEFAULTS } from './lib/race-audit-build.mjs';

const i = process.argv.indexOf('--seeds');
const N = i >= 0 ? Number(process.argv[i + 1]) : 40;
const DIST = RACE_DEFAULTS.distance;
const L = HORSE_LENGTH_M;                    // 1 馬身 = 2.4m

/** ★先頭が `atM` に達した瞬間の、先頭からの差（m）の一覧 */
function gapsWhenLeaderAt(built, atM) {
  const model = built.model;
  let lo = 0, hi = 200;                      // レース秒の二分探索（単調）
  for (let k = 0; k < 60; k += 1) {
    const mid = (lo + hi) / 2;
    const lead = Math.max(...model.at(mid).map((h) => h.meters));
    if (lead < atM) lo = mid; else hi = mid;
  }
  const at = model.at(hi);
  const lead = Math.max(...at.map((h) => h.meters));
  return at.map((h) => lead - h.meters).sort((a, b) => a - b);
}

const rows = [];
for (let s = 0; s < N; s += 1) {
  const seed = 42 + s * 7;
  const built = buildAuditRace({ seed });
  const at200 = gapsWhenLeaderAt(built, DIST - 200);
  const atGoal = gapsWhenLeaderAt(built, DIST - 1);
  const within = (g, lengths) => g.filter((x) => x <= L * lengths).length;
  rows.push({
    seed,
    g2_200: within(at200, 2), g5_200: within(at200, 5),
    g2_goal: within(atGoal, 2), g5_goal: within(atGoal, 5),
    margin: (atGoal[1] ?? 0) / L,
  });
}

const med = (a) => { const x = [...a].sort((p, q) => p - q); return x[Math.floor(x.length / 2)]; };
const share = (f) => (rows.filter(f).length / rows.length * 100).toFixed(0);

console.log(`\n★${N} レース（12 頭立て・1600m・エンジンの結果をそのまま読む）\n`);
console.log('              残り200m                ゴール');
console.log('           2馬身以内 5馬身以内   2馬身以内 5馬身以内   1着-2着の差');
console.log('─'.repeat(72));
console.log(`中央値      ${med(rows.map((r) => r.g2_200)).toString().padStart(6)} ${med(rows.map((r) => r.g5_200)).toString().padStart(9)}`
  + `   ${med(rows.map((r) => r.g2_goal)).toString().padStart(7)} ${med(rows.map((r) => r.g5_goal)).toString().padStart(9)}`
  + `   ${med(rows.map((r) => r.margin)).toFixed(1).padStart(8)} 馬身`);
console.log(`
★ゴール時点で「4 頭以上が 5 馬身以内」  … ${share((r) => r.g5_goal >= 4)}% のレース
★ゴール時点で「4 頭以上が 2 馬身以内」  … ${share((r) => r.g2_goal >= 4)}% のレース
★1 着と 2 着が 1 馬身以内             … ${share((r) => r.margin <= 1)}% のレース
★1 着と 2 着が 3 馬身以上離れている     … ${share((r) => r.margin >= 3)}% のレース`);
console.log(`
⚠️ ★これはエンジンが出している結果です。カメラでは変えられません（憲法 3）。
   「4〜5 頭のせめぎ合いをゴールまで」を常に見せたいなら、**レースの作りの側**の判断が要ります。`);
