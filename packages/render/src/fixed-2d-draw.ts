import type { Ctx2D, Viewport2D } from './oblique-draw.js';

export interface Fixed2DImage<TImage> {
  readonly image: TImage;
  readonly width: number;
  readonly height: number;
}

export interface Fixed2DHorseFrame<TImage> {
  readonly image: TImage;
  readonly source: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
  /** All animation frames use this common source-pixel height for scale. */
  readonly referenceHeight: number;
  /** Clearance above the turf baseline, measured on the original source canvas. */
  readonly groundLiftSourcePx: number;
  readonly overlay?: {
    readonly image: TImage;
    readonly width: number;
    readonly height: number;
    readonly offsetXSourcePx: number;
    readonly offsetYSourcePx: number;
  } | undefined;
}

export interface Fixed2DHorsePlacement<TImage> {
  readonly frame: Fixed2DHorseFrame<TImage>;
  readonly x: number;
  readonly groundY: number;
  readonly displayReferenceHeight: number;
  readonly alpha?: number;
}

export interface Fixed2DSceneMotion {
  /** Camera-follow travel in display pixels. Background bands derive parallax from it. */
  readonly travelPx: number;
  readonly mode?: 'side' | 'corner' | 'straight' | 'finish';
}

export type RaceCourseSection =
  | 'start' | 'first-corner' | 'second-corner' | 'backstretch'
  | 'third-corner' | 'fourth-corner' | 'straight' | 'finish' | 'winner';

export function raceCourseSectionAt(
  leaderMeters: number, distanceMeter: number, allFinished = false,
): RaceCourseSection {
  if (allFinished) return 'winner';
  const p = Math.max(0, Math.min(1, leaderMeters / Math.max(1, distanceMeter)));
  if (p < 0.12) return 'start';
  if (p < 0.22) return 'first-corner';
  if (p < 0.32) return 'second-corner';
  if (p < 0.55) return 'backstretch';
  if (p < 0.66) return 'third-corner';
  if (p < 0.76) return 'fourth-corner';
  if (p < 0.94) return 'straight';
  return 'finish';
}

export type Fixed2DBackgroundRole = 'backstretch' | 'corner-exit' | 'finish';

export interface Fixed2DPackHorse {
  readonly gate: number;
  readonly meters: number;
  readonly laneM: number;
}

export interface Fixed2DPackLayoutItem extends Fixed2DPackHorse {
  readonly band: 0 | 1 | 2;
  readonly x: number;
  readonly groundY: number;
  readonly displayReferenceHeight: number;
}

export interface Fixed2DPackLayoutOptions {
  readonly cameraMeters: number;
  readonly centerX: number;
  readonly pxPerMeter: number;
  readonly trackWidthM: number;
  readonly groundY: readonly [number, number, number];
  readonly displayReferenceHeight: readonly [number, number, number];
  readonly bandXOffsetPx?: readonly [number, number, number];
  readonly minVisibleGapPx: number;
}

/** Converts race-engine metres to the fixed side camera's horizontal pixels. */
export function fixedSideXOf(
  horseMeters: number, cameraMeters: number,
  pxPerMeter: number, centerX: number,
): number {
  return centerX + (horseMeters - cameraMeters) * pxPerMeter;
}

/** Selects a painted background without changing horse scale or direction. */
export function fixed2DBackgroundRoleOf(leaderMeters: number, distanceMeter: number): Fixed2DBackgroundRole {
  const progress = distanceMeter <= 0 ? 1 : leaderMeters / distanceMeter;
  if (progress >= 0.93) return 'finish';
  if (progress >= 0.72) return 'corner-exit';
  return 'backstretch';
}

/**
 * Separates a field into far/middle/near visual bands while retaining the
 * engine's order inside each band. Minimum spacing is a presentation rule only;
 * it never feeds back into race distance, order, or timing.
 */
export function fixed2DPackLayout(
  horses: readonly Fixed2DPackHorse[], options: Fixed2DPackLayoutOptions,
): readonly Fixed2DPackLayoutItem[] {
  const bands: Fixed2DPackHorse[][] = [[], [], []];
  for (const horse of horses) {
    const normalized = options.trackWidthM <= 0 ? 0.5 : horse.laneM / options.trackWidthM;
    const band = Math.max(0, Math.min(2, Math.round(normalized * 2))) as 0 | 1 | 2;
    bands[band]!.push(horse);
  }
  const result: Fixed2DPackLayoutItem[] = [];
  for (const band of [0, 1, 2] as const) {
    const ordered = bands[band]!.sort((a, b) => b.meters - a.meters || a.gate - b.gate);
    let previousX = Number.POSITIVE_INFINITY;
    for (const horse of ordered) {
      const raceX = fixedSideXOf(horse.meters, options.cameraMeters, options.pxPerMeter, options.centerX);
      const bandOffset = options.bandXOffsetPx?.[band] ?? 0;
      const x = Math.min(raceX + bandOffset, previousX - options.minVisibleGapPx);
      previousX = x;
      result.push({
        ...horse, band, x,
        groundY: options.groundY[band],
        displayReferenceHeight: options.displayReferenceHeight[band],
      });
    }
  }
  // Far horses first, near horses last: deterministic occlusion order.
  return result;
}

