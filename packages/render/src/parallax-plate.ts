import type { Ctx2D, FontOf } from './oblique-draw.js';

/**
 * ★**ループする多層パララックス背景**（Broadcast V2 の側面ショット用）。
 *
 * ⚠️ 1枚のプレートをクロップして送る方式（旧 `backgroundPlate`）は、
 *    **400m 走って背景が 137px しか動かない**（実測 12px/秒）。馬群を追うカメラでは、
 *    世界は「馬の速度 × その深さの px/m」で流れなければならず（≈1,000px/秒）、
 *    1枚絵ではその速さで流すと 0.2 秒で絵が尽きる。
 *    → 帯ごとに横ループするタイル（`tools/split-parallax-layers.mjs` が生成）を、
 *      **馬群の進行距離 `scrollM`** に比例して流す。速度は使わない（位置から決まる＝決定論）。
 *
 * 各層の px/m は、注視点（馬群）の px/m と深さから **同じ透視カメラの比**で決める:
 *   pxPerM_layer = packPxPerM × packDepthM / (packDepthM + depthOffsetM)
 * 手前（depthOffsetM < 0）ほど速く、奥ほど遅く流れる。
 */
export interface ParallaxLayer<TImage> {
  readonly image: TImage;
  /** タイルの大きさ（画像 px）。横方向にループする */
  readonly width: number;
  readonly height: number;
  /** 元プレート上の帯の位置（プレート px）。縦の合成は旧プレートと同じ枠取りを保つ */
  readonly plateY0: number;
  readonly plateY1: number;
  /** 注視点（馬群）からの奥行き差（m）。＋は奥、−は手前 */
  readonly depthOffsetM: number;
}

/**
 * ★**世界に固定した物体**（決勝線・審判塔など）。層と違いループせず、走路上の距離 `worldS` に立つ。
 *   画面 x は「注視点からの距離 × その深さの px/m」で決まり、同じ深さの層と同じ速さで流れる。
 */
export interface ParallaxObject<TImage> {
  readonly image: TImage;
  readonly width: number;
  readonly height: number;
  /** 元プレート上の帯の位置（プレート px）。縦は層と同じ枠取り */
  readonly plateY0: number;
  /** 画像のどこが `worldS` の位置か（0=左端, 1=右端） */
  readonly anchorXRatio: number;
  /** 走路上の位置（m） */
  readonly worldS: number;
  readonly depthOffsetM: number;
  /** 'front' なら馬の後に描く（発馬機の前枠など）。省略時は層の直後（馬の後ろ） */
  readonly zOrder?: 'behind' | 'front';
  /**
   * ★指定があると、(worldS, worldW) を**実際の透視カメラで投影**して置く（yaw のあるカメラでも合う）。
   *   画像の (anchorXRatio, anchorYRatio) がその点の地面位置。縮尺はプレートと同じ（絵の遠近をそのまま使う）。
   */
  readonly worldW?: number;
  readonly anchorYRatio?: number;
  /** 追加の縮尺（プレート縮尺に掛ける）。発馬機は絵の遠近が馬列より大きいので 0.66 */
  readonly scale?: number;
}

/**
 * ★世界に置く**看板（ビルボード）**: 走路上の (s, w)〜(s, w+widthM) に幅を実寸で合わせて立てる。
 *   発馬機の正面プレートなど。両端の地面点を投影し、その間に画像を貼る（ほぼ正面のカメラ向け）。
 */
export interface WorldBillboard<TImage> {
  readonly image: TImage;
  readonly width: number;
  readonly height: number;
  readonly worldS: number;
  readonly worldW: number;
  readonly widthM: number;
  /** 画像内の描画範囲（透明余白を除いた矩形）。省略時は画像全体。矩形の下端が地面、幅が widthM */
  readonly source?: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
  readonly zOrder?: 'behind' | 'front';
  readonly alpha?: number;
  /**
   * ★**絵に焼き込まれた番号を、コードで描き直す。**
   *
   * ⚠️ ★看板は `w` 軸が画面上で右→左に走るカットでは**左右反転して貼ります**（下の注記）。
   *    ★そのとき**絵の中の数字も裏返ります。** 数字は反転してはいけないので、
   *    ★**板を塗り直して、正しい向きの数字を描きます。**
   * ★比率は素材から実測した値を渡します（目分量で置かない）。
   */
  readonly stallLabels?: GateStallLabels;
}

