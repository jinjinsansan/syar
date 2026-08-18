import type { Ctx2D, FontOf, Palette, SheetSpec, Viewport2D } from './oblique-draw.js';

/**
 * ★導入の時間割（アーケード参考映像: 空撮フライオーバー → レース名タイトル → 発馬機正面 → 発走）
 *   0.0〜3.0  空撮フライオーバー（コースの上を飛ぶ）
 *   3.0〜5.6  タイトルカード
 *   5.6〜7.8  ゲート待機（正面の発馬機・扉閉）
 *   7.8〜     発走（開扉）
 */
export const RACE_INTRO_FLYOVER_SEC = 3.0;
export const RACE_INTRO_TITLE_END_SEC = 5.6;
export const RACE_INTRO_RACE_START_SEC = 7.8;
// 参考映像は開扉後およそ2秒で次の追走カメラへ渡る。長い横滑りを禁止する。
export const RACE_INTRO_END_SEC = 10.0;

export type RaceIntroStage = 'flyover' | 'title' | 'gate-hold' | 'gate-release' | 'race';

export interface RaceIntroState {
  readonly stage: RaceIntroStage;
  readonly raceDisplaySec: number;
  readonly releaseProgress: number;
}

export function raceIntroAt(displaySec: number): RaceIntroState {
  const d = Math.max(0, displaySec);
  const raceDisplaySec = Math.max(0, d - RACE_INTRO_RACE_START_SEC);
  if (d < RACE_INTRO_FLYOVER_SEC) return { stage: 'flyover', raceDisplaySec: 0, releaseProgress: 0 };
  if (d < RACE_INTRO_TITLE_END_SEC) return { stage: 'title', raceDisplaySec: 0, releaseProgress: 0 };
  if (d < RACE_INTRO_RACE_START_SEC) return { stage: 'gate-hold', raceDisplaySec: 0, releaseProgress: 0 };
  if (d < RACE_INTRO_END_SEC) return {
    stage: 'gate-release', raceDisplaySec,
    releaseProgress: Math.min(1, raceDisplaySec / (RACE_INTRO_END_SEC - RACE_INTRO_RACE_START_SEC)),
  };
  return { stage: 'race', raceDisplaySec, releaseProgress: 1 };
}

export interface RaceIntroMeta {
  readonly venue: string;
  readonly raceName: string;
  readonly raceNo: string;
  readonly distanceMeter: number;
  readonly surfaceLabel: string;
  readonly weatherLabel: string;
  readonly conditionLabel: string;
  readonly turnLabel: string;
}

export interface StartHorseVisual {
  readonly progress: number;
  readonly centerX: number;
  readonly groundY: number;
  readonly displayReferenceHeight: number;
  readonly frame: number;
}

/** 発走ショット専用。順位計算には触れず、反応差と画面上の奥行きだけを作る。 */
export function startHorseVisualAt(gate: number, releaseProgress: number, frames: number): StartHorseVisual {
  // 参考映像では全頭が約0.2秒以内に反応する。差を広げすぎて順番に湧かせない。
  const gateLag = ((gate * 7) % 11) * 0.008;
  const local = Math.max(0, Math.min(1, (releaseProgress - gateLag) / Math.max(0.01, 1 - gateLag)));
  // 最初の0.6秒で一馬身以上を抜ける発馬専用の強い初速。
  const acceleration = 1 - Math.pow(1 - local, 2.35);
  // 発馬直後は進路を扇形に広げず、参考映像同様3列の密集馬群を保つ。
  const lane = (gate * 7 + Math.floor((gate - 1) / 4)) % 3;
  const laneY = [452, 482, 512][lane] ?? 482;
  const stallDepth = (gate - 1) / 11;
  const heldCenterX = 238 + stallDepth * 205;
  const heldGroundY = 382 + stallDepth * 52;
  const heldHeight = 82 + stallDepth * 34;
  const speedFactor = 0.86 + ((gate * 13) % 9) * 0.035;
  const earlyBreak = (((gate * 17) % 7) - 3) * 15 * Math.sin(local * Math.PI);
  return {
    progress: local,
    centerX: heldCenterX + acceleration * (1040 - heldCenterX) * speedFactor + earlyBreak,
    groundY: heldGroundY + (laneY - heldGroundY) * acceleration,
    displayReferenceHeight: heldHeight
      + (([146, 160, 174][lane] ?? 160) - heldHeight) * acceleration,
    frame: local <= 0 ? Math.min(2, Math.max(0, frames - 1))
      : Math.max(0, Math.floor((local * frames * 2.3 + gate * 0.73) % Math.max(1, frames))),
  };
}

