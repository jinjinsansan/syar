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
 *   → ★N が足りているかは推測せず、**レース間のばらつきから SE を出して報告**します。
 *
 * 【★本番のコードを通す】
 *   オッズは `apps/worker/src/odds.ts` の `buildOddsRows` で作ります。
 *   D-013 の補正も D-035 の発売下限も、**本番が使うものと同じ実装**を通ります。
 *   ここで別の式を書くと、確かめたことになりません。
 *
 * 実行: npx tsx apps/cli/src/verify-pmin.ts --races 8 --finals 100000
 */
import { NICKS_GEN, deriveRng, VERIFY_PAYOUT_STREAM as S } from '@star/sim-engine';
import { DEFAULT_RACE_BALANCE, resolveRace, type RaceEntrant, type RaceResult } from '@star/race-engine';
import { MARGIN, TICKET_KINDS, placeDepth, type TicketKind } from '@star/betting';
import { ODDS_MC_TRIALS, buildOddsRows, winningKeys } from '../../worker/src/odds.js';
import { generateRace, sortPoolByClass } from './race-field.js';
import { resolveRuntimeConfig } from './config.js';
import { runSimulation } from './simulator.js';
import { POOL_GENERATIONS, POOL_MARES } from './measurement.js';

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
const keyOfSelection = (sel: readonly number[], kind: TicketKind): string =>
  kind === 'exacta' || kind === 'trifecta' ? sel.join('>') : [...sel].sort((a, b) => a - b).join('-');

interface Stat { stake: number; payout: number; unsold: number; capped: number }
const total = new Map<TicketKind, Stat>(
  TICKET_KINDS.map((k) => [k, { stake: 0, payout: 0, unsold: 0, capped: 0 }]),
);
/** ★レースごとの払戻率。レース間のばらつき（＝N が足りているか）を測るために要る */
const perRace = new Map<TicketKind, number[]>(TICKET_KINDS.map((k) => [k, []]));

console.log(`# D-035 を本番コード経路で確認  seed=${SEED} races=${RACES} M=${MC.toLocaleString()} 確定${FINALS.toLocaleString()}回/レース`);
console.log(`  ★1レースにつきオッズを1回作り、独立系列から確定を多数引く（分散低減）`);

for (let i = 0; i < RACES; i += 1) {
  const race = generateRace(pool, i, deriveRng(SEED, S.FIELD, i));
  const entrants: RaceEntrant[] = race.entrants.map((e, k) => ({ ...e, horseId: `H${k + 1}` }));
  const depth = placeDepth(entrants.length);

  // --- オッズ算出（§9.2: 別系列） ---
  const counts = new Map<TicketKind, Map<string, number>>(TICKET_KINDS.map((k) => [k, new Map()]));
  const oddsRng = deriveRng(SEED, S.ODDS, i);
  for (let t = 0; t < MC; t += 1) {
    const order = orderOf(resolveRace({ conditions: race.conditions, entrants, seed: oddsRng.nextUint32(), balance: DEFAULT_RACE_BALANCE }));
    for (const kind of TICKET_KINDS) {
      const m = counts.get(kind)!;
      for (const key of winningKeys(kind, order, depth)) m.set(key, (m.get(key) ?? 0) + 1);
    }
  }

  // ★本番と同じ関数でオッズ表を作る（D-013 の補正・D-035 の発売下限を通す）
  const rows = buildOddsRows(counts, MC);
  const oddsOf = new Map<TicketKind, Map<string, number>>(TICKET_KINDS.map((k) => [k, new Map()]));
  for (const r of rows) {
    oddsOf.get(r.betType)!.set(keyOfSelection(r.selection, r.betType), r.odds);
    if (r.capped) total.get(r.betType)!.capped += 1;
  }

  // --- 確定を K 回引く（§8.6 とは別系列でよい。ここは測定） ---
  const beforeStake = new Map(TICKET_KINDS.map((k) => [k, total.get(k)!.stake]));
  const beforePayout = new Map(TICKET_KINDS.map((k) => [k, total.get(k)!.payout]));
  const finalRng = deriveRng(SEED, S.FINAL, i);
  for (let t = 0; t < FINALS; t += 1) {
    const order = orderOf(resolveRace({ conditions: race.conditions, entrants, seed: finalRng.nextUint32(), balance: DEFAULT_RACE_BALANCE }));
    for (const kind of TICKET_KINDS) {
      const st = total.get(kind)!;
      const table = oddsOf.get(kind)!;
      // 全売り目に1点ずつ買う
      st.stake += table.size;
      for (const key of winningKeys(kind, order, depth)) {
        const odds = table.get(key);
        if (odds === undefined) st.unsold += 1; // 売っていない目が当たった（払戻なし）
        else st.payout += odds;
      }
    }
  }
  for (const kind of TICKET_KINDS) {
    const st = total.get(kind)!;
    const stake = st.stake - beforeStake.get(kind)!;
    const payout = st.payout - beforePayout.get(kind)!;
    if (stake === 0) throw new Error(`${kind}: レース ${i} の売り目が0です（R-21）`);
    perRace.get(kind)!.push(payout / stake);
  }
  if ((i + 1) % 10 === 0 || i + 1 === RACES) {
    console.log(`  レース ${i + 1}/${RACES} 完了`);
  }
}

console.log('');
let allPass = true;
for (const kind of TICKET_KINDS) {
  const st = total.get(kind)!;
  // ★R-21: 読み取れない量で判定しない
  if (st.stake === 0) throw new Error(`${kind}: 売り目が0です。測定が成立していません`);
  const rate = st.payout / st.stake;
  const dev = (rate - (1 - MARGIN[kind])) * 100;
  const pass = Math.abs(dev) <= 1;
  if (!pass) allPass = false;
  // ★レース間のばらつきから SE を出す。N が足りているかを**測って**言う
  const xs = perRace.get(kind)!;
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (xs.length - 1)) * 100;
  const se = sd / Math.sqrt(xs.length);
  console.log(
    `  ${kind.padEnd(16)} 払戻率 ${(rate * 100).toFixed(2)}%  ` +
      `乖離 ${((dev >= 0 ? '+' : '') + dev.toFixed(2) + 'pt').padStart(7)}  ` +
      `レース間SD ${sd.toFixed(2).padStart(5)}pt  SE ${se.toFixed(3)}pt  ` +
      `売目 ${(st.stake / (RACES * FINALS)).toFixed(0).padStart(4)}/R  ` +
      `未発売 ${((st.unsold / (RACES * FINALS)) * 100).toFixed(2)}%  ${pass ? 'PASS' : 'FAIL'}`,
  );
}
// ★D-035 の下では cap に当たる目が存在しないはず。立っていたら発売下限が効いていない
const cappedTotal = [...total.values()].reduce((a, b) => a + b.capped, 0);
console.log(`\n  ★上限に当たった売り目: ${cappedTotal} 件（D-035 の下では 0 のはず）`);
if (cappedTotal !== 0) throw new Error('発売下限が効いていません（上限に当たる目が売られています）');
console.log(`  ★V-10 総合: ${allPass ? 'PASS' : 'FAIL'}`);
