/**
 * N-2: NPC 世界の 50世代プリシード（正典 §10.5）
 *
 * 【何を作るか】
 *   サービス開始時点で「5代血統表が埋まった歴史ある血統」が存在する状態。
 *   §10.5 が **体験の質を大きく左右する必須工程** と位置づけている。
 *
 * 【公正性の担保（§10.5）】
 *   NPC 馬は**プレイヤー馬と同一の遺伝エンジン**で生成する。
 *   専用の簡易ロジックを作らない ＝ `@star/sim-engine` の `createFounder` / `breed` だけを使う。
 *   ここには遺伝の計算を一行も書かない（書いた時点で「同じ土俵」が崩れる）。
 *
 * 【決定論（憲法 §1-4）】
 *   すべての乱数はシードから導出する。`Math.random()` / `Date.now()` は呼ばない。
 *   同じシードから同じ血統プールが出ること自体を合格基準4で測る。
 */

import {
  PRESEED_STREAM,
  DEFAULT_BALANCE,
  FOUNDERS,
  NICKS_GEN,
  generateNicksTable,
  DEFAULT_NAME_SHAPE,
  
  NPC_STABLES,
  applyMatingCounters,
  breed,
  calcInbreedCoefficient,
  canMate,
  createFounder,
  deriveRng,
  generateHorseName,
  type BalanceConfig,
  type FoundersConfig,
  type HorseRecord,
  type NameBlocklist,
  type NicksTable,
  type Stable,
} from '@star/sim-engine';

import { ABILITY_KEYS } from '@star/sim-engine';
import { lineConcentration } from './pedigree-audit.js';

/**
 * 🔴 ★**配合相手の選び方は `@star/breeding` へ移しました**（★2026-09-20・**G-2**）。
 *   ★定常運転（`POOL-SUPPLY`）で ★**ワーカーから同じ論理を呼ぶ**ために、製品側へ出しました。
 *   ⚠️ ★**コピーしていません。** ★ここは再輸出だけです（★2 つに分かれると片方が古びます・D-052）。
 */
export {
  STABLE_EMPHASIS_WEIGHT, POLICY_FIT_WEIGHT, DISTANCE_FIT_SPAN, SIRE_CHOICE_TOP_K,
  INBREED_PENALTY_WEIGHT, HOME_SIRE_BONUS,
  policyFit, mateScore, mateScoreWithInbreeding, stableScore,
} from '@star/breeding';
import { SIRE_CHOICE_TOP_K, mateScoreWithInbreeding, stableScore } from '@star/breeding';

// ★用途IDは集約表から取る（番号の重複を型で禁じる）
const STREAM = PRESEED_STREAM;













/*
 * ★削除: PRESEED_OBSERVE_NOISE（選抜時の観測ノイズ・0.55）
 *
 *   「真の素質は見えない」を表すつもりで置いたが、登録簿が**無防備**と検出したので
 *   0 にした場合と実測で比べた（出荷構成・44世代・seed 42）:
 *
 *     noise=0.55 → 種牡馬プールSD 256.8 / CV 7.06% / 最大系統 28.0% / 5代内系統 14.03
 *     noise=0    → 種牡馬プールSD 246.4 / CV 6.70% / 最大系統 27.5% / 5代内系統 12.82
 *
 *   **何も守っていない**（登録簿に「0 にすると多様性が死ぬ」と書いたが、死ななかった）。
 *   説明が測定に支持されない以上、通るまで摂動値を弱めるのではなく定数ごと落とす。
 *   選抜の揺らぎは配合そのもの（§6.1 の分離・突然変異）が既に供給している。
 */

/** 引退年齢（この歳の終わりに現役を退き、成績上位が繁殖に上がる） */
export const PRESEED_RETIRE_AGE = 4;

/** 現役として数える最小年齢（正典 §10.4 のデビュー年齢） */
export const PRESEED_DEBUT_AGE = 2;

