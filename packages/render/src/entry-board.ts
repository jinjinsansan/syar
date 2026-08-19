/**
 * ★出馬表（発走前オーバーレイ）— 正本 design/hud-ds/components/entry-board
 *   カウントダウン中に開く。暗幕 rgba(2,5,3,.74)（映像は透かす）／タブ「出馬表」x56 y28 h32／板 x40 y56 1200×544／
 *   12 列・右端が 1 番（row-reverse）／枠番 h40（枠色）・馬番 h28・馬名 縦組み 22px 900・騎手 縦組み 14px 70%・
 *   斤量 h22・単勝 h36（データがあるときだけ）／自馬列は金 12% 地＋内側 2px 金枠＋上に「あなたの馬」タグ／
 *   下帯 y616 h104: 「まもなく発走」チップ・案内・ボタン列（表示のみ）・右に発走までカウントダウン 64px 金プレート。
 *   ⚠️ 表示だけ。人気・オッズは渡された値をそのまま（画面側で式を作らない）。
 */
import type { Ctx2D, FontOf, Palette, Viewport2D } from './oblique-draw.js';
import {
  HUD, goldPlate, drawGoldEdge, fillSlant, strokeSlant, drawLabel, drawGoldChip, drawGlassChip, riseAt,
} from './hud-kit.js';
import { inkOn } from './oblique-draw.js';

export interface EntryBoardEntry {
  readonly gate: number;
  readonly name: string;
  readonly jockey: string;
  /** 斤量 kg。無ければ行ごと出さない */
  readonly weightKg?: number | undefined;
  /** 単勝オッズ表示（例 "3.4" / "99.9（上限）"）と人気。無ければ行ごと出さない */
  readonly oddsLabel?: string | undefined;
  readonly popularity?: number | undefined;
  readonly isOwn?: boolean | undefined;
}

export interface EntryBoardMeta {
  readonly raceName: string;
  readonly venue: string;
  readonly raceNo: string;
  readonly distanceMeter: number;
  readonly surfaceLabel: string;
  readonly turnLabel: string;
  readonly weatherLabel: string;
  readonly conditionLabel: string;
  readonly startTimeLabel?: string | undefined;
  /** 賞金 PP（表示だけ） */
  readonly pursePP?: number | undefined;
}

export interface EntryBoardOptions {
  readonly timeSec?: number | undefined;
  /** 開いてからの秒（0.45s ライズ・板はタブより 0.05s 遅れ） */
  readonly sinceSec?: number | undefined;
  /** 発走までの秒。0 以下・省略で出さない */
  readonly secondsToStart?: number | undefined;
  /** 下帯を描くか（既定 true） */
  readonly band?: boolean | undefined;
}

/** 縦組み（1 文字ずつ下へ）。中央揃え。戻り値は描いた高さ */
function drawVertical(ctx: Ctx2D<unknown>, text: string, cx: number, top: number, advance: number): number {
  ctx.textAlign = 'center';
  let y = top;
  for (const ch of text) {
    ctx.fillText(ch, cx, y + advance * 0.82);
    y += advance;
  }
  ctx.textAlign = 'left';
  return text.length * advance;
}

