/**
 * ★**画面の座標系の UI**（ゲージ・順位・実況帯）— アートバイブル §9
 *
 * 【★守ること】
 *   ⚠️ ★**カメラの倍率も中心も一切使いません。** ここに `cam` を持ち込んだ瞬間、
 *      寄りの最中にゲージが動きます。**カメラが情報を隠せなくなる**のが §9 の狙いです。
 *
 * 【★ゲージについて（D-070 / D-072）】
 *   ⚠️ ★**この層で式を作りません。** エンジンの `staminaAt()` が出した
 *      **残量と減り方**を受け取って描くだけです。
 *      ★一度この層で近似を作って**符号が逆**になりました
 *        （残り200m で 余力と着順の順位相関 −0.653 ＝ **勝つ馬ほどバテて見えていた**）。
 *   ★`emptyAtMeter`（いつ尽きるか）は**受け取りません**。予言はさせません。
 */

import type { Ctx2D, FontOf, Palette, Viewport2D } from './oblique-draw.js';
import { inkOn } from './oblique-draw.js';
import {
  HUD, goldPlate, drawGoldEdge, fillSlant, strokeSlant, drawGlassNotchPanel, drawFrameBadge,
  drawLabel, drawSpacedText, spacedWidth, riseAt, wipeAt, drawOnAir, typedCount, drawNarratorFrame,
  drawGoldChip, formatRaceTime,
} from './hud-kit.js';

/** 実況の1行。★**馬名（馬番）だけ色を変える**（全部色を付けると主語が分からない） */
export interface CallPart {
  readonly text: string;
  /** 枠色の役割名。省略すると地の色 */
  readonly role?: string | undefined;
}

/** レース映像の局面ごとに、互いに競合する HUD を整理する。 */
export interface RaceHudVisibility {
  readonly gauge: boolean;
  readonly standings: boolean;
  readonly calls: boolean;
  readonly result: boolean;
}

export function raceHudVisibilityAt(
  displaySec: number, raceDisplaySec: number, allFinished: boolean,
): RaceHudVisibility {
  if (allFinished) {
    const afterFinish = Math.max(0, displaySec - raceDisplaySec);
    return { gauge: false, standings: false, calls: false, result: afterFinish >= 2.4 };
  }
  // 発馬直後は映像そのものを見せ、情報は一拍遅れて載せる。
  const settled = displaySec >= 0.8;
  return { gauge: settled, standings: settled, calls: settled, result: false };
}

/** 微小な順位変動による実況の連打を止める。局面転換だけは即時に通す。 */
export function shouldEmitRaceCall(
  previousKey: string, nextKey: string, previousSec: number, displaySec: number,
): boolean {
  if (previousKey === nextKey) return false;
  const previousPhase = previousKey.split('/')[0] ?? '';
  const nextPhase = nextKey.split('/')[0] ?? '';
  return previousKey === '' || previousPhase !== nextPhase || displaySec - previousSec >= 1.5;
}

/**
 * ★**自馬のスタミナゲージ**（§12.6「自馬にのみ表示」）。
 *
 * @param left  ★エンジンの `staminaAt().left`（0 で止めた値）
 * @param initial ★発走時の残量（`StaminaGauge.initial`）
 * @param drainPerMeter ★エンジンの `staminaAt().drainPerMeter`
 */
export function drawGauge(
  ctx: Ctx2D<never>, pal: Palette, vp: Viewport2D, font: FontOf,
  label: string, left: number, initial: number, drainPerMeter: number,
): void {
  const ratio = Math.max(0, Math.min(1, left / Math.max(1e-6, initial)));
  const x = 40, y = vp.height - 70, w = 300, h = 18;
  ctx.fillStyle = 'rgba(16,20,16,0.72)';
  ctx.fillRect(x - 8, y - 26, w + 16, h + 42);
  ctx.fillStyle = pal['paper-0'] ?? '#fff';
  ctx.font = font(14, true);
  ctx.fillText(label, x, y - 10);
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(x, y, w, h);
  /**
   * ★**色は「残量」ではなく「状態」で変える。**
   *   ⚠️ 数字だけだと、押す瞬間に読み取れません（C-6）。
   */
  ctx.fillStyle = ratio > 0.5
    ? (pal['frame-6'] ?? '#1a5')
    : ratio > 0.2 ? (pal['frame-5'] ?? '#fd2') : (pal['frame-3'] ?? '#d22');
  ctx.fillRect(x, y, Math.round(w * ratio), h);
  ctx.strokeStyle = pal['paper-0'] ?? '#fff';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + h);
  ctx.lineTo(x, y + h); ctx.closePath();
  ctx.stroke();
  /**
   * ★**減り方**（D-070 の②）。
   *   ⚠️ ★「いつ尽きるか」は出しません（出すと状態ではなく**予言**になります）。
   *      **いまどれだけ速く減っているか**だけを、目盛りの本数で見せます。
   */
  const bars = Math.max(1, Math.min(5, Math.round((drainPerMeter * 100) / 1.2)));
  for (let i = 0; i < 5; i += 1) {
    ctx.fillStyle = i < bars ? (pal['paper-0'] ?? '#fff') : 'rgba(255,255,255,0.22)';
    ctx.fillRect(x + w + 8 + i * 7, y + h - 4 - i * 3, 5, 4 + i * 3);
  }
  ctx.fillStyle = pal['paper-0'] ?? '#fff';
  ctx.font = font(11);
  ctx.fillText('減り方', x + w + 8, y - 4);
}

