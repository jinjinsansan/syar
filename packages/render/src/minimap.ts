import { posOf, type Course } from './course.js';
import type { Ctx2D, FontOf, Palette } from './oblique-draw.js';
import { HUD, drawGlassNotchPanel, drawLabel, goldPlate, riseAt } from './hud-kit.js';

/**
 * ★コース図ミニマップ。カットが切り替わっても「今どこを見ているか」を頭の中で繋ぐための手がかり
 *   （ユーザー指摘「切り替えた後に別のシーンに見える」）。
 *   走路の帯（内ラチ〜外ラチ）を上から見た形で描き、馬群を点、カメラの注視点を三角で示す。
 *   ⚠️ 位置は描画に使っている値をそのまま点にするだけ。順位・着差の計算はしない。
 *
 *   本線の見た目（design/hud-ds/components/minimap・screen-live）: 板 x40 y321 264×209・上縁 金4px・
 *   見出し「COURSE」＋距離・図 264×132・走路 stroke16 #4d6b40＋外周線 1px・GOAL 金3px・START 白2px・
 *   馬点 r3・自馬 r5.6 金線 2・残距離バー 高6・「START」「残 400m」。`opts` を渡すとこの板で描く（無ければ素の図）。
 */
export interface MinimapHorse {
  readonly gate: number;
  readonly s: number;
  readonly w: number;
  readonly own?: boolean;
}

export interface MinimapOptions {
  /** 見出し右のラベル（例: 「芝 1600m」） */
  readonly distanceLabel?: string | undefined;
  /** 残り距離（m）。フッタと残距離バーに使う */
  readonly metersLeft?: number | undefined;
  /** 光沢の時刻（秒） */
  readonly timeSec?: number | undefined;
  /** 表示開始からの秒（登場アニメ） */
  readonly sinceSec?: number | undefined;
}

