/**
 * K-5 レースのモンテカルロ検証ハーネス（正典 §13.2 の V-4/V-5/V-6/V-8/V-9/V-12）
 *
 *   npm run verify:race [-- --races 100000 --seeds 42,7,2026,31337]
 *
 * 【人気の定義】指示書 §5 に従い、**同一レースをモンテカルロした勝率順位**で定義する。
 *   ★推定に使う乱数系列と本番確定の系列を分ける（正典 §9.2「オッズ算出のシードは
 *     本番確定用とは別系列」）。同じ試行で人気を決めて同じ試行で勝率を測ると、
 *     **勝った馬が1番人気になりやすい**という自己選択バイアスが入り、V-4 が過大に出る。
 *
 * 【V-9 の母集団】正典 §8b.8 は「`interventionMult` の実測分布を日次で記録」と定める。
 *   介入できるのは**自馬のオーナーのみ**（§8b.1）なので、実運用の分布は
 *   「介入のない馬（=1.00）」が大半を占める。本ハーネスも同じ母集団で測り、
 *   参考値として「介入対象馬だけの分布」も併記する（どちらで測ったかを隠さない）。
 */

import { readFileSync } from 'node:fs';
// ★測定の素性を刻むため（★VP-8）。★母集団のファイルの中身そのものを指す
import { createHash } from 'node:crypto';
import { VERIFY_RACE_STREAM } from '@star/sim-engine';
import {
  CALIBRATED_RACE_RANDOM_K,
  DEFAULT_INTERVENTION_BALANCE,
  DEFAULT_RACE_BALANCE,
  aiProxyPlan,
  conditionsFromFrozen,
  lanePlanForRace,
  optimalPlan,
  resolveIntervention,
  resolveRace,
  baseScore,
  type RaceBalance,
} from '@star/race-engine';
import { NICKS_GEN, deriveRng, type HorseRecord } from '@star/sim-engine';
import { productionRaceOf } from '@star/scheduler';
import { resolveRuntimeConfig } from './config.js';
import {
  DEFAULT_CLASS_BAND,
  DISTANCE_SUIT_MIN,
  FIELD_STRENGTH_FLOOR,
  OFF_DISTANCE_ENTRY_RATE,
  OFF_SURFACE_ENTRY_RATE,
  OVERSAMPLE_RATIO,
  PLACEHOLDER_UNLOCK,
  generateRace,
  sortPoolByClass,
  oversampleFloorPoolSize,
  FIELD_SIZE,
} from './race-field.js';
import { runSimulation } from './simulator.js';
import { toSafeJson } from './json-safe.js';
import * as MC from './measurement.js';
import { PopularityEstimator } from './popularity.js';
import { mean, round, sd, sdSample, standardError } from './stats.js';

import { buildTrainingStateSampler } from './training-state.js';
// ---------------------------------------------------------------------------
// 引数
// ---------------------------------------------------------------------------

function parseNumber(flag: string, fallback: number): number {
  const idx = process.argv.indexOf(flag);
  if (idx < 0) return fallback;
  const raw = Number(process.argv[idx + 1]);
  return Number.isFinite(raw) ? raw : fallback;
}

function parseList(flag: string, fallback: number[]): number[] {
  const idx = process.argv.indexOf(flag);
  if (idx < 0) return fallback;
  const raw = process.argv[idx + 1];
  if (raw === undefined) return fallback;
  const out = raw
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n));
  return out.length > 0 ? out : fallback;
}

const TOTAL_RACES = parseNumber('--races', MC.VERIFY_RACES);
const SEEDS = parseList('--seeds', [...MC.VERIFY_SEEDS]);
/**
 * 人気推定の試行数（本番確定とは別系列）。
 *
 * ★R-12: **測定の自由変数は判定に効かないことを確認する**。
 *   タイブレークを枠順から平均着順に変えた結果、V-6 は 30〜1200試行で 0.23〜0.33% と
 *   傾向なく安定する（変更前は 60試行 1.00% → 1200試行 0.30% と単調に動き、
 *   **PASS が推定ノイズの産物**だった）。既定 200 は安定域の中央付近。
 */
const POPULARITY_TRIALS = parseNumber('--popularity-trials', MC.POPULARITY_TRIALS);
/** 母集団を作る世代数 */
/**
 * ★B-6（D-050）: 出走馬の調子・疲労を実データにするか。
 *   ★既定は false。付けたときだけ切り替わるので、
 *     「いつの間にか別の世界で測っていた」が起きません。
 */
const B6_WIRED = process.argv.includes('--b6-wired');
/**
 * ★Q-P3-29: `PLACEHOLDER_UNLOCK`（0.55〜0.85 の再抽選）を使わず、
 *   **週ループが育てた現在能力**を使うか。★既定は false。
 */
const REAL_ABILITY = process.argv.includes('--real-ability');
/**
 * ★**既定は本番の条件**（★2026-09-15・指示書 VW §7-1・R-31）。
 *   ★レース番号をサイクル番号として `productionRaceOf` に通し、★番組の距離・馬場・競馬場と
 *   ★**凍結した走路の形**（ワーカーの `build-race.ts`・`pg-store.ts` と同じ関数）で測ります。
 *   ★`--legacy-conditions` … ★旧来の条件（`generateRace` が自分で引く距離・馬場・`DEFAULT_OVAL`・1400m 以下の 20% 直線）。比較用
 */
const LEGACY_CONDITIONS = process.argv.includes('--legacy-conditions');
/**
 * ★`--pool <file>`: 本番から書き出した母集団を使う（Q-P3-39）。
 *   `tools/export-pool.mjs` が作ったファイルを読みます。
 */
