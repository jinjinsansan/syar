/**
 * ★**馬物語帳のデモデータ**（★D13-1・2026-09-16・デザイナーのカード `components/horse-story`）
 *
 * ⚠️ ★**文はここに書きません。** ★`@star/training` の `storyLineOf` が組み立てます（★§18 LR-4）。
 *    ★ここにあるのは ★**出来事の種類と値**だけです（★DB の `horse_story_event` と同じ形）。
 * ⚠️ ★**持ち主の名前を持ちません**（★§18 LR-6。★出るのは牧場名まで）。
 * ★staging には実データが 69 行あります（★画面を実データに繋ぐのは別の便）。
 */

import type { StoryEvent } from '@star/training';

export interface RetiredHorse {
  readonly id: string;
  readonly name: string;
  /** ★一覧に出す一言（★戦績の要約。★持ち主の情報は入れない） */
  readonly summary: string;
  /** ★最高格を勝ったか（★一覧の見た目を変える） */
  readonly topGrade: boolean;
  /** ★牧場名（★他人の馬かどうかの見分け・LR-6。★自分は「わたしの牧場」） */
  readonly stableName: string;
}

export const MY_STABLE_NAME = 'わたしの牧場';

export const DEMO_RETIRED: readonly RetiredHorse[] = [
  { id: 'r1', name: 'サクラブリーズ', summary: '32戦8勝　重賞3勝', topGrade: true, stableName: MY_STABLE_NAME },
  { id: 'r2', name: 'ホクトリュウセイ', summary: '32戦4勝', topGrade: false, stableName: MY_STABLE_NAME },
  { id: 'r3', name: 'シラユキノヒメ', summary: '1戦0勝', topGrade: false, stableName: MY_STABLE_NAME },
  { id: 'r4', name: 'ミライノツバサ', summary: '24戦6勝　重賞1勝', topGrade: false, stableName: '花丘牧場' },
];

/**
 * ★1 頭の生涯（★`storyLinesOf` に渡す出来事）。
 * ⚠️ ★**同じ週に複数の行**が出る例（★236 週のデビューと初勝利）を含めています
 *    — ★カードの「同じ週の最初の行だけ週番号を出す」を実際に確かめるためです。
 */
export const DEMO_STORY: Readonly<Record<string, readonly StoryEvent[]>> = {
  r1: [
    { type: 'birth', week: 12 },
    { type: 'first-training', week: 60 },
    { type: 'debut', week: 236, raceName: 'R5655', finishPosition: 12 },
    { type: 'first-win', week: 236, raceName: 'R5655', finishPosition: 1, jockeyName: '青井 はやと' },
    { type: 'trait-discovered', week: 248, traitLabel: '芝の適性' },
    { type: 'graded-win', week: 260, raceName: '若草賞', finishPosition: 1, jockeyName: '青井 はやと' },
    { type: 'injury', week: 264 },
    { type: 'comeback', week: 290 },
    { type: 'career-high', week: 302, raceName: '陽春特別' },
    { type: 'jockey-bond', week: 310, jockeyName: '青井 はやと' },
    { type: 'top-grade-win', week: 318, raceName: '桜星賞', finishPosition: 1, jockeyName: '青井 はやと' },
    { type: 'final-race', week: 340, raceName: '極光賞', finishPosition: 5 },
    { type: 'retirement', week: 341 },
    { type: 'first-offspring', week: 396, offspringName: 'サクラノカゼ' },
    { type: 'offspring-win', week: 640, offspringName: 'サクラノカゼ' },
  ],
  r2: [
    { type: 'birth', week: 8 },
    { type: 'debut', week: 228, raceName: 'R5510', finishPosition: 7 },
    { type: 'first-win', week: 244, raceName: 'R5602', finishPosition: 1, jockeyName: '倉田 みなと' },
    { type: 'retirement', week: 330 },
  ],
  r3: [
    { type: 'birth', week: 20 },
    { type: 'debut', week: 240, raceName: '新緑賞', finishPosition: 4 },
    { type: 'injury', week: 242 },
    { type: 'retirement', week: 260 },
  ],
  r4: [
    { type: 'birth', week: 4 },
    { type: 'debut', week: 220, raceName: 'R5480', finishPosition: 2 },
    { type: 'graded-win', week: 300, raceName: '星屑ステークス', finishPosition: 1 },
    { type: 'retirement', week: 352 },
  ],
};

/**
 * ★**発見度のデモ**（★D13-3）。
 * ⚠️ ★**素質の数値は持ちません**（★段だけ・§5.5・§12.4）。
 *    ★段は `@star/sim-engine` の `discoveryStageOf` が「その適性が試された回数」から決めます。
 */
export const DEMO_DISCOVERY: readonly { readonly label: string; readonly runs: number }[] = [
  { label: 'スピード', runs: 9 },
  { label: 'スタミナ', runs: 4 },
  { label: 'パワー', runs: 2 },
  { label: '賢さ', runs: 0 },
];
