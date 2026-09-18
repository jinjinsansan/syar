/**
 * ★**帯の下のゲート**（D-079 ④）— 初期馬が「適切な育成」でキャリア中に 1 勝できるか
 *
 * 裁定 `REVIEW_SETUP_RPC_VERDICT_20260820.md` §2-③ が、初期馬の帯（D-074/D-079）について
 * **帯の値をゲートにしない**と定め、代わりに 2 つを置きました。
 *
 * | | 基準 | 意味 |
 * |---|---|---|
 * | 上 | ★表示が全個体で同一 | 振り直しが成立しない（★★段をひとつ選べば**構造的に**満たされます） |
 * | **下** | ★**初期馬が、適切な育成でキャリア中に少なくとも 1 勝できること** | 「外れではない」の実体 |
 *
 * ★**本ツールは「下」を測ります。**
 *
 * 【★測る量は★の算出量と同一（裁定 §2-①）】
 *   ★は `starsOfPotential`（`packages/sim-engine/src/stars.ts`）だけが出します。
 *   ★**新しい指標を定義していません。** 2 つ持てば必ず離れます（L-2・D-052・R-30 の家族）。
 *   ⚠️ ★は**付与時の素質**（育成前）から出します。恒久ダメージ後の素質で出すと、
 *      **プレイヤーが受け取ったときの★と、判定に使う★が別物**になります。
 *
 * 【★育成は V-14 と同じ経路】
 *   `training-career.ts` の `runCareer` を通します（★写しを持たない）。
 *   「適切な育成」＝ `APPROPRIATE_POLICY`（`balanced`）。★**測る側が方針を選びません。**
 *
 * 【★レースは本番のワーカーと同じ渡し方】
 *   `abilityOf: (h) => h.stats` ＝ **育て終わった能力**で走らせます
 *   （`apps/worker/src/build-race.ts:89` と同一）。★渡さないと `potential × 0.55〜0.85` の
 *   **仮定値**で走り、「育成の効き」を測る道具が育成を見ないことになります（R-30）。
 *
 * 【★R-16: この基準を最も安易に満たす方法は何か】
 *   ★**「1 勝」は相対です。** 全員が弱くても、レースがある限り勝者は出ます。
 *   → ★対照を 2 本置きます:
 *     - **対照 A**: 全頭を放置で育てた場合（★これでも 1 勝以上の割合がほぼ変わらないなら、
 *       ★この基準は「育成の効き」ではなく「レースが開催されたこと」を測っています）
 *     - **対照 B**: ★**その帯の馬だけ放置し、他は適切な育成**（★プレイヤーが直面する形。
 *       ★ここで割合が落ちるなら、基準は育成に反応しています）
 *
 * 【★判定線は正典にありません】
 *   ★正典・裁定とも「1 勝できること」の**合格線**（帯の何 % の馬が満たせばよいか）を
 *   定めていません。★**本ツールは合否を出しません**（R-3「判定不能は PASS でなく FAIL に倒す」に
 *   従い、★PASS を名乗らないという形で倒します）。★線は照会に出します。
 *
 * 実行: npm run verify:band
 *       npm run verify:band -- --seeds 42 --horses 400
 */
import {
  NICKS_GEN, VERIFY_BAND_STREAM, deriveRng, starsOfPotential,
  type AbilityKey, type HorseId, type HorseRecord,
} from '@star/sim-engine';
import { CAREER_RACE_LIMIT, LIFECYCLE_WEEKS } from '@star/scheduler';
import { resolveRuntimeConfig } from './config.js';
import { runSimulation } from './simulator.js';
import { emptyCareer, runSeason, type CareerRecord } from './racing-season.js';
import { POOL_GENERATIONS, POOL_MARES, VERIFY_SEEDS } from './measurement.js';
import { APPROPRIATE_POLICY, runCareer, type CareerResult, type Policy } from './training-career.js';

