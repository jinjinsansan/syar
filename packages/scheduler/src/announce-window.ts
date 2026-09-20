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
 * 【✅ ★G2・G3 も延ばしました（★2026-09-20・オーナー決定・案 1）】
 *   ★`ANNOUNCE-G2-G3` の照会に答えが出ました。
 *   ★**G2 ＝ 1 週の半分（2 時間）／ G3 ＝ 1 週の 4 分の 1（1 時間）**。
 *
 *   ⚠️ ★**旧**（★2026-09-19〜09-20）: ★オーナー判断の文に**挙がっていたのは G1 だけ**だったので、
 *     ★**狭いほうへ倒して**（★R-27）G2・G3 は 12 分のままにしていました。★その判断は正しく、
 *     ★**照会に出して決まった**ので延ばします。
 *
 * ⚠️ 🔴 ★**`D-111 ③⑥`（取消と返金）が、★G2/G3 でも常用の経路になります。**
 *   ★窓が長いほど「★告知したが組成が間に合わない」が起こりえます。
 *   → ★`announce-window-cancel-path.test.ts` が、★**G2/G3 でもその道を通れること**を見ています。
 *
 * ⚠️ ★**別件（★今日は決めない）**: ★G2 は `nth % 28 < 8` で ★**8 本 続けて**置かれます。
 *   → ★告知を長くすると ★**「予告だらけの日」と「1 本も無い日」**ができます。
 *   → ★`ANNOUNCE-G2-G3` を閉じるときに残す性質です（★別項に起こしても可）。
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
 * | **G1** | ★**40**（`CYCLES_PER_WEEK`） | ★**4 時間**（★1 ゲーム内週） | ★38 サイクル ＝ **3 時間 48 分** |
 * | **G2** | ★**20**（`CYCLES_PER_WEEK / 2`） | ★**2 時間** | ★18 サイクル ＝ **1 時間 48 分** |
 * | **G3** | ★**10**（`CYCLES_PER_WEEK / 4`） | ★**1 時間** | ★8 サイクル ＝ **48 分** |
 * | 重賞以外 | 4 | 24 分 | 2 サイクル ＝ **12 分** |
 *
 * ★G1 の 40 は ★**`CYCLES_PER_WEEK` から引きます**（★「4 時間」を数で書かない）。
 *   ★サイクルの長さが変わっても（★D-007 は 10 分 → 3 分 → 6 分と動きました）、
 *   ★★**「1 ゲーム内週前」という意味のほうが保たれます**。
 */
/**
 * 🔴 ★**割り切れなければ投げます**（★`AL-9` と同じ作法・2026-09-20）。
 *
 *   ★`CYCLES_PER_WEEK` は D-007 で動いてきました（★10 分 → 3 分 → 6 分）。
 *   ★4 の倍数でない日に ★**黙って切り捨てられると、★誰も気づきません**。
 *   → ★**その日に落ちる**ようにします。
 */
function weekFraction(denominator: number): number {
  if (CYCLES_PER_WEEK % denominator !== 0) {
    throw new Error(
      `announce-window: CYCLES_PER_WEEK（${CYCLES_PER_WEEK}）が ${denominator} で割り切れません。`
        + '★告知の窓が黙って切り捨てられます。★表（ANNOUNCE_AHEAD_BY_GRADE）を見直してください。',
    );
  }
  return CYCLES_PER_WEEK / denominator;
}

export const ANNOUNCE_AHEAD_BY_GRADE: Readonly<Record<Grade, number>> = {
  /** ★1 ゲーム内週前（★4 時間） */
  G1: CYCLES_PER_WEEK,
  /** ★1 週の半分（★2 時間）。★2026-09-20 オーナー決定・案 1 */
  G2: weekFraction(2),
  /** ★1 週の 4 分の 1（★1 時間）。★同上 */
  G3: weekFraction(4),
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