/** 順位表示の1行 */
export interface StandingRow {
  readonly gate: number;
  /** 馬名（本線の順位パネルは馬名を出す）。無ければ馬番だけ */
  readonly name?: string | undefined;
  /** 先頭との差（馬身）。★ゴール後は使いません */
  readonly lengths: number;
  /** ★ゴール後に出す走破タイム（秒）。無ければ差を出します */
  readonly timeSec?: number | undefined;
  readonly isOwn: boolean;
}

export interface ResultRow {
  readonly place: number;
  readonly gate: number;
  readonly margin: string;
}

/** ゴール後専用。ライブ順位とは同時表示しない。 */
export function drawResultPanel(
  ctx: Ctx2D<never>, pal: Palette, vp: Viewport2D, font: FontOf,
  rows: readonly ResultRow[], fieldSize: number,
  frameRoleOf: (gate: number, fieldSize: number) => string,
): void {
  const shown = rows.slice(0, 5);
  const w = 330;
  // 勝者は画面中央〜左に残す構図なので、結果は右のセーフエリアへ置く。
  const x = vp.width - w - 48;
  const y = 120;
  ctx.fillStyle = 'rgba(22,20,17,0.88)';
  ctx.fillRect(x, y, w, 34 + shown.length * 28);
  ctx.textAlign = 'left';
  ctx.fillStyle = pal['frame-5'] ?? '#f2c14e';
  ctx.font = font(16, true);
  ctx.fillText('着 順', x + 16, y + 24);
  shown.forEach((row, i) => {
    const yy = y + 52 + i * 28;
    ctx.fillStyle = pal['paper-0'] ?? '#fff';
    ctx.font = font(16, true);
    ctx.fillText(String(row.place), x + 18, yy);
    const role = frameRoleOf(row.gate, fieldSize);
    ctx.fillStyle = pal[role] ?? pal['paper-0'] ?? '#fff';
    ctx.fillRect(x + 48, yy - 15, 24, 20);
    ctx.fillStyle = inkOn(pal, role);
    ctx.textAlign = 'center';
    ctx.font = font(14, true);
    ctx.fillText(String(row.gate), x + 60, yy);
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(246,242,231,0.75)';
    ctx.font = font(15);
    ctx.fillText(row.margin, x + 92, yy);
  });
}

/**
 * ★順位表示（本線 = design/hud-ds/components/screen-live: x930 y34 314×224）。★色は枠、数字は個体（D-060）。
 *
 * ⚠️ ★**ゴールした馬は「確定着順」で渡してください。**
 *    画面上の距離で並べると、★**ゴール後は全馬が同じ位置に張り付き、
 *    「0.0 馬身」だらけで着順が読めません**（実際にそうなりました）。
 */
export interface StandingsOptions {
  /** 見出し右のラベル（例: 区間名） */
  readonly rightLabel?: string | undefined;
  /** 光沢・脈動の時刻（秒） */
  readonly timeSec?: number | undefined;
  /** 表示開始からの秒（登場アニメ 0.45s・行は 0.08s ずつ遅延）。省略で静止 */
  readonly sinceSec?: number | undefined;
  /**
   * ★その馬の**行の位置（小数可）**。省略すると並び順のまま瞬時に描く。
   *   ⚠️ ★順位そのものではありません。**行が動く見た目**だけを滑らかにするための値です。
   */
  readonly animIndexOf?: ((gate: number) => number | undefined) | undefined;
}