const argv = process.argv.slice(2);
const num = (n: string, d: number): number => {
  const i = argv.indexOf(`--${n}`);
  const v = i >= 0 ? Number(argv[i + 1]) : NaN;
  return Number.isFinite(v) ? v : d;
};
const list = (n: string, d: readonly number[]): readonly number[] => {
  const i = argv.indexOf(`--${n}`);
  if (i < 0) return d;
  const xs = (argv[i + 1] ?? '').split(',').map(Number).filter((x) => Number.isFinite(x));
  return xs.length > 0 ? xs : d;
};

/** ★正典 §13.3 の受け入れシード列。★プールしてから 1 回だけ集計します（単一シードで判定しない・R-20） */
const SEEDS = list('seeds', VERIFY_SEEDS);
const HORSES = num('horses', POOL_MARES);

/**
 * ★キャリアを何区間に割るか（★測定条件）。
 *
 * ★現役は `raceableFrom`(104) 〜 `retireAt`(260) の **156 週**（正典 §7.1・`week.ts`）。
 *   ★これを 6 区間（26 週 ＝ 半年ぶん）に割り、★**区間の頭で引退済みの馬は出走しません**。
 *   → ★故障による早期引退が、そのまま**出走機会の減少**として効きます
 *     （★一律に 24 戦走らせると、故障の重さが消えます）。
 */
const SEGMENTS = 6;
/** ★1 区間あたりの 1 頭の出走数 ＝ キャリア上限 24 戦（正典 §7.1 `CAREER_RACE_LIMIT`）÷ 区間数 */
const RACES_PER_SEGMENT = CAREER_RACE_LIMIT / SEGMENTS;

type Arm = 'appropriate' | 'neglect_all' | 'neglect_band';

/** 育て終わった馬（レースに出す形）。★`stats` が能力・`potential` はクラス分けの並べ替えに使われる */
function raced(horse: HorseRecord, r: CareerResult): HorseRecord {
  return { ...horse, stats: r.stats as Record<AbilityKey, number>, potential: r.potential as Record<AbilityKey, number> };
}

/**
 * ★1 つの場（全頭ぶん）でキャリアを走り切らせ、馬ごとの通算成績を返す。
 *
 * ★区間ごとに「まだ引退していない馬」だけの出走表を作ります。
 */
function runCareers(
  horses: readonly HorseRecord[],
  retireWeekOf: ReadonlyMap<HorseId, number>,
  seed: number,
): Map<HorseId, CareerRecord> {
  const careers = new Map<HorseId, CareerRecord>();
  const weeks = LIFECYCLE_WEEKS.retireAt - LIFECYCLE_WEEKS.raceableFrom;
  for (let s = 0; s < SEGMENTS; s += 1) {
    const segStart = LIFECYCLE_WEEKS.raceableFrom + Math.round((weeks * s) / SEGMENTS);
    const active = horses.filter((h) => (retireWeekOf.get(h.id) ?? 0) > segStart);
    if (active.length < 8) continue; // ★§10.4 の下限。開催しない（R-21: 0 を「該当なし」と混ぜない）
    runSeason(active, careers, deriveRng(seed, VERIFY_BAND_STREAM.RACE, s), RACES_PER_SEGMENT, undefined, {
      // ★本番のワーカーと同じ（`build-race.ts:89`）。育て終わった能力で走る
      abilityOf: (h: HorseRecord) => h.stats,
    });
  }
  return careers;
}

// ---------------------------------------------------------------------------
// 集計の器
// ---------------------------------------------------------------------------
interface BandRow {
  n: number;
  /** 1 勝以上だった頭数（腕ごと） */
  winners: Record<Arm, number>;
  starts: number;
  wins: number;
  /** ★現役を全うできなかった頭数（故障による早期引退） */
  earlyRetired: number;
  /** ★一度も出走しなかった頭数 */
  noStart: number;
}
const bands = new Map<number, BandRow>();
const rowOf = (stars: number): BandRow => {
  const cur = bands.get(stars);
  if (cur !== undefined) return cur;
  const row: BandRow = {
    n: 0,
    winners: { appropriate: 0, neglect_all: 0, neglect_band: 0 },
    starts: 0, wins: 0, earlyRetired: 0, noStart: 0,
  };
  bands.set(stars, row);
  return row;
};

