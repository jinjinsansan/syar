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
 * 実行: npm run verify:payout -- --races 2000 --seeds 42
 */

import { NICKS_GEN, deriveRng } from '@star/sim-engine';
import {
  DEFAULT_RACE_BALANCE,
  resolveRace,
  type RaceEntrant,
  type RaceResult,
} from '@star/race-engine';
import {
  MARGIN,
  ODDS_CAP,
  TICKET_KINDS,
  oddsFromProbability,
  placeDepth,
  type TicketKind,
} from '@star/betting';
import { generateRace, sortPoolByClass } from './race-field.js';
import { resolveRuntimeConfig } from './config.js';
import { runSimulation } from './simulator.js';
import { POOL_GENERATIONS, POOL_MARES } from './measurement.js';

/** 乱数サブストリームの用途 ID（識別子であって較正値ではない） */
const STREAM = {
  POOL: 1,
  FIELD: 2,
  /** ★オッズ算出用（§9.2: 本番確定用とは別系列） */
  ODDS: 3,
  /** ★本番確定用（§8.6 の final_seed 相当） */
  FINAL: 4,
} as const;

const argv = process.argv.slice(2);
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

interface KindStat {
  stake: number;
  payout: number;
  /** MC で一度も出なかった目が的中した回数（オッズが cap になり大きく払う） */
  unseenHits: number;
  bets: number;
}

function emptyStat(): KindStat {
  return { stake: 0, payout: 0, unseenHits: 0, bets: 0 };
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
  const stats = new Map<TicketKind, KindStat>(TICKET_KINDS.map((k) => [k, emptyStat()]));

  for (let raceIndex = 0; raceIndex < RACES; raceIndex += 1) {
    const race = generateRace(pool, raceIndex, deriveRng(seed, STREAM.FIELD, raceIndex));
    // 馬番を 1..n に振り直す（馬券は馬番で買う）
    const entrants: RaceEntrant[] = race.entrants.map((e, i) => ({ ...e, horseId: `H${i + 1}` }));
    const fieldSize = entrants.length;

    // --- オッズ算出（§9.2: 別系列・モンテカルロ） ---
    const counts = new Map<TicketKind, Map<string, number>>(
      TICKET_KINDS.map((k) => [k, new Map<string, number>()]),
    );
    const oddsRng = deriveRng(seed, STREAM.ODDS, raceIndex);
    for (let t = 0; t < ODDS_TRIALS; t += 1) {
      const sim = resolveRace({
        conditions: race.conditions,
        entrants,
        seed: oddsRng.nextUint32(),
        balance: DEFAULT_RACE_BALANCE,
      });
      const order = orderOf(sim);
      for (const kind of TICKET_KINDS) {
        const m = counts.get(kind)!;
        for (const key of winningKeys(kind, order, fieldSize)) m.set(key, (m.get(key) ?? 0) + 1);
      }
    }

    // --- 本番確定（§8.6: オッズとは別系列） ---
    const final = resolveRace({
      conditions: race.conditions,
      entrants,
      seed: deriveRng(seed, STREAM.FINAL, raceIndex).nextUint32(),
      balance: DEFAULT_RACE_BALANCE,
    });
    const finalOrder = orderOf(final);

    // --- 全組合せに1点ずつ買う ---
    for (const kind of TICKET_KINDS) {
      const st = stats.get(kind)!;
      const m = counts.get(kind)!;
      // 買える目 = MC で1回以上出た目（p=0 の目は運営が売らない想定）
      st.stake += m.size;
      st.bets += m.size;
      for (const key of winningKeys(kind, finalOrder, fieldSize)) {
        const c = m.get(key);
        if (c === undefined) {
          // 売っていない目が当たった ＝ 払戻なし。頻度を報告する（見逃すと払戻率が過大に出る）
          st.unseenHits += 1;
          continue;
        }
        st.payout += oddsFromProbability(kind, c / ODDS_TRIALS);
      }
    }
  }
  return stats;
}

console.log(`# A-3 / V-10 払戻率（券種別・設定margin ±1%）`);
console.log(`  races=${RACES} odds-trials=${ODDS_TRIALS} seeds=${SEEDS.join(',')}`);

const total = new Map<TicketKind, KindStat>(TICKET_KINDS.map((k) => [k, emptyStat()]));
for (const seed of SEEDS) {
  const s = runSeed(seed);
  for (const k of TICKET_KINDS) {
    const a = total.get(k)!;
    const b = s.get(k)!;
    a.stake += b.stake;
    a.payout += b.payout;
    a.unseenHits += b.unseenHits;
    a.bets += b.bets;
  }
}

let allPass = true;
for (const k of TICKET_KINDS) {
  const st = total.get(k)!;
  const rate = st.stake === 0 ? 0 : st.payout / st.stake;
  const target = 1 - MARGIN[k];
  const dev = rate - target;
  const pass = Math.abs(dev) <= 0.01;
  if (!pass) allPass = false;
  console.log(
    `  ${k.padEnd(16)} 払戻率 ${(rate * 100).toFixed(2)}%  目標 ${(target * 100).toFixed(0)}%  ` +
      `乖離 ${(dev * 100 >= 0 ? '+' : '') + (dev * 100).toFixed(2)}pt  ` +
      `売目 ${(st.bets / (RACES * SEEDS.length)).toFixed(0)}/R  ` +
      `未発売的中 ${st.unseenHits}  cap ${ODDS_CAP[k]}  ${pass ? 'PASS' : 'FAIL'}`,
  );
}
console.log(`\n  V-10 総合: ${allPass ? 'PASS' : 'FAIL'}`);