export function drawStandings(
  ctx: Ctx2D<never>, pal: Palette, vp: Viewport2D, font: FontOf,
  rows: readonly StandingRow[], fieldSize: number,
  frameRoleOf: (gate: number, fieldSize: number) => string,
  opts: StandingsOptions = {},
): void {
  const shown = rows.slice(0, 5);
  const t = opts.timeSec ?? 0;
  const px = vp.width - 350, py = 34, pw = 314;
  const ph = 4 + 34 + 34 + Math.max(0, shown.length - 1) * 35 + 10;
  const rise = riseAt(opts.sinceSec ?? 1);
  const baseAlpha = ctx.globalAlpha;
  ctx.globalAlpha = baseAlpha * rise.alpha;
  const oy = rise.dy;
  drawGlassNotchPanel(ctx, px, py + oy, pw, ph, t);
  drawLabel(ctx, font, 'ORDER', px + 14, py + oy + 4 + 22);
  if (opts.rightLabel !== undefined) drawLabel(ctx, font, opts.rightLabel, px + pw - 14, py + oy + 4 + 22, HUD.paper70, 'right');
  const rowTop = py + oy + 4 + 34;
  /**
   * ★行の縦位置。1 位の行だけ高さ 34、以下は 35 間隔。
   *   `idx` は**小数**を受けます（並び替えの途中を補間するため）。idx=1 で連続。
   */
  const yOfIndex = (idx: number): number =>
    rowTop + (idx <= 1 ? idx * 34 : 34 + (idx - 1) * 35);
  let ry = rowTop;
  shown.forEach((r, i) => {
    /**
     * ★**行は瞬時に並び替えず、滑らかに動かします**（2026-08-21）。
     *
     *   順位表はエンジンの真の位置で毎コマ並び替えていました。直線では 1 秒あたり
     *   1〜2 回入れ替わるので、★**行が瞬間的に跳び**、上位 5 頭の枠に出入りするたびに
     *   表全体がガクッと動きます（オーナー評「このカメラワーク時に順番が急に変わる」）。
     *
     *   ⚠️ ★**順位そのものは変えません。** 変えると画面と結果が食い違います。
     *      変えるのは**行が移動する見た目の速さ**だけ。
     *      補間値は呼び出し側が**表示時刻から決定論的に**作って渡します（憲法 4）。
     */
    const animIdx = opts.animIndexOf?.(r.gate);
    if (animIdx !== undefined) ry = yOfIndex(animIdx);
    const rowRise = riseAt(opts.sinceSec ?? 1, i * 0.08);
    ctx.globalAlpha = baseAlpha * rise.alpha * rowRise.alpha;
    const rh = i === 0 ? 34 : 32;
    const rx = px + 10, rw = pw - 20;
    const yy = ry + rowRise.dy;
    if (i === 0) {
      ctx.fillStyle = 'rgba(240,204,74,.16)'; ctx.fillRect(rx, yy, rw, rh);
      ctx.fillStyle = HUD.gold; ctx.fillRect(rx + 8, yy + 5, 4, 24);
    } else if (r.isOwn) {
      ctx.fillStyle = HUD.gold; ctx.fillRect(rx, yy, 3, rh);
    }
    // 順位（1 位は 28px 金プレート、他は 22px 90%）
    ctx.textAlign = 'left';
    const rankX = rx + 8 + (i === 0 ? 14 : 0);
    if (i === 0) {
      ctx.font = font(28, true); ctx.fillStyle = goldPlate(ctx, rankX, 26, t);
      ctx.fillText('1', rankX, yy + rh / 2 + 10);
    } else {
      ctx.font = font(22, true); ctx.fillStyle = 'rgba(246,242,231,.9)';
      ctx.fillText(String(i + 1), rankX, yy + rh / 2 + 8);
    }
    // 枠色付き馬番 32×26
    const role = frameRoleOf(r.gate, fieldSize);
    const bx = rankX + 26 + 10;
    drawFrameBadge(ctx, pal, font, role, String(r.gate), bx, yy + (rh - 26) / 2, 32, 26, 17);
    // 馬名 15px
    ctx.fillStyle = HUD.paper; ctx.font = font(15, true);
    ctx.fillText(r.name ?? `${r.gate}番`, bx + 32 + 10, yy + rh / 2 + 5);
    // 右: 差（19px）／自馬は ★
    ctx.textAlign = 'right';
    const right = rx + rw - 8;
    if (r.timeSec !== undefined) {
      ctx.font = font(17, true); ctx.fillStyle = HUD.paper;
      ctx.fillText(formatRaceTime(r.timeSec), right, yy + rh / 2 + 6);
    } else if (i === 0) {
      ctx.font = font(18, true); ctx.fillStyle = HUD.gold;
      ctx.fillText(r.isOwn ? '★' : '', right, yy + rh / 2 + 6);
    } else {
      ctx.font = font(19, true); ctx.fillStyle = r.isOwn ? HUD.gold : HUD.paper;
      ctx.fillText(r.lengths.toFixed(1), right, yy + rh / 2 + 7);
    }
    ctx.textAlign = 'left';
    ry += rh + 3;
  });
  ctx.globalAlpha = baseAlpha;
}

/**
 * ★**実況帯**（本線 = screen-live: 帯 y574 h146・斜度 -9°・ナレーター立ち絵・ON AIR・文字送り・余力・残り距離）
 *   裁定 Q-P4-14 ①「実況は『位置』ではなく『変化』を言う」。
 *
 *   ⚠️ ★**同じことを繰り返し言わせないでください。** 呼ぶ側で「状態が変わったときだけ足す」ようにします。
 *   ⚠️ 行は常に 2 行（直前＋現在）。3 行に増やさない（帯が高くなって映像を潰す）。
 *   ★`opts` を省略すると静止画（動画の道具・監査用）。
 */
export interface CallBandOptions {
  readonly timeSec?: number | undefined;
  /** 各行の発話開始秒（`lines` と同じ添字）。文字送り 20 文字/秒 */
  readonly lineStartSec?: readonly number[] | undefined;
  readonly narratorName?: string | undefined;
  /** 余力ゲージ（エンジンの `staminaAt()` の値をそのまま。式は作らない・D-072） */
  readonly gauge?: { readonly left: number; readonly initial: number } | undefined;
  /** 残り距離（m）。省略で出さない */
  readonly metersLeft?: number | undefined;
  /** 表示開始からの秒（登場アニメ） */
  readonly sinceSec?: number | undefined;
}