interface RealPoolHorse extends HorseRecord {
  /** ★書き出し時の調子・疲労（B-6 用）。無ければ null */
  readonly __training?: { condition: number; fatigue: number } | null;
  readonly __ageWeeks?: number | null;
}
const REAL_POOL: RealPoolHorse[] | null = (() => {
  const i = process.argv.indexOf('--pool');
  if (i < 0) return null;
  const file = process.argv[i + 1];
  if (file === undefined) throw new Error('--pool にファイル名がありません');
  const raw = JSON.parse(readFileSync(file, 'utf8')) as RealPoolHorse[];
  if (!Array.isArray(raw) || raw.length === 0) throw new Error(`${file}: 母集団が空です`);
  // ★`pedigreeCache` は Map に戻す。配列のままだと遺伝の関数が黙って空として扱う
  for (const h of raw) {
    // ★JSON では Map が空になるので、配列から戻す。
    //   黙って空のままにすると、血統が消えた別の馬で測ることになります。
    const entries = (h as unknown as { pedigreeCache: unknown }).pedigreeCache;
    (h as unknown as { pedigreeCache: unknown }).pedigreeCache =
      new Map((Array.isArray(entries) ? entries : []) as [string, readonly number[]][]);
  }
  return raw;
})();
const POOL_GENERATIONS = parseNumber('--pool-generations', MC.POOL_GENERATIONS);
const POOL_MARES = parseNumber('--pool-mares', MC.POOL_MARES);
/** クラス幅（母集団に対する割合）。1.0 でクラス分けなし */
const CLASS_BAND = parseNumber('--class-band', DEFAULT_CLASS_BAND);
/** 素質開放率のプレースホルダ範囲（P3 の育成モデルで置き換わる・R-7） */
/** 能力レンジの床（掃引用）。既定は較正値 */
const FLOOR = parseNumber('--field-floor', FIELD_STRENGTH_FLOOR);
/**
 * ★**出走頭数の範囲**（★CF-7・2026-09-18）。★既定は正典 §10.4 の 8〜18。
 *   ★案 E（平均頭数を下げる）が V-4・V-6 を壊さないかを測るときだけ渡します。
 *   ⚠️ ★**渡さない実行は 1 ビットも変わりません。**
 */
const FIELD_MIN = parseNumber('--field-min', FIELD_SIZE.MIN);
const FIELD_MAX = parseNumber('--field-max', FIELD_SIZE.MAX);
/** V-6 が対象にする下位ランク数（2026-08-06 改訂: 最下位1頭 → 下位3ランクの平均） */
const LONGSHOT_RANKS = parseNumber('--longshot-ranks', MC.LONGSHOT_RANKS);
/** 案D: 裾の厚さ（掃引用） */
const TAIL_P = parseNumber('--tail-p', DEFAULT_RACE_BALANCE.TAIL_MIX_P);
const TAIL_M = parseNumber('--tail-m', DEFAULT_RACE_BALANCE.TAIL_MIX_M);

const UNLOCK = {
  MIN: parseNumber('--unlock-min', PLACEHOLDER_UNLOCK.MIN),
  MAX: parseNumber('--unlock-max', PLACEHOLDER_UNLOCK.MAX),
};

/**
 * 🔴 ★**調子を全頭この値に固定**（★2026-09-20・`PROD-NEVER-AGED` の実験）。
 *   ★本番は `condition` が全頭 3。★オッズは condition を見ているので、
 *   ★その散らばりは**雑音ではなく信号**（★**CN-15**）。
 * ⚠️ ★渡さなければ ** 1 ビットも変わりません**。
 */
const fixedConditionArg = (() => {
  const i = process.argv.indexOf('--fixed-condition');
  if (i < 0) return undefined;
  const v = Number(process.argv[i + 1]);
  return Number.isFinite(v) ? v : undefined;
})();

/** 乱数系列の用途（K-2 の系列独立性。ここでも混ぜない） */
// ★用途IDは集約表から取る。11〜14 の帯を取っていたのはここだけで、
//   規約は一度確立されていたのに新設ファイルが 1〜4 に戻していた
const STREAM = VERIFY_RACE_STREAM;

/**
 * ★K は正典 §13.1 の値（0.12）。§8.7 が「実装後に必ずモンテカルロ10万レースで
 *   人気別勝率を較正する」と定めているため、--k で振れるようにしてある。
 *   既定から外れた値で回した場合は冒頭で自己申告する（R-8）。
 */
const RACE_K = parseNumber("--k", CALIBRATED_RACE_RANDOM_K);
const balance: RaceBalance = {
  ...DEFAULT_RACE_BALANCE,
  RACE_RANDOM_K: RACE_K,
  TAIL_MIX_P: TAIL_P,
  TAIL_MIX_M: TAIL_M,
};
const ib = DEFAULT_INTERVENTION_BALANCE;

// ---------------------------------------------------------------------------
// 1シードぶんの計測
// ---------------------------------------------------------------------------

interface SeedResult {
  seed: number;
  races: number;
  favoriteWinRate: number;
  favoriteTop3Rate: number;
  longshotWinRate: number;
  /** 人気別の勝率（1番人気から） */
  winRateByRank: number[];
  interventionMeanAll: number;
  interventionMeanIntervened: number;
  interventionMin: number;
  interventionMax: number;
  aiMultMean: number;
  optimalMultMean: number;
  /** V-13: 早すぎる仕掛けの倍率平均（最適との差が「巧拙が出るか」の指標） */
  earlyMultMean: number;
  /**
   * ★**V-13 の対標本の差**（★D-112 ③・2026-09-16）。
   *   ★**同じ馬・同じレース**で「最適 − 早仕掛け」を 1 つ取った列です。
   * ⚠️ ★**平均どうしの引き算ではありません** — ★暴走を率で引くと散るので、
   *    ★対標本にしないと「馬の差」が「仕掛けの差」に混ざります。
   */
  v13PairedGaps: number[];
  aiWinRate: number;
  optimalWinRate: number;
  meanF: number;
  durabilityGap: number;
  poolSize: number;
  /** ★レース内の能力の変動係数（SD ÷ 平均）の平均。★判定には使わない */
  fieldAbilityCv: number;
  /** 出走頭数 → その頭数のレース数（正典 §10.4 の分布を確認する・Q-4） */
  fieldSizeCounts: Record<number, number>;
  /** 出走頭数 → 最低人気の勝利数（P-4: 裾が頭数によらず生きているか） */
  longshotWinsByFieldSize: Record<number, number>;
  /** 頭数別の「下位3ランク」の延べ枠数（分母） */
  longshotSlotsByFieldSize: Record<number, number>;
}