export function drawRaceTitleCard<TImage>(
  ctx: Ctx2D<TImage>, pal: Palette, vp: Viewport2D, font: FontOf,
  meta: RaceIntroMeta, displaySec: number,
  background?: { readonly image: TImage; readonly width: number; readonly height: number },
): void {
  // ★タイトルはフライオーバー後（RACE_INTRO_FLYOVER_SEC〜RACE_INTRO_TITLE_END_SEC）に出る。前後 0.35 秒でフェード
  const local = displaySec - RACE_INTRO_FLYOVER_SEC;
  const fade = Math.min(1, local / 0.35, (RACE_INTRO_TITLE_END_SEC - RACE_INTRO_FLYOVER_SEC - local) / 0.35);
  if (background !== undefined) {
    const sourceRatio = background.width / background.height;
    const targetRatio = vp.width / vp.height;
    const sw = sourceRatio > targetRatio ? background.height * targetRatio : background.width;
    const sh = sourceRatio > targetRatio ? background.height : background.width / targetRatio;
    const sx = (background.width - sw) * 0.5;
    const sy = (background.height - sh) * 0.5;
    ctx.drawImage(background.image, sx, sy, sw, sh, 0, 0, vp.width, vp.height);
    ctx.fillStyle = 'rgba(3,8,6,0.18)'; ctx.fillRect(0, 0, vp.width, vp.height);
    ctx.fillStyle = 'rgba(3,8,6,0.30)'; ctx.fillRect(0, 0, vp.width * 0.68, vp.height);
    ctx.fillStyle = 'rgba(3,8,6,0.20)'; ctx.fillRect(0, 0, vp.width * 0.46, vp.height);
    ctx.fillStyle = 'rgba(2,5,4,0.22)'; ctx.fillRect(0, 0, vp.width, 72);
    ctx.fillRect(0, vp.height - 54, vp.width, 54);
  } else {
    ctx.fillStyle = '#0b1210'; ctx.fillRect(0, 0, vp.width, vp.height);
  }
  ctx.globalAlpha = Math.max(0, fade);
  ctx.fillStyle = 'rgba(5,9,7,0.76)'; ctx.fillRect(76, 104, 720, 452);
  ctx.strokeStyle = 'rgba(235,225,187,0.46)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(76.5, 104.5); ctx.lineTo(795.5, 104.5);
  ctx.lineTo(795.5, 555.5); ctx.lineTo(76.5, 555.5); ctx.closePath(); ctx.stroke();
  ctx.fillStyle = pal['frame-5'] ?? '#e9c94d'; ctx.fillRect(76, 104, 9, 452);
  ctx.fillStyle = pal['paper-0'] ?? '#fff'; ctx.font = font(30, true);
  ctx.fillText(`${meta.venue}　${meta.raceNo}`, 126, 174);
  ctx.font = font(68, true); ctx.fillText(meta.raceName, 126, 282);
  ctx.fillStyle = pal['frame-5'] ?? '#e9c94d'; ctx.fillRect(126, 320, 590, 3);
  ctx.fillStyle = pal['paper-0'] ?? '#fff'; ctx.font = font(30, true);
  ctx.fillText(`${meta.surfaceLabel} ${meta.distanceMeter}m　${meta.turnLabel}`, 126, 388);
  ctx.font = font(26);
  ctx.fillText(`天候 ${meta.weatherLabel}　　馬場 ${meta.conditionLabel}`, 126, 448);
  ctx.fillStyle = 'rgba(255,255,255,0.68)'; ctx.font = font(17, true);
  ctx.fillText('GRADE I  •  TURF CHAMPIONSHIP', 128, 512);
  ctx.globalAlpha = 1;
}