export function drawCallBand<TImage>(
  ctx: Ctx2D<TImage>, pal: Palette, vp: Viewport2D, font: FontOf,
  lines: readonly (readonly CallPart[])[],
  narrator?: { readonly image: TImage; readonly width: number; readonly height: number },
  opts: CallBandOptions = {},
): void {
  const t = opts.timeSec ?? 0;
  const H = vp.height, W = vp.width;
  const rise = riseAt(opts.sinceSec ?? 1, 0, 0.5);
  const baseAlpha = ctx.globalAlpha;
  ctx.globalAlpha = baseAlpha * rise.alpha;
  const oy = rise.dy;
  // 帯: 宣言 left-40 top574 1371×146（斜度 -9°）。画面幅より左右計 114px 広く取り端を切らさない
  const bandY = H - 146 + oy;
  fillSlant(ctx, -40, bandY, W + 91, 146, HUD.glass);
  drawGoldEdge(ctx, 0, bandY, W, t);
  // スピードライン（1px・横流し 1.5s / 2.1s）— 任意
  for (const [ly, dur, delay, a] of [[30, 1.5, 0, 0.09], [104, 2.1, 0.4, 0.07]] as const) {
    const ph = (((t - delay) / dur) % 1 + 1) % 1;
    const alpha = ph < 0.3 ? (ph / 0.3) * 0.7 : ((1 - ph) / 0.7) * 0.7;
    ctx.globalAlpha = baseAlpha * rise.alpha * Math.min(1, a * Math.max(0, alpha) * 4);
    ctx.fillStyle = '#fff'; ctx.fillRect(0, bandY + ly, W, 1);
  }
  ctx.globalAlpha = baseAlpha * rise.alpha;
  // ナレーター立ち絵 x36 y548 150×172（帯上端より 26px 上）
  drawNarratorFrame(ctx, font, 36, H - 172 + oy, narrator, '実況', opts.narratorName ?? '実況アナ');
  // 文字送り
  const shown = lines.slice(-2);
  const starts = opts.lineStartSec?.slice(-2);
  const currentIdx = shown.length - 1;
  const current = shown[currentIdx];
  const currentText = current === undefined ? '' : current.map((p) => p.text).join('');
  const currentStart = starts?.[currentIdx];
  const shownChars = currentStart === undefined ? currentText.length : typedCount(currentText.length, t - currentStart);
  const speaking = current !== undefined && shownChars < currentText.length;
  // ON AIR x206 y594 h22 ＋ 音声レベル ＋「実況中」
  const afterLevel = drawOnAir(ctx, font, 206, H - 126 + oy, t, speaking);
  drawLabel(ctx, font, '実況中', afterLevel, H - 126 + oy + 15, HUD.paper70);
  // 直前の発言 x206 y627 19px/27（不透明 60%・上へ押し上げ）
  if (shown.length >= 2) {
    const prev = shown[0]!;
    const prevStart = starts?.[0];
    const sinceCur = currentStart === undefined ? 1 : t - currentStart;
    const push = Math.max(0, Math.min(1, sinceCur / 0.18));
    ctx.globalAlpha = baseAlpha * rise.alpha * 0.6 * push;
    ctx.font = font(19, true);
    let cx = 206;
    const prevText = prev.map((p) => p.text).join('');
    const prevChars = prevStart === undefined ? prevText.length : typedCount(prevText.length, t - prevStart);
    let consumed = 0;
    for (const part of prev) {
      const take = Math.max(0, Math.min(part.text.length, prevChars - consumed));
      consumed += part.text.length;
      if (take <= 0) continue;
      const seg = part.text.slice(0, take);
      ctx.fillStyle = part.role === undefined ? HUD.paper : (pal[part.role] ?? HUD.paper);
      ctx.fillText(seg, cx, H - 93 + oy + 20 + (1 - push) * 12);
      cx += ctx.measureText(seg).width;
    }
    ctx.globalAlpha = baseAlpha * rise.alpha;
  }
  // 現在の発言 x206 y658 28px/40（馬番は 34–36px・枠色）
  if (current !== undefined) {
    let cx = 206;
    let consumed = 0;
    for (const part of current) {
      const take = Math.max(0, Math.min(part.text.length, shownChars - consumed));
      consumed += part.text.length;
      if (take <= 0) continue;
      const seg = part.text.slice(0, take);
      const numbered = part.role !== undefined;
      ctx.font = font(numbered ? 34 : 28, true);
      ctx.fillStyle = numbered ? (pal[part.role ?? ''] ?? HUD.paper) : HUD.paper;
      ctx.fillText(seg, cx, H - 62 + oy + 30);
      cx += ctx.measureText(seg).width;
    }
  }
  // 余力ゲージ x950 y630: ラベル 12px／バー5本 幅12 間隔5 高36/30/24/18/12（点灯分は 1.0s 脈動）
  if (opts.gauge !== undefined) {
    const gx = W - 330, gy = H - 90 + oy;
    drawLabel(ctx, font, '余力', gx, gy + 12);
    const ratio = Math.max(0, Math.min(1, opts.gauge.left / Math.max(1e-6, opts.gauge.initial)));
    const lit = ratio <= 0 ? 0 : Math.max(1, Math.ceil(ratio * 5 - 1e-6));
    // ★色は「残量」ではなく「状態」で変える（C-6）: >50% 金 / >20% 黄 / 以下 赤
    const litColor = ratio > 0.5 ? HUD.gold : ratio > 0.2 ? HUD.warn : HUD.bad;
    const heights = [36, 30, 24, 18, 12];
    const bottom = gy + 12 + 8 + 36;
    heights.forEach((h, i) => {
      const x = gx + i * 17;
      if (i < lit) {
        const pulse = 1 - 0.13 * (1 - Math.cos(((t - i * 0.12) / 1.0) * Math.PI * 2));
        const hh = h * pulse;
        ctx.fillStyle = litColor; ctx.fillRect(x, bottom - hh, 12, hh);
      } else {
        ctx.fillStyle = i === 3 ? 'rgba(240,204,74,.28)' : 'rgba(240,204,74,.2)';
        ctx.fillRect(x, bottom - h, 12, h);
      }
    });
  }
  // 残り距離 x1116 y598 w108 右揃え／数字 76px 金プレート／METERS
  if (opts.metersLeft !== undefined) {
    const right = W - 56, top = H - 122 + oy;
    drawLabel(ctx, font, '残り', right, top + 12, HUD.paper70, 'right');
    ctx.textAlign = 'right';
    ctx.font = font(76, true);
    const text = String(Math.max(0, Math.round(opts.metersLeft)));
    const tw = ctx.measureText(text).width;
    ctx.fillStyle = goldPlate(ctx, right - tw, tw, t);
    ctx.fillText(text, right, top + 16 + 62);
    ctx.textAlign = 'left';
    drawLabel(ctx, font, 'METERS', right, top + 92 + 10, HUD.paper70, 'right');
  }
  ctx.globalAlpha = baseAlpha;
}