const t0 = Date.now();
const { balance, founders } = resolveRuntimeConfig();

for (const seed of SEEDS) {
  const sim = runSimulation(
    {
      seed, generations: POOL_GENERATIONS, population: POOL_MARES,
      stallionPool: Math.round(POOL_MARES * 0.3), v1Pairs: 1, v1Repeats: 5, retainFinalPopulation: true,
    },
    balance, founders, NICKS_GEN,
  );
  const pool = (sim.finalPopulation ?? []).slice(0, HORSES);
  if (pool.length === 0) throw new Error(`母集団が空です（seed=${seed}）`);

  // --- 育成（2 方針とも 1 回ずつ。★同じ馬・同じ乱数系列） ---
  const trained: Record<Policy, CareerResult[]> = { neglect: [], balanced: [], hard_only: [] };
  for (const policy of [APPROPRIATE_POLICY, 'neglect'] as const) {
    for (let i = 0; i < pool.length; i += 1) trained[policy].push(runCareer(pool[i]!, policy, i, seed));
  }
  // ★★は**付与時の素質**から（育成前）。★唯一の出どころ `starsOfPotential`
  const starsOf = pool.map((h) => starsOfPotential(h.potential));

  const retireWeek = (rs: CareerResult[]): ReadonlyMap<HorseId, number> =>
    new Map(pool.map((h, i) => [h.id, rs[i]!.retireWeek]));

  // --- 腕 1: 全頭が適切な育成（★これが判定の対象） ---
  const fieldA = pool.map((h, i) => raced(h, trained[APPROPRIATE_POLICY][i]!));
  const careersA = runCareers(fieldA, retireWeek(trained[APPROPRIATE_POLICY]), seed);

  // --- 腕 2（対照 A）: 全頭が放置 ---
  const fieldB = pool.map((h, i) => raced(h, trained.neglect[i]!));
  const careersB = runCareers(fieldB, retireWeek(trained.neglect), seed);

  // --- 腕 3（対照 B）: ★その帯だけ放置・他は適切な育成 ---
  const present = [...new Set(starsOf)].sort((a, b) => a - b);
  const careersCByBand = new Map<number, Map<HorseId, CareerRecord>>();
  for (const band of present) {
    const mixed = pool.map((h, i) =>
      raced(h, starsOf[i] === band ? trained.neglect[i]! : trained[APPROPRIATE_POLICY][i]!),
    );
    const mixedRetire = new Map(
      pool.map((h, i) => [h.id, (starsOf[i] === band ? trained.neglect[i]! : trained[APPROPRIATE_POLICY][i]!).retireWeek]),
    );
    careersCByBand.set(band, runCareers(mixed, mixedRetire, seed));
  }

  // --- 集計（★シードをまたいでプールしてから最後に 1 回だけ割る） ---
  for (let i = 0; i < pool.length; i += 1) {
    const row = rowOf(starsOf[i]!);
    const id = pool[i]!.id;
    const a = careersA.get(id) ?? emptyCareer();
    const b = careersB.get(id) ?? emptyCareer();
    const c = careersCByBand.get(starsOf[i]!)?.get(id) ?? emptyCareer();
    row.n += 1;
    row.starts += a.starts;
    row.wins += a.wins;
    if (a.wins >= 1) row.winners.appropriate += 1;
    if (b.wins >= 1) row.winners.neglect_all += 1;
    if (c.wins >= 1) row.winners.neglect_band += 1;
    if (a.starts === 0) row.noStart += 1;
    if (trained[APPROPRIATE_POLICY][i]!.careerEnded) row.earlyRetired += 1;
  }
}