function runSeed(seed: number, racesForSeed: number): SeedResult {
  /**
   * --- 母集団 ---
   *
   * ★`--pool <file>` を渡すと、**本番（staging）から書き出した実物**を使います
   *   （Q-P3-39 の裁定）。平均を合わせにいくのではなく、
   *   **`potential` と `stats` の同時分布＝開放率の分布の形**をそのまま持ち込みます。
   *
   * ⚠️ 実物を使うと**シードを変えても母集団は同じ**です。
   *    シード間のばらつきは「レースの引き方」だけになり、
   *    **母集団のばらつきは測れません**。そのぶん SE は小さく出ます。
   */
  // --- 母集団を作る（実際の遺伝エンジンの産物を使う） ---
  const { balance: geneticsBalance, founders } = resolveRuntimeConfig();
  const pool = REAL_POOL !== null
    ? sortPoolByClass(REAL_POOL as unknown as HorseRecord[])
    : sortPoolByClass(
      runSimulation(
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
      ).finalPopulation ?? [],
    );
  if (pool.length === 0) throw new Error('母集団の取得に失敗（retainFinalPopulation）');

  // --- V-12: 平均F と 表現型 − genotype 乖離（丈夫さ） ---
  const meanF = mean(pool.map((h) => h.inbreedCoeff));
  // genotype 由来の丈夫さ（2アレルの相加平均）に対し、発現値がどれだけ下がったか
  const durabilityGap = mean(
    pool.map((h) => {
      const g = (h.genotype.durability.a1 + h.genotype.durability.a2) / 2;
      return g === 0 ? 0 : h.durability / g - 1;
    }),
  );

  // --- レースを回す ---
  let favoriteWins = 0;
  let favoriteTop3 = 0;
  let longshotWins = 0;
  const winsByRank: number[] = [];
  const racesByRank: number[] = [];
  const fieldSizeCounts: Record<number, number> = {};
  const longshotSlotsByFieldSize: Record<number, number> = {};
  let longshotSlots = 0;
  const longshotWinsByFieldSize: Record<number, number> = {};

  const allMults: number[] = [];
  const intervenedMults: number[] = [];
  const aiMults: number[] = [];
  const optimalMults: number[] = [];
  const earlyMults: number[] = [];
  /**
   * ★**V-13 の対標本の差**（★D-112 ③）。★同じ馬・同じレースで「最適 − 早仕掛け」を 1 つずつ。
   * ⚠️ ★平均どうしの引き算に戻さないこと（★馬の差が仕掛けの差に混ざります）。
   */
  const v13PairedGaps: number[] = [];
  let aiWins = 0;
  let optimalWins = 0;
  let interventionRaces = 0;
  /** 🔴 ★レース内の能力の CV（★判定には使わない・2026-09-20） */
  let fieldCvSum = 0;
  let fieldCvN = 0;

  const fieldRng = deriveRng(seed, STREAM.FIELD);

  /**
   * ★B-6（D-050）: 出走馬の調子・疲労を**実際の週ループから**採る。
   *   `--b6-wired` を付けたときだけ切り替わります。
   *   ★既定で切り替えません。ゲートの値が動く変更を、旗なしで既定にしません。
   */
  /**
   * ★実物の母集団を使うときは、**その馬の値をそのまま**使います。
   *   週ループを回し直す必要がありません（既に本番で回った結果が入っています）。
   */
  const sampler = REAL_POOL === null && (B6_WIRED || REAL_ABILITY)
    ? buildTrainingStateSampler(pool, seed) : null;
  const realOf = (h: HorseRecord): RealPoolHorse | undefined =>
    REAL_POOL === null ? undefined : (h as RealPoolHorse);

  for (let raceIndex = 0; raceIndex < racesForSeed; raceIndex++) {
    const prod = LEGACY_CONDITIONS ? null : productionRaceOf(raceIndex);
    const race = generateRace(pool, raceIndex, fieldRng, CLASS_BAND, UNLOCK, FLOOR, {
      // ★CF-7: 頭数の範囲（★既定なら `FIELD_SIZE` と同じ値が入るので振る舞いは変わらない）
      fieldSizeRange: { min: FIELD_MIN, max: FIELD_MAX },
      ...(fixedConditionArg === undefined ? {} : { fixedCondition: fixedConditionArg }),
      ...(prod === null ? {} : {
        programme: {
          surface: prod.programme.surface, distance: prod.programme.distance, courseShape: prod.courseFrozen.courseShape,
        },
      }),
      // ★2つの旗を独立に効かせる（1回の変更で3点測るため）
      ...(B6_WIRED
        ? {
          trainingStateOf: (h: HorseRecord) => (REAL_POOL === null
            ? sampler?.stateOf(h)
            : realOf(h)?.__training ?? undefined),
        }
        : {}),
      ...(REAL_ABILITY
        ? {
          abilityOf: (h: HorseRecord) => (REAL_POOL === null
            ? sampler?.stateOf(h)?.stats
            : h.stats),
        }
        : {}),
    });
    sampler?.advance();
    const fieldSize = race.entrants.length;
    // ★人気推定・本番確定・V-8 の差し替えは、すべて凍結した走路の形から作った同じ条件で回す
    const conditions = prod === null ? race.conditions : conditionsFromFrozen(prod.courseFrozen, race.conditions);
    // ★距離ロスの下ごしらえはレースごとに 1 回（ワーカーの build-race.ts と同じ形・ES-6・R-30）
    const lanePlan = lanePlanForRace(conditions);

    /**
     * 🔴 ★**レース内の能力の散らばり**を数える（★2026-09-20・`PROD-NEVER-AGED`）。
     *   ★本番のレース内 CV は **7.23%**（`tools/diag-field-dispersion.mjs`）。
     *   ★それが広いのか狭いのかは、★**比べる相手**が無いと言えません。
     * ⚠️ ★**判定には使いません**。★出力に 1 行 足すだけです。
     * ⚠️ ★`baseScore(stats, 距離)` で採ります（★**R-30**）。
     */
    if (race.entrants.length >= 3) {
      const bs = race.entrants.map((e) => baseScore(e.stats, conditions.distance));
      const bm = bs.reduce((a, b) => a + b, 0) / bs.length;
      if (bm > 0) {
        const bsd = Math.sqrt(bs.reduce((a, b) => a + (b - bm) ** 2, 0) / (bs.length - 1));
        fieldCvSum += bsd / bm;
        fieldCvN += 1;
      }
    }

    // (1) 人気を推定する（本番とは別系列・§9.2）
    //   タイブレークを含む順位付けは popularity.ts に切り出し、経路テストを掛けている（O-2）
    const estimator = new PopularityEstimator(race.entrants.map((e) => e.horseId));
    for (let t = 0; t < POPULARITY_TRIALS; t++) {
      const r = resolveRace({
        conditions,
        entrants: race.entrants,
        seed: deriveRng(seed, STREAM.POPULARITY, raceIndex, t).nextUint32() >>> 0,
        balance,
        lanePlan,
      });
      estimator.addTrial(r.order.map((o) => o.horseId));
    }
    const ranked = estimator.rank().map((x) => ({ id: x.horseId }));
    const favorite = ranked[0];
    // ★V-6 は「最下位1頭」ではなく**下位3ランクの平均**で測る（2026-08-06 改訂）。
    //   案D で裾を厚くした結果、最下位の**同定**が本質的に不安定になった
    //   （下位の順位が稀な大偏差で決まるため）。V-6 の趣旨は「大穴が出るか」であって
    //   「最下位の1頭が勝つか」ではないので、下位3ランクの平均なら
    //   同定の揺れに強く、趣旨も変わらない。
    const bottom = ranked.slice(Math.max(0, ranked.length - LONGSHOT_RANKS));
    if (favorite === undefined || bottom.length === 0) continue;

    // (2) 介入: 1レースにつき1頭を「自馬」とみなす（§8b.1: 介入できるのは自馬のみ）
    const ownRng = deriveRng(seed, STREAM.INTERVENTION, raceIndex);
    const ownIndex = ownRng.int(0, fieldSize - 1);
    const own = race.entrants[ownIndex];
    // ⚠️ ★平均速度は `resolveIntervention` から消えました（Q-P4-45）。
    //    「1m あたりの消費」に直したとき、★**約分で消えた**ためです。
    const mults = new Map<string, number>();
    let aiMult = 1;
    let optMult = 1;
    if (own !== undefined) {
      const horse = {
        iq: own.stats.iq,
        gt: own.stats.gt,
        st: own.stats.st,
        condition: own.condition,
        fatigue: own.fatigue,
      };
      const ai = resolveIntervention(horse, aiProxyPlan(horse, ownRng, ib), race.conditions.distance, ib);
      const opt = resolveIntervention(horse, optimalPlan(ib), race.conditions.distance, ib);
      // ★V-13: **仕掛けの巧拙が結果に出るか**を測る。
      //   旧スタミナ実装では全馬のゲージが必ず空になり、どう仕掛けても同じだった。
      //   最適な仕掛けと早すぎる仕掛けで倍率に差が出ることを確認する。
      const early = resolveIntervention(
        horse,
        { ...optimalPlan(ib), spurtAtMeter: ib.EARLY_SPURT_METER * GATES.V13_EARLY_FACTOR },
        race.conditions.distance,
        ib,
      );
      earlyMults.push(early.interventionMult);
      /**
       * ★**対標本の差を、その場で 1 つ取る**（★D-112 ③）。
       *   ★`opt` と `early` は ★**同じ馬・同じ距離・同じ調子**で、★仕掛けだけが違います。
       */
      v13PairedGaps.push(opt.interventionMult - early.interventionMult);
      aiMult = ai.interventionMult;
      optMult = opt.interventionMult;
      aiMults.push(aiMult);
      optimalMults.push(optMult);
      intervenedMults.push(aiMult);
      mults.set(own.horseId, aiMult);
      interventionRaces += 1;
    }
    // V-9 の母集団: 全出走馬（介入のない馬は 1.00）
    for (const e of race.entrants) allMults.push(mults.get(e.horseId) ?? 1);

    // (3) 本番確定（AI 代行の介入を反映）
    const decideSeed = deriveRng(seed, STREAM.DECIDE, raceIndex).nextUint32() >>> 0;
    const result = resolveRace({
      conditions,
      entrants: race.entrants,
      seed: decideSeed,
      balance,
      interventionMults: mults,
      lanePlan,
    });
    const winner = result.order[0];
    if (winner === undefined) continue;

    if (winner.horseId === favorite.id) favoriteWins += 1;
    const top3 = result.order.slice(0, 3).map((o) => o.horseId);
    if (top3.includes(favorite.id)) favoriteTop3 += 1;
    fieldSizeCounts[fieldSize] = (fieldSizeCounts[fieldSize] ?? 0) + 1;
    longshotSlots += bottom.length;
    longshotSlotsByFieldSize[fieldSize] =
      (longshotSlotsByFieldSize[fieldSize] ?? 0) + bottom.length;
    if (bottom.some((b) => b.id === winner.horseId)) {
      longshotWins += 1;
      longshotWinsByFieldSize[fieldSize] = (longshotWinsByFieldSize[fieldSize] ?? 0) + 1;
    }

    for (let rank = 0; rank < ranked.length; rank++) {
      racesByRank[rank] = (racesByRank[rank] ?? 0) + 1;
      if (ranked[rank]?.id === winner.horseId) winsByRank[rank] = (winsByRank[rank] ?? 0) + 1;
    }

    // (4) V-8: 同じレースを「手動最適」に差し替えて勝率を比べる
    if (own !== undefined) {
      const optResult = resolveRace({
        conditions,
        entrants: race.entrants,
        seed: decideSeed,
        balance,
        interventionMults: new Map([[own.horseId, optMult]]),
        lanePlan,
      });
      if (result.order[0]?.horseId === own.horseId) aiWins += 1;
      if (optResult.order[0]?.horseId === own.horseId) optimalWins += 1;
    }
  }

  const denom = Math.max(1, racesForSeed);
  return {
    fieldAbilityCv: fieldCvN > 0 ? fieldCvSum / fieldCvN : 0,
    seed,
    races: racesForSeed,
    favoriteWinRate: favoriteWins / denom,
    favoriteTop3Rate: favoriteTop3 / denom,
    longshotWinRate: longshotWins / Math.max(1, longshotSlots),
    winRateByRank: racesByRank.map((n, i) => (winsByRank[i] ?? 0) / Math.max(1, n)),
    interventionMeanAll: mean(allMults),
    interventionMeanIntervened: mean(intervenedMults),
    interventionMin: minOf(allMults, 1),
    interventionMax: maxOf(allMults, 1),
    aiMultMean: mean(aiMults),
    optimalMultMean: mean(optimalMults),
    earlyMultMean: mean(earlyMults),
    v13PairedGaps,
    aiWinRate: aiWins / Math.max(1, interventionRaces),
    optimalWinRate: optimalWins / Math.max(1, interventionRaces),
    meanF,
    durabilityGap,
    poolSize: pool.length,
    fieldSizeCounts,
    longshotWinsByFieldSize,
    longshotSlotsByFieldSize,
  };
}

