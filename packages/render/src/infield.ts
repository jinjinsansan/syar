import type { Course } from './course.js';
import type { Ctx2D } from './oblique-draw.js';

/**
 * ★**内馬場とダートコース**（設計 2-2・デザイナー依頼 D-2 の代替）
 *
 * 【なぜ最優先なのか】
 *   報告①（`REPORT_P4_REFERENCE4_20260822.md`）の実測:
 *     画面に占める芝の緑  参考 平均 **約 20%** ／ 我々 平均 **約 60%**（3 倍）
 *   引きのカット（`out/judge/ref-high.png` 67s / 85s / 87s）を見ると、
 *   ★**参考の前景の大半は芝ではなく「ダートコース」（灰褐色）**です。
 *   我々の世界には内側にもう 1 周が無いので、**引くと画面が緑一色**になります。
 *
 *   ★これが「俯瞰・後方カットが 5/5 で不合格」の本当の理由だと設計書は述べています
 *   （画角の問題ではなく、引いたときに映すものが世界に無い）。
 *
 * 【★走路の幾何には触れない】
 *   ⚠️ ここで足すのは**描くための帯**だけです。`laneExtraM`・着順・`w` の意味は
 *      一切変えません（憲法 3・D-065 / D-071）。**レースの結果は変わりません。**
 *      未裁定の「600m の曲率不連続（A 幾何／B カメラ）」とも独立です。
 *
 * ⚠️ 実在の競馬場の配置を写しません。我々の架空の競馬場の断面です（憲法 §0.1）。
 * ⚠️ 乱数・時刻を使いません（憲法 4）。
 */

/**
 * ★内側の断面（内ラチ w=0 から**内へ**）。負の値が内側。
 *
 *   内ラチ → 生垣 → ダートコース → 分離の生垣 → 内馬場の芝、の順。
 *   参考の引きの画（67s）で、手前からダート・内ラチ・芝、と並んでいるのに合わせています。
 */
export const INFIELD_LAYOUT = {
  /** 内ラチのすぐ内側の生垣 */
  hedgeInnerW: -1.6,
  hedgeOuterW: -5.0,
  /** ダートコース（褐色） */
  dirtOuterW: -5.0,
  dirtInnerW: -30.0,
  /** ダートの内側の分離帯 */
  innerHedgeOuterW: -30.0,
  innerHedgeInnerW: -33.5,
  /** 内馬場の芝（ここまで描く） */
  infieldInnerW: -150.0,
} as const;

export const INFIELD_COLORS = {
  dirt: '#6d5a45',
  dirtDark: '#5e4d3a',
  dirtLight: '#7b6851',
  hedge: '#1d3a1c',
  infield: '#33562b',
  infieldDark: '#2a4724',
} as const;

export interface InfieldOptions {
  readonly focusS: number;
  readonly rangeM?: number | undefined;
  /** ダートの馬蹄（ハロー目）の間隔（m） */
  readonly harrowM?: number | undefined;
}

/**
 * 内馬場とダートコースを描く。**地面（芝）を敷いたあと・走路の明暗より前**に呼ぶこと。
 */
