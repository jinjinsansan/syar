/**
 * ★**自馬が出走するレースの買い目**（★正典 **§9.5**・★**VT-1 ①**・2026-09-19）— 純粋関数
 *
 * 【🔴 ★なぜ切り出したか — ★画面が独自の規則を持っていました】
 *   ★`/vote` は「★**自分の馬が出るレースは投票できません**」としていました。
 *   🔴 ★**正典はそう書いていません。** ★§9.5 が書いているのは ★**買い目の条件**です:
 *
 *     ★1. ★自馬が出走するレースでは、★**自馬を含む馬券しか購入できない**
 *     ★2. ★この「応援ベット」は 1 レース合計 **5,000 EP** まで
 *     ★3. ★自馬が**複数**いる場合は、★**それら全頭を含む組合せ**のみ可
 *
 *   → ★★**「買えない」ではなく「買い方が決まっている」**。★マークシートは普通に満たせます
 *     （★1 頭 10 EP・18 頭でも **180 EP** で、★上限 5,000 EP の **3.6%**）。
 *
 * 【★どこが正か】
 *   ✅ ★**サーバーが既に正しく守っています** — ✔ `place_bet`（★最後の定義は移行 `0044`）が
 *     ★`not (p_selection @> to_jsonb(e.gate))` で ★**全頭を含むこと**を確かめ、
 *     ★金額の上限は `bet_allowance()` が `own_race_ep` で見ています。
 *   → ★★**この関数はサーバーの規則を「写す」ものではありません。**
 *     ★**画面が「なぜ出せないか」を言うため**のものです（★BT-0・「材料でなく結果を渡す」）。
 *   ⚠️ ★**画面の判定が緩くても厳しくても、サーバーが最後に弾きます**（憲法 3・サーバー権威）。
 *     ★ここが緩いと「押せたのに失敗する」、★厳しいと「正典より狭い」になります。
 *
 * 【★§9.5-4 はここにありません】
 *   ★同一 IP・同一デバイスの検知は ★**運営の監視ログ**で、★買い目の条件ではありません。
 */

import { BET_CAP_OWN_RACE_EP } from './limits.js';

/** ★§9.5 に照らして、その買い目が出せない理由 */
export type OwnRaceReason =
  /** ★出せる */
  | 'ok'
  /** ★自馬が 1 頭も入っていない（★§9.5-1） */
  | 'own_horse_missing'
  /** ★自馬が複数いて、★一部しか入っていない（★§9.5-3） */
  | 'own_horses_partial'
  /** ★1 レース合計 5,000 EP を超える（★§9.5-2） */
  | 'own_race_cap';

export interface OwnRaceCheck {
  readonly ok: boolean;
  readonly reason: OwnRaceReason;
  /** ★**入っていない自馬の馬番**（★昇順）。★「7 番を含めてください」と言うため */
  readonly missing: readonly number[];
}

/**
 * ★**自馬が出るレースで、その買い目を出せるか**（★§9.5-1 / -2 / -3）。
 *
 * @param selection ★選んでいる馬番
 * @param ownGates ★このレースに出ている**自分の馬**の馬番（★0 頭なら自馬レースではない）
 * @param amountEp ★このレースで既に使った分を含めた合計 [EP]
 *
 * ⚠️ ★`ownGates` が空なら ★**常に `ok`** です（★§9.5 はそもそも掛かりません）。
 *    ★**ここで「自馬レースかどうか」を判定しません** — ★出走の事実はサーバーが持ちます（D-052）。
 */
export function checkOwnRaceSelection(
  selection: readonly number[],
  ownGates: readonly number[],
  amountEp: number,
): OwnRaceCheck {
  if (ownGates.length === 0) return { ok: true, reason: 'ok', missing: [] };
  const picked = new Set(selection);
  const missing = [...ownGates].filter((g) => !picked.has(g)).sort((a, b) => a - b);
  if (missing.length === ownGates.length) {
    /** ★1 頭も入っていない（★§9.5-1） */
    return { ok: false, reason: 'own_horse_missing', missing };
  }
  if (missing.length > 0) {
    /**
     * 🔴 ★**一部しか入っていない**（★§9.5-3・2026-09-16 の是正）。
     *   ★D-104 で 1 人が同じレースに **2 頭**まで出せるようになりました。
     *   ★片方だけを含む買い目を許すと、★**もう 1 頭を負けさせる利得**が残ります。
     */
    return { ok: false, reason: 'own_horses_partial', missing };
  }
  if (amountEp > BET_CAP_OWN_RACE_EP) {
    return { ok: false, reason: 'own_race_cap', missing: [] };
  }
  return { ok: true, reason: 'ok', missing: [] };
}

/**
 * ★画面に出す言葉（★**なぜ出せないか**）。
 * ⚠️ ★**「押せない」だけにしないこと。** ★理由を言えない制限は、★壊れているのと区別できません。
 */
export function ownRaceReasonText(check: OwnRaceCheck): string {
  switch (check.reason) {
    case 'ok':
      return '';
    case 'own_horse_missing':
      return `自分の馬（${check.missing.join('・')} 番）を選んでください`;
    case 'own_horses_partial':
      return `自分の馬は全頭 選んでください（${check.missing.join('・')} 番が入っていません）`;
    case 'own_race_cap':
      return `自分の馬が出るレースは 1 レース ${BET_CAP_OWN_RACE_EP.toLocaleString('en-US')} EP までです`;
  }
}
