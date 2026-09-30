/**
 * ★**レース後: まず払戻、次に全体の着順**（★2026-09-30・デザイナー R-25 D25-4・オーナー「まず最初に単勝、複勝、などを見せるべき」）。
 *   ★1 枚目 払戻（★左の列: 単勝・複勝・馬連 ／ ★右の列: ワイド・馬単・3連複・3連単）。★額は全券種で同じ大きさ・同じ白（★煽らない・L-8）。
 *   ★2 枚目 全体の着順（★2 列 × 9 段）。★見出しの右に点 2 つ（★今の枚は金）・★下に残りの秒の金の線。
 * ⚠️ 表示だけ。★払戻・人気は渡された値をそのまま（★画面で計算しない）。★払戻は PP・★100 EP あたり。
 * ⚠️ ★このゲームに枠連はありません（★券種は 7 つ・`TICKET_KINDS`）。
 */
import type { Ctx2D, FontOf, Palette, Viewport2D } from './oblique-draw.js';
import { HUD, drawGoldChip } from './hud-kit.js';
import { drawTierBadge, type TitleTier } from './title-tier.js';
import { drawGateTag } from './entry-board-r25.js';

export interface PayoutBoardLine {
  /** ★券種の名前（★単勝・複勝・馬連・ワイド・馬単・3連複・3連単） */
  readonly label: string;
  /** ★左（0）か右（1）の列 */
  readonly column: 0 | 1;
  readonly horses: readonly number[];
  readonly ordered: boolean;
  /** ★100 EP あたりの払戻（PP）。★null は発売なし */
  readonly payoutPer100: number | null;
  readonly popularity: number | null;
}

export interface OrderBoardRow {
  readonly place: number;
  readonly gate: number;
  readonly name: string;
  readonly margin: string;
  readonly timeLabel: string;
  readonly oddsLabel: string;
  readonly isOwn?: boolean | undefined;
}

export interface ResultsBoardR25Meta {
  readonly raceName: string;
  readonly venue: string;
  readonly raceNo: string;
  readonly tier?: TitleTier | undefined;
}

const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));

function strokeBox(ctx: Ctx2D<unknown>, x: number, y: number, w: number, h: number, color: string, lw: number): void {
  ctx.strokeStyle = color; ctx.lineWidth = lw;
  const o = lw / 2;
  ctx.beginPath(); ctx.moveTo(x + o, y + o); ctx.lineTo(x + w - o, y + o); ctx.lineTo(x + w - o, y + h - o); ctx.lineTo(x + o, y + h - o); ctx.closePath(); ctx.stroke();
}

/** ★見出し（★出馬表と同じ形）＋ 右に点 2 つ ＋ ★下の残り秒の線 */
function drawFrame(
  ctx: Ctx2D<unknown>, font: FontOf, vp: Viewport2D, meta: ResultsBoardR25Meta,
  chip: string, page: 0 | 1, remain: number | null,
): void {
  const W = vp.width, H = vp.height;
  ctx.fillStyle = 'rgba(2,5,3,.62)'; ctx.fillRect(0, 0, W, H);
  const hx = 40, hy = 24, hw = W - 80, hh = 68;
  ctx.fillStyle = 'rgba(7,10,8,.9)'; ctx.fillRect(hx, hy, hw, hh);
  ctx.fillStyle = HUD.gold; ctx.fillRect(hx, hy, hw, 3);
  ctx.fillStyle = HUD.goldHair; ctx.fillRect(hx, hy + hh - 1, hw, 1);
  let x = hx + 18;
  x += drawGoldChip(ctx, font, chip, x, hy + 17, 36, 20, 16) + 14;
  if (meta.tier !== undefined) x += drawTierBadge(ctx, font, meta.tier, meta.raceName, x, hy + 15, 38) + 14;
  ctx.font = font(30, true); ctx.fillStyle = HUD.paper; ctx.fillText(meta.raceName, x, hy + hh / 2 + 10);
  /** ★点 2 つ（★今の枚は金） */
  for (let i = 0; i < 2; i += 1) {
    ctx.fillStyle = i === page ? HUD.gold : 'rgba(246,242,231,.3)';
    ctx.beginPath(); ctx.ellipse(hx + hw - 40 + i * 20, hy + hh / 2, 6, 6, 0, 0, Math.PI * 2); ctx.fill();
  }
  ctx.font = font(18, true); ctx.fillStyle = 'rgba(246,242,231,.8)'; ctx.textAlign = 'right';
  ctx.fillText(`${meta.venue} ${meta.raceNo} ・ 確定`, hx + hw - 72, hy + hh / 2 + 7);
  ctx.textAlign = 'left';
  if (remain !== null) { ctx.fillStyle = HUD.gold; ctx.fillRect(0, H - 5, W * clamp01(remain), 5); }
}

