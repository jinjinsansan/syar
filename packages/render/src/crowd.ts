import type { Ctx2D } from './oblique-draw.js';

/**
 * ★**満員のスタンド**（設計 2-1・デザイナー依頼 D-1 の代替）
 *
 * 【なぜ最優先か】
 *   参考の引きのカット（`out/judge/ref-high.png` 67s / 69s）は、**馬が画面の 10%** しか
 *   ないのに絵として成立します。成立させているのは馬ではなく**背景の情報量**で、
 *   その大半が**数千人の観客の粒**です。
 *   我々の `stand.png` / `world-panorama.png` は★**一人もいない空席**でした。
 *   報告①「画面が芝で埋まっている」の主因のひとつです。
 *
 * 【なぜ素材を待たずに描くか】
 *   D-1（満員スタンドの帯）はデザイナー依頼ですが、**観客の粒は絵ではなく分布**です。
 *   手で描いても点を並べるだけなので、**焼き込みで作れます。**
 *   絵として作り込む必要があるのは屋根・柱・階段で、それは既存素材にあります。
 *
 * 【★毎コマ描かない】
 *   数万個の点を毎コマ描くと重すぎます。**タイルに 1 度だけ焼き込み**、
 *   以後はそのタイルを貼るだけにします（`paintCrowd` は起動時に 1 回だけ呼ぶ）。
 *
 * ⚠️ 乱数を使いません。座標とシードのハッシュで決めるので、**何度焼いても同じ絵**です（憲法 4）。
 */

/**
 * ★座席らしさ（0〜1）。0 なら人を置かない。
 *
 *   真偽ではなく**重み**にしている理由: 屋根の下は暗く、開放スタンドは明るい。
 *   同じ密度・同じ明るさで人を置くと、★**屋根の下と外の区別が消えて、
 *   スタンドが平らな 1 枚の面**になります（実際にそうなりました）。
 *   重みにしておけば、暗いところは自動的にまばらで暗くなります。
 */
export type SeatMask = (x: number, y: number) => number;

export interface CrowdOptions {
  /**
   * ★**段の間隔**（px）。素材の階段の 1 段ぶん。
   *   ⚠️ ★格子で並べると**砂嵐**になります。観客席は段になっているので、
   *      人は**段に沿って横一列**に並びます。参考の粒もそう見えます。
   *      実測: この素材の階段は 1 段 ≒ 5px。
   */
  readonly rowPitchPx?: number | undefined;
  /** 1 段の中で人が並ぶ間隔（px） */
  readonly seatPitchPx?: number | undefined;
  /** ハッシュのシード（違う値にすると別の群衆になる） */
  readonly seed?: number | undefined;
  /** 1 人の幅（px） */
  readonly dotPx?: number | undefined;
  /** 全体の濃さ。★1 にすると素材の段の陰影が消え、スタンドが平らな面になります */
  readonly alpha?: number | undefined;
  /** 空席の割合（0〜1）。0 だと隙間なく埋まって不自然 */
  readonly emptyRatio?: number | undefined;
}

/**
 * ★観客の粒の色。**明るい肌・白・淡色の服が主で、時々はっきりした色**。
 *   参考の粒は遠目には「暗い塊に明るい斑」で、彩度の高い色は少数です。
 *   ⚠️ 派手な色を均等に混ぜると**紙吹雪**に見えます。
 */
const CROWD_COLORS: readonly string[] = [
  // 肌・淡色（いちばん多い）
  '#c3ae95', '#d2c1ab', '#b39c82', '#dcd0bd', '#a8917a', '#c9b6a0',
  '#c3ae95', '#d2c1ab', '#b39c82', '#dcd0bd', '#a8917a', '#c9b6a0',
  // 灰・紺・茶の服
  '#7f8894', '#646d79', '#939aa3', '#535b65', '#6b6257', '#8a8076',
  '#7f8894', '#646d79', '#939aa3', '#535b65',
  // 差し色（少数）
  '#a04a44', '#3d648f', '#b2882f', '#48664a',
];

/** 座標とシードから 0〜1 を決める（乱数ではない・同じ入力なら同じ値） */
function hash01(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2246822519) | 0;
  h = (h ^ (h >>> 13)) | 0;
  h = Math.imul(h, 1274126177) | 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967296;
}

/**
 * 座席の帯に観客の粒を焼き込む。**起動時に 1 度だけ**呼ぶこと。
 *
 * ★毎コマ描かないこと。数千個の点を毎コマ描くと重すぎます。
 *   タイルに焼き込んでしまえば、以後はそのタイルを貼るだけです。
 *
 * @param ctx      すでに素材を描いてあるタイルの描画先
 * @param isSeat   その画素が座席かどうか（呼び出し側が素材の画素から作る）
 * @returns 置いた人数
 */
