/**
 * ★AL-6 の測定 ②— **1 レースのオッズ計算の所要**を、本番が使う条件の幅で測る
 *
 * ★裁定 `REVIEW_CONSULT_ARCADE_LOOP_ANSWER_20260918.md` **AL-6**:
 *   「★間隔を決める前に、ES 便の後のエンジンで 1 レースの所要を測り直す（★測ったコミットを併記する）」
 *
 * 【★測る量】
 *   ★**試行 1 回 ＝ `resolveRace` ＋ 全 7 券種の的中目の集計**（★本番のオッズ算出と同じ量・
 *   `apps/cli/src/bench-mc.ts` と同じ形）。★距離ロスの下ごしらえは**試行の前に 1 回**
 *   （ES-6・本番の `apps/worker/src/build-race.ts` と同じ）。
 *
 * 【★`bench-mc.ts` との違い】
 *   ★`bench-mc.ts` は `generateRace(pool, 0, …)` が返す **1 レース（1400m・既定の走路）だけ**を測ります。
 *   ★距離ロス（D-071）の費用は**距離と走路で変わる**ので、★1 条件の値を 480 レース/日に掛けると
 *   ★本番の負荷を取り違えます。→ ★**本ツールは距離と走路を振ります。**
 *
 * 【🔴 ★測る前に読んでください — 機械のばらつき】
 *   ★2026-09-18 の実測: ★**ハイブリッド CPU（P コア＋E コア）では、載るコアで 2 倍変わります**
 *   （★同じ道具の 2 回の実行が 25.97 と 42.22 μs に割れました）。
 *   → ★**P コアに固定して回してください**（Windows: `start /affinity 3`）。
 *   → ★本ツールは各条件を `--repeat` 回まわし、★**最小値**を採ります（★他の処理の影響は上振れにしか出ない）。
 *   ⚠️ ★**1 回の値で比を論じないこと。** ★**測定のばらつきより小さい差を「差」と読まない**
 *     （★2026-09-18・レビュー側が ES-6 裁定の「1.28 倍」を撤回した理由）。
 *
 * 【★古いエンジンと比べるとき（`--legacy`）】
 *   ```
 *   git archive '97364c5^' | tar -x -C tmp/es-before        # D-071 の前
 *   # PowerShell: New-Item -ItemType Junction -Path tmp\es-before\node_modules\@star\<名> -Target tmp\es-before\packages\<名>
 *   cp tools/bench-odds-cost.mjs tmp/es-before/tools/
 *   npx tsx tmp/es-before/tools/bench-odds-cost.mjs --legacy --entrants <このツリーで出した JSON>
 *   ```
 *   ★`--legacy` は ★**下ごしらえを渡しません**（★古い版には距離ロスそのものがありません）。
 *
 * 【★この道具は DB に触りません】読むだけ（R-24: readonly）。
 *
 * 実行: npx tsx tools/bench-odds-cost.mjs [--trials 100000] [--repeat 3] [--entrants tmp/bench-entrants.json] [--legacy]
 */
import { readFileSync } from 'node:fs';
import { deriveRng, VERIFY_PAYOUT_STREAM as S } from '@star/sim-engine';
import { DEFAULT_RACE_BALANCE, resolveRace } from '@star/race-engine';
import { TICKET_KINDS, placeDepth } from '@star/betting';

const argv = process.argv.slice(2);
const num = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  const v = i >= 0 ? Number(argv[i + 1]) : NaN;
  return Number.isFinite(v) ? v : fallback;
};
const argOf = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : fallback;
};
const TRIALS = num('trials', 100_000);
const REPEAT = num('repeat', 3);
const ENTRANTS = argOf('entrants', 'tmp/bench-entrants.json');
const LEGACY = argv.includes('--legacy');

/**
 * ★下ごしらえ（ES-6）。★古い版には**この関数がありません**ので、動的に取ります。
 *   ★静的 import にすると、古いツリーで**読み込みそのものが落ちます**。
 */
const engine = await import('@star/race-engine');
const lanePlanForRace = LEGACY ? undefined : engine.lanePlanForRace;
if (!LEGACY && typeof lanePlanForRace !== 'function') {
  throw new Error('bench-odds-cost: lanePlanForRace がありません。古いエンジンを測るなら --legacy を付けてください');
}

const entrants = JSON.parse(readFileSync(ENTRANTS, 'utf8'));
const depth = placeDepth(entrants.length);
const orderOf = (r) => r.order.map((x) => Number(String(x.horseId).replace(/^H/, '')));

