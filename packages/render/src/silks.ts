/**
 * ★**勝負服の色（出どころは 1 か所）**（★裁定 `REVIEW_HORSE_IDENTITY_VERDICT_20260923.md` §2・2026-09-23）
 *
 * 【★なぜここに移したか】
 *   ★色の定義は `apps/web/src/lib/setup.ts` に在り、★**初回設定の画面だけが**使っていた。
 *   ★利用者が選んだ色は `users.silk_color` に保存されるが、★**読む側が 1 件も無かった**
 *   （★D-119 の族 — ★書く側だけ在って、読む側が無い）。
 *   → ★裁定の条件 2「色の出どころは 1 か所（`packages/`）。★画面・レースの描画・厩舎が同じ関数を呼ぶ」。
 *
 * 【★規則は 1 本】（★裁定 §2 条件 1）
 *   ★**持ち主が居る馬は、その持ち主の勝負服の色**。★NPC の馬は ★**今までどおり枠から**。
 *   ⚠️ ★「持ち主が居るか」だけで分ける。★色の出どころを 2 つにしない。
 *
 * 【★この色は強さを一切含まない】（★裁定 §2 条件 3・D-114）
 *   ★16 色は利用者が選ぶだけ。★素質・能力・調子とは無関係。
 */

/** ★勝負服の配色（★アートバイブル §4 の高彩度 16 色）。★自由入力は不可 — ★芝・ダートと同化する中間色を除いてある */
export interface SilkColor { readonly key: string; readonly label: string; readonly hex: string }

export const SILK_COLORS: readonly SilkColor[] = [
  { key: 'vermilion', label: '朱', hex: '#d62f26' },
  { key: 'orange', label: '橙', hex: '#e0561f' },
  { key: 'amber', label: '山吹', hex: '#f2b012' },
  { key: 'yellow', label: '黄', hex: '#f6e04b' },
  { key: 'chartreuse', label: '若草', hex: '#8ec63f' },
  { key: 'green', label: '緑', hex: '#12a05a' },
  { key: 'teal', label: '青緑', hex: '#0fb0a6' },
  { key: 'blue', label: '青', hex: '#1a6fd4' },
  { key: 'navy', label: '紺', hex: '#1a3fa0' },
  { key: 'violet', label: '紫', hex: '#6b3fc4' },
  { key: 'magenta', label: '紅紫', hex: '#b3306e' },
  { key: 'pink', label: '桃', hex: '#f58fb4' },
  { key: 'brown', label: '茶', hex: '#7b4a1e' },
  { key: 'black', label: '黒', hex: '#111318' },
  { key: 'white', label: '白', hex: '#ffffff' },
  { key: 'silver', label: '銀', hex: '#c9ced6' },
];

/** ★袖の 3 択（★同じ色／白／黒） */
export type Sleeve = 'same' | 'white' | 'black';
export const SLEEVES: readonly { readonly key: Sleeve; readonly label: string }[] = [
  { key: 'same', label: '同じ色' },
  { key: 'white', label: '白' },
  { key: 'black', label: '黒' },
];

export function sleeveHex(sleeve: Sleeve, bodyHex: string): string {
  return sleeve === 'same' ? bodyHex : sleeve === 'white' ? '#ffffff' : '#111318';
}

/** ★画面に出す 1 頭ぶんの勝負服 */
export interface Silks {
  readonly bodyHex: string;
  readonly sleeveHex: string;
  /** ★その色の呼び名（★「青の勝負服」のように言葉で出すため） */
  readonly label: string;
}

/** ★既定（★選んでいない・読めないとき）。★`/setup` の初期値と同じ「青」 */
const DEFAULT_KEY = 'blue';

/**
 * ★**持ち主の勝負服**（★`users.silk_color` / `users.silk_sleeve` から）。
 *
 * ⚠️ ★知らない色の鍵が来たら ★**既定に倒します**（★画面を止めない）。
 *    ★鍵は `/setup` が選ばせた 16 個のどれかのはずで、★外れたら DB か画面のどちらかが壊れています。
 *    ★倒したことを呼ぶ側が知りたい場合のため、★`known` を返します。
 */
export function ownerSilksOf(input: {
  readonly silkColor: string | null | undefined;
  readonly silkSleeve: string | null | undefined;
}): Silks & { readonly known: boolean } {
  const found = SILK_COLORS.find((c) => c.key === input.silkColor);
  const color = found ?? SILK_COLORS.find((c) => c.key === DEFAULT_KEY)!;
  const sleeve: Sleeve = input.silkSleeve === 'white' || input.silkSleeve === 'black' ? input.silkSleeve : 'same';
  return {
    bodyHex: color.hex,
    sleeveHex: sleeveHex(sleeve, color.hex),
    label: color.label,
    known: found !== undefined,
  };
}

/**
 * ★**その馬を、持ち主の色で描くか**（★規則は 1 本・裁定 §2 条件 1）。
 *
 *   ★`ownerId` が `null`（★NPC の馬）→ ★`null` を返す ＝ ★**今までどおり枠から**決める。
 *   ★持ち主が居る → ★その持ち主の勝負服。
 *
 * ⚠️ ★枠番をこの関数に渡さないこと。★枠の色（ゼッケン・`POST`）は別の役割です。
 */
export function silksForHorse(input: {
  readonly ownerId: string | null | undefined;
  readonly silkColor: string | null | undefined;
  readonly silkSleeve: string | null | undefined;
}): Silks | null {
  if (input.ownerId === null || input.ownerId === undefined) return null;
  const { bodyHex, sleeveHex: sh, label } = ownerSilksOf(input);
  return { bodyHex, sleeveHex: sh, label };
}
