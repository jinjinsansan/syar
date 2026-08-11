/**
 * ★配備した成果物そのものを検証する（正典 D-043 の残件）
 *
 * 【なぜ「バンドルに対して」流すのか】
 *   D-043 で、本番は `tsx` を捨てて **`node dist/worker.cjs`（esbuild の CJS バンドル）**
 *   を実行する形になりました。ところが**テストも検証ツールも TypeScript の原本**を見ています。
 *
 *   ★**動かしている物と、確かめている物が別**です。
 *     P2 の事故（`npm ci --omit=dev` が `tsx` を消して7分停止）と同じ構図で、
 *     「原本では正しいが、配る形では壊れている」を誰も見ていませんでした。
 *
 *   → **`node dist/worker.cjs --selfcheck`** で、**配る物そのもの**を走らせます。
 *     別にバンドルを作って確かめても意味がありません（それは配る物ではない）。
 *
 * 【★何を確かめるか】
 *   バンドルで壊れうるのは「束ね方」です。具体的には:
 *     ① 定数が畳み込まれて別の値になっていないか（tree-shaking / 定数の重複束ね）
 *     ② 表が欠けていないか（動的な参照が消えることがある）
 *     ③ 決定論が保たれているか（乱数・時刻の混入）
 *     ④ 同じ入力に同じ出力を返すか（原本との突合はスクリプト側で行う）
 *
 * 【★DB に触りません】
 *   環境変数も接続も要りません。**純ロジックだけ**を通します。
 *   ここで DB に触ると「配る物が本番を触ってしまう検証」になります（R-24）。
 *
 * 実行:
 *   node dist/worker.cjs --selfcheck          # ★配る物
 *   npx tsx apps/worker/src/main.ts --selfcheck   # 原本（突合用）
 */

import { deriveRng } from '@star/sim-engine';
import { CYCLE_MS, LIFECYCLE_WEEKS, cycleIndexAt, weekIndexAt } from '@star/scheduler';
import { MARGIN, ODDS_CAP, TICKET_KINDS, oddsFromProbability } from '@star/betting';
import { INJURY_BASE_PROB, MENUS, TEMPER_FLOOR_RATIO, applyTemperDelta, injuryProbability } from '@star/training';
import { ODDS_MC_TRIALS } from './odds.js';
import { PRIZE_TABLE, tierFromDb } from './prize-award.js';

/** 出力を1行ずつ集める。★突合はこの行の並びで行う */
function lines(): { push: (s: string) => void; all: () => string[] } {
  const out: string[] = [];
  return { push: (s) => out.push(s), all: () => out };
}

