/**
 * ★毛色バリエーションを**馬体の画素だけ**に掛ける
 *
 * 【なぜ要るか（2026-08-21 の実害）】
 *   毛色は `ctx.filter`（CSS フィルタ）で作っていました。これは**素材全体**に掛かるので、
 *   芦毛の `saturate(0.12)` は**騎手ごと脱色**します。勝負服は別描画なので色が残り、
 *   ★**肌だけグレー**になっていました（オーナー評「黄色の服の騎手の肌の色がグレー」）。
 *
 *   ⚠️ ★私は最初「芦毛を毛色の割り当てから外す」で片付けました。**問題のすり替えです。**
 *      オーナー指摘: 「消えたはいいですが今後葦毛の馬はどうするのですか？
 *      これは競馬育成ゲームですよ？ 消すのが目的になっていませんか？
 *      **騎手の肌を治すだけなのに**」——そのとおりで、毛色を減らすのは直したことになりません。
 *      ★引用中の他社製品名は憲法1 に従い言い換えています（発言の趣旨は変えていません）。
 *
 * 【どう分けるか — 実測に基づく】
 *   `horse-jockey-side-v7-pose01.png` の R>G>B 画素の分布:
 *
 *     r−g  0〜10 … (141,136,132) ほぼ無彩色 ＝ 勝負服・馬具・ブーツ
 *     r−g 10〜30 … (121,107,95) (104,79,62) ＝ **肌**
 *     r−g 30〜90 … (87,52,30)〜(169,87,33) ＝ **馬体（鹿毛）**
 *
 *   ★**差では分けきれません**（明るい肌 r−g=51 と濃い鹿毛 r−g=35 が重なる）。
 *     **比**なら明確に分かれます:
 *       馬体 g/r 0.51〜0.60 ／ 肌 g/r 0.78〜0.87
 *
 * ⚠️ ★白い靴下・鼻梁の流星は無彩色に寄るので**変換しません**。実馬でも白斑は毛色が変わっても
 *    白いままなので、これは正しい挙動です。黒いたてがみ・脚も同様に残ります。
 */

/** 毛色の変換（CSS フィルタと同じ意味の係数） */
export interface CoatTransform {
  /** 明度。1 で変化なし */
  readonly brightness?: number;
  /** 彩度。1 で変化なし・0 で無彩色 */
  readonly saturate?: number;
  /** コントラスト。1 で変化なし */
  readonly contrast?: number;
  /** 色相の回転（度） */
  readonly hueRotate?: number;
}

/**
 * ★その画素が**馬体**か。
 *
 *   R>G>B（暖色）で、かつ**十分に彩度が高い**もの。
 *   肌（g/r が高い）と無彩色（r−g が小さい）は外します。
 */
export function isHorseCoat(r: number, g: number, b: number): boolean {
  if (!(r > g && g > b)) return false;
  if (r < 24) return false;              // ほぼ黒（たてがみ・脚・影）は残す
  if (r - g < 12) return false;          // 無彩色（服・馬具・白斑）は残す
  return g / r <= 0.70;                  // ★肌（0.78〜0.87）を外す
}

const LUMA_R = 0.2126, LUMA_G = 0.7152, LUMA_B = 0.0722;

/** ★CSS の `hue-rotate` と同じ行列（W3C filter effects の定義） */
function hueMatrix(deg: number): readonly number[] {
  const a = (deg * Math.PI) / 180;
  const c = Math.cos(a), s = Math.sin(a);
  return [
    0.213 + c * 0.787 - s * 0.213, 0.715 - c * 0.715 - s * 0.715, 0.072 - c * 0.072 + s * 0.928,
    0.213 - c * 0.213 + s * 0.143, 0.715 + c * 0.285 + s * 0.140, 0.072 - c * 0.072 - s * 0.283,
    0.213 - c * 0.213 - s * 0.787, 0.715 - c * 0.715 + s * 0.715, 0.072 + c * 0.928 + s * 0.072,
  ];
}

const clamp255 = (v: number): number => (v < 0 ? 0 : v > 255 ? 255 : v);

/**
 * ★1 画素に毛色の変換を掛ける。**順序は CSS の filter と同じ**
 *   （`hue-rotate` → `saturate` → `brightness` → `contrast`）。
 */
export function applyCoat(
  r: number, g: number, b: number, t: CoatTransform,
): readonly [number, number, number] {
  let R = r, G = g, B = b;
  if (t.hueRotate !== undefined && t.hueRotate !== 0) {
    const m = hueMatrix(t.hueRotate);
    const nr = m[0]! * R + m[1]! * G + m[2]! * B;
    const ng = m[3]! * R + m[4]! * G + m[5]! * B;
    const nb = m[6]! * R + m[7]! * G + m[8]! * B;
    R = nr; G = ng; B = nb;
  }
  if (t.saturate !== undefined && t.saturate !== 1) {
    const l = LUMA_R * R + LUMA_G * G + LUMA_B * B;
    R = l + (R - l) * t.saturate;
    G = l + (G - l) * t.saturate;
    B = l + (B - l) * t.saturate;
  }
  if (t.brightness !== undefined && t.brightness !== 1) {
    R *= t.brightness; G *= t.brightness; B *= t.brightness;
  }
  if (t.contrast !== undefined && t.contrast !== 1) {
    R = (R - 127.5) * t.contrast + 127.5;
    G = (G - 127.5) * t.contrast + 127.5;
    B = (B - 127.5) * t.contrast + 127.5;
  }
  return [clamp255(R), clamp255(G), clamp255(B)];
}

/**
 * ★毛色の定義。**`ctx.filter` の文字列と同じ意味**を係数で持ちます。
 *   ⚠️ 文字列のまま `ctx.filter` に渡すと**素材全体**に掛かります。ここは
 *     「馬体の画素だけに掛ける」ために係数で持ちます。
 */
export const COAT_TRANSFORMS = {
  /** 鹿毛（素材そのまま） */
  bay: undefined,
  chestnut: { hueRotate: 10, saturate: 1.15, brightness: 1.1 },
  'dark-bay': { brightness: 0.78, saturate: 0.95 },
  'blue-black': { brightness: 0.62, saturate: 0.6 },
  /**
   * ★芦毛。**彩度を大きく落とす唯一の毛色**なので、素材全体に掛けると騎手の肌まで灰色になります。
   *   馬体の画素だけに掛けるこの経路でのみ使えます。
   */
  grey: { saturate: 0.12, brightness: 1.32, contrast: 0.95 },
} as const satisfies Record<string, CoatTransform | undefined>;

export type CoatName = keyof typeof COAT_TRANSFORMS;
