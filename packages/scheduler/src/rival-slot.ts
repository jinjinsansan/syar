/**
 * ★**ライバル枠**（★正典 D-131・2026-10-03・裁定 `REVIEW_D126_D131_MINIMAL_VERDICT_20261003.md` §4・§8・§9）。
 *
 * 【★何をするか】
 *   ★利用者の馬が出るレースに、★その馬のライバル（看板馬）が ★**同じ出走条件の窓に居れば**、★確率 p で NPC の枠に入れる。
 *   ★オーナー決定「★追いついたら当たる」: ★クラスは跨がせない（★窓に居ないときは入れない）。
 *   ★**着順には効かせない**（★出走表を選ぶだけ・★能力・展開・レースの乱数に触れない）。
 *
 * 【★ペースの上限】（§8）
 *   ★1 頭の看板馬が 多くの利用者のレースに偏って出ると ★重賞の顔ぶれが偏る。
 *   ★枠で入れるのは ★その看板馬の出走数が ★**齢に見合う数 × 余裕** を下回るときだけ。
 *   ★齢に見合う数 ＝ ★`startsPerCareerOf`（★番組の量 ÷ 頭数 × 現役の日数・D-128）× 現役の週数 ÷ 現役期間の週数。
 *   ★数を書き写さない（★55 のような数を置かない・D-128）。
 *
 * 【★決定論】★`u` は呼ぶ側が `RIVAL_STREAM.SLOT` の流れから `float()` で引いて渡す（★時刻・Math.random を使わない）。
 */
import { CAREER_WEEKS } from './pool-size.js';

/**
 * ★**枠が働く確率**（★較正定数・★裁定 §9 の線「同じ窓に居る出走のうち 50% 以上」から `rival-slot-sim.ts` で決める）。
 */
export const RIVAL_SLOT_P = 0.6;

/**
 * ★**ペースの余裕**（★較正定数）。★齢に見合う出走数の何倍までなら 枠で入れてよいか。
 *   ★1.0 だと 普段の出走だけで上限に届き、★枠がほとんど働かない（★普段の出走が そもそも平均のペース）。
 */
export const RIVAL_PACE_MARGIN = 1.3;

/** ★その看板馬が いまの週齢で 枠で入れてよい出走数の上限 */
export function rivalPaceLimit(input: {
  /** ★現役になってからの週数（★週齢 − 出走できる週齢） */
  readonly activeWeeks: number;
  /** ★1 キャリアの出走数（★`startsPerCareerOf` の値・★実測から導く） */
  readonly startsPerCareer: number;
  readonly margin?: number;
}): number {
  if (!Number.isFinite(input.startsPerCareer) || input.startsPerCareer <= 0) {
    throw new Error(`rival-slot: 1 キャリアの出走数が正の有限値ではありません（${input.startsPerCareer}）`);
  }
  const weeks = Math.max(0, Math.min(CAREER_WEEKS, input.activeWeeks));
  return (input.startsPerCareer * weeks / CAREER_WEEKS) * (input.margin ?? RIVAL_PACE_MARGIN);
}

/**
 * ★**このレースでライバル枠が働くか**。
 *   ★`eligible` ＝ ★ライバルが このレースの出走条件（齢・クラス・牝馬限定）を満たし 現役（★呼ぶ側が 出走表と同じ判定で決める）。
 */
export function rivalSlotFires(input: {
  readonly eligible: boolean;
  /** ★ライバルの これまでの出走数 */
  readonly rivalStarts: number;
  /** ★`rivalPaceLimit` の値 */
  readonly paceLimit: number;
  /** ★[0, 1) の一様乱数（★`RIVAL_STREAM.SLOT`） */
  readonly u: number;
  readonly p?: number;
}): boolean {
  if (!input.eligible) return false;
  if (input.rivalStarts >= input.paceLimit) return false;
  return input.u < (input.p ?? RIVAL_SLOT_P);
}