// ---------------------------------------------------------------------------
// 出力
// ---------------------------------------------------------------------------
const pct = (x: number, n: number): string => (n === 0 ? '—' : `${((x / n) * 100).toFixed(1)}%`);
/**
 * ★**出走機会を揃えた見方**（★推定・判定の材料であって測定値ではありません）。
 *
 * ★実測で分かったこと（2026-09-18・`tmp/probe-starts-by-rank.ts` の対照）:
 *   `generateRace` は**能力順の連続した窓**から出走馬を引くため、★**両端の馬は窓に入る回数が
 *   構造的に少なく**なります。実測: 窓あり（本番と同じ `classBand=0.06`）で
 *   第 1 十分位 **12.3 走** / 第 10 十分位 **16.9 走** に対し中央は 25〜30 走。
 *   ★窓を外した対照（`classBand=1.0`）では第 1 十分位が **20.5 走**に戻ります。
 *   → ★**下の帯の「1 勝以上」が低いのは、弱いからではなく走っていないから**という経路があります。
 *
 * ⚠️ ★正典 §10.4 は「**自馬の出走レースは自分で時刻を選んでエントリー**」と定めており、
 *    ★**プレイヤーの馬は抽選で出走機会を失いません**。★本ハーネスの窓の引き方は
 *    ★NPC 同士の番組表の形であって、★プレイヤーの馬の形ではありません（★照会に出します）。
 *
 * → ★そこで「1 走あたりの勝率 p」から、★**キャリア上限まで走った場合**の
 *   「1 勝以上」を `1 − (1 − p)^24` で推定して併記します。★**独立試行の仮定**を置いています。
 */
const impliedOverCareer = (wins: number, starts: number): string => {
  if (starts === 0) return '—';
  const p = wins / starts;
  return `${((1 - (1 - p) ** CAREER_RACE_LIMIT) * 100).toFixed(1)}%`;
};
/** 割合の SE（二項）。★n が小さい帯ほど広い — ★幅を見ずに帯を決めない */
const sePt = (x: number, n: number): string => {
  if (n === 0) return '—';
  const p = x / n;
  return `${(Math.sqrt((p * (1 - p)) / n) * 100).toFixed(1)}`;
};

console.log(`# ★帯の下のゲート（D-079 ④）— 初期馬が「適切な育成」でキャリア中に 1 勝できるか`);
console.log(`  seeds=${SEEDS.join(',')}  プール ${POOL_GENERATIONS} 世代 × ${HORSES} 頭 ／ シードごとに 1 プール`);
console.log(`  育成: ${APPROPRIATE_POLICY}（V-14 ① と同じ方針・training-career.ts）`);
console.log(`  レース: ${SEGMENTS} 区間 × 1 頭 ${RACES_PER_SEGMENT} 走 ＝ キャリア上限 ${CAREER_RACE_LIMIT} 戦（正典 §7.1）`);
console.log(`  能力: ★育て終わった stats（本番のワーカーと同じ渡し方・build-race.ts:89）`);
console.log(`  ★: starsOfPotential（★付与時の素質から。★の唯一の出どころ・裁定 §2-①）`);
console.log('');
console.log(
  `  ${'★'.padEnd(6)}${'頭数'.padStart(6)}${'1勝以上'.padStart(9)}${'±SE'.padStart(7)}` +
    `${'平均出走'.padStart(9)}${'勝率/走'.padStart(9)}${'24戦なら'.padStart(9)}${'早期引退'.padStart(9)}` +
    `   ${'[対照A] 全頭放置'.padStart(16)}${'[対照B] この帯だけ放置'.padStart(22)}`,
);

