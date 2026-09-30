/**
 * ★**着順から、券種ごとの当たった組**（★2026-09-30・R-25 D25-4 の払戻の見せ方のため）。
 *   ★規則は `hitMultiplicity`（`settle.ts`）と同じ: 複勝・ワイドは `placeDepth` 着まで、★順不同の組は小さい順。
 * ⚠️ ★ワーカーの `winningKeys`（`apps/worker/src/odds.ts`）と同じ規則の 2 か所目（★簿 D-052・★将来 1 か所へ）。
 * ⚠️ ★同着は扱わない（★着順が一意に並んだ列を渡す）。
 */
import { placeDepth } from './balance.js';
import type { TicketKind } from './types.js';

export function winningSelections(kind: TicketKind, order: readonly number[], fieldSize: number): number[][] {
  const depth = placeDepth(fieldSize);
  const asc = (xs: number[]): number[] => [...xs].sort((a, b) => a - b);
  const top = order.slice(0, depth);
  switch (kind) {
    case 'win': return [[order[0]!]];
    case 'place': return top.map((g) => [g]);
    case 'quinella_place': {
      const out: number[][] = [];
      for (let i = 0; i < top.length; i += 1) for (let j = i + 1; j < top.length; j += 1) out.push(asc([top[i]!, top[j]!]));
      return out;
    }
    case 'quinella': return [asc([order[0]!, order[1]!])];
    case 'exacta': return [[order[0]!, order[1]!]];
    case 'trio': return [asc([order[0]!, order[1]!, order[2]!])];
    case 'trifecta': return [[order[0]!, order[1]!, order[2]!]];
    default: {
      const never: never = kind;
      throw new Error(`未知の券種: ${String(never)}`);
    }
  }
}

/** ★着順どおりに並べる券種（★「→」でつなぐ）。★それ以外は順不同（「−」） */
export function isOrderedKind(kind: TicketKind): boolean {
  return kind === 'exacta' || kind === 'trifecta';
}
