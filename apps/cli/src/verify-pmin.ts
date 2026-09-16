/**
 * ★D-035 を**本番のコード経路で**確かめる（V-10 / A-3）。
 *
 * 【なぜ普通の実測ではできないのか】
 *   D-035 が要求する M は 3,896,104 です。§13.2 の「10万レース」で測ると
 *   3.9×10^11 回のレース解決になり、本番機の 35μs/試行では **約44日**かかります。
 *   **レース数を増やす方向では回りません。**
 *
 * 【★分散低減: 同じレースから確定結果を多数引く】
 *   測りたいのは「オッズが正しいか」であって「どのレースが出たか」ではありません。
 *   1レースにつきオッズを1回作り、**独立系列から K 回の確定結果**を引けば、
 *   そのレースの実現払戻率が高精度で出ます。
 *   測っている量（オッズ推定の誤差）は変わらず、**分散だけが下がります。**
 *
 * 【★ただしレース数は1にできません（D-036）】
 *   残差 Σ(1−pᵢ)/(M·pᵢ) は**出走表の確率構造に依存します**。
 *   堅い1番人気がいるレースと横一線のレースでは違います。
 *   1つの出走表を10万回引いても、**出走表間のばらつきは1標本のまま**です
 *   （A-3 をシード4本で判定して失敗したのと同じ形・R-20）。
 *
 *   → K は**レース内**の分散を、RACES は**レース間**の分散を潰します。両方要ります。
 *   → ★確定を K 回引いたぶんは **`foldRaceSample` で「1 レース 1 標本」に畳みます**。
 *     ★畳まないと `races` が `RACES × K` になり、**SE がレース内の分散で薄まります**。
 *
 * 【★本番のコードを通す】
 *   オッズは `apps/worker/src/odds.ts` の `buildOddsRows` で作ります。
 *   D-013 の補正も D-035 の発売下限も、**本番が使うものと同じ実装**を通ります。
 *   ここで別の式を書くと、確かめたことになりません。
 *
 * 【★2026-09-16 の訂正 — 裁定 `REVIEW_GAME_BODY_5_VERDICT_20260916.md` §10・§12-4】
 *   ⚠️ ★**以前この道具は、売っていない目が当たったとき払戻に 0 を足したまま、
 *      賭け金だけを数えていました**（旧 `:108-113`）。★D-096 の下でその目は**客が買えません**。
 *      ★買えない目の当たりを払戻から引くのは ★**製品ではなく測定の誤り**です。
 *      ★`place` は 1 レースの売り目が 13 しかなく未発売が 3.32% だったので、
 *      ★最も大きく出て **−1.26pt** になっていました。
 *   → ★集計を **`v10-accounting.ts`（`accountRaceKind` / `judgeKind`）に通します**。
 *     ★同じ関数を `verify-payout.ts` も通るので、★**測り方が 1 か所**になります（D-052・R-30）。
 *     ★未発売の的中は**賭け金にも払戻にも入らず**、規則ごとに件数だけ数えます。
 *   → ★SE も **比の推定量**（正典 §13.2）に揃います。★以前はレースごとの払戻率を
 *     ★**等しい重みで平均**しており、★2026-09-14 に `verify-payout.ts` 側では捨てた形でした。
 *   ⚠️ ★**較正定数は 1 つも動かしていません**（`margin`・`ODDS_MC_TRIALS`・`LAMBDA_STAR`・`ODDS_CAP`）。
 *
 * 実行: npm run verify:pmin -- --races 8 --finals 100000
 */
import { NICKS_GEN, deriveRng, VERIFY_PAYOUT_STREAM as S } from '@star/sim-engine';
import { DEFAULT_RACE_BALANCE, lanePlanForRace, resolveRace, type RaceEntrant, type RaceResult } from '@star/race-engine';
import { TICKET_KINDS, placeDepth, type TicketKind } from '@star/betting';
import { ODDS_MC_TRIALS, buildOddsRows, winningKeys } from '../../worker/src/odds.js';
import { generateRace, sortPoolByClass } from './race-field.js';
import { resolveRuntimeConfig } from './config.js';
import { runSimulation } from './simulator.js';
import { POOL_GENERATIONS, POOL_MARES } from './measurement.js';
import {
  V10_SE_LIMIT,
  V10_TOLERANCE,
  accountRaceKind,
  emptyKindStat,
  foldRaceSample,
  judgeKind,
  type KindStat,
} from './v10-accounting.js';

