/**
 * ★券種ごとに「V-10 を通すのに必要な MC 試行数 M」を**計算で**出す（測定ではない）。
 *
 * 【なぜ計算で出せるのか】
 *   真の確率 p が分かっていれば、試行数 M の推定で何が起きるかは
 *   二項分布から**厳密に**書けます。乱数も長時間の実測も要りません。
 *
 *     売られる確率      P(c ≧ 1) = 1 − (1−p)^M
 *     払戻の期待値       p × Σ_{c≧1} P(c) × min(cap, (1−margin)/p_eff(c/M))
 *     払戻率 = Σ払戻 / Σ売られる確率
 *
 *   ここには**符号が逆の2つの効果**が同時に入っています:
 *
 *     ① 凸性（1/p̂ が上に凸）        … 払戻率を**上げる**。D-013 の p_eff で打ち消し済み
 *     ② c ≧ 1 の打ち切り            … 払戻率を**下げる**
 *        MC で1回も出ない目は売られないが、**売られた目は p̂ が上に偏る**
 *        （c=0 が落ちるので）。オッズが低く付き、払戻が足りなくなる。
 *
 *   ★②は目が多い券種ほど強く効きます。M·p ≲ 1 の目が大量にあるからです。
 *     券種をまたいで平均すると①と②が相殺して見えなくなります（V-10 が
 *     券種別に定められている理由そのもの）。
 *
 * 【真の確率をどこから取るか】
 *   大きな参照 MC（既定 100,000回）を少数のレースに回して p の代わりにします。
 *   ★参照 MC で1回も出ない目は、判定したい M（≦参照）でも売られないので、
 *     落としても評価に影響しません（同じ打ち切りが両側に掛かります）。
 *
 * 実行: npx tsx apps/cli/src/diag-mneed.ts --seed 42 --races 20
 */
import { NICKS_GEN, deriveRng } from '@star/sim-engine';
import { DEFAULT_RACE_BALANCE, resolveRace, type RaceEntrant, type RaceResult } from '@star/race-engine';
import { MARGIN, ODDS_CAP, TICKET_KINDS, debiasedProbability, placeDepth, type TicketKind } from '@star/betting';
import { generateRace, sortPoolByClass } from './race-field.js';
import { resolveRuntimeConfig } from './config.js';
import { runSimulation } from './simulator.js';
import { POOL_GENERATIONS, POOL_MARES } from './measurement.js';
import { VERIFY_PAYOUT_STREAM as S } from '@star/sim-engine';

const argv = process.argv.slice(2);
const num = (n: string, d: number): number => {
  const i = argv.indexOf(`--${n}`);
  const v = i >= 0 ? Number(argv[i + 1]) : NaN;
  return Number.isFinite(v) ? v : d;
};
const list = (n: string, d: readonly number[]): number[] => {
  const i = argv.indexOf(`--${n}`);
  if (i < 0) return [...d];
  return (argv[i + 1] ?? '').split(',').map(Number).filter(Number.isFinite);
};
const SEED = num('seed', 42);
const RACES = num('races', 20);
const REF = num('ref-trials', 100_000);
const TARGETS = list('targets', [1_000, 10_000, 100_000, 1_000_000, 10_000_000]);
/**
 * ★§9.4 の配当上限を外して同じ計算をする（切り分け専用・本番の話ではない）。
 *   M→∞ で消えない乖離が残るなら、原因は推定ではなく**上限による切り詰め**です。
 *   上限は払戻を減らす方向にしか働かないので、外して 0 に戻れば確定します（R-17）。
 */
const NO_CAP = argv.includes('--no-cap');
/**
 * ★D-013 の補正を外して同じ計算をする（切り分け専用）。
 *   「補正を入れると本番の払戻がどう変わるか」を券種ごとに知るために要ります。
 *   単勝では補正が乖離を消しますが、目の多い券種では打ち切りと**符号が逆**なので、
 *   補正だけを入れると打ち切りの不足が露わになります。
 *   ⚠️ 差し引きが偶然合っている状態を「正しい」と読まないこと。
 *      2つの誤りが打ち消し合っているだけで、頭数や M が変われば崩れます。
 */