export interface PreseedOptions {
  readonly seed: number;
  /** 回す世代数（＝年数）。正典 §10.5 は 50 */
  readonly generations: number;
  /** 種牡馬プール頭数（§10.5: 200） */
  readonly stallions: number;
  /** 繁殖牝馬プール頭数（§10.5: 800） */
  readonly mares: number;
  readonly balance: BalanceConfig;
  readonly founders: FoundersConfig;
  readonly nicks: NicksTable;
  readonly stables: readonly Stable[];
  /**
   * 1厩舎あたりの創始父系ライン数。
   *
   * ⚠️ **導入時の根拠は実測で否定されています（正典 D-026）。**
   *   「創始系統を増やせば浮動に耐える」という想定で入れましたが、
   *   40 → 200 系統に増やしても 100世代の有効系統数は 1.27〜2.29 で変わりませんでした。
   *   律速は創始系統数ではなく**実際に種付けした種牡馬の数**（毎年40頭）です。
   *   また「配合を制限しないので近交は増えない」も D-027 で否定されました
   *   （近交回避は多様性の対抗力にならず、むしろ系統を1本へ収束させます）。
   *   つまみとしては残しますが、**系統多様性の手段として使わないでください。**
   */
  readonly linesPerStable: number;
  /** 実在競走馬名 NG 判定（憲法 §0.1）。**本番では必ず実物を注入する** */
  readonly blocklist: NameBlocklist;
}

/**
 * ニックステーブル（§6.6）。**本番テーブルは運営が別途定義する**ので、
 * ここは検証用の合成データを厩舎の父系ラインから作る。
 * N-4「ニックスが意味を持つ程度に系統が分散している」はこの表に対して測る。
 */
export function preseedNicks(
  seed: number,
  stables: readonly Stable[],
  linesPerStable = 1,
): NicksTable {
  // 系統を増やしたらニックス表も同じ系統集合で作る（表に無い系統は組が成立しない）
  const lines =
    linesPerStable <= 1
      ? stables.map((s) => `L-${s.id}`)
      : stables.flatMap((s) => Array.from({ length: linesPerStable }, (_, i) => `L-${s.id}-${i}`));
  return generateNicksTable(
    lines,
    deriveRng(seed, STREAM.NICKS),
    NICKS_GEN.HIT_RATIO,
    NICKS_GEN.MULT_MIN,
    NICKS_GEN.MULT_MAX,
  );
}

/**
 * ⚠️ `nicks` はここに置かない。既定値にすると**シードと無関係な固定表**になり、
 *    「同じシードから同じ血統プール」が nicks だけシードに追従しない状態になる。
 *    呼び出し側が `preseedNicks(seed, stables)` を渡すこと。
 */
export const DEFAULT_PRESEED_OPTIONS: Omit<PreseedOptions, 'seed' | 'blocklist' | 'nicks'> = {
  generations: 50,
  stallions: 200,
  mares: 800,
  balance: DEFAULT_BALANCE,
  founders: FOUNDERS,
  stables: NPC_STABLES,
  linesPerStable: 1,
};

export interface PreseedHorse {
  readonly record: HorseRecord;
  readonly name: string;
  readonly stableId: string;
}

export interface PreseedWorld {
  /** これまでに生まれた全馬（血統を辿るため保持する。5代 = 最大62頭の祖先が要る） */
  readonly all: Map<string, PreseedHorse>;
  readonly stallionIds: string[];
  readonly mareIds: string[];
  /** 現役（デビュー〜引退年齢） */
  readonly activeIds: string[];
  /** 最終年 */
  readonly year: number;
}

function abilityTotal(h: HorseRecord): number {
  let total = 0;
  for (const k of ABILITY_KEYS) total += h.potential[k];
  return total;
}








/**
 * N-3 の初期値の提案。
 *
 * §10.5 は `NPC平均 = プレイヤー上位30%の平均 × 0.92` と定めるが、
 * **プリシード時点ではプレイヤーが存在しない**。
 * 別基準を持ち込むと「NPC がどのくらい強いか」が正典から辿れなくなるので、
 * **創始定義（P0 §6.4）から出す**: 創始集団の上位30%の平均 × 0.92 を初期目標とする。
 * → 週次再較正が始まればプレイヤー側の値に置き換わり、この初期値は使われなくなる。
 */
export const NPC_FOLLOW_COEFFICIENT = 0.92;
export const NPC_FOLLOW_TOP_RATIO = 0.3;

export function npcTargetFrom(scores: readonly number[]): number {
  if (scores.length === 0) return 0;
  const sorted = scores.slice().sort((a, b) => b - a);
  const n = Math.max(1, Math.ceil(sorted.length * NPC_FOLLOW_TOP_RATIO));
  const top = sorted.slice(0, n);
  return (top.reduce((a, b) => a + b, 0) / n) * NPC_FOLLOW_COEFFICIENT;
}

