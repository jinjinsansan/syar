/**
 * ★**牝馬 1 頭に対して、★どの種牡馬を選ぶか**（正典 D-025 / D-026 / **F-1**）。
 *
 * 🔴 ★**2026-09-20 に `apps/cli/src/preseed.ts` の内側から移しました**（★**G-2**）。
 *   ★定常運転（`POOL-SUPPLY`）で ★**ワーカーが同じ手続きを踏む**ために要ります。
 *   ⚠️ ★**コピーではありません。** ★preseed はここを呼ぶだけになりました。
 *   ✔ ★移す前に ★**出力を sha256 で釘付け**しました（`apps/cli/test/preseed-golden.test.ts`）。
 *     ★世界は `runPreseed(20260833)` から作ってあるので、★**挙動が変わると再現できなくなります。**
 */
import type { BalanceConfig, HorseRecord, Stable } from '@star/sim-engine';
import { calcInbreedCoefficient, canMate } from '@star/sim-engine';

import { SIRE_CHOICE_TOP_K, mateScoreWithInbreeding } from './mate-choice.js';

/** ★祖先 → その祖先を持つ種牡馬。★近交係数を計算しなくてよい相手を確定で外すため */
export type SireAncestorIndex = ReadonlyMap<string, readonly string[]>;

/**
 * ★**共通祖先を 1 頭も持たない相手は F=0 と確定する**ので、経路計算をしません。
 *   ⚠️ ★近似ではありません。★索引に載らない ＝ 共通祖先なし ＝ F=0 です。
 *   ★索引は年に 1 回・種牡馬のぶんだけ作れば足ります。
 */
export function buildSireAncestorIndex(stallions: readonly HorseRecord[]): SireAncestorIndex {
  const index = new Map<string, string[]>();
  for (const rec of stallions) {
    // ★種牡馬自身も牝馬の祖先になり得る
    for (const aid of [rec.id, ...rec.pedigreeCache.keys()]) {
      const list = index.get(aid);
      if (list === undefined) index.set(aid, [rec.id]);
      else list.push(rec.id);
    }
  }
  return index;
}

export interface RankSiresParams {
  readonly mare: HorseRecord;
  /** ★母の厩舎（★評価軸はここから来る・D-025） */
  readonly stable: Stable;
  readonly stallions: readonly HorseRecord[];
  /** ★その種牡馬が母と同じ厩舎か（★`HOME_SIRE_BONUS`） */
  readonly isHome: (sireId: string) => boolean;
  readonly lookup: (id: string) => HorseRecord | undefined;
  readonly balance: BalanceConfig;
  /** ★`canMate` に渡す年（★年 1 回の制限を見るため） */
  readonly year: number;
  readonly ancestorIndex: SireAncestorIndex;
}

/**
 * ★厩舎の評価軸で、★配合相手を並べる。★**交配できない相手は落とします**（黙って曲げない）。
 */
export function rankSires(p: RankSiresParams): { id: string; score: number }[] {
  const related = new Set<string>();
  for (const aid of p.mare.pedigreeCache.keys()) {
    for (const sid of p.ancestorIndex.get(aid) ?? []) related.add(sid);
  }
  // ★牝馬自身も共通祖先になり得る（父×娘）
  for (const sid of p.ancestorIndex.get(p.mare.id) ?? []) related.add(sid);

  const ranked: { id: string; score: number }[] = [];
  for (const sire of p.stallions) {
    if (!canMate(sire, p.mare, p.balance, p.year).ok) continue;
    /**
     * ★F-1: 近交係数を**決定経路で**参照します（★R-17: 監査で見ているだけでは保存されない）。
     * ⚠️ ★(種牡馬, 牝馬) → F のキャッシュを置くと**遅くなりました**（7.7s → 11.0s・実測）。
     *    ★同じ組は年内に一度しか評価されないのでヒットせず、Map の overhead だけが乗ります。
     */
    const f = related.has(sire.id)
      ? calcInbreedCoefficient(sire, p.mare, p.lookup, p.balance.PEDIGREE_DEPTH).F
      : 0;
    ranked.push({ id: sire.id, score: mateScoreWithInbreeding(sire, p.stable, f, p.isHome(sire.id)) });
  }
  /**
   * 🔴 ⚠️ ★**`localeCompare` は環境で結果が変わりえます**（★決定論の穴）。
   *
   *   ★移すときに ★**符号位置の比較へ直そうとして、★やめました。**
   *   ✔ ★理由: ★本番の世界は `runPreseed(20260833)` から作ってあります。
   *     ★ここを変えると ★**同点の並びが変わりえて、★あの世界を再現できなくなります。**
   *   → ★★**挙動は変えずに移しました。** ★危険は `LOCALE-SORT-IN-MATING` として起票します。
   *   ⚠️ ★**「移す」と「直す」を同じ便でやらない。** ★どちらが効いたか分からなくなります。
   */
  ranked.sort((a, b) => (b.score !== a.score ? b.score - a.score : a.id.localeCompare(b.id)));
  return ranked;
}

/**
 * ★並んだ候補から 1 頭 選ぶ。★`turn` は**厩舎ごとの順送り**（★同じ厩舎の牝馬が同じ相手に偏らないように）。
 *
 * ⚠️ ★`SIRE_CHOICE_TOP_K = 1` は ★**実測で決めた値**です（★K=5 にすると有効系統が悪化した）。
 *    ★詳しくは `mate-choice.ts` の註記。
 */
export function pickSire(ranked: readonly { id: string }[], turn: number): string | null {
  if (ranked.length === 0) return null;   // ★相手がいない年は産まない（黙って規則を曲げない）
  return ranked[(turn % SIRE_CHOICE_TOP_K) % ranked.length]!.id;
}