// ---------------------------------------------------------------------------
// 実行
// ---------------------------------------------------------------------------

const GATES = {
  V4: [0.3, 0.34] as const,
  V5: [0.6, 0.65] as const,
  V6: [0.005, 0.02] as const,
  V8: [0.93, 0.97] as const,
  /** V-9a（D-014）: 不変条件。全サンプルが 0.90〜1.10。これがゲート */
  V9A_RANGE: [0.9, 1.1] as const,
  V12_F_MAX: 0.1,
  V12_DURABILITY_MIN: -0.08,
  /**
   * V-13（2026-08-06 新設）: 仕掛けの巧拙が結果に出ること。
   * ★R-16 の適用: 比率や範囲は**全体に一様にかかる歪み**を検出できない。
   *   旧スタミナ実装では全馬のゲージが必ず空で、どう仕掛けても同じだったが、
   *   V-8（倍率の比）も V-9a（範囲）もそれを検出できなかった。
   *   「最適な仕掛け」と「早すぎる仕掛け」の**差**を見れば、壊れた状態では差が消える。
   */
  V13_MIN_GAP: 0.03,
  /**
   * V-13 の測定条件: 「早すぎる仕掛け」を EARLY_SPURT_METER の何倍地点とするか。
   * ⚠️ R-12: この値は判定を動かせる自由変数なので GATES 内に置き、
   *    GATES の免除理由（オーナー承認なしに変えない）の対象に含める。
   *    正典 §13.2 への追記を照会中（QUESTIONS_P15）。
   */
  V13_EARLY_FACTOR: 1.6,
} as const;

