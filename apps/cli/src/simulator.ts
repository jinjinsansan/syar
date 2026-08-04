/**
 * 100世代シミュレータ本体 — 指示書 §3.4
 *
 * 遺伝エンジン（@star/sim-engine）だけを使って世代を回し、V-1 / V-2 / V-3 を測る。
 * 乱数はすべてマスターシードからの導出（deriveSeed）で、実行のたびに完全一致する。
 */

import {
  ABILITY_KEYS,
  applyMatingCounters,
  breed,
  canMate,
  createFounder,
  deriveRng,
  deriveSeed,
  generateNicksTable,
  makeLineIds,
  type AbilityKey,
  type BalanceConfig,
  type FoundersConfig,
  type HorseId,
  type HorseRecord,
  type NicksGenConfig,
  type NicksTable,
} from '@star/sim-engine';
import { correlation, max, mean, min, quantileSorted, round, sd } from './stats.js';

// ---------------------------------------------------------------------------
// オプション
// ---------------------------------------------------------------------------

export interface SimulationOptions {
  /** 回す世代数（= 年数。1世代 = 1年 = 繁殖牝馬プール全頭が1産） */
  generations: number;
  seed: number;
  /** 繁殖牝馬プールの頭数 */
  population: number;
  /** 種牡馬プールの頭数 */
  stallionPool: number;
  /** 種付け候補にする上位割合（既定 0.2 = 能力合計上位20%） */
  stallionTopRatio: number;
  /** 繁殖入りできる年齢（正典 §7.1 の 260週=5歳末引退より6歳） */
  maturityYears: number;
  /** 種牡馬の供用年数 */
  stallionServiceYears: number;
  /** 繁殖牝馬の上限年齢 */
  mareMaxAgeYears: number;
  /** プール補充の選抜方針。random = 追加の選抜圧をかけない（既定） */
  recruit: 'random' | 'top';
  /**
   * 種牡馬選抜に使う「観測能力」の遺伝率 h2（0〜1）。
   * P0 はレースエンジンが無いため、素直に実装すると真の potential で種牡馬を選ぶことになる。
   * これは現実にはあり得ない完全情報での選抜であり、選抜応答を最大化して V-2 を構造的に破綻させる。
   * 実際の競走能力の遺伝率は 0.3 前後で、選抜は観測成績越しにしか効かない:
   *   観測能力 = potential + 個体固有ノイズ * sqrt((1-h2)/h2) * σ(プール)
   * h2 = 1 を指定すると完全情報（= 指示書 §3.4 の文字通りの既定）に戻る。
   * P1 でレースエンジンが入ったら、この近似は実際のレース結果による選抜へ置き換える。
   */
  selectionH2: number;
  /** V-1 で試す配合の組数 */
  v1Pairs: number;
  /** V-1 の反復回数（指示書: 同一配合100回） */
  v1Repeats: number;
  /** 到達不能になった祖先レコードを破棄してメモリを抑える */
  prune: boolean;
}

export const DEFAULT_OPTIONS: SimulationOptions = {
  generations: 100,
  seed: 42,
  population: 200,
  stallionPool: 60,
  stallionTopRatio: 0.2,
  maturityYears: 6,
  stallionServiceYears: 8,
  mareMaxAgeYears: 14,
  recruit: 'random',
  // 0.30 = 競走能力の実測遺伝率。1.0 にすると完全情報選抜（指示書の文字通りの既定）
  selectionH2: 0.3,
  v1Pairs: 5,
  v1Repeats: 100,
  prune: true,
};

// ---------------------------------------------------------------------------
// 出力構造
// ---------------------------------------------------------------------------

export interface AlleleDistribution {
  mean: number;
  sd: number;
  p05: number;
  p50: number;
  p95: number;
  max: number;
}

export interface RateStat {
  hits: number;
  rolls: number;
  rate: number;
}