/** ★ゲート待機〜発走の中継帯（画面下端に密着）。V2 の統合発走でも同じ帯を使う */
export function drawStartCallBand<TImage>(
  ctx: Ctx2D<TImage>, pal: Palette, vp: Viewport2D, font: FontOf,
  fieldSize: number, released: boolean,
  narrator?: { readonly image: TImage; readonly width: number; readonly height: number },
): void {
  // 参考映像のように画面下端へ密着した中継帯。独立カードには見せない。
  const bandY = vp.height - 104, bandH = 104;
  ctx.fillStyle = 'rgba(3,7,5,0.88)'; ctx.fillRect(0, bandY, vp.width, bandH);
  ctx.fillStyle = 'rgba(30,45,34,0.62)'; ctx.fillRect(0, bandY + 5, vp.width, bandH - 5);
  ctx.fillStyle = pal['frame-5'] ?? '#e9c94d'; ctx.fillRect(0, bandY, vp.width, 4);
  ctx.strokeStyle = 'rgba(236,232,211,0.52)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, bandY + 4.5); ctx.lineTo(vp.width, bandY + 4.5); ctx.stroke();
  if (narrator !== undefined) {
    const portraitSize = 136;
    ctx.drawImage(narrator.image, 0, 0, narrator.width, narrator.height,
      18, vp.height - portraitSize, portraitSize, portraitSize);
  }
  const textX = narrator === undefined ? 34 : 172;
  ctx.fillStyle = pal['frame-5'] ?? '#e9c94d'; ctx.font = font(15, true);
  ctx.fillText('実況', textX, bandY + 31);
  ctx.fillStyle = pal['paper-0'] ?? '#fff'; ctx.font = font(27, true);
  ctx.fillText(released ? 'スタートしました！' : `${fieldSize}頭、ゲートイン完了`, textX, bandY + 70);
}

