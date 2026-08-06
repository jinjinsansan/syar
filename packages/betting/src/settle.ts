/**
 * 的中判定と払戻（正典 §9.1・§9.2）
 *
 * 【この層が守ること】
 *   - 払戻は `oddsAtPurchase` だけを使う（現在のオッズを参照しない・§9.2）
 *   - 取消・除外馬を含む馬券は**全額返還**。返還は EP、的中払戻は PP（§9・憲法 §0.2）
 *   - 同着は**均等分割**（§9.1）
 *
 * 【意図的に持たないもの】
 *   残高・時刻・DB。それらは呼び出し側（RPC）の責務で、ここは純関数に保つ。
 *   ⚠️ **EP 減算と馬券発行の原子性（A-5）はここでは担保できない** — 同一トランザクションで
 *      行う必要があり、Postgres 関数側の仕事（§14.4）。
 */

import { placeDepth } from './balance.js';
import { TICKET_ARITY, ep, pp } from './types.js';
import type { EntryPoints, PrizePoints, RaceOutcome, Selection, Ticket } from './types.js';

/** 買い目が形として正しいか（頭数・重複・馬番の範囲） */
export function isWellFormed(selection: Selection, fieldSize: number): boolean {
  const need = TICKET_ARITY[selection.kind];
  if (selection.horses.length !== need) return false;
  if (new Set(selection.horses).size !== need) return false;
  return selection.horses.every((h) => Number.isInteger(h) && h >= 1 && h <= fieldSize);
}

/** 同着を考慮した「その馬の着順」。1始まり。同着は同じ値を返す */
export function finishRankOf(outcome: RaceOutcome, horse: number): number | null {
  const idx = outcome.order.indexOf(horse);
  if (idx < 0) return null;
  const group = outcome.deadHeats?.find((g) => g.includes(horse));
  if (group === undefined) return idx + 1;
  // 同着グループは、その中で最も上の着順を全員が共有する
  const best = Math.min(...group.map((h) => outcome.order.indexOf(h)).filter((i) => i >= 0));
  return best + 1;
}

/**
 * 的中したか。
 * @returns 的中していれば「同着による分割数」（通常1）、外れなら 0
 */
export function hitMultiplicity(selection: Selection, outcome: RaceOutcome): number {
  const { kind, horses } = selection;
  const ranks = horses.map((h) => finishRankOf(outcome, h));
  if (ranks.some((r) => r === null)) return 0;
  const rs = ranks as number[];

  const depth = placeDepth(outcome.fieldSize);

  switch (kind) {
    case 'win':
      return rs[0] === 1 ? deadHeatSize(outcome, horses[0]!) : 0;
    case 'place':
      return rs[0]! <= depth ? 1 : 0;
    case 'quinella_place':
      // 3着以内（7頭以下は2着以内）に2頭とも入る
      return rs.every((r) => r <= depth) ? 1 : 0;
    case 'quinella':
      return rs.every((r) => r <= 2) ? 1 : 0;
    case 'exacta':
      return rs[0] === 1 && rs[1] === 2 ? 1 : 0;
    case 'trio':
      return rs.every((r) => r <= 3) ? 1 : 0;
    case 'trifecta':
      return rs[0] === 1 && rs[1] === 2 && rs[2] === 3 ? 1 : 0;
    default: {
      // 網羅性は型で保証される。到達したら券種が増えて更新漏れがある
      const never: never = kind;
      throw new Error(`未知の券種: ${String(never)}`);
    }
  }
}

/** その馬が同着グループに属していれば人数、そうでなければ1 */
function deadHeatSize(outcome: RaceOutcome, horse: number): number {
  const g = outcome.deadHeats?.find((x) => x.includes(horse));
  return g === undefined ? 1 : g.length;
}

export interface Settlement {
  /** 的中による払戻（PP）。外れ・返還なら 0 */
  readonly payout: PrizePoints;
  /** 返還（EP）。取消・除外を含む馬券は全額 */
  readonly refund: EntryPoints;
  readonly hit: boolean;
  readonly refunded: boolean;
}

/**
 * 1枚の馬券を精算する。
 *
 * ⚠️ **順序が意味を持つ**: 返還の判定を先に行う。
 *    取消馬を含む馬券は、たまたま的中の形になっていても**返還**（§9.1）。
 */
export function settle(ticket: Ticket, outcome: RaceOutcome): Settlement {
  const scratched = new Set(outcome.scratched ?? []);
  if (ticket.selection.horses.some((h) => scratched.has(h))) {
    return { payout: pp(0), refund: ep(ticket.stake), hit: false, refunded: true };
  }

  const mult = hitMultiplicity(ticket.selection, outcome);
  if (mult === 0) {
    return { payout: pp(0), refund: ep(0), hit: false, refunded: false };
  }
  // 同着は配当均等分割（§9.1）。切り捨てで発行超過を防ぐ
  const gross = Math.floor((ticket.stake * ticket.oddsAtPurchase) / mult);
  return { payout: pp(gross), refund: ep(0), hit: true, refunded: false };
}
