import type { Course } from './course.js';
import type { Ctx2D } from './oblique-draw.js';
import { HORIZON_SKY_COLOR, skyReflectance, trackWetnessColor } from './world-textured.js';

/**
 * ★**水たまり**（2026-08-30・残件 A-7・オーナー指示「水たまりなどに進めて」）
 *
 * 【★なぜ要るか — ★測って分かったこと】
 *   ★濡れた馬場は、まず「暗くする」を入れ（`trackWetnessAlpha`）、
 *   ★次に「空を映す薄い膜」を入れました（`trackGlossAlpha`）。★どちらも**一様な層**です。
 *   ⚠️ ★実測: ★薄い膜は**正面のカットで +1.3%** しか出ず、★**目では分かりませんでした。**
 *      ★強くすれば見えますが、★**濡れの暗さを打ち消します**（0.55 で −23.1% → −6.6%）。
 *   ★理由も分かっています: ★フレネルは「浅く当たるほど強い」ですが、
 *   ★**画面に写る走路は 30m 先で既に十分浅い**ので、★奥と手前で 2 倍しか変わりません。
 *   → ★**一様な層では「濡れている」になりません。**
 *
 * 【★だから局所にする】
 *   ★実際の不良馬場が濡れて見えるのは、★**そこだけ明るく空を映す溜まり**があるからです。
 *   ★平均の明るさを動かさずに、★**局所の対比**を作ります。
 *   ★これは「暗さと照りの取り合い」（A-7）から**外に出る**唯一の形です。
 *
 * 【★描く場所を 1 か所にした理由 — `mow-stripes.ts` と同じ】
 *   ★地面の描き方は 2 つあります（横視点は `parallax-plate`／それ以外は `world-textured`）。
 *   ★それぞれに足すと**2 つの実装**になり、必ず離れます（R-30）。
 *   → ★**走路の投影として描きます。** ★地面の描き方に依らず、馬と同じカメラに載ります。
 *
 * ⚠️ 【★決定論（憲法 4）】★**乱数を呼びません。**
 *    ★位置は**走路の座標 (s, w) の格子**から `hash01` で決めます。
 *    ★同じレースは何度描いても同じ場所に溜まります。★コマ落ちでも動きません。
 *
 * ⚠️ ★**走路の幾何・着順・タイムには一切触れません。** ★見た目だけです（憲法 3）。
 * ⚠️ ★**良は 1 つも描きません**（`puddleDensity('good') === 0`）。★良の絵は 1 ビットも動きません。
 */

/** ★格子の大きさ（m）。★この中に多くて 1 つ溜まります */
export const PUDDLE_CELL_S_M = 14;
export const PUDDLE_CELL_W_M = 5;

/**
 * ★**水たまりの多さ**（0〜1・格子のうち溜まる割合）。
 *
 * 【★なぜ稍重は 0 なのか】
 *   ★水たまりは「★**地面が吸えなくなった水**」です。★稍重は湿っているだけで、★溜まりません。
 *   ⚠️ ★ここを 0 でない値にすると、★**稍重が不良のように見えます**（状態の差が壊れます）。
 *   ★稍重の濡れは、暗さ（`trackWetnessAlpha` 0.22）で出しています。
 *
 * ⚠️ ★**良は必ず 0** です。★良の絵は 1 ビットも動きません。
 */
export function puddleDensity(
  condition?: 'good' | 'yielding' | 'soft' | 'bad' | undefined,
): number {
  switch (condition) {
    case 'soft': return 0.20;
    case 'bad': return 0.42;
    default: return 0;
  }
}

/**
 * ★**水たまりの明るさ**（0〜1）。
 *
 * ⚠️ ★出どころは `skyReflectance` の 1 か所です（D-052）。★薄い膜（照り）と**同じ式**で、
 *    ★**係数だけが違います** — ★水たまりは膜より厚いので、よく映します。
 * ★奥ほど明るく光り、★手前は暗いままです（＝濡れた面を斜めから見たときの見え方）。
 */
export const PUDDLE_GLOSS_GAIN = 0.62;

/** ★縁の暗い輪郭の濃さ。★水が地面に染みている縁で、★これが無いと「白い染み」に見えます */
export const PUDDLE_RIM_ALPHA = 0.30;

