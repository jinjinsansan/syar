/**
 * ★**発走前の出馬表**（★2026-09-30・デザイナー R-25 D25-3・実装表そのまま）。
 *   ★縦書きの 12 列をやめ、★横書きの 2 列の表（左に前半・右に後半）。★4 秒で自分の馬と人気馬が見つかるように、
 *   ★上に「あなたの馬」と「1番人気」を並べた注目の 1 行。★単勝は全頭同じ色（★人気は札で示す）。
 * ⚠️ 表示だけ。人気・オッズは渡された値をそのまま（画面側で式を作らない）。
 */
import type { Ctx2D, FontOf, Palette, Viewport2D } from './oblique-draw.js';
import { inkOn } from './oblique-draw.js';
import { HUD, goldPlate, drawLabel, drawGoldChip } from './hud-kit.js';
import { drawTierBadge, type TitleTier } from './title-tier.js';
import type { EntryBoardEntry, EntryBoardMeta } from './entry-board.js';

export interface EntryBoardR25Options {
  readonly timeSec?: number | undefined;
  /** ★開いてからの秒 */
  readonly sinceSec?: number | undefined;
  /** ★発走までの秒。0 以下・省略で出さない */
  readonly secondsToStart?: number | undefined;
  readonly reducedMotion?: boolean | undefined;
  /** ★格（★見出しの札）。★省けば札を出さない */
  readonly tier?: TitleTier | undefined;
}

const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));

/** ★長い名前は 字を小さくして 幅に収める（★最小 `minPx`） */
function fitText(ctx: Ctx2D<unknown>, font: FontOf, text: string, px: number, minPx: number, maxW: number): number {
  let p = px;
  ctx.font = font(p, true);
  while (p > minPx && ctx.measureText(text).width > maxW) { p -= 1; ctx.font = font(p, true); }
  return p;
}

function strokeBox(ctx: Ctx2D<unknown>, x: number, y: number, w: number, h: number, color: string, lw: number): void {
  ctx.strokeStyle = color; ctx.lineWidth = lw;
  const o = lw / 2;
  ctx.beginPath(); ctx.moveTo(x + o, y + o); ctx.lineTo(x + w - o, y + o); ctx.lineTo(x + w - o, y + h - o); ctx.lineTo(x + o, y + h - o); ctx.closePath(); ctx.stroke();
}

/** ★馬番の札（★枠の色の地・★白・黄・桃の枠は暗い字） */
export function drawGateTag(
  ctx: Ctx2D<unknown>, pal: Palette, font: FontOf, role: string, gate: number, x: number, y: number, w: number, h: number, px: number,
): void {
  ctx.fillStyle = pal[role] ?? '#fff'; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = inkOn(pal, role); ctx.font = font(px, true); ctx.textAlign = 'center';
  ctx.fillText(String(gate), x + w / 2, y + h / 2 + px * 0.36);
  ctx.textAlign = 'left';
}