/**
 * ★`Math.min(...xs)` は要素数が多いと `RangeError: Maximum call stack size exceeded` で落ちる。
 *   10万レース（サンプル約32万件）で実際に踏んだ。少数のスモークテストでは再現しない。
 */
function minOf(xs: readonly number[], fallback: number): number {
  let m = fallback;
  for (const x of xs) if (x < m) m = x;
  return m;
}

function maxOf(xs: readonly number[], fallback: number): number {
  let m = fallback;
  for (const x of xs) if (x > m) m = x;
  return m;
}

function pad(s: string | number, w: number): string {
  const str = String(s);
  return str.length >= w ? str : ' '.repeat(w - str.length) + str;
}

function verdict(ok: boolean): string {
  return ok ? 'PASS' : 'FAIL';
}

function pct(x: number): string {
  return `${round(x * 100, 2)}%`;
}

const racesPerSeed = Math.max(1, Math.round(TOTAL_RACES / SEEDS.length));
const started = Date.now();

/**
 * ★**この測定が何であるかを、結果そのものに刻む**（★**VP-8**・2026-09-19）。
 *
 * 【🔴 ★なぜ道具にするか】
 *   ★`measurement.ts` は「★最後に渡したのは 2026-09-16（V-4 **32.32%**）」と書いていました。
 *   ★私はそれを今日の 30.21% から引いて「★3 日で −2.11pp 動いた」と報告しかけました。
 *   ✔ ★確かめたら ★**日付・旗・母集団の 3 つが違いました**（`--real-ability --b6-wired` ／
 *     ★`docs/pool-staging.json` は 2026-08-12 の書き出し ／ 開放率 71.3% 対 78.1%）。
 *   → ★★**「3 つとも併記する」という手順は忘れられます。** ★出力に刻めば忘れられません。
 *
 * ⚠️ ★`Date.now()` は ★**測定の記録**にだけ使います（★ゲームの判断には使いません・憲法 4）。
 */
function provenance(): string {
  const flags = [
    B6_WIRED ? '--b6-wired' : null,
    REAL_ABILITY ? '--real-ability' : null,
    fixedConditionArg === undefined ? null : `--fixed-condition ${fixedConditionArg}`,
    LEGACY_CONDITIONS ? '--legacy-conditions' : null,
  ].filter((x) => x !== null);
  const poolIdx = process.argv.indexOf('--pool');
  const poolFile = poolIdx >= 0 ? process.argv[poolIdx + 1] : undefined;
  let poolLine: string;
  if (poolFile === undefined) {
    poolLine = `★合成 ${POOL_MARES} 頭（POOL_MARES × POOL_GENERATIONS ${POOL_GENERATIONS} 年）`
      + (POOL_MARES < oversampleFloorPoolSize()
        ? ` ⚠️ ★${oversampleFloorPoolSize()} 頭未満 ＝ OVERSAMPLE の床が効く regime（VP-5/VP-7）` : '');
  } else {
    /** ★**ファイルの中身そのもの**を指す（★名前を使い回しても別物だと分かる） */
    const digest = createHash('sha256').update(readFileSync(poolFile)).digest('hex').slice(0, 12);
    const n = REAL_POOL?.length ?? 0;
    poolLine = `★--pool ${poolFile}（sha256:${digest}・${n} 頭）`
      + (n < oversampleFloorPoolSize() ? ` ⚠️ ★${oversampleFloorPoolSize()} 頭未満 ＝ 床の regime` : '');
  }
  return [
    '=== ★この測定の素性（★VP-8: 別の実行と引き算する前に、3 つとも一致しているか見ること）===',
    `  ★日付   : ${new Date().toISOString()}`,
    `  ★旗     : ${flags.length === 0 ? '（既定・旗なし）' : flags.join(' ')}`,
    `  ★母集団 : ${poolLine}`,
    `  ★標本   : ${SEEDS.length} シード × ${racesPerSeed} ＝ ${racesPerSeed * SEEDS.length} レース`,
    '',
  ].join('\n');
}
console.log(provenance());