/**
 * ★**芯（いちばん明るいところ）の強さ**。★水面の上に、もう 1 枚だけ重ねる倍率。
 *
 * ⚠️ 【★なぜ要るか】★「縁 + 一様な水面」の 2 枚では、★実画面で ★**灰色の靄**に見えました。
 *    ★水に見えるのは ★**濃い縁 → 明るい水面 → きらりと光る芯**という**落差**があるからです。
 */
export const PUDDLE_CORE_GAIN = 1.45;

/** ★決定論の要（`crowd.ts` と同じ形）。★乱数ではありません */
function hash01(a: number, b: number, salt: number): number {
  let h = (Math.imul(a | 0, 0x9e3779b1) ^ Math.imul(b | 0, 0x85ebca6b) ^ Math.imul(salt | 0, 0xc2b2ae35)) >>> 0;
  h ^= h >>> 15; h = Math.imul(h, 0x2545f491) >>> 0; h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

export interface PuddleOptions {
  /** 注視点（m）。この前後だけ描く */
  readonly focusS: number;
  /** ★馬場（芝／ダート）。★縁の色に使う */
  readonly surface?: 'turf' | 'dirt' | undefined;
  /** ★馬場状態。★多さを決める（良・稍重は 0） */
  readonly condition?: 'good' | 'yielding' | 'soft' | 'bad' | undefined;
  /** ★カメラの高さ（m）。★空をどれだけ映すかに使う。★手置きの数を渡さないこと（R-30） */
  readonly eyeHeightM: number;
  /** 描く範囲（注視点からの前後・m） */
  readonly rangeM?: number;
}

/**
 * ★1 つの水たまりの形（走路の座標・m）。★格子の番号だけから決まります（決定論）。
 *   ★`null` なら、その格子には溜まっていません。
 */
export function puddleAt(
  cellS: number,
  cellW: number,
  density: number,
  courseWidthM: number,
): { readonly s: number; readonly w: number; readonly rs: number; readonly rw: number } | null {
  if (!(density > 0)) return null;
  /**
   * ★**内ラチ寄りに溜まりやすくします。**
   *   ★走路は内側が低いので、★実際の馬場でも内が先に溜まります。
   *   ★外側 1/4 では出にくくなります（重みは 1.0 → 0.45）。
   */
  const wCenter = (cellW + 0.5) * PUDDLE_CELL_W_M;
  const inner = Math.max(0, Math.min(1, wCenter / Math.max(1e-6, courseWidthM)));
  const weight = 1 - inner * 0.55;
  if (hash01(cellS, cellW, 1) >= density * weight) return null;
  /** ★格子の中で位置をずらす（★格子が見えないように） */
  const s = (cellS + 0.15 + hash01(cellS, cellW, 2) * 0.7) * PUDDLE_CELL_S_M;
  const w = (cellW + 0.15 + hash01(cellS, cellW, 3) * 0.7) * PUDDLE_CELL_W_M;
  if (w < 0.4 || w > courseWidthM - 0.4) return null;
  /**
   * ★走路の方向へ長く伸びます（★水は轍に沿って溜まります）。
   *
   * ⚠️ 【★2026-08-30・小さくした理由】★最初 `rs` 2.2〜5.6m / `rw` 0.9〜2.4m と置きました。
   *    ★実画面で見ると ★**「霧が地面に溜まっている」ように見えました** — ★1 つが画面を大きく覆い、
   *    ★水面ではなく**灰色の靄**になっていました。
   *    → ★**小さく・数で見せます。** ★水たまりは「大きな面」ではなく「点々」です。
   */
  const rs = 1.3 + hash01(cellS, cellW, 4) * 2.1;
  const rw = 0.6 + hash01(cellS, cellW, 5) * 1.0;
  return { s, w, rs, rw };
}

/**
 * ★水たまりを重ねる。★**地面を描いたあと・馬を描く前**に呼ぶこと。
 * @param projectGround 世界座標 (s,w) の地面点を画面へ投影する（★馬と同じカメラ）
 */
export function drawPuddles(
  ctx: Ctx2D<unknown>,
  course: Course,
  projectGround: (s: number, w: number) => { readonly x: number; readonly y: number; readonly depth: number },
  viewport: { readonly width: number; readonly height: number },
  opts: PuddleOptions,
): void {
  const density = puddleDensity(opts.condition);
  if (!(density > 0)) return;
  const range = opts.rangeM ?? 420;
  const rim = trackWetnessColor(opts.surface);
  const cellsW = Math.max(1, Math.ceil(course.widthM / PUDDLE_CELL_W_M));
  const from = Math.floor((opts.focusS - range) / PUDDLE_CELL_S_M);
  const to = Math.ceil((opts.focusS + range) / PUDDLE_CELL_S_M);
  const prevAlpha = ctx.globalAlpha;
  /** ★縁の内側を 1 段小さくして、★水面を描く */
  const STEPS = 18;
  for (let cs = from; cs <= to; cs += 1) {
    for (let cw = 0; cw < cellsW; cw += 1) {
      const p = puddleAt(cs, cw, density, course.widthM);
      if (p === null) continue;
      /** ★外周を走路の座標で刻んで投影する（★台形と同じで、地面に貼り付きます） */
      const outline: { x: number; y: number }[] = [];
      let depthSum = 0;
      let behind = false;
      for (let i = 0; i < STEPS; i += 1) {
        const t = (i / STEPS) * Math.PI * 2;
        const q = projectGround(p.s + Math.cos(t) * p.rs, p.w + Math.sin(t) * p.rw);
        if (q.depth <= 1) { behind = true; break; }
        outline.push(q);
        depthSum += q.depth;
      }
      if (behind || outline.length < 3) continue;
      let minX = outline[0]!.x, maxX = outline[0]!.x, minY = outline[0]!.y, maxY = outline[0]!.y;
      for (const q of outline) {
        if (q.x < minX) minX = q.x; if (q.x > maxX) maxX = q.x;
        if (q.y < minY) minY = q.y; if (q.y > maxY) maxY = q.y;
      }
      if (maxX < -20 || minX > viewport.width + 20 || maxY < -20 || minY > viewport.height + 20) continue;
      /** ★あまりに小さい（遠い）ものは、★点滅して見えるので描きません */
      if (maxX - minX < 2 || maxY - minY < 1) continue;
      const depth = depthSum / outline.length;
      const path = (pts: readonly { x: number; y: number }[]): void => {
        ctx.beginPath();
        ctx.moveTo(pts[0]!.x, pts[0]!.y);
        for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i]!.x, pts[i]!.y);
        ctx.closePath();
        ctx.fill();
      };
      const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
      const shrink = (k: number): { x: number; y: number }[] =>
        outline.map((q) => ({ x: q.x + (cx - q.x) * k, y: q.y + (cy - q.y) * k }));
      const sky = skyReflectance(depth, opts.eyeHeightM);
      /**
       * ★**3 枚で 1 つ**にします（★2026-08-30・実画面を見て直しました）。
       *
       * ⚠️ ★最初は「縁 + 水面」の 2 枚でした。★実画面では ★**灰色の靄**に見えました。
       *    ★一様に薄く明るいだけの面には、★**水の見えがありません。**
       * → ★① 濡れて濃くなった縁 ／ ★② 空を映す水面 ／ ★③ ★**きらりと光る芯**
       *   ★この 3 段の落差が「水」です。★平らな 1 枚では作れません。
       */
      /** ★① 縁: 水が染みて濃くなっている輪郭（★これが無いと「白い染み」に見えます） */
      ctx.globalAlpha = prevAlpha * PUDDLE_RIM_ALPHA;
      ctx.fillStyle = rim;
      path(outline);
      /** ★② 水面: 空を映す。★奥ほど明るい（`skyReflectance` は照りと同じ 1 か所） */
      ctx.globalAlpha = prevAlpha * Math.min(0.85, sky * PUDDLE_GLOSS_GAIN);
      ctx.fillStyle = HORIZON_SKY_COLOR;
      path(shrink(0.30));
      /** ★③ 芯: ★**いちばん明るいところ**。★水面の中でもここだけ強く空を返します */
      ctx.globalAlpha = prevAlpha * Math.min(0.92, sky * PUDDLE_GLOSS_GAIN * PUDDLE_CORE_GAIN);
      ctx.fillStyle = HORIZON_SKY_COLOR;
      path(shrink(0.62));
    }
  }
  ctx.globalAlpha = prevAlpha;
}
