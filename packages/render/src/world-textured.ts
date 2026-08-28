import { posOf, type Course } from './course.js';
import { drawInfield } from './infield.js';
import type { Ctx2D } from './oblique-draw.js';
import { cameraBasis, horizonY, project, type PerspectiveCamera } from './perspective.js';

/**
 * ★**テクスチャ付き透視ワールド**（コーナー・斜め・後方などカメラが横向きでないショット用）。
 *
 * 1 枚絵のコーナー背景は前後方向へ流せない（ユーザー指摘「背景が止まる」）。ここでは
 *   - 地面: 承認済みプレートの芝タイル（2 方向ループ）を**走査線ごとに透視で貼る**（いわゆる mode-7）。
 *     カメラが進めば芝が正しい遠近で流れ、旋回すれば地面が回る。
 *   - ラチ・支柱: コース形状（曲率）から透視投影で描く（プレートと同じ白ラチ・緑支柱）。
 *   - 遠景: プレート上部（樹木・スタンド・生垣）の帯を地平線に貼り、カメラの向き（heading）でゆっくり流す。
 * 馬は従来どおり `drawPerspectiveHorses` が同じカメラで描くので、地面と馬の速さは一致する。
 *
 * ⚠️ 乱数・時刻は使わない。カメラと世界座標だけの関数（憲法4）。
 */
export interface WorldStripTexture<TImage> {
  readonly image: TImage;
  readonly width: number;
  readonly height: number;
  /** テクスチャの横方向 px/m（実寸に対する密度） */
  readonly pxPerM: number;
}

export interface TexturedWorldAssets<TImage> {
  readonly turf: { readonly image: TImage; readonly width: number; readonly height: number; readonly pxPerM: number };
  /**
   * ★**ダートの地面**（2026-08-28）。★無ければ苝を使います（従来どおり）。
   *
   *   ⚠️ ★ここは 2026-08-28 まで**苝 1 枚だけ**でした。
   *      ★`surface: 'dirt'` を選んでも、★**地面は苝のまま**でした。
   *   ★寸法も `pxPerM` も苝と同じにすること。★違えると**流れる速さが苝と変わります**。
   */
  readonly dirt?: { readonly image: TImage; readonly width: number; readonly height: number; readonly pxPerM: number } | undefined;
  /** 遠景の帯（横ループ）。`horizonY` は帯の中で地面が始まる行 */
  readonly panorama: { readonly image: TImage; readonly width: number; readonly height: number; readonly horizonY: number };
  /**
   * ★コース沿いの立体帯（世界座標に置き、カメラと一緒に正しく流れる）。
   *   hedge: 外ラチ・内ラチの外の生垣（低い）、trees: その外側の樹林帯（高い）、stand: 直線の観客席
   */
  readonly scenery?: {
    readonly hedge?: WorldStripTexture<TImage>;
    readonly trees?: WorldStripTexture<TImage>;
    readonly stand?: WorldStripTexture<TImage>;
  } | undefined;
}

/**
 * ★`drawTexturedWorld` の返り値。**手前側のラチだけは呼び出し側が馬の後に描きます。**
 *   （馬より先に描くと、脚がラチを突き抜けて見えるため）
 */
export interface TexturedWorldResult {
  /** 手前側のラチの横位置（0 = 内ラチ / コース幅 = 外ラチ） */
  readonly nearRailW: number;
  /** ★馬を描いたあとに呼ぶこと */
  readonly drawNearRail: () => void;
}