// ★R-8: 既定から外れた設定を冒頭で自己申告する
console.log(
  `レース総数=${racesPerSeed * SEEDS.length}（${SEEDS.length}シード × ${racesPerSeed}）\n` +
    `人気推定の試行数=${POPULARITY_TRIALS}（本番確定とは別系列・§9.2）\n` +
    `母集団=${POOL_GENERATIONS}ゲーム内年 × 繁殖牝馬${POOL_MARES}頭の最終年産駒\n` +
    `条件=${LEGACY_CONDITIONS
      ? '★旧来（--legacy-conditions: generateRace が引く距離・馬場・DEFAULT_OVAL・1400m 以下の 20% 直線）'
      : '本番（productionRaceOf: 番組の距離・馬場・競馬場・凍結した走路の形）'}\n` +
    `RACE_RANDOM_K=${balance.RACE_RANDOM_K}${RACE_K === DEFAULT_RACE_BALANCE.RACE_RANDOM_K ? "（正典 §13.1 の値）" : `（★較正値。正典 §13.1 は ${DEFAULT_RACE_BALANCE.RACE_RANDOM_K}）`} / INTERVENTION_CAP=±${ib.INTERVENTION_CAP} / クラス幅=${CLASS_BAND}\n` +
    /**
     * 🔴 ★**実際に使った値を出します**（★2026-09-20）。
     *   ⚠️ ★ここは `0.55〜0.85` を**決め打ちで**印刷していました — ★`--unlock-min` / `--unlock-max` で
     *     ★変えても表示が変わらず、★**出力ファイルが自分の条件について嘘をつきます**。
     *   ★あとから証拠を読む人は、★この 1 行で条件を判断します。
     */
    `⚠️ 素質開放率 ${UNLOCK.MIN}〜${UNLOCK.MAX}`
      + `${UNLOCK.MIN === PLACEHOLDER_UNLOCK.MIN && UNLOCK.MAX === PLACEHOLDER_UNLOCK.MAX
        ? '（P3 で置き換わるプレースホルダ・既定）'
        : `（★--unlock-min/max で指定。★既定は ${PLACEHOLDER_UNLOCK.MIN}〜${PLACEHOLDER_UNLOCK.MAX}）`}`
      + `。K の較正はこの仮定に依存する`
      /**
       * ⚠️ 🔴 ★**「`--pool` なら効かない」は誤りでした**（★2026-09-20・書いた直後に自分で気づきました）。
       *   ✔ ★`race-field.ts:98` は `stats[key] = overrides.stats?.[key] ?? horse.potential[key] * unlock;`。
       *   ★`overrides.stats` が入るのは ★**`--real-ability` のときだけ**（`verify-race.ts` の `abilityOf`）。
       *   → ★★**`--pool` を渡しても、★`--real-ability` が無ければ素質開放率は効きます。**
       *     ★プール file が供給するのは `potential`（と `--b6-wired` のときの `__training`）であって、
       *     ★**育った `stats` ではありません。**
       */
      + `${REAL_ABILITY ? '／⚠️ ★--real-ability なので、★馬の stats をそのまま使い、★この値は効きません' : ''}`,
);
console.log('');

const results: SeedResult[] = [];
for (const seed of SEEDS) {
  const r = runSeed(seed, racesPerSeed);
  results.push(r);
  console.log(
    `seed=${pad(seed, 6)} 完了 (母集団${r.poolSize}頭) ` +
      `1番人気 勝${pct(r.favoriteWinRate)} 複${pct(r.favoriteTop3Rate)} / 最低人気 ${pct(r.longshotWinRate)}`,
  );
}
console.log('');

const favWin = mean(results.map((r) => r.favoriteWinRate));
const favTop3 = mean(results.map((r) => r.favoriteTop3Rate));
const longshot = mean(results.map((r) => r.longshotWinRate));
const multMeanAll = mean(results.map((r) => r.interventionMeanAll));
const multMeanIntervened = mean(results.map((r) => r.interventionMeanIntervened));
const multMin = Math.min(...results.map((r) => r.interventionMin));
const multMax = Math.max(...results.map((r) => r.interventionMax));
const aiMult = mean(results.map((r) => r.aiMultMean));
const optMult = mean(results.map((r) => r.optimalMultMean));
const earlyMult = mean(results.map((r) => r.earlyMultMean));
/**
 * ★**V-13 は対標本の差で測る**（★2026-09-16・正典 **D-112 ③**）。
 *
 * ⚠️ ★旧: `optMult - earlyMult`（★**平均どうしの引き算**）。
 *    ★暴走を率で引くと同じ入力でも散るので、★この形だと「馬の差」が「仕掛けの差」に混ざり、
 *    ★散り具合も持てません（★たまたまで合否が動く）。
 * ★新: ★**同じ馬・同じレースで取った差**を集め、★平均・SE・0 から何 SE 離れているかを出します。
 */
const v13Gaps = results.flatMap((r) => r.v13PairedGaps);
const v13Gap = v13Gaps.length === 0 ? 0 : mean(v13Gaps);
/**
 * ★SE は `stats.js` の `standardError` から出す（★式をここに 2 本目として書かない）。
 * ⚠️ ★`sd`（母標準偏差・÷ n）ではなく ★**不偏**（÷ (n−1)）を使います — ★標本から推定するため。
 */
const v13Se = standardError(v13Gaps);
/**
 * ★**散らないとみなす SE の下限**。
 *
 * ⚠️ ★2026-09-16 に踏みました: ★「SE が **0 ちょうど**なら散らない」と書いたところ、
 *    ★実データでは ★**丸め残り（5.8×10⁻¹⁷ 程度）**が残り、`0.2 ÷ 5.8e-17` で
 *    ★**3.46×10¹⁵ σ** という無意味な数字が出力に出ました。
 *    ★**検査は緑でした** — ★人工の列（すべて同じ値）では丸め残りが出ないためです。
 * → ★**「0 か」ではなく「無視できるほど小さいか」**で見ます。
 *   ★倍率は 0.90〜1.10 の範囲なので、★1×10⁻¹² は「差が無い」と言ってよい大きさです。
 */
const V13_SE_FLOOR = 1e-12;
/** ★差が 0 から何 SE 離れているか（★散らないなら、効果量だけで見る） */
const v13Spread = v13Se < V13_SE_FLOOR;
const v13Sigma = v13Spread ? Infinity : v13Gap / v13Se;
/** ★参考: 旧来の「平均どうしの引き算」（★報告に併記して、形を変えた影響を見せる） */
const v13GapOld = optMult - earlyMult;
const v8Ratio = optMult === 0 ? 0 : aiMult / optMult;
const aiWin = mean(results.map((r) => r.aiWinRate));
const optWin = mean(results.map((r) => r.optimalWinRate));
const v8WinRatio = optWin === 0 ? 0 : aiWin / optWin;
const meanF = mean(results.map((r) => r.meanF));
const durabilityGap = mean(results.map((r) => r.durabilityGap));