const keys = [...bands.keys()].sort((a, b) => a - b);
let total: BandRow = {
  n: 0, winners: { appropriate: 0, neglect_all: 0, neglect_band: 0 }, starts: 0, wins: 0, earlyRetired: 0, noStart: 0,
};
for (const k of keys) {
  const r = bands.get(k)!;
  total = {
    n: total.n + r.n,
    winners: {
      appropriate: total.winners.appropriate + r.winners.appropriate,
      neglect_all: total.winners.neglect_all + r.winners.neglect_all,
      neglect_band: total.winners.neglect_band + r.winners.neglect_band,
    },
    starts: total.starts + r.starts,
    wins: total.wins + r.wins,
    earlyRetired: total.earlyRetired + r.earlyRetired,
    noStart: total.noStart + r.noStart,
  };
  const diff = ((r.winners.neglect_band - r.winners.appropriate) / Math.max(1, r.n)) * 100;
  console.log(
    `  ${`★${k.toFixed(1)}`.padEnd(6)}${String(r.n).padStart(6)}${pct(r.winners.appropriate, r.n).padStart(9)}` +
      `${sePt(r.winners.appropriate, r.n).padStart(6)}pt` +
      `${(r.starts / Math.max(1, r.n)).toFixed(1).padStart(9)}` +
      `${(r.starts === 0 ? '—' : (r.wins / r.starts).toFixed(3)).padStart(9)}` +
      `${impliedOverCareer(r.wins, r.starts).padStart(9)}` +
      `${pct(r.earlyRetired, r.n).padStart(9)}` +
      `   ${pct(r.winners.neglect_all, r.n).padStart(16)}` +
      `${`${pct(r.winners.neglect_band, r.n)}（${diff >= 0 ? '+' : ''}${diff.toFixed(1)}pt）`.padStart(22)}`,
  );
}
console.log('  ' + '-'.repeat(110));
console.log(
  `  ${'合計'.padEnd(5)}${String(total.n).padStart(6)}${pct(total.winners.appropriate, total.n).padStart(9)}` +
    `${sePt(total.winners.appropriate, total.n).padStart(6)}pt` +
    `${(total.starts / Math.max(1, total.n)).toFixed(1).padStart(9)}` +
    `${(total.starts === 0 ? '—' : (total.wins / total.starts).toFixed(3)).padStart(9)}` +
    `${impliedOverCareer(total.wins, total.starts).padStart(9)}` +
    `${pct(total.earlyRetired, total.n).padStart(9)}` +
    `   ${pct(total.winners.neglect_all, total.n).padStart(16)}` +
    `${pct(total.winners.neglect_band, total.n).padStart(22)}`,
);

console.log('');
console.log('  ★読み方');
console.log('    - 「1勝以上」は**全頭が分母**です（一度も出走せずに引退した馬も分母に入れます）。');
console.log(`      ★一度も出走しなかった馬: ${total.noStart} 頭 / ${total.n} 頭。`);
console.log('    - 🔴 ★**「平均出走」が帯で大きく違います。** `generateRace` は能力順の**連続した窓**から引くので、');
console.log('      ★**両端の馬は窓に入る回数が構造的に少ない**（実測の対照: 窓あり 第1十分位 12.3 走 /');
console.log('      窓なし `classBand=1.0` なら 20.5 走）。★**下の帯は、弱いから勝てないのではなく走っていません。**');
console.log('    - ★そこで「勝率/走」と「24戦なら」（= 1−(1−p)^24・★**独立試行を仮定した推定**）を併記しています。');
console.log('      ⚠️ ★正典 §10.4 は「自馬の出走レースは**自分で時刻を選んでエントリー**」＝★プレイヤーの馬は');
console.log('      ★抽選で機会を失いません。★本ハーネスの窓は NPC 同士の番組表の形です（★照会 Q-BAND-02）。');
console.log('    - ★**対照 A（全頭放置）がほぼ同じ割合なら、この基準は育成ではなく「開催されたこと」を測っています**（R-16）。');
console.log('    - ★**対照 B（この帯だけ放置）**が、プレイヤーが直面する形です。ここが落ちるなら基準は育成に反応しています。');
console.log('');
console.log('  🔴 ★本ツールは合否を出しません（R-3）。');
console.log('     ★正典・裁定とも「キャリア中に 1 勝」の**合格線**（帯の何 % の馬が満たせばよいか）を定めていません。');
console.log('     ★線を決めるのはレビュー側・オーナーです。★測った値だけを出します。');
console.log('');
console.log(`  所要: ${((Date.now() - t0) / 1000).toFixed(1)} 秒`);
