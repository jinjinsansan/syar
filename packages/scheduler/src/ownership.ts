/**
 * ★**所有頭数と、同じレースに出せる頭数**（★GB-2・2026-09-16・正典 §6.7・§10.4・**D-104**・オーナー決定 T-7）
 *
 * 【★この便で何を作り、何を作らないか】（★指示書 `DEV_INSTRUCTIONS_GAME_BODY_1_20260916.md` §2）
 *   ★**出走登録の RPC はまだ 1 つもありません。** ★だから ★**「入っているが使われない」形**で置きます（★R-15）。
 *   ★ここにあるのは ★**純関数と定数だけ**で、★DB も時刻も乱数も持ちません。★RPC に繋ぐのは出走登録の便です。
 *
 * 【★上限は 1 か所】（★正典 §16.3 の「定数の 3 分類」）
 *   ★**正典の写し**であって較正定数ではありません。★動かすと正典と食い違うので、
 *   ★`apps/cli/test/calibration-registry.test.ts` の登録簿には ★**理由付きの免除**として載せます。
 *   ⚠️ ★**2 か所に書かないこと。** ★片方だけ直した日に、★画面と判定が別の上限で動きます（★台帳 B-5 と同じ形）。
 */

/** ★所有の種類（★正典 §6.7） */
export type OwnershipKind = 'active' | 'broodmare' | 'stallion';

/**
 * ★**所有上限**（★正典 §6.7 の写し）。
 *   ★`active` … ★現役。★**2026-09-16・D-104 で 15 → 30**（★オーナー決定 T-7）
 *   ★`broodmare` … ★繁殖牝馬 10。★`stallion` … ★種牡馬 5。★**どちらも据え置き**
 *   ★（★繁殖側を据え置くのは ★生産の上限が系統集中の抑えだから・D-026）
 */
export const OWNERSHIP_LIMITS: Readonly<Record<OwnershipKind, number>> = {
  active: 30,
  broodmare: 10,
  stallion: 5,
};

/**
 * ★**同じレースに 1 人が出せる頭数**（★正典 §6.7・§10.4・D-104・T-7'）。
 *
 * ★これにより ★§10.4 の出走枠の抽選、★§9.5 の自馬の投票の制限、
 * ★§8b.1 の「発走前に介入対象を 1 頭選ぶ」が ★**意味を保ちます**。
 */
export const ENTRIES_PER_OWNER_MAX = 2;

export function ownershipLimitOf(kind: OwnershipKind): number {
  return OWNERSHIP_LIMITS[kind];
}

/**
 * ★**もう 1 頭持てるか**。★`current` は ★いま持っている頭数。
 * ⚠️ ★境界は ★「上限ちょうどは持てる・上限を超える 1 頭は持てない」（★R-2 の両側）。
 */
export function canOwnMore(kind: OwnershipKind, current: number): boolean {
  return current < OWNERSHIP_LIMITS[kind];
}

/**
 * ★**そのレースにもう 1 頭登録できるか**。★`entriesInThisRace` は ★**そのレースに既に登録した自分の頭数**。
 * ⚠️ ★数えるのは ★**レースごと**です（★別のレースの登録は影響しません）。
 */
export function canEnterRace(entriesInThisRace: number): boolean {
  return entriesInThisRace < ENTRIES_PER_OWNER_MAX;
}

/**
 * ★**自馬が出ているレースで、その買い目を買ってよいか**（★正典 §9.5・§6.7 の「複数頭なら全頭を含む組合せだけ」）。
 *
 * ★`ownGates` … ★そのレースに出ている ★**自分の馬の馬番**（★0 頭なら制限なし）
 * ★`selection` … ★買い目の馬番
 *
 * ⚠️ ★**いまの DB の実装（`place_bet`・`0002`／`0020`）は「自馬が 1 頭でも絡めば可」**です。
 *    ★正典は ★**「複数頭なら全頭を含む組合せだけ」**なので、★2 頭出したときに ★**DB のほうが緩くなります**。
 *    ★この関数は ★**正典どおり**に書いてあります。★移行ファイルは本便の対象外なので、★食い違いは報告に出します
 *    （★勝手に緩い側へ合わせない・R-27）。
 * ⚠️ ★2 頭出して単勝のように 1 頭しか選べない券種は、★**買えません**（★正典の帰結）。
 */
export function ownHorseSelectionOk(selection: readonly number[], ownGates: readonly number[]): boolean {
  if (ownGates.length === 0) return true;
  return ownGates.every((gate) => selection.includes(gate));
}
