/**
 * 近交係数 F（Wright の式）と5代血統キャッシュ — 正典 §6.5
 *
 *   F = Σ_A Σ_paths (0.5)^(n1 + n2 + 1) × (1 + F_A)
 *
 * n1 = 父から共通祖先 A までの代数、n2 = 母から A までの代数。
 * Wright の式では「父側の経路と母側の経路は A 以外の個体を共有してはならない」。
 * 共有を許すと、既に別の共通祖先として数えた血の重複を二重計上してしまう。
 * 本実装はこの排他条件を厳密に検査する（§3.5-2 の既知ケーステストで検証）。
 */

import type { HorseId, HorseLookup, HorseRecord, PedigreeCache } from './types.js';

/**
 * 親の血統キャッシュから子の血統キャッシュを作る。
 * 祖先ID → その祖先へ至る各経路の代数（親=1代）。maxDepth 代で打ち切る。
 */
export function buildPedigreeCache(
  sire: HorseRecord | null,
  dam: HorseRecord | null,
  maxDepth: number,
): PedigreeCache {
  const out = new Map<HorseId, number[]>();

  const add = (id: HorseId, depth: number): void => {
    if (depth > maxDepth) return;
    const existing = out.get(id);
    if (existing === undefined) {
      out.set(id, [depth]);
    } else {
      existing.push(depth);
    }
  };

  for (const parent of [sire, dam]) {
    if (parent === null) continue;
    add(parent.id, 1);
    for (const [ancestorId, depths] of parent.pedigreeCache) {
      for (const d of depths) {
        add(ancestorId, d + 1);
      }
    }
  }

  return out;
}

/** 共通祖先ごとの寄与 */
export interface AncestorContribution {
  ancestorId: HorseId;
  /** この祖先が F に加えた量 */
  contribution: number;
  /** 有効経路のうち最小の (n1, n2)。血統表の「A の 3×4」表示に使う */
  minPath: readonly [number, number];
  pathCount: number;
}

export interface InbreedResult {
  F: number;
  contributions: AncestorContribution[];
  /** 最も寄与の大きい共通祖先（血の濃縮 §6.5 の参照先） */
  topAncestorId: HorseId | null;
}

interface AncestorPath {
  /** 起点（父 or 母）から共通祖先までの個体ID列。共通祖先を含み、起点自身は含まない */
  chain: HorseId[];
}

/** horse から targetId へ至る全経路を DFS で列挙（深さ maxDepth まで） */
function enumeratePaths(
  horse: HorseRecord,
  targetId: HorseId,
  lookup: HorseLookup,
  maxDepth: number,
): AncestorPath[] {
  const found: AncestorPath[] = [];

  const walk = (current: HorseRecord, chain: HorseId[]): void => {
    if (chain.length >= maxDepth) return;
    for (const parentId of [current.sireId, current.damId]) {
      if (parentId === null) continue;
      const nextChain = [...chain, parentId];
      if (parentId === targetId) {
        found.push({ chain: nextChain });
        // 目的の祖先に到達したらそこで打ち切る。
        // その先を辿ると同一個体を2度含む経路になり Wright の排他条件に反する。
        continue;
      }
      const parent = lookup(parentId);
      if (parent === undefined) continue;
      walk(parent, nextChain);
    }
  };

  if (horse.id === targetId) {
    // 起点自身が共通祖先（親子交配など）。経路長 0。
    found.push({ chain: [] });
    return found;
  }

  walk(horse, []);
  return found;
}

/**
 * 近交係数 F を求める。
 *
 * 高速化: 共通祖先の候補は双方の pedigree_cache（祖先ID索引）の積集合として O(1) 参照で得る。
 * 無関係な配合ではここが空になり、経路列挙は一切走らない。
 */
export function calcInbreedCoefficient(
  sire: HorseRecord,
  dam: HorseRecord,
  lookup: HorseLookup,
  maxDepth: number,
): InbreedResult {
  // 自身も共通祖先になり得る（親子交配）ので候補に含める
  const sireCandidates = new Set<HorseId>([sire.id, ...sire.pedigreeCache.keys()]);
  const damCandidates = new Set<HorseId>([dam.id, ...dam.pedigreeCache.keys()]);

  const common: HorseId[] = [];
  for (const id of sireCandidates) {
    if (damCandidates.has(id)) common.push(id);
  }
  if (common.length === 0) {
    return { F: 0, contributions: [], topAncestorId: null };
  }
  // 決定論のため祖先IDでソートしてから畳み込む（Set の反復順に依存させない）
  common.sort();

  let F = 0;
  const contributions: AncestorContribution[] = [];

  for (const ancestorId of common) {
    const ancestor = lookup(ancestorId);
    const fA = ancestor?.inbreedCoeff ?? 0;

    const sirePaths = enumeratePaths(sire, ancestorId, lookup, maxDepth);
    const damPaths = enumeratePaths(dam, ancestorId, lookup, maxDepth);
    if (sirePaths.length === 0 || damPaths.length === 0) continue;

    let contribution = 0;
    let pathCount = 0;
    let minPath: [number, number] = [Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER];

    for (const sp of sirePaths) {
      // 父側の全個体（父自身 + 経路上の個体）
      const sireSide = new Set<HorseId>([sire.id, ...sp.chain]);
      for (const dp of damPaths) {
        const damSide = new Set<HorseId>([dam.id, ...dp.chain]);

        // Wright の排他条件: 共有してよいのは共通祖先 A のみ
        let overlaps = false;
        for (const id of sireSide) {
          if (id !== ancestorId && damSide.has(id)) {
            overlaps = true;
            break;
          }
        }
        if (overlaps) continue;

        const n1 = sp.chain.length;
        const n2 = dp.chain.length;
        contribution += Math.pow(0.5, n1 + n2 + 1) * (1 + fA);
        pathCount++;
        if (n1 + n2 < minPath[0] + minPath[1]) {
          minPath = [n1, n2];
        }
      }
    }

    if (pathCount > 0) {
      F += contribution;
      contributions.push({ ancestorId, contribution, minPath, pathCount });
    }
  }

  contributions.sort((a, b) =>
    b.contribution !== a.contribution
      ? b.contribution - a.contribution
      : a.ancestorId.localeCompare(b.ancestorId),
  );

  return {
    F,
    contributions,
    topAncestorId: contributions[0]?.ancestorId ?? null,
  };
}
