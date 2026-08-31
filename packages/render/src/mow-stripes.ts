import type { Course } from './course.js';
import type { Ctx2D } from './oblique-draw.js';

/**
 * ★**芝の縞刈り**（設計 1-3・参考映像 1.2 #5）
 *
 * 【参考で見えていること】
 *   参考（`out/judge/ref-size.png` 62s / 90s）の芝には、走路を**横切る**明暗の帯が並びます。
 *   刈り込みの向きで光の反射が変わるためで、実際の競馬場に必ずあるものです。
 *   ★これが無いと芝が**一様な緑の面**になり、引いた画で「塗り潰し」に見えます。
 *   我々の芝は平坦でした（設計 1.2 の表「#5 縞刈り: 参考 あり／我々 なし」）。
 *
 * 【なぜ手続き的に描くか】
 *   素材（タイル）に焼くと、**カメラが寄ったときにタイルの繰り返しが見えます**。
 *   走路の距離 `s` から直接引けば、どの画角でも周期が実寸で一定になります。
 *
 * 【★描く場所を 1 か所にした理由】
 *   横視点は `parallax-plate`、それ以外は `world-textured` と、地面の描き方が 2 つあります。
 *   縞をそれぞれに足すと**2 つの実装**になり、必ず離れます（R-30）。
 *   → **走路の投影として描く**。地面の描き方に依らず、馬と同じカメラに載ります。
 *
 * ⚠️ 乱数・時刻を使いません。`s` と カメラだけの関数です（憲法 4）。
 */

/** 縞 1 本の実寸（m）。刈り込み機の幅に相当する */
export const MOW_STRIPE_PERIOD_M = 10;

/**
 * ★明暗の強さ。**強くしすぎると芝が縞模様の布に見えます。**
 *   実際の縞は反射の差なので、明部と暗部を同じだけ振って平均の明るさを変えないこと。
 */
export const MOW_STRIPE_ALPHA = 0.10;

export interface MowStripeOptions {
  /** 注視点（m）。この前後だけ描く */
  readonly focusS: number;
  /** 描く範囲（注視点からの前後・m） */
  readonly rangeM?: number;
  readonly periodM?: number;
  readonly alpha?: number;
  /**
   * ★走路の外側にも延ばす量（m）。★**既定 0＝走路ちょうど**（2026-08-31・A-10）。
   *
   * ⚠️ ★**既定は 60 でした。** ★註記は「内馬場・外の芝にも縞は続いている」でしたが、
   *    ★**縞の面のほうが、地面より小さい**という食い違いを作っていました:
   *
   *      ★内馬場の芝を描く範囲   w = **−150**（`INFIELD_LAYOUT.infieldInnerW`）
   *      ★縞を描く範囲           w = **−60**（この値）
   *
   *    → ★**縞は地面より 90m 手前で終わり、その縁が「世界の何でもない線」**になります。
   *
   * ★実測（`tools/_gatecross.mjs`・発走のカメラ・表示 10s・seed 42）:
   *    ★縁（w=−60）は画面 **(490,262) → (638,267)** を通り、
   *    ★**発馬機（x 239〜678 / y 232〜323）の真上をほぼ水平に横切ります。**
   *    ★オーナー評「★**ゲートがある地面が別の絵と交差しています**」の正体です。
   *    ★層を止めた差分でも、縞だけが **90,920 画素（9.87%）・全幅**を変えていました。
   *
   * ⚠️ ★**「60 → 200 に広げて画面外へ出す」は採りません。** ★見えにくくしただけです（台帳の作法）。
   * → ★**0 にして、縁を内ラチ・外ラチに一致させます。** ★縁が世界に在る線になるので、
   *   ★どの画角・どのカットでも「何でもない線」が出ません。
   *
   * ⚠️ ★内馬場・外の地面に縞を戻したいときは、★**その面の範囲を渡して**呼ぶこと
   *    （★`INFIELD_LAYOUT` の帯ごとに別々に呼ぶ）。★1 回の呼び出しで走路と内馬場を
   *    ★まとめて塗ると、★**内馬場のダートコースと生垣の上にも緑の縞が乗ります**（★台帳 A-5 の家族）。
   */
  readonly overhangM?: number;
}

