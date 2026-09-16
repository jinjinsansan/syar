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

import {
  MARGIN,
  ODDS_CAP,
  debiasedProbability,
  oddsFromProbability,
  sellDecision,
  requiredOddsTrials,
  type TicketKind,
} from '@star/betting';

/**
 * レース生成時のモンテカルロ試行数（正典 D-035 の設計式から決まる）。
 *
 * ★ここに数値リテラルを置きません。**上限を動かせば必要な試行数も動く**ので、
 *   `M ≧ λ* × ODDS_CAP / (1−margin)` を式のまま参照します。
 *   独立した数値にすると、上限だけ変えたときに静かに不足します。
 *
 * ⚠️ 正典 §9.2 の 10,000 では足りません（三連単で −20.90pt）。§9.2 の改訂が要ります。
 * ⚠️ 本番機（VPS・16頭立て）で 1レースあたり約 138秒、1周2レースで約 275秒です。
 *    10分サイクルの 46% を使います。★モンテカルロは DB トランザクションの外で走ります。
 */
export const ODDS_MC_TRIALS = requiredOddsTrials();

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
 *   （今は依存方向の都合で複製している）。
 * ⚠️ ★**2026-09-16 訂正**: ★以前ここに「**L-2 の予備軍**」と書いていましたが、
 *    ★正典 §17.1 の **L-2 は景品表示法**で、★**この複製とは無関係**でした。
 *    ★台帳の記号を確かめずに引いたものです。★複製そのものは残っています（★D-052 の対象）。
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
      // ★売る目の判定は `sellDecision` の 1 か所だけ（V-10 と同じ述語・R-30・AUDIT_FIX2 BF-5）。
      //   D-035: 上限に当たる目は売らない。売ると、客は当たっても切り詰められた配当しか受け取れません。
      //          ここで弾くことで、以降のオッズは**必ず上限の内側**に収まります。
      //   D-096: 切り捨て前のオッズが 1.0 倍を下回る目は売らない（当たっても掛け金を下回る配当を売らない）。
      if (sellDecision(betType, probability, trials) !== 'sell') continue;
      const odds = oddsFromProbability(betType, probability, trials);
      // ★cap 判定の raw も補正後で取る。補正前と比べると、D-013 の割り戻しで
      //   下がったぶんまで「cap に当たった」と数えてしまう
      const raw = (1 / debiasedProbability(probability, trials)) * (1 - marginOf(betType));
      rows.push({
        betType,
        selection: keyToSelection(key),
        probability,
        odds,
        // ★D-035 の下で `capped` は決して立ちません（上限に当たる目を売らないため）。
        //   欄は残します — 立ったら「売らない規則が効いていない」ことの証拠になります。
        // ★上限そのものと比べる（2026-09-14）。`odds` は 0.1 単位の切り捨て値（D-094 候補）なので、
        //   `raw > odds` と比べると、切り捨てのたびに「上限に当たった」と数えてしまう
        capped: raw > ODDS_CAP[betType],
      });
    }
  }
  return rows;
}

function marginOf(kind: TicketKind): number {
  // ★balance.ts の MARGIN をそのまま使う。ここで数値を持たない（二重管理を避ける）
  return MARGIN[kind];
}
