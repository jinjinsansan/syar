/**
 * JSON 出力の共通ヘルパ（M-5 / K-b / O-7）
 *
 * JSON では非有限値（Infinity / -Infinity / NaN）がすべて `null` になり、**区別がつかない**。
 * L-1 の確認時、`clamp: null` が「NaN のまま（未修正）」なのか「Infinity（修正済み）」なのか
 * JSON からは判別できず、本番経路を直接叩く手間が余分に発生した。
 * **直ったかを判定したい場面で見分けがつかない**のは実害なので、文字列化して残す。
 *
 * ★ここに切り出した理由（O-7）: `simulate.ts` にだけ置いてあり、`verify-race.ts` の
 *   `--json` は素の `JSON.stringify` を使っていた。**K-b で宣言した型がどこからも
 *   使われていない**状態で、宣言と実装が食い違っていた（M-1 と同じクラス）。
 */

/** シリアライズ後の数値の型。`SerializeNumbers<T>` で再帰的に置き換える */
export type SerializedNumber = number | 'Infinity' | '-Infinity' | 'NaN';

/** 再帰的に `number` を `SerializedNumber` へ置き換える */
export type SerializeNumbers<T> = T extends number
  ? SerializedNumber
  : T extends readonly (infer U)[]
    ? readonly SerializeNumbers<U>[]
    : T extends object
      ? { [K in keyof T]: SerializeNumbers<T[K]> }
      : T;

export function jsonSafeNumber(_key: string, value: unknown): unknown {
  if (typeof value === 'number' && !Number.isFinite(value)) {
    return Number.isNaN(value) ? 'NaN' : value > 0 ? 'Infinity' : '-Infinity';
  }
  return value;
}

/** 非有限値を文字列化して JSON 文字列にする。**`--json` はすべてこれを通すこと** */
export function toSafeJson(value: unknown, indent = 2): string {
  return JSON.stringify(value, jsonSafeNumber, indent);
}
