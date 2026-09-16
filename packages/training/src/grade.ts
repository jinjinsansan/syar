/**
 * ★**厩舎の格**（★GB-5・2026-09-16・正典 §6.7・§7.2・**D-103**・オーナー決定 T-6）
 *
 * 【★何を動かし、何を動かさないか】
 *   ★動かしてよいのは ★**近づき方（伸び）と時間の効率**だけです。
 *   ⚠️ ★**`potential`（素質の上限）は変えません**（★§7.3 の `current ≤ potential`・V-2b・D-103 ①）。
 *   ⚠️ ★**同じ EP を注いだとき、上の格が強くなってはいけません**（★D-103 ②・V-14 ③ と同じ形）。
 *     → ★だから ★**伸びの倍率と調教費の倍率を同じ値**にします。
 *       ★上の格は ★「1 週あたり多く伸びるが、そのぶん高い」。★**EP あたりの伸びは同じ**です。
 *       ★得られるのは ★**時間**（★少ない週で同じところまで行ける）で、★強さではありません。
 *   ⚠️ ★**お金で格を上げません**（★§6.7・D-103 ④）。★EP での解放は可（★解放の経路は次の便）。
 *
 * 【★この層の約束】★依存ゼロ・純粋関数。★`grow` の式には触っていません（★倍率を外から掛けるだけ）。
 */

import type { MenuId } from './menus.js';
import { MENUS } from './menus.js';

export type StableGrade = 'bronze' | 'silver' | 'gold';

export const STABLE_GRADES: readonly StableGrade[] = ['bronze', 'silver', 'gold'];

export const STABLE_GRADE_LABEL: Readonly<Record<StableGrade, string>> = {
  bronze: 'ブロンズ', silver: 'シルバー', gold: 'ゴールド',
};

/**
 * ★**格の倍率**（★較正定数）。
 *
 * ⚠️ ★**伸びと費用に同じ値を掛けます。** ★別々にすると ★「同じ EP で上の格が強い」形になり、
 *    ★D-103 ② と V-14 ③ が落ちます（★`grade.test.ts` の対照 ② が捕まえます）。
 * ★既定（ブロンズ）は **1.0** — ★格を入れる前と ★**1 ビットも同じ**です（★V-14・V-15・V-7 が動かない）。
 */
export const STABLE_GRADE_MULT: Readonly<Record<StableGrade, number>> = {
  bronze: 1.0,
  silver: 1.25,
  gold: 1.5,
};

/** ★格の既定（★入る前と同じ振る舞い） */
export const DEFAULT_STABLE_GRADE: StableGrade = 'bronze';

/**
 * ★**格を 1 段上げるのに要る EP**（★(a) 第 5 便-5・D-103 ④「お金で格を上げない。EP での解放は可」）。
 *
 * ⚠️ ★**金銭で買える経路は作りません**（★憲法 2。★EP は遊んで貯める点で、買えません）。
 * ⚠️ ★較正定数ですが ★**値そのものをゲートにしません**（★GB-6 の収支の取り直しで、
 *    ★この額込みの 1 キャリアの収支を報告します）。
 * ★置き方: ★上の格が買うのは ★**強さではなく時間**（★EP あたりの伸びはどの格でも同じ・`gainPerEpRatio`）。
 *   ★だから「何週ぶんの調教費に相当するか」で置いています
 *   — ★シルバーは約 40 週・ゴールドは約 120 週ぶんの調教費に相当する額です。
 */
export const GRADE_UNLOCK_EP: Readonly<Record<Exclude<StableGrade, 'bronze'>, number>> = {
  silver: 20_000,
  gold: 60_000,
};

/** ★次の格（★ゴールドの次は無い） */
export function nextGrade(grade: StableGrade): StableGrade | null {
  const i = STABLE_GRADES.indexOf(grade);
  return i < 0 || i + 1 >= STABLE_GRADES.length ? null : STABLE_GRADES[i + 1]!;
}

/**
 * ★**いまの格から 1 段上げる値段**（★上が無ければ null）。
 * ⚠️ ★**飛び級はできません**（★ブロンズから直接ゴールドにしない — ★合計額が変わってしまう）。
 */
export function unlockPriceEP(grade: StableGrade): number | null {
  const next = nextGrade(grade);
  if (next === null || next === 'bronze') return null;
  return GRADE_UNLOCK_EP[next];
}

/** ★その格での調教費 [EP]（★§7.2 の表 × 格の倍率） */
export function gradeEpCost(menu: MenuId, grade: StableGrade = DEFAULT_STABLE_GRADE): number {
  return Math.round(MENUS[menu].epCost * STABLE_GRADE_MULT[grade]);
}

/**
 * ★その格での伸びの倍率（★`grow` の結果に掛けるのではなく、★**呼び出し側が週の伸びに使う**値）。
 * ⚠️ ★**`potential` には掛けません。** ★天井は動きません（★`grow` が `current ≤ potential` を閉じています）。
 */
export function gradeGainMult(grade: StableGrade = DEFAULT_STABLE_GRADE): number {
  return STABLE_GRADE_MULT[grade];
}

/**
 * ★**同じ EP を注いだときの伸びの比**（★D-103 ② の定義そのもの）。
 *   ★`gainMult / costMult` ＝ ★**EP あたりの伸び**。★どの格でも **1.0** になること。
 * ⚠️ ★これが 1 でない実装は ★**お金で強さを買える**形です（★S-5・L-4 の近縁）。
 */
export function gainPerEpRatio(grade: StableGrade): number {
  return gradeGainMult(grade) / STABLE_GRADE_MULT[grade];
}
