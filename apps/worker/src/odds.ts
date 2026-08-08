/**
 * オッズ算出（正典 §9.2）— レース生成時にモンテカルロで理論勝率を出す
 *
 * 【★系列の分離（§9.2）】
 *   オッズ算出のシードは**本番確定用（§8.6 の final_seed）とは別系列**でなければなりません。
 *   同じ系列だと「オッズを作った乱数で結果も決まる」ので、
 *   運営が結果を知った上でオッズを付けているのと同じことになります。
 *
 * 【★A-3 で学んだこと】
 *   モンテカルロの試行数 M は**バイアス**を支配し（1/x が凸なのでオッズは系統的に高く出る）、
 *   レース数は**精度**を支配します。ここは1レースの推定なので M だけが効きます。
 *   §9.2 の 10,000回 を守ります。
 *
 * 【売らない目】
 *   MC で1回も出なかった目は **p̂=0** なので、オッズが定義できません。
 *   ★cap を付けて売るのではなく**売りません**。
 *     売ると「絶対に当たらないはずの目」に賭けさせることになり、
 *     しかも当たったときは cap 上限を払うので運営の損失も読めません。
 */

import { MARGIN, oddsFromProbability, type TicketKind } from '@star/betting';

/** 正典 §9.2: レース生成時のモンテカルロ試行数 */
export const ODDS_MC_TRIALS = 10_000;

export interface OddsRow {
  readonly betType: TicketKind;
  /** 買い目（馬番の配列）。JSON で保存する */
  readonly selection: readonly number[];
  readonly probability: number;
  readonly odds: number;
  readonly capped: boolean;
}

/**
 * 出走順（1着から）の列から、券種ごとの的中目を返す。
 * ★`verify-payout.ts` と同じ規則。二重管理を避けるため、将来は共通化する
 *   （今は依存方向の都合で複製している。★L-2 の予備軍として記録しておく）
 */
export function winningKeys(kind: TicketKind, order: readonly number[], placeDepth: number): string[] {
  const sorted = (xs: number[]): string => [...xs].sort((a, b) => a - b).join('-');
  switch (kind) {
    case 'win': return [String(order[0])];
    case 'place': return order.slice(0, placeDepth).map(String);
    case 'quinella_place': {
      const top = order.slice(0, placeDepth);
      const out: string[] = [];
      for (let i = 0; i < top.length; i += 1) {
        for (let j = i + 1; j < top.length; j += 1) out.push(sorted([top[i]!, top[j]!]));
      }
      return out;
    }
    case 'quinella': return [sorted([order[0]!, order[1]!])];
    case 'exacta': return [`${order[0]}>${order[1]}`];
    case 'trio': return [sorted([order[0]!, order[1]!, order[2]!])];
    case 'trifecta': return [`${order[0]}>${order[1]}>${order[2]}`];
    default: {
      const never: never = kind;
      throw new Error(String(never));
    }
  }
}

/** キー文字列を馬番の配列に戻す（DB には配列で保存する） */
export function keyToSelection(key: string): number[] {
  if (key.includes('>')) return key.split('>').map(Number);
  if (key.includes('-')) return key.split('-').map(Number);
  return [Number(key)];
}

/**
 * 的中回数の集計からオッズ表を作る。
 * @param counts 券種 → 的中目キー → 回数
 */
export function buildOddsRows(
  counts: ReadonlyMap<TicketKind, ReadonlyMap<string, number>>,
  trials: number,
): OddsRow[] {
  if (trials <= 0) throw new Error('buildOddsRows: 試行数が 0 以下です');
  const rows: OddsRow[] = [];
  for (const [betType, m] of counts) {
    for (const [key, c] of m) {
      // ★1回も出なかった目はそもそもここに現れない（= 売らない）
      const probability = c / trials;
      const odds = oddsFromProbability(betType, probability);
      const raw = (1 / probability) * (1 - marginOf(betType));
      rows.push({
        betType,
        selection: keyToSelection(key),
        probability,
        odds,
        // ★上限に当たったことを記録する。§9.4 が「到達時は表示に明示」と定めている
        capped: raw > odds,
      });
    }
  }
  return rows;
}

function marginOf(kind: TicketKind): number {
  // ★balance.ts の MARGIN をそのまま使う。ここで数値を持たない（二重管理を避ける）
  return MARGIN[kind];
}