const NO_DEBIAS = argv.includes('--no-debias');

/** Lanczos 近似の log Γ（二項係数を対数で扱うため） */
const G = [
  676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
  12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
];
function lgamma(z: number): number {
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lgamma(1 - z);
  const x = z - 1;
  let a = 0.99999999999980993;
  for (let i = 0; i < G.length; i += 1) a += G[i]! / (x + i + 1);
  const t = x + G.length - 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}
const logChoose = (n: number, k: number): number =>
  lgamma(n + 1) - lgamma(k + 1) - lgamma(n - k + 1);

/**
 * 真の確率 p の目を M 回の MC で推定したときの
 * 「売られる確率」と「払戻の期待値」を厳密に計算する。
 */
function exactContribution(
  p: number,
  M: number,
  kind: TicketKind,
): { sold: number; payout: number } {
  const log1mp = Math.log1p(-p);
  const sold = -Math.expm1(M * log1mp); // 1 − (1−p)^M（桁落ちを避ける）
  // ★c の全域を回すと M=10^7 で回らない。平均の周りに十分広い窓を取る
  const mean = M * p;
  const sd = Math.sqrt(M * p * (1 - p));
  const lo = Math.max(1, Math.floor(mean - 14 * sd - 20));
  const hi = Math.min(M, Math.ceil(mean + 14 * sd + 20));
  const logp = Math.log(p);
  let payout = 0;
  let mass = 0;
  for (let c = lo; c <= hi; c += 1) {
    const pmf = Math.exp(logChoose(M, c) + c * logp + (M - c) * log1mp);
    mass += pmf;
    const pUsed = NO_DEBIAS ? c / M : debiasedProbability(c / M, M);
    const uncapped = (1 - MARGIN[kind]) / pUsed;
    const odds = NO_CAP ? uncapped : Math.min(ODDS_CAP[kind], uncapped);
    payout += pmf * p * odds;
  }
  // ★R-21: 窓が確率質量を取りこぼしていたら、結果を報告せず失敗させる
  const p0 = Math.exp(M * log1mp);
  if (Math.abs(mass + p0 - 1) > 1e-6) {
    throw new Error(`窓が狭すぎます: p=${p} M=${M} 捕捉率=${(mass + p0).toFixed(9)}`);
  }
  return { sold, payout };
}

const { balance, founders } = resolveRuntimeConfig();
const sim = runSimulation(
  { seed: SEED, generations: POOL_GENERATIONS, population: POOL_MARES,
    stallionPool: Math.round(POOL_MARES * 0.3), v1Pairs: 1, v1Repeats: 5, retainFinalPopulation: true },
  balance, founders, NICKS_GEN,
);
const pool = sortPoolByClass(sim.finalPopulation ?? []);

function keysOf(kind: TicketKind, order: readonly number[], depth: number): string[] {
  const s = (xs: number[]): string => [...xs].sort((a, b) => a - b).join('-');
  switch (kind) {
    case 'win': return [String(order[0])];
    case 'place': return order.slice(0, depth).map(String);
    case 'quinella_place': {
      const top = order.slice(0, depth); const out: string[] = [];
      for (let i = 0; i < top.length; i += 1) for (let j = i + 1; j < top.length; j += 1) out.push(s([top[i]!, top[j]!]));
      return out;
    }
    case 'quinella': return [s([order[0]!, order[1]!])];
    case 'exacta': return [`${order[0]}>${order[1]}`];
    case 'trio': return [s([order[0]!, order[1]!, order[2]!])];
    case 'trifecta': return [`${order[0]}>${order[1]}>${order[2]}`];
    default: { const never: never = kind; throw new Error(String(never)); }
  }
}
const orderOf = (r: RaceResult): number[] => r.order.map((x) => Number(x.horseId.replace(/^H/, '')));