export function drawEntryBoard(
  ctx: Ctx2D<never>, pal: Palette, vp: Viewport2D, font: FontOf,
  entries: readonly EntryBoardEntry[], meta: EntryBoardMeta,
  frameRoleOf: (gate: number, fieldSize: number) => string,
  opts: EntryBoardOptions = {},
): void {
  const t = opts.timeSec ?? 0;
  const since = opts.sinceSec ?? 1;
  const W = vp.width, H = vp.height;
  const baseAlpha = ctx.globalAlpha;
  const fieldSize = entries.length;
  const sorted = [...entries].sort((a, b) => a.gate - b.gate);
  const hasKg = sorted.some((e) => e.weightKg !== undefined);
  const hasOdds = sorted.some((e) => e.oddsLabel !== undefined);

  // 暗幕（映像を透かす）
  ctx.globalAlpha = baseAlpha * Math.min(1, since / 0.25);
  ctx.fillStyle = 'rgba(2,5,3,.74)'; ctx.fillRect(0, 0, W, H);
  // タブ
  const tab = riseAt(since);
  ctx.globalAlpha = baseAlpha * tab.alpha;
  drawGoldChip(ctx, font, '出馬表', 56, 28 + tab.dy, 32, 16, 20, 16 * 0.14);
  // 板 x40 y56 1200×544
  const rise = riseAt(since, 0.05);
  ctx.globalAlpha = baseAlpha * rise.alpha;
  const bx = 40, by = 56 + rise.dy, bw = W - 80, bh = 544;
  ctx.fillStyle = HUD.board; ctx.fillRect(bx, by, bw, bh);
  ctx.strokeStyle = HUD.goldHair; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(bx + 0.5, by + 0.5); ctx.lineTo(bx + bw - 0.5, by + 0.5); ctx.lineTo(bx + bw - 0.5, by + bh - 0.5); ctx.lineTo(bx + 0.5, by + bh - 0.5); ctx.closePath(); ctx.stroke();
  drawGoldEdge(ctx, bx, by, bw, t);
  // 四隅の L 字（14×2・金 50%）
  ctx.fillStyle = HUD.goldDim;
  for (const [lx, ly, sx, sy] of [[bx + 8, by + 12, 1, 1], [bx + bw - 8, by + 12, -1, 1], [bx + 8, by + bh - 8, 1, -1], [bx + bw - 8, by + bh - 8, -1, -1]] as const) {
    ctx.fillRect(sx > 0 ? lx : lx - 14, sy > 0 ? ly : ly - 2, 14, 2);
    ctx.fillRect(sx > 0 ? lx : lx - 2, sy > 0 ? ly : ly - 14, 2, 14);
  }
  // 見出し行 h48
  ctx.textAlign = 'left';
  ctx.font = font(22, true); ctx.fillStyle = HUD.paper;
  ctx.fillText(meta.raceName, bx + 22, by + 4 + 32);
  const rnW = ctx.measureText(meta.raceName).width;
  ctx.font = font(14, true); ctx.fillStyle = 'rgba(246,242,231,.8)';
  ctx.fillText(`${meta.venue}　${meta.raceNo}`, bx + 22 + rnW + 14, by + 4 + 30);
  // 右: 距離・天候馬場・発走・賞金
  ctx.textAlign = 'right';
  let hx = bx + bw - 22;
  if (meta.pursePP !== undefined) {
    ctx.font = font(11, true);
    const ppW = ctx.measureText('PP').width;
    ctx.font = font(18, true);
    const numText = meta.pursePP.toLocaleString('ja-JP');
    const numW = ctx.measureText(numText).width;
    ctx.font = font(11, true);
    const lbW = ctx.measureText('賞金').width + 1.1 * 2;
    const chipW = 10 + lbW + 6 + numW + 6 + ppW + 10;
    ctx.fillStyle = 'rgba(240,204,74,.14)'; ctx.fillRect(hx - chipW, by + 4 + 12, chipW, 26);
    ctx.textAlign = 'left';
    ctx.font = font(11, true); ctx.fillStyle = HUD.gold; ctx.fillText('賞金', hx - chipW + 10, by + 4 + 29);
    ctx.font = font(18, true); ctx.fillStyle = HUD.gold; ctx.fillText(numText, hx - chipW + 10 + lbW + 6, by + 4 + 31);
    ctx.font = font(11, true); ctx.fillStyle = HUD.paper; ctx.fillText('PP', hx - chipW + 10 + lbW + 6 + numW + 6, by + 4 + 29);
    ctx.textAlign = 'right';
    hx -= chipW + 18;
  }
  ctx.font = font(14, true); ctx.fillStyle = HUD.paper;
  const items: string[] = [];
  if (meta.startTimeLabel !== undefined) items.push(`発走 ${meta.startTimeLabel}`);
  items.push(`${meta.weatherLabel} / ${meta.conditionLabel}`);
  items.push(`${meta.surfaceLabel} ${meta.distanceMeter}m ${meta.turnLabel}`);
  for (const [i, item] of items.entries()) {
    ctx.fillStyle = i === 1 ? HUD.paper70 : HUD.paper;
    ctx.fillText(item, hx, by + 4 + 30);
    hx -= ctx.measureText(item).width + 18;
  }
  ctx.textAlign = 'left';
  ctx.fillStyle = HUD.rule; ctx.fillRect(bx, by + 4 + 48, bw, 1);

  // 本体: padding 24 22 0。左に幅 34 の縦ラベル列、右は列（右端が 1 番）
  const top = by + 4 + 48 + 1 + 24;
  const bottom = by + bh;
  const labelW = 34;
  const colsX = bx + 22 + labelW, colsW = bw - 22 - 22 - labelW;
  const n = Math.max(1, sorted.length);
  const colW = colsW / n;
  const frameH = 40, gateH = 28, kgH = hasKg ? 22 : 0, oddsH = hasOdds ? 36 : 0;
  const midTop = top + frameH + gateH, midBottom = bottom - kgH - oddsH;
  // 縦ラベル
  const lab = (text: string, y: number, h: number): void => {
    ctx.font = font(11, true); ctx.fillStyle = HUD.paper45; ctx.textAlign = 'right';
    ctx.fillText(text, bx + 22 + labelW - 4, y + h / 2 + 4); ctx.textAlign = 'left';
  };
  lab('枠', top, frameH); lab('馬番', top + frameH, gateH);
  if (hasKg) lab('斤量', midBottom, kgH);
  if (hasOdds) lab('単勝', midBottom + kgH, oddsH);
  // 頭数可変: 馬名は 22→18px まで落とす
  const nameFont = colW >= 90 ? 22 : colW >= 76 ? 20 : 18;
  const nameAdv = nameFont + 1;
  sorted.forEach((e, i) => {
    // 右端が 1 番
    const cx0 = colsX + colsW - (i + 1) * colW;
    const role = frameRoleOf(e.gate, fieldSize);
    const prevRole = i > 0 ? frameRoleOf(sorted[i - 1]!.gate, fieldSize) : '';
    // 地（偶数列ゼブラ・自馬は金 12%）
    if (e.isOwn === true) { ctx.fillStyle = 'rgba(240,204,74,.12)'; ctx.fillRect(cx0, top, colW, bottom - top); }
    else if (i % 2 === 1) { ctx.fillStyle = 'rgba(255,255,255,.03)'; ctx.fillRect(cx0, top, colW, bottom - top); }
    // 列の左端＝この列（i）と右隣（i-1）の境界。枠が変わる境界だけ 2px 明るく
    if (i > 0) {
      const strong = prevRole !== role;
      ctx.fillStyle = strong ? 'rgba(246,242,231,.5)' : HUD.rule;
      ctx.fillRect(cx0 + colW - (strong ? 1 : 0.5), top, strong ? 2 : 1, bottom - top);
    }
    // 枠番 h40（枠色・数字 26px・下辺に暗い縁）
    ctx.fillStyle = pal[role] ?? '#fff'; ctx.fillRect(cx0, top, colW, frameH);
    ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.fillRect(cx0, top + frameH - 3, colW, 3);
    ctx.fillStyle = inkOn(pal, role); ctx.font = font(26, true); ctx.textAlign = 'center';
    ctx.fillText(role.slice('frame-'.length), cx0 + colW / 2, top + frameH / 2 + 9);
    // 馬番 h28（地 #0b0f0c・20px）
    ctx.fillStyle = '#0b0f0c'; ctx.fillRect(cx0, top + frameH, colW, gateH);
    ctx.fillStyle = HUD.rule; ctx.fillRect(cx0, top + frameH + gateH - 1, colW, 1);
    ctx.fillStyle = HUD.paper; ctx.font = font(20, true);
    ctx.fillText(String(e.gate), cx0 + colW / 2, top + frameH + gateH / 2 + 7);
    ctx.textAlign = 'left';
    // 馬名＋騎手（縦組み・1 組として中央に）
    const nameH = e.name.length * nameAdv;
    const jockey = e.jockey.replace(/\s+/g, '');
    const jockeyH = jockey.length * 15;
    const groupH = nameH + 16 + jockeyH;
    const gTop = midTop + Math.max(10, (midBottom - midTop - groupH) / 2);
    ctx.font = font(nameFont, true); ctx.fillStyle = HUD.paper;
    drawVertical(ctx, e.name, cx0 + colW / 2, gTop, nameAdv);
    ctx.font = font(14, true); ctx.fillStyle = HUD.paper70;
    drawVertical(ctx, jockey, cx0 + colW / 2, gTop + nameH + 16, 15);
    // 斤量 h22
    if (hasKg) {
      ctx.fillStyle = HUD.rule; ctx.fillRect(cx0, midBottom, colW, 1);
      ctx.textAlign = 'center';
      if (e.weightKg !== undefined) {
        ctx.font = font(13, true); ctx.fillStyle = HUD.paper70;
        const kg = e.weightKg.toFixed(1);
        const kgW = ctx.measureText(kg).width;
        ctx.font = font(10, true); const uW = ctx.measureText('kg').width;
        const startX = cx0 + colW / 2 - (kgW + 5 + uW) / 2;
        ctx.textAlign = 'left';
        ctx.font = font(13, true); ctx.fillStyle = HUD.paper70; ctx.fillText(kg, startX, midBottom + 16);
        ctx.font = font(10, true); ctx.fillStyle = HUD.paper45; ctx.fillText('kg', startX + kgW + 5, midBottom + 15);
      }
      ctx.textAlign = 'left';
    }
    // 単勝 h36（3 番人気以内は金地 14%＋金数字）
    if (hasOdds) {
      const oy = midBottom + kgH;
      const top3 = e.popularity !== undefined && e.popularity <= 3;
      ctx.fillStyle = top3 ? 'rgba(240,204,74,.14)' : 'rgba(0,0,0,.35)'; ctx.fillRect(cx0, oy, colW, oddsH);
      ctx.fillStyle = HUD.rule; ctx.fillRect(cx0, oy, colW, 1);
      ctx.textAlign = 'center';
      ctx.font = font(19, true); ctx.fillStyle = top3 ? HUD.gold : HUD.paper;
      ctx.fillText(e.oddsLabel ?? '—', cx0 + colW / 2, oy + 19);
      if (e.popularity !== undefined) {
        ctx.font = font(10, true); ctx.fillStyle = HUD.paper45;
        ctx.fillText(`${e.popularity}番人気`, cx0 + colW / 2, oy + 32);
      }
      ctx.textAlign = 'left';
    }
    // 自馬: 内側 2px 金枠＋上に「あなたの馬」タグ h20
    if (e.isOwn === true) {
      ctx.strokeStyle = HUD.gold; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(cx0 + 1, top + 1); ctx.lineTo(cx0 + colW - 1, top + 1); ctx.lineTo(cx0 + colW - 1, bottom - 1); ctx.lineTo(cx0 + 1, bottom - 1); ctx.closePath(); ctx.stroke();
      ctx.fillStyle = HUD.gold; ctx.fillRect(cx0 - 1, top - 24, colW + 1, 20);
      ctx.fillStyle = HUD.ink; ctx.font = font(11, true); ctx.textAlign = 'center';
      ctx.fillText('あなたの馬', cx0 + colW / 2, top - 24 + 14);
      ctx.textAlign = 'left';
    }
  });

  // 下帯 y616 h104（斜度 -9°）
  if (opts.band !== false) {
    ctx.globalAlpha = baseAlpha * rise.alpha;
    fillSlant(ctx, -40, H - 104, W + 91, 104, HUD.glass);
    drawGoldEdge(ctx, 0, H - 104, W, t);
    const chipW = drawGoldChip(ctx, font, 'まもなく発走', 36, H - 90, 26, 16, 14, 16 * 0.06);
    const own = sorted.find((e) => e.isOwn === true);
    ctx.font = font(17, true); ctx.fillStyle = HUD.paper70;
    const msg = '出馬表を表示中';
    ctx.fillText(msg, 36 + chipW + 14, H - 90 + 19);
    if (own !== undefined) {
      const mw = ctx.measureText(msg).width;
      ctx.fillText('　—　自馬は ', 36 + chipW + 14 + mw, H - 90 + 19);
      const dw = ctx.measureText('　—　自馬は ').width;
      ctx.fillStyle = HUD.gold; ctx.fillText(`${own.gate}番 ${own.name}`, 36 + chipW + 14 + mw + dw, H - 90 + 19);
    }
    // ボタン列（表示のみ）
    let x = 36;
    x += drawGoldChip(ctx, font, '出馬表を閉じる', x, H - 50, 34, 15, 18) + 12;
    x += drawGlassChip(ctx, font, 'オッズ', x, H - 50, 34, 15, 18) + 12;
    ctx.globalAlpha = baseAlpha * rise.alpha * 0.4;
    ctx.font = font(15, true);
    const pw = ctx.measureText('パドック').width + 36;
    fillSlant(ctx, x, H - 50, pw, 34, 'rgba(7,10,8,.5)'); strokeSlant(ctx, x, H - 50, pw, 34, HUD.rule);
    ctx.fillStyle = HUD.paper; ctx.fillText('パドック', x + 18, H - 50 + 17 + 5);
    ctx.globalAlpha = baseAlpha * rise.alpha;
    // カウントダウン
    if (opts.secondsToStart !== undefined && opts.secondsToStart > 0) {
      const secs = Math.ceil(opts.secondsToStart);
      const right = W - 36;
      drawLabel(ctx, font, '発走まで', right, H - 96 + 12, HUD.paper70, 'right');
      const m = Math.floor(secs / 60), s = secs % 60;
      const label = `${m}:${s < 10 ? '0' : ''}${s}`;
      const period = secs <= 5 ? 0.5 : 1.0;
      const blink = Math.floor(t / period) % 2 === 0 ? 1 : 0.62;
      ctx.globalAlpha = baseAlpha * rise.alpha * blink;
      ctx.textAlign = 'right'; ctx.font = font(64, true);
      const tw = ctx.measureText(label).width;
      ctx.fillStyle = goldPlate(ctx, right - tw, tw, t);
      ctx.fillText(label, right, H - 96 + 16 + 54);
      ctx.textAlign = 'left';
    }
  }
  ctx.globalAlpha = baseAlpha;
}