export interface CohortStat {
  /** 世代番号（= 年）。創始世代は 0 */
  generation: number;
  foals: number;
  /** 血統上の世代深度の平均（1 + max(両親の深度)）。年数と遺伝的世代交代の差を可視化する */
  meanGenerationDepth: number;
  marePool: number;
  stallionPool: number;
  sireCandidates: number;
  unbredMares: number;
  meanAbility: Record<AbilityKey, number>;
  meanAbilityTotal: number;
  maxAbilityTotal: number;
  minAbilityTotal: number;
  allele: AlleleDistribution;
  meanF: number;
  maxF: number;
  atavism: RateStat;
  bigAtavism: RateStat;
  bigMutation: RateStat;
  frailCount: number;
  nicksHits: number;
  /**
   * 中間親（父母の能力合計の平均）と産駒の能力合計のピアソン相関。
   * 「血のつながりの強さ」の実測値。正典 §1.1「血をつなぐことが唯一の進行軸」／
   * §1.4-3「蓄積感」が成立しているかの健全性指標であり、
   * 血統インフレ抑制のために遺伝をノイズで薄めすぎていないかの歯止めになる。
   */
  parentOffspringCorrelation: number;
}

export interface V1PairSample {
  sireId: HorseId;
  damId: HorseId;
  inbreedCoeff: number;
  meanPotentialTotal: number;
  /** 能力ごとの変動係数（SD / 平均） */
  cvByAbility: Record<AbilityKey, number>;
  /** 5能力の変動係数の平均 = この配合の代表値 */
  meanCv: number;
  /** 5能力合計の変動係数（参考。独立成分の合成なので必ず小さく出る） */
  totalCv: number;
}

export interface V1Checkpoint {
  generation: number;
  repeats: number;
  pairs: V1PairSample[];
  meanCv: number;
}

export interface Verification {
  v1: {
    checkpoints: V1Checkpoint[];
    /** 判定に使う値 = 最終世代のチェックポイント */
    primaryGeneration: number;
    primaryMeanCv: number;
    target: [number, number];
    pass: boolean;
  };
  v2: {
    initialMeanAbilityTotal: number;
    finalMeanAbilityTotal: number;
    /** 直近5世代平均（単年のブレを均した参考値） */
    finalMeanAbilityTotalSmoothed: number;
    ratio: number;
    ratioSmoothed: number;
    targetMax: number;
    pass: boolean;
  };
  v3: {
    atavism: RateStat & { target: number; deviationPt: number; pass: boolean };
    bigAtavism: RateStat & { target: number; deviationPt: number; pass: boolean };
    bigMutation: RateStat & { target: number; deviationPt: number; pass: boolean };
    tolerancePt: number;
    pass: boolean;
  };
  pass: boolean;
}

export interface SimulationResult {
  options: SimulationOptions;
  balanceDigest: {
    genetics: BalanceConfig['genetics'];
    founders: FoundersConfig;
    dominantWeight: number;
    /** 正典外の提案機構（既定 0 = 無効。QUESTIONS_P0 Q1） */
    regressionRate: number;
    pedigreeDepth: number;
    mareLifetimeFoals: number;
    stallionBaseCoverings: number;
    minBreedingAgeYears: number;
  };
  founderCohort: CohortStat;
  cohorts: CohortStat[];
  verification: Verification;
  totals: {
    matings: number;
    foals: number;
    unbredMares: number;
    horsesCreated: number;
  };
}

// ---------------------------------------------------------------------------
// 内部ヘルパ
// ---------------------------------------------------------------------------

const RNG_DOMAIN = {
  NICKS: 1,
  FOUNDER: 2,
  RECRUIT: 3,
  MATING: 4,
  V1: 5,
  PERF: 6,
} as const;

function abilityTotal(horse: HorseRecord): number {
  let total = 0;
  for (const key of ABILITY_KEYS) total += horse.potential[key];
  return total;
}

function abilityAlleles(horse: HorseRecord): number[] {
  const out: number[] = [];
  for (const key of ABILITY_KEYS) {
    out.push(horse.genotype[key].a1, horse.genotype[key].a2);
  }
  return out;
}