export function drawStartingGate<TImage>(
  ctx: Ctx2D<TImage>, pal: Palette, vp: Viewport2D, font: FontOf,
  sheet: TImage | undefined, sheetWidth: number, spec: SheetSpec,
  fieldSize: number, releaseProgress: number,
  frameRoleOf: (gate: number, fieldSize: number) => string,
  background?: { readonly image: TImage; readonly width: number; readonly height: number },
  frameImages?: readonly {
    readonly image: TImage;
    readonly source: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
    readonly referenceHeight: number;
    readonly overlay?: {
      readonly image: TImage; readonly width: number; readonly height: number;
      readonly offsetXSourcePx: number; readonly offsetYSourcePx: number;
    } | undefined;
  }[],
  frameImagesByGate?: readonly (readonly {
    readonly image: TImage;
    readonly source: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
    readonly referenceHeight: number;
    readonly overlay?: {
      readonly image: TImage; readonly width: number; readonly height: number;
      readonly offsetXSourcePx: number; readonly offsetYSourcePx: number;
    } | undefined;
  }[])[],
  narrator?: { readonly image: TImage; readonly width: number; readonly height: number },
): void {
  if (background !== undefined) {
    const camera = Math.max(0, Math.min(1, releaseProgress));
    const bgW = vp.width + camera * 170;
    const bgH = vp.height + camera * 38;
    const bgX = -camera * 135;
    const bgY = -camera * 12;
    const gateExitX = bgX + bgW * 0.405;
    ctx.drawImage(background.image, 0, 0, background.width, background.height, bgX, bgY, bgW, bgH);
    const cw = sheetWidth / spec.frames;
    // 背景の発馬口から、遠・中・近の3帯を保ったまま右へ抜ける。
    const orderedGates = Array.from({ length: fieldSize }, (_, index) => index + 1)
      .sort((a, b) => ((a - 1) % 3) - ((b - 1) % 3) || b - a);
    // 待機から発走まで同じ12頭を描き、座標だけを連続して進める。
    for (const gate of orderedGates) {
      const role = frameRoleOf(gate, fieldSize);
      const row = Math.max(0, Math.min(7, Number(role.slice(6)) - 1));
      const visual = startHorseVisualAt(gate, releaseProgress, spec.frames);
      const { centerX, groundY, displayReferenceHeight, frame } = visual;
      const gateFrames = frameImagesByGate?.[gate - 1];
      const hi = gateFrames?.[frame % Math.max(1, gateFrames.length)]
        ?? frameImages?.[frame % Math.max(1, frameImages.length)];
      if (hi !== undefined) {
        const scale = displayReferenceHeight / hi.referenceHeight;
        const height = hi.source.height * scale; const width = hi.source.width * scale;
        const dx = centerX - width * 0.5; const dy = groundY - height;
        // 馬体に密着する接地影。奥の馬ほど細く薄くする。
        if (visual.progress > 0 && centerX > gateExitX + width * 0.24) {
          ctx.fillStyle = `rgba(3,8,4,${0.20 + displayReferenceHeight / 900})`;
          ctx.beginPath(); ctx.ellipse(centerX - width * 0.02, groundY - 4,
            width * 0.34, Math.max(5, height * 0.055), 0, 0, Math.PI * 2); ctx.fill();
        }
        // 後肢の着地周期にだけ小さな芝片を出し、横滑り感を消す。
        if (visual.progress > 0.08 && centerX > gateExitX && (frame + gate) % 3 === 0) {
          ctx.fillStyle = 'rgba(118,143,64,0.62)';
          for (let particle = 0; particle < 4; particle += 1) {
            const px = dx - 5 - particle * 7 - (gate % 3) * 3;
            const py = groundY - 5 - ((particle * 7 + gate) % 13);
            ctx.fillRect(px, py, 5 - particle * 0.6, 3);
          }
        }
        ctx.drawImage(hi.image, hi.source.x, hi.source.y, hi.source.width, hi.source.height,
          dx, dy, width, height);
        if (hi.overlay !== undefined) {
          const overlayX = dx + (hi.overlay.offsetXSourcePx - hi.source.x) * scale;
          const overlayY = dy + (hi.overlay.offsetYSourcePx - hi.source.y) * scale;
          ctx.drawImage(hi.overlay.image, 0, 0, hi.overlay.width, hi.overlay.height,
            overlayX, overlayY, hi.overlay.width * scale, hi.overlay.height * scale);
        }
      } else if (sheet !== undefined) {
        ctx.drawImage(sheet, frame * cw, row * spec.cellH, cw, spec.cellH,
          centerX - 76, groundY - 108, 152, 108);
      }
    }
    // 馬と同じ連続座標の上へ発馬機の前景フレームを再描画する。
    // 全面を矩形で覆わず、金属材だけを描くため、房内では隠れ、出口後は切れない。
    const sx = bgW / vp.width, sy = bgH / vp.height;
    const cageLeft = bgX + 142 * sx, cageRight = bgX + 486 * sx;
    const cageTopLeft = bgY + 253 * sy, cageTopRight = bgY + 233 * sy;
    const cageBottomLeft = bgY + 447 * sy, cageBottomRight = bgY + 424 * sy;
    ctx.strokeStyle = 'rgba(178,190,185,0.92)'; ctx.lineWidth = 3;
    for (let rail = 0; rail <= 12; rail += 1) {
      const u = rail / 12;
      const x = cageLeft + (cageRight - cageLeft) * u;
      const top = cageTopLeft + (cageTopRight - cageTopLeft) * u;
      const bottom = cageBottomLeft + (cageBottomRight - cageBottomLeft) * u;
      ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, bottom); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(111,128,121,0.88)'; ctx.lineWidth = 2;
    for (let cross = 1; cross < 4; cross += 1) {
      const u = cross / 4;
      ctx.beginPath();
      ctx.moveTo(cageLeft, cageTopLeft + (cageBottomLeft - cageTopLeft) * u);
      ctx.lineTo(cageRight, cageTopRight + (cageBottomRight - cageTopRight) * u);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(205,213,208,0.92)'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(cageLeft, cageTopLeft); ctx.lineTo(cageRight, cageTopRight); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cageLeft, cageBottomLeft); ctx.lineTo(cageRight, cageBottomRight); ctx.stroke();
    drawStartCallBand(ctx, pal, vp, font, fieldSize, releaseProgress > 0, narrator);
    return;
  }
  if (sheet === undefined) return;
  // 参考の発馬ショットと同じく、固定された横カメラで走路を真横から見る。
  ctx.fillStyle = '#081019'; ctx.fillRect(0, 0, vp.width, 248);
  ctx.fillStyle = '#101b20'; ctx.fillRect(0, 120, vp.width, 128);
  for (let i = 0; i < 24; i += 1) {
    ctx.fillStyle = i % 4 === 0 ? '#9c8b4b' : '#344249';
    ctx.fillRect(18 + i * 58, 173 + (i % 3) * 7, 20, 3);
  }
  ctx.fillStyle = '#172d20'; ctx.fillRect(0, 248, vp.width, 92);
  ctx.fillStyle = '#d7ddd8'; ctx.fillRect(0, 302, vp.width, 5);
  ctx.fillStyle = '#596760'; ctx.fillRect(0, 313, vp.width, 8);
  ctx.fillStyle = pal['turf-4'] ?? '#315b31'; ctx.fillRect(0, 340, vp.width, vp.height - 340);
  for (let y = 372; y < vp.height; y += 38) {
    ctx.fillStyle = y % 76 === 0 ? 'rgba(230,240,220,0.035)' : 'rgba(8,20,8,0.04)';
    ctx.fillRect(0, y, vp.width, 18);
  }
  ctx.fillStyle = '#e9ece8'; ctx.fillRect(132, 179, 8, 159);
  ctx.fillStyle = '#b73838'; ctx.fillRect(132, 213, 8, 23);
  ctx.fillStyle = '#e9ece8'; ctx.beginPath(); ctx.ellipse(136, 172, 27, 27, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#a52d30'; ctx.font = font(18, true); ctx.textAlign = 'center'; ctx.fillText('16', 136, 178);

  const gateLeft = 390, gateRight = 706, gateTop = 230, gateBottom = 510;
  ctx.fillStyle = 'rgba(0,0,0,0.40)'; ctx.beginPath();
  ctx.ellipse(565, gateBottom + 24, 230, 35, 0, 0, Math.PI * 2); ctx.fill();

  // 馬は発馬機の背後に描き、右端の開口から横方向へ飛び出させる。
  const cw = sheetWidth / spec.frames;
  for (let i = fieldSize - 1; i >= 0; i -= 1) {
    const gate = i + 1;
    const role = frameRoleOf(gate, fieldSize);
    const row = Math.max(0, Math.min(7, Number(role.slice(6)) - 1));
    const delay = (gate % 5) * 0.035;
    const run = Math.max(0, Math.min(1, (releaseProgress - delay) / Math.max(0.01, 1 - delay)));
    const x = 570 + run * (510 + (gate % 4) * 18);
    const y = 355 + (gate % 6) * 13 - Math.floor(gate / 6) * 5;
    const frame = Math.min(spec.frames - 1, Math.floor(run * spec.frames));
    ctx.drawImage(sheet, frame * cw, row * spec.cellH, cw, spec.cellH, x, y, 158, 112);
  }

  // 側面から見た発馬機。枠を列挙せず、長い筐体が奥へ伸びる形にする。
  ctx.fillStyle = 'rgba(25,34,39,0.92)'; ctx.beginPath();
  ctx.moveTo(gateLeft, gateTop + 35); ctx.lineTo(gateRight, gateTop);
  ctx.lineTo(gateRight, gateBottom - 18); ctx.lineTo(gateLeft, gateBottom); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#718086'; ctx.lineWidth = 7; ctx.beginPath();
  ctx.moveTo(gateLeft, gateTop + 35); ctx.lineTo(gateRight, gateTop); ctx.lineTo(gateRight, gateBottom - 18);
  ctx.lineTo(gateLeft, gateBottom); ctx.closePath(); ctx.stroke();
  ctx.strokeStyle = 'rgba(163,178,180,0.62)'; ctx.lineWidth = 2;
  for (let i = 0; i < 8; i += 1) {
    const u = i / 7; const x = gateLeft + (gateRight - gateLeft) * u;
    const top = gateTop + 35 * (1 - u); const bottom = gateBottom - 18 * u;
    ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, bottom); ctx.stroke();
  }
  for (let i = 1; i < 5; i += 1) {
    const u = i / 5; ctx.beginPath();
    ctx.moveTo(gateLeft, gateTop + 35 + (gateBottom - gateTop - 35) * u);
    ctx.lineTo(gateRight, gateTop + (gateBottom - gateTop - 18) * u); ctx.stroke();
  }
  ctx.beginPath(); ctx.moveTo(gateLeft + 8, gateTop + 45); ctx.lineTo(gateRight - 8, gateBottom - 25);
  ctx.moveTo(gateRight - 8, gateTop + 10); ctx.lineTo(gateLeft + 8, gateBottom - 10); ctx.stroke();

  // 上部の立体看板。
  ctx.fillStyle = '#344249'; ctx.beginPath();
  ctx.moveTo(438, 205); ctx.lineTo(684, 181); ctx.lineTo(708, 211); ctx.lineTo(458, 237); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#151f24'; ctx.beginPath();
  ctx.moveTo(466, 164); ctx.lineTo(650, 147); ctx.lineTo(680, 178); ctx.lineTo(491, 197); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#d7ddda'; ctx.font = font(17, true); ctx.textAlign = 'center';
  ctx.fillText('STAR RACING', 563, 184);

  // 右端の前扉だけが見える角度。開放時は上下へ逃がし、馬の進路を空ける。
  const door = (1 - releaseProgress) * 76;
  ctx.strokeStyle = '#b7c3c2'; ctx.lineWidth = 5; ctx.beginPath();
  ctx.moveTo(gateRight, gateTop + 12 - (76 - door)); ctx.lineTo(gateRight + door, gateTop + 88);
  ctx.moveTo(gateRight, gateBottom - 28 + (76 - door)); ctx.lineTo(gateRight + door, gateBottom - 105);
  ctx.stroke();
  ctx.fillStyle = '#111719'; ctx.fillRect(gateLeft - 8, gateBottom, gateRight - gateLeft + 28, 14);
  for (const wx of [gateLeft + 24, gateRight - 18]) {
    ctx.fillStyle = '#0c1012'; ctx.beginPath(); ctx.ellipse(wx, gateBottom + 17, 19, 19, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#69767a'; ctx.beginPath(); ctx.ellipse(wx, gateBottom + 17, 6, 6, 0, 0, Math.PI * 2); ctx.fill();
  }
  ctx.textAlign = 'left';
  if (releaseProgress <= 0) {
    ctx.fillStyle = 'rgba(10,12,11,0.82)'; ctx.fillRect(38, vp.height - 96, 390, 54);
    ctx.fillStyle = pal['paper-0'] ?? '#fff'; ctx.font = font(23, true);
    ctx.fillText(`${fieldSize}頭、ゲートイン完了`, 58, vp.height - 61);
  }
}