/**
 * 走路を横切る明暗の帯を重ねる。**地面を描いたあと・馬を描く前**に呼ぶこと。
 * @param projectGround 世界座標 (s,w) の地面点を画面へ投影する（馬と同じカメラ）
 */
export function drawMowStripes(
  ctx: Ctx2D<unknown>,
  course: Course,
  projectGround: (s: number, w: number) => { readonly x: number; readonly y: number; readonly depth: number },
  viewport: { readonly width: number; readonly height: number },
  opts: MowStripeOptions,
): void {
  const period = opts.periodM ?? MOW_STRIPE_PERIOD_M;
  const alpha = opts.alpha ?? MOW_STRIPE_ALPHA;
  if (!(period > 0) || !(alpha > 0)) return;
  const range = opts.rangeM ?? 600;
  /** ⚠️ ★既定 0 ＝ 走路ちょうど。★上の `overhangM` の註記に理由（A-10）を書いています */
  const overhang = opts.overhangM ?? 0;
  /** ⚠️ ★`-0` を作らないこと（★`Object.is(-0, 0)` は false で、検査が読みにくく落ちます） */
  const w0 = overhang > 0 ? -overhang : 0;
  const w1 = course.widthM + overhang;
  /** ★曲線区間で帯の縁が折れないよう、縞 1 本を s 方向に刻む */
  const SUB_M = Math.max(1, period / 4);

  const from = Math.floor((opts.focusS - range) / period);
  const to = Math.ceil((opts.focusS + range) / period);
  const prevAlpha = ctx.globalAlpha;
  for (let k = from; k <= to; k += 1) {
    const s0 = k * period;
    const s1 = s0 + period;
    // 内側（w0）を s0→s1、外側（w1）を s1→s0 でなぞって多角形にする
    const pts: { x: number; y: number }[] = [];
    let visible = false;
    let behind = false;
    for (let s = s0; s <= s1 + 1e-6; s += SUB_M) {
      const p = projectGround(Math.min(s, s1), w0);
      if (p.depth <= 1) { behind = true; break; }
      pts.push(p);
    }
    if (behind) continue;
    for (let s = s1; s >= s0 - 1e-6; s -= SUB_M) {
      const p = projectGround(Math.max(s, s0), w1);
      if (p.depth <= 1) { behind = true; break; }
      pts.push(p);
    }
    if (behind || pts.length < 3) continue;
    /**
     * ★間引きは**外接矩形の重なり**で見ます。
     *
     * ⚠️ ★最初は「頂点のどれかが画面内か」で見ていて、**帯が 1 本しか出ませんでした。**
     *    帯は走路の内外へ 140m 伸びるので、**画面を横切っていても頂点は全部画面外**です。
     *    ★多角形は、頂点が 1 つも画面に無くても画面を覆えます。
     */
    let minX = pts[0]!.x, maxX = pts[0]!.x, minY = pts[0]!.y, maxY = pts[0]!.y;
    for (const p of pts) {
      if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
    }
    visible = maxX > -20 && minX < viewport.width + 20 && maxY > -20 && minY < viewport.height + 20;
    if (!visible) continue;
    /**
     * ★明部と暗部を交互に、**同じ濃さ**で。片側だけ塗ると芝全体の明るさが変わります。
     */
    const light = ((k % 2) + 2) % 2 === 0;
    ctx.globalAlpha = prevAlpha * alpha;
    ctx.fillStyle = light ? '#eaffd0' : '#0d2408';
    ctx.beginPath();
    ctx.moveTo(pts[0]!.x, pts[0]!.y);
    for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i]!.x, pts[i]!.y);
    ctx.closePath();
    ctx.fill();
  }
  ctx.globalAlpha = prevAlpha;
}
