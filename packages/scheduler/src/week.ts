/**
 * ゲーム内週の進行（正典 §7.1・§10.1・D-007）
 *
 * 【★週番号は時刻から決まる。カウンタで数えない】
 *   P2 の `cycle_index` と**同じ設計**です。カウンタで数えると
 *   **再起動・遅延・追いつきで壊れます**。
 *
 *   P2 で「9回起動し、7分51秒ワーカーが不在で、1周の仕事量が640倍に変わっても
 *   欠落0・重複0」を実現したのは、**この一点**でした。
 *   週進行にも同じ性質が要ります — 週は**成長・故障・EP の消費**を起こすので、
 *   飛べば馬が育たず、重なれば**二重に故障判定を引きます**。
 *
 * 【★サイクルとの関係を式で書く】
 *   1週 = 4時間 = 10分サイクル **24本ちょうど**です（D-007）。
 *   これは偶然ではなく、**週境界が必ずサイクル境界に一致する**ことを意味します。
 *   数値を別々に書くと、片方だけ動かしたときに静かにずれるので、
 *   **`CYCLE_MS` から導出**します（P2 で `ODDS_MC_TRIALS` を式にしたのと同じ理由）。
 */

import { CYCLE_MS } from './cycle.js';

/** 1週あたりのサイクル数。★1週=4時間 ÷ 10分 = 24 */
export const CYCLES_PER_WEEK = 24;

/** 1ゲーム内週の実時間（ミリ秒）。正典 D-007: リアル4時間 */
export const WEEK_MS = CYCLE_MS * CYCLES_PER_WEEK;

/** 1日あたりの週進行数（正典 §7.1: 1日6週）。★導出値。定義と一致することをテストで守る */
export const WEEKS_PER_DAY = (24 * 60 * 60 * 1000) / WEEK_MS;

/**
 * 馬の一生の節目（正典 §7.1）。**週齢**で表す。
 *
 * ⚠️ 較正定数ではありません。正典の表の写しです。
 */
export const LIFECYCLE_WEEKS = {
  /** ここまでは育成不可（放牧場で自動経過） */
  trainableFrom: 78,
  /** ここから現役（レースに出られる） */
  raceableFrom: 104,
  /** ★これ以上は現役でいられない。強制引退 */
  retireAt: 260,
} as const;

/** キャリア上限（正典 §7.1: 24戦） */
export const CAREER_RACE_LIMIT = 24;

/** その時刻が何週目か。★時刻だけから決まる（`Date.now()` を呼ばない） */
export function weekIndexAt(nowMs: number, epochMs: number): number {
  return Math.floor((nowMs - epochMs) / WEEK_MS);
}

/** 週の開始時刻。★再起動しても同じ番号からは同じ時刻が出る */
export function weekStartMs(index: number, epochMs: number): number {
  return epochMs + index * WEEK_MS;
}

/** 週の先頭からの経過ミリ秒（0 〜 WEEK_MS-1） */
export function offsetInWeek(nowMs: number, epochMs: number): number {
  const raw = (nowMs - epochMs) % WEEK_MS;
  return raw < 0 ? raw + WEEK_MS : raw;
}

/**
 * ★処理すべき週の番号を並べる（欠落補完）。
 *
 *   `lastProcessed` の次から、いまの週の**1つ前**までを返します。
 *   いまの週は**まだ終わっていない**ので進めません。
 *
 * ★止まっていた間の週も**すべて返します**。飛ばすと馬が育たず、
 *   「放置していても週は進む」（§7.1）が成立しなくなります。
 *   ⚠️ 逆に、既に処理した週を返してはいけません（**二重に故障判定を引く**）。
 *
 * @param lastProcessed 最後に処理した週番号。まだ何も処理していなければ `null`
 */
export function weeksToProcess(
  nowMs: number,
  epochMs: number,
  lastProcessed: number | null,
): number[] {
  const current = weekIndexAt(nowMs, epochMs);
  // ★いまの週は締まっていないので処理しない
  const upto = current - 1;
  const from = lastProcessed === null ? upto : lastProcessed + 1;
  if (from > upto) return [];
  const out: number[] = [];
  for (let i = from; i <= upto; i += 1) out.push(i);
  return out;
}

/** 週齢（誕生週からの経過）。★負にならないことは呼ぶ側が保証する */
export function ageWeeks(birthWeekIndex: number, atWeekIndex: number): number {
  return atWeekIndex - birthWeekIndex;
}

/** 馬の段階（正典 §7.1） */
export type LifeStage = 'growing' | 'trainable' | 'racing' | 'retired';

/**
 * 週齢から段階を決める。
 *
 * ★境界は「以上」で判定します（§7.1 の表の読み方）。
 *   104週ちょうどは**現役**、260週ちょうどは**引退**です。
 */
export function lifeStageAt(weeks: number): LifeStage {
  if (weeks >= LIFECYCLE_WEEKS.retireAt) return 'retired';
  if (weeks >= LIFECYCLE_WEEKS.raceableFrom) return 'racing';
  if (weeks >= LIFECYCLE_WEEKS.trainableFrom) return 'trainable';
  return 'growing';
}

/** 調教できるか（§7.1: 78週から。引退後はできない） */
export function canTrain(weeks: number): boolean {
  const s = lifeStageAt(weeks);
  return s === 'trainable' || s === 'racing';
}
