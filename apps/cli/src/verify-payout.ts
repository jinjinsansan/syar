/**
 * A-3 / V-10: 券種別の払戻率が設定 margin ±1% に収まるか（正典 §13.2・§9.2）
 *
 * 【何を測っているのか】
 *   全組合せに1点ずつ買うと、オッズが正確なら期待払戻率は厳密に (1 − margin) になる:
 *     Σ p_i × odds_i = Σ p_i × (1/p_i)(1 − margin) = (1 − margin) × 組合せ数
 *   したがって**実測の払戻率が (1 − margin) からずれる量は、そのままオッズの誤差**である。
 *   ずれの主因は2つで、どちらも報告する:
 *     (a) モンテカルロの推定誤差（試行10,000回・§9.2）
 *     (b) 配当上限（§9.4）による切り詰め ＝ 胴元の取り分が増える方向にだけ効く
 *
 * 【★オッズ用と確定用でシードを分ける（§9.2）】
 *   同じ系列を使うと「オッズを作った乱数で結果も決まる」ので、
 *   払戻率が理論値に張り付いて**測定にならない**。P1 で系列の独立性を実証した
 *   `deriveRng(seed, STREAM, index)` の仕組みをそのまま使う。
 *
 * 【★未解決: このままでは A-3 を判定できない】
 *   実測（seed42）: races=60 で win 52.43%、races=400 で win 97.09%。
 *   **分散が支配的**で、平均への収束が遅い（1本の高配当が全体を動かす）。
 *   place（低配当）だけは 83.06% と目標 82% に近く、推定自体は壊れていない。
 *
 *   ±1% を判定するには正典 §13.2 の10万レースが要るが、
 *   §9.2 のオッズ算出が1レースあたり MC 1万回なので **10^9 回のレース解決**になり、
 *   単純にレース数を増やす方向では回らない。
 *
 *   → 分散低減が要る。案: 1レースにつき確定結果を1つ引くのではなく、
 *     **独立系列から多数の確定結果を引いて1レースの実現払戻率を出す**。
 *     これなら測っているもの（MC 推定の誤差）は変わらず、分散だけが下がる。
 *     採否と、A-3 の「10万レース」がこの形でよいかを照会する。
 *
 * 【★2026-09-14・AUDIT_FIX2 BF-5・BF-6】
 *   ① 売る目は、本番のオッズ表と同じ述語 `sellDecision` で決める（D-035・D-096）。
 *      以前は、本番が売らない目まで賭け金に入れていた（測定器と製品が別々に「売る目」を決めていた・R-30）
 *   ② 合否は**切り捨て前の払戻率**で出す（D-094）。切り捨て後とその差は並べるだけ
 *   ③ 出走表間 SD と SE を出す。SE が 0.25pt に届かなければ「判定不能」（D-036・R-3）
 *   集計と判定は `v10-accounting.ts` に切り出し、`apps/cli/test/v10-accounting.test.ts` で固定している
 *
 * 実行: npm run verify:payout -- --races 2000 --seeds 42
 */

import {
  VERIFY_PAYOUT_STREAM, NICKS_GEN, deriveRng } from '@star/sim-engine';
import {
  DEFAULT_RACE_BALANCE,
  conditionsFromFrozen,
  lanePlanForRace,
  resolveRace,
  type RaceEntrant,
  type RaceResult,
} from '@star/race-engine';
import { productionRaceOf } from '@star/scheduler';
import {
  TICKET_KINDS,
  placeDepth,
  type TicketKind,
} from '@star/betting';
import { generateRace, sortPoolByClass } from './race-field.js';
import { resolveRuntimeConfig } from './config.js';
import { runSimulation } from './simulator.js';
import { POOL_GENERATIONS, POOL_MARES } from './measurement.js';
import { assertKnownArgs } from './cli-args.js';
import {
  V10_SE_LIMIT,
  V10_TOLERANCE,
  accountRaceKind,
  emptyKindStat,
  judgeKind,
  mergeKindStat,
  type KindStat,
} from './v10-accounting.js';