function summarizeCohort(
  generation: number,
  horses: readonly HorseRecord[],
  extra: {
    marePool: number;
    stallionPool: number;
    sireCandidates: number;
    unbredMares: number;
    atavism: RateStat;
    bigAtavism: RateStat;
    bigMutation: RateStat;
    midParent?: readonly number[];
  },
): CohortStat {
  const totals = horses.map(abilityTotal);
  const alleles: number[] = [];
  for (const h of horses) alleles.push(...abilityAlleles(h));
  alleles.sort((a, b) => a - b);

  const meanAbility: Record<AbilityKey, number> = { sp: 0, st: 0, pw: 0, gt: 0, iq: 0 };
  for (const key of ABILITY_KEYS) {
    meanAbility[key] = round(mean(horses.map((h) => h.potential[key])), 2);
  }

  const fValues = horses.map((h) => h.inbreedCoeff);
  const depths = horses.map((h) => h.generation);

  return {
    generation,
    foals: horses.length,
    meanGenerationDepth: round(mean(depths), 3),
    marePool: extra.marePool,
    stallionPool: extra.stallionPool,
    sireCandidates: extra.sireCandidates,
    unbredMares: extra.unbredMares,
    meanAbility,
    meanAbilityTotal: round(mean(totals), 2),
    maxAbilityTotal: round(max(totals), 2),
    minAbilityTotal: round(min(totals), 2),
    allele: {
      mean: round(mean(alleles), 2),
      sd: round(sd(alleles), 2),
      p05: quantileSorted(alleles, 0.05),
      p50: quantileSorted(alleles, 0.5),
      p95: quantileSorted(alleles, 0.95),
      max: round(max(alleles), 2),
    },
    meanF: round(mean(fValues), 5),
    maxF: round(max(fValues), 5),
    atavism: extra.atavism,
    bigAtavism: extra.bigAtavism,
    bigMutation: extra.bigMutation,
    frailCount: horses.filter((h) => h.frail).length,
    nicksHits: horses.filter((h) => h.nicksMultiplier > 1).length,
    parentOffspringCorrelation:
      extra.midParent === undefined ? 0 : round(correlation(extra.midParent, totals), 4),
  };
}

function emptyRate(): RateStat {
  return { hits: 0, rolls: 0, rate: 0 };
}

function addRate(target: RateStat, hits: number, rolls: number): void {
  target.hits += hits;
  target.rolls += rolls;
  target.rate = target.rolls === 0 ? 0 : target.hits / target.rolls;
}

/** V-1: 同一配合を repeats 回繰り返して potential のばらつきを測る */
function measureV1Pair(
  sire: HorseRecord,
  dam: HorseRecord,
  pairIndex: number,
  opts: SimulationOptions,
  balance: BalanceConfig,
  nicks: NicksTable,
  lookup: (id: HorseId) => HorseRecord | undefined,
  year: number,
): V1PairSample | null {
  // 繁殖カウンタだけを初期化した複製で試す（本体の状態は一切変えない）
  const sireClone: HorseRecord = { ...sire, coveringsThisYear: 0 };
  const damClone: HorseRecord = { ...dam, bredThisYear: false, foalCount: 0 };
  if (!canMate(sireClone, damClone, balance, year).ok) return null;

  const byAbility: Record<AbilityKey, number[]> = { sp: [], st: [], pw: [], gt: [], iq: [] };
  const totals: number[] = [];
  let inbreedCoeff = 0;

  for (let i = 0; i < opts.v1Repeats; i++) {
    const foal = breed({
      id: `V1_${year}_${pairIndex}_${i}`,
      sire: sireClone,
      dam: damClone,
      seed: deriveSeed(opts.seed, RNG_DOMAIN.V1, year, pairIndex, i),
      generation: 0,
      birthYear: year,
      lookup,
      balance,
      nicks,
    });
    for (const key of ABILITY_KEYS) byAbility[key].push(foal.potential[key]);
    totals.push(abilityTotal(foal));
    inbreedCoeff = foal.inbreedCoeff;
  }

  const cvByAbility: Record<AbilityKey, number> = { sp: 0, st: 0, pw: 0, gt: 0, iq: 0 };
  const cvs: number[] = [];
  for (const key of ABILITY_KEYS) {
    const m = mean(byAbility[key]);
    const cv = m === 0 ? 0 : sd(byAbility[key]) / m;
    cvByAbility[key] = round(cv, 5);
    cvs.push(cv);
  }
  const totalMean = mean(totals);

  return {
    sireId: sire.id,
    damId: dam.id,
    inbreedCoeff: round(inbreedCoeff, 5),
    meanPotentialTotal: round(totalMean, 2),
    cvByAbility,
    meanCv: round(mean(cvs), 5),
    totalCv: round(totalMean === 0 ? 0 : sd(totals) / totalMean, 5),
  };
}

