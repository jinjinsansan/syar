/** 統計ヘルパ（純粋関数・依存なし） */

export function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

/** 母集団標準偏差 */
export function sd(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const m = mean(values);
  let acc = 0;
  for (const v of values) acc += (v - m) * (v - m);
  return Math.sqrt(acc / values.length);
}

export function min(values: readonly number[]): number {
  if (values.length === 0) return 0;
  let out = Number.POSITIVE_INFINITY;
  for (const v of values) if (v < out) out = v;
  return out;
}

export function max(values: readonly number[]): number {
  if (values.length === 0) return 0;
  let out = Number.NEGATIVE_INFINITY;
  for (const v of values) if (v > out) out = v;
  return out;
}

/** 線形補間なしの分位点（ソート済み配列を受け取る） */
export function quantileSorted(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))));
  return sorted[idx] ?? 0;
}

/** 変動係数 = SD / 平均 */
export function coefficientOfVariation(values: readonly number[]): number {
  const m = mean(values);
  if (m === 0) return 0;
  return sd(values) / m;
}

/** 最小二乗法による回帰直線の傾き（xs 1単位あたりの ys の変化量） */
export function linearSlope(xs: readonly number[], ys: readonly number[]): number {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return 0;
  const mx = mean(xs.slice(0, n));
  const my = mean(ys.slice(0, n));
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    const dx = (xs[i] ?? 0) - mx;
    sxy += dx * ((ys[i] ?? 0) - my);
    sxx += dx * dx;
  }
  if (sxx === 0) return 0;
  return sxy / sxx;
}

/** ピアソン相関係数 */
export function correlation(xs: readonly number[], ys: readonly number[]): number {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return 0;
  const mx = mean(xs.slice(0, n));
  const my = mean(ys.slice(0, n));
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = (xs[i] ?? 0) - mx;
    const dy = (ys[i] ?? 0) - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  if (sxx === 0 || syy === 0) return 0;
  return sxy / Math.sqrt(sxx * syy);
}

export function round(value: number, digits: number): number {
  const f = Math.pow(10, digits);
  return Math.round(value * f) / f;
}