// ★用途IDは集約表から取る。ここで独自採番したために race.ts の 1/2 と重なっていた
//   （レビュー側 2026-08-07 の指摘。相関は実測で否定されたが、重なる構造は実在した）
const STREAM = VERIFY_PAYOUT_STREAM;

const argv = process.argv.slice(2);
/**
 * ★**引数を取りこぼしたまま既定値で走らない**（★2026-09-17 の事故・`verify-pmin` と同じ形）。
 * ⚠️ ★`npm run verify:payout -- --races 500` は ★**PowerShell では壊れます**（★`--` が落ちる）。
 * → ★`npx tsx apps/cli/src/verify-payout.ts --races 500` で呼んでください。
 */
assertKnownArgs(
  argv,
  { valueFlags: ['--odds-trials', '--races', '--seeds'], switches: ['--legacy-conditions'] },
  'verify-payout',
);
const argOf = (name: string, fallback: number): number => {
  const i = argv.indexOf(`--${name}`);
  const v = i >= 0 ? Number(argv[i + 1]) : NaN;
  return Number.isFinite(v) ? v : fallback;
};
const listOf = (name: string, fallback: readonly number[]): number[] => {
  const i = argv.indexOf(`--${name}`);
  if (i < 0) return [...fallback];
  return (argv[i + 1] ?? '').split(',').map(Number).filter(Number.isFinite);
};

/** 正典 §9.2: オッズ算出のモンテカルロ試行数 */
const ODDS_TRIALS = argOf('odds-trials', 10_000);
const RACES = argOf('races', 2_000);
const SEEDS = listOf('seeds', [42]);
/**
 * ★**既定は本番の条件**（★2026-09-15・指示書 VW §7-1・R-31）。
 *   ★レース番号をサイクル番号として `productionRaceOf` に通し、★番組の距離・馬場・競馬場と
 *   ★**凍結した走路の形**（オッズと確定が同じ形を読む）で測ります。
 *   ★`--legacy-conditions` … ★旧来の条件（`generateRace` が自分で引く距離・馬場・`DEFAULT_OVAL`・1400m 以下の 20% 直線）。比較用
 */
const LEGACY_CONDITIONS = argv.includes('--legacy-conditions');

/** 着順から、その券種の「当たり目」のキーを作る */
function winningKeys(kind: TicketKind, order: readonly number[], fieldSize: number): string[] {
  const depth = placeDepth(fieldSize);
  const sortKey = (xs: number[]): string => [...xs].sort((a, b) => a - b).join('-');
  switch (kind) {
    case 'win':
      return [String(order[0])];
    case 'place':
      return order.slice(0, depth).map(String);
    case 'quinella_place': {
      const top = order.slice(0, depth);
      const out: string[] = [];
      for (let i = 0; i < top.length; i += 1) {
        for (let j = i + 1; j < top.length; j += 1) out.push(sortKey([top[i]!, top[j]!]));
      }
      return out;
    }
    case 'quinella':
      return [sortKey([order[0]!, order[1]!])];
    case 'exacta':
      return [`${order[0]}>${order[1]}`];
    case 'trio':
      return [sortKey([order[0]!, order[1]!, order[2]!])];
    case 'trifecta':
      return [`${order[0]}>${order[1]}>${order[2]}`];
    default: {
      const never: never = kind;
      throw new Error(String(never));
    }
  }
}

function orderOf(result: RaceResult): number[] {
  return result.order.map((r) => Number(r.horseId.replace(/^H/, '')));
}