/** 世代ごとの記録（報告と N-4 の検証に使う） */
export interface PreseedYearStat {
  readonly year: number;
  readonly foals: number;
  readonly active: number;
  readonly meanAbility: number;
  readonly npcTarget: number;
  /** 種牡馬プールに存在する父系ラインの数 */
  readonly sireLines: number;
  /** ★合格基準3（改訂）: 有効系統数 1/Σshare²。本数と違い偏りで下がる */
  readonly effectiveSireLines: number;
  /**
   * ★その年に実際に種付けした種牡馬の数。
   *   父系ラインの浮動の速さを決めるのは**プールの頭数ではなくここ**（父方の有効個体数）。
   *   プールが200頭でも、実際に使われるのが40頭なら Ne は 40 で計算される。
   */
  readonly siresUsed: number;
}

export interface PreseedResult {
  readonly world: PreseedWorld;
  readonly years: readonly PreseedYearStat[];
  readonly options: PreseedOptions;
}

export function runPreseed(opts: PreseedOptions): PreseedResult {
  const { balance, founders, nicks, stables } = opts;
  const all = new Map<string, PreseedHorse>();
  const takenNames = new Set<string>();
  const stableOf = new Map<string, Stable>();
  const years: PreseedYearStat[] = [];

  const lookup = (id: string): HorseRecord | undefined => all.get(id)?.record;

  // --- 創始世代 ---
  // MIN_BREEDING_AGE_YEARS を満たすよう、創始馬は年0より前に生まれたことにする
  const founderYear = -balance.MIN_BREEDING_AGE_YEARS;
  const founderRng = deriveRng(opts.seed, STREAM.FOUNDER, 0);
  const nameRng = deriveRng(opts.seed, STREAM.NAMING, 0);
  let serial = 0;

  const addFounder = (sex: 'male' | 'female', stable: Stable, lineIndex: number): string => {
    serial += 1;
    const id = `NPC-F${String(serial).padStart(5, '0')}`;
    const record = createFounder({
      id,
      sex,
      // 父系ラインを厩舎ごとに分ける ＝ N-4「父系ラインが分散している」の出発点
      sireLine:
        opts.linesPerStable <= 1
          ? `L-${stable.id}`
          : `L-${stable.id}-${lineIndex % opts.linesPerStable}`,
      birthYear: founderYear,
      rng: founderRng,
      balance,
      founders,
    });
    const { name } = generateHorseName(
      nameRng,
      { ...DEFAULT_NAME_SHAPE, prefix: stable.prefix },
      takenNames,
      opts.blocklist,
    );
    all.set(id, { record, name, stableId: stable.id });
    stableOf.set(id, stable);
    return id;
  };

  const stallionIds: string[] = [];
  const mareIds: string[] = [];
  for (let i = 0; i < opts.stallions; i += 1) {
    stallionIds.push(
      addFounder('male', stables[i % stables.length] as Stable, Math.floor(i / stables.length)),
    );
  }
  for (let i = 0; i < opts.mares; i += 1) {
    mareIds.push(
      addFounder('female', stables[i % stables.length] as Stable, Math.floor(i / stables.length)),
    );
  }

  let activeIds: string[] = [];
  /** 引退待ちの各年コホート（年 → 馬ID） */
  const cohorts = new Map<number, string[]>();
  /** 引退したが繁殖年齢（MIN_BREEDING_AGE_YEARS）に達していない馬 */
  let pending: string[] = [];

  for (let year = 1; year <= opts.generations; year += 1) {
    // 1. 年次カウンタのリセット
    for (const id of mareIds) {
      const h = all.get(id);
      if (h) h.record.bredThisYear = false;
    }
    for (const id of stallionIds) {
      const h = all.get(id);
      if (h) h.record.coveringsThisYear = 0;
    }

    // 3. 配合。牝馬ごとに、**自厩舎の方針で最も高く評価される**種牡馬を選ぶ
    const matingRng = deriveRng(opts.seed, STREAM.MATING, year);
    const foalIds: string[] = [];
    const usedSires = new Set<string>();
    /**
     * ★**厩舎ごとの**カウンタ。最初は全厩舎で共有していたが、それだと厩舎をまたいで
     *   同じ強い種牡馬に集中し、有効系統数が 8.83 → 1.95 と**悪化した**（y50・seed42）。
     *   候補は厩舎の評価軸で並べているので、ずらすのも厩舎の中でなければ意味がない。
     */
    const mareTurn = new Map<string, number>();

    // ★近交回避（F-1）の計算量対策: 祖先ID → その祖先を持つ種牡馬 の逆引き索引。
    //   素直に書くと 800牝馬 × 200種牡馬 の集合照合が毎年走る（50世代で 800万回）。
    //   索引は年に1回・種牡馬200頭ぶんだけ作ればよい。
    const sireIdsByAncestor = new Map<string, string[]>();
    for (const sid of stallionIds) {
      const rec = all.get(sid)!.record;
      // 種牡馬自身も牝馬の祖先になり得る
      for (const aid of [rec.id, ...rec.pedigreeCache.keys()]) {
        const list = sireIdsByAncestor.get(aid);
        if (list === undefined) sireIdsByAncestor.set(aid, [sid]);
        else list.push(sid);
      }
    }
    for (const mareId of mareIds) {
      const mare = all.get(mareId)!;
      const stable = stableOf.get(mareId) ?? (stables[0] as Stable);
      // 厩舎の評価軸で上位 SIRE_CHOICE_TOP_K 頭を候補にし、牝馬ごとに順番に割り振る。
      // 1頭に絞ると父方の有効個体数が厩舎数まで落ちる（実測: 毎年40頭）。
      const ranked: { id: string; score: number }[] = [];
      // ★共通祖先を1頭も持たない相手は F=0 と**確定する**ので経路計算をしない。
      //   近似ではなく厳密な絞り込み（索引に載らない = 共通祖先なし = F=0）。
      const related = new Set<string>();
      for (const aid of mare.record.pedigreeCache.keys()) {
        for (const sid of sireIdsByAncestor.get(aid) ?? []) related.add(sid);
      }
      // 牝馬自身も共通祖先になり得る（父×娘）
      for (const sid of sireIdsByAncestor.get(mare.record.id) ?? []) related.add(sid);

      for (const sid of stallionIds) {
        const sire = all.get(sid)!.record;
        if (!canMate(sire, mare.record, balance, year).ok) continue;
        // ★F-1: 近交係数を**決定経路で**参照する（R-17: 監査で見ているだけでは保存されない）
        // ⚠️ ここに (種牡馬, 牝馬) → F のキャッシュを置いたが**遅くなった**（7.7s → 11.0s）。
        //    同じ組は年内に一度しか評価されないのでヒットせず、Map の overhead だけが乗る。
        //    「繰り返し計算しているはず」という見立てが実測で否定されたので外した。
        const f = related.has(sid)
          ? calcInbreedCoefficient(sire, mare.record, lookup, balance.PEDIGREE_DEPTH).F
          : 0;
        ranked.push({
          id: sid,
          score: mateScoreWithInbreeding(sire, stable, f, stableOf.get(sid)?.id === stable.id),
        });
      }
      if (ranked.length === 0) continue; // 相手がいない年は産まない（黙って規則を曲げない）
      ranked.sort((a, b) => (b.score !== a.score ? b.score - a.score : a.id.localeCompare(b.id)));
      const turn = mareTurn.get(stable.id) ?? 0;
      mareTurn.set(stable.id, turn + 1);
      const pick = ranked[(turn % SIRE_CHOICE_TOP_K) % ranked.length]!;
      const best: string = pick.id;

      const sire = all.get(best)!.record;
      serial += 1;
      const id = `NPC-${String(year).padStart(2, '0')}-${String(serial).padStart(6, '0')}`;
      const record = breed({
        id,
        sire,
        dam: mare.record,
        seed: matingRng.nextUint32(),
        generation: Math.max(sire.generation, mare.record.generation) + 1,
        birthYear: year,
        lookup,
        balance,
        nicks,
      });
      usedSires.add(best);
      applyMatingCounters(sire, mare.record);
      const { name } = generateHorseName(
        nameRng,
        { ...DEFAULT_NAME_SHAPE, prefix: stable.prefix },
        takenNames,
        opts.blocklist,
      );
      all.set(id, { record, name, stableId: stable.id });
      stableOf.set(id, stable);
      foalIds.push(id);
    }
    cohorts.set(year, foalIds);

    // 4. 現役プール = デビュー年齢〜引退年齢のコホート
    activeIds = [];
    for (let age = PRESEED_DEBUT_AGE; age <= PRESEED_RETIRE_AGE; age += 1) {
      for (const id of cohorts.get(year - age) ?? []) activeIds.push(id);
    }

    // 5. 引退 → 待機 → 繁殖年齢に達した年にプールへ（§10.5）
    promoteEligible(year);
    const retiring = cohorts.get(year - PRESEED_RETIRE_AGE) ?? [];
    if (retiring.length > 0) {
      retire(retiring);
      // 引退済みコホートは以後の現役計算に要らない。血統は `all` に残る
      cohorts.delete(year - PRESEED_RETIRE_AGE);
    }

    const abilities = activeIds.map((id) => abilityTotal(all.get(id)!.record));
    years.push({
      year,
      foals: foalIds.length,
      active: activeIds.length,
      meanAbility: abilities.length ? abilities.reduce((a, b) => a + b, 0) / abilities.length : 0,
      npcTarget: npcTargetFrom(abilities),
      sireLines: new Set(stallionIds.map((id) => all.get(id)!.record.sireLine)).size,
      siresUsed: usedSires.size,
      effectiveSireLines: lineConcentration(
        stallionIds.map((id) => all.get(id)!.record.sireLine),
      ).effective,
    });
  }

  return {
    world: { all, stallionIds, mareIds, activeIds, year: opts.generations },
    years,
    options: opts,
  };

  /**
   * 引退馬を繁殖プールへ上げる（§10.5）。
   *
   * ★試走で見つけた欠陥2件を踏まえた構造:
   *
   *   (a) **プールを全厩舎で共有すると父系ラインが減る**（8世代で 40 → 24）。
   *       選抜が強い系統を全厩舎で取り合うので弱い系統が消える。50世代なら数系統に潰れ、
   *       N-4 の分散基準にもニックス（§6.6）にも落ちる。→ **厩舎ごとに枠を切る**。
   *       ⚠️ これで「父系ラインが分散している」は**構造的に保証される**ので、
   *          N-4 をその数だけで測っても意味がない（測る前から通る）。
   *          保証されないほう ＝ 1頭の5代血統に何系統が現れるか を測ること。
   *
   *   (b) **引退（4歳）と繁殖可能年齢（6歳）に2年のずれがある**。
   *       引退直後の馬でプールを入れ替えると、その厩舎に種付けできる馬が一頭もいなくなり、
   *       産駒が 0 になった（試走で実際に year 6 以降 foals=0）。
   *       → 引退馬は**待機させ、繁殖年齢に達した年にプールへ上げる**。
   *       ⚠️ MIN_BREEDING_AGE_YEARS を下げて回避しない。エンジンの規則を曲げた時点で
   *          「プレイヤー馬と同一の遺伝エンジン」（§10.5）が崩れる。
   */
  function retire(retiring: readonly string[]): void {
    for (const id of retiring) {
      const h = all.get(id);
      if (!h) continue;
      pending.push(id);
    }
  }

  /** 待機中の引退馬のうち繁殖年齢に達したものをプールへ上げる */
  function promoteEligible(year: number): void {
    const eligible = pending.filter((id) => {
      const r = all.get(id)?.record;
      return r !== undefined && year - r.birthYear >= balance.MIN_BREEDING_AGE_YEARS;
    });
    if (eligible.length === 0) return;
    // 上げそこねた馬を待機に残し続けると際限なく溜まるので、この年で判断を打ち切る
    const eligibleSet = new Set(eligible);
    pending = pending.filter((id) => !eligibleSet.has(id));

    fill(eligible, 'male', stallionIds, opts.stallions);
    fill(eligible, 'female', mareIds, opts.mares);
  }

  function fill(eligible: readonly string[], sex: 'male' | 'female', pool: string[], size: number): void {
    const perStable = Math.max(1, Math.floor(size / stables.length));
    const rank = (id: string): number => {
      const h = all.get(id);
      if (!h) return -Infinity;
      return stableScore(h.record, stableOf.get(id) ?? (stables[0] as Stable));
    };
    const sortByRank = (ids: readonly string[]): string[] =>
      ids.slice().sort((a, b) => (rank(b) !== rank(a) ? rank(b) - rank(a) : a.localeCompare(b)));
    const ofStable = (ids: readonly string[], stableId: string): string[] =>
      sortByRank(ids.filter((id) => stableOf.get(id)?.id === stableId));

    const cands = eligible.filter((id) => all.get(id)?.record.sex === sex);
    const next: string[] = [];
    for (const st of stables) {
      // 生涯産駒数を使い切った牝馬は抜ける
      const survivors = ofStable(
        pool.filter((id) => {
          const r = all.get(id)?.record;
          if (!r) return false;
          return sex === 'female' ? r.foalCount < balance.MARE_LIFETIME_FOALS : true;
        }),
        st.id,
      );
      const incoming = ofStable(cands, st.id);
      // 入れ替えは**手元にいる分だけ**。無理に空けると種付けできる馬がいなくなる（欠陥 b）
      const replace = Math.min(incoming.length, Math.max(0, perStable - survivors.length) + Math.ceil(perStable * 0.2));
      const keep = survivors.slice(0, Math.max(0, perStable - replace));
      next.push(...keep, ...incoming.slice(0, perStable - keep.length));
    }
    pool.length = 0;
    pool.push(...next);
  }
}