const argv = process.argv.slice(2);
const num = (n: string, d: number): number => {
  const i = argv.indexOf(`--${n}`);
  const v = i >= 0 ? Number(argv[i + 1]) : NaN;
  return Number.isFinite(v) ? v : d;
};
const SEED = num('seed', 42);
const RACES = num('races', 100);
const FINALS = num('finals', 20_000);
const MC = num('odds-trials', ODDS_MC_TRIALS);

const { balance, founders } = resolveRuntimeConfig();
const sim = runSimulation(
  { seed: SEED, generations: POOL_GENERATIONS, population: POOL_MARES,
    stallionPool: Math.round(POOL_MARES * 0.3), v1Pairs: 1, v1Repeats: 5, retainFinalPopulation: true },
  balance, founders, NICKS_GEN,
);
const pool = sortPoolByClass(sim.finalPopulation ?? []);
const orderOf = (r: RaceResult): number[] => r.order.map((x) => Number(x.horseId.replace(/^H/, '')));

/** ★全レースをまたいだ集計（★1 レース 1 標本で積む） */
const total = new Map<TicketKind, KindStat>(TICKET_KINDS.map((k) => [k, emptyKindStat()]));

console.log(`# D-035 を本番コード経路で確認  seed=${SEED} races=${RACES} M=${MC.toLocaleString()} 確定${FINALS.toLocaleString()}回/レース`);
console.log(`  ★1レースにつきオッズを1回作り、独立系列から確定を多数引く（分散低減）`);
console.log(`  ★集計は v10-accounting.ts（verify-payout.ts と同じ 1 か所）。★未発売の的中は賭け金にも払戻にも入らない`);
console.log(`  ★判定値は切り捨て前の払戻率（D-094）・SE は比の推定量（§13.2）・確定の多数引きは 1 レース 1 標本に畳む（D-036）`);

for (let i = 0; i < RACES; i += 1) {
  const race = generateRace(pool, i, deriveRng(SEED, S.FIELD, i));
  const entrants: RaceEntrant[] = race.entrants.map((e, k) => ({ ...e, horseId: `H${k + 1}` }));
  const depth = placeDepth(entrants.length);
  // ★距離ロスの下ごしらえはレースごとに 1 回（ワーカーの build-race.ts と同じ形・ES-6・R-30）
  const lanePlan = lanePlanForRace(race.conditions);

  // --- オッズ算出（§9.2: 別系列） ---
  const counts = new Map<TicketKind, Map<string, number>>(TICKET_KINDS.map((k) => [k, new Map()]));
  const oddsRng = deriveRng(SEED, S.ODDS, i);
  for (let t = 0; t < MC; t += 1) {
    const order = orderOf(resolveRace({ conditions: race.conditions, entrants, seed: oddsRng.nextUint32(), balance: DEFAULT_RACE_BALANCE, lanePlan }));
    for (const kind of TICKET_KINDS) {
      const m = counts.get(kind)!;
      for (const key of winningKeys(kind, order, depth)) m.set(key, (m.get(key) ?? 0) + 1);
    }
  }

  /**
   * ★**本番のオッズ表を作る**（★D-013 の補正・D-035 の発売下限を通す）。
   * ★ここでは「売る目の数」を照合するためだけに使います — ★オッズそのものは
   * ★`accountRaceKind` が同じ `counts` から同じ関数で出します（★二重帳簿にしない）。
   */
  const rows = buildOddsRows(counts, MC);
  const soldRows = new Map<TicketKind, number>(
    TICKET_KINDS.map((k) => [k, rows.filter((r) => r.betType === k).length]),
  );

  // --- 確定を K 回引く（§8.6 とは別系列でよい。ここは測定） ---
  /** ★レース内の集計（★畳む前。★ここで `races` が K 回ぶん増えるのは想定どおり） */
  const perRace = new Map<TicketKind, KindStat>(TICKET_KINDS.map((k) => [k, emptyKindStat()]));
  const finalRng = deriveRng(SEED, S.FINAL, i);
  for (let t = 0; t < FINALS; t += 1) {
    const order = orderOf(resolveRace({ conditions: race.conditions, entrants, seed: finalRng.nextUint32(), balance: DEFAULT_RACE_BALANCE, lanePlan }));
    for (const kind of TICKET_KINDS) {
      accountRaceKind(perRace.get(kind)!, kind, counts.get(kind)!, MC, winningKeys(kind, order, depth));
    }
  }

  for (const kind of TICKET_KINDS) {
    const st = perRace.get(kind)!;
    /**
     * ★**本番のオッズ表と「売る目」が一致することを毎レース確かめる**（R-30）。
     * ★食い違えば、★測定器と製品が別の集合を見ています（★2026-09-14 に踏んだ形）。
     */
    const want = soldRows.get(kind)! * FINALS;
    if (st.stake !== want) {
      throw new Error(
        `${kind}: レース ${i} で売る目が食い違いました（測定 ${st.stake} / 本番のオッズ表 ${want}）。` +
        `★測定器と製品が別の述語を通っています（R-30）`,
      );
    }
    if (st.stake === 0) throw new Error(`${kind}: レース ${i} の売り目が0です（R-21）`);
    /** ★★確定を何回引いても「1 レース 1 標本」（D-036） */
    foldRaceSample(total.get(kind)!, st, FINALS);
  }

  if ((i + 1) % 10 === 0 || i + 1 === RACES) {
    console.log(`  レース ${i + 1}/${RACES} 完了`);
  }
}