export function drawPayoutBoardR25(
  ctx: Ctx2D<never>, pal: Palette, vp: Viewport2D, font: FontOf,
  lines: readonly PayoutBoardLine[], meta: ResultsBoardR25Meta,
  frameRoleOf: (gate: number, fieldSize: number) => string, fieldSize: number,
  opts: { readonly alpha?: number; readonly remain?: number | null } = {},
): void {
  const u = ctx as unknown as Ctx2D<unknown>;
  const base = ctx.globalAlpha;
  ctx.globalAlpha = base * (opts.alpha ?? 1);
  drawFrame(u, font, vp, meta, '払戻', 0, opts.remain ?? null);
  const colGap = 16, colW = (vp.width - 80 - colGap) / 2, rowH = 64, kindGap = 10;
  for (const col of [0, 1] as const) {
    let y = 104, prevLabel = '';
    const x0 = 40 + col * (colW + colGap);
    for (const line of lines.filter((l) => l.column === col)) {
      if (prevLabel !== '' && line.label !== prevLabel) y += kindGap;
      ctx.fillStyle = 'rgba(7,10,8,.82)'; ctx.fillRect(x0, y, colW, rowH);
      ctx.fillStyle = 'rgba(246,242,231,.12)'; ctx.fillRect(x0, y + rowH - 1, colW, 1);
      /** ★券種の札 112px（★同じ券種の 2 行目からは字を出さない） */
      ctx.fillStyle = 'rgba(240,204,74,.12)'; ctx.fillRect(x0, y, 112, rowH);
      ctx.fillStyle = 'rgba(240,204,74,.5)'; ctx.fillRect(x0 + 110, y, 2, rowH);
      if (line.label !== prevLabel) { ctx.font = font(24, true); ctx.fillStyle = HUD.paper; ctx.textAlign = 'center'; ctx.fillText(line.label, x0 + 56, y + rowH / 2 + 9); ctx.textAlign = 'left'; }
      /** ★組（★枠の色の札 46×40・「−」順不同／「→」着順どおり） */
      let cx = x0 + 126;
      line.horses.forEach((g, i) => {
        if (i > 0) { ctx.font = font(24, true); ctx.fillStyle = 'rgba(246,242,231,.75)'; ctx.fillText(line.ordered ? '→' : '−', cx, y + rowH / 2 + 8); cx += 28; }
        drawGateTag(u, pal, font, frameRoleOf(g, fieldSize), g, cx, y + (rowH - 40) / 2, 46, 40, 26);
        cx += 52;
      });
      /** ★払戻（★全券種 同じ大きさ・同じ白）＋「PP」・人気 */
      const right = x0 + colW - 16;
      ctx.textAlign = 'right';
      if (line.popularity !== null) { ctx.font = font(16, true); ctx.fillStyle = 'rgba(246,242,231,.7)'; ctx.fillText(`${line.popularity}番人気`, right, y + rowH / 2 + 6); }
      const payRight = right - 100;
      if (line.payoutPer100 === null) {
        ctx.font = font(22, true); ctx.fillStyle = 'rgba(246,242,231,.6)'; ctx.fillText('発売なし', payRight, y + rowH / 2 + 8);
      } else {
        ctx.font = font(15, true); ctx.fillStyle = 'rgba(246,242,231,.7)'; ctx.fillText('PP', payRight, y + rowH / 2 + 10);
        const ppW = ctx.measureText('PP').width;
        /** ★組の札に掛からないよう ★幅が足りなければ字を小さく（★最小 24px・★全券種 同じ白） */
        const amount = line.payoutPer100.toLocaleString('ja-JP');
        let apx = 34;
        ctx.font = font(apx, true);
        while (apx > 24 && payRight - ppW - 6 - ctx.measureText(amount).width < cx + 16) { apx -= 1; ctx.font = font(apx, true); }
        ctx.fillStyle = '#ffffff'; ctx.fillText(amount, payRight - ppW - 6, y + rowH / 2 + 12);
      }
      ctx.textAlign = 'left';
      prevLabel = line.label;
      y += rowH;
    }
  }
  ctx.font = font(16, true); ctx.fillStyle = 'rgba(246,242,231,.8)';
  ctx.fillText('払戻は 100 EP あたり（PP で払います）', 40, 600);
  ctx.textAlign = 'right'; ctx.fillText('タップで 全体の着順へ', vp.width - 40, 600); ctx.textAlign = 'left';
  ctx.globalAlpha = base;
}