/**
 * ★発馬機の番号板の位置（`source` 矩形に対する比）と、描き直しの見た目。
 *   ★値は素材から機械で測ります（`tools/_gateplates.mjs`）。
 */
export interface GateStallLabels {
  /** ★板の中心の横位置（`source` 幅に対する比）。**左から順に 1, 2, …** */
  readonly centersXRatio: readonly number[];
  /** ★板の中心の縦位置（`source` 高さに対する比・上から） */
  readonly centerYRatio: number;
  /** ★板の大きさ（`source` に対する比） */
  readonly widthRatio: number;
  readonly heightRatio: number;
  readonly font: FontOf;
  readonly plateColor: string;
  readonly textColor: string;
}

export function drawWorldBillboards<TImage>(
  ctx: Ctx2D<TImage>,
  billboards: readonly WorldBillboard<TImage>[],
  projectGround: (s: number, w: number) => { readonly x: number; readonly y: number; readonly depth: number },
  zOrder: 'behind' | 'front',
  viewportWidth: number,
): void {
  for (const b of billboards) {
    if ((b.zOrder ?? 'behind') !== zOrder) continue;
    const a = projectGround(b.worldS, b.worldW);
    const c = projectGround(b.worldS, b.worldW + b.widthM);
    if (a.depth <= 1.5 || c.depth <= 1.5) continue;
    const left = Math.min(a.x, c.x), right = Math.max(a.x, c.x);
    const w = right - left;
    if (w < 2 || right < 0 || left > viewportWidth) continue;
    const src = b.source ?? { x: 0, y: 0, width: b.width, height: b.height };
    const h = w * (src.height / src.width);
    const bottom = (a.y + c.y) / 2;
    if (b.alpha !== undefined) ctx.globalAlpha = b.alpha;
    /**
     * ★**走路の `w` 軸が画面上で右→左に走るカットでは、絵を左右反転して貼ります。**
     *
     * ⚠️ ★以前は常に「画面 x の小さいほう」を絵の左端としていました。ところが `a` は
     *    `worldW`、`c` は `worldW + widthM` の投影なので、★**カメラによっては `a.x > c.x`**
     *    になります。そのとき絵は**世界と逆向きに貼られます。**
     *
     *    実害（オーナー指摘① 2026-08-27・発走 6.5s・seed 42）: `start-front` は内ラチが
     *    画面右に来るため、馬は画面左から **12→1** の順に並びます。ところが発馬機の絵は
     *    **1→12** と描かれているので、★**看板の番号と、そこに立っている馬が全部食い違って**
     *    いました。オーナーが「左側の1枠の馬」と呼ばれた馬は、実際には**馬番12** です。
     *
     * ★**幾何が正で、看板は飾りです。** 馬の位置は `laneAt`（＝レースの結果の一部・D-065）
     *   から来るので動かせません。★合わせるのは看板の側です。
     * ⚠️ ★素材の絵を描き直す解は採れません。**`w` 軸が左→右のカットで今度は逆になる**ためです。
     */
    const mirrored = a.x > c.x;
    const canMirror = ctx.save !== undefined && ctx.restore !== undefined && ctx.transform !== undefined;
    if (mirrored && canMirror) {
      ctx.save!();
      // ★x = left と x = left + w を入れ替える鏡（left+w への平行移動 → x 反転）
      ctx.transform!(-1, 0, 0, 1, 2 * left + w, 0);
      ctx.drawImage(b.image, src.x, src.y, src.width, src.height, left, bottom - h, w, h);
      ctx.restore!();
    } else {
      // ★`transform` を持たない環境では従来どおり（落とさない・番号以外は左右対称）
      ctx.drawImage(b.image, src.x, src.y, src.width, src.height, left, bottom - h, w, h);
    }
    /**
     * ★**番号は絵ごと反転してしまうので、板を塗り直して正しい向きで描きます。**
     *   ⚠️ ★反転していないときも描きます。★描く/描かないを分けると、
     *      **見え方が 2 通りになり、片方だけ壊れても気づけません**（R-16）。
     */
    if (b.stallLabels !== undefined) {
      const L = b.stallLabels;
      const plateW = w * L.widthRatio, plateH = h * L.heightRatio;
      const cy = (bottom - h) + h * L.centerYRatio;
      const px = Math.max(7, plateH * 0.72);
      for (const [i, r] of L.centersXRatio.entries()) {
        // ★反転しているときは、絵の中の比率も左右が入れ替わる
        const cx = left + w * (mirrored ? 1 - r : r);
        if (cx < -plateW || cx > viewportWidth + plateW) continue;
        ctx.fillStyle = L.plateColor;
        ctx.fillRect(cx - plateW / 2, cy - plateH / 2, plateW, plateH);
        ctx.fillStyle = L.textColor;
        ctx.font = L.font(px, true);
        ctx.textAlign = 'center';
        // ★`textBaseline` は Ctx2D に無いので、ベースラインを自分で置く
        ctx.fillText(String(i + 1), cx, cy + px * 0.36);
      }
    }
    ctx.globalAlpha = 1;
  }
}

