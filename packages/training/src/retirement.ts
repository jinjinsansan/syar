/**
 * 引退と繁殖入り（正典 §7.1・§10.5）
 *
 * ```
 * 260週〜 強制引退 → 種牡馬 / 繁殖牝馬 / 功労馬
 * ```
 *
 * 【★これは「専用経路を作らない」ための薄い層です】
 *   正典 §10.5:「NPC 馬は**プレイヤー馬と同一の遺伝エンジン（§6）で生成**。
 *   **専用の簡易ロジックを作らない**（**同じ土俵にいることが公正性の担保**）」
 *
 *   → ここは**行き先を決めるだけ**で、繁殖そのものは
 *     `@star/sim-engine` の `canMate` / `breed` を**そのまま**使います。
 *     ★このファイルに配合の計算を書いた時点で、公正性の担保が壊れます。
 *     `retirement.test.ts` が**「繁殖の実装がここに無いこと」を機械的に検査**します。
 *
 * 【★正典に無いもの（照会）】
 *   - ✅ **種牡馬／繁殖牝馬に「上がれる」条件** — 裁定 I-1 §4 で「置かない」（暫定）。§10.5 は NPC について
 *     「**成績上位は自動で種牡馬・繁殖入り**」と書きますが、**プレイヤー馬の条件がありません**
 *   - ✅ **功労馬**の意味 — 繁殖に上げない状態。持ち主は後から繁殖に上げられ、繁殖から降ろせる（裁定 I-1 §3 Q-2・上限の中で）
 *   - **致命的故障で引退した馬**の扱い（§7.5 は「繁殖入りは可能」と明記 → 実装はそれに従う）
 */

import type { HorseRecord, Sex } from '@star/sim-engine';
import { LIFECYCLE_WEEKS } from '@star/scheduler';

/** 引退後の行き先（正典 §7.1） */
export type RetirementRole = 'stallion' | 'broodmare' | 'honored';

/** 引退の理由 */
export type RetirementReason = 'age' | 'career_ending_injury';

export interface RetirementDecision {
  readonly role: RetirementRole;
  readonly reason: RetirementReason;
  /** ★繁殖に上がるか（功労馬なら false） */
  readonly breeds: boolean;
}

/** 週齢と故障から、引退すべきかを返す（§7.1・§7.5） */
export function shouldRetire(ageWeeks: number, careerEnded: boolean): RetirementReason | null {
  if (careerEnded) return 'career_ending_injury';
  if (ageWeeks >= LIFECYCLE_WEEKS.retireAt) return 'age';
  return null;
}

/** 性別から取りうる繁殖の役割（★牡が繁殖牝馬になることはない） */
export function breedingRoleForSex(sex: Sex): Exclude<RetirementRole, 'honored'> {
  return sex === 'male' ? 'stallion' : 'broodmare';
}

/**
 * 引退後の行き先を決める。
 *
 * ★`honored`（功労馬）は**選ぶもの**として扱います。
 *   正典はプレイヤー馬が種牡馬・繁殖牝馬に「上がれる条件」を書いていないので、
 *   **成績の閾値は置きません**（裁定 `REVIEW_I1_RETIREMENT_ROLE_VERDICT_20260922.md` §4・暫定。上限だけで絞る）。
 *   持ち主のいる馬の既定は功労馬で、繁殖入りは持ち主が選ぶ（同 §3 Q-1）。呼ぶ側（ワーカー）は持ち主の馬に `preferHonored` を渡す（I-1 段 2・`training-runner.ts` の `prefersHonored`）。
 *   この関数の既定は**性別に応じた繁殖入り**（NPC の経路）で、`preferHonored` を指定したときだけ功労馬にします。
 *
 * ★致命的故障で引退した馬も**繁殖には上がれます**（§7.5:「繁殖入りは可能」）。
 */
export function decideRetirement(
  horse: HorseRecord,
  reason: RetirementReason,
  preferHonored = false,
): RetirementDecision {
  if (preferHonored) return { role: 'honored', reason, breeds: false };
  const role = breedingRoleForSex(horse.sex);
  return { role, reason, breeds: true };
}

/**
 * 引退馬を繁殖プールに入れられる形にする。
 *
 * ★**新しい型を作りません。** `HorseRecord` のまま返します。
 *   専用の型を挟むと、そこから「プレイヤー馬用の配合処理」が生えます。
 *   正典 §10.5 の「同じ土俵」は、**同じ型が同じ関数を通ること**で担保されます。
 *
 * ★繁殖の年次カウンタだけ初期化します（§6.7）。
 *   現役中は使われないので、引退時に揃えておかないと
 *   「前年の種付回数が残ったまま繁殖入りする」ことになります。
 */
export function toBreedingStock(horse: HorseRecord): HorseRecord {
  return {
    ...horse,
    coveringsThisYear: 0,
    bredThisYear: false,
  };
}