export function paintCrowd(
  ctx: Ctx2D<unknown>,
  width: number,
  height: number,
  isSeat: SeatMask,
  opts: CrowdOptions = {},
): number {
  const rowPitch = Math.max(2, opts.rowPitchPx ?? 5);
  /**
   * ★**横は詰める。** 満席は肩が触れる密度です。
   *   ⚠️ 2.6px にしていたら**紙吹雪**に見えました（点が離れていて塊にならない）。
   */
  const seatPitch = Math.max(1, opts.seatPitchPx ?? 1.5);
  const seed = opts.seed ?? 20260822;
  const dot = Math.max(1, opts.dotPx ?? 1);
  const alpha = opts.alpha ?? 0.86;
  const empty = Math.min(0.9, Math.max(0, opts.emptyRatio ?? 0.1));
  const prevAlpha = ctx.globalAlpha;
  ctx.globalAlpha = prevAlpha * alpha;
  let placed = 0;
  for (let row = 0; row * rowPitch < height; row += 1) {
    const baseY = Math.round(row * rowPitch);
    for (let i = 0; i * seatPitch < width; i += 1) {
      const x = Math.round(i * seatPitch);
      /**
       * ★段の中で**わずかに上下**させます（±1px）。完全に一直線だと
       *   人ではなく**縞**に見えます。横は動かしません（列が崩れると段が消える）。
       */
      const y = baseY + (hash01(x, baseY, seed) < 0.5 ? 0 : 1);
      if (x < 0 || x >= width || y < 0 || y >= height) continue;
      const weight = isSeat(x, y);
      if (!(weight > 0)) continue;
      // ★暗いところほど空席が増える（＝屋根の下がまばらになる）
      if (hash01(x, y, seed + 13) < 1 - weight * (1 - empty)) continue;
      const color = CROWD_COLORS[Math.floor(hash01(x, y, seed + 29) * CROWD_COLORS.length) % CROWD_COLORS.length]!;
      ctx.globalAlpha = prevAlpha * alpha * (0.4 + 0.6 * weight);
      ctx.fillStyle = color;
      ctx.fillRect(x, y, dot, dot);
      /**
       * ★頭の下に**濃い 1px** を置くと、遠目に「体」ができて粒が人に見えます。
       *   これが無いと、ただの砂嵐になります。
       */
      if (y + dot < height) {
        ctx.fillStyle = 'rgba(16,20,26,.45)';
        ctx.fillRect(x, y + dot, dot, Math.min(2, height - y - dot));
      }
      placed += 1;
    }
  }
  ctx.globalAlpha = prevAlpha;
  return placed;
}

/**
 * ★素材の画素から「座席らしさ」を作る既定の規則。
 *
 *   座席は**低彩度で中〜暗**、屋根は明るく、樹木は緑が強い。
 *   ⚠️ ★これで判定できないときは呼び出し側が別の規則を渡すこと。
 *      `paintCrowd` 自体は規則を持ちません（素材が変わるたびに書き換えたくないので）。
 *
 * @param rgba 元素材の画素（幅×高さ×4）
 */
export function seatMaskFromPixels(
  rgba: Uint8ClampedArray, width: number, height: number,
  opts: { readonly minY?: number | undefined; readonly maxY?: number | undefined } = {},
): SeatMask {
  const minY = opts.minY ?? 0;
  const maxY = opts.maxY ?? height;
  return (x, y) => {
    if (y < minY || y >= maxY) return 0;
    const i = (y * width + x) * 4;
    const a = rgba[i + 3] ?? 0;
    if (a < 200) return 0;                           // 透明（空）には置かない
    const r = rgba[i] ?? 0, g = rgba[i + 1] ?? 0, b = rgba[i + 2] ?? 0;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    if (lum > 150) return 0;                         // 明るい屋根・空
    if (lum < 10) return 0;                          // 真っ黒（影・抜き）
    /**
     * ★樹木には人を植えない。
     * ⚠️ ★最初 `g > r+10 && g > b+10` にしていたら、**木の上に人が乗りました。**
     *    植栽は暗い緑なので差が小さく、この閾値では抜けます。
     *    緑が他の 2 色より少しでも上なら弾く、に変えています。
     */
    if (g >= r && g > b + 4) return 0;
    if (max - min >= 70) return 0;                   // 高彩度＝座席ではない
    /**
     * ★明るさを重みにする。実測（`stand.png`）:
     *   屋根の下 lum 15〜30 ／ 開放スタンド lum 25〜39。
     *   ⚠️ 数字は素材ごとに違います。**当て推量で書かず、行ごとの平均を出してから**決めること。
     */
    return Math.max(0.25, Math.min(1, (lum - 12) / 26));
  };
}

/**
 * ★**座席の帯を素材から見つける**（屋根の下から下端まで）。
 *
 * 【なぜ自動で出すか】
 *   最初は `minY: 78` のように**数字を手で書いて**いました。素材を差し替えた瞬間に
 *   ★**黙って屋根の上に人が並びます**（R-30 の「素材が変わっても道具は気づかない」形）。
 *   屋根は素材の上部にある**明るい帯**なので、そこを画素から見つけて下側だけを使います。
 *
 * @returns 人を置いてよい y の範囲。見つからなければ全体
 */
export function seatBandFromPixels(
  rgba: Uint8ClampedArray, width: number, height: number,
  opts: { readonly roofSearchRatio?: number | undefined; readonly roofLum?: number | undefined } = {},
): { readonly minY: number; readonly maxY: number } {
  const searchTo = Math.max(1, Math.floor(height * (opts.roofSearchRatio ?? 0.35)));
  /**
 * ★実測で決めた閾値（`stand.png` の行平均）: 屋根 59〜105 ／ その下 15〜40。
 *   ⚠️ 最初 90 にしていたら**屋根を見つけられず**、人が屋根の上に並びました。
 */
  const roofLum = opts.roofLum ?? 50;
  let lastBright = -1;
  for (let y = 0; y < searchTo; y += 1) {
    let sum = 0, n = 0;
    // ★行全体を舐めると重いので間引く。屋根は横一様なので十分
    for (let x = 0; x < width; x += 7) {
      const i = (y * width + x) * 4;
      if ((rgba[i + 3] ?? 0) < 200) continue;
      sum += 0.299 * (rgba[i] ?? 0) + 0.587 * (rgba[i + 1] ?? 0) + 0.114 * (rgba[i + 2] ?? 0);
      n += 1;
    }
    if (n > 0 && sum / n > roofLum) lastBright = y;
  }
  return { minY: lastBright + 1, maxY: height };
}