/**
 * ★区間タグ（本線 = screen-live: 宣言 left44 top120 h48・斜度 -9°・金バー 6px・番号 26px 金＋語 18px）
 *   「第3コーナー」→ 番号「3」＋「コーナー」。番号のない区間（向正面・最後の直線…）は語だけ
 */
export function drawCourseSectionTag(
  ctx: Ctx2D<never>, pal: Palette, font: FontOf, label: string,
  opts: { readonly timeSec?: number | undefined; readonly sinceSec?: number | undefined } = {},
): void {
  const m = /^第?(\d)コーナー$/.exec(label);
  const num = m?.[1];
  const word = m === null ? label : 'コーナー';
  const since = opts.sinceSec ?? 1;
  const tt = Math.max(0, Math.min(1, (since - 0.12) / 0.45));
  const e = 1 - Math.pow(1 - tt, 3);
  const baseAlpha = ctx.globalAlpha;
  ctx.globalAlpha = baseAlpha * e;
  const dx = -24 * (1 - e);
  ctx.font = font(26, true);
  const nw = num === undefined ? 0 : ctx.measureText(num).width + 10;
  ctx.font = font(18, true);
  const ww = ctx.measureText(word).width;
  const x = 44 + dx, y = 120, h = 48;
  const w = 6 + 16 + nw + ww + 20;
  fillSlant(ctx, x, y, w, h, 'rgba(7,10,8,.8)');
  strokeSlant(ctx, x, y, w, h, HUD.goldHair);
  fillSlant(ctx, x, y, 6, h, HUD.gold);
  let cx = x + 6 + 16;
  if (num !== undefined) {
    ctx.fillStyle = HUD.gold; ctx.font = font(26, true);
    ctx.fillText(num, cx, y + h / 2 + 10);
    cx += nw;
  }
  ctx.fillStyle = HUD.paper; ctx.font = font(18, true);
  ctx.fillText(word, cx, y + h / 2 + 7);
  ctx.globalAlpha = baseAlpha;
  void pal;
}

/**
 * ★レース見出しチップ（本線 = screen-live: left40 top34 h56・斜度 -9°・金バー 8px・「11R」26px 金プレート・レース名 22px・距離 14px）
 */
export function drawRaceHeadlineChip(
  ctx: Ctx2D<never>, font: FontOf,
  meta: { readonly raceNo: string; readonly raceName: string; readonly distanceLabel: string },
  opts: { readonly timeSec?: number | undefined; readonly sinceSec?: number | undefined } = {},
): void {
  const t = opts.timeSec ?? 0;
  const since = opts.sinceSec ?? 1;
  const tt = Math.max(0, Math.min(1, since / 0.45));
  const e = 1 - Math.pow(1 - tt, 3);
  const baseAlpha = ctx.globalAlpha;
  ctx.globalAlpha = baseAlpha * e;
  const x = 40 - 24 * (1 - e), y = 34, h = 56;
  ctx.font = font(26, true); const w1 = ctx.measureText(meta.raceNo).width;
  ctx.font = font(22, true); const w2 = ctx.measureText(meta.raceName).width;
  ctx.font = font(14, true); const w3 = ctx.measureText(meta.distanceLabel).width;
  const w = 8 + 18 + w1 + 16 + w2 + 16 + w3 + 24;
  fillSlant(ctx, x, y, w, h, HUD.glass);
  strokeSlant(ctx, x, y, w, h, HUD.goldHair);
  fillSlant(ctx, x, y, 8, h, goldPlate(ctx, x, 8, t));
  let cx = x + 8 + 18;
  ctx.font = font(26, true); ctx.fillStyle = goldPlate(ctx, cx, w1, t);
  ctx.fillText(meta.raceNo, cx, y + h / 2 + 10); cx += w1 + 16;
  ctx.font = font(22, true); ctx.fillStyle = HUD.paper;
  ctx.fillText(meta.raceName, cx, y + h / 2 + 8); cx += w2 + 16;
  ctx.font = font(14, true); ctx.fillStyle = 'rgba(246,242,231,.8)';
  ctx.fillText(meta.distanceLabel, cx, y + h / 2 + 5);
  ctx.globalAlpha = baseAlpha;
}

/**
 * ★勝馬テロップ（本線 = winner-lower-third: 帯 h180 斜度 -9°・金バー 6px・「1着」64px 金プレート＋馬番バッジ 42×34・
 *   馬名 56px 金プレート（0.6s ワイプ）・騎手 20px・TIME 78px 右）
 */