/** ★的中目（`apps/worker/src/odds.ts` の `winningKeys` と同じ 7 券種・`bench-mc.ts` の写し） */
function keysOf(kind, order) {
  const s = (xs) => [...xs].sort((a, b) => a - b).join('-');
  switch (kind) {
    case 'win': return [String(order[0])];
    case 'place': return order.slice(0, depth).map(String);
    case 'quinella_place': {
      const top = order.slice(0, depth);
      const out = [];
      for (let a = 0; a < top.length; a += 1) for (let b = a + 1; b < top.length; b += 1) out.push(s([top[a], top[b]]));
      return out;
    }
    case 'quinella': return [s([order[0], order[1]])];
    case 'exacta': return [`${order[0]}>${order[1]}`];
    case 'trio': return [s([order[0], order[1], order[2]])];
    case 'trifecta': return [`${order[0]}>${order[1]}>${order[2]}`];
    default: throw new Error(`未知の券種: ${kind}`);
  }
}

/** ★本番の走路（D-099 で凍結した 10 場のうち**最も周が長い** ookawara）と、既定（`DEFAULT_OVAL`） */
const COURSES = LEGACY
  ? [{ label: '既定(走路の概念なし)', course: undefined }]
  : [
      { label: '既定(DEFAULT_OVAL)', course: undefined },
      { label: '最長の周(ookawara)', course: { lapM: 2400, homeStretchM: 540, widthM: 23 } },
    ];
/** ★本番の距離（`apps/cli/src/race-field.ts` の `DISTANCES`）から代表を取る */
const DISTANCES = [1200, 1600, 2000, 2400, 3200];
/** ★本番の試行数（D-035 の設計式・`apps/worker/src/odds.ts` の `ODDS_MC_TRIALS`） */
const M = 3_896_104;

function measure(conditions) {
  const lanePlan = LEGACY ? undefined : lanePlanForRace(conditions);
  const call = (seed) =>
    resolveRace({
      conditions,
      entrants,
      seed,
      balance: DEFAULT_RACE_BALANCE,
      ...(lanePlan === undefined ? {} : { lanePlan }),
    });
  // ★暖機（JIT の立ち上がりを測定に混ぜない）
  const warm = deriveRng(42, S.ODDS, 0);
  for (let t = 0; t < 20_000; t += 1) call(warm.nextUint32());

  let best = Infinity;
  for (let r = 0; r < REPEAT; r += 1) {
    const counts = new Map(TICKET_KINDS.map((k) => [k, new Map()]));
    const rng = deriveRng(42, S.ODDS, 100 + r);
    const t0 = process.hrtime.bigint();
    for (let t = 0; t < TRIALS; t += 1) {
      const order = orderOf(call(rng.nextUint32()));
      for (const kind of TICKET_KINDS) {
        const m = counts.get(kind);
        for (const key of keysOf(kind, order)) m.set(key, (m.get(key) ?? 0) + 1);
      }
    }
    const us = Number(process.hrtime.bigint() - t0) / TRIALS / 1000;
    if (us < best) best = us;
  }
  return best;
}

console.log(
  `# AL-6 オッズ計算の所要${LEGACY ? '（★--legacy: 下ごしらえ無し）' : ''}  ` +
    `${entrants.length}頭立て / 試行 ${TRIALS.toLocaleString()} × ${REPEAT} 回（最小値）`,
);
console.log(`  出走馬: ${ENTRANTS}   M = ${M.toLocaleString()}`);
console.log(`  ⚠️ ★P コアに固定して回してください（Windows: start /affinity 3）。★1 回の値で比を論じないこと`);
console.log(`  ${'走路'.padEnd(22)}${'距離'.padStart(7)}${'μs/試行'.padStart(10)}${'1レース(この機械)'.padStart(20)}`);
for (const c of COURSES) {
  for (const distance of DISTANCES) {
    const conditions = {
      raceId: 'AL6',
      distance,
      surface: 'turf',
      trackCondition: 'good',
      courseShape: 'oval',
      baseWeightKg: 55,
      ...(c.course === undefined ? {} : { course: c.course }),
    };
    const us = measure(conditions);
    console.log(
      `  ${c.label.padEnd(22)}${String(distance).padStart(7)}${us.toFixed(2).padStart(10)}` +
        `${`${((us * M) / 1e6).toFixed(1)} 秒`.padStart(20)}`,
    );
  }
}