export function drawOrderBoardR25(
  ctx: Ctx2D<never>, pal: Palette, vp: Viewport2D, font: FontOf,
  rows: readonly OrderBoardRow[], meta: ResultsBoardR25Meta,
  frameRoleOf: (gate: number, fieldSize: number) => string,
  opts: { readonly alpha?: number; readonly remain?: number | null; readonly hasPayout?: boolean } = {},
): void {
  const u = ctx as unknown as Ctx2D<unknown>;
  const base = ctx.globalAlpha;
  ctx.globalAlpha = base * (opts.alpha ?? 1);
  drawFrame(u, font, vp, meta, '着順', 1, opts.remain ?? null);
  const n = rows.length;
  const sorted = [...rows].sort((a, b) => a.place - b.place);
  const perCol = Math.ceil(n / 2);
  const rowH = n > 12 ? 54 : 72;
  const colGap = 16, colW = (vp.width - 80 - colGap) / 2;
  /** ★列の中の位置（★着順 48・馬番 54・馬名・着差 90・タイム 96・単勝 84） */
  const colsOf = (x0: number) => ({
    place: x0 + 12, gate: x0 + 60, name: x0 + 110, odds: x0 + colW - 12, time: x0 + colW - 100, margin: x0 + colW - 200,
  });
  for (const col of [0, 1] as const) {
    const x0 = 40 + col * (colW + colGap);
    const c = colsOf(x0);
    ctx.font = font(13, true); ctx.fillStyle = 'rgba(246,242,231,.6)';
    ctx.fillText('着順', c.place, 118); ctx.fillText('馬番', c.gate, 118); ctx.fillText('馬名', c.name, 118);
    ctx.textAlign = 'right';
    ctx.fillText('着差', c.margin, 118); ctx.fillText('タイム', c.time, 118); ctx.fillText('単勝', c.odds, 118);
    ctx.textAlign = 'left';
  }
  sorted.forEach((r, i) => {
    const col = i < perCol ? 0 : 1;
    const row = col === 0 ? i : i - perCol;
    const x0 = 40 + col * (colW + colGap), y = 126 + row * rowH;
    const c = colsOf(x0);
    const mine = r.isOwn === true;
    ctx.fillStyle = mine ? 'rgba(240,204,74,.20)' : (row % 2 === 0 ? 'rgba(18,24,20,.82)' : 'rgba(7,10,8,.8)');
    ctx.fillRect(x0, y, colW, rowH);
    ctx.fillStyle = 'rgba(246,242,231,.12)'; ctx.fillRect(x0, y + rowH - 1, colW, 1);
    const mid = y + rowH / 2;
    ctx.font = font(32, true); ctx.fillStyle = r.place === 1 ? HUD.gold : HUD.paper; ctx.fillText(String(r.place), c.place, mid + 11);
    drawGateTag(u, pal, font, frameRoleOf(r.gate, n), r.gate, c.gate, mid - 17, 38, 34, 22);
    let p = 23;
    ctx.font = font(p, true);
    while (p > 15 && ctx.measureText(r.name).width > c.margin - 70 - c.name) { p -= 1; ctx.font = font(p, true); }
    ctx.fillStyle = HUD.paper; ctx.fillText(r.name, c.name, mid + 8);
    ctx.textAlign = 'right';
    ctx.font = font(18, true); ctx.fillStyle = 'rgba(246,242,231,.85)'; ctx.fillText(r.margin, c.margin, mid + 7);
    ctx.font = font(22, true); ctx.fillStyle = HUD.paper; ctx.fillText(r.timeLabel, c.time, mid + 8);
    ctx.fillStyle = 'rgba(246,242,231,.75)'; ctx.fillText(r.oddsLabel, c.odds, mid + 8);
    ctx.textAlign = 'left';
    if (mine) strokeBox(u, x0, y, colW, rowH, HUD.gold, 3);
  });
  if (opts.hasPayout === true) {
    ctx.font = font(16, true); ctx.fillStyle = 'rgba(246,242,231,.8)'; ctx.textAlign = 'right';
    ctx.fillText('タップで 払戻へ', vp.width - 40, 700); ctx.textAlign = 'left';
  }
  ctx.globalAlpha = base;
}