export function drawWinnerLowerThird(
  ctx: Ctx2D<never>, pal: Palette, vp: Viewport2D, font: FontOf,
  gate: number, horseName: string, jockeyName: string, timeSec?: number,
  opts: {
    readonly role?: string | undefined; readonly stableName?: string | undefined;
    readonly animSec?: number | undefined; readonly sinceSec?: number | undefined;
  } = {},
): void {
  const t = opts.animSec ?? 0;
  const since = opts.sinceSec ?? 1;
  const rise = riseAt(since, 0, 0.5);
  const baseAlpha = ctx.globalAlpha;
  ctx.globalAlpha = baseAlpha * rise.alpha;
  const H = vp.height, W = vp.width;
  const y = H - 180 + rise.dy;
  fillSlant(ctx, -30, y, W + 70, 180, 'rgba(4,7,5,.92)');
  drawGoldEdge(ctx, 0, y, W, t, 6);
  // 左ブロック（bottom 26）
  const bx = 70;
  drawLabel(ctx, font, 'WINNER', bx, H - 26 - 64 - 6 + rise.dy);
  ctx.font = font(64, true);
  const w1 = ctx.measureText('1').width;
  ctx.fillStyle = goldPlate(ctx, bx, w1, t);
  ctx.fillText('1', bx, H - 26 - 8 + rise.dy);
  ctx.font = font(22, true); ctx.fillStyle = HUD.gold;
  ctx.fillText('着', bx + w1 + 14, H - 26 - 22 + rise.dy);
  const role = opts.role ?? 'frame-1';
  drawFrameBadge(ctx, pal, font, role, String(gate), bx + w1 + 14 + 22 + 14, H - 26 - 32 - 17 + rise.dy, 42, 34, 22);
  // 馬名 56px 金プレート（左からワイプ）＋騎手
  const nx = bx + w1 + 14 + 22 + 14 + 42 + 34;
  ctx.font = font(56, true);
  const nw = ctx.measureText(horseName).width;
  const wipe = wipeAt(since, 0.05, 0.6);
  // ワイプは文字を左から出す（clip が無い環境でも成立するように、見せる文字数で近似）
  const shownChars = Math.max(0, Math.min(horseName.length, Math.round(horseName.length * wipe)));
  ctx.fillStyle = goldPlate(ctx, nx, nw, t);
  ctx.fillText(horseName.slice(0, shownChars), nx, H - 26 - 40 + rise.dy);
  ctx.font = font(20, true); ctx.fillStyle = 'rgba(246,242,231,.85)';
  ctx.fillText(`騎手　${jockeyName}${opts.stableName === undefined ? '' : `　／　厩舎　${opts.stableName}`}`, nx, H - 26 - 6 + rise.dy);
  // TIME 右
  if (timeSec !== undefined) {
    const right = W - 64;
    drawLabel(ctx, font, 'TIME', right, H - 34 - 78 + rise.dy, HUD.paper70, 'right');
    const whole = formatRaceTime(timeSec);
    const dot = whole.lastIndexOf('.');
    const main = whole.slice(0, dot), frac = whole.slice(dot);
    ctx.textAlign = 'right';
    ctx.font = font(44, true); const fw = ctx.measureText(frac).width;
    ctx.fillStyle = HUD.paper;
    ctx.fillText(frac, right, H - 34 + rise.dy);
    ctx.font = font(78, true);
    ctx.fillText(main, right - fw, H - 34 + rise.dy);
    ctx.textAlign = 'left';
  }
  ctx.globalAlpha = baseAlpha;
}

/**
 * ★レース後の**確定ボード**（本線 = payout-board の着順ブロック。板 x40 y56 1200×544・上縁 金 4px・
 *   見出し行 h48・1着行 h56・2〜5着 h48・6着以下は馬番バッジ列）。
 *   ⚠️ 払戻・自分の的中は投票データが画面に届いてから（このボードは着順のみ。右は 6着以下の明細で埋める）。
 *   `progress` 0→1 で板 0.45s ライズ→行が 0.08s ずつ。
 */
export interface ResultsBoardRow {
  readonly place: number;
  readonly gate: number;
  readonly horseName: string;
  readonly jockeyName: string;
  readonly timeSec?: number | undefined;
  readonly margin: string;
  readonly isOwn?: boolean | undefined;
}

