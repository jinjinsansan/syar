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
/**
 * ★**実際の競走馬の毛色に揃えます**（2026-08-28・オーナー要望）。
 *
 *   > JRA のレースに登録されている馬の毛の色通りに馬の毛もある程度変えてください
 *
 *   ★公式に区分されるのは 8 種: 栗毛・栃栗毛・鹿毛・黒鹿毛・青鹿毛・青毛・芦毛・白毛。
 *   ★このうち **7 種**を持ちます。★**白毛は入れません** — 実在の登録頭数で 0.1% 未満の
 *     珍しさで、12 頭立てに 1 頭いると「珍しい」ではなく「変」になります。
 *
 * ⚠️ ★以前は 5 種で、しかも**茶系どうしの差が小さく**、12 頭中 10 頭が同じ茶色に見えていました。
 *    ★オーナー評「馬の毛も変えてください」。→ 茶系の差を広げ、栃栗毛・青鹿毛を足しました。
 *
 * ★変換は「素材（鹿毛）からの差」です。★**鹿毛は素材そのまま**（変換なし）。
 */
export const COAT_TRANSFORMS = {
  /** ★鹿毛（かげ）— いちばん多い。素材そのまま */
  bay: undefined,
  /** ★栗毛（くりげ）— 赤みが強く明るい。★差を広げた（10/1.15/1.1 → 16/1.42/1.24） */
  chestnut: { hueRotate: 16, saturate: 1.42, brightness: 1.24 },
  /** ★栃栗毛（とちくりげ）— 栗毛の暗い側。赤みは残して落とす */
  'liver-chestnut': { hueRotate: 12, saturate: 1.2, brightness: 0.86 },
  /** ★黒鹿毛（くろかげ）— 鹿毛の暗い側。★0.78 → 0.70 に広げた */
  'dark-bay': { brightness: 0.70, saturate: 0.95 },
  /** ★青鹿毛（あおかげ）— さらに暗く、赤みが落ちる */
  'seal-brown': { brightness: 0.52, saturate: 0.72 },
  /** ★青毛（あおげ）— ほぼ黒。★0.62 → 0.36 に広げた（黒鹿毛と区別がつかなかった） */
  'blue-black': { brightness: 0.36, saturate: 0.38 },
  /**
   * ★芦毛（あしげ）。**彩度を大きく落とす唯一の毛色**なので、素材全体に掛けると騎手の肌まで灰色になります。
   *   馬体の画素だけに掛けるこの経路でのみ使えます。
   */
  grey: { saturate: 0.12, brightness: 1.32, contrast: 0.95 },
} as const satisfies Record<string, CoatTransform | undefined>;

export type CoatName = keyof typeof COAT_TRANSFORMS;

/**
 * ★**毛色の出どころ（1 か所）**（★裁定 `REVIEW_HORSE_IDENTITY_VERDICT_20260923.md` §9・2026-09-23）
 *
 * 【★なぜ馬 ID から引くのか】
 *   ★正典（アートバイブル §3）が「毛色 5 種程度を **馬 ID から決定的に導く**」と書いている。
 *   ★それまでは ★**枠番から**引いていた（`race/page.tsx` の `COAT_BY_GATE`）ため、
 *     ★**同じ馬でも枠が変わると毛色が変わり**、見分けるための仕組みが見分けを壊していた。
 *
 * 【★2026-08-28 のオーナー要望を、どこまで保つか】
 *   ★要望は 2 つあった。① 実在の登録頭数の割合に近づける ② 隣どうしが同じ毛色にならないよう散らす。
 *   ★**① は保つ**（下の重みで引く。★母集団として実在の割合に近づく）。
 *   ⚠️ ★**② は保てない**（★馬 ID は枠順と無関係なので、隣接は起きる）。★裁定 §9 の判断:
 *      ★②が生まれたときの「12 頭中 10 頭が同じ茶色」とは状況が違う（★その後 5 種 → 7 種に広げ、
 *      ★明るさも均等に並べ直した）。★隣接の組数は測って報告する。
 *
 * 【★決定論】（憲法 §1-4）
 *   ★`Math.random()` も `Date.now()` も使わない。★**馬 ID の文字列だけ**から引く。
 *   ★同じ ID は、いつ・どの画面で引いても同じ毛色になる。
 */

/**
 * ★実在の登録頭数のおおよその割合（★`race/page.tsx` の註記と同じ数字）。
 * ⚠️ ★**白毛は入れない** — ★0.1% 未満で、12 頭立てに 1 頭いると「珍しい」ではなく「変」になる
 *    （★`COAT_TRANSFORMS` の註記・2026-08-28）。
 */
export const COAT_WEIGHTS: readonly (readonly [CoatName, number])[] = [
  ['bay', 48],
  ['dark-bay', 22],
  ['chestnut', 15],
  ['grey', 7],
  ['seal-brown', 6],
  ['liver-chestnut', 1.5],
  ['blue-black', 1],
];

/**
 * ★文字列から 0 以上 1 未満の数を作る（★FNV-1a）。
 * ⚠️ ★**同じ文字列は必ず同じ数**になる（★決定論）。★短い ID でも散るよう 32 ビットで混ぜる。
 */