export function drawCourseMinimap<TImage>(
  ctx: Ctx2D<TImage>,
  course: Course,
  pal: Palette,
  font: FontOf,
  horses: readonly MinimapHorse[],
  focusS: number,
  box: { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
  frameColorOf: (gate: number) => string,
  opts?: MinimapOptions,
): void {
  const baseAlpha = ctx.globalAlpha;
  const rise = riseAt(opts?.sinceSec ?? 1, 0.1);
  const oy = opts === undefined ? 0 : rise.dy;
  if (opts !== undefined) ctx.globalAlpha = baseAlpha * rise.alpha;
  const t = opts?.timeSec ?? 0;
  // 図の領域（板つきなら 上縁4＋見出し29 の下、残距離バー6＋フッタ22＋余白12 の上）
  const map = opts === undefined
    ? { x: box.x, y: box.y, width: box.width, height: box.height }
    : { x: box.x, y: box.y + oy + 4 + 29, width: box.width, height: Math.max(40, box.height - 4 - 29 - 6 - 22 - 12) };

  const inner: { x: number; y: number }[] = [];
  const outer: { x: number; y: number }[] = [];
  const step = 8;
  for (let s = 0; s <= course.distance + 1e-6; s += step) {
    inner.push(posOf(course, s, 0));
    outer.push(posOf(course, s, course.widthM));
  }
  const all = [...inner, ...outer];
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of all) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); }
  const pad = opts === undefined ? 10 : 18;
  const spanX = Math.max(1, maxX - minX), spanY = Math.max(1, maxY - minY);
  const scale = Math.min((map.width - pad * 2) / spanX, (map.height - pad * 2) / spanY);
  const ox = map.x + (map.width - spanX * scale) / 2;
  const oyy = map.y + (map.height - spanY * scale) / 2;
  // ★世界座標 y の向き: 画面では上を +y にしない（コース図は上から見た形。左回りが左回りに見える向き）
  const toX = (p: { x: number; y: number }): number => ox + (p.x - minX) * scale;
  const toY = (p: { x: number; y: number }): number => oyy + (maxY - p.y) * scale;

  if (opts === undefined) {
    // 板（素の図）
    ctx.fillStyle = 'rgba(5,10,8,0.62)';
    ctx.fillRect(box.x, box.y, box.width, box.height);
    ctx.strokeStyle = 'rgba(236,232,211,0.35)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(box.x + 0.5, box.y + 0.5); ctx.lineTo(box.x + box.width - 0.5, box.y + 0.5);
    ctx.lineTo(box.x + box.width - 0.5, box.y + box.height - 0.5); ctx.lineTo(box.x + 0.5, box.y + box.height - 0.5); ctx.closePath(); ctx.stroke();
  } else {
    drawGlassNotchPanel(ctx, box.x, box.y + oy, box.width, box.height, t);
    drawLabel(ctx, font, 'COURSE', box.x + 14, box.y + oy + 4 + 21);
    if (opts.distanceLabel !== undefined) drawLabel(ctx, font, opts.distanceLabel, box.x + box.width - 14, box.y + oy + 4 + 21, HUD.paper70, 'right');
  }

  // 走路の帯
  ctx.fillStyle = opts === undefined ? (pal['turf-2'] ?? '#5f8f45') : '#4d6b40';
  ctx.beginPath();
  inner.forEach((p, i) => { if (i === 0) ctx.moveTo(toX(p), toY(p)); else ctx.lineTo(toX(p), toY(p)); });
  for (let i = outer.length - 1; i >= 0; i -= 1) ctx.lineTo(toX(outer[i]!), toY(outer[i]!));
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = opts === undefined ? 'rgba(240,240,236,0.8)' : 'rgba(247,244,234,.35)'; ctx.lineWidth = 1;
  for (const line of [inner, outer]) {
    ctx.beginPath();
    line.forEach((p, i) => { if (i === 0) ctx.moveTo(toX(p), toY(p)); else ctx.lineTo(toX(p), toY(p)); });
    ctx.stroke();
  }
  // 発走・決勝線
  const tick = (s: number, color: string, width: number): void => {
    const a = posOf(course, s, -1.5), b = posOf(course, s, course.widthM + 1.5);
    ctx.strokeStyle = color; ctx.lineWidth = width;
    ctx.beginPath(); ctx.moveTo(toX(a), toY(a)); ctx.lineTo(toX(b), toY(b)); ctx.stroke();
  };
  tick(0, 'rgba(255,255,255,0.9)', 2);
  tick(course.distance, opts === undefined ? (pal['frame-5'] ?? '#e9c94d') : HUD.gold, opts === undefined ? 2 : 3);
  if (opts !== undefined) {
    const g = posOf(course, course.distance, course.widthM + 1.5);
    ctx.fillStyle = HUD.gold; ctx.font = font(11, true); ctx.textAlign = 'left';
    ctx.fillText('GOAL', toX(g) + 6, toY(g) + 12);
  }

  // カメラの注視点（三角）
  const f = posOf(course, Math.max(0, Math.min(course.distance, focusS)), course.widthM / 2);
  const fx = toX(f), fy = toY(f);
  ctx.fillStyle = 'rgba(200,30,120,0.95)';
  ctx.beginPath(); ctx.moveTo(fx, fy - 6); ctx.lineTo(fx - 5, fy + 4); ctx.lineTo(fx + 5, fy + 4); ctx.closePath(); ctx.fill();

  // 馬群（自馬は金線）
  for (const h of horses) {
    const p = posOf(course, Math.max(0, Math.min(course.distance + 40, h.s)), h.w);
    const x = toX(p), y = toY(p);
    ctx.fillStyle = frameColorOf(h.gate);
    ctx.beginPath(); ctx.ellipse(x, y, opts === undefined ? 2.6 : 3, opts === undefined ? 2.6 : 3, 0, 0, Math.PI * 2); ctx.fill();
    if (h.own === true) {
      ctx.strokeStyle = opts === undefined ? '#fff' : HUD.gold; ctx.lineWidth = opts === undefined ? 1.5 : 2;
      ctx.beginPath(); ctx.ellipse(x, y, opts === undefined ? 4.2 : 5.6, opts === undefined ? 4.2 : 5.6, 0, 0, Math.PI * 2); ctx.stroke();
    }
  }
  if (opts === undefined) {
    ctx.fillStyle = 'rgba(236,232,211,0.85)'; ctx.font = font(10, true);
    ctx.textAlign = 'left';
    ctx.fillText('コース', box.x + 6, box.y + 12);
    return;
  }
  // 残距離バー 高6（進んだ割合を金で）＋ フッタ「START」「残 400m」
  const barY = map.y + map.height + 2;
  const bx = box.x + 14, bw = box.width - 28;
  ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(bx, barY, bw, 6);
  const metersLeft = opts.metersLeft ?? course.distance;
  const ratio = Math.max(0, Math.min(1, 1 - metersLeft / Math.max(1, course.distance)));
  ctx.fillStyle = goldPlate(ctx, bx, bw, t); ctx.fillRect(bx, barY, Math.round(bw * ratio), 6);
  drawLabel(ctx, font, 'START', bx, barY + 6 + 6 + 12, 'rgba(246,242,231,.42)');
  ctx.textAlign = 'right'; ctx.font = font(16, true); ctx.fillStyle = HUD.gold;
  ctx.fillText(`残 ${Math.max(0, Math.round(metersLeft))}m`, box.x + box.width - 14, barY + 6 + 6 + 13);
  ctx.textAlign = 'left';
  ctx.globalAlpha = baseAlpha;
}
