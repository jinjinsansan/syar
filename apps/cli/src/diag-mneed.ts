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
/**
 * ★D-035: 上限に当たる目はそもそも売らない。
 *
 *     p_min = (1 − margin) / ODDS_CAP
 *
 *   これ未満の目を発売しないと、3つの効果が**同時に**閉じます:
 *     ③ 切り詰めが消える … 売る目がすべて上限の内側にあるので、cap に当たらない
 *     ② 打ち切りが消える … 売る下限が p_min に固定されるので、M·p_min = λ* を
 *                          十分大きく取れば c の条件付けが無視できる
 *     ① 凸性は解析補正で既に消えている
 *   残るのは margin ちょうどです。
 *
 *   ★②と③が正面衝突していたのは、どちらも「稀な目」に効くからでした。
 *     稀な目の扱いを1箇所で決めれば両方閉じます。
 */
const PMIN = argv.includes('--pmin');
/** 打ち切りを無視できるとみなす M·p_min（設計余裕）。M ≧ λ* × ODDS_CAP / (1−margin) */
const LAMBDA_STAR = num('lambda', 30);
const pMinOf = (kind: TicketKind): number => (1 - MARGIN[kind]) / ODDS_CAP[kind];

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
  const logp = Math.log(p);
  // ★売る下限。D-035 なら p̂ ≧ p_min、そうでなければ従来どおり c ≧ 1
  const threshold = PMIN ? Math.ceil(M * pMinOf(kind)) : 1;
  // ★c の全域を回すと M=10^7 で回らない。平均の周りに十分広い窓を取る
  const mean = M * p;
  const sd = Math.sqrt(M * p * (1 - p));
  const lo = Math.max(0, Math.floor(mean - 14 * sd) - 20);
  const hi = Math.min(M, Math.ceil(mean + 14 * sd) + 20);
  let payout = 0;
  let sold = 0;
  let mass = lo === 0 ? 0 : 0;
  for (let c = lo; c <= hi; c += 1) {
    const pmf = Math.exp(logChoose(M, c) + c * logp + (M - c) * log1mp);
    mass += pmf;
    if (c < threshold) continue; // 売らない目は賭け金にも払戻にも入らない
    sold += pmf;
    const pUsed = NO_DEBIAS ? c / M : debiasedProbability(c / M, M);
    const uncapped = (1 - MARGIN[kind]) / pUsed;
    const odds = NO_CAP ? uncapped : Math.min(ODDS_CAP[kind], uncapped);
    payout += pmf * p * odds;
  }
  // ★R-21: 窓が確率質量を取りこぼしていたら、結果を報告せず失敗させる。
  //   窓が 0 から始まらない場合は下側の裾を別途足す（M·p が大きいと lo > 0 になる）
  const lower = lo === 0 ? 0 : 1 - mass; // 近似ではなく残差として扱い、閾値で弾く
  if (Math.abs(mass + (lo === 0 ? 0 : lower) - 1) > 1e-6) {
    throw new Error(`窓が狭すぎます: p=${p} M=${M} 捕捉率=${mass.toFixed(9)}`);
  }
  if (lo > 0 && Math.abs(1 - mass) > 1e-6) {
    throw new Error(`窓が下側を取りこぼしています: p=${p} M=${M} 捕捉率=${mass.toFixed(9)}`);
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
// ★参照 MC が解像できない領域を判定してはならない（R-21）。
//   ★何を解像すべきかは「売る下限」で決まる:
//     D-035 なし … 目標 M では p ≳ 1/M の目が売られて cap に切り詰められるので、参照は M 以上要る
//     D-035 あり … 売られるのは p ≳ p_min の目だけ。p_min は M に依らないので、
//                  参照は p_min を数えられればよい（M と同じ大きさは要らない）
//   前回この区別をせず、参照 10万で「M=100万なら三連単 −0.00pt」と出しました。
const REF_COUNTS_AT_PMIN = 20;
if (PMIN) {
  for (const kind of TICKET_KINDS) {
    const need = REF_COUNTS_AT_PMIN / pMinOf(kind);
    if (REF < need) {
      throw new Error(
        `${kind}: 参照 MC ${REF.toLocaleString()} では p_min=${pMinOf(kind).toExponential(2)} の目を` +
          `平均 ${(REF * pMinOf(kind)).toFixed(1)} 回しか観測できません。` +
          `--ref-trials を ${Math.ceil(need).toLocaleString()} 以上にしてください（R-21）`,
      );
    }
  }
} else {
  for (const M of TARGETS) {
    if (M > REF) {
      throw new Error(
        `目標 M=${M.toLocaleString()} が参照 MC ${REF.toLocaleString()} を超えています。` +
          `参照は p ≳ 1/${REF} の目しか観測できず、M=${M} で売られる稀な目を落とします。` +
          `--ref-trials を ${M} 以上にしてください（R-21）`,
      );
    }
  }
}

console.log(`# 券種ごとに必要な M を計算で出す  seed=${SEED} races=${RACES} 参照MC=${REF.toLocaleString()}`);
console.log(`  ★測定ではありません。真の確率が分かれば二項分布から厳密に決まります`);
if (NO_CAP) console.log(`  ⚠️ --no-cap: §9.4 の配当上限を外しています（切り分け用。本番の設定ではありません）`);
if (NO_DEBIAS) console.log(`  ⚠️ --no-debias: D-013 の補正を外しています（補正前＝現行本番の挙動）`);
if (PMIN) {
  console.log(`  ★--pmin: D-035（p_min 未満の目は発売しない）を適用。λ* = ${LAMBDA_STAR}`);
  console.log(`  ${'券種'.padEnd(16)} ${'p_min'.padStart(10)} ${'必要な M'.padStart(12)}`);
  for (const kind of TICKET_KINDS) {
    const pm = pMinOf(kind);
    console.log(`  ${kind.padEnd(16)} ${pm.toExponential(2).padStart(10)} ${Math.ceil(LAMBDA_STAR / pm).toLocaleString().padStart(12)}`);
  }
}
console.log('');
console.log(`  ${'券種'.padEnd(16)} ${'目数/R'.padStart(7)} ${TARGETS.map((m) => `M=${m >= 1e6 ? m / 1e6 + 'M' : m / 1000 + 'k'}`.padStart(10)).join('')}`);

/** ★売られる目の数も出す。D-035 は「買えなくなる目」を作るので、製品影響を数字にする */
const soldPerRace = new Map<TicketKind, number>();
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
    if (M === TARGETS[TARGETS.length - 1]) soldPerRace.set(kind, sold / RACES);
    const rate = payout / sold;
    const dev = (rate - (1 - MARGIN[kind])) * 100;
    const ok = Math.abs(dev) <= 1;
    cells.push(`${(dev >= 0 ? '+' : '') + dev.toFixed(2)}${ok ? '*' : ' '}`.padStart(10));
  }
  console.log(`  ${kind.padEnd(16)} ${(ps.length / RACES).toFixed(0).padStart(7)} ${cells.join('')}`);
}

// ★製品影響: 参照で観測できた目のうち、実際に売られるのは何割か（最大 M で評価）
console.log(`
  ★売られる目（M=${TARGETS[TARGETS.length - 1]!.toLocaleString()}）`);
console.log(`  ${'券種'.padEnd(16)} ${'参照で観測'.padStart(11)} ${'売られる'.padStart(10)} ${'売られない'.padStart(11)}`);
for (const kind of TICKET_KINDS) {
  const seen = refProbs.get(kind)!.length / RACES;
  const sold = soldPerRace.get(kind)!;
  console.log(
    `  ${kind.padEnd(16)} ${seen.toFixed(1).padStart(11)} ${sold.toFixed(1).padStart(10)} ` +
      `${(((seen - sold) / seen) * 100).toFixed(1).padStart(10)}%`,
  );
}
console.log(`\n  * = |乖離| ≦ 1pt（V-10 合格）。単位は pt`);
console.log(`  ★正典 §9.2 の現行値は M = 10,000 です`);