console.log('');
const pct = (x: number): string => `${(x * 100).toFixed(2)}%`;
const pt = (x: number): string => `${x * 100 >= 0 ? '+' : ''}${(x * 100).toFixed(2)}pt`;

let allPass = true;
let allSeReached = true;
for (const kind of TICKET_KINDS) {
  const st = total.get(kind)!;
  const v = judgeKind(kind, st);
  if (!v.pass) allPass = false;
  if (!v.seReached) allSeReached = false;
  /** ★件数は延べ（確定 `FINALS` 回ぶん）。★比の分母ではない */
  const draws = RACES * FINALS;
  console.log(
    `  ${kind.padEnd(16)} ★判定値＝切り捨て前 ${pct(v.rateBeforeFloor)}（乖離 ${pt(v.rateBeforeFloor - v.target)}）  ` +
      `切り捨て後 ${pct(v.rateAfterFloor)}  目標 ${pct(v.target)}  ` +
      `売目 ${(st.stake / RACES).toFixed(1)}/R  ` +
      `未発売の的中 ${((st.unseenHits / draws) * 100).toFixed(2)}%（延べ ${st.unseenHits} 回・★賭け金にも払戻にも入れていない）  ` +
      `D-035で売らず 的中 ${st.unsoldMinProbability.hits} ／ D-096で売らず 的中 ${st.unsoldEvenOdds.hits}  ` +
      `出走表間SD ${v.raceSd === null ? '-' : pt(v.raceSd)}  SE ${v.se === null ? '-' : pt(v.se)}` +
      `（${v.seReached ? `≤${V10_SE_LIMIT * 100}pt に届いた` : `★${V10_SE_LIMIT * 100}pt に届いていない`}）  ` +
      `${v.pass ? 'PASS' : 'FAIL'}`,
  );
}

// ★D-035 の下では cap に当たる目が存在しないはず。立っていたら発売下限が効いていない
const cappedTotal = [...total.values()].reduce((a, b) => a + b.cappedBets, 0);
console.log(`\n  ★上限に当たった売り目: ${cappedTotal} 件（D-035 の下では 0 のはず）`);
if (cappedTotal !== 0) throw new Error('発売下限が効いていません（上限に当たる目が売られています）');
console.log(`  ★V-10 総合（切り捨て前で判定・帯は ±${V10_TOLERANCE * 100}%）: ${allPass ? 'PASS' : 'FAIL'}`);
if (!allSeReached) {
  console.log(`  ★SE が ${V10_SE_LIMIT * 100}pt に届いていない券種があります。**この実行は正式な V-10 ゲートではありません**（D-036）。合否は判定不能として扱ってください（R-3）`);
}

/**
 * ★**終了コードに判定を出す。**
 *   `verify-payout.ts` と同じ欠陥がここにもありました（FAIL でも 0 を返す）。
 *   ★A-3 の記録を作ったのは**このツール**なので、こちらのほうが影響が大きい:
 *     自動判定に載せれば **A-3 は常に成功**になります。
 * ★2026-09-16: ★**SE が届いていなければ 2（判定不能）**を返します（★`verify-payout.ts` と同じ・R-3）。
 *   ★以前は SE 未達でも 0 を返しており、★D-036 を満たさない実行が「合格」として通りました。
 */
process.exit(!allPass ? 1 : allSeReached ? 0 : 2);
