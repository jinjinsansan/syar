/**
 * N-4: プリシード成果の検証（正典 §10.5 / 合格基準2・3）
 *
 * 【R-16 の適用】
 *   「父系ラインの本数」だけを見てはいけない。
 *   厩舎ごとに種牡馬枠を切った時点で本数は構造的に保証されるので、
 *   **測る前から通る指標**になる（＝何も検証していない）。
 *   保証されないのは次の2つで、こちらを測る:
 *     - 最大系統のシェア（偏っていないか）
 *     - **1頭の5代血統に何系統が現れるか**（ニックス §6.6 が意味を持つ程度に混ざっているか）
 */

import type { HorseRecord } from '@star/sim-engine';

/** 5代 ＝ 父母を5世代さかのぼる。全部埋まれば 2+4+8+16+32 = 62頭 */
export const PEDIGREE_GENERATIONS = 5;
export const FULL_PEDIGREE_ANCESTORS = 62;

export interface PedigreeStat {
  /** 5代分の祖先枠のうち、実在の馬で埋まっている数（最大62） */
  readonly filled: number;
  /** 祖先に現れる父系ラインの異なり数 */
  readonly lines: number;
  /** 同一祖先が複数の枠に現れた回数（＝クロス。近交の指標） */
  readonly duplicates: number;
}

/** 1頭の5代血統をたどる。`lookup` が undefined を返した枠は「埋まっていない」 */
export function pedigreeStat(
  horse: HorseRecord,
  lookup: (id: string) => HorseRecord | undefined,
): PedigreeStat {
  const seen = new Map<string, number>();
  const lines = new Set<string>();
  let filled = 0;

  let frontier: (HorseRecord | undefined)[] = [horse];
  for (let gen = 0; gen < PEDIGREE_GENERATIONS; gen += 1) {
    const next: (HorseRecord | undefined)[] = [];
    for (const h of frontier) {
      // 埋まっていない枠の親も埋まっていない（枠数は保つ）
      const sire = h?.sireId != null ? lookup(h.sireId) : undefined;
      const dam = h?.damId != null ? lookup(h.damId) : undefined;
      next.push(sire, dam);
    }
    for (const a of next) {
      if (a === undefined) continue;
      filled += 1;
      lines.add(a.sireLine);
      seen.set(a.id, (seen.get(a.id) ?? 0) + 1);
    }
    frontier = next;
  }

  let duplicates = 0;
  for (const n of seen.values()) if (n > 1) duplicates += n - 1;

  return { filled, lines: lines.size, duplicates };
}

export interface LineConcentration {
  /** 異なり系統数 */
  readonly count: number;
  /** 最大系統のシェア（0〜1）。1系統への偏りを見る */
  readonly topShare: number;
  /**
   * 有効系統数 = 1 / Σ(シェア²)（逆シンプソン）。
   * ★本数と違い、**少数の系統に偏ると本数が同じでも下がる**ので、
   *   「40系統あるが実質2系統」を見逃さない。
   */
  readonly effective: number;
}

export function lineConcentration(lines: readonly string[]): LineConcentration {
  if (lines.length === 0) return { count: 0, topShare: 0, effective: 0 };
  const counts = new Map<string, number>();
  for (const l of lines) counts.set(l, (counts.get(l) ?? 0) + 1);
  let sumSq = 0;
  let top = 0;
  for (const n of counts.values()) {
    const share = n / lines.length;
    sumSq += share * share;
    if (n > top) top = n;
  }
  return {
    count: counts.size,
    topShare: top / lines.length,
    effective: 1 / sumSq,
  };
}

export interface PedigreeAudit {
  readonly horses: number;
  /** 5代血統表が完全に埋まっている割合 */
  readonly fullRate: number;
  /** 埋まっている祖先枠の平均（最大62） */
  readonly meanFilled: number;
  /** 5代血統に現れる系統数の平均 */
  readonly meanLines: number;
  /** クロスを1つ以上持つ馬の割合 */
  readonly crossRate: number;
  /** 種牡馬プールの系統集中 */
  readonly stallionLines: LineConcentration;
  /** 現役の系統集中 */
  readonly activeLines: LineConcentration;
}

export function auditPedigrees(
  activeIds: readonly string[],
  stallionIds: readonly string[],
  lookup: (id: string) => HorseRecord | undefined,
): PedigreeAudit {
  const stats = activeIds
    .map((id) => lookup(id))
    .filter((h): h is HorseRecord => h !== undefined)
    .map((h) => pedigreeStat(h, lookup));

  const n = Math.max(1, stats.length);
  const lineOf = (ids: readonly string[]): string[] =>
    ids.map((id) => lookup(id)?.sireLine).filter((l): l is string => l !== undefined);

  return {
    horses: stats.length,
    fullRate: stats.filter((s) => s.filled === FULL_PEDIGREE_ANCESTORS).length / n,
    meanFilled: stats.reduce((a, s) => a + s.filled, 0) / n,
    meanLines: stats.reduce((a, s) => a + s.lines, 0) / n,
    crossRate: stats.filter((s) => s.duplicates > 0).length / n,
    stallionLines: lineConcentration(lineOf(stallionIds)),
    activeLines: lineConcentration(lineOf(activeIds)),
  };
}
