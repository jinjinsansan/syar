/**
 * ★**告知をどこまで先に出すか**（★**DS-5 ②**・2026-09-19・オーナー決定）— 純粋 TypeScript
 *
 * 【★何を決めているか】
 *   ★D-117 で、レースの行は ★**2 段**になりました:
 *     ★① **announce** … ★枠・条件・締切だけ（★出走馬もオッズも無い）
 *     ★② **fill** … ★出走馬 ＋ オッズ ＋ 公開
 *   ★**登録できる長さ**＝ ★announce から締切（`entryDeadlineMs`）までです。
 *
 * 【🔴 ★なぜ一律ではいけないか — ★オーナー判断 **DS-5 ②**】
 *   ★G1 は ★**週 3 本**しかありません。★一律 12 分だと、
 *   ★★**「今度の G1 に合わせて仕上げる」が成立しません**（★12 分前に初めて存在を知る）。
 *   → ★「血をつなぐ」も、育てた馬の物語も、★**狙った舞台に立ってこそ意味を持ちます**。
 *
 * ⚠️ ★**窓の長さは物理の制約ではありません。** ★番組表は純関数なので、★どこまで先でも分かります。
 *    ★制約は ★**「出走馬もオッズも無いレースが、画面に何本 並ぶか」**だけです。
 *
 * 【🔴 ★G2・G3 は延ばしていません — ★正典に書かれていないため】
 *   ★オーナー判断の文は ★**「重賞だけ長く（例: G1 は 4 時間前から）」**で、
 *   ★**挙げられているのは G1 だけ**です。★G2・G3 の長さは ★**どこにも書かれていません**。
 *   → ★**狭いほうへ倒します**（★R-27）。★G2・G3 は ★**12 分のまま**です。
 *   → ★照会に出します。★決まったら ★**下の表の 1 行**を変えるだけです（★他に数を持ちません・D-052）。
 */

import { ANNOUNCE_AHEAD_RACES, cycleIndexAt } from './cycle.js';
import { type Grade, dailyProgramme, gradeOf } from './programme.js';
import { CYCLES_PER_WEEK } from './week.js';

/**
 * ★**格ごとの、告知を先に出すサイクル数**（★**DS-5 ②**）。
 *
 * ⚠️ ★**ここが唯一の表**です。★SQL にも画面にも窓の長さを書きません（★D-052・D-103 ④）。
 *
 * | | サイクル | 実時間 | 登録できる長さ（★締切まで） |
 * |---|---|---|---|
 * | **G1** | ★**40** | ★**4 時間**（★1 ゲーム内週） | ★38 サイクル ＝ **3 時間 48 分** |
 * | G2 / G3 | 4 | 24 分 | 2 サイクル ＝ **12 分** |
 * | 重賞以外 | 4 | 24 分 | 2 サイクル ＝ **12 分** |
 *
 * ★G1 の 40 は ★**`CYCLES_PER_WEEK` から引きます**（★「4 時間」を数で書かない）。
 *   ★サイクルの長さが変わっても（★D-007 は 10 分 → 3 分 → 6 分と動きました）、
 *   ★★**「1 ゲーム内週前」という意味のほうが保たれます**。
 */
export const ANNOUNCE_AHEAD_BY_GRADE: Readonly<Record<Grade, number>> = {
  G1: CYCLES_PER_WEEK,
  G2: ANNOUNCE_AHEAD_RACES,
  G3: ANNOUNCE_AHEAD_RACES,
};

/**
 * ★そのサイクルの告知を、★**何サイクル先から出すか**。
 * ★重賞でなければ `ANNOUNCE_AHEAD_RACES`（★既定の 4）。
 */
export function announceAheadFor(
  cycleIndex: number,
  programme = dailyProgramme(),
): number {
  const g = gradeOf(cycleIndex, programme);
  return g === null ? ANNOUNCE_AHEAD_RACES : ANNOUNCE_AHEAD_BY_GRADE[g];
}

/**
 * ★このサイクルで ★**枠だけ作っておくべき**レースのサイクル番号（★**D-117** の announce）。
 *
 * ⚠️ ★`racesToPrepare`（fill）より ★**先**を返します。★重なる部分は呼ぶ側が「もう在る」で飛ばします。
 * ⚠️ ★**遠い先の G1 を返しても、★組成はされません** — ★`cycle-runner` は
 *    ★`nowMs < entryDeadlineMs(idx)` の間 ★**飛ばします**（★締切まで登録を受け続ける）。
 *
 * 🔴 ★**`cycle.ts` には置けません。** ★`programme.ts` と `week.ts` が `cycle.ts` を読んでおり、
 *    ★逆向きに読むと循環します。★**だから 1 段 上のこのファイルに 1 つだけ置きます**（D-052）。
 */
export function racesToAnnounce(nowMs: number, epochMs: number): number[] {
  const current = cycleIndexAt(nowMs, epochMs);
  /** ★番組表は 1 回だけ組む（★毎回組むと 40 回 組むことになる） */
  const programme = dailyProgramme();
  const horizon = Math.max(ANNOUNCE_AHEAD_RACES, ...Object.values(ANNOUNCE_AHEAD_BY_GRADE));
  const out: number[] = [];
  for (let i = 1; i <= horizon; i += 1) {
    const cycleIndex = current + i;
    /**
     * ★「このレースは、いま告知してよい時期に入っているか」。
     * ★`i` は「何サイクル先か」なので、★その格の先行サイクル数**以内**なら出します。
     */
    if (i <= announceAheadFor(cycleIndex, programme)) out.push(cycleIndex);
  }
  return out;
}
