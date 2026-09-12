/**
 * ★**展開（逃げ切り／差し／追い込み）が、実際に出ているかを数える**（★2026-09-12）
 *
 * 【★なぜ先に測るか】
 *   ★オーナー指示②は「★**エンジンと同期して** 3 通りの演出を作れ」です。
 *   ⚠️ ★カメラを 3 通り作っても、★**エンジンが 1 通りしか出さなければ**
 *      ★画面は 1 通りのままです。★先に ★**その場面がデータに在るか**を測ります
 *      （★2026-09-11 に同じ順序を守らず、★出ない場面の演出を作った実例があります）。
 *
 * 【★測り方】★画面と同じ組み立て（`tools/lib/race-audit-build.mjs`）を通します（★R-31）。
 *   ★判定は `packages/render` の `raceDevelopmentOf`。★ここで式を作り直しません（★R-30）。
 *
 * ⚠️ ★DB に触れません。★読むだけです。★合否は出しません（★閾値はオーナー判断・R-16）。
 *
 * ★実行: node tools/measure-race-development.mjs [--seeds 60] [--distance 1600]
 */
import { buildAuditRace, RACE_DEFAULTS } from './lib/race-audit-build.mjs';
import { raceDevelopmentOf, RACE_DEVELOPMENT_LABEL, homeStretchMetersOf } from '@star/render';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : Number(process.argv[i + 1]); };
const SEEDS = arg('seeds', 60);
const DISTANCE = arg('distance', RACE_DEFAULTS.distance);

const tally = new Map();
const rows = [];
for (let seed = 1; seed <= SEEDS; seed += 1) {
  const built = buildAuditRace({ seed, distance: DISTANCE });
  const straightM = homeStretchMetersOf(built.course);
  /** ★直線入口 ＝ 先頭が「残り `straightM`」に達した瞬間（★画面が `homestretch` へ入る地点） */
  let sample = null;
  for (let sec = 0; sec < 600; sec += 0.05) {
    const at = built.model.at(sec);
    const lead = Math.max(...at.map((h) => h.meters));
    if (lead >= built.DIST - straightM) {
      sample = at.map((h) => ({ gate: h.gate, meters: h.meters }));
      break;
    }
  }
  if (sample === null) throw new Error(`★seed ${seed}: 直線入口が見つかりません`);
  const winnerGate = Number(built.result.order[0].horseId);
  const info = raceDevelopmentOf(sample, winnerGate);
  tally.set(info.kind, (tally.get(info.kind) ?? 0) + 1);
  rows.push({ seed, ...info, strategy: built.entrants[winnerGate - 1].strategy });
}

console.log(`★${SEEDS} seed ／ ${DISTANCE}m ／ 直線入口で判定`);
console.log('');
for (const [kind, label] of Object.entries(RACE_DEVELOPMENT_LABEL)) {
  const n = tally.get(kind) ?? 0;
  console.log(`  ${label.padEnd(5)} ${String(n).padStart(3)} 本  ${(n / SEEDS * 100).toFixed(0).padStart(3)}%`);
}
console.log('');
console.log('★勝ち馬が直線入口で何番手だったか');
const byRank = new Map();
for (const r of rows) byRank.set(r.winnerRankAtStraight, (byRank.get(r.winnerRankAtStraight) ?? 0) + 1);
for (const rank of [...byRank.keys()].sort((a, b) => a - b)) {
  console.log(`  ${String(rank).padStart(2)} 番手  ${String(byRank.get(rank)).padStart(3)} 本`);
}
console.log('');
console.log('★各展開の seed（先頭 6 本ずつ）');
for (const [kind, label] of Object.entries(RACE_DEVELOPMENT_LABEL)) {
  const hit = rows.filter((r) => r.kind === kind).slice(0, 6);
  console.log(`  ${label.padEnd(5)} ${hit.map((r) => `${r.seed}(${r.passedCount}頭抜き/${r.strategy})`).join(' ') || '（無し）'}`);
}
console.log('');
console.log('★この道具は合否を出しません（★閾値はオーナー判断・R-16）。');