/**
 * High-quality fixed side camera compositor.
 *
 * It deliberately owns no perspective projection and never derives horse size
 * from world depth. The approved bitmap background is cover-cropped once; each
 * horse frame is then drawn at a shared reference scale and an explicit turf
 * baseline. This prevents the destructive 10x shrink and per-frame rescaling
 * that made the earlier renderer look like a different asset set.
 */
export function drawFixed2DSideScene<TImage>(
  ctx: Ctx2D<TImage>, vp: Viewport2D,
  background: Fixed2DImage<TImage>,
  horses: readonly Fixed2DHorsePlacement<TImage>[],
  motion?: Fixed2DSceneMotion,
): void {
  const coverScale = Math.max(vp.width / background.width, vp.height / background.height);
  const sourceW = vp.width / coverScale;
  const sourceH = vp.height / coverScale;
  const sourceX = (background.width - sourceW) * 0.5;
  const sourceY = (background.height - sourceH) * 0.5;
  if (motion === undefined) {
    ctx.drawImage(background.image, sourceX, sourceY, sourceW, sourceH, 0, 0, vp.width, vp.height);
  } else {
    // 一枚絵を遠景・中景・芝へ分割し、追走速度に応じて別々に流す。
    // 同じ画像を横に2枚並べるため、画面端に未描画領域を作らない。
    const drawBand = (destY: number, destH: number, factor: number): void => {
      const sy = sourceY + destY / coverScale;
      const sh = destH / coverScale;
      const tileW = background.width * coverScale;
      const centeredX = (vp.width - tileW) * 0.5;
      const offset = ((motion.travelPx * factor) % tileW + tileW) % tileW;
      const firstX = centeredX - offset;
      ctx.drawImage(background.image, 0, sy, background.width, sh,
        firstX, destY, tileW, destH);
      ctx.drawImage(background.image, 0, sy, background.width, sh,
        firstX + tileW, destY, tileW, destH);
    };
    drawBand(0, 265, 0.08);
    drawBand(265, 515 - 265, 0.28);
    drawBand(515, vp.height - 515, 0.68);

    // 最前景の芝筋は最も速く流れ、速度を目で読める基準になる。
    ctx.fillStyle = 'rgba(225,236,185,0.12)';
    const streakOffset = ((motion.travelPx * 1.15) % 96 + 96) % 96;
    for (let x = -streakOffset; x < vp.width + 96; x += 96) {
      ctx.fillRect(x, vp.height - 86, 42, 2);
      ctx.fillRect(x + 24, vp.height - 48, 26, 2);
    }
  }

  for (const horse of horses) {
    const { frame } = horse;
    const scale = horse.displayReferenceHeight / frame.referenceHeight;
    const width = frame.source.width * scale;
    const height = frame.source.height * scale;
    const lift = frame.groundLiftSourcePx * scale;
    ctx.fillStyle = `rgba(2,7,3,${motion?.mode === 'straight' ? '0.34' : '0.25'})`;
    ctx.beginPath();
    ctx.ellipse(horse.x, horse.groundY - 5, width * 0.32, Math.max(5, height * 0.045), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = horse.alpha ?? 1;
    ctx.drawImage(
      frame.image,
      frame.source.x, frame.source.y, frame.source.width, frame.source.height,
      horse.x - width * 0.5, horse.groundY - height - lift, width, height,
    );
    if (frame.overlay !== undefined) {
      const dx = horse.x - width * 0.5 + (frame.overlay.offsetXSourcePx - frame.source.x) * scale;
      const dy = horse.groundY - height - lift + (frame.overlay.offsetYSourcePx - frame.source.y) * scale;
      ctx.drawImage(
        frame.overlay.image, 0, 0, frame.overlay.width, frame.overlay.height,
        dx, dy, frame.overlay.width * scale, frame.overlay.height * scale,
      );
    }
    if (motion !== undefined && (Math.floor(motion.travelPx / 22 + horse.x) % 4 === 0)) {
      ctx.fillStyle = motion.mode === 'straight'
        ? 'rgba(177,191,103,0.68)' : 'rgba(146,166,82,0.45)';
      for (let bit = 0; bit < (motion.mode === 'straight' ? 5 : 3); bit += 1) {
        ctx.fillRect(horse.x - width * 0.42 - bit * 7, horse.groundY - 9 - (bit * 5) % 13, 5, 3);
      }
    }
  }
  ctx.globalAlpha = 1;
}
