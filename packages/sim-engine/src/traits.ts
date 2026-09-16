/**
 * ★**先天個性・後天特性**（★ゲーム本体 第 4 便・2026-09-16・正典 **D-109**・相談 HL-5・裁定 §2）
 *
 * 【★この便では着順に効かせません】
 *   ★`TRAIT_EFFECT` は ★**0 の定数**です。★効かせる便で ★V-4・V-5・V-6・V-17 を取り直します。
 *   ★**繊細（馬群で力を出しにくい）を効かせるなら V-18 ①②a②b も**取り直します（★裁定 2-1）。
 *   ★接続の前後で対照が取れるよう、★**先に「効果 0 で入っている」状態**を作ります。
 *
 * 【★D-109 の手順】
 *   ① ★効果 0 の便では ★**実際に `resolveRace` を回して 1 ビット不変を示す**
 *      （★定数が 0 なだけを根拠にしない・`jockey-no-effect` と同じ形）
 *   ② ★**後天特性はレース結果から決定論で導く**（★新しい乱数を引かない・D-061）
 *
 * 【★遺伝について — ★この便の決め】
 *   ★**先天個性に `genotype` の新しい行を作りません。** ★既存の発現値
 *   （★道悪適性・気性・根性・賢さ）から ★**決定論で導きます**。
 *   → ★だから ★**§5.4 を触らずに済み**、★V-1・V-2a〜V-2e を取り直さずに済みます
 *     （★既存の形質を通して ★**自然に遺伝します**）。
 *   ⚠️ ★裁定 2-2 ① は「★**遺伝させるかどうかを先に決める**」と言っています。
 *      → ★**照会 Q-GB4-1 として出しています。** ★独立した遺伝の行にする裁定が出たら、
 *        ★**§5.2 と §5.4 の両方**を更新し（★片方だけにした D-015 の再発防止）、V-1・V-2 系を取り直します。
 *
 * 【★この層の約束】★依存ゼロ・純粋関数。★`Date.now()` も乱数も持ちません（★憲法 4）。
 *   ★実在の人名・団体名を入れません（§0.1）。
 */

/** ★先天個性（★生まれ持った性質・D-109 の 4 つ） */
export type InnateTrait =
  | 'mud'          // 泥巧者
  | 'competitive'  // 負けず嫌い
  | 'delicate'     // 繊細
  | 'quick-start'; // 好スタート

/** ★後天特性（★経験で身につく・D-109 の 3 つ） */
export type LearnedTrait =
  | 'long-distance' // 長距離経験
  | 'big-stage'     // 大舞台経験
  | 'bonded';       // 名コンビ

export type TraitId = InnateTrait | LearnedTrait;

export const INNATE_TRAITS: readonly InnateTrait[] = ['mud', 'competitive', 'delicate', 'quick-start'];
export const LEARNED_TRAITS: readonly LearnedTrait[] = ['long-distance', 'big-stage', 'bonded'];

/** ★画面に出す名前（★文字列。★実在の人名・団体名を入れない・§0.1） */
export const TRAIT_LABEL: Readonly<Record<TraitId, string>> = {
  mud: '泥巧者',
  competitive: '負けず嫌い',
  delicate: '繊細',
  'quick-start': '好スタート',
  'long-distance': '長距離経験',
  'big-stage': '大舞台経験',
  bonded: '名コンビ',
};

/**
 * ★**着順への効果**（★この便は 0）。
 * ⚠️ ★**0 であることを検査が固定します**（★`trait-no-effect.test.ts` の対照）。
 *    ★ここを 0 でない値にする便では、★介入の ±10%（`INTERVENTION_CAP`・§1.5-1）と
 *    ★突き合わせて上限を決め、★V-4・V-5・V-6・V-17（★繊細なら ＋V-18 ①②a②b・
 *    ★泥巧者なら ＋V-2f）を取り直します（D-109）。
 */
export const TRAIT_EFFECT = 0;

/** ★効果を引く口（★この便はどの特性でも 0 を返します） */
export function traitEffectOf(_trait: TraitId): number {
  return TRAIT_EFFECT;
}

// ---------------------------------------------------------------------------
// ★先天個性（★既存の発現値から導く）
// ---------------------------------------------------------------------------

/**
 * ★**先天個性が付く境目**。
 * ⚠️ ★較正値ではなく ★**「どの馬を個性持ちと呼ぶか」の線**です。★この便では ★**着順に入りません**。
 *    ★動かすと ★「個性持ちの割合」だけが変わります（★効かせる便で、割合込みで V を取り直します）。
 * ⚠️ ★道悪適性・気性は 0〜100、★根性・賢さは 0〜1000（★正典 §5.1・§5.2 の値域）。
 */
export const INNATE_THRESHOLDS = {
  /** ★泥巧者 … 道悪適性（0〜100） */
  mud: 70,
  /** ★負けず嫌い … 根性 GT（0〜1000） */
  competitive: 700,
  /** ★繊細 … 気性（0〜100・★高いほど気性難） */
  delicate: 70,
  /** ★好スタート … 賢さ IQ（0〜1000） */
  quickStart: 700,
} as const;

/**
 * ★先天個性の入力。
 * ⚠️ ★**`potential` を受け取りません**（★素質そのものを見ない・D-108 ③ と同じ「入力の形」）。
 *    ★見るのは ★**発現している値**（`phenotype.ts` が出したもの）だけです。
 */