export function drawInfield(
  ctx: Ctx2D<unknown>,
  course: Course,
  projectGround: (s: number, w: number) => { readonly x: number; readonly y: number; readonly depth: number },
  viewport: { readonly width: number; readonly height: number },
  opts: InfieldOptions,
): void {
  void course;   // ★形は `projectGround` が持つ（走路の幾何には触れない、を型でも示す）
  const range = opts.rangeM ?? 700;
  const from = opts.focusS - range;
  const to = opts.focusS + range;
  /** ★曲線区間で帯の縁が折れないよう刻む。粗いと内ラチが多角形に見えます */
  const STEP_M = 14;

  /**
   * 走路方向に沿った帯を 1 本描く。
   *
   * ⚠️ ★**区間ごとの四角に分けて描くこと。**
   *    最初は「内側の縁を往き、外側の縁を復り」で 1 枚の多角形にしていました。
   *    ところが帯は前後 700m あるので、★**必ずどこかがカメラの後ろに回ります。**
   *    1 点でも後ろなら帯ごと捨てていたので、**ダートが 1 度も描かれませんでした。**
   *    区間ごとなら、後ろに回った区間だけを飛ばせます（`trackBand` と同じ形）。
   */
  const bandChunk = (w0: number, w1: number, color: string): void => {
    ctx.fillStyle = color;
    for (let s = from; s < to; s += STEP_M) {
      const s2 = Math.min(s + STEP_M, to);
      const a = projectGround(s, w0);
      const b = projectGround(s2, w0);
      const c = projectGround(s2, w1);
      const d = projectGround(s, w1);
      if (a.depth <= 1 || b.depth <= 1 || c.depth <= 1 || d.depth <= 1) continue;
      /**
       * ★間引きは**外接矩形の重なり**で。四角は内へ 150m 伸びるので、
       *   画面を覆っていても 4 頂点が全部画面外になりえます（縞刈りで踏んだ形）。
       */
      const minX = Math.min(a.x, b.x, c.x, d.x), maxX = Math.max(a.x, b.x, c.x, d.x);
      const minY = Math.min(a.y, b.y, c.y, d.y), maxY = Math.max(a.y, b.y, c.y, d.y);
      if (maxX < -30 || minX > viewport.width + 30 || maxY < -30 || minY > viewport.height + 30) continue;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y);
      ctx.closePath();
      ctx.fill();
    }
  };

  /**
   * ★**横方向にも刻む。**
   *
   * ⚠️ ★内馬場は内へ 150m あります。走路の脇に据えたカメラから見ると、
   *    ★**いちばん内側の角はカメラの後ろに回ります。** 四角の 1 点でも後ろなら飛ばすので、
   *    **内馬場が 1 度も描かれませんでした**（手前側は見えているのに）。
   *    s 方向を刻んだのと同じ理由で、w 方向も刻みます。
   */
  const band = (wInner: number, wOuter: number, color: string): void => {
    const W_CHUNK_M = 18;
    for (let w = wOuter; w > wInner; w -= W_CHUNK_M) {
      bandChunk(Math.max(wInner, w - W_CHUNK_M), w, color);
    }
  };

  const L = INFIELD_LAYOUT;
  // 内馬場の芝（いちばん内側から）
  band(L.infieldInnerW, L.innerHedgeInnerW, INFIELD_COLORS.infield);
  // 分離の生垣
  band(L.innerHedgeInnerW, L.innerHedgeOuterW, INFIELD_COLORS.hedge);
  // ダートコース
  band(L.dirtInnerW, L.dirtOuterW, INFIELD_COLORS.dirt);
  // 内ラチ内側の生垣
  band(L.hedgeOuterW, L.hedgeInnerW, INFIELD_COLORS.hedge);

  /**
   * ★ダートの**ハロー目**（整地の筋）。
   *   ⚠️ これが無いとダートが**のっぺりした褐色の面**になり、
   *      「芝の隣に茶色い板を置いた」ようにしか見えません。
   */
  const harrow = Math.max(2, opts.harrowM ?? 9);
  const firstK = Math.ceil(from / harrow);
  const lastK = Math.floor(to / harrow);
  const prevAlpha = ctx.globalAlpha;
  ctx.globalAlpha = prevAlpha * 0.32;
  const W_CHUNK_M = 18;
  for (let k = firstK; k <= lastK; k += 1) {
    const s0 = k * harrow;
    const s1 = s0 + harrow * 0.5;
    ctx.fillStyle = ((k % 2) + 2) % 2 === 0 ? INFIELD_COLORS.dirtLight : INFIELD_COLORS.dirtDark;
    // ★ダートも横に刻む（帯と同じ理由）
    for (let w = L.dirtOuterW; w > L.dirtInnerW; w -= W_CHUNK_M) {
      const wIn = Math.max(L.dirtInnerW, w - W_CHUNK_M);
      const a = projectGround(s0, w);
      const b = projectGround(s1, w);
      const c = projectGround(s1, wIn);
      const d = projectGround(s0, wIn);
      if (a.depth <= 1 || b.depth <= 1 || c.depth <= 1 || d.depth <= 1) continue;
      const xs = [a.x, b.x, c.x, d.x], ys = [a.y, b.y, c.y, d.y];
      if (Math.max(...xs) < -30 || Math.min(...xs) > viewport.width + 30) continue;
      if (Math.max(...ys) < -30 || Math.min(...ys) > viewport.height + 30) continue;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y);
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.globalAlpha = prevAlpha;
}
