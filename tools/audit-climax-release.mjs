/**
 * ★**演出を 0 へ戻すとき、馬が「引きずられて」見えないか**を測る（読取専用）
 *
 *   指示書 `DEV_INSTRUCTIONS_P4_RACE_CLIMAX_REBUILD_20260826.md` §4-2（残り 60〜0m）／§7-3。
 *
 * 【★なぜ要るか】
 *   `tools/audit-climax-contest.mjs` の④で、1 コマの最大移動が
 *   ★**演出あり 18〜24px / 演出なし 2px** と出ました。加速は小さい（＝跳びではない）ので
 *   ★**「速い動き」ではあります。問題はその速さが競馬として在り得るか**です。
 *
 * 【★測るもの】
 *   ① オフセットが 0 へ戻る間の、★**本来の速度に対する見かけの増減**（%）
 *   ② その最大が起きる残り距離と馬番
 *   ③ ★見かけの速度が**後退（マイナス）**になっていないか（★競走馬は止まって見えてはいけない）
 *
 * ⚠️ ★製品コードは変更しません。読むだけです（憲法3）。時刻も乱数も使いません（憲法4）。
 *
 * 実行: npx tsx tools/audit-climax-release.mjs [--seeds 42,14,332,474]
 */
import { buildAuditRace, auditClock, auditSceneAt, RACE_DEFAULTS } from './lib/race-audit-build.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : process.argv[i + 1]; };
const SEEDS = String(arg('seeds', '42,14,332,474')).split(',').map(Number);
const FPS = 30, SCRIPT = 'v5', VIEW = { width: 1280, height: 720 };

console.log('★演出の掛け・戻しで、馬の「見かけの速さ」が本来から何 % ずれるかを測ります');
console.log('★競走馬として在り得る範囲か（止まって見えないか）を見ます\n');

for (const seed of SEEDS) {
  const built = buildAuditRace({ ...RACE_DEFAULTS, seed });
  const clock = auditClock(built);
  const total = clock.introSec + clock.warp.displaySec;
  const top5 = built.result.order.slice(0, 5).map((row) => {
    const e = built.entrants.find((x) => x.horseId === row.horseId);
    return e?.gate;
  });

  let prev;
  let worstSlow = { ratio: Infinity, rem: 0, gate: 0, d: 0 };
  let worstFast = { ratio: -Infinity, rem: 0, gate: 0, d: 0 };
  let negative = 0;
  for (let f = 0; f / FPS <= total; f += 1) {
    const d = f / FPS;
    const r = auditSceneAt(built, clock, d, VIEW, SCRIPT, { climax: true });
    const sOf = new Map(r.drawn.map((h) => [h.gate, h.s]));
    const baseOf = new Map(r.base.map((h) => [h.gate, h.s]));
    if (prev !== undefined) {
      const rem = built.DIST - Math.max(...r.base.map((h) => h.s));
      if (rem <= 340 && rem >= 0) {
        for (const gate of top5) {
          const dv = sOf.get(gate) - prev.sOf.get(gate);          // 表示の進み（m/コマ）
          const db = baseOf.get(gate) - prev.baseOf.get(gate);    // 本来の進み（m/コマ）
          if (!(db > 1e-9)) continue;
          const ratio = dv / db;
          if (ratio < worstSlow.ratio) worstSlow = { ratio, rem, gate, d };
          if (ratio > worstFast.ratio) worstFast = { ratio, rem, gate, d };
          if (dv <= 0) negative += 1;
        }
      }
    }
    prev = { sOf, baseOf };
  }

  const pct = (r) => `${((r - 1) * 100).toFixed(1)}%`;
  console.log(`seed ${String(seed).padStart(3)}  主役 5 頭 = 馬番 ${top5.join(',')}`);
  console.log(`   ① いちばん速く見えた   本来の ${worstFast.ratio.toFixed(3)} 倍（${pct(worstFast.ratio)}）`
    + `  馬番 ${worstFast.gate} / 残り ${worstFast.rem.toFixed(0)}m / ${worstFast.d.toFixed(2)}s`);
  console.log(`   ② いちばん遅く見えた   本来の ${worstSlow.ratio.toFixed(3)} 倍（${pct(worstSlow.ratio)}）`
    + `  馬番 ${worstSlow.gate} / 残り ${worstSlow.rem.toFixed(0)}m / ${worstSlow.d.toFixed(2)}s`);
  console.log(`   ③ 後退して見えたコマ   ${negative} 回   ${negative === 0 ? '○' : '× ★馬が下がって見えます'}`);
  console.log('');
}
console.log('⚠️ 幾何だけの数字です。最終判定は実画面です。');