export function drawEntryBoardR25(
  ctx: Ctx2D<never>, pal: Palette, vp: Viewport2D, font: FontOf,
  entries: readonly EntryBoardEntry[], meta: EntryBoardMeta,
  frameRoleOf: (gate: number, fieldSize: number) => string,
  opts: EntryBoardR25Options = {},
): void {
  const u = ctx as unknown as Ctx2D<unknown>;
  const t = opts.timeSec ?? 0;
  const since = opts.sinceSec ?? 2;
  const reduced = opts.reducedMotion === true;
  const W = vp.width, H = vp.height;
  const base = ctx.globalAlpha;
  const sorted = [...entries].sort((a, b) => a.gate - b.gate);
  const n = sorted.length;
  const big = n > 12;

  /** ★暗幕（★映像を透かす・0.25 秒） */
  ctx.globalAlpha = base * (reduced ? 1 : clamp01(since / 0.25));
  ctx.fillStyle = 'rgba(2,5,3,.62)'; ctx.fillRect(0, 0, W, H);
  const head = reduced ? 1 : clamp01((since - 0.1) / 0.25);
  ctx.globalAlpha = base * head;

  /** ★見出し x40 y24 1200×68 */
  const hx = 40, hy = 24, hw = W - 80, hh = 68;
  ctx.fillStyle = 'rgba(7,10,8,.9)'; ctx.fillRect(hx, hy, hw, hh);
  ctx.fillStyle = HUD.gold; ctx.fillRect(hx, hy, hw, 3);
  ctx.fillStyle = HUD.goldHair; ctx.fillRect(hx, hy + hh - 1, hw, 1);
  let x = hx + 18;
  x += drawGoldChip(u, font, '出馬表', x, hy + 17, 36, 20, 16) + 14;
  if (opts.tier !== undefined) x += drawTierBadge(u, font, opts.tier, meta.raceName, x, hy + 15, 38) + 14;
  const rightItems = [`${meta.venue} ${meta.raceNo}`, `${meta.surfaceLabel}${meta.distanceMeter}m ${meta.turnLabel}`, `${meta.weatherLabel}/${meta.conditionLabel}`];
  if (meta.startTimeLabel !== undefined) rightItems.push(`発走 ${meta.startTimeLabel}`);
  const rightText = rightItems.join(' ・ ');
  ctx.font = font(18, true);
  const rw = ctx.measureText(rightText).width;
  ctx.fillStyle = 'rgba(246,242,231,.8)'; ctx.textAlign = 'right';
  ctx.fillText(rightText, hx + hw - 18, hy + hh / 2 + 7);
  ctx.textAlign = 'left';
  fitText(u, font, meta.raceName, 30, 20, hx + hw - 18 - rw - 20 - x);
  ctx.fillStyle = HUD.paper; ctx.fillText(meta.raceName, x, hy + hh / 2 + 10);

  /** ★注目の 1 行 x40 y100 1200×40（★あなたの馬 ／ 1番人気。★自分の馬が 1 番人気なら左だけ） */
  const own = sorted.find((e) => e.isOwn === true);
  const fav = sorted.find((e) => e.popularity === 1);
  const fy = 100, fh = 40;
  ctx.fillStyle = 'rgba(7,10,8,.72)'; ctx.fillRect(hx, fy, hw, fh);
  const focusItem = (e: EntryBoardEntry, label: string, labelGold: boolean, x0: number): void => {
    ctx.font = font(15, true);
    const lw = ctx.measureText(label).width + 20;
    if (labelGold) { ctx.fillStyle = HUD.gold; ctx.fillRect(x0, fy + 8, lw, 24); ctx.fillStyle = HUD.ink; }
    else { strokeBox(u, x0, fy + 8, lw, 24, HUD.gold, 2); ctx.fillStyle = HUD.gold; }
    ctx.fillText(label, x0 + 10, fy + 25);
    let xx = x0 + lw + 10;
    drawGateTag(u, pal, font, frameRoleOf(e.gate, n), e.gate, xx, fy + 7, 30, 26, 18);
    xx += 40;
    ctx.font = font(18, true); ctx.fillStyle = HUD.paper; ctx.fillText(e.name, xx, fy + 27);
    xx += ctx.measureText(e.name).width + 10;
    if (e.popularity !== undefined && label !== '1番人気') {
      ctx.font = font(15, true); ctx.fillStyle = HUD.paper70; ctx.fillText(`${e.popularity}番人気`, xx, fy + 26);
    }
  };
  if (own !== undefined) focusItem(own, 'あなたの馬', true, hx + 14);
  if (fav !== undefined && fav !== own) {
    const fx = own === undefined ? hx + 14 : hx + hw / 2;
    if (own !== undefined) { ctx.fillStyle = HUD.rule; ctx.fillRect(fx - 14, fy + 8, 1, 24); }
    focusItem(fav, '1番人気', false, fx);
  }

  /** ★行（★2 列・18 頭は 50px・12 頭以下は 66px） */
  const rowH = big ? 50 : 66, top = big ? 150 : 160;
  const perCol = Math.ceil(n / 2);
  const colGap = 16, colW = (hw - colGap) / 2;
  const namePx = big ? 24 : 28;
  sorted.forEach((e, i) => {
    const col = i < perCol ? 0 : 1;
    const row = col === 0 ? i : i - perCol;
    const rx = hx + col * (colW + colGap), ry = top + row * rowH;
    const appear = reduced ? 1 : clamp01((since - 0.25 - i * 0.02) / 0.25);
    if (appear <= 0) return;
    ctx.globalAlpha = base * appear;
    const role = frameRoleOf(e.gate, n);
    const mine = e.isOwn === true;
    ctx.fillStyle = mine ? 'rgba(240,204,74,.20)' : (row % 2 === 0 ? 'rgba(18,24,20,.82)' : 'rgba(7,10,8,.8)');
    ctx.fillRect(rx, ry, colW, rowH);
    ctx.fillStyle = 'rgba(246,242,231,.12)'; ctx.fillRect(rx, ry + rowH - 1, colW, 1);
    /** ★左 52px を枠の色・馬番 30px・右に 3px の暗い線 */
    drawGateTag(u, pal, font, role, e.gate, rx, ry, 52, rowH - 1, 30);
    ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillRect(rx + 52, ry, 3, rowH - 1);
    /** ★右から: 人気の札 70 ／ 単勝 90 ／ 騎手 118 */
    const popW = 70, oddsW = 90, jockW = 118;
    const popX = rx + colW - 10 - popW;
    const oddsR = popX - 12;
    const jockX = oddsR - oddsW - 10 - jockW;
    let nx = rx + 64;
    if (mine) {
      ctx.font = font(13, true);
      const tw = ctx.measureText('あなたの馬').width + 12;
      ctx.fillStyle = HUD.gold; ctx.fillRect(nx, ry + rowH / 2 - 10, tw, 20);
      ctx.fillStyle = HUD.ink; ctx.fillText('あなたの馬', nx + 6, ry + rowH / 2 + 5);
      nx += tw + 8;
    }
    fitText(u, font, e.name, namePx, 16, jockX - 10 - nx);
    ctx.fillStyle = HUD.paper; ctx.fillText(e.name, nx, ry + rowH / 2 + namePx * 0.36);
    if (e.jockey !== '') {
      fitText(u, font, e.jockey, 15, 11, jockW);
      ctx.fillStyle = HUD.paper70; ctx.fillText(e.jockey, jockX, ry + rowH / 2 + 5);
    }
    if (e.oddsLabel !== undefined) {
      ctx.font = font(28, true); ctx.fillStyle = HUD.paper; ctx.textAlign = 'right';
      ctx.fillText(e.oddsLabel, oddsR, ry + rowH / 2 + 10);
      ctx.textAlign = 'left';
    }
    if (e.popularity !== undefined) {
      const label = `${e.popularity}番人気`;
      ctx.font = font(15, true);
      const py = ry + rowH / 2 - 12;
      if (e.popularity === 1) { ctx.fillStyle = HUD.gold; ctx.fillRect(popX, py, popW, 24); ctx.fillStyle = '#12140f'; }
      else if (e.popularity <= 3) { strokeBox(u, popX, py, popW, 24, HUD.gold, 2); ctx.fillStyle = HUD.gold; }
      else ctx.fillStyle = 'rgba(246,242,231,.55)';
      ctx.textAlign = 'center'; ctx.fillText(label, popX + popW / 2, py + 17); ctx.textAlign = 'left';
    }
    if (mine) {
      /** ★1.0 秒で 自分の馬の金枠を 1 回だけ明るく */
      const pulse = reduced ? 0 : Math.max(0, 1 - Math.abs(since - 1.0) / 0.3);
      strokeBox(u, rx, ry, colW, rowH, pulse > 0 ? '#ffe483' : HUD.gold, 3);
    }
  });

  /** ★下の帯（★高さ 96・ガラス .88・上縁 4px 金） */
  ctx.globalAlpha = base * head;
  const by = H - 96;
  ctx.fillStyle = 'rgba(7,10,8,.88)'; ctx.fillRect(0, by, W, 96);
  ctx.fillStyle = HUD.gold; ctx.fillRect(0, by, W, 4);
  const chipW = drawGoldChip(u, font, 'まもなく発走', 36, by + 30, 36, 18, 16);
  ctx.font = font(20, true); ctx.fillStyle = HUD.paper;
  ctx.fillText(`${n}頭 ・ 自分の馬と人気馬に印`, 36 + chipW + 16, by + 55);
  if (opts.secondsToStart !== undefined && opts.secondsToStart > 0) {
    const secs = Math.ceil(opts.secondsToStart);
    const label = `${Math.floor(secs / 60)}:${secs % 60 < 10 ? '0' : ''}${secs % 60}`;
    ctx.font = font(60, true); ctx.textAlign = 'right';
    const tw = ctx.measureText(label).width;
    ctx.fillStyle = goldPlate(u, W - 36 - tw, tw, t) as string;
    ctx.fillText(label, W - 36, by + 72);
    ctx.textAlign = 'left';
    drawLabel(u, font, '発走まで', W - 36 - tw - 16, by + 60, HUD.paper70, 'right');
  }
  ctx.globalAlpha = base;
}