const checks: { id: string; label: string; value: string; pass: boolean }[] = [
  {
    id: 'V-4',
    label: '1番人気の勝率 30〜34%',
    value: pct(favWin),
    pass: favWin >= GATES.V4[0] && favWin <= GATES.V4[1],
  },
  {
    id: 'V-5',
    label: '1番人気の複勝率 60〜65%',
    value: pct(favTop3),
    pass: favTop3 >= GATES.V5[0] && favTop3 <= GATES.V5[1],
  },
  {
    id: 'V-6',
    label: '下位3ランクの平均勝率 0.5〜2%（旧「最低人気」）',
    value: pct(longshot),
    pass: longshot >= GATES.V6[0] && longshot <= GATES.V6[1],
  },
  {
    id: 'V-8',
    label: 'AI代行 ÷ 手動最適（倍率の期待値比）93〜97%',
    value: pct(v8Ratio),
    pass: v8Ratio >= GATES.V8[0] && v8Ratio <= GATES.V8[1],
  },
  {
    // ★D-014 で V-9 は V-9a（不変条件・ゲート）と V-9b（監視・目標値なし）に分割された。
    //   旧 V-9「平均 0.99〜1.01」は §8b.3 の片側正のボーナスと両立しないため廃止。
    id: 'V-9a',
    label: '全サンプルが 0.90〜1.10 内（ハードキャップの不変条件）',
    value: `${round(multMin, 4)}〜${round(multMax, 4)}`,
    pass: multMin >= GATES.V9A_RANGE[0] && multMax <= GATES.V9A_RANGE[1],
  },
  {
    id: 'V-13',
    label: '仕掛けの巧拙が結果に出る（★対標本の差・平均と SE。D-112 ③）',
    value: `${round(v13Gap, 4)}±${v13Spread ? '0' : round(v13Se, 5)}（${v13Spread ? '散らない' : `${round(v13Sigma, 1)}σ`}・n=${v13Gaps.length}）`,
    /**
     * ★**効果量と有意性の両方**で見ます。
     *   ★効果量だけだと「意味の無いほど小さい差」が標本数で有意になり、
     *   ★有意性だけだと「大きいが偶然かもしれない差」が通ります。
     * ⚠️ ★`minSigma`（3）は ★**正典に無い値**です（§13.2 は「有意な差」としか書いていない）。★照会中。
     */
    pass: v13Gap >= GATES.V13_MIN_GAP && v13Sigma >= MC.V13_MEASUREMENT.minSigma,
  },
  {
    id: 'V-12a',
    label: '平均F 0.10 以下',
    value: String(round(meanF, 4)),
    pass: meanF <= GATES.V12_F_MAX,
  },
  {
    id: 'V-12b',
    label: '丈夫さの「表現型 − genotype」乖離 −8% 以内',
    value: pct(durabilityGap),
    pass: durabilityGap >= GATES.V12_DURABILITY_MIN,
  },
];

console.log(`${pad('#', 6)} ${pad('検証項目', 44)} ${pad('実測', 16)}  判定`);
console.log('-'.repeat(78));
for (const c of checks) {
  console.log(`${pad(c.id, 6)} ${pad(c.label, 44)} ${pad(c.value, 16)}  ${verdict(c.pass)}`);
}

console.log('');
console.log('--- ★V-13 の測り方を改めた影響（D-112 ③・2026-09-16）---');
console.log(`  ★対標本の差（新）: ${round(v13Gap, 4)}  SE ${v13Spread ? '0' : round(v13Se, 5)}  ` +
  `${v13Spread ? '（散らない＝効果が 0 の便）' : `${round(v13Sigma, 1)}σ`}  n=${v13Gaps.length}`);
if (v13Spread && v13Se > 0) {
  console.log(`  ※ 実際の SE は ${v13Se.toExponential(1)}（★浮動小数の丸め残り）。★${V13_SE_FLOOR.toExponential(0)} 未満は「散らない」として扱います。`);
}
console.log(`  平均どうしの引き算（旧）: ${round(v13GapOld, 4)}  ★参考値（合否には使いません）`);
console.log('  ※ 旧は「最適の平均 − 早仕掛けの平均」で、★散り具合を持たず、馬の差が仕掛けの差に混ざりました。');
console.log(`  ※ 合否は ★効果量（≥ ${GATES.V13_MIN_GAP}）と ★有意性（≥ ${MC.V13_MEASUREMENT.minSigma}σ）の両方。σ の線は照会中（Q-GB5-2）。`);

console.log('');
console.log('--- 人気別の勝率（1番人気から・シード平均） ---');
const maxRank = Math.max(...results.map((r) => r.winRateByRank.length));
for (let rank = 0; rank < Math.min(maxRank, 18); rank++) {
  const vals = results.map((r) => r.winRateByRank[rank]).filter((v): v is number => v !== undefined);
  if (vals.length === 0) continue;
  console.log(`  ${pad(rank + 1, 2)}番人気  ${pad(pct(mean(vals)), 8)}`);
}

