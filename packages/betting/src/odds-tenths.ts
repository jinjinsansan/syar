/**
 * ★オッズを 0.1 単位の整数（tenths）で扱う（正典 §9.2 ／ オーナー決定 2026-09-14・D-094 候補）
 *
 * 【決定】
 *   表示・保存・払戻のすべてで、**同じ 0.1 単位の切り捨て値**を使う。DB の列型に丸めを任せない。
 *   払戻は**整数だけ**で計算する（浮動小数を経由しない）。
 *   tenths は「オッズ × 10」の整数。2.3 倍なら 23。
 *
 * 【なぜ（監査 H-1・H-2 ／ REPORT_AUDIT_20260914.md）】
 *   H-1  払戻を `Math.floor(stake × odds)` の浮動小数で計算していた。
 *        `100 × 2.3 = 229.99999999999997 → 229`。999,000 通り中 31,577 通り（3.16%）で 1 PP 少なかった。
 *   H-2  丸めない値を `numeric(9,1)` の列に入れ、**DB の四捨五入**で保存していた（切り上がる目があった）。
 *
 * 【ここに置くもの】
 *   - 切り捨て（オッズを作る側）  … `floorOddsToTenths`
 *   - 読み戻し（払う側の入口）    … `oddsTenthsFromDecimalString`（DB の文字列）／ `oddsTenthsFromNumber`
 *   ★0.1 単位に乗らない値・解釈できない値は**例外**にする。黙って丸めない（R-3）。
 */

/**
 * ★扱える最大の tenths。`numeric(9,1)` の最大 99,999,999.9 倍に合わせる。
 *   §9.4 の上限（三連単 100,000 倍 = 1,000,000 tenths）より十分大きい。
 */
export const MAX_ODDS_TENTHS = 999_999_999;

/**
 * ★「格子ちょうど」とみなす許容幅（tenths 単位）。
 *
 * 【何を防ぐか】
 *   本来 2.3 ちょうどの値が浮動小数で `2.2999999999999998` と表されると、
 *   素直な切り捨ては **2.2** を返す（1 段下がる）。
 *
 * 【なぜ 1e-6 か】
 *   - 誤差の側: オッズの計算 `(1 − margin) / (p + (1 − p) / M)` は四則 4 回で、相対誤差は高々 1e-15 の桁。
 *     tenths は §9.4 の上限でも 1,000,000 なので、絶対誤差は高々 1e-9 tenths の桁。**許容幅はその 1,000 倍**。
 *   - 取り違えの側: 本当に格子の 1e-6 tenths 下（= 1e-7 倍下）にある値を格子へ寄せても、
 *     本来の値との差は 1e-7 倍以下。1 点の最大額 10,000 EP でも払戻の差は 0.001 PP に届かない。
 */
export const ODDS_GRID_EPSILON_TENTHS = 1e-6;

function assertTenths(tenths: number, what: string): number {
  if (!Number.isSafeInteger(tenths) || tenths < 0 || tenths > MAX_ODDS_TENTHS) {
    throw new Error(`${what}: オッズ（0.1 単位の整数）が範囲外です: ${tenths}`);
  }
  return tenths;
}

/**
 * ★オッズを 0.1 単位で**切り捨て**、tenths の整数で返す（オッズを作る側）。
 *   格子ちょうどの値が浮動小数で下側に表されていても、1 段下げない（`ODDS_GRID_EPSILON_TENTHS`）。
 */
export function floorOddsToTenths(odds: number): number {
  if (!Number.isFinite(odds) || odds < 0) {
    throw new Error(`floorOddsToTenths: オッズが不正です (${odds})`);
  }
  const t = odds * 10;
  const nearest = Math.round(t);
  const tenths = Math.abs(t - nearest) <= ODDS_GRID_EPSILON_TENTHS ? nearest : Math.floor(t);
  return assertTenths(tenths, 'floorOddsToTenths');
}

/** `numeric(9,1)` が返す十進の文字列。整数部 8 桁まで・小数は 1 桁（後ろの 0 は許す） */
const DECIMAL_ODDS = /^(0|[1-9][0-9]{0,7})(?:\.([0-9])0*)?$/;

/**
 * ★DB の文字列（`"2.3"`）から、**浮動小数を経由せずに** tenths を得る（払う側の入口）。
 *   `pg` は `numeric` を文字列で返す（`apps/worker/src/pg-types.ts` は numeric を変換しない）。
 *   ⚠️ `Number("2.3")` を通すと、その時点で誤差の入口になる（裁定 §3-4）。
 */
export function oddsTenthsFromDecimalString(text: string): number {
  if (typeof text !== 'string') {
    throw new Error(`oddsTenthsFromDecimalString: 文字列ではありません (${String(text)})`);
  }
  const m = DECIMAL_ODDS.exec(text);
  if (m === null) {
    throw new Error(`oddsTenthsFromDecimalString: オッズを 0.1 単位で読めません: "${text}"`);
  }
  const whole = Number(m[1]);
  const tenth = m[2] === undefined ? 0 : Number(m[2]);
  return assertTenths(whole * 10 + tenth, 'oddsTenthsFromDecimalString');
}

/**
 * ★数値のオッズから tenths を得る。**0.1 単位に乗っていなければ例外**（黙って丸めない・R-3）。
 *   `oddsFromProbability` の戻り値（tenths / 10）はここを誤差なく往復する。
 */
export function oddsTenthsFromNumber(odds: number): number {
  if (typeof odds !== 'number' || !Number.isFinite(odds) || odds < 0) {
    throw new Error(`oddsTenthsFromNumber: オッズが不正です (${String(odds)})`);
  }
  const t = odds * 10;
  const nearest = Math.round(t);
  if (Math.abs(t - nearest) > ODDS_GRID_EPSILON_TENTHS) {
    throw new Error(`oddsTenthsFromNumber: オッズが 0.1 単位に乗っていません (${odds})`);
  }
  return assertTenths(nearest, 'oddsTenthsFromNumber');
}