export interface TexturedWorldOptions {
  /** 内ラチの外側（内馬場）と外ラチの外側を暗くする量（0〜1） */
  readonly outsideDarken?: number;
  /**
   * ★注視点（馬群の位置・m）。**どちらのラチが手前か**の参考値に使います。
   *   省略すると 0m で判定するので、**必ず渡すこと**。
   */
  readonly focusS?: number;
  /**
   * ★馬群の横位置（m）。**ラチを馬の前後どちらに描くか**を s ごとに決めるのに使います。
   *   省略すると走路の中央で判定します。
   */
  readonly focusW?: number;
  /** ★内馬場とダートコース（設計 2-2）。既定で描く。`false` で止める（比較用） */
  readonly infield?: boolean;
  /**
   * ★**走路の馬場**（2026-08-28）。★地面にどのタイルを貼るかだけを決めます。
   *
   * ⚠️ ★**走路の幾何には 1mm も触れません**
   *    （裁定 `REVIEW_P4_GAMMA_V6_DIRT_VERDICT_20260828.md` §6-3）。
   *    ★ダート戦でも馬は同じ走路（w = 0〜20）を走ります。
   *    ★内側の褐色帯は**風景のまま**です（そこに走らせると `laneExtraM` に触れます）。
   */
  readonly surface?: 'turf' | 'dirt';
  /**
   * ★**内側の帯を逆にする**（ダート戦で内回りを苝に見せる）。
   *   ⚠️ ★裁定 §6-3 の **[EYES]**: ダート戦だと走路も内側の帯も褐色になり、
   *      ★**褐色の帯が 2 本並んで「どこを走っているか」が読めなくなる**恐れがあります。
   *   ★これも**描画だけ**です。幾何は変わりません。★採否はオーナー判断。
   */
  readonly infieldReversed?: boolean;
}

const wrap = (a: number, n: number): number => ((a % n) + n) % n;