/**
 * ★**発馬機（正面）の番号板**。`tools/_gateplates.mjs` で素材から実測した値。
 *
 *   素材 `apps/web/public/art/starting-gate-front-v1.png`（1536×512）の
 *   不透明部分は x=24 y=130 幅 1491 高さ 318。その矩形に対して:
 *     板の中心の縦位置 9.12% / 板の高さ 9.12% / 板の幅 2.62%
 *
 * ⚠️ ★**素材を差し替えたら測り直すこと。** 縦横比と同じく、この値も黙って変わります
 *    （`tools/verify-world-billboards.mjs` の注記と同じ理由）。
 */
export const GATE_FRONT_STALL_PLATES = {
  /**
   * ⚠️ ★**10 番だけは両隣からの補間**（0.7109 と 0.8538 の中点）です。
   *    2 桁の数字が白い板を細かく割るため検出が途中で切れ、中心が 3px ずれました。
   *    ★全体の等間隔から推定すると 0.7768 になりますが、★**この絵の板の間隔は
   *    完全な等間隔ではない**ので、**両隣から取るほうが合います**（実画面で確認済み）。
   */
  centersXRatio: [
    0.1207, 0.1972, 0.2706, 0.3447, 0.4188, 0.4926,
    0.5657, 0.6385, 0.7109, 0.7824, 0.8538, 0.9229,
  ],
  centerYRatio: 0.0912,
  /**
   * ★実測は 幅 2.62% / 高さ 9.12% ですが、★**少し大きく塗ります。**
   *   ⚠️ ★ぴったりにすると、測定の 1〜2px の誤差で**裏返った数字の縁が覗きます**
   *      （実際に 10 番で覗きました）。板は無地の白なので、少し大きい分には見えません。
   */
  widthRatio: 0.0300,
  heightRatio: 0.0960,
} as const;

export interface ParallaxPlate<TImage> {
  readonly plateWidth: number;
  readonly plateHeight: number;
  /** 奥 → 手前の順 */
  readonly layers: readonly ParallaxLayer<TImage>[];
  /** 層の後に描く。省略可 */
  readonly objects?: readonly ParallaxObject<TImage>[];
}

export interface ParallaxDrawOptions {
  readonly viewport: { readonly width: number; readonly height: number };
  /** 旧プレートと同じ枠取り: プレートを zoom 倍に拡大した窓を切る */
  readonly zoom: number;
  /** 縦の窓位置（0=上端, 1=下端）。旧プレートは 0.48 */
  readonly verticalAnchor: number;
  /** 注視点の進行距離（m）。増えるほど世界が `direction` の逆へ流れる */
  readonly scrollM: number;
  /** 注視点での px/m と、カメラから注視点までの深さ（m） */
  readonly packPxPerM: number;
  readonly packDepthM: number;
  /** 注視点が画面上で進む向き（+1=右へ, −1=左へ）。世界はその逆へ流れる */
  readonly direction: 1 | -1;
  /**
   * ★固定物体の基準（m・注視点の**真の**位置）。省略時は scrollM。
   *   層は見た目の進行距離 scrollM で流れるが、物体は馬と同じ真の位置に対して置く
   *   （物体が見える区間では anchor weight=1 で両者の増分は一致し、ずれない）。
   */
  readonly anchorS?: number;
  /** ★世界座標 (s,w) の地面点を画面へ投影する。`worldW` を持つ物体の配置に使う */
  readonly projectGround?: (s: number, w: number) => { readonly x: number; readonly y: number; readonly depth: number };
}