function unitHashOf(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    // ★FNV の素数 16777619 を掛ける（★32 ビットに収める）
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  /**
   * 🔴 ★**最後に混ぜる**（★Murmur3 の仕上げ）。★これが無いと欠陥になります。
   *
   *   ⚠️ ★FNV は ★**最後に読んだ文字が下位ビットにしか効きません**。★uuid は末尾だけが違うので、
   *      ★上位ビットがほぼ同じになり、★**続き番号の馬が同じ毛色に固まりました**。
   *   ✔ ★実測（`tools/measure-coat-distribution.mjs`）: ★12 頭立ての隣接が ★**平均 9.54 組 / 11 組**。
   *      ★混ぜる工程を足して ★**3.4 組前後**（★独立に引いたときの理論値）になりました。
   *   ★測らなければ、★分布だけ見て「合っている」と報告していました。
   */
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return (h >>> 0) / 0x100000000;
}

/**
 * ★**毛色を CSS の `filter` に組み立てる**（★画面が色の式を持たないため・2026-09-23）。
 *
 * ⚠️ ★`COAT_TRANSFORMS` の値は ★**CSS の `filter` と同じ意味**で持っています（★この表の註記）。
 *    ★だから ★**掛け方も 1 か所**にします。★画面ごとに組み立てると、
 *    ★`/design-check` で見せた色と `/train` に出る色がずれます。
 * ⚠️ ★`bay`（鹿毛）は ★**素材そのまま**なので `undefined` を返します（★何も掛けない）。
 */
export function coatCssFilter(coat: CoatName): string | undefined {
  const t: CoatTransform | undefined = COAT_TRANSFORMS[coat];
  if (t === undefined) return undefined;
  const parts: string[] = [];
  if (t.hueRotate !== undefined) parts.push(`hue-rotate(${t.hueRotate}deg)`);
  if (t.saturate !== undefined) parts.push(`saturate(${t.saturate})`);
  if (t.brightness !== undefined) parts.push(`brightness(${t.brightness})`);
  if (t.contrast !== undefined) parts.push(`contrast(${t.contrast})`);
  return parts.length === 0 ? undefined : parts.join(' ');
}

/**
 * ★**馬 ID から毛色を引く**。★これが唯一の出どころ。
 * ⚠️ ★枠番を渡さないこと。★枠の色（ゼッケン・`POST`）は別の役割（★その日の枠）。
 */
export function coatOfHorseId(horseId: string): CoatName {
  const total = COAT_WEIGHTS.reduce((sum, [, w]) => sum + w, 0);
  let x = unitHashOf(horseId) * total;
  for (const [name, w] of COAT_WEIGHTS) {
    x -= w;
    if (x < 0) return name;
  }
  // ★重みの合計との丸め誤差で外れたとき（★いちばん多い毛色に倒す）
  return COAT_WEIGHTS[0]![0];
}

/** The character source is orange, unlike the dark bay photographic source.
 * Calibrate each coat from that source; bay must not bypass recoloring.
 * Both native browser frames and baked atlases use this table.
 */
export const DEFORMED_COAT_TRANSFORMS: Readonly<Record<CoatName, CoatTransform>> = {
  /**
   * ★**7 色を明るさで均等に並べます**（★2026-09-08・オーナー評「暗い 2 色が同じに見える」）
   *
   * ⚠️ ★前の値は暗い側が詰まっていました（★`tools/measure-coat-spread.mjs` の実測）:
   *      ★seal-brown ↔ blue-black ★**10** ／ dark-bay ↔ seal-brown 16 ／ bay ↔ liver-chestnut 16
   *    ★合格線は発明していません。★オーナーが「区別できない」と言った組の実測 ★**20** を線にします。
   *
   * ★**値は手で決めていません。** ★`tools/tune-coat-spread.mjs` が
   *   ★**全組の最小値がいちばん大きくなる**組み合わせを探しました（★探索結果 22）。
   * ⚠️ ★手で 1 つずつ動かすと ★**押した所が別の所で戻ります**（★実測で 3 回起きました）。
   *    ★`dark-bay ↔ seal-brown` を離すと `seal-brown ↔ blue-black` が近づく、の繰り返しです。
   */
  'blue-black': { saturate: 0.30, brightness: 0.10, hueRotate: 180 },
  'seal-brown': { saturate: 0.30, brightness: 0.28, hueRotate: -18 },
  'dark-bay': { saturate: 0.70, brightness: 0.44, hueRotate: -9 },
  'liver-chestnut': { saturate: 0.65, brightness: 0.62, hueRotate: -10 },
  bay: { saturate: 0.60, brightness: 0.82, hueRotate: -5 },
  chestnut: { saturate: 0.80, brightness: 1.02, hueRotate: 5 },
  grey: { saturate: 0.00, brightness: 1.40 },
};

export function isDeformedHorseAsset(prefix: string): boolean {
  return prefix === 'horse-jockey-side-v8' || prefix === 'horse-jockey-diag-front-v4'
    /** ★パドックの歩きのコマ（★2026-09-15・同じデフォルメ馬の絵柄・`tools/publish-walk-frames.mjs`） */
    || prefix === 'horse-jockey-side-walk-v1' || prefix === 'horse-jockey-side-walk-v1b';
}