export interface InnateInput {
  /** ★道悪適性 0〜100（§5.2・D-015） */
  readonly heavyAptitude: number;
  /** ★気性 0〜100（★高いほど気性難・§5.2） */
  readonly temper: number;
  /** ★根性 GT 0〜1000（§5.1） */
  readonly gt: number;
  /** ★賢さ IQ 0〜1000（§5.1） */
  readonly iq: number;
}

/**
 * ★**先天個性を導く**（★決定論・★乱数を引かない）。
 * ⚠️ ★**返す順は `INNATE_TRAITS` の順**（★入力の順や集合の反復順に依存しない）。
 */
export function innateTraitsOf(h: InnateInput): readonly InnateTrait[] {
  const out: InnateTrait[] = [];
  if (h.heavyAptitude >= INNATE_THRESHOLDS.mud) out.push('mud');
  if (h.gt >= INNATE_THRESHOLDS.competitive) out.push('competitive');
  if (h.temper >= INNATE_THRESHOLDS.delicate) out.push('delicate');
  if (h.iq >= INNATE_THRESHOLDS.quickStart) out.push('quick-start');
  return out;
}

// ---------------------------------------------------------------------------
// ★後天特性（★レースの履歴から導く・D-109 ②）
// ---------------------------------------------------------------------------

/**
 * ★**「長距離」と呼ぶ距離**［m］。
 * ⚠️ ★較正値ではなく ★**区切りの定義**。★正典 §10.2 の距離区分の写しの延長で、
 *    ★この便では ★**着順に入りません**。
 */
export const LONG_DISTANCE_M = 2200;

/**
 * ★**後天特性が付くのに要る回数**。
 * ⚠️ ★較正値ではなく ★**「何回でその経験と呼ぶか」の刻み**（★`DISCOVERY_STEPS` と同じ性質）。
 * ⚠️ ★`bond` は ★**騎手の親密度の頭打ち**（`JOCKEY_BOND_MAX` ＝ 5）と ★**同じ数**です。
 *    ★二重帳簿にしないため、★呼ぶ側が親密度を渡します（★ここで騎手の名簿を引きません）。
 */
export const LEARNED_STEPS = {
  /** ★長距離経験 … 長距離の出走回数 */
  longDistance: 3,
  /** ★大舞台経験 … 重賞の出走回数 */
  bigStage: 3,
  /** ★名コンビ … 同じ騎手での騎乗回数（★親密度の上限と同じ数） */
  bonded: 5,
} as const;

/**
 * ★後天特性の入力（★**すべてレース結果から数えられる値**・D-109 ②）。
 * ⚠️ ★**新しい乱数を引きません**（★D-061）。★数えるのはレースが終わった後です（★§18 LR-7）。
 */
export interface CareerInput {
  /** ★長距離（`LONG_DISTANCE_M` 以上）の出走回数 */
  readonly longRuns: number;
  /** ★重賞の出走回数 */
  readonly gradedRuns: number;
  /** ★**同じ騎手**での騎乗回数（★いちばん多い騎手の回数） */
  readonly topJockeyRides: number;
}

/**
 * ★**出走の履歴から後天特性の入力を数える**（★決定論）。
 * ⚠️ ★`distancesM` と `graded` は ★**同じレースの列**（★長さが違えば誤り）。
 * ⚠️ ★騎手は ★**出走登録で凍結した id** を渡します（★名簿を引き直さない・D-105 ④）。
 */
export function careerInputOf(
  runs: readonly { readonly distanceM: number; readonly graded: boolean; readonly jockeyId: string }[],
): CareerInput {
  let longRuns = 0;
  let gradedRuns = 0;
  const rides = new Map<string, number>();
  for (const r of runs) {
    if (r.distanceM >= LONG_DISTANCE_M) longRuns += 1;
    if (r.graded) gradedRuns += 1;
    rides.set(r.jockeyId, (rides.get(r.jockeyId) ?? 0) + 1);
  }
  let topJockeyRides = 0;
  for (const n of rides.values()) if (n > topJockeyRides) topJockeyRides = n;
  return { longRuns, gradedRuns, topJockeyRides };
}

/**
 * ★**後天特性を導く**（★決定論・★乱数を引かない）。
 * ⚠️ ★**返す順は `LEARNED_TRAITS` の順**。
 */
export function learnedTraitsOf(c: CareerInput): readonly LearnedTrait[] {
  const out: LearnedTrait[] = [];
  if (c.longRuns >= LEARNED_STEPS.longDistance) out.push('long-distance');
  if (c.gradedRuns >= LEARNED_STEPS.bigStage) out.push('big-stage');
  if (c.topJockeyRides >= LEARNED_STEPS.bonded) out.push('bonded');
  return out;
}

/**
 * ★**その馬の特性ぜんぶ**（★先天 → 後天の順）。
 * ⚠️ ★**着順には入りません**（★この便は効果 0）。★画面と物語（§18）のための値です。
 */
export function traitsOf(innate: InnateInput, career: CareerInput): readonly TraitId[] {
  return [...innateTraitsOf(innate), ...learnedTraitsOf(career)];
}

/**
 * ★**新しく身についた後天特性**（★物語に 1 行残すかの判定・§18 LR-7）。
 * ⚠️ ★**レースが終わった後に呼びます**（★ゴールより前に結果を読む値を作らない・D-098 の家族）。
 */
export function learnedTraitsGained(before: CareerInput, after: CareerInput): readonly LearnedTrait[] {
  const had = new Set(learnedTraitsOf(before));
  return learnedTraitsOf(after).filter((t) => !had.has(t));
}
