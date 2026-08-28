/**
 * ★枠番（Layer A・純粋関数）
 *
 * 【なぜ要るか】
 *   ⚠️ `palette.json` は `silk-1` 〜 `silk-18` を ★**18色すべて別々**に持っていました。
 *      ★**意図した設計ではなく、単に頭数ぶん色を割り当てただけ**です。
 *      18頭立てで「いちばん近い2色」の問題に必ずぶつかります。
 *
 *   ★**実際の競馬は 8枠の色を複数頭で共有し、個体は馬番で区別します。**
 *     ★**色は枠、数字は個体。**
 *     → 色は 8色で足り、色覚多様性の要求（アートバイブル §4）も
 *       「色＋数字」の冗長化で自然に満たされます。
 *
 *   D-060 が「**枠番の色分け・馬番は機能的な作法**であり、実在の個人や団体を
 *   指し示すものではない（信号の色や棋譜の記法と同じ）」として明示的に許しています。
 *
 * 【★この層の約束】
 *   純粋関数です。副作用も乱数も時刻もありません。
 */

/**
 * ★馬番 → 枠番（1〜8）。
 *
 * **割り方**（業界共通の作法）:
 *   ・8頭以下 … 1頭ずつ 1枠から
 *   ・9頭以上 … 8で割り、★**余りは外枠から**1頭ずつ多くする
 *
 * 例:
 * ```
 * 12頭  枠1=1 / 枠2=2 / 枠3=3 / 枠4=4 / 枠5=5,6 / 枠6=7,8 / 枠7=9,10 / 枠8=11,12
 * 18頭  枠1=1,2 … 枠6=11,12 / ★枠7=13,14,15 / ★枠8=16,17,18
 *  9頭  枠1=1 … 枠7=7 / ★枠8=8,9
 * ```
 */
export function bracketOf(gate: number, fieldSize: number): number {
  if (!Number.isInteger(gate) || gate < 1) throw new Error(`馬番が不正です: ${gate}`);
  if (!Number.isInteger(fieldSize) || fieldSize < 1) throw new Error(`頭数が不正です: ${fieldSize}`);
  if (gate > fieldSize) throw new Error(`馬番 ${gate} が頭数 ${fieldSize} を超えています`);
  if (fieldSize <= 8) return gate;

  const base = Math.floor(fieldSize / 8);
  const extra = fieldSize % 8;          // ★この数だけ、外枠が1頭多い
  const thin = 8 - extra;               // 内側の「base 頭」の枠の数
  const thinHorses = thin * base;
  if (gate <= thinHorses) return Math.ceil(gate / base);
  return thin + Math.ceil((gate - thinHorses) / (base + 1));
}

/** ★枠番 → パレットの役割名。**色は枠**（個体は馬番で区別する） */
export function frameRoleOf(gate: number, fieldSize: number): `frame-${number}` {
  return `frame-${bracketOf(gate, fieldSize)}`;
}

/**
 * ★**勝負服（上着）の色は馬ごとに違えます**（2026-08-28・オーナー指摘①）
 *
 * 【なぜ】オーナー評「相変わらず騎手の色が同じ人がいる」。
 *   ★2026-08-27 に一度「現状維持（色は枠）」と決めましたが、★**実画面で不合格**でした。
 *
 * 【★実際の競馬の形に合わせる】
 *   ★**枠色が付くのは帽子（と鞍布）だけ**で、★**勝負服は馬主ごとに全頭違います。**
 *   → 帽子＝`frameRoleOf`（8 枠色）／上着＝`silkRoleOf`（馬ごと）。
 *   ⚠️ ★HUD（順位表・隊列バー・名札）は枠色のままです。★帽子と一致します。
 *      2026-08-22 に「HUD と馬の色が食い違う」を是正した経緯があるので、
 *      ★**HUD を動かさない**ことでその是正を保ちます。
 *
 * 【★色は既にある `palette.json` の `silk-1`〜`silk-18` を使う】
 *   ⚠️ ★新しく選び直していません（R-30: 指標も色も、まず既にある実装を使う）。
 *   ★ただし**18 色をそのまま馬番順に配ると、いちばん近い 2 色が 27.6** で
 *     道具の目安 30 を下回ります（`tools/pick-silk-palette.mjs` の判定式）。
 *   → ★**18 色の中から「いちばん近い 2 色の距離」が最大になる 12 色**を選びました。
 *     ★その並びで **38.8**（目安 30・色を選び直した場合の 34.0 より良い）。
 */
const SILK_ORDER_12: readonly number[] = [1, 2, 4, 5, 6, 7, 8, 9, 10, 12, 14, 17];

export function silkRoleOf(gate: number, fieldSize: number): `silk-${number}` {
  if (!Number.isInteger(gate) || gate < 1) throw new Error(`馬番が不正です: ${gate}`);
  /**
   * ⚠️ ★13 頭以上は 18 色をそのまま使います（いちばん近い 2 色は 27.5）。
   *    ★目安を下回るので、★**その頭数を出すなら色の選び直しが要ります。**
   */
  if (fieldSize > SILK_ORDER_12.length) return `silk-${Math.min(18, gate)}`;
  return `silk-${SILK_ORDER_12[gate - 1] ?? gate}`;
}

/**
 * ★枠色の並び（業界共通の作法）。
 *   ⚠️ **実在団体の意匠ではありません**（信号の色と同じ機能的な符号）。
 *   ★**必ず馬番と併記**すること（アートバイブル §4・色覚多様性）。
 */
export const FRAME_LABELS: readonly string[] = ['白', '黒', '赤', '青', '黄', '緑', '橙', '桃'];