export function drawResultsBoard(
  ctx: Ctx2D<never>, pal: Palette, vp: Viewport2D, font: FontOf,
  rows: readonly ResultsBoardRow[], fieldSize: number,
  frameRoleOf: (gate: number, fieldSize: number) => string,
  meta: {
    readonly raceName: string; readonly venue: string; readonly raceNo: string; readonly distanceLabel: string;
    readonly conditionLabel?: string | undefined; readonly winTimeSec?: number | undefined;
    readonly secondsToNext?: number | undefined;
  },
  progress: number,
  timeSec = 0,
): void {
  const t = Math.max(0, Math.min(1, progress));
  const W = vp.width, H = vp.height;
  const baseAlpha = ctx.globalAlpha;
  // 暗幕（勝馬の走り抜けを透かせる）
  ctx.globalAlpha = baseAlpha * Math.min(1, t * 6);
  ctx.fillStyle = 'rgba(2,5,3,.76)'; ctx.fillRect(0, 0, W, H);
  // タブ「確定」x56 y28 h32
  const since = t * 6;
  const tabRise = riseAt(since);
  ctx.globalAlpha = baseAlpha * tabRise.alpha;
  drawGoldChip(ctx, font, '確定', 56, 28 + tabRise.dy, 32, 16, 20, 16 * 0.14);
  // 板 x40 y56 1200×544
  const boardRise = riseAt(since, 0.05);
  ctx.globalAlpha = baseAlpha * boardRise.alpha;
  const bx = 40, by = 56 + boardRise.dy, bw = W - 80, bh = 544;
  ctx.fillStyle = HUD.board; ctx.fillRect(bx, by, bw, bh);
  ctx.strokeStyle = HUD.goldHair; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(bx + 0.5, by + 0.5); ctx.lineTo(bx + bw - 0.5, by + 0.5); ctx.lineTo(bx + bw - 0.5, by + bh - 0.5); ctx.lineTo(bx + 0.5, by + bh - 0.5); ctx.closePath(); ctx.stroke();
  drawGoldEdge(ctx, bx, by, bw, timeSec);
  // 下 2 隅の L 字
  ctx.fillStyle = HUD.goldDim;
  ctx.fillRect(bx + 8, by + bh - 10, 14, 2); ctx.fillRect(bx + 8, by + bh - 22, 2, 14);
  ctx.fillRect(bx + bw - 22, by + bh - 10, 14, 2); ctx.fillRect(bx + bw - 10, by + bh - 22, 2, 14);
  // 見出し行 h48
  ctx.textAlign = 'left';
  ctx.fillStyle = HUD.paper; ctx.font = font(22, true);
  ctx.fillText(meta.raceName, bx + 22, by + 4 + 32);
  const rnW = ctx.measureText(meta.raceName).width;
  ctx.font = font(14, true); ctx.fillStyle = 'rgba(246,242,231,.8)';
  ctx.fillText(`${meta.venue}　${meta.raceNo}　${meta.distanceLabel}`, bx + 22 + rnW + 14, by + 4 + 30);
  ctx.textAlign = 'right';
  let hx = bx + bw - 22;
  if (meta.winTimeSec !== undefined) {
    ctx.font = font(20, true); ctx.fillStyle = HUD.gold;
    const wt = formatRaceTime(meta.winTimeSec);
    const tw = ctx.measureText(wt).width;
    ctx.fillText(wt, hx, by + 4 + 31);
    hx -= tw + 6;
    ctx.font = font(14, true); ctx.fillStyle = HUD.paper;
    ctx.fillText('勝時計', hx, by + 4 + 30);
    hx -= ctx.measureText('勝時計').width + 18;
  }
  if (meta.conditionLabel !== undefined) {
    ctx.font = font(14, true); ctx.fillStyle = HUD.paper70;
    ctx.fillText(meta.conditionLabel, hx, by + 4 + 30);
  }
  ctx.textAlign = 'left';
  ctx.fillStyle = HUD.rule; ctx.fillRect(bx, by + 4 + 48, bw, 1);
  // 着順ブロック（左 w524）
  const lx = bx + 22, lw = 524 - 22 - 10;
  let ly = by + 4 + 48 + 12;
  drawLabel(ctx, font, '着順', lx + 12, ly + 16);
  drawLabel(ctx, font, 'タイム / 着差', lx + lw - 12, ly + 16, 'rgba(246,242,231,.38)', 'right');
  ly += 24;
  ctx.fillStyle = HUD.rule; ctx.fillRect(bx + 524, by + 4 + 49, 1, bh - 4 - 49);
  const top5 = rows.slice(0, 5);
  top5.forEach((row, i) => {
    const appear = riseAt(since, 0.05 + i * 0.08);
    ctx.globalAlpha = baseAlpha * boardRise.alpha * appear.alpha;
    const rh = i === 0 ? 56 : 48;
    const yy = ly + appear.dy;
    if (i === 0) {
      ctx.fillStyle = 'rgba(240,204,74,.12)'; ctx.fillRect(lx, yy, lw, rh);
      ctx.fillStyle = HUD.gold; ctx.fillRect(lx, yy, 2, rh);
      ctx.fillStyle = HUD.goldHair; ctx.fillRect(lx, yy + rh - 1, lw, 1);
    } else if (row.isOwn === true) {
      ctx.fillStyle = 'rgba(240,204,74,.12)'; ctx.fillRect(lx, yy, lw, rh);
      ctx.fillStyle = HUD.gold; ctx.fillRect(lx, yy, 2, rh);
    } else if (i % 2 === 1) {
      ctx.fillStyle = 'rgba(255,255,255,.03)'; ctx.fillRect(lx, yy, lw, rh);
    }
    let cx = lx + 12;
    ctx.textAlign = 'left';
    if (i === 0) {
      ctx.font = font(34, true); ctx.fillStyle = goldPlate(ctx, cx, 32, timeSec);
      ctx.fillText(String(row.place), cx, yy + rh / 2 + 12);
    } else {
      ctx.font = font(22, true); ctx.fillStyle = HUD.paper;
      ctx.fillText(String(row.place), cx, yy + rh / 2 + 8);
    }
    cx += 32 + 12;
    const role = frameRoleOf(row.gate, fieldSize);
    if (i === 0) drawFrameBadge(ctx, pal, font, role, String(row.gate), cx, yy + (rh - 28) / 2, 38, 28, 19);
    else drawFrameBadge(ctx, pal, font, role, String(row.gate), cx, yy + (rh - 26) / 2, 34, 26, 17);
    cx += (i === 0 ? 38 : 34) + 12;
    ctx.fillStyle = HUD.paper; ctx.font = font(i === 0 ? 22 : i < 3 ? 19 : 17, true);
    ctx.fillText(row.horseName, cx, yy + rh / 2 + (i === 0 ? 8 : 6));
    // 騎手 80（13px）／タイム 74 右／着差 66 右
    const rightEdge = lx + lw - 12;
    ctx.textAlign = 'right';
    ctx.font = font(15, true); ctx.fillStyle = HUD.paper70;
    ctx.fillText(i === 0 ? '—' : row.margin, rightEdge, yy + rh / 2 + 5);
    ctx.font = font(i === 0 ? 21 : 17, true); ctx.fillStyle = HUD.paper;
    ctx.fillText(row.timeSec === undefined ? '—' : formatRaceTime(row.timeSec), rightEdge - 66 - 12, yy + rh / 2 + 6);
    ctx.textAlign = 'left';
    ctx.font = font(13, true); ctx.fillStyle = HUD.paper70;
    ctx.fillText(row.jockeyName, rightEdge - 66 - 12 - 74 - 12 - 80, yy + rh / 2 + 5);
    ly += rh;
  });
  // 6着以下: h38・馬番バッジ 30×22 横並び
  const rest = rows.slice(5);
  if (rest.length > 0) {
    const appear = riseAt(since, 0.05 + 5 * 0.08);
    ctx.globalAlpha = baseAlpha * boardRise.alpha * appear.alpha;
    ly += 6;
    ctx.fillStyle = HUD.rule; ctx.fillRect(lx, ly, lw, 1);
    ctx.font = font(12, true); ctx.fillStyle = HUD.paper45;
    drawSpacedText(ctx, '6着以下', lx + 12, ly + 24, 1);
    let cx = lx + 12 + spacedWidth(ctx, '6着以下', 1) + 7;
    for (const row of rest) {
      drawFrameBadge(ctx, pal, font, frameRoleOf(row.gate, fieldSize), String(row.gate), cx, ly + 8, 30, 22, 14);
      cx += 37;
    }
    ly += 38;
  }
  // 右ブロック: 6着以下の明細（払戻はデータが来てから）
  const rx = bx + 524 + 18, rw = bw - 524 - 18 - 22;
  let ry = by + 4 + 48 + 12;
  drawLabel(ctx, font, '6着以下', rx + 14, ry + 16);
  ry += 22;
  ctx.fillStyle = HUD.rule; ctx.fillRect(rx, ry, rw, 1);
  rest.forEach((row, i) => {
    const appear = riseAt(since, 0.05 + 5 * 0.08 + i * 0.06);
    ctx.globalAlpha = baseAlpha * boardRise.alpha * appear.alpha;
    const rh = 44;
    const yy = ry + i * rh + appear.dy;
    if (i % 2 === 1) { ctx.fillStyle = 'rgba(255,255,255,.03)'; ctx.fillRect(rx, yy, rw, rh); }
    if (row.isOwn === true) { ctx.fillStyle = 'rgba(240,204,74,.12)'; ctx.fillRect(rx, yy, rw, rh); ctx.fillStyle = HUD.gold; ctx.fillRect(rx, yy, 2, rh); }
    ctx.fillStyle = HUD.rule; ctx.fillRect(rx, yy + rh, rw, 1);
    ctx.textAlign = 'left';
    ctx.font = font(18, true); ctx.fillStyle = HUD.paper;
    ctx.fillText(String(row.place), rx + 14, yy + rh / 2 + 6);
    drawFrameBadge(ctx, pal, font, frameRoleOf(row.gate, fieldSize), String(row.gate), rx + 14 + 30, yy + (rh - 22) / 2, 30, 22, 14);
    ctx.font = font(16, true); ctx.fillStyle = HUD.paper;
    ctx.fillText(row.horseName, rx + 14 + 30 + 30 + 12, yy + rh / 2 + 6);
    ctx.textAlign = 'right';
    ctx.font = font(15, true); ctx.fillStyle = HUD.paper70;
    ctx.fillText(row.margin, rx + rw - 14, yy + rh / 2 + 5);
    ctx.font = font(16, true); ctx.fillStyle = HUD.paper;
    ctx.fillText(row.timeSec === undefined ? '—' : formatRaceTime(row.timeSec), rx + rw - 14 - 66 - 12, yy + rh / 2 + 6);
    ctx.font = font(13, true); ctx.fillStyle = HUD.paper70;
    ctx.fillText(row.jockeyName, rx + rw - 14 - 66 - 12 - 74 - 12, yy + rh / 2 + 5);
    ctx.textAlign = 'left';
  });
  // 帯 y616 h104（斜度 -9°）＋「確定」チップ＋自動遷移
  ctx.globalAlpha = baseAlpha * boardRise.alpha;
  fillSlant(ctx, -40, H - 104, W + 91, 104, HUD.glass);
  drawGoldEdge(ctx, 0, H - 104, W, timeSec);
  const chipW = drawGoldChip(ctx, font, '確定', 36, H - 88, 26, 16, 14, 16 * 0.06);
  ctx.font = font(17, true); ctx.fillStyle = HUD.paper70;
  ctx.fillText('着順が確定しました', 36 + chipW + 14, H - 88 + 19);
  if (meta.secondsToNext !== undefined) {
    const right = W - 36;
    drawLabel(ctx, font, '自動で次へ', right, H - 94 + 12, HUD.paper70, 'right');
    const secs = Math.max(0, Math.ceil(meta.secondsToNext));
    const text = `0:${secs < 10 ? '0' : ''}${secs}`;
    ctx.textAlign = 'right'; ctx.font = font(56, true);
    const tw = ctx.measureText(text).width;
    const blink = secs <= 3 ? (Math.floor(timeSec * 2) % 2 === 0 ? 1 : 0.35) : 1;
    ctx.globalAlpha = baseAlpha * boardRise.alpha * blink;
    ctx.fillStyle = goldPlate(ctx, right - tw, tw, timeSec);
    ctx.fillText(text, right, H - 94 + 16 + 46);
    ctx.textAlign = 'left';
  }
  ctx.globalAlpha = baseAlpha;
}