// --- 参照 MC で真の確率をつくる ---
const refProbs = new Map<TicketKind, number[]>(TICKET_KINDS.map((k) => [k, []]));
for (let i = 0; i < RACES; i += 1) {
  const race = generateRace(pool, i, deriveRng(SEED, S.FIELD, i));
  const entrants: RaceEntrant[] = race.entrants.map((e, k) => ({ ...e, horseId: `H${k + 1}` }));
  const depth = placeDepth(entrants.length);
  const counts = new Map<TicketKind, Map<string, number>>(TICKET_KINDS.map((k) => [k, new Map()]));
  const rng = deriveRng(SEED, S.ODDS, i);
  for (let t = 0; t < REF; t += 1) {
    const order = orderOf(resolveRace({ conditions: race.conditions, entrants, seed: rng.nextUint32(), balance: DEFAULT_RACE_BALANCE }));
    for (const kind of TICKET_KINDS) {
      const m = counts.get(kind)!;
      for (const key of keysOf(kind, order, depth)) m.set(key, (m.get(key) ?? 0) + 1);
    }
  }
  for (const kind of TICKET_KINDS) {
    for (const c of counts.get(kind)!.values()) refProbs.get(kind)!.push(c / REF);
  }
}

// ★R-21: 参照 MC が解像できない領域を判定してはならない。
//   目標 M では p ≳ 1/M の目が売られるが、参照 MC は p ≳ 1/REF の目しか観測できない。
//   M > REF だと「本来 cap に切り詰められて売られる稀な目」がまるごと抜け、
//   cap の損失を**過小に**見積もる。前回それに気づかず M=1M/10M を出した。
for (const M of TARGETS) {
  if (M > REF) {
    throw new Error(
      `目標 M=${M} が参照 MC ${REF} を超えています。参照は p ≳ 1/${REF} の目しか観測できず、` +
        `M=${M} で売られる稀な目を落とします。--ref-trials を ${M} 以上にしてください（R-21）`,
    );
  }
}

console.log(`# 券種ごとに必要な M を計算で出す  seed=${SEED} races=${RACES} 参照MC=${REF.toLocaleString()}`);
console.log(`  ★測定ではありません。真の確率が分かれば二項分布から厳密に決まります`);
if (NO_CAP) console.log(`  ⚠️ --no-cap: §9.4 の配当上限を外しています（切り分け用。本番の設定ではありません）`);
if (NO_DEBIAS) console.log(`  ⚠️ --no-debias: D-013 の補正を外しています（補正前＝現行本番の挙動）`);
console.log('');
console.log(`  ${'券種'.padEnd(16)} ${'目数/R'.padStart(7)} ${TARGETS.map((m) => `M=${m >= 1e6 ? m / 1e6 + 'M' : m / 1000 + 'k'}`.padStart(10)).join('')}`);

for (const kind of TICKET_KINDS) {
  const ps = refProbs.get(kind)!;
  if (ps.length === 0) throw new Error(`${kind}: 参照確率が空です（R-21）`);
  const cells: string[] = [];
  for (const M of TARGETS) {
    let sold = 0;
    let payout = 0;
    for (const p of ps) {
      const c = exactContribution(p, M, kind);
      sold += c.sold;
      payout += c.payout;
    }
    const rate = payout / sold;
    const dev = (rate - (1 - MARGIN[kind])) * 100;
    const ok = Math.abs(dev) <= 1;
    cells.push(`${(dev >= 0 ? '+' : '') + dev.toFixed(2)}${ok ? '*' : ' '}`.padStart(10));
  }
  console.log(`  ${kind.padEnd(16)} ${(ps.length / RACES).toFixed(0).padStart(7)} ${cells.join('')}`);
}
console.log(`\n  * = |乖離| ≦ 1pt（V-10 合格）。単位は pt`);
console.log(`  ★正典 §9.2 の現行値は M = 10,000 です`);
