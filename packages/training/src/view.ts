/**
 * ★**調教の画面に出す値**（★GB-1・2026-09-16・正典 §7.2 の註記・D-101）
 *
 * 【★なぜエンジン側に置くか】
 *   ★画面・監査の道具・検査が ★**同じ関数**を引くためです（★D-052・R-30）。
 *   ★画面側に同じ式を書くと、★片方だけ直した日に離れます（★台帳 B-5）。
 *   ⚠️ ★層の向きは ★`画面 → @star/training` の一方向です（★ここから画面を引きません）。
 *
 * 【★`potential` を出さない】（★正典 §5.5・§12.4・D-101 の註記）
 *   ⚠️ ★**素質は本人にも数値で見せません。** ★だから ★この関数は ★**`stats` と調子しか受け取りません。**
 *   ★「上限までの割合」も受け取りません（★割合は `potential` を割り戻せば数値が復元できるため）。
 *   ★★の判定は ★**禁止語の走査ではなく入力の形**で見ます（★D-098 の検査で踏んだ穴と同じ形にしない）。
 */

import type { AbilityKey } from '@star/sim-engine';

/** ★能力の見せ方の最大値（★正典 §5 の能力は 0〜1000 の目盛り） */
export const TRAINING_BAR_MAX = 1000;
/** ★調子の段階（★正典 §7.4 の 1〜5） */
export const CONDITION_STEPS = 5;

export type TrainingBarKind = 'ability' | 'state';

export interface TrainingBar {
  readonly key: string;
  readonly label: string;
  /** ★能力は 0〜`TRAINING_BAR_MAX`、★調子は 1〜`CONDITION_STEPS` */
  readonly value: number;
  readonly max: number;
  /** ★`ability` ＝ 伸ばすもの ／ ★`state` ＝ その週の状態（★能力ではない） */
  readonly kind: TrainingBarKind;
}

/**
 * ★**調教の画面の 3 本のバー**（★スピード・スタミナ・コンディション）。
 *
 * ⚠️ ★コンディション（調子）は ★**能力ではなく状態**なので、★`kind: 'state'` で分けて返します
 *    （★同じ物差しに並べると「調子も鍛えて伸ばすもの」に見えるため）。
 * ⚠️ ★引数は ★**`stats` と調子だけ**です（★`potential` も「上限までの割合」も受け取りません）。
 */
export function trainingBarsOf(
  stats: Readonly<Record<AbilityKey, number>>,
  condition: number,
): readonly TrainingBar[] {
  return [
    { key: 'sp', label: 'スピード', value: stats.sp, max: TRAINING_BAR_MAX, kind: 'ability' },
    { key: 'st', label: 'スタミナ', value: stats.st, max: TRAINING_BAR_MAX, kind: 'ability' },
    { key: 'condition', label: 'コンディション', value: condition, max: CONDITION_STEPS, kind: 'state' },
  ];
}

/**
 * ★**出走の前の週・後の週**（★D-101「画面の導線で強調する」）。
 *
 * ★`weeksToNextRace` … ★次走までの週数（★今週が出走週なら 0・★予定が無ければ `null`）
 * ★`weeksSinceLastRace` … ★前走からの週数（★まだ走っていなければ `null`）
 * ⚠️ ★**週の進み方は変えません。** ★どの週かを言うだけです。
 */
export type RaceWeekMark = 'before-race' | 'after-race' | 'race-week' | 'none';

export function raceWeekMarkOf(
  weeksToNextRace: number | null,
  weeksSinceLastRace: number | null,
): RaceWeekMark {
  if (weeksToNextRace === 0) return 'race-week';
  if (weeksToNextRace === 1) return 'before-race';
  if (weeksSinceLastRace === 1) return 'after-race';
  return 'none';
}

/**
 * ★**調教の結果の段**（★D12-2・デザイナーのカード `components/training-result`・2026-09-16）
 *
 * 【★新しい抽選を足していません】（★正典 D-101）
 *   ★見ているのは ★**既存の伸びの乱数**（`GAIN_JITTER` ＝ 0.85〜1.15）の**上側だけ**です。
 *   ★`rng.range` は一様なので、★割合は境目から計算だけで出ます:
 *     ★**GREAT 6.67%**（15 週に 1 回）／★**UP 10.00%**（10 週に 1 回）／通常 83.33%
 *
 * ⚠️ ★**境目を画面に持たせません。** ★画面はこの関数を呼ぶだけです（★D-052・二重帳簿にしない）。
 * ⚠️ ★**較正定数ではありません** — ★動かすと「良い報せ」の頻度が変わるだけで、
 *    ★伸びそのもの（V-14）は 1 ビットも動きません。
 */
export type TrainingResultTier = 'great' | 'up' | 'normal';

export const TRAINING_RESULT_THRESHOLDS = {
  /** ★これ以上で GREAT（★上位 6.67%） */
  great: 1.13,
  /** ★これ以上で UP（★次の 10.00%） */
  up: 1.10,
} as const;

export function trainingResultTierOf(jitter: number): TrainingResultTier {
  if (jitter >= TRAINING_RESULT_THRESHOLDS.great) return 'great';
  if (jitter >= TRAINING_RESULT_THRESHOLDS.up) return 'up';
  return 'normal';
}

export const TRAINING_RESULT_LABEL: Readonly<Record<TrainingResultTier, string>> = {
  great: '絶好調の仕上がり',
  up: '良い仕上がり',
  normal: '通常の仕上がり',
};

/**
 * ★**「N 週続けて」の N**（★デザイナーが **2026-09-16 に 2 週へ確定**）。
 *
 * 【★なぜ 3 週ではないか】★UP 以上は 16.7% なので
 *   ★**3 週連続は 0.46%（約 216 週に 1 回）** — ★現役 182 週では ★**1 回も出ない馬が多数**です。
 *   ★**2 週なら 2.8%（36 週に 1 回）**で、★1 頭の生涯に数回は出ます。
 *   → ★開発側が実測を出し、★デザイナーが 2 週を採り、★カードの文言も「2週続けて」に直りました。
 *
 * ⚠️ ★**画面に週数を書かないこと**（★D-052。★ここが唯一の出どころです）。
 * ⚠️ ★較正定数ではありません — ★動かすと ★**バッジの出る頻度だけ**が変わり、
 *    ★伸びそのもの（V-14）は 1 ビットも動きません。
 */
export const TRAINING_STREAK_WEEKS = 2;

/**
 * ★**続けて良い仕上がりだったか**（★デザイナーのカードの「N 週続けて」バッジ）。
 *
 * ⚠️ ★**週数はここで決め打ちしません** — ★`need` は呼ぶ側が渡します
 *    （★既定は `TRAINING_STREAK_WEEKS`。★2 週か 3 週かはデザイナーの判断で、
 *    ★この関数の性質ではありません）。
 * ★`recent` … ★直近の段（★**新しいものが先頭**）。
 */
export function trainingStreakOf(recent: readonly TrainingResultTier[], need: number): boolean {
  if (need <= 0 || recent.length < need) return false;
  return recent.slice(0, need).every((t) => t !== 'normal');
}

export const RACE_WEEK_LABEL: Readonly<Record<RaceWeekMark, string | null>> = {
  'race-week': '今週が出走',
  'before-race': '次走の前の調教',
  'after-race': '次走の後の調教',
  none: null,
};
