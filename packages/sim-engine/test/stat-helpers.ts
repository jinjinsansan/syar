/** テスト内で使う最小限の統計ヘルパ（エンジン本体は依存ゼロを保つためテスト側に置く） */

export function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function sd(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const m = mean(values);
  return Math.sqrt(values.reduce((acc, v) => acc + (v - m) * (v - m), 0) / values.length);
}