/** 層のスクロール量（画面 px）。テストと描画で同じ式を使う */
export function parallaxLayerShiftPx(
  layer: Pick<ParallaxLayer<unknown>, 'depthOffsetM'>,
  opts: Pick<ParallaxDrawOptions, 'scrollM' | 'packPxPerM' | 'packDepthM' | 'direction'>,
): number {
  const depth = Math.max(0.5, opts.packDepthM + layer.depthOffsetM);
  const pxPerM = opts.packPxPerM * (opts.packDepthM / depth);
  return -opts.direction * opts.scrollM * pxPerM;
}

const wrap = (a: number, n: number): number => ((a % n) + n) % n;

/** 物体だけを描く（`zOrder` で選ぶ）。層は描かない */
export function drawParallaxObjects<TImage>(
  ctx: Ctx2D<TImage>,
  plate: ParallaxPlate<TImage>,
  opts: ParallaxDrawOptions,
  zOrder: 'behind' | 'front',
): void {
  const zoom = Math.max(1, opts.zoom);
  const scale = opts.viewport.width / (plate.plateWidth / zoom);
  const windowH = opts.viewport.height / scale;
  const cropY0 = Math.max(0, plate.plateHeight - windowH) * Math.max(0, Math.min(1, opts.verticalAnchor));
  for (const object of plate.objects ?? []) {
    if ((object.zOrder ?? 'behind') !== zOrder) continue;
    const w = object.width * scale * (object.scale ?? 1);
    const h = object.height * scale * (object.scale ?? 1);
    let x: number;
    let y: number;
    if (object.worldW !== undefined && opts.projectGround !== undefined) {
      const g = opts.projectGround(object.worldS, object.worldW);
      if (g.depth <= 2) continue;
      x = g.x - w * object.anchorXRatio;
      y = g.y - h * (object.anchorYRatio ?? 1);
    } else {
      const depth = Math.max(0.5, opts.packDepthM + object.depthOffsetM);
      const pxPerM = opts.packPxPerM * (opts.packDepthM / depth);
      // 物体の位置 = 画面中央 + 進行方向 × (worldS − 注視点の真の位置) × その深さの px/m
      const anchorX = opts.viewport.width / 2 + opts.direction * (object.worldS - (opts.anchorS ?? opts.scrollM)) * pxPerM;
      x = anchorX - w * object.anchorXRatio;
      y = (object.plateY0 - cropY0) * scale;
    }
    if (x + w < 0 || x > opts.viewport.width) continue;
    ctx.drawImage(object.image, 0, 0, object.width, object.height, x, y, w, h);
  }
}

export function drawParallaxPlate<TImage>(
  ctx: Ctx2D<TImage>,
  plate: ParallaxPlate<TImage>,
  opts: ParallaxDrawOptions,
): void {
  const zoom = Math.max(1, opts.zoom);
  const scale = opts.viewport.width / (plate.plateWidth / zoom);
  const windowH = opts.viewport.height / scale;
  const cropY0 = Math.max(0, plate.plateHeight - windowH) * Math.max(0, Math.min(1, opts.verticalAnchor));
  for (const layer of plate.layers) {
    const y = (layer.plateY0 - cropY0) * scale;
    const h = (layer.plateY1 - layer.plateY0) * scale;
    if (y + h <= 0 || y >= opts.viewport.height) continue;
    const tileW = layer.width * scale;
    const shift = parallaxLayerShiftPx(layer, opts);
    // 継ぎ目の隙間（小数座標）を出さないため、タイル幅・帯高さを 1px だけ重ねて描く
    let x = -wrap(-shift, tileW);
    if (x > 0) x -= tileW;
    for (; x < opts.viewport.width; x += tileW) {
      ctx.drawImage(layer.image, 0, 0, layer.width, layer.height, x, y, tileW + 1, h + 1);
    }
  }
  drawParallaxObjects(ctx, plate, opts, 'behind');
}
