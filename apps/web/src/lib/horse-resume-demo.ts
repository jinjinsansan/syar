/**
 * ★**履歴書型の馬詳細のデモデータ**（★D13-2・2026-09-16・デザイナーのカード `components/horse-resume`）
 *
 * 【★このファイルが持たないもの】
 *   ⚠️ ★**どの個性が付くかを持ちません。** ★持つのは ★**発現値と出走の履歴**だけで、
 *      ★個性は `@star/sim-engine` の `innateTraitsOf` / `learnedTraitsOf` が ★**導きます**
 *      （★正典 D-109。★ここに「繊細」と書くと、★境目を動かした日に画面だけ古くなります）。
 *   ⚠️ ★**文を持ちません**（★§18 LR-4。★物語の文は `storyLinesOf` が組み立てます）。
 *   ⚠️ ★**素質（`potential`）を持ちません**（★§5.5・§12.4。★出せるのは★と段だけ）。
 *
 * ★本番は ★**サーバーが返す値**です（★画面を実データに繋ぐのは別の便）。
 */

import type { StoryEvent } from '@star/training';
import type { InnateInput } from '@star/sim-engine';

/**
 * ★**先天個性の入力**（★発現している値だけ・`innateTraitsOf` に渡します）。
 * ★この見本は ★**好スタート（賢さ）と繊細（気性）が付き、泥巧者・負けず嫌いは付かない**値です
 *   — ★境目の両側が 1 頭で見えるように選んでいます（★R-2）。
 * ⚠️ ★境目の数（70・700）は ★**ここに書きません**（★`INNATE_THRESHOLDS` が持っています）。
 */
export const DEMO_INNATE_INPUT: InnateInput = {
  heavyAptitude: 55,
  temper: 74,
  gt: 655,
  iq: 721,
};

/**
 * ★**出走の履歴**（★`careerInputOf` に渡すと後天特性が導かれます）。
 * ★この見本は ★**大舞台経験（重賞 3 走）と名コンビ（同じ騎手 6 走）が付き、長距離経験は付かない**列です。
 * ⚠️ ★回数の境目（3・3・5）は ★**ここに書きません**（★`LEARNED_STEPS` が持っています）。
 */
export const DEMO_CAREER_RUNS: readonly { readonly distanceM: number; readonly graded: boolean; readonly jockeyId: string }[] = [
  { distanceM: 1600, graded: false, jockeyId: 'j-aoi' },
  { distanceM: 1400, graded: false, jockeyId: 'j-aoi' },
  { distanceM: 1600, graded: false, jockeyId: 'j-kurata' },
  { distanceM: 1800, graded: false, jockeyId: 'j-kurata' },
  { distanceM: 1600, graded: true, jockeyId: 'j-aoi' },
  { distanceM: 1800, graded: false, jockeyId: 'j-aoi' },
  { distanceM: 2000, graded: false, jockeyId: 'j-kurata' },
  { distanceM: 1600, graded: true, jockeyId: 'j-aoi' },
  { distanceM: 2400, graded: false, jockeyId: 'j-kurata' },
  { distanceM: 1600, graded: false, jockeyId: 'j-kurata' },
  { distanceM: 1800, graded: false, jockeyId: 'j-aoi' },
  { distanceM: 1600, graded: true, jockeyId: 'j-shinozaki' },
];

/**
 * ★**主戦騎手**（★いちばん多く乗った騎手の id と、★その馬での騎乗回数）。
 * ⚠️ ★**名前も料金も持ちません**（★名簿は `@star/scheduler` の `JOCKEYS` が正・D-105）。
 * ⚠️ ★**親密度もここで決めません**（★`jockeyBondAfterRides` が回数から決めます）。
 */
export const DEMO_TOP_JOCKEY = { id: 'j-aoi', rides: 6 } as const;

/**
 * ★**生涯のピーク**（★カードの「生涯のピーク　スピード帯」）。
 * ⚠️ ★**数値の絶対値ではなく帯の名前**です（★★と同じく数値化しない・カードの指定）。
 * ⚠️ ★本番はサーバーが返します（★画面で `stats` の最大値を取って作らない）。
 */
export const DEMO_PEAK_BAND_LABEL = 'スピード';

/**
 * ★**子孫**（★2 代まで・カードの指定）。
 * ★子がいない世代は ★**空の配列**にします（★画面は「まだいません」の 1 行だけを出す）。
 */
export interface ResumeOffspring {
  readonly name: string;
  /** ★性齢と現況（★強さに関わる値は出しません） */
  readonly note: string;
}

export const DEMO_OFFSPRING: Readonly<Record<string, readonly (readonly ResumeOffspring[])[]>> = {
  /** ★1 代目（産駒）・2 代目（孫） */
  h1: [
    [
      { name: 'ハツユキノオト', note: '牝1・現役' },
      { name: 'ワカクサマル', note: '牡2・現役' },
    ],
    [],
  ],
};

/** ★世代の見出し（★1 代目・2 代目の順） */
export const OFFSPRING_GENERATION_LABEL: readonly string[] = ['産駒（1代目）', '孫（2代目）'];

/**
 * ★**その馬の出来事**（★物語タブの元データ）。
 * ⚠️ ★**文を書きません**（★種類と値だけ・§18 LR-4）。
 * ⚠️ ★**現役の馬なので引退の行はありません**（★引退した馬は `/stable/retired` の棚に移ります・LR-1）。
 */
export const DEMO_RESUME_STORY: Readonly<Record<string, readonly StoryEvent[]>> = {
  h1: [
    { type: 'birth', week: 12 },
    { type: 'first-training', week: 60 },
    { type: 'debut', week: 236, raceName: 'R5655', finishPosition: 12 },
    { type: 'first-win', week: 236, raceName: 'R5655', finishPosition: 1, jockeyName: '青井 はやと' },
    { type: 'trait-discovered', week: 248, traitLabel: '芝の適性' },
    { type: 'graded-win', week: 260, raceName: '若草賞', finishPosition: 1, jockeyName: '青井 はやと' },
    { type: 'career-high', week: 302, raceName: '陽春特別' },
    { type: 'top-grade-win', week: 318, raceName: '桜星賞', finishPosition: 1, jockeyName: '青井 はやと' },
  ],
};

/** ★履歴書に出すタブ（★カードの並び: 競走成績 → 血統 → 物語 → 子孫） */
export const RESUME_TABS: readonly { readonly key: string; readonly label: string }[] = [
  { key: 'races', label: '競走成績' },
  { key: 'pedigree', label: '血統' },
  { key: 'story', label: '物語' },
  { key: 'offspring', label: '子孫' },
];

/** ★物語タブに抜粋する件数（★全部は `/stable/retired` の馬物語帳で見ます） */
export const RESUME_STORY_PREVIEW = 3;