function runSeed(seed: number): Map<TicketKind, KindStat> {
  // ★母集団は verify:race と同じ作り方（実際の遺伝エンジンの産物）にする。
  //   ここだけ別の作り方にすると、V-4/V-6 と違う集団で払戻率を測ることになる。
  const { balance: geneticsBalance, founders } = resolveRuntimeConfig();
  const sim = runSimulation(
    {
      seed,
      generations: POOL_GENERATIONS,
      population: POOL_MARES,
      stallionPool: Math.round(POOL_MARES * 0.3),
      v1Pairs: 1,
      v1Repeats: 5,
      retainFinalPopulation: true,
    },
    geneticsBalance,
    founders,
    NICKS_GEN,
  );
  const pool = sortPoolByClass(sim.finalPopulation ?? []);
  if (pool.length === 0) throw new Error('母集団の取得に失敗（retainFinalPopulation）');
  const stats = new Map<TicketKind, KindStat>(TICKET_KINDS.map((k) => [k, emptyKindStat()]));

  for (let raceIndex = 0; raceIndex < RACES; raceIndex += 1) {
    const prod = LEGACY_CONDITIONS ? null : productionRaceOf(raceIndex);
    const race = generateRace(
      pool, raceIndex, deriveRng(seed, STREAM.FIELD, raceIndex), undefined, undefined, undefined,
      prod === null ? {} : {
        programme: {
          surface: prod.programme.surface, distance: prod.programme.distance, courseShape: prod.courseFrozen.courseShape,
        },
      },
    );
    // ★オッズも確定も、凍結した走路の形から同じ関数で作った条件で回す（ワーカーの build-race.ts・pg-store.ts と同じ）
    const conditions = prod === null ? race.conditions : conditionsFromFrozen(prod.courseFrozen, race.conditions);
    // 馬番を 1..n に振り直す（馬券は馬番で買う）
    const entrants: RaceEntrant[] = race.entrants.map((e, i) => ({ ...e, horseId: `H${i + 1}` }));
    const fieldSize = entrants.length;

    // --- オッズ算出（§9.2: 別系列・モンテカルロ） ---
    const counts = new Map<TicketKind, Map<string, number>>(
      TICKET_KINDS.map((k) => [k, new Map<string, number>()]),
    );
    const oddsRng = deriveRng(seed, STREAM.ODDS, raceIndex);
    // ★距離ロスの下ごしらえは試行の前に 1 回（ワーカーの build-race.ts と同じ形・ES-6・R-30）
    const lanePlan = lanePlanForRace(conditions);
    for (let t = 0; t < ODDS_TRIALS; t += 1) {
      const sim = resolveRace({
        conditions,
        entrants,
        seed: oddsRng.nextUint32(),
        balance: DEFAULT_RACE_BALANCE,
        lanePlan,
      });
      const order = orderOf(sim);
      for (const kind of TICKET_KINDS) {
        const m = counts.get(kind)!;
        for (const key of winningKeys(kind, order, fieldSize)) m.set(key, (m.get(key) ?? 0) + 1);
      }
    }

    // --- 本番確定（§8.6: オッズとは別系列） ---
    const final = resolveRace({
      conditions,
      entrants,
      seed: deriveRng(seed, STREAM.FINAL, raceIndex).nextUint32(),
      balance: DEFAULT_RACE_BALANCE,
      lanePlan,
    });
    const finalOrder = orderOf(final);

    // --- 売る目すべてに 1 点ずつ買い、確定着順で精算する ---
    //   ★売る目は本番のオッズ表と同じ述語で決める（`sellDecision`・AUDIT_FIX2 BF-5・R-30）
    for (const kind of TICKET_KINDS) {
      accountRaceKind(stats.get(kind)!, kind, counts.get(kind)!, ODDS_TRIALS, winningKeys(kind, finalOrder, fieldSize));
    }
  }
  return stats;
}

console.log(`# A-3 / V-10 払戻率（券種別・設定margin ±${V10_TOLERANCE * 100}%・★判定値は切り捨て前の払戻率 D-094）`);
console.log(`  races=${RACES} odds-trials=${ODDS_TRIALS} seeds=${SEEDS.join(',')}`);
console.log(`  条件: ${LEGACY_CONDITIONS
  ? '★旧来（--legacy-conditions: generateRace が引く距離・馬場・DEFAULT_OVAL・1400m 以下の 20% 直線）'
  : '本番（productionRaceOf: 番組の距離・馬場・競馬場・凍結した走路の形）'}`);