console.log('');
console.log('--- 余裕（合格域の端までの距離）と標準誤差 ---');
console.log('※ SE の算出法: **1レースを独立標本とするベルヌーイ**。');
console.log('   V-6 は1レースで勝つのは1頭なので下位3枠は排他 → レース単位で p3=3×rate を用い、');
console.log('   得られた SE を 3 で割って1枠あたりに戻す。枠を独立とみなす素朴計算とほぼ同じ値になる。');
console.log('   ★手計算だと基準がぶれる（実際に私は根拠不明の 19.6 SE を報告した）ので、ここで出す。');
{
  const totalRaces = racesPerSeed * SEEDS.length;
  const rows: { id: string; value: number; lo: number; hi: number; se: number }[] = [
    { id: 'V-4', value: favWin, lo: GATES.V4[0], hi: GATES.V4[1], se: Math.sqrt((favWin * (1 - favWin)) / totalRaces) },
    { id: 'V-5', value: favTop3, lo: GATES.V5[0], hi: GATES.V5[1], se: Math.sqrt((favTop3 * (1 - favTop3)) / totalRaces) },
    {
      id: 'V-6',
      value: longshot,
      lo: GATES.V6[0],
      hi: GATES.V6[1],
      se: Math.sqrt((longshot * LONGSHOT_RANKS * (1 - longshot * LONGSHOT_RANKS)) / totalRaces) / LONGSHOT_RANKS,
    },
  ];
  console.log(`  ${pad('#', 5)} ${pad('実測', 9)} ${pad('SE', 9)} ${pad('下限まで', 20)} ${pad('上限まで', 20)}`);
  for (const r of rows) {
    const loM = r.value - r.lo;
    const hiM = r.hi - r.value;
    console.log(
      `  ${pad(r.id, 5)} ${pad(pct(r.value), 9)} ${pad(round(r.se * 100, 4) + 'pp', 9)} ` +
        `${pad(`${round(loM * 100, 2)}pp（${round(loM / r.se, 1)} SE）`, 20)} ` +
        `${pad(`${round(hiM * 100, 2)}pp（${round(hiM / r.se, 1)} SE）`, 20)}`,
    );
  }
}
console.log('');
console.log('--- 案B: 出走頭数別の下位3ランク平均勝率（V-6 をプール値だけで見ない）---');
console.log('※ 正典 §10.4 は 8〜18頭。頭数分布が一様かもここで確認する');
{
  const sizes = new Set<number>();
  for (const r of results) for (const k of Object.keys(r.fieldSizeCounts)) sizes.add(Number(k));
  const sorted = [...sizes].sort((a, b) => a - b);
  let totalRaces = 0;
  for (const n of sorted) totalRaces += results.reduce((s, r) => s + (r.fieldSizeCounts[n] ?? 0), 0);
  console.log(`  ${pad('頭数', 5)} ${pad('レース数', 9)} ${pad('構成比', 8)} ${pad('下位3平均勝率', 14)}`);
  for (const n of sorted) {
    const races = results.reduce((s, r) => s + (r.fieldSizeCounts[n] ?? 0), 0);
    const wins = results.reduce((s, r) => s + (r.longshotWinsByFieldSize[n] ?? 0), 0);
    const slots = results.reduce((s, r) => s + (r.longshotSlotsByFieldSize[n] ?? 0), 0);
    const rate = slots === 0 ? 0 : wins / slots;
    const flag = rate < GATES.V6[0] ? '  ← 裾が死んでいる' : '';
    console.log(
      `  ${pad(n, 5)} ${pad(races, 9)} ${pad(pct(races / Math.max(1, totalRaces)), 8)} ${pad(pct(rate), 13)}${flag}`,
    );
  }
}
console.log('');
console.log('--- V-9b（監視・絶対目標値は置かない・D-014）と参考値 ---');
 console.log(
   `  V-9b 介入した馬だけの interventionMult 平均: ${round(multMeanIntervened, 4)}（時系列で監視する値）`,
 );
 console.log(`  全出走馬での平均（介入なしは1.00）: ${round(multMeanAll, 4)}`);
console.log(`  介入対象馬だけの interventionMult 平均: ${round(multMeanIntervened, 4)}`);
console.log(`  AI代行の倍率平均: ${round(aiMult, 4)} / 手動最適: ${round(optMult, 4)}`);
console.log(
  `  自馬の勝率 AI代行 ${pct(aiWin)} / 手動最適 ${pct(optWin)} → 勝率比 ${pct(v8WinRatio)}`,
);
/**
 * ★**シード間のばらつき**（★**VP-10**・2026-09-19）。
 *
 * 【🔴 ★なぜ 2 つ出すか — ★報告と道具で数が食い違いました】
 *   ★ここは `sd`（★**母標準偏差**・÷ n）を出していました。★ところが ★**判定に使う `standardError`
 *   ★は `sdSample`（÷ n−1）から引きます**。★同じ「SD」という名前で ★**別の量**が 2 つありました。
 *   ✔ ★実測（★2026-09-19・D プール・8 シード）: ★**母 0.39pp ／ 不偏 0.414pp**（★6% の差）。
 *   🔴 ★`REPORT_BASELINE_D_20260919.md` は **0.414**、★この道具の画面は **0.39** を出しており、
 *     ★**同じ実行の同じ量が、2 つの数で世に出ていました**。
 *   ⚠️ ★`stats.ts` 自身が「★黙って流用すると、少ない標本で SE を過小に報告します」と
 *     ★註記していたのに、★**その流用がここに在りました**。
 *
 * → ★**両方を、名前を付けて出します。** ★前後比較に使うのは ★**不偏のほう**です
 *   （★母集団ではなく、★「もっとシードを振ったら」を推定しているため）。
 */
const favRates = results.map((r) => r.favoriteWinRate);
console.log(
  `  ★レース内の能力の変動係数（SD ÷ 平均）: **${(mean(results.map((r) => r.fieldAbilityCv)) * 100).toFixed(2)}%**（★判定には使いません。★本番は 7.23% — tools/diag-field-dispersion.mjs）\n` +
  `  シード間の 1番人気勝率のばらつき: ★不偏SD(÷n-1) ${pct(sdSample(favRates))}` +
  ` / 母SD(÷n) ${pct(sd(favRates))}` +
  ` → ★**平均の SE ${pct(standardError(favRates))}**（★前後比較はこれで割ること）`,
);

const elapsed = (Date.now() - started) / 1000;
console.log('');
console.log(`所要時間: ${round(elapsed, 1)} 秒`);
const overall = checks.every((c) => c.pass);
console.log(`総合: ${verdict(overall)}`);

if (process.argv.includes('--json')) {
  // ★非有限値は文字列化する（O-7）。素の JSON.stringify だと NaN と Infinity が
  //   どちらも null になり、V-9a の範囲判定を JSON から追試できない。
  //   あわせて測定条件（自由変数）も出す（R-12: どの条件で出た数字かを機械可読に残す）
  console.log(
    toSafeJson({
      checks,
      results,
      elapsedSec: elapsed,
      // ★R-12 / Q-2: **判定に効く自由変数はすべて機械可読に残す**。
      //   pool-generations は実測で V-4 を約0.75pp 動かす（20世代 34.16% / 40世代 33.41%）。
      //   どの条件で出た数字かが JSON だけで再現できる状態にする。
      settings: {
        races: racesPerSeed * SEEDS.length,
        seeds: SEEDS,
        popularityTrials: POPULARITY_TRIALS,
        poolGenerations: POOL_GENERATIONS,
        poolMares: POOL_MARES,
        classBand: CLASS_BAND,
        unlock: UNLOCK,
        raceRandomK: RACE_K,
        fieldStrengthFloor: FLOOR,
        distanceSuitMin: DISTANCE_SUIT_MIN,
        offDistanceEntryRate: OFF_DISTANCE_ENTRY_RATE,
        offSurfaceEntryRate: OFF_SURFACE_ENTRY_RATE,
        oversampleRatio: OVERSAMPLE_RATIO,
        tailMixP: TAIL_P,
        tailMixM: TAIL_M,
        longshotRanks: LONGSHOT_RANKS,
      },
    }),
  );
}

process.exitCode = overall ? 0 : 1;