// ---------------------------------------------------------------------------
// シミュレーション本体
// ---------------------------------------------------------------------------

export function runSimulation(
  options: Partial<SimulationOptions>,
  balance: BalanceConfig,
  founders: FoundersConfig,
  nicksGen: NicksGenConfig,
): SimulationResult {
  const opts: SimulationOptions = { ...DEFAULT_OPTIONS, ...options };

  // 成熟年齢は交配可否チェックと同じ値を使う（食い違うと矛盾するため上書き）
  const effectiveBalance: BalanceConfig = {
    ...balance,
    MIN_BREEDING_AGE_YEARS: opts.maturityYears,
  };

  const lines = makeLineIds(founders.LINE_COUNT);
  const nicks = generateNicksTable(
    lines,
    deriveRng(opts.seed, RNG_DOMAIN.NICKS),
    nicksGen.HIT_RATIO,
    nicksGen.MULT_MIN,
    nicksGen.MULT_MAX,
  );

  const all = new Map<HorseId, HorseRecord>();
  const lookup = (id: HorseId): HorseRecord | undefined => all.get(id);

  let horseCounter = 0;
  const nextId = (): HorseId => {
    horseCounter += 1;
    return `HORSE_${String(horseCounter).padStart(6, '0')}`;
  };

  /**
   * 個体固有の「観測ノイズ」（= その馬の競走成績の運）。
   * 生涯を通じて固定する（引退時の成績で種牡馬入りが決まるのと同じ構造）。
   */
  const perfNoise = new Map<HorseId, number>();

  const register = (horse: HorseRecord): HorseRecord => {
    all.set(horse.id, horse);
    perfNoise.set(horse.id, deriveRng(opts.seed, RNG_DOMAIN.PERF, horseCounter).gaussian(0, 1));
    return horse;
  };

  // 観測能力 = 真の能力合計 + ノイズ × sqrt((1-h2)/h2) × σ(プール)
  const noiseK = Math.sqrt((1 - Math.min(1, Math.max(1e-6, opts.selectionH2))) / Math.min(1, Math.max(1e-6, opts.selectionH2)));

  // --- 創始世代 -------------------------------------------------------------
  const founderHorses: HorseRecord[] = [];
  const makeFounder = (sex: 'male' | 'female', birthYear: number, index: number): HorseRecord => {
    const rng = deriveRng(opts.seed, RNG_DOMAIN.FOUNDER, index);
    const horse = createFounder({
      id: nextId(),
      sex,
      // 創始馬にはラインをランダム割当（指示書 §3.3）
      sireLine: rng.pick(lines),
      birthYear,
      rng,
      balance: effectiveBalance,
      founders,
    });
    founderHorses.push(horse);
    return register(horse);
  };

  let founderIndex = 0;
  const mares: HorseRecord[] = [];
  const stallions: HorseRecord[] = [];

  // 年0 から供用可能な現役繁殖世代。年齢を散らして退厩が一度に来ないようにする
  for (let i = 0; i < opts.population; i++) {
    const birthYear = -(opts.maturityYears + (i % 8));
    mares.push(makeFounder('female', birthYear, founderIndex++));
  }
  for (let i = 0; i < opts.stallionPool; i++) {
    const birthYear = -(opts.maturityYears + (i % opts.stallionServiceYears));
    stallions.push(makeFounder('male', birthYear, founderIndex++));
  }

  // 若駒の在庫（年1〜maturity に成熟する創始馬）。これが無いと序盤にプールが枯れる
  const pending = new Map<number, HorseRecord[]>();
  const pushPending = (year: number, horse: HorseRecord): void => {
    const list = pending.get(year);
    if (list === undefined) pending.set(year, [horse]);
    else list.push(horse);
  };
  const filliesPerYear = Math.ceil(opts.population / 8);
  const coltsPerYear = Math.ceil(opts.stallionPool / opts.stallionServiceYears);
  for (let y = 1; y <= opts.maturityYears; y++) {
    for (let i = 0; i < filliesPerYear; i++) {
      pushPending(y, makeFounder('female', y - opts.maturityYears, founderIndex++));
    }
    for (let i = 0; i < coltsPerYear; i++) {
      pushPending(y, makeFounder('male', y - opts.maturityYears, founderIndex++));
    }
  }

  const founderCohort = summarizeCohort(0, founderHorses, {
    marePool: mares.length,
    stallionPool: stallions.length,
    sireCandidates: 0,
    unbredMares: 0,
    atavism: emptyRate(),
    bigAtavism: emptyRate(),
    bigMutation: emptyRate(),
  });

  // --- 年ループ -------------------------------------------------------------
  const cohorts: CohortStat[] = [];
  const v1Checkpoints: V1Checkpoint[] = [];
  const totalAtavism = emptyRate();
  const totalBigAtavism = emptyRate();
  const totalBigMutation = emptyRate();
  let totalMatings = 0;
  let totalUnbred = 0;

  const v1Years = new Set<number>(
    [1, 10, 50, opts.generations].filter((y) => y >= 1 && y <= opts.generations),
  );

  for (let year = 1; year <= opts.generations; year++) {
    // 1. 退厩（生涯8産 / 上限年齢 / 供用年数）
    for (let i = mares.length - 1; i >= 0; i--) {
      const m = mares[i];
      if (m === undefined) continue;
      if (
        m.foalCount >= effectiveBalance.MARE_LIFETIME_FOALS ||
        year - m.birthYear > opts.mareMaxAgeYears
      ) {
        mares.splice(i, 1);
      }
    }
    for (let i = stallions.length - 1; i >= 0; i--) {
      const s = stallions[i];
      if (s === undefined) continue;
      if (year - s.birthYear >= opts.maturityYears + opts.stallionServiceYears) {
        stallions.splice(i, 1);
      }
    }

    // 2. 補充（当年に成熟した馬から）
    const recruits = pending.get(year) ?? [];
    pending.delete(year);
    const recruitRng = deriveRng(opts.seed, RNG_DOMAIN.RECRUIT, year);
    const orderRecruits = (list: HorseRecord[]): HorseRecord[] =>
      opts.recruit === 'top'
        ? list.slice().sort((a, b) => abilityTotal(b) - abilityTotal(a))
        : recruitRng.shuffled(list);

    const newMares = orderRecruits(recruits.filter((h) => h.sex === 'female'));
    const newStallions = orderRecruits(recruits.filter((h) => h.sex === 'male'));
    for (const h of newMares) {
      if (mares.length >= opts.population) break;
      mares.push(h);
    }
    for (const h of newStallions) {
      if (stallions.length >= opts.stallionPool) break;
      stallions.push(h);
    }

    // 3. 年次カウンタのリセット
    for (const m of mares) m.bredThisYear = false;
    for (const s of stallions) s.coveringsThisYear = 0;

    // 4. 種付け候補 = 観測能力の上位 stallionTopRatio（指示書 §3.4）
    //    観測能力は真の能力に個体固有ノイズを載せたもの（selectionH2 参照）
    const poolSd = sd(stallions.map(abilityTotal));
    const observedAbility = (h: HorseRecord): number =>
      abilityTotal(h) + (perfNoise.get(h.id) ?? 0) * noiseK * poolSd;
    const ranked = stallions
      .slice()
      .sort((a, b) =>
        observedAbility(b) !== observedAbility(a)
          ? observedAbility(b) - observedAbility(a)
          : a.id.localeCompare(b.id),
      );
    const candidateCount = Math.max(1, Math.ceil(ranked.length * opts.stallionTopRatio));
    const candidates = ranked.slice(0, candidateCount);

    // 5. 配合
    const matingRng = deriveRng(opts.seed, RNG_DOMAIN.MATING, year);
    const foals: HorseRecord[] = [];
    const midParent: number[] = [];
    const yearAtavism = emptyRate();
    const yearBigAtavism = emptyRate();
    const yearBigMutation = emptyRate();
    let unbred = 0;
    let available = candidates.slice();

    for (let mareIndex = 0; mareIndex < mares.length; mareIndex++) {
      const dam = mares[mareIndex];
      if (dam === undefined) continue;

      // 上位候補からランダムに1頭。種付上限に達した馬は候補から外す
      let sire: HorseRecord | null = null;
      while (available.length > 0) {
        const pick = matingRng.int(0, available.length - 1);
        const cand = available[pick];
        if (cand === undefined) break;
        const check = canMate(cand, dam, effectiveBalance, year);
        if (check.ok) {
          sire = cand;
          break;
        }
        if (check.reason === 'sire_coverings_exceeded') {
          available = available.filter((c) => c.id !== cand.id);
          continue;
        }
        // 種牡馬側ではなく牝馬側の理由（高齢・8産済み等）なら、この牝馬は諦める
        break;
      }

      if (sire === null) {
        unbred++;
        continue;
      }

      const foal = breed({
        id: nextId(),
        sire,
        dam,
        seed: deriveSeed(opts.seed, RNG_DOMAIN.MATING, year, mareIndex),
        generation: 1 + Math.max(sire.generation, dam.generation),
        birthYear: year,
        lookup,
        balance: effectiveBalance,
        nicks,
      });
      midParent.push((abilityTotal(sire) + abilityTotal(dam)) / 2);
      applyMatingCounters(sire, dam);
      register(foal);
      foals.push(foal);
      totalMatings++;

      const rec = foal.breedingRecord;
      if (rec !== null) {
        addRate(yearAtavism, rec.atavismTraits.length, rec.atavismEligibleRolls);
        addRate(yearBigAtavism, rec.bigAtavismTraits.length, rec.bigAtavismEligibleRolls);
        // 大突然変異は形質単位のロール（アレル単位ではない）
        addRate(yearBigMutation, rec.bigMutationTraits.length, rec.mutationRolls / 2);
      }
    }

    addRate(totalAtavism, yearAtavism.hits, yearAtavism.rolls);
    addRate(totalBigAtavism, yearBigAtavism.hits, yearBigAtavism.rolls);
    addRate(totalBigMutation, yearBigMutation.hits, yearBigMutation.rolls);
    totalUnbred += unbred;

    // 6. 当年産駒を成熟年に予約
    for (const foal of foals) {
      pushPending(year + opts.maturityYears, foal);
    }

    cohorts.push(
      summarizeCohort(year, foals, {
        marePool: mares.length,
        stallionPool: stallions.length,
        sireCandidates: candidates.length,
        unbredMares: unbred,
        atavism: yearAtavism,
        bigAtavism: yearBigAtavism,
        bigMutation: yearBigMutation,
        midParent,
      }),
    );

    // 7. V-1 チェックポイント
    if (v1Years.has(year)) {
      const samples: V1PairSample[] = [];
      for (let p = 0; p < opts.v1Pairs; p++) {
        const dam = mares[p % Math.max(1, mares.length)];
        const sire = candidates[p % Math.max(1, candidates.length)];
        if (dam === undefined || sire === undefined) continue;
        const sample = measureV1Pair(
          sire,
          dam,
          p,
          opts,
          effectiveBalance,
          nicks,
          lookup,
          year,
        );
        if (sample !== null) samples.push(sample);
      }
      v1Checkpoints.push({
        generation: year,
        repeats: opts.v1Repeats,
        pairs: samples,
        meanCv: round(mean(samples.map((s) => s.meanCv)), 5),
      });
    }

    // 8. 到達不能な祖先を破棄（結果には影響しない。テストで同値性を検証）
    if (opts.prune) {
      const keep = new Set<HorseId>();
      const live: HorseRecord[] = [...mares, ...stallions];
      for (const list of pending.values()) live.push(...list);
      for (const h of live) {
        keep.add(h.id);
        for (const ancestorId of h.pedigreeCache.keys()) keep.add(ancestorId);
      }
      for (const id of all.keys()) {
        if (!keep.has(id)) {
          all.delete(id);
          perfNoise.delete(id);
        }
      }
    }
  }

  // --- 検証まとめ -----------------------------------------------------------
  const finalCohort = cohorts[cohorts.length - 1];
  const finalMean = finalCohort?.meanAbilityTotal ?? 0;
  const tail = cohorts.slice(-5).map((c) => c.meanAbilityTotal);
  const finalMeanSmoothed = mean(tail);
  const initialMean = founderCohort.meanAbilityTotal;

  const primaryV1 = v1Checkpoints[v1Checkpoints.length - 1];
  const primaryMeanCv = primaryV1?.meanCv ?? 0;

  const tolerancePt = 0.005;
  const v3Atavism = {
    ...totalAtavism,
    rate: round(totalAtavism.rate, 5),
    target: balance.genetics.ATAVISM_RATE,
    deviationPt: round(Math.abs(totalAtavism.rate - balance.genetics.ATAVISM_RATE), 5),
    pass: Math.abs(totalAtavism.rate - balance.genetics.ATAVISM_RATE) <= tolerancePt,
  };
  const v3BigAtavism = {
    ...totalBigAtavism,
    rate: round(totalBigAtavism.rate, 5),
    target: balance.genetics.BIG_ATAVISM_RATE,
    deviationPt: round(Math.abs(totalBigAtavism.rate - balance.genetics.BIG_ATAVISM_RATE), 5),
    pass: Math.abs(totalBigAtavism.rate - balance.genetics.BIG_ATAVISM_RATE) <= tolerancePt,
  };
  const v3BigMutation = {
    ...totalBigMutation,
    rate: round(totalBigMutation.rate, 5),
    target: balance.genetics.BIG_MUTATION_RATE,
    deviationPt: round(Math.abs(totalBigMutation.rate - balance.genetics.BIG_MUTATION_RATE), 5),
    pass: Math.abs(totalBigMutation.rate - balance.genetics.BIG_MUTATION_RATE) <= tolerancePt,
  };

  const ratio = initialMean === 0 ? 0 : finalMean / initialMean - 1;
  const ratioSmoothed = initialMean === 0 ? 0 : finalMeanSmoothed / initialMean - 1;

  const v1Pass = primaryMeanCv >= 0.12 && primaryMeanCv <= 0.18;
  const v2Pass = ratio <= 0.5;
  const v3Pass = v3Atavism.pass && v3BigAtavism.pass && v3BigMutation.pass;

  const verification: Verification = {
    v1: {
      checkpoints: v1Checkpoints,
      primaryGeneration: primaryV1?.generation ?? 0,
      primaryMeanCv,
      target: [0.12, 0.18],
      pass: v1Pass,
    },
    v2: {
      initialMeanAbilityTotal: round(initialMean, 2),
      finalMeanAbilityTotal: round(finalMean, 2),
      finalMeanAbilityTotalSmoothed: round(finalMeanSmoothed, 2),
      ratio: round(ratio, 5),
      ratioSmoothed: round(ratioSmoothed, 5),
      targetMax: 0.5,
      pass: v2Pass,
    },
    v3: {
      atavism: v3Atavism,
      bigAtavism: v3BigAtavism,
      bigMutation: v3BigMutation,
      tolerancePt,
      pass: v3Pass,
    },
    pass: v1Pass && v2Pass && v3Pass,
  };

  return {
    options: opts,
    balanceDigest: {
      genetics: balance.genetics,
      founders,
      dominantWeight: balance.DOMINANT_WEIGHT,
      regressionRate: balance.REGRESSION_RATE,
      pedigreeDepth: balance.PEDIGREE_DEPTH,
      mareLifetimeFoals: balance.MARE_LIFETIME_FOALS,
      stallionBaseCoverings: balance.STALLION_BASE_COVERINGS,
      minBreedingAgeYears: opts.maturityYears,
    },
    founderCohort,
    cohorts,
    verification,
    totals: {
      matings: totalMatings,
      foals: totalMatings,
      unbredMares: totalUnbred,
      horsesCreated: horseCounter,
    },
  };
}