const total = new Map<TicketKind, KindStat>(TICKET_KINDS.map((k) => [k, emptyKindStat()]));
for (const seed of SEEDS) {
  const s = runSeed(seed);
  for (const k of TICKET_KINDS) mergeKindStat(total.get(k)!, s.get(k)!);
}

const pct = (x: number): string => `${(x * 100).toFixed(2)}%`;
const pt = (x: number): string => `${x * 100 >= 0 ? '+' : ''}${(x * 100).toFixed(2)}pt`;
const runs = RACES * SEEDS.length;

let allPass = true;
let allSeReached = true;
for (const k of TICKET_KINDS) {
  const st = total.get(k)!;
  const v = judgeKind(k, st);
  if (!v.pass) allPass = false;
  if (!v.seReached) allSeReached = false;
  console.log(
    `  ${k.padEnd(16)} ★判定値＝切り捨て前 ${pct(v.rateBeforeFloor)}（乖離 ${pt(v.rateBeforeFloor - v.target)}）  ` +
      `切り捨て後 ${pct(v.rateAfterFloor)}  差 ${pt(v.floorDiff)}  目標 ${pct(v.target)}  ` +
      `売目 ${(st.stake / runs).toFixed(1)}/R  ` +
      `D-035で売らず ${(st.unsoldMinProbability.bets / runs).toFixed(1)}/R（的中 ${st.unsoldMinProbability.hits}・売っていたら払戻 ${st.unsoldMinProbability.payoutBeforeFloor.toFixed(1)}）  ` +
      `D-096で売らず ${(st.unsoldEvenOdds.bets / runs).toFixed(1)}/R（的中 ${st.unsoldEvenOdds.hits}・売っていたら払戻 ${st.unsoldEvenOdds.payoutBeforeFloor.toFixed(1)}）  ` +
      `未発売的中 ${st.unseenHits}  cap該当 ${st.cappedBets}  ` +
      `出走表間SD ${v.raceSd === null ? '-' : pt(v.raceSd)}  SE ${v.se === null ? '-' : pt(v.se)}` +
      `（${v.seReached ? `≤${V10_SE_LIMIT * 100}pt に届いた` : `★${V10_SE_LIMIT * 100}pt に届いていない`}）  ` +
      `${v.pass ? 'PASS' : 'FAIL'}（参考: 切り捨て後で判定すると ${v.passAfterFloor ? 'PASS' : 'FAIL'}）`,
  );
}

console.log(`\n  V-10 総合（切り捨て前で判定）: ${allPass ? 'PASS' : 'FAIL'}`);
if (!allSeReached) {
  console.log(`  ★SE が ${V10_SE_LIMIT * 100}pt に届いていない券種があります。**この実行は正式な V-10 ゲートではありません**（D-036）。合否は判定不能として扱ってください（R-3）`);
}

/**
 * ★**終了コードに判定を出す。**
 *
 *   ここまで `process.exit` が無く、**FAIL でも 0 を返していました**。
 *   ★画面には「V-10 総合: FAIL」と出るので人が読めば分かりますが、
 *     **自動判定に載せた瞬間、必ず通ります**（判定は常に成功扱い）。
 *   実際、再実行を `終了コード=0` で確認しかけました。
 *
 *   ⚠️ 「出力に FAIL と書いてある」は「落ちた」ではありません。R-21 と同じ形です。
 *
 * ★2026-09-14: 不合格は 1、**全券種が帯の内でも SE が届いていなければ 2（判定不能）**。0 を返すのは両方そろったときだけ（R-3）。
 */
process.exit(!allPass ? 1 : allSeReached ? 0 : 2);