export function drawTexturedWorld<TImage>(
  ctx: Ctx2D<TImage>,
  course: Course,
  cam: PerspectiveCamera,
  assets: TexturedWorldAssets<TImage>,
  opts: TexturedWorldOptions = {},
): TexturedWorldResult {
  const basis = cameraBasis(cam);
  const W = cam.width, H = cam.height;
  const hz = horizonY(cam, basis);
  const focal = basis.focal;
  // 水平な前方・右方向（roll 無し前提。right は水平）
  const fwdFlatLen = Math.hypot(basis.fwd.x, basis.fwd.y) || 1;
  const fwdFlat = { x: basis.fwd.x / fwdFlatLen, y: basis.fwd.y / fwdFlatLen };
  const right = basis.right;
  const heading = Math.atan2(fwdFlat.y, fwdFlat.x);

  // ── 遠景: 地平線に帯を貼る。空はその上を帯の最上段の色で塗る ─────────────
  const pano = assets.panorama;
  const fovRad = cam.fovY * (W / H); // 横画角（近似）
  const panoScale = 0.36 * H / pano.horizonY;              // 帯の地面線までを画面高の 36% に
  const panoW = pano.width * panoScale;
  const panoTop = hz - pano.horizonY * panoScale;
  const panoH = pano.height * panoScale;
  // カメラの向き 1 ラジアンあたり、帯を横画角に対する比で流す（旋回で遠景がパンする）
  const panoShift = wrap(-(heading / fovRad) * W, panoW);
  ctx.fillStyle = '#9aa3ad';
  ctx.fillRect(0, 0, W, Math.max(0, Math.ceil(panoTop) + 1));
  for (let x = -panoShift - panoW; x < W; x += panoW) {
    ctx.drawImage(pano.image, 0, 0, pano.width, pano.height, x, panoTop, panoW + 1, panoH + 1);
  }

  // ── 地面: 走査線ごとに芝タイルを貼る ────────────────────────────────
  /**
   * ★**馬場でタイルを選ぶ**（2026-08-28）。
   *   ⚠️ ★ダートの素材が渡されていなければ**苝のまま**です。
   *      ★無いものをあることにしない（黙って別の色を作らない）。
   */
  const turf = opts.surface === 'dirt' && assets.dirt !== undefined ? assets.dirt : assets.turf;
  const tileM = turf.width / turf.pxPerM;      // タイル 1 枚の実寸（m）
  const tileHM = turf.height / turf.pxPerM;
  const eye = cam.eye;
  const yStart = Math.max(0, Math.floor(hz) + 1);
  for (let y = yStart; y < H; y += 1) {
    // 画面中央列の視線が地面に当たる距離
    const b = (H / 2 - (y + 0.5)) / focal;
    const dirZ = basis.fwd.z + basis.up.z * b;
    if (dirZ >= -1e-6) continue;                 // 地平線より上
    const t = -eye.z / dirZ;                     // 視線パラメータ（= カメラ前方距離）
    const px = eye.x + (basis.fwd.x + basis.up.x * b) * t;
    const py = eye.y + (basis.fwd.y + basis.up.y * b) * t;
    const mPerPx = t / focal;                    // この行で画面 1px が地面何 m か（right 方向）
    // テクスチャ座標（タイル単位）: u は right 方向、v は前方
    const uC = (px * right.x + py * right.y) / tileM;
    const v = (px * fwdFlat.x + py * fwdFlat.y) / tileHM;
    const kTile = mPerPx / tileM;                // 画面 1px あたりのタイル数
    const srcPerPx = kTile * turf.width;         // 画面 1px あたりの元画像 px
    const sy = wrap(v * turf.height, turf.height);
    // 左端のテクスチャ x
    let u0px = wrap((uC - (W / 2) * kTile) * turf.width, turf.width);
    let x = 0;
    // ★遠い行ほど 1px に多くの元画素が入る。sw を刻んで複数回描く（タイル境界で分割）
    while (x < W) {
      const remainSrc = turf.width - u0px;
      const spanPx = Math.max(1, Math.min(W - x, remainSrc / srcPerPx));
      const sw = spanPx * srcPerPx;
      ctx.drawImage(turf.image, u0px, sy, sw, 1, x, y, spanPx + 0.5, 1);
      x += spanPx;
      u0px = 0;
    }
  }

  /**
   * ── ★**内馬場とダートコース**（設計 2-2）─────────────────────────
   *
   *   芝を敷いたあと、走路の**内側**にもう 1 周（ダート）と内馬場を重ねる。
   *   ⚠️ 走路の幾何（`laneExtraM`・着順）には触れていません。**描く帯だけ**です。
   */
  if (opts.infield !== false) {
    const groundOf = (s: number, w: number): { x: number; y: number; depth: number } => {
      const p = posOf(course, s, w);
      const q = project(cam, basis, { x: p.x, y: p.y, z: 0 });
      return { x: q.x, y: q.y, depth: q.depth };
    };
    drawInfield(ctx, course, groundOf, { width: W, height: H }, {
      focusS: opts.focusS ?? 0,
      /** ★ダート戦で内側の帯を苝に反転する（裁定 §6-3 の [EYES]） */
      ...(opts.infieldReversed === true ? { reversed: true } : {}),
    });
  }

  // ── 遠くの地面ほど霞む（空気遠近）: 地平線から 140px を上向きに薄く ─────────
  /**
   * ★**霞の濃さは画面 y の関数**（地平線でいちばん濃い）。
   *
   * ⚠️ ★以前はこの式が**この帯の中だけ**にありました。ところが霞は**ラチより先に塗られる**ので、
   *    ★**遠いラチだけが霞の上に鮮明に乗っていました**（下の `rail()` の注記・オーナー指摘① 2026-08-27）。
   * → ★**同じ量を 2 か所に持たないため関数にして、ラチからも引きます**（D-052）。
   */
  const HAZE_H = Math.min(H, 140);
  const HAZE_MAX = 0.34;
  const hazeAt = (y: number): number => {
    const i = y - hz;
    if (i < 0 || i >= HAZE_H) return 0;
    return HAZE_MAX * (1 - i / HAZE_H) * (1 - i / HAZE_H);
  };
  {
    for (let i = 0; i < HAZE_H; i += 2) {
      const yy = Math.floor(hz) + i;
      if (yy < 0 || yy >= H) continue;
      ctx.globalAlpha = hazeAt(yy);
      ctx.fillStyle = '#b7c1c6';
      ctx.fillRect(0, yy, W, 2);
    }
    ctx.globalAlpha = 1;
  }

  // ── 内馬場・外側を少し暗くして走路を読ませる（台形で塗る） ─────────────
  const darken = opts.outsideDarken ?? 0.28;
  const P = (s: number, w: number, z = 0): ReturnType<typeof project> => {
    const p = posOf(course, s, w);
    return project(cam, basis, { x: p.x, y: p.y, z });
  };
  const NEAR = -400, FAR = course.distance + 400;
  /** ⚠️ ★この `band` は下で `void band;` されており、★**使われていません**。★馬場分けも入れません */
  const band = (w0: number, w1: number, alpha: number, step = 10): void => {
    ctx.fillStyle = '#12220f';
    ctx.globalAlpha = alpha;
    for (let s = NEAR; s < FAR; s += step) {
      const s2 = Math.min(s + step, FAR);
      const a = P(s, w0), b2 = P(s2, w0), c = P(s2, w1), d = P(s, w1);
      // ★遠い側（w1 が大きく外へ出る側）はカメラの後ろに回りやすい。1 点でも後ろなら飛ばすが、
      //   近い側の 2 点が前にあれば w1 を近づけて描く（隅を抜かさない）
      if (a.depth <= 1 || b2.depth <= 1) continue;
      let cc = c, dd = d;
      if (cc.depth <= 1 || dd.depth <= 1) {
        const wMid = w0 + (w1 - w0) * 0.25;
        cc = P(s2, wMid); dd = P(s, wMid);
        if (cc.depth <= 1 || dd.depth <= 1) continue;
      }
      if (Math.max(a.x, b2.x, cc.x, dd.x) < -20 || Math.min(a.x, b2.x, cc.x, dd.x) > W + 20) continue;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y); ctx.lineTo(b2.x, b2.y); ctx.lineTo(cc.x, cc.y); ctx.lineTo(dd.x, dd.y);
      ctx.closePath(); ctx.fill();
    }
    ctx.globalAlpha = 1;
  };
  const WD = course.widthM;
  /**
   * ★**陰影と走路の色を馬場で分ける**（2026-08-28）。
   *
   * ⚠️ ★この 2 つは**苝の緑が直書き**されていました。
   *    ★地面タイルをダートに差し替えても、★**上から緑を塗るのでオリーブ色になりました**。
   *    ★実際に 1 枚目の試作がそうなりました。
   * ★色は `palette.json` の `dirt-0` / `turf` 系と揃えています。
   */
  const isDirt = opts.surface === 'dirt';
  /** ★全体を薄く落とす色（苝は深緑・ダートは深褐） */
  const SHADE = isDirt ? '#221a12' : '#12220f';
  /** ★走路だけを少し明るくする色（苝は若草・ダートは乾いた砂） */
  const TRACK_TINT = isDirt ? '#c8a985' : '#9ccb55';
  // ★内外を暗くする代わりに、走路だけを少し明るく（台形が裏返らない範囲）。全体を先に薄く落とす
  ctx.globalAlpha = darken * 0.5;
  ctx.fillStyle = SHADE;
  ctx.fillRect(0, Math.max(0, Math.floor(hz)), W, H);
  ctx.globalAlpha = 1;
  const trackBand = (alpha: number): void => {
    ctx.fillStyle = TRACK_TINT;
    ctx.globalAlpha = alpha;
    for (let s = NEAR; s < FAR; s += 8) {
      const s2 = Math.min(s + 8, FAR);
      const a = P(s, 0), b2 = P(s2, 0), c = P(s2, WD), d = P(s, WD);
      if (a.depth <= 1 || b2.depth <= 1 || c.depth <= 1 || d.depth <= 1) continue;
      if (Math.max(a.x, b2.x, c.x, d.x) < -20 || Math.min(a.x, b2.x, c.x, d.x) > W + 20) continue;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y); ctx.lineTo(b2.x, b2.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y);
      ctx.closePath(); ctx.fill();
    }
    ctx.globalAlpha = 1;
  };
  void band;
  trackBand(darken * 0.55);

  // ── コース沿いの立体帯（生垣・樹林・スタンド）: 縦の看板状の帯を s 方向に細かく刻んで貼る ───────
  const strip = (tex: WorldStripTexture<TImage>, w: number, heightM: number, sFrom: number, sTo: number, stepM: number, alpha = 1, minDepth = 14): void => {
    ctx.globalAlpha = alpha;
    const slices: { readonly depth: number; readonly draw: () => void }[] = [];
    let s0 = sFrom;
    while (s0 < sTo) {
      // ★近いほど細かく刻む（階段状に見えない）。極端に近い帯（カメラ脇）は描かない
      const probe = P(s0, w, 0);
      const step = probe.depth > 1.5 ? Math.max(0.35, Math.min(stepM, probe.depth / 60)) : stepM;
      const s1 = Math.min(sTo, s0 + step);
      const b0 = P(s0, w, 0), b1 = P(s1, w, 0), t0 = P(s0, w, heightM), t1 = P(s1, w, heightM);
      s0 = s1;
      if (b0.depth <= minDepth || b1.depth <= minDepth) continue;
      const xl = Math.min(b0.x, b1.x), xr = Math.max(b0.x, b1.x);
      if (xr < -4 || xl > W + 4) continue;
      const top = (t0.y + t1.y) / 2, bottom = (b0.y + b1.y) / 2;
      const dh = bottom - top;
      if (dh < 0.5 || dh > H * 0.9) continue;   // 極端に近い（画面いっぱいの）帯は描かない
      const sSlice = s1 - step;
      const sx = wrap(sSlice * tex.pxPerM, tex.width);
      const sw = Math.max(1, Math.min(tex.width - sx, step * tex.pxPerM));
      /**
       * ★短冊は**傾けて**描きます（2026-08-22）。
       *
       * ⚠️ ★以前は `drawImage` で**軸に平行な長方形**として置いていました。
       *    帯が画面を斜めに横切る場面（コーナー・斜め前）では、
       *    短冊ごとに上下の位置が違うので★**階段状のブロックの列**に見えます。
       *    オーナー評「**芝や背景が雑なところがあります**」。
       *
       * ★左右の端で上端の高さが違うので、その差だけ**縦にせん断**すれば、
       *   隣の短冊と辺がぴったり繋がります（左右の辺は垂直なので、せん断だけで一致します）。
       */
      const dxPx = Math.max(1, xr - xl) + 0.7;
      const leftIsFirst = b0.x <= b1.x;
      const topL = leftIsFirst ? t0.y : t1.y;
      const topR = leftIsFirst ? t1.y : t0.y;
      const botL = leftIsFirst ? b0.y : b1.y;
      const botR = leftIsFirst ? b1.y : b0.y;
      const canSkew = ctx.save !== undefined && ctx.restore !== undefined && ctx.transform !== undefined;
      slices.push({ depth: (b0.depth + b1.depth) / 2, draw: () => {
        if (!canSkew) {
          ctx.drawImage(tex.image, sx, 0, sw, tex.height, xl, top, dxPx, dh);
          return;
        }
        const kx = dxPx / sw;
        const ky = ((botL - topL) + (botR - topR)) / 2 / tex.height;
        const skew = (topR - topL) / sw;             // 元画像 1px あたりの縦のずれ
        // ★`transform` は現在の変換に**積む**ので、`save`/`restore` で挟む
        ctx.save!();
        ctx.transform!(kx, skew, 0, ky, xl - sx * kx, topL - sx * skew);
        ctx.drawImage(tex.image, sx, 0, sw, tex.height, sx, 0, sw, tex.height);
        ctx.restore!();
      } });
    }
    // 遠い順に描く（近い帯が手前に重なる）
    slices.sort((a, b) => b.depth - a.depth);
    for (const slice of slices) slice.draw();
    ctx.globalAlpha = 1;
  };
  const scenery = assets.scenery;
  if (scenery !== undefined) {
    const sFrom = NEAR, sTo = FAR;
    // 樹林帯（遠い・高い）: 内外とも
    // ★樹林帯は遠景（100m 以遠）だけ。近くで斜めから見ると板状に割れる。望遠（fov<12°）では遠景パノラマに任せる
    const tele = cam.fovY < (12 * Math.PI) / 180;
    if (scenery.trees !== undefined && !tele) {
      strip(scenery.trees, WD + 34, 9, sFrom, sTo, 6, 0.96, 100);
      strip(scenery.trees, -38, 8, sFrom, sTo, 6, 0.96, 100);
    }
    // 直線の観客席（外側・ゴール前 450m）
    if (scenery.stand !== undefined) {
      strip(scenery.stand, WD + 16, 9, Math.max(sFrom, course.distance - 480), course.distance + 40, 4, 1, 40);
    }
    // 生垣（低い）: 外ラチの外側と内ラチの内側
    if (scenery.hedge !== undefined) {
      strip(scenery.hedge, WD + 3.5, 1.3, sFrom, sTo, 2.5);
      strip(scenery.hedge, -4, 1.1, sFrom, sTo, 2.5);
    }
  }

  // ── ラチ: 白い横木 2 本と緑の支柱（プレートの意匠に合わせる） ─────────────
  /**
   * ★ラチを**区間ごとに、馬より手前か奥かで振り分けて**描きます。
   *
   * ⚠️ ★「このカットではどちらのラチが手前」と**1 つに決められません。**
   *    4 角正面は固定カメラで、馬が近づくにつれ**本当に前後が入れ替わります**
   *    （検査が 800〜1056m の途中での入れ替わりを捕捉）。
   *    カット単位で切り替えると、その瞬間に**ラチが馬の前後を跳びます。**
   * → ★s ごとに「そこのラチは、そこの馬より手前か」を見て、
   *   **手前の点だけを馬のあとに描き直します。** 切り替わりは点ごとなので跳びません。
   *
   * `wantNear` … true なら「馬より手前の区間だけ」を描く（馬のあとに呼ぶ）
   */
  const focusW = opts.focusW ?? WD / 2;
  const isNearHorses = (s: number, w: number): boolean => {
    const r = P(s, w, 0), h = P(s, focusW, 0);
    return r.depth > 1 && h.depth > 1 && r.depth < h.depth;
  };
  /**
   * ★**横木の太さは、支柱と同じ規則（実寸 × px/m）で決めます。**
   *
   * ⚠️ ★以前は `1.6px` / `3.2px` の**固定**でした。★支柱は下で `a.pxPerM * 0.09` と
   *    **深さで縮んでいる**のに、★**横木だけがその規則から漏れていました。**
   *    実測（オーナー指摘①・発走 6.5s・seed 42）:
   *      左端の馬はカメラから **27.2m**、てっぺんは画面 y=257。
   *      ★そこへ **149.1m 先の外ラチ（y=270）** と **420.8m 先の内ラチ（y=261）** が
   *      ★**手前と同じ 3.2px の白線**で重なり、★白い勝負服と溶けて
   *      「馬が柵に乗っている」ように見えていました。
   *   ★実寸 0.09m の横木は 420m 先なら **0.3px** です。3.2px は 10 倍以上の太さでした。
   *
   * ★**1px 未満は「細く描く」ことができない**ので、代わりに**薄くします**（線描画の定石）。
   *   ★これに空気遠近（`hazeAt`）を掛けます。★どちらも既にこの関数の中にある規則で、
   *   ★**新しい定数を作っていません。**
   */
  const BAR_THICK_M = 0.09;   // ★支柱と同じ実寸
  const rail = (w: number, postEveryM: number, postH: number, near: boolean, wantNear: boolean): void => {
    for (const [height, color] of [[postH * 0.55, '#c9cbc4'], [postH, '#e6e6e0']] as const) {
      ctx.strokeStyle = color;
      /**
       * ★太さと薄さは**点ごとに変わる**ので、1 本のパスでは描けません。
       *   ⚠️ ★かといって 5m ごとに `stroke()` すると 1 コマで数千回になります。
       *   → ★**太さ 0.5px / 薄さ 0.1 の刻みで丸めて、値が変わったときだけ区切ります。**
       *     連続する区間はまとめて 1 本のパスになるので、実際の `stroke()` は十数回です。
       */
      let started = false;
      let bucket = '';
      let prev: { readonly x: number; readonly y: number } | null = null;
      const flush = (): void => { if (started) ctx.stroke(); started = false; };
      for (let s = NEAR; s <= FAR; s += 5) {
        const p = P(s, w, height);
        if (p.depth <= 1 || p.x < -200 || p.x > W + 200 || isNearHorses(s, w) !== wantNear) {
          flush(); prev = null; continue;
        }
        const barPx = p.pxPerM * BAR_THICK_M;
        const lw = Math.round(Math.max(1, Math.min(6, barPx)) * 2) / 2;
        const al = Math.round(Math.min(1, barPx) * (1 - hazeAt(p.y)) * 10) / 10;
        const key = `${lw}/${al}`;
        if (key !== bucket || !started) {
          flush();
          ctx.lineWidth = lw;
          ctx.globalAlpha = al;
          ctx.beginPath();
          // ★区切っても線が途切れないよう、直前の点から引き継ぐ
          if (prev !== null) { ctx.moveTo(prev.x, prev.y); ctx.lineTo(p.x, p.y); } else ctx.moveTo(p.x, p.y);
          started = true; bucket = key;
        } else ctx.lineTo(p.x, p.y);
        prev = p;
      }
      flush();
      ctx.globalAlpha = 1;
    }
    ctx.strokeStyle = near ? '#3f6b4c' : '#4a7455';
    for (let s = Math.floor(NEAR / postEveryM) * postEveryM; s <= FAR; s += postEveryM) {
      const a = P(s, w, 0), b2 = P(s, w, postH);
      if (a.depth <= 1 || a.x < -40 || a.x > W + 40 || isNearHorses(s, w) !== wantNear) continue;
      ctx.lineWidth = Math.max(1, a.pxPerM * 0.09);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b2.x, b2.y); ctx.stroke();
    }
  };
  /**
   * ★**カメラに近いほうのラチは、ここでは描きません。**
   *
   * ⚠️ ラチは世界の一部なので馬より先に描かれます。ところが 4 角正面のように
   *    **内ラチがカメラの手前に来るカット**では、手前にあるはずのラチの上に馬が塗られ、
   *    ★**脚がラチを突き抜けて「馬がラチの向こうに立っている」ように見えます。**
   *    オーナー評「コースの内側に馬の足が入ったりしている」はこれです。
   *
   *    実測（4 角正面・注視点 800m）: 内ラチの深さ 137.5m / 外ラチ 142.2m。
   *    ★7 カット中このカットだけ内ラチが手前でした。
   *    投影でも、全馬の接地点（画面Y 411〜428）が
   *    **内ラチの地面 430.1 と横木 357.4 のあいだ**に落ちています。
   *
   * → 手前側は `nearRail` として**呼び出し側が馬の後に描きます**（`drawNearRail`）。
   */
  /**
   * ★どちらが手前かは、**注視点の位置での深さ**（視線方向の距離）で決めます。
   *
   * ⚠️ ★手前かどうかは**視線方向の深さ**で決まります。カメラからの直線距離では決まりません
   *    （幾何距離で判定したら、どのカットでも外ラチが手前という答えになり、実際の見え方と
   *      合いませんでした）。
   * ⚠️ ★「画面に映る範囲の深さの平均」でも判定しましたが、**カットの途中で入れ替わり**、
   *    ラチが馬の前後を跳びました（4 角正面 800〜1056m で検査が捕捉）。
   *    注視点が動くと視界に入る範囲が変わり、平均も変わるためです。
   * → **注視点 1 点での深さ**にします。馬がいるのもそこなので、比べるべき場所はここです。
   */
  // ★馬より奥の区間だけを、ここ（馬の前）で描く
  rail(0, 6, 1.1, false, false);        // 内ラチ
  rail(WD, 6, 1.1, true, false);        // 外ラチ
  return {
    /** ★参考値: 注視点の位置でどちらが手前か（検査用。描き分けは区間ごとに行う） */
    nearRailW: P(opts.focusS ?? 0, 0, 0).depth < P(opts.focusS ?? 0, WD, 0).depth ? 0 : WD,
    drawNearRail: () => { rail(0, 6, 1.1, false, true); rail(WD, 6, 1.1, true, true); },
  };
}
