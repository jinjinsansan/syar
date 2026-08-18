import { posOf, type Course } from './course.js';
import type { Ctx2D, FontOf, Palette } from './oblique-draw.js';

/**
 * ★コース図ミニマップ。カットが切り替わっても「今どこを見ているか」を頭の中で繋ぐための手がかり
 *   （ユーザー指摘「切り替えた後に別のシーンに見える」）。
 *   走路の帯（内ラチ〜外ラチ）を上から見た形で描き、馬群を点、カメラの注視点を三角で示す。
 *   ⚠️ 位置は描画に使っている値をそのまま点にするだけ。順位・着差の計算はしない。
 */
export interface MinimapHorse {
  readonly gate: number;
  readonly s: number;
  readonly w: number;
  readonly own?: boolean;
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
): void {
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
  const pad = 10;
  const spanX = Math.max(1, maxX - minX), spanY = Math.max(1, maxY - minY);
  const scale = Math.min((box.width - pad * 2) / spanX, (box.height - pad * 2) / spanY);
  const ox = box.x + (box.width - spanX * scale) / 2;
  const oy = box.y + (box.height - spanY * scale) / 2;
  // ★世界座標 y の向き: 画面では上を +y にしない（コース図は上から見た形。左回りが左回りに見える向き）
  const toX = (p: { x: number; y: number }): number => ox + (p.x - minX) * scale;
  const toY = (p: { x: number; y: number }): number => oy + (maxY - p.y) * scale;

  // 板
  ctx.fillStyle = 'rgba(5,10,8,0.62)';
  ctx.fillRect(box.x, box.y, box.width, box.height);
  ctx.strokeStyle = 'rgba(236,232,211,0.35)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(box.x + 0.5, box.y + 0.5); ctx.lineTo(box.x + box.width - 0.5, box.y + 0.5);
  ctx.lineTo(box.x + box.width - 0.5, box.y + box.height - 0.5); ctx.lineTo(box.x + 0.5, box.y + box.height - 0.5); ctx.closePath(); ctx.stroke();

  // 走路の帯
  ctx.fillStyle = pal['turf-2'] ?? '#5f8f45';
  ctx.beginPath();
  inner.forEach((p, i) => { if (i === 0) ctx.moveTo(toX(p), toY(p)); else ctx.lineTo(toX(p), toY(p)); });
  for (let i = outer.length - 1; i >= 0; i -= 1) ctx.lineTo(toX(outer[i]!), toY(outer[i]!));
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(240,240,236,0.8)'; ctx.lineWidth = 1;
  for (const line of [inner, outer]) {
    ctx.beginPath();
    line.forEach((p, i) => { if (i === 0) ctx.moveTo(toX(p), toY(p)); else ctx.lineTo(toX(p), toY(p)); });
    ctx.stroke();
  }
  // 発走・決勝線
  const tick = (s: number, color: string): void => {
    const a = posOf(course, s, -1.5), b = posOf(course, s, course.widthM + 1.5);
    ctx.strokeStyle = color; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(toX(a), toY(a)); ctx.lineTo(toX(b), toY(b)); ctx.stroke();
  };
  tick(0, 'rgba(255,255,255,0.9)');
  tick(course.distance, pal['frame-5'] ?? '#e9c94d');

  // カメラの注視点（三角）
  const f = posOf(course, Math.max(0, Math.min(course.distance, focusS)), course.widthM / 2);
  const fx = toX(f), fy = toY(f);
  ctx.fillStyle = 'rgba(200,30,120,0.95)';
  ctx.beginPath(); ctx.moveTo(fx, fy - 6); ctx.lineTo(fx - 5, fy + 4); ctx.lineTo(fx + 5, fy + 4); ctx.closePath(); ctx.fill();

  // 馬群（自馬は白縁）
  for (const h of horses) {
    const p = posOf(course, Math.max(0, Math.min(course.distance + 40, h.s)), h.w);
    const x = toX(p), y = toY(p);
    ctx.fillStyle = frameColorOf(h.gate);
    ctx.beginPath(); ctx.ellipse(x, y, 2.6, 2.6, 0, 0, Math.PI * 2); ctx.fill();
    if (h.own === true) {
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.ellipse(x, y, 4.2, 4.2, 0, 0, Math.PI * 2); ctx.stroke();
    }
  }
  ctx.fillStyle = 'rgba(236,232,211,0.85)'; ctx.font = font(10, true);
  ctx.textAlign = 'left';
  ctx.fillText('コース', box.x + 6, box.y + 12);
}