export function runSelfcheck(): { ok: boolean; report: string[] } {
  const L = lines();
  const problems: string[] = [];
  const expect = (cond: boolean, what: string): void => {
    if (!cond) problems.push(what);
  };

  L.push('# selfcheck（配る物そのものを走らせる・D-043）');

  // ── ① 定数が畳み込まれて別の値になっていないか ────────────
  L.push('## ① 定数');
  L.push(`  CYCLE_MS=${CYCLE_MS}`);
  L.push(`  LIFECYCLE_WEEKS=${JSON.stringify(LIFECYCLE_WEEKS)}`);
  L.push(`  ODDS_MC_TRIALS=${ODDS_MC_TRIALS}`);
  L.push(`  INJURY_BASE_PROB=${INJURY_BASE_PROB}`);
  L.push(`  TEMPER_FLOOR_RATIO=${TEMPER_FLOOR_RATIO}`);
  L.push(`  MARGIN=${TICKET_KINDS.map((k) => `${k}:${MARGIN[k]}`).join(',')}`);
  L.push(`  ODDS_CAP=${TICKET_KINDS.map((k) => `${k}:${ODDS_CAP[k]}`).join(',')}`);
  // ★束ね方が壊れると 0 や undefined になる。数値であることを言い切る
  expect(Number.isFinite(ODDS_MC_TRIALS) && ODDS_MC_TRIALS > 0, 'ODDS_MC_TRIALS が正の数でない');
  expect(INJURY_BASE_PROB > 0 && INJURY_BASE_PROB < 1, 'INJURY_BASE_PROB が確率でない');
  expect(TEMPER_FLOOR_RATIO > 0 && TEMPER_FLOOR_RATIO < 1, 'TEMPER_FLOOR_RATIO が比率でない');

  // ── ② 表が欠けていないか ──────────────────────────────
  L.push('## ② 表');
  const tiers = Object.keys(PRIZE_TABLE).sort();
  L.push(`  PRIZE_TABLE 階級=${tiers.length} [${tiers.join(',')}]`);
  for (const t of tiers) L.push(`    ${t}=${(PRIZE_TABLE as Record<string, readonly number[]>)[t]!.join('/')}`);
  expect(tiers.length === 8, `PRIZE_TABLE の階級が 8 でない（${tiers.length}）`);
  const menuIds = Object.keys(MENUS).sort();
  L.push(`  MENUS=${menuIds.length} [${menuIds.join(',')}]`);
  expect(menuIds.length === 8, `MENUS が 8 種でない（${menuIds.length}）`);
  L.push(`  tierFromDb(1,null)=${tierFromDb(1, null)} / tierFromDb(6,null)=${tierFromDb(6, null)} / tierFromDb(1,'G1')=${tierFromDb(1, 'G1')}`);

  // ── ③ 決定論 ────────────────────────────────────────
  L.push('## ③ 決定論');
  const a = deriveRng(12345, 7, 99);
  const b = deriveRng(12345, 7, 99);
  const seq = Array.from({ length: 5 }, () => a.nextUint32());
  const seq2 = Array.from({ length: 5 }, () => b.nextUint32());
  L.push(`  deriveRng(12345,7,99)=${seq.join(',')}`);
  expect(seq.join(',') === seq2.join(','), '同じ種で違う乱数列が出る');

  // ── ④ 同じ入力に同じ出力 ────────────────────────────
  L.push('## ④ 計算');
  // ★引数は (nowMs, epochMs)。最初に逆順で書き、-1667 という負の値を証拠に載せかけました。
  //   値そのものは式のとおりで正しかったのですが、**読んだ人が誤解する形**でした。
  L.push(`  cycleIndexAt(now=1_000_000_000, epoch=0)=${cycleIndexAt(1_000_000_000, 0)}`);
  L.push(`  weekIndexAt(now=1_000_000_000, epoch=0)=${weekIndexAt(1_000_000_000, 0)}`);
  expect(cycleIndexAt(1_000_000_000, 0) === Math.floor(1_000_000_000 / CYCLE_MS), 'cycleIndexAt が式と合わない');
  for (const kind of TICKET_KINDS) {
    L.push(`  oddsFromProbability(${kind}, 0.25, 1e6)=${oddsFromProbability(kind, 0.25, 1_000_000).toFixed(6)}`);
  }
  L.push(`  injuryProbability(hard,f40,d650,x1,w150)=${injuryProbability({
    menu: 'hard', fatigue: 40, durability: 650, injuryRateMult: 1, ageWeeks: 150,
  }).toFixed(10)}`);
  L.push(`  applyTemperDelta(50,-5,50)=${applyTemperDelta(50, -5, 50).toFixed(6)}`);

  // ★時刻・グローバル乱数が混ざっていないことを、2回呼んで確かめる（憲法④）
  const twice = injuryProbability({ menu: 'hard', fatigue: 40, durability: 650, injuryRateMult: 1, ageWeeks: 150 });
  expect(
    twice === injuryProbability({ menu: 'hard', fatigue: 40, durability: 650, injuryRateMult: 1, ageWeeks: 150 }),
    '同じ入力で違う結果が出る（時刻かグローバル乱数が混ざっている）',
  );

  L.push('## 判定');
  if (problems.length === 0) {
    L.push('  ★selfcheck: PASS');
  } else {
    for (const p of problems) L.push(`  ★NG: ${p}`);
    L.push(`  ★selfcheck: FAIL（${problems.length} 件）`);
  }
  return { ok: problems.length === 0, report: L.all() };
}
