/**
 * ★レース観戦 — **斜め俯瞰**（D-066・β）
 *
 * 【★守っていること】
 *   ・**着順はエンジンが決めたもの**（開始時に D-059 のゲートを通す）
 *   ・★横位置 `w` は**エンジンが引いたもの**（D-071）。**距離ロスは着順に効いています**
 *     （D-065 は 2026-08-16 にエンジンへ入りました＝`race.ts` の `laneCoef`）
 *   ・★**描き方はこの画面に持ちません** — `@star/render` の `drawObliqueWorld` が唯一の出どころで、
 *     **動画の道具と同じ関数**を呼びます（2か所で描いたら必ず離れます）
 *   ・色は 16進を持たず `palette.json` から役割名で引く
 *
 * 【⚠️ ★まだ入っていないもの】
 *   ・実況帯／ゲージ／順位表示（★動画の道具にはあります。この画面には**まだ移していません**）
 *   ・★ゲージを入れるときは**エンジンの `staminaAt()` を読むこと**（D-072）。
 *     **この画面で式を作らないでください** — 一度作って**符号が逆**になりました。
 *
 * 【★毛色と逆光は既定で切っています】
 *   どちらも元の素材の階調を殺すためです（オーナー判定）。上のチェックで入れられます。
 */
'use client';

import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DEFAULT_RACE_BALANCE, DEFAULT_INTERVENTION_BALANCE,
  resolveRace, paceOf, replayOf, finalOrderMatches,
  laneAt, laneAtStart, TRACK_WIDTH_M,
  aiProxyPlan, staminaTrackOf, staminaGaugeOf, staminaAt, boundaryTimesOf,
} from '@star/race-engine';
import { deriveRng } from '@star/sim-engine';
import type { Strategy } from '@star/sim-engine';
import type { Surface, TrackCondition } from '@star/race-engine';
import {
  replayPositionModel, finalOrderOf, withFinishRunOut, timeWarpFor, knotsFor, DEFAULT_PHASE_RATES,
  phaseOf, HORSE_LENGTH_M,
  // ★描き方は package が唯一の出どころ（この画面には持たない）
  frameRoleOf, SHEET_V2,
  raceShotAt,
  focusForRaceShot,
  drawFixed2DSideScene, fixed2DBackgroundRoleOf, fixed2DPackLayout,
  // ★UI も package が唯一の出どころ（動画の道具と同じ関数）
  drawGauge, drawStandings, drawCallBand, drawResultPanel,
  drawCourseSectionTag, drawWinnerLowerThird, raceCourseSectionAt,
  raceHudVisibilityAt, shouldEmitRaceCall, type CallPart,
  raceIntroAt, RACE_INTRO_RACE_START_SEC, RACE_INTRO_END_SEC,
  drawRaceTitleCard, drawStartingGate, drawStartCallBand,
  ovalCourse, resolveBroadcastV2Scene, drawBroadcastV2Scene, broadcastV2AnchorWeight, broadcastV2SectionLabel,
  broadcastV2FinishStyleOf, broadcastV2StartEase, FLASH_INTO, type BroadcastV2FinishStyle, type BroadcastV2ShotId,
  buildVisualScroll, type VisualScroll, type VisualScrollSample,
  type BroadcastV2FrameLibraries, type ParallaxPlate, type TexturedWorldAssets,
  drawCourseMinimap,
} from '@star/render';
import POOL from '../../lib/watch-pool.json';

const DIST = 1600;
const FIELD = 12;
const W = 1280;
const H = 720;
/**
 * ★描画分岐（引継ぎ書 2026-08-17 §1）
 *   既定は Broadcast V2。旧固定2Dは `?renderer=legacy` でのみ表示する（比較用）。
 *   ⚠️ 通常 URL を旧版のままにしてはいけない（ユーザーが見る画面が変わらない）。
 */
type RendererKind = 'v2' | 'legacy';
function rendererFromSearch(search: string): RendererKind {
  return new URLSearchParams(search).get('renderer') === 'legacy' ? 'legacy' : 'v2';
}
/**
 * ★一時バッジ（引継ぎ書 §1-4）— どの分岐が実ブラウザで描いたかを Canvas 上に証明する。
 *   ユーザー合格後に撤去する（§11-8）。
 */
function drawRendererBadge(ctx: CanvasRenderingContext2D, kind: RendererKind, stage: string): void {
  const label = kind === 'v2' ? 'BROADCAST V2 ACTIVE' : 'LEGACY RENDERER';
  ctx.save();
  ctx.font = 'bold 15px monospace';
  const text = `${label}  [${stage}]`;
  const w = ctx.measureText(text).width + 24;
  ctx.fillStyle = kind === 'v2' ? 'rgba(200,30,120,0.92)' : 'rgba(80,80,80,0.92)';
  ctx.fillRect(24, 76, w, 28);
  ctx.fillStyle = '#fff';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 36, 90);
  ctx.restore();
}
const STRATS: readonly Strategy[] = ['nige', 'senko', 'sashi', 'oikomi'];
const ASSET_VERSION = '47';
const HORSE_GROUND_LIFTS = [55, 90, 25, 0, 0, 0, 0, 55] as const;
/**
 * ★コーナー専用カット（3角後方・4角俯瞰）の長さ（m）。**0 = 使わない**。
 *   方向別 8 コマ（`diag-rear-v2` / `high-diag-v2`）は 271×724 の低解像度で真横 v6 と釣り合わず、
 *   ユーザー指摘③④「カーブで急におかしい」の主因。承認水準の素材ができるまでコーナーも望遠横追従で通す。
 */
const CORNER_CUT_M_WEB = 400;
/**
 * ★4 角を「奥からこちらへ向かってくる」固定カメラにするか（build 時のショット列挙にも使うので定数）。
 *   正面寄りの一体素材 diag-front-v3 が承認されたら true にする。
 */
const FOURTH_CORNER_FRONT_WEB = true;
/**
 * ★2026-08-18: テクスチャ付き透視ワールド（`world-textured.ts`）で背景が動くようになったので、
 *   コーナー専用ショット（3角後方・4角俯瞰）を**コーナー全区間**で復活（オーナー指示「元のカメラワークを復活、ただし背景は動く」）。
 *   方向別 8 コマは高解像度版へ順次差し替え。
 */
/**
 * ★空中局面の浮き（元画像 px・そのコマの「最下点の蹄が地面」を 0 とする）。
 *   支持局面（04〜07）は蹄が地面に接し（0）、離地〜空中（08・01・02）だけ体高の 3〜5% 浮く。03 は着地直前で僅か。
 *   ⚠️ 旧方式（全コマ平均の高さ＋bob）は支持局面で蹄が地面より上に来て「浮いて見える」原因だった。
 */
const HORSE_FLIGHT_LIFT_SOURCE_PX = [15, 20, 6, 0, 0, 0, 0, 22] as const;
/** 8 コマ表を任意のコマ数へ（16 コマなら中間は両隣の平均、1 コマなら 0） */
function flightLiftFor(index: number, count: number): number {
  if (count === 8) return HORSE_FLIGHT_LIFT_SOURCE_PX[index] ?? 0;
  if (count === 16) {
    const a = HORSE_FLIGHT_LIFT_SOURCE_PX[Math.floor(index / 2) % 8] ?? 0;
    if (index % 2 === 0) return a;
    const b = HORSE_FLIGHT_LIFT_SOURCE_PX[(Math.floor(index / 2) + 1) % 8] ?? 0;
    return (a + b) / 2;
  }
  return 0;
}
const SILKS_COLORS = ['#ececec', '#20242a', '#d52d35', '#2359c4', '#efd329', '#199655', '#ef7d20', '#e75c9a', '#713aa8', '#22a9b5', '#9b5b2e', '#d74d79'] as const;
const HORSE_NAMES = ['スターライト', 'サクラブリーズ', 'ハンシンドリーム', 'ミライノツバサ', 'グリーンアロー', 'オウカノキセキ', 'ナニワスピリット', 'ローズクイーン', 'ムラサキノホシ', 'アオバハヤテ', 'ブラウンエース', 'ピンクレディ'] as const;
const JOCKEY_NAMES = ['田中 守', '佐藤 翼', '山本 誠', '中村 駿', '高橋 蓮', '松本 拓海', '藤田 昇', '小林 亮', '伊藤 健', '吉田 直樹', '岡田 悠', '森川 浩'] as const;
/** ★固定2D中継の基準幅 */

/**
 * ⚠️ ★**カットごとの `horseW`（120px / 300px）は撤去しました。**
 *    透視投影では、馬の大きさは**深さから連続的に決まります**。
 *    固定の px を持つと、遠近と食い違って**手前と奥で同じ大きさ**になります。
 */

interface Built {
  readonly model: ReturnType<typeof replayPositionModel>;
  readonly warp: ReturnType<typeof timeWarpFor>;
  readonly pace: 'slow' | 'middle' | 'high';
  readonly result: readonly { place: number; gate: number; margin: string }[];
  /** ★自馬のゲージ（D-072）。**エンジンが出した状態**を読むだけ */
  readonly gauge: ReturnType<typeof staminaGaugeOf>;
  /** ★確定着順と走破タイム（ゴール後の順位表示に使う） */
  readonly finishPos: ReadonlyMap<number, number>;
  readonly finishSec: ReadonlyMap<number, number>;
  /**
   * ★見た目の速度の補正 Δ(d)（`visual-scroll.ts`）。背景の流れと脚の周期に使う。
   *   位置・時刻・着順には触れない（時間圧縮 D-062 はそのまま）。
   */
  readonly visualScroll: VisualScroll;
  /** ★ゴール前のカメラの型（接戦=引く／単独=寄る）。先頭が残り 80m に達した時点の着差から決定論的に決める */
  readonly finishStyle: BroadcastV2FinishStyle;
  /** ★ショット切替の時刻（表示秒）と前後の id。切替直後は前ショットとディゾルブする（ユーザー指摘⑥） */
  readonly shotChanges: readonly { readonly displaySec: number; readonly from: BroadcastV2ShotId; readonly to: BroadcastV2ShotId }[];
}

interface HighQualityHorseFrame {
  readonly image: CanvasImageSource;
  readonly source: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
  readonly referenceHeight: number;
  readonly groundLiftSourcePx: number;
  /** ★胴体の基準点と接地までの高さ（元画像 px）。配置を外接矩形に依存させない（perspective-draw 参照） */
  readonly bodyAnchorSourcePx?: { readonly x: number; readonly y: number };
  readonly bodyLiftSourcePx?: number;
  /** ★接地影用シルエット（source と同じ大きさ・黒＋α・軽くぼかし） */
  readonly shadow?: { readonly image: CanvasImageSource; readonly width: number; readonly height: number } | undefined;
  readonly overlay?: {
    readonly image: CanvasImageSource;
    readonly width: number;
    readonly height: number;
    readonly offsetXSourcePx: number;
    readonly offsetYSourcePx: number;
  } | undefined;
}

/** 勝負服・ゼッケンの位置（外接矩形に対する比率）。コマ集合ごとに騎手の姿勢が違うので切り替える */
interface SilksLayout {
  readonly cropX: number; readonly cropW: number; readonly cropH: number;
  readonly helmet: readonly [number, number, number];            // nx0, nx1, ny1
  readonly jacket: readonly [number, number, number, number];    // nx0, nx1, ny0, ny1
  readonly saddlecloth: readonly [number, number, number, number];
  readonly number: readonly [number, number];
}
/** 騎手が低く伏せる走行コマ（side-v6 など） */
const SILKS_LAYOUT_CROUCH: SilksLayout = {
  cropX: 0.24, cropW: 0.44, cropH: 0.60,
  helmet: [0.30, 0.72, 0.23], jacket: [0.31, 0.59, 0.08, 0.39], saddlecloth: [0.27, 0.59, 0.34, 0.58], number: [0.47, 0.49],
};
/** 騎手なしの馬（horse-only）: 鞍布の検出窓だけ広く取る（白い騎手のズボンが無いので誤検出しない） */
const SILKS_LAYOUT_HORSE_ONLY: SilksLayout = {
  cropX: 0.2, cropW: 0.6, cropH: 0.9,
  helmet: [0, 0, -1], jacket: [0, 0, 1, 0], saddlecloth: [0.25, 0.70, 0.10, 0.75], number: [0.47, 0.5],
};
/** 斜め後ろ（diag-rear-v3 合成）: 騎手は上中央、鞍布は騎手の脚の両脇に見える。ゼッケンは描かない（後ろ向き） */
const SILKS_LAYOUT_REAR: SilksLayout = {
  cropX: 0.1, cropW: 0.8, cropH: 0.6,
  helmet: [0.25, 0.75, 0.10], jacket: [0.15, 0.85, 0.06, 0.24], saddlecloth: [0.1, 0.9, 0.34, 0.5], number: [-1, -1],
};
/** 斜め前（diag-front-v3 一体）: 騎手は上中央、鞍布は騎手の脚の下に少し見える。ゼッケンは胸前に */
const SILKS_LAYOUT_FRONT: SilksLayout = {
  cropX: 0.1, cropW: 0.8, cropH: 0.6,
  helmet: [0.25, 0.75, 0.10], jacket: [0.15, 0.85, 0.06, 0.26], saddlecloth: [0.05, 0.95, 0.30, 0.48], number: [-1, -1],
};
/** 騎手が鐙に立って腕を挙げる勝馬コマ（winner-v2）: 矩形が縦に長く、馬体は下 6 割 */
const SILKS_LAYOUT_WINNER: SilksLayout = {
  cropX: 0.30, cropW: 0.52, cropH: 0.72,
  helmet: [0.52, 0.76, 0.17], jacket: [0.48, 0.72, 0.12, 0.40], saddlecloth: [0.36, 0.60, 0.48, 0.66], number: [0.47, 0.57],
};

function silksOverlays(
  image: FrameImage, source: HighQualityHorseFrame['source'], colors: readonly string[],
  layout: SilksLayout = SILKS_LAYOUT_CROUCH,
): readonly NonNullable<HighQualityHorseFrame['overlay']>[] {
  const x0 = Math.round(source.x + source.width * layout.cropX);
  const y0 = Math.round(source.y);
  const width = Math.round(source.width * layout.cropW);
  const height = Math.round(source.height * layout.cropH);
  const scratch = document.createElement('canvas'); scratch.width = imgW(image); scratch.height = imgH(image);
  const scratchCtx = scratch.getContext('2d', { willReadFrequently: true });
  if (scratchCtx === null) return [];
  scratchCtx.drawImage(image, 0, 0);
  const input = scratchCtx.getImageData(x0, y0, width, height).data;
  return colors.map((hex, colorIndex) => {
    const red = Number.parseInt(hex.slice(1, 3), 16);
    const green = Number.parseInt(hex.slice(3, 5), 16);
    const blue = Number.parseInt(hex.slice(5, 7), 16);
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d'); if (ctx === null) return { image: canvas, width, height, offsetXSourcePx: x0, offsetYSourcePx: y0 };
    const output = ctx.createImageData(width, height);
    for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const r = input[index] ?? 0; const g = input[index + 1] ?? 0; const b = input[index + 2] ?? 0; const a = input[index + 3] ?? 0;
      const nx = (x + x0 - source.x) / source.width;
      const ny = (y + y0 - source.y) / source.height;
      const helmet = nx >= layout.helmet[0] && nx <= layout.helmet[1] && ny <= layout.helmet[2];
      const jacket = nx >= layout.jacket[0] && nx <= layout.jacket[1] && ny >= layout.jacket[2] && ny <= layout.jacket[3];
      const saddlecloth = nx >= layout.saddlecloth[0] && nx <= layout.saddlecloth[1]
        && ny >= layout.saddlecloth[2] && ny <= layout.saddlecloth[3];
      if (!helmet && !jacket && !saddlecloth) continue;
      const spread = Math.max(r, g, b) - Math.min(r, g, b);
      if (a < 16 || spread > (helmet ? 62 : 34) || Math.max(r, g, b) < (helmet ? 42 : 72)) continue;
      const luminance = (r + g + b) / (3 * 255);
      const shade = 0.30 + luminance * 0.78;
      output.data[index] = Math.min(255, red * shade);
      output.data[index + 1] = Math.min(255, green * shade);
      output.data[index + 2] = Math.min(255, blue * shade);
      output.data[index + 3] = Math.round(a * 0.94);
    }
    ctx.putImageData(output, 0, 0);
    if (layout.number[0] < 0) { ctx.putImageData(output, 0, 0); return { image: canvas, width, height, offsetXSourcePx: x0, offsetYSourcePx: y0 }; }
    const numberX = source.x + source.width * layout.number[0] - x0;
    const numberY = source.y + source.height * layout.number[1] - y0;
    ctx.font = `bold ${Math.max(42, Math.round(source.height * 0.068))}px sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = Math.max(4, source.height * 0.006);
    ctx.strokeStyle = 'rgba(0,0,0,0.78)'; ctx.strokeText(String(colorIndex + 1), numberX, numberY);
    ctx.fillStyle = '#fff'; ctx.fillText(String(colorIndex + 1), numberX, numberY);
    return { image: canvas, width, height, offsetXSourcePx: x0, offsetYSourcePx: y0 };
  });
}

/**
 * ★鞍布（白い長方形・剛体）の中心と幅（元画像 px）。配置の基準点と縮尺の補正に使う。
 *   胴体重心（上 55% の α 重心）は騎手の姿勢で動くが、鞍布は馬体に固定されているので最も安定。
 *   検出: レイアウトの鞍布窓の中で、明るく彩度の低い画素の外接矩形。見つからなければ重心にフォールバック。
 */
type FrameImage = HTMLImageElement | HTMLCanvasElement;
const imgW = (image: FrameImage): number => (image instanceof HTMLCanvasElement ? image.width : image.naturalWidth);
const imgH = (image: FrameImage): number => (image instanceof HTMLCanvasElement ? image.height : image.naturalHeight);

function saddleReference(
  image: FrameImage, bounds: HighQualityHorseFrame['source'], layout: SilksLayout,
): { x: number; y: number; width: number } | undefined {
  const scratch = document.createElement('canvas');
  scratch.width = imgW(image); scratch.height = imgH(image);
  const ctx = scratch.getContext('2d', { willReadFrequently: true });
  if (ctx === null) return undefined;
  ctx.drawImage(image, 0, 0);
  const data = ctx.getImageData(0, 0, scratch.width, scratch.height).data;
  const [nx0, nx1, ny0, ny1] = layout.saddlecloth;
  const X0 = Math.floor(bounds.x + bounds.width * nx0), X1 = Math.ceil(bounds.x + bounds.width * nx1);
  const Y0 = Math.floor(bounds.y + bounds.height * ny0), Y1 = Math.ceil(bounds.y + bounds.height * ny1);
  let l = Infinity, t = Infinity, r = -1, b = -1, n = 0;
  for (let y = Y0; y < Y1; y += 1) for (let x = X0; x < X1; x += 1) {
    const k = (y * scratch.width + x) * 4;
    if (data[k + 3]! < 200) continue;
    const R = data[k]!, G = data[k + 1]!, B = data[k + 2]!;
    const mx = Math.max(R, G, B), mn = Math.min(R, G, B);
    if (mx > 170 && mx - mn < 28) { n += 1; if (x < l) l = x; if (x > r) r = x; if (y < t) t = y; if (y > b) b = y; }
  }
  if (n < 400 || r < l) return undefined;
  return { x: (l + r) / 2, y: (t + b) / 2, width: r - l + 1 };
}

/**
 * ★馬（騎手なし）と騎手（単体）を合成して 1 コマにする。
 *   騎手素材は「参照コマ（例: pose01）の騎手をそのままの位置・大きさで描いたもの」なので、
 *   参照コマの鞍布中心 → 対象コマの鞍布中心 の差だけ平行移動して重ねれば、鞍の上に乗る。
 *   馬体は 8 コマとも承認済みの走り、騎手は 2 姿勢だけ → 騎手のガクつき（ユーザー指摘④）が構造的に消える。
 */
/**
 * ★騎手のランドマーク: ヘルメット上端（矩形の最上行）と、ブーツ下端・中心（指定領域内の黒画素の最下部）。
 *   参照コマ（一体）では「鞍布中心より下・鞍布の x 範囲」の黒画素がブーツ（鞍・鬣・脚を避ける）。
 *   騎手単体では矩形の下半分の黒画素がブーツ。ブーツは剛体なので位置合わせの基準に使える。
 */
function jockeyLandmarks(
  image: FrameImage, region: { x0: number; x1: number; y0: number; y1: number }, top: number,
): { top: number; bootBottom: number; bootX: number } | undefined {
  const w = imgW(image), h = imgH(image);
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  if (ctx === null) return undefined;
  ctx.drawImage(image, 0, 0);
  const d = ctx.getImageData(0, 0, w, h).data;
  let bottom = -1;
  const rows: number[][] = [];
  for (let y = Math.max(0, Math.floor(region.y0)); y < Math.min(h, region.y1); y += 1) {
    for (let x = Math.max(0, Math.floor(region.x0)); x < Math.min(w, region.x1); x += 1) {
      const i = (y * w + x) * 4;
      if (d[i + 3]! < 200) continue;
      const lum = (d[i]! + d[i + 1]! + d[i + 2]!) / 3;
      if (lum > 52) continue;
      if (y > bottom) bottom = y;
      (rows[y] ??= []).push(x);
    }
  }
  if (bottom < 0) return undefined;
  // 最下 24 行の黒画素の x 平均 = ブーツの中心
  let sx = 0, n = 0;
  for (let y = bottom; y > bottom - 24 && y >= 0; y -= 1) for (const x of rows[y] ?? []) { sx += x; n += 1; }
  if (n === 0) return undefined;
  return { top, bootBottom: bottom, bootX: sx / n };
}

function composeHorseAndJockey(
  horse: HTMLImageElement, jockey: HTMLImageElement,
  gen: { top: number; bootBottom: number; bootX: number },
  ref: { top: number; bootBottom: number; bootX: number },
  horseSaddle: { x: number; y: number }, jockeyRefSaddle: { x: number; y: number },
): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = horse.naturalWidth; cv.height = horse.naturalHeight;
  const ctx = cv.getContext('2d');
  if (ctx === null) return cv;
  ctx.drawImage(horse, 0, 0);
  // ヘルメット上端→ブーツ下端の高さで縮尺、ブーツ下端中心を参照位置へ、さらに鞍布の差だけ平行移動
  const scale = (ref.bootBottom - ref.top) / Math.max(1, gen.bootBottom - gen.top);
  const dx = ref.bootX - gen.bootX * scale + (horseSaddle.x - jockeyRefSaddle.x);
  const dy = ref.bootBottom - gen.bootBottom * scale + (horseSaddle.y - jockeyRefSaddle.y);
  ctx.drawImage(jockey, dx, dy, jockey.naturalWidth * scale, jockey.naturalHeight * scale);
  return cv;
}

/**
 * ★胴体の重心（元画像 px）。外接矩形の上 55% にある不透明画素の α 重み付き重心（脚をほぼ除外）。
 *   鞍布が見つからないときのフォールバック。
 */
function bodyCentroid(image: FrameImage, bounds: HighQualityHorseFrame['source']): { x: number; y: number } {
  const scratch = document.createElement('canvas');
  scratch.width = imgW(image);
  scratch.height = imgH(image);
  const ctx = scratch.getContext('2d', { willReadFrequently: true });
  if (ctx === null) return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height * 0.4 };
  ctx.drawImage(image, 0, 0);
  const data = ctx.getImageData(0, 0, scratch.width, scratch.height).data;
  const cut = bounds.y + bounds.height * 0.55;
  let sx = 0, sy = 0, sw = 0;
  for (let y = bounds.y; y < cut; y += 1) {
    for (let x = bounds.x; x < bounds.x + bounds.width; x += 1) {
      const a = data[(y * scratch.width + x) * 4 + 3]!;
      if (a < 12) continue;
      sx += x * a; sy += y * a; sw += a;
    }
  }
  if (sw === 0) return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height * 0.4 };
  return { x: sx / sw, y: sy / sw };
}

/**
 * ★接地影用のシルエットを焼く: 元コマの不透明部分を黒（α はそのまま）にし、少しぼかす。
 *   描画側（perspective-draw）はこれを地面へ潰して落とすだけ。毎フレームの色変換をしない。
 */
function bakeShadowSilhouette(image: FrameImage, bounds: HighQualityHorseFrame['source']): HighQualityHorseFrame['shadow'] {
  const cv = document.createElement('canvas');
  cv.width = bounds.width; cv.height = bounds.height;
  const ctx = cv.getContext('2d');
  if (ctx === null) return undefined;
  ctx.filter = 'blur(3px)';
  ctx.drawImage(image, bounds.x, bounds.y, bounds.width, bounds.height, 0, 0, bounds.width, bounds.height);
  ctx.filter = 'none';
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = '#07110a';
  ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.globalCompositeOperation = 'source-over';
  return { image: cv, width: cv.width, height: cv.height };
}

function opaqueBounds(image: FrameImage): HighQualityHorseFrame['source'] {
  const scratch = document.createElement('canvas');
  scratch.width = imgW(image);
  scratch.height = imgH(image);
  const ctx = scratch.getContext('2d', { willReadFrequently: true });
  if (ctx === null) return { x: 0, y: 0, width: imgW(image), height: imgH(image) };
  ctx.drawImage(image, 0, 0);
  const data = ctx.getImageData(0, 0, scratch.width, scratch.height).data;
  let left = scratch.width, top = scratch.height, right = -1, bottom = -1;
  for (let y = 0; y < scratch.height; y += 1) {
    for (let x = 0; x < scratch.width; x += 1) {
      if (data[(y * scratch.width + x) * 4 + 3]! < 12) continue;
      left = Math.min(left, x); top = Math.min(top, y);
      right = Math.max(right, x); bottom = Math.max(bottom, y);
    }
  }
  if (right < left || bottom < top) return { x: 0, y: 0, width: scratch.width, height: scratch.height };
  const pad = 2;
  const x = Math.max(0, left - pad); const y = Math.max(0, top - pad);
  return {
    x, y,
    width: Math.min(scratch.width, right + pad + 1) - x,
    height: Math.min(scratch.height, bottom + pad + 1) - y,
  };
}

function build(seed: number, ownGate: number, surface: Surface, trackCondition: TrackCondition): Built {
  const start = (seed * 13) % Math.max(1, POOL.length - FIELD);
  const entrants = POOL.slice(start, start + FIELD).map((h, i) => ({
    horseId: String(i + 1), stats: h.stats, surfaceAptitude: h.surfaceAptitude,
    distanceCenter: h.distanceCenter, distanceRange: h.distanceRange,
    strategyAptitude: h.strategyAptitude, heavyAptitude: h.heavyAptitude,
    strategy: STRATS[(i + seed) % 4]!, condition: 3, fatigue: 20,
    weightKg: 55, gate: i + 1, age: 4, skillGenes: h.skillGenes,
  }));
  const conditions = {
    raceId: `r${seed}-${surface}-${trackCondition}`, distance: DIST, surface,
    trackCondition, courseShape: 'oval' as const, baseWeightKg: 55,
  };
  const result = resolveRace({ conditions, entrants, seed, balance: DEFAULT_RACE_BALANCE });
  const { pace } = paceOf(entrants, DEFAULT_RACE_BALANCE);
  const boundaries = replayOf(result, (g) => entrants[g - 1]!.strategy, pace);
  if (!finalOrderMatches(result, boundaries)) throw new Error('映像の着順が確定着順と違います（D-059）');
  const model = replayPositionModel({
    distanceMeter: DIST, spurtMetersLeft: 800, straightMetersLeft: 400, boundaries,
    // ★道中は脚質から生成する（Q-P4-38）。走破タイムからは作らない
    strategyOf: (g) => entrants[g - 1]!.strategy,
    // ★横位置はエンジンが引いたものを読むだけ（D-071）
    laneOf: (gate, metersLeft) => laneAt(gate, entrants.length, metersLeft, DIST, seed),
    pace,
    formationSeed: seed * 2654435761,
  });
  const settled = result.order.map((e) => Number(e.horseId));
  if (JSON.stringify(finalOrderOf(model)) !== JSON.stringify(settled)) {
    throw new Error('位置モデルの最終順が着順と違います（D-059）');
  }
  /**
   * ★**自馬のゲージ**（§12.6「自馬にのみ表示」・D-072）。
   *   ⚠️ ★**ここで式を作りません。** エンジンの `staminaGaugeOf` が出した状態を読むだけです。
   *      一度この層で近似を作って**符号が逆**になりました。
   *   ★乱数は注入します（憲法4）。`Math.random` は呼びません。
   */
  const own = entrants[ownGate - 1]!;
  const ownHorse = {
    iq: own.stats.iq, gt: own.stats.gt, st: own.stats.st,
    condition: own.condition, fatigue: own.fatigue,
  };
  const ownEntry = result.order.find((e) => Number(e.horseId) === ownGate)!;
  const gauge = staminaGaugeOf(
    staminaTrackOf(ownHorse, aiProxyPlan(ownHorse, deriveRng(seed, ownGate), DEFAULT_INTERVENTION_BALANCE), DIST, DEFAULT_INTERVENTION_BALANCE),
    boundaryTimesOf(ownEntry, DIST, ownGate, own.strategy, pace),
    DIST, own.strategy, pace,
  );
  const finishPos = new Map(result.order.map((e) => [Number(e.horseId), e.finishPosition]));
  const finishSec = new Map(result.order.map((e) => [Number(e.horseId), e.timeSec]));
  const warp = timeWarpFor(knotsFor(boundaries, ownGate), DEFAULT_PHASE_RATES);
  /**
   * ★見た目の速度テーブル。描画と同じ手順（時計 → 位置モデル → 走り抜け → V2 注視点）で
   *   0.05 秒ごとに注視点を求め、時間圧縮の倍率 rate と固定物体の重みから Δ を積分する。
   *   ★左右回りで注視点は変わらないので、ここは左回りの course で求める。
   */
  const winnerGate = settled[0]!;
  const course = ovalCourse(DIST, { widthM: TRACK_WIDTH_M, turn: 'left' });
  const STEP = 0.05;
  const totalSec = RACE_INTRO_RACE_START_SEC + warp.displaySec + 5.2;
  // ★ゴール前の展開: 先頭が残り 80m に達した瞬間の位置関係
  let finishStyle: BroadcastV2FinishStyle = 'solo';
  for (let sec = 0; sec <= warp.raceSecAt(warp.displaySec) + 1e-9; sec += 0.05) {
    const at = model.at(sec);
    const sortedM = at.map((h) => h.meters).sort((a, b) => b - a);
    if ((sortedM[0] ?? 0) >= DIST - 80) { finishStyle = broadcastV2FinishStyleOf(sortedM, HORSE_LENGTH_M); break; }
  }
  const samples: VisualScrollSample[] = [];
  const shotChanges: { displaySec: number; from: BroadcastV2ShotId; to: BroadcastV2ShotId }[] = [];
  let lastShot: BroadcastV2ShotId | undefined;
  for (let d = 0; d <= totalSec + 1e-9; d += STEP) {
    const raceD = Math.max(0, d - RACE_INTRO_RACE_START_SEC);
    const clampedD = Math.min(raceD, warp.displaySec);
    const sec = warp.raceSecAt(clampedD);
    const at = model.at(sec);
    const visual = withFinishRunOut(at, (g) => finishSec.get(g), sec, DIST, Math.max(0, raceD - warp.displaySec));
    const winnerDone = (at.find((h) => h.gate === winnerGate)?.meters ?? 0) >= DIST - 1e-6;
    const ease = broadcastV2StartEase(raceD);
    const scene = resolveBroadcastV2Scene(course, visual.map((h) => ({
      gate: h.gate, s: h.meters * ease, w: h.w ?? TRACK_WIDTH_M / 2, finished: h.meters >= DIST - 1e-6,
    })), { width: W, height: H }, winnerDone, {
      finishStyle, cornerCutM: CORNER_CUT_M_WEB, raceDisplaySec: d - RACE_INTRO_RACE_START_SEC,
      fourthCornerFront: FOURTH_CORNER_FRONT_WEB,
    });
    const h = 0.05;
    const lo = Math.max(0, clampedD - h);
    const hi = Math.min(warp.displaySec, clampedD + h);
    const rate = raceD >= warp.displaySec || hi <= lo ? 1
      : (warp.raceSecAt(hi) - warp.raceSecAt(lo)) / (hi - lo);
    samples.push({
      displaySec: d, focusS: scene.focusS, rate: rate > 0 ? rate : 1,
      anchorWeight: broadcastV2AnchorWeight(course, scene.shot.id, scene.focusS),
    });
    if (lastShot !== undefined && lastShot !== scene.shot.id) shotChanges.push({ displaySec: d, from: lastShot, to: scene.shot.id });
    lastShot = scene.shot.id;
  }
  return {
    model,
    warp,
    pace,
    result: result.order.map((e, i) => ({ place: i + 1, gate: Number(e.horseId), margin: e.marginLabel })),
    gauge, finishPos, finishSec,
    visualScroll: buildVisualScroll(samples),
    finishStyle,
    shotChanges,
  };
}

export default function RacePage(): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  /** ★実況の行（変化したときだけ積む） */
  const callRef = useRef<readonly (readonly CallPart[])[]>([]);
  const callKeyRef = useRef<string>('');
  const callLastSecRef = useRef<number>(-Infinity);
  const artRef = useRef<{
    pal: unknown;
    raceTitle: HTMLImageElement;
    raceNarrator: HTMLImageElement;
    startingGate: HTMLImageElement;
    raceBackstretch: HTMLImageElement;
    raceCornerExit: HTMLImageElement;
    raceFinish: HTMLImageElement;
    raceCornerRear: HTMLImageElement;
    raceCornerHigh: HTMLImageElement;
    sideHighQuality: readonly (readonly HighQualityHorseFrame[])[];
    diagFrontHighQuality: readonly (readonly HighQualityHorseFrame[])[];
    diagRearHighQuality: readonly (readonly HighQualityHorseFrame[])[];
    highDiagHighQuality: readonly (readonly HighQualityHorseFrame[])[];
    winnerHighQuality: readonly (readonly HighQualityHorseFrame[])[];
    /** ★勝馬の 8 コマ（未承認のうちは undefined → 走行 8 コマで代用） */
    winnerCycleHighQuality?: readonly (readonly HighQualityHorseFrame[])[];
    /** ★向正面ショット用のループ多層パララックス（`tools/split-parallax-layers.mjs` の出力） */
    parallaxBackstretch: ParallaxPlate<HTMLImageElement>;
    /** ★コーナー・斜めショット用のテクスチャ付き透視ワールド素材（芝タイル・遠景パノラマ） */
    texturedWorld: TexturedWorldAssets<HTMLImageElement>;
    /** ★承認水準（一体・高解像度）の方向別素材が揃っているか */
    directionalReady: { rear: boolean; front: boolean };
  } | null>(null);
  const rafRef = useRef<number | null>(null);
  /** ★ディゾルブ用のオフスクリーン（前ショットを描く） */
  const dissolveCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const t0Ref = useRef(0);
  const dRef = useRef(0);

  const [seed, setSeed] = useState(42);
  const [ownGate, setOwnGate] = useState(3);
  const [playing, setPlaying] = useState(false);
  const [ready, setReady] = useState(false);
  const [built, setBuilt] = useState<Built | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [clock, setClock] = useState(0);
  const [surface, setSurface] = useState<Surface>('turf');
  const [trackCondition, setTrackCondition] = useState<TrackCondition>('good');
  const [turn, setTurn] = useState<'left' | 'right'>('left');
  /** ★既定は V2。`?renderer=legacy` のときだけ旧固定2D（引継ぎ書 §1-5） */
  const [renderer, setRenderer] = useState<RendererKind>('v2');
  useEffect(() => { setRenderer(rendererFromSearch(window.location.search)); }, []);
  useEffect(() => {
    let cancelled = false;
    const boot = async (): Promise<void> => {
      const pal = await fetch(`/art/palette.json?v=${ASSET_VERSION}`).then((r) => r.json());
      /**
       * ★第3便のシート（8コマ × 枠色8行）を**カットごとに2枚**。
       *   ⚠️ 引きに寄りのシートを縮めて使うと **0.4倍**になり、輪郭が濁ります
       *      （契約 §5 で禁じている形）。★引き用は別に描き起こしたものです。
       */
      const loadImg = (src: string): Promise<HTMLImageElement> =>
        new Promise((res, rej) => {
          const im = new Image();
          im.onload = () => res(im);
          im.onerror = () => rej(new Error(`スプライトを読み込めません: ${src}`));
          im.src = src;
        });
      /**
       * ⚠️ ★引き用（120px）の読み込みは**やめました**。
       *    透視投影では大きさが連続的に変わるので、**段階に分けられません**。
       *    → 高解像度の1枚を**滑らかに縮小**します（D-058 の廃止が前提）。
       */
      /**
       * ★**後ろ姿のシート**（追走カメラの主役）。
       * ⚠️ 真横のシートを後ろから見るカメラで使うと、
       *    ★**馬だけ横を向いた別物**になります。
       */
      /**
       * ★向正面のパララックス層。1枚絵を送るだけでは 400m で 137px しか動かず「その場走り」に見えた
       *   （実測 12px/秒・必要量の約 1/100）。層ごとにループさせ、馬群の進行距離で流す。
       */
      const parallaxManifest = await fetch(`/art/parallax/backstretch-side-v1/manifest.json?v=${ASSET_VERSION}`)
        .then((r) => r.json()) as {
          plateWidth: number; plateHeight: number;
          layers: { name: string; file: string; plateY0: number; plateY1: number; tileWidth: number; depthOffsetM: number }[];
          objects: {
            name: string; file: string; plateY0: number; anchorXRatio: number; worldS: number | 'finish'; depthOffsetM: number;
            zOrder?: 'behind' | 'front'; worldW?: number; anchorYRatio?: number; scale?: number;
          }[];
          world: {
            turf: { file: string; tileWidth: number; tileHeight: number; pxPerM: number };
            panorama: { file: string; tileWidth: number; height: number; horizonY: number };
            trees?: { file: string; tileWidth: number; height: number };
          };
        };
      const parallaxImages = await Promise.all(parallaxManifest.layers.map((layer) =>
        loadImg(`/art/parallax/backstretch-side-v1/${layer.file}?v=${ASSET_VERSION}`)));
      const objectImages = await Promise.all(parallaxManifest.objects.map((object) =>
        loadImg(`/art/parallax/backstretch-side-v1/${object.file}?v=${ASSET_VERSION}`)));
      const [worldTurfImg, worldPanoImg, worldTreesImg] = await Promise.all([
        loadImg(`/art/parallax/backstretch-side-v1/${parallaxManifest.world.turf.file}?v=${ASSET_VERSION}`),
        loadImg(`/art/parallax/backstretch-side-v1/${parallaxManifest.world.panorama.file}?v=${ASSET_VERSION}`),
        parallaxManifest.world.trees !== undefined
          ? loadImg(`/art/parallax/backstretch-side-v1/${parallaxManifest.world.trees.file}?v=${ASSET_VERSION}`).catch(() => null)
          : Promise.resolve(null),
      ]);
      // ★コース沿いの立体帯: 横追従用の層タイル（生垣・樹林・スタンド）をそのままテクスチャに使う
      const layerTexture = (name: string, pxPerM: number) => {
        const index = parallaxManifest.layers.findIndex((layer) => layer.name === name);
        const image = index >= 0 ? parallaxImages[index] : undefined;
        return image === undefined ? undefined : { image, width: image.naturalWidth, height: image.naturalHeight, pxPerM };
      };
      const hedgeTex = layerTexture('hedge', 60);
      const treesTex = worldTreesImg !== null
        ? { image: worldTreesImg, width: worldTreesImg.naturalWidth, height: worldTreesImg.naturalHeight, pxPerM: 20 }
        : layerTexture('trees', 20);
      const standTex = layerTexture('stand', 12);
      const texturedWorld: TexturedWorldAssets<HTMLImageElement> = {
        turf: { image: worldTurfImg, width: worldTurfImg.naturalWidth, height: worldTurfImg.naturalHeight, pxPerM: parallaxManifest.world.turf.pxPerM },
        panorama: { image: worldPanoImg, width: worldPanoImg.naturalWidth, height: worldPanoImg.naturalHeight, horizonY: parallaxManifest.world.panorama.horizonY },
        scenery: {
          ...(hedgeTex !== undefined ? { hedge: hedgeTex } : {}),
          ...(treesTex !== undefined ? { trees: treesTex } : {}),
          ...(standTex !== undefined ? { stand: standTex } : {}),
        },
      };
      const parallaxBackstretch: ParallaxPlate<HTMLImageElement> = {
        plateWidth: parallaxManifest.plateWidth,
        plateHeight: parallaxManifest.plateHeight,
        layers: parallaxManifest.layers.map((layer, index) => ({
          image: parallaxImages[index]!,
          width: parallaxImages[index]!.naturalWidth,
          height: parallaxImages[index]!.naturalHeight,
          plateY0: layer.plateY0,
          plateY1: layer.plateY1,
          depthOffsetM: layer.depthOffsetM,
        })),
        // ★決勝線・審判塔は世界に固定（worldS='finish' → 距離）
        objects: parallaxManifest.objects.map((object, index) => ({
          image: objectImages[index]!,
          width: objectImages[index]!.naturalWidth,
          height: objectImages[index]!.naturalHeight,
          plateY0: object.plateY0,
          anchorXRatio: object.anchorXRatio,
          worldS: object.worldS === 'finish' ? DIST : object.worldS,
          depthOffsetM: object.depthOffsetM,
          ...(object.zOrder !== undefined ? { zOrder: object.zOrder } : {}),
          ...(object.worldW !== undefined ? { worldW: object.worldW } : {}),
          ...(object.anchorYRatio !== undefined ? { anchorYRatio: object.anchorYRatio } : {}),
          ...(object.scale !== undefined ? { scale: object.scale } : {}),
        })),
      };
      const loaded = await Promise.all([
        loadImg(`/art/race-title-hanshin-spring-v1.png?v=${ASSET_VERSION}`),
        loadImg(`/art/race-narrator-v1.png?v=${ASSET_VERSION}`),
        loadImg(`/art/starting-gate-side-v1.png?v=${ASSET_VERSION}`),
        loadImg(`/art/race-backstretch-side-v1.png?v=${ASSET_VERSION}`),
        loadImg(`/art/race-corner-exit-side-v1.png?v=${ASSET_VERSION}`),
        loadImg(`/art/race-finish-side-v2.png?v=${ASSET_VERSION}`),
        loadImg(`/art/race-corner-rear-v2.png?v=${ASSET_VERSION}`),
        loadImg(`/art/race-corner-high-v2.png?v=${ASSET_VERSION}`),
        ...Array.from({ length: 8 }, (_, i) =>
          loadImg(`/art/horse-jockey-side-v6-pose${String(i + 1).padStart(2, '0')}.png?v=${ASSET_VERSION}`)),
        ...Array.from({ length: 8 }, (_, i) =>
          loadImg(`/art/horse-jockey-diag-front-v2-pose${String(i + 1).padStart(2, '0')}.png?v=${ASSET_VERSION}`)),
        ...Array.from({ length: 8 }, (_, i) =>
          loadImg(`/art/horse-jockey-diag-rear-v2-pose${String(i + 1).padStart(2, '0')}.png?v=${ASSET_VERSION}`)),
        ...Array.from({ length: 8 }, (_, i) =>
          loadImg(`/art/horse-jockey-high-diag-v2-pose${String(i + 1).padStart(2, '0')}.png?v=${ASSET_VERSION}`)),
        loadImg(`/art/horse-jockey-winner-v1.png?v=${ASSET_VERSION}`),
      ]);
      if (cancelled) return;
      const [raceTitle, raceNarrator, startingGate, raceBackstretch, raceCornerExit, raceFinish,
        raceCornerRear, raceCornerHigh] = loaded;
      const buildFrames = (
        images: readonly FrameImage[],
        referenceHeightOverride?: number,
        silksLayout: SilksLayout = SILKS_LAYOUT_CROUCH,
        anchorsOverride?: readonly { x: number; y: number; width: number }[],
      ): readonly (readonly HighQualityHorseFrame[])[] => {
        const measured = images.map((image) => ({ image, source: opaqueBounds(image) }));
        const referenceHeight = referenceHeightOverride ?? Math.max(...measured.map((frame) => frame.source.height));
        const overlays = images.map((image, index) => silksOverlays(image, measured[index]!.source, SILKS_COLORS, silksLayout));
        /**
         * ★配置と縮尺の基準は鞍布（剛体）。
         *   - 基準点 = 鞍布中心（無ければ胴体重心）
         *   - 縮尺 = 鞍布幅の中央値との比で各コマを補正（±8% で頭打ち。騎手の脚で一部隠れるぶんの誤検出を抑える）
         *   - 接地高さ = そのコマの最下点（蹄）を地面に置き、空中局面だけ `HORSE_FLIGHT_LIFT_SOURCE_PX` 浮かせる
         */
        const refs = anchorsOverride ?? measured.map((frame) => saddleReference(frame.image, frame.source, silksLayout));
        const anchors = measured.map((frame, index) => refs[index] ?? bodyCentroid(frame.image, frame.source));
        const widths = refs.flatMap((ref) => (ref === undefined ? [] : [ref.width]));
        const medianWidth = widths.length === 0 ? 0 : [...widths].sort((a, b) => a - b)[Math.floor(widths.length / 2)]!;
        const scaleFix = (index: number): number => {
          const ref = refs[index];
          if (ref === undefined || medianWidth <= 0) return 1;
          return Math.max(0.92, Math.min(1.08, ref.width / medianWidth));
        };
        const shadows = measured.map((frame) => bakeShadowSilhouette(frame.image, frame.source));
        return SILKS_COLORS.map((_, gateIndex) => measured.map((frame, frameIndex) => ({
          ...frame,
          referenceHeight: referenceHeight * scaleFix(frameIndex),
          groundLiftSourcePx: HORSE_GROUND_LIFTS[frameIndex] ?? 0,
          shadow: shadows[frameIndex],
          bodyAnchorSourcePx: anchors[frameIndex]!,
          bodyLiftSourcePx: (frame.source.y + frame.source.height - anchors[frameIndex]!.y)
            + flightLiftFor(frameIndex, images.length),
          overlay: overlays[frameIndex]?.[gateIndex],
        })));
      };
      /**
       * ★勝馬の 8 コマ（騎手が立ってガッツポーズ・Codex 生成）。8 枚すべて揃ったときだけ使う。
       *   揃わない間は走行 8 コマで代用（`winnerCycleHighQuality` を undefined のまま）。
       */
      /**
       * ★走行 16 コマ: side-v6 の 8 姿勢の間に Codex 生成の中間姿勢 mid01..08 を挟む（01, mid01, 02, mid02, …）。
       *   8 枚揃わなければ 8 コマのまま。
       */
      const midImages = await Promise.all(Array.from({ length: 8 }, (_, i) =>
        loadImg(`/art/horse-jockey-side-v6-mid${String(i + 1).padStart(2, '0')}.png?v=${ASSET_VERSION}`).catch(() => null)));
      const midsReady = midImages.every((image): image is HTMLImageElement => image !== null);
      const winnerCycleImages = await Promise.all(Array.from({ length: 8 }, (_, i) =>
        loadImg(`/art/horse-jockey-winner-v2-pose${String(i + 1).padStart(2, '0')}.png?v=${ASSET_VERSION}`).catch(() => null)));
      const winnerCycleReady = winnerCycleImages.every((image): image is HTMLImageElement => image !== null);
      /**
       * ★馬・騎手分離素材（Codex 生成）: 騎手なしの馬 8 コマ ＋ 騎手 2 姿勢（前傾 a/b・ガッツポーズ a/b）。
       *   全部揃ったときだけ合成コマを使い、揃わなければ従来の一体コマ。
       */
      const horseOnlyImages = await Promise.all(Array.from({ length: 8 }, (_, i) =>
        loadImg(`/art/horse-only-side-v6-pose${String(i + 1).padStart(2, '0')}.png?v=${ASSET_VERSION}`).catch(() => null)));
      const jockeyImages = await Promise.all(['jockey-crouch-a', 'jockey-crouch-b', 'jockey-celebrate-a', 'jockey-celebrate-b']
        .map((name) => loadImg(`/art/${name}.png?v=${ASSET_VERSION}`).catch(() => null)));
      /**
       * ★2026-08-18 オーナー判定: 馬・騎手の分離合成は「馬の形・大きさがアンバランス」「勝馬の騎手が破綻」で不採用。
       *   合格していた一体素材（side-v6 8 コマ・winner-v2 8 コマ）へ戻す。素材は残すが使わない。
       */
      const USE_SEPARATED_COMPOSITE = false;
      const separatedReady = USE_SEPARATED_COMPOSITE
        && horseOnlyImages.every((image): image is HTMLImageElement => image !== null)
        && jockeyImages.every((image): image is HTMLImageElement => image !== null);
      const composeCycle = (
        jockeys: readonly [HTMLImageElement, HTMLImageElement],
        refFrames: readonly [HTMLImageElement, HTMLImageElement],   // 騎手 a/b の元になった一体コマ
        refPoses: readonly [number, number],                          // その馬姿勢（1〜8）
        refLayout: SilksLayout,                                        // 参照コマの鞍布検出レイアウト
      ): FrameImage[] | undefined => {
        if (!separatedReady) return undefined;
        const horses = horseOnlyImages as HTMLImageElement[];
        const saddles = horses.map((image) => saddleReference(image, opaqueBounds(image), SILKS_LAYOUT_HORSE_ONLY));
        if (saddles.some((saddle) => saddle === undefined)) return undefined;
        // 参照コマ: 鞍布（一体コマ用レイアウトで検出）の中心より下・x 範囲内の黒画素＝ブーツ
        const refMarks = [0, 1].map((k) => {
          const refImage = refFrames[k]!;
          const b = opaqueBounds(refImage);
          const cloth = saddleReference(refImage, b, refLayout);
          if (cloth === undefined) return undefined;
          return jockeyLandmarks(refImage, { x0: cloth.x - cloth.width * 0.55, x1: cloth.x + cloth.width * 0.55, y0: cloth.y, y1: cloth.y + cloth.width * 0.7 }, b.y);
        });
        const genMarks = jockeys.map((jockey) => {
          const b = opaqueBounds(jockey);
          return jockeyLandmarks(jockey, { x0: b.x, x1: b.x + b.width, y0: b.y + b.height * 0.5, y1: b.y + b.height }, b.y);
        });
        if (refMarks.some((m) => m === undefined) || genMarks.some((m) => m === undefined)) return undefined;
        return horses.map((horse, index) => {
          const k = index >= 4 ? 1 : 0;
          return composeHorseAndJockey(horse, jockeys[k]!, genMarks[k]!, refMarks[k]!, saddles[index]!, saddles[refPoses[k]! - 1]!);
        });
      };
      /**
       * ★斜め後ろ（v3・高解像度）: 騎手なし 8 コマ ＋ 後方視点の前傾騎手 1 枚。騎手は pose04 の座標で描かれているので、
       *   各コマの鞍布中心の差だけ移動して合成。揃わなければ従来の低解像度 diag-rear-v2。
       */
      const rearHorseImages = await Promise.all(Array.from({ length: 8 }, (_, i) =>
        loadImg(`/art/horse-only-diag-rear-v3-pose${String(i + 1).padStart(2, '0')}.png?v=${ASSET_VERSION}`).catch(() => null)));
      const rearJockey = await loadImg(`/art/jockey-crouch-rear.png?v=${ASSET_VERSION}`).catch(() => null);
      let composedRear: { frames: FrameImage[]; anchors: { x: number; y: number; width: number }[] } | undefined;
      if (USE_SEPARATED_COMPOSITE && rearJockey !== null && rearHorseImages.every((image): image is HTMLImageElement => image !== null)) {
        const saddles = rearHorseImages.map((image) => saddleReference(image, opaqueBounds(image), SILKS_LAYOUT_HORSE_ONLY));
        const ref = saddles[3];
        if (ref !== undefined && saddles.every((saddle) => saddle !== undefined)) {
          composedRear = {
            frames: rearHorseImages.map((horse, index) => {
              const cv = document.createElement('canvas'); cv.width = horse.naturalWidth; cv.height = horse.naturalHeight;
              const ctx = cv.getContext('2d');
              if (ctx !== null) {
                ctx.drawImage(horse, 0, 0);
                ctx.drawImage(rearJockey, Math.round(saddles[index]!.x - ref.x), Math.round(saddles[index]!.y - ref.y));
              }
              return cv;
            }),
            anchors: saddles.map((saddle) => saddle!),
          };
        }
      }
      const sideRefs = loaded.slice(8, 16);
      const composedRace = composeCycle(
        [jockeyImages[0]!, jockeyImages[1]!] as [HTMLImageElement, HTMLImageElement],
        [sideRefs[0]!, sideRefs[4]!], [1, 5], SILKS_LAYOUT_CROUCH);
      const composedWinner = winnerCycleReady ? composeCycle(
        [jockeyImages[2]!, jockeyImages[3]!] as [HTMLImageElement, HTMLImageElement],
        [winnerCycleImages[0] as HTMLImageElement, winnerCycleImages[4] as HTMLImageElement], [1, 5], SILKS_LAYOUT_WINNER) : undefined;
      const sidePoses: readonly FrameImage[] = composedRace ?? loaded.slice(8, 16);
      /**
       * ★16 コマ（中間コマ入り）は「ウサギ跳ね」と評価されたため既定は 8 コマ。
       *   中間コマは脚位置の計測で「両隣の真の中間」と確認できたものだけ後で戻す。
       */
      const USE_MID_FRAMES = false;
      const sideCycle: readonly FrameImage[] = midsReady && USE_MID_FRAMES
        ? sidePoses.flatMap((pose, index) => [pose, midImages[index]!])
        : sidePoses;
      const sideHighQuality = buildFrames(sideCycle);
      /**
       * ★方向別の一体素材（勝馬 8 コマと同じ方式で Codex 生成・騎手込み・1024×1536）。
       *   diag-rear-v4 / diag-front-v3 が 8 枚揃ったときだけ採用。揃わない方向は真横素材で代用（低解像度 v2 は使わない）。
       */
      const loadSet = async (prefix: string): Promise<HTMLImageElement[] | undefined> => {
        const images = await Promise.all(Array.from({ length: 8 }, (_, i) =>
          loadImg(`/art/${prefix}-pose${String(i + 1).padStart(2, '0')}.png?v=${ASSET_VERSION}`).catch(() => null)));
        return images.every((image): image is HTMLImageElement => image !== null) ? images : undefined;
      };
      const rearV4 = await loadSet('horse-jockey-diag-rear-v4');
      const frontV3 = await loadSet('horse-jockey-diag-front-v3');
      const diagFrontHighQuality = frontV3 !== undefined
        ? buildFrames(frontV3, undefined, SILKS_LAYOUT_FRONT)
        : buildFrames(loaded.slice(16, 24));
      const diagRearHighQuality = rearV4 !== undefined
        ? buildFrames(rearV4, undefined, SILKS_LAYOUT_REAR)
        : composedRear !== undefined
          ? buildFrames(composedRear.frames, undefined, SILKS_LAYOUT_REAR, composedRear.anchors)
          : buildFrames(loaded.slice(24, 32));
      const highDiagHighQuality = buildFrames(loaded.slice(32, 40));
      const winnerHighQuality = buildFrames(loaded.slice(40, 41));
      artRef.current = {
        pal, raceTitle: raceTitle!, raceNarrator: raceNarrator!, startingGate: startingGate!,
        raceBackstretch: raceBackstretch!, raceCornerExit: raceCornerExit!, raceFinish: raceFinish!,
        raceCornerRear: raceCornerRear!, raceCornerHigh: raceCornerHigh!,
        sideHighQuality, diagFrontHighQuality, diagRearHighQuality, highDiagHighQuality, winnerHighQuality,
        /**
         * ★勝馬コマは騎手が腕を挙げるぶん外接矩形が縦に長い。矩形高さを基準にすると馬体が 2〜3 割縮むので、
         *   馬体の大きさ（矩形幅の中央値の比）で side-v6 の基準高さに合わせる。
         */
        texturedWorld,
        directionalReady: { rear: rearV4 !== undefined, front: frontV3 !== undefined },
        ...(composedWinner !== undefined ? {
          // ★合成勝馬: 馬体は側面走り 8 コマそのもの（伸縮なし）、騎手はガッツポーズ 2 姿勢
          winnerCycleHighQuality: buildFrames(composedWinner, undefined, SILKS_LAYOUT_WINNER),
        } : winnerCycleReady ? {
          winnerCycleHighQuality: buildFrames(winnerCycleImages, (() => {
            const median = (values: number[]): number => { const v = [...values].sort((x, y) => x - y); return v[Math.floor(v.length / 2)] ?? 1; };
            const sideRef = sideHighQuality[0]![0]!.referenceHeight;
            const sideWidth = median(sideHighQuality[0]!.map((frame) => frame.source.width));
            const winnerWidth = median(winnerCycleImages.map((image) => opaqueBounds(image).width));
            return sideRef * (winnerWidth / sideWidth);
          })(), SILKS_LAYOUT_WINNER),
        } : {}),
        parallaxBackstretch,
      };
      setReady(true);
    };
    boot().catch((e: unknown) => setErr(e instanceof Error ? e.message : String(e)));
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    try { setBuilt(build(seed, ownGate, surface, trackCondition)); setErr(null); } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
    dRef.current = 0;
    callRef.current = [];
    callKeyRef.current = '';
    callLastSecRef.current = -Infinity;
    setClock(0);
  }, [seed, ownGate, surface, trackCondition, turn]);

  const render = useCallback((d: number) => {
    const cv = canvasRef.current;
    const art = artRef.current;
    if (cv === null || art === null || built === null) return;
    const ctx = cv.getContext('2d');
    if (ctx === null) return;

    const intro = raceIntroAt(d);
    const vp = { width: W, height: H };
    const FONT = (px: number, bold?: boolean): string =>
      `${bold === true ? 'bold ' : ''}${px}px sans-serif`;
    const conditionLabel: Record<TrackCondition, string> = {
      good: '良', yielding: '稍重', soft: '重', bad: '不良',
    };
    if (intro.stage === 'title') {
      drawRaceTitleCard(ctx, art.pal as Record<string, string>, vp, FONT, {
        venue: '阪神競馬場', raceName: '桜花賞', raceNo: '11R',
        distanceMeter: DIST, surfaceLabel: surface === 'turf' ? '芝' : 'ダート',
        weatherLabel: '晴', conditionLabel: conditionLabel[trackCondition],
        turnLabel: turn === 'left' ? '左回り' : '右回り',
      }, d, { image: art.raceTitle, width: art.raceTitle.width, height: art.raceTitle.height });
      drawRendererBadge(ctx, renderer, 'title');
      return;
    }
    /**
     * ★V2 はゲート待機〜発走〜追走を**同じ透視カメラの一続き**で描く（ユーザー指摘①: カット無し）。
     *   発馬機は世界固定の物体（`start-gate`）として馬の手前に描き、発走後は左へ流れ去る。
     *   旧固定2D（legacy）だけが従来のプレート＋振り付けの発走を使う。
     */
    const v2StartHold = renderer === 'v2' && (intro.stage === 'gate-hold' || intro.stage === 'gate-release');
    if (renderer !== 'v2' && (intro.stage === 'gate-hold' || intro.stage === 'gate-release')) {
      drawStartingGate(ctx, art.pal as Record<string, string>, vp, FONT,
        undefined, 0, SHEET_V2, FIELD, intro.releaseProgress, frameRoleOf,
        { image: art.startingGate, width: art.startingGate.width, height: art.startingGate.height },
        art.sideHighQuality[0], art.sideHighQuality,
        { image: art.raceNarrator, width: art.raceNarrator.width, height: art.raceNarrator.height });
      drawRendererBadge(ctx, renderer, intro.stage);
      return;
    }

    const raceD = intro.raceDisplaySec;

    const sec = built.warp.raceSecAt(raceD);
    const at = built.model.at(sec);
    const sorted = [...at].sort((a, b) => b.meters - a.meters)
      .map((h) => ({ gate: h.gate, s: h.meters, stamina: h.staminaRatio }));
    const lead = sorted[0]!.s;
    const own = at.find((h) => h.gate === ownGate);
    const metersLeft = DIST - (own === undefined ? lead : own.meters);

    /**
     * ★**透視投影で描きます**（据えたカメラ）。
     *
     * ⚠️ ★これまでの斜め俯瞰は**平行投影**でした。`w` に係数を掛けて縦にずらすだけなので、
     *    **奥も手前も同じ太さの帯**になり、板を並べた絵にしか見えませんでした。
     *    参考（2D の中継画）は**透視投影**で、ラチが収束し、
     *    反対側の走路とスタンドまで見えています。
     *
     * ⚠️ ★**描き方はこの画面に持ちません。** `@star/render` が唯一の出どころで、
     *    動画の道具と**同じ関数**を呼びます。
     */
    /**
     * ★**馬群の後ろから、走路に沿って見ます**（参考の主役の画）。
     *
     * ⚠️ ★最初は走路の**横**に据えました。**丸ごと外していました。**
     *    参考は3枚とも馬群の後ろから見ており、★**空もスタンドも写っていません**。
     */
    const allFinishedNow = at.every((h) => h.meters >= DIST - 1e-6);
    const courseSection = raceCourseSectionAt(lead, DIST, allFinishedNow);
    const shot = raceShotAt({
      distanceMeter: DIST,
      leaderMeters: lead,
      displaySec: raceD,
      displayDurationSec: built.warp.displaySec,
      phase: phaseOf(DIST - lead),
      allFinished: allFinishedNow,
    });
    const visualAt = withFinishRunOut(at, (gate) => built.finishSec.get(gate), sec, DIST, Math.max(0, raceD - built.warp.displaySec));
    const visualLead = Math.max(...visualAt.map((h) => h.meters));
    const winnerGate = built.result[0]!.gate;
    const winnerFinishedNow = (at.find((horse) => horse.gate === winnerGate)?.meters ?? 0) >= DIST - 1e-6;
    const winnerFinishSec = built.finishSec.get(winnerGate);
    const winnerAfterSec = winnerFinishSec === undefined ? 0 : Math.max(0, sec - winnerFinishSec);
    const contenders = visualAt.filter((h) => visualLead - h.meters <= HORSE_LENGTH_M * 2);
    const pack = visualAt.filter((h) => visualLead - h.meters <= 40);
    const focusHorses = focusForRaceShot(shot, {
      all: visualAt, pack, contenders,
      leader: visualAt.filter((h) => h.meters === visualLead),
      winner: visualAt.filter((h) => h.gate === winnerGate),
    });
    const packS = focusHorses.reduce((sum, h) => sum + h.meters, 0) / Math.max(1, focusHorses.length);
    const cornerSection = courseSection === 'first-corner' || courseSection === 'second-corner'
      || courseSection === 'third-corner' || courseSection === 'fourth-corner';
    // ★既定は V2（引継ぎ書 §1-5）。旧固定2Dは `?renderer=legacy` のときだけ
    let v2ShotId: string | undefined;
    /** ★V2 の区間名はショット選択と同じ区間定義から（`broadcastV2SectionLabel`）。旧 `raceCourseSectionAt` とは別定義 */
    let v2SectionLabel: string | undefined;
    /** ★ミニマップ用: 注視点と描画に使った馬の位置（描画と同じ値） */
    let v2Minimap: { focusS: number; horses: { gate: number; s: number; w: number; own: boolean }[] } | undefined;
    if (renderer === 'v2') {
      const course = ovalCourse(DIST, { widthM: TRACK_WIDTH_M, turn });
      /** ★発走イージング（描画のみ・全馬同じ係数）。順位・着差・HUD には触れない */
      const startEase = broadcastV2StartEase(raceD);
      const easedAt = visualAt.map((horse) => ({ ...horse, meters: horse.meters * startEase }));
      const scene = resolveBroadcastV2Scene(course, easedAt.map((horse) => ({
        gate: horse.gate,
        s: horse.meters,
        w: horse.w ?? TRACK_WIDTH_M / 2,
        finished: horse.meters >= DIST - 1e-6,
      })), { width: W, height: H }, winnerFinishedNow, {
        finishStyle: built.finishStyle, cornerCutM: CORNER_CUT_M_WEB,
        raceDisplaySec: d - RACE_INTRO_RACE_START_SEC,
        fourthCornerFront: FOURTH_CORNER_FRONT_WEB,
      });
      v2ShotId = scene.shot.id;
      v2SectionLabel = broadcastV2SectionLabel(course, visualLead, scene.shot.id);
      v2Minimap = {
        focusS: scene.focusS,
        horses: easedAt.map((horse) => ({ gate: horse.gate, s: horse.meters, w: horse.w ?? TRACK_WIDTH_M / 2, own: horse.gate === ownGate })),
      };
      const library = (frames: readonly (readonly HighQualityHorseFrame[])[]) => ({
        sheet: frames[0]![0]!.image,
        sheetWidth: frames[0]![0]!.source.width,
        spec: {
          frames: 1,
          cellH: frames[0]![0]!.referenceHeight,
          anchorXRatio: 0.5,
          anchorYRatio: 1,
        },
        frameImagesByGate: frames,
      });
      const libraries: BroadcastV2FrameLibraries<CanvasImageSource> = {
        'side-v6': library(art.sideHighQuality),
        'diag-front-v2': library(art.diagFrontHighQuality),
        'diag-rear-v2': library(art.diagRearHighQuality),
        'high-diag-v2': library(art.highDiagHighQuality),
        /**
         * ★勝馬追従: 1 枚絵 `winner-v1` は脚が動かず「絵だけになって背景が動く」（ユーザー指摘⑥）。
         *   勝馬の 8 コマ（騎手が立ってガッツポーズ）が承認されるまでは走行 8 コマで脚を動かす。
         */
        'winner-v1': library(art.winnerCycleHighQuality ?? art.sideHighQuality),
      };
      const plate = scene.shot.id === 'finish-line' || scene.shot.id === 'winner-follow' ? art.raceFinish
        : scene.shot.id === 'homestretch-side' ? art.raceCornerExit
          : scene.shot.id === 'third-corner-rear' ? art.raceCornerRear
            : scene.shot.id === 'first-corner-front' || scene.shot.id === 'second-corner-high'
              || scene.shot.id === 'fourth-corner-high' ? art.raceCornerHigh
              : art.raceBackstretch;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      /**
       * ★脚の周期は「時間」ではなく「進んだ距離」から。
       *   旧: `raceD * 12`（全馬 1.5 完歩/秒で一定・速度と無関係）。
       *   → 1完歩 ≈ 7m（競走速度 16m/s で約 2.3 完歩/秒）。速い馬ほど脚が速く回り、失速も脚に出る。
       *   位相の個体差 `gate * 2.96` は据え置き。
       */
      /**
       * ★見た目の周期。実馬は 1 完歩 ≈7m（2.3 完歩/秒）だが、画面では跳ねて見える（ユーザー指摘「ウサギ」）。
       *   合格に近いと評価されたゴール後の走り（≈1.6〜1.8 完歩/秒）に合わせ 9m とする。
       */
      const STRIDE_M = 7;
      /**
       * ★見た目の進行距離 = 真の位置 + Δ（`visual-scroll.ts`）。時間圧縮を打ち消し、
       *   背景の流れと脚の周期を常に実馬の速さにする。ゴール前は Δ=0（決勝線と馬が一致）。
       */
      const visualDelta = built.visualScroll.deltaAt(d);
      const metersByGate = new Map(easedAt.map((horse) => [horse.gate, horse.meters]));
      /**
       * ★発走直後 0.7 秒だけ、減衰する小さなカメラ揺れ（世界だけ・HUD は揺らさない）。
       *   時刻 d の関数なので決定論（憲法4）。実況カメラが開扉の衝撃で震える感じを出す。
       */
      const shakeT = raceD > 0 && raceD < 0.7 ? raceD / 0.7 : -1;
      if (shakeT >= 0) {
        const amp = 5 * (1 - shakeT) * (1 - shakeT);
        ctx.save();
        ctx.translate(Math.sin(raceD * 61) * amp, Math.cos(raceD * 47) * amp * 0.6);
      }
      /**
       * ★カット切替のディゾルブ（0.45 秒）: 直前のショットを同じ時刻でオフスクリーンに描き、
       *   新ショットの上に薄れながら重ねる。切替時刻は build 時に決定論で求めてある（`shotChanges`）。
       */
      const DISSOLVE_SEC = 0.45;
      const change = built.shotChanges.find((c) => c.displaySec <= d && d - c.displaySec < DISSOLVE_SEC && c.to === scene.shot.id);
      const drawScene = (target: CanvasRenderingContext2D, sceneToDraw: typeof scene): void => drawBroadcastV2Scene(target, course, sceneToDraw, {
        palette: art.pal as Record<string, string>,
        libraries,
        fieldSize: FIELD,
        directionalSets: art.directionalReady,
        // ★ゲート待機中（raceD=0）は脚を体の下に畳んだ支持局面 pose04（index 3）で静止させる
        frameOf: (gate) => raceD <= 0 ? 3
          : Math.floor((((metersByGate.get(gate) ?? 0) + visualDelta) / STRIDE_M) * 8 + gate * 2.96) % 8,
        // ★位相（0〜1）: 8 コマ・16 コマどちらの素材でも同じ周期で回る。待機中は pose04 の位相
        phaseOf: (gate) => raceD <= 0 ? 3.5 / 8
          : ((((metersByGate.get(gate) ?? 0) + visualDelta) / STRIDE_M) + gate * 0.37) % 1,
        frameRoleOf,
        surface,
        condition: trackCondition,
        kickupColor: surface === 'dirt' ? '#796047' : '#738b43',
        /**
         * ★コーナー専用カット（3 秒程度）の 1 枚絵は、カットの進行に合わせてパン＋軽いズーム。
         *   旧 `(focusS % 400)/400` は 400m で 137px しか動かず静止に見えた。
         */
        backgroundPlate: plate === undefined ? undefined : {
          image: plate,
          width: plate.naturalWidth,
          height: plate.naturalHeight,
          progress: scene.cutProgress,
          zoom: 1.14 + 0.08 * scene.cutProgress,
        },
        /**
         * ★横追従の全ショット（発走追従・向正面・直線・ゴール前・勝馬追従）をループ多層パララックスにする。
         *   コーナー（3角後方・4角俯瞰）は別構図なので従来プレートのまま（次段で対処）。
         *   縦の枠取り: 望遠カメラで蹄が y≈375〜470 に来るので、芝の帯（プレート 503–762）が
         *   その範囲を含むよう anchor を 1.0（窓を下端まで）にする。
         */
        parallaxPlate: sceneToDraw.shot.view === 'side'
          ? { plate: art.parallaxBackstretch, zoom: 1.14, verticalAnchor: 1.0, scrollM: sceneToDraw.focusS + visualDelta }
          : undefined,
        // ★横視点以外（コーナー後方・俯瞰・斜め前）はテクスチャ付き透視ワールド（背景が実際に動く）
        texturedWorld: sceneToDraw.shot.view === 'side' ? undefined : art.texturedWorld,
      });
      drawScene(ctx, scene);
      if (change !== undefined && FLASH_INTO.has(change.to)) {
        // ★閃光トランジション（アーケード参考映像 74 秒）: 白 → 0.3 秒で消える
        const t = (d - change.displaySec) / 0.3;
        if (t < 1) {
          ctx.globalAlpha = Math.max(0, 1 - t) * 0.95;
          ctx.fillStyle = '#fff8ea';
          ctx.fillRect(0, 0, W, H);
          ctx.globalAlpha = 1;
        }
      } else if (change !== undefined) {
        const off = dissolveCanvasRef.current ?? (dissolveCanvasRef.current = document.createElement('canvas'));
        if (off.width !== W || off.height !== H) { off.width = W; off.height = H; }
        const offCtx = off.getContext('2d');
        if (offCtx !== null) {
          const prevScene = resolveBroadcastV2Scene(course, easedAt.map((horse) => ({
            gate: horse.gate, s: horse.meters, w: horse.w ?? TRACK_WIDTH_M / 2, finished: horse.meters >= DIST - 1e-6,
          })), { width: W, height: H }, winnerFinishedNow, {
            finishStyle: built.finishStyle, cornerCutM: CORNER_CUT_M_WEB,
            raceDisplaySec: d - RACE_INTRO_RACE_START_SEC, forceShotId: change.from,
            fourthCornerFront: FOURTH_CORNER_FRONT_WEB,
          });
          offCtx.clearRect(0, 0, W, H);
          drawScene(offCtx, prevScene);
          const t = (d - change.displaySec) / DISSOLVE_SEC;
          ctx.globalAlpha = Math.max(0, 1 - t * t);
          ctx.drawImage(off, 0, 0);
          ctx.globalAlpha = 1;
        }
      }
      if (shakeT >= 0) ctx.restore();
    } else {
    const background = courseSection === 'finish' || courseSection === 'winner' ? art.raceFinish
      : cornerSection ? art.raceCornerExit : art.raceBackstretch;
    const horsesToDraw = shot.family === 'winner'
      ? visualAt.filter((h) => h.gate === winnerGate)
      : visualAt;
    const isClose = shot.family === 'winner';
    // 発走カメラ終了時の密集3列から通常追走配置へ、約7秒かけて連続移行する。
    const formationRaw = Math.max(0, Math.min(1, (raceD - (RACE_INTRO_END_SEC - RACE_INTRO_RACE_START_SEC)) / 7));
    const formation = formationRaw * formationRaw * (3 - 2 * formationRaw);
    const mix = (from: number, to: number): number => from + (to - from) * formation;
    const normalGround = isClose ? [470, 515, 560] as const
      : cornerSection ? [390, 440, 494] as const
        : courseSection === 'straight' || courseSection === 'finish'
          ? [450, 505, 562] as const : [455, 505, 555] as const;
    const normalHeight = isClose ? [235, 270, 305] as const
      : cornerSection ? [128, 150, 174] as const
        : courseSection === 'straight' || courseSection === 'finish'
          ? [190, 220, 252] as const : [175, 205, 235] as const;
    const normalOffset = isClose ? [-55, 0, 55] as const
      : cornerSection ? [-125, 0, 125] as const : [-70, 0, 70] as const;
    const cameraCenter = isClose ? 650 : cornerSection ? 820
      : courseSection === 'straight' || courseSection === 'finish' ? 850 : 940;
    const pxPerMeter = isClose ? 18 : cornerSection ? 7.5
      : courseSection === 'straight' || courseSection === 'finish' ? 15 : 12;
    const minimumGap = isClose ? 190 : cornerSection ? 105
      : courseSection === 'straight' || courseSection === 'finish' ? 155 : 150;
    const layouts = fixed2DPackLayout(horsesToDraw.map((horse) => ({
      gate: horse.gate, meters: horse.meters, laneM: horse.w ?? TRACK_WIDTH_M / 2,
    })), {
      cameraMeters: packS,
      centerX: mix(820, cameraCenter),
      pxPerMeter: mix(9, pxPerMeter), trackWidthM: TRACK_WIDTH_M,
      groundY: [mix(452, normalGround[0]), mix(482, normalGround[1]), mix(512, normalGround[2])],
      displayReferenceHeight: [mix(146, normalHeight[0]), mix(160, normalHeight[1]), mix(174, normalHeight[2])],
      bandXOffsetPx: [mix(-24, normalOffset[0]), 0, mix(24, normalOffset[2])],
      minVisibleGapPx: mix(72, minimumGap),
    });
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    drawFixed2DSideScene(ctx, { width: W, height: H }, {
      image: background, width: background.naturalWidth, height: background.naturalHeight,
    }, layouts.map((horse) => ({
      frame: art.sideHighQuality[horse.gate - 1]![Math.floor(raceD * 12 + horse.gate * 2.96) % 8]!,
      x: horse.x, groundY: horse.groundY, displayReferenceHeight: horse.displayReferenceHeight,
    })), {
      travelPx: raceD * (courseSection === 'straight' || courseSection === 'finish' ? 178 : cornerSection ? 108 : 138),
      mode: courseSection === 'straight' ? 'straight'
        : courseSection === 'finish' || courseSection === 'winner' ? 'finish'
          : cornerSection ? 'corner' : 'side',
    });
    }

    if (v2StartHold) {
      // ★ゲート待機〜発走直後: 順位 HUD の代わりに発走の中継帯（「ゲートイン完了」→「スタートしました！」）
      drawStartCallBand(ctx, art.pal as Record<string, string>, vp, FONT, FIELD, intro.stage === 'gate-release',
        { image: art.raceNarrator, width: art.raceNarrator.width, height: art.raceNarrator.height });
      drawRendererBadge(ctx, renderer, `${intro.stage}/${v2ShotId ?? 'v2'}`);
      return;
    }
    const sectionLabel: Record<typeof courseSection, string> = {
      start: 'スタート後', 'first-corner': '第1コーナー', 'second-corner': '第2コーナー',
      backstretch: '向正面', 'third-corner': '第3コーナー', 'fourth-corner': '第4コーナー',
      straight: '最後の直線', finish: 'ゴール前', winner: 'レース確定',
    };
    drawCourseSectionTag(ctx, art.pal as Record<string, string>, FONT, v2SectionLabel ?? sectionLabel[courseSection]);
    /**
     * ★コース図ミニマップ（左上・区間タグの下）。カットが変わっても「今どこか」が繋がる（ユーザー指摘⑥）。
     *   描画に使った位置をそのまま点にする（順位計算はしない）。
     */
    if (v2Minimap !== undefined) {
      drawCourseMinimap(ctx, ovalCourse(DIST, { widthM: TRACK_WIDTH_M, turn }), art.pal as Record<string, string>, FONT,
        v2Minimap.horses, v2Minimap.focusS, { x: 24, y: 112, width: 190, height: 112 },
        (gate) => SILKS_COLORS[(gate - 1) % SILKS_COLORS.length] ?? '#fff');
    }
    drawRendererBadge(ctx, renderer, renderer === 'v2' ? v2ShotId ?? 'v2' : `legacy/${courseSection}`);

    /**
     * ★**UI は画面の座標系**（アートバイブル §9）。
     *   ⚠️ ★`cam` を一切使いません。使った瞬間、寄りの最中にゲージが動きます。
     *   ⚠️ ★**描き方はこの画面に持ちません** — 動画の道具と**同じ関数**を呼びます。
     */
    {
      const hud = raceHudVisibilityAt(raceD, built.warp.displaySec, allFinishedNow);
      // ★ゲージはエンジンの staminaAt() を読むだけ（D-072）
      const g = staminaAt(built.gauge, Math.max(0, metersLeft));
      if (hud.gauge) {
        drawGauge(ctx, art.pal as Record<string, string>, vp, FONT,
          `${ownGate}番（自分の馬）`, g.left, built.gauge.initial, g.drainPerMeter);
      }

      /**
       * ★ゴールした馬は**確定着順**で並べます。
       *   ⚠️ 画面上の距離で並べると、ゴール後は全馬が張り付いて★**着順が読めません**。
       */
      const finished = (h: { meters: number }): boolean => h.meters >= DIST - 1e-6;
      const rank = [...at].sort((p, q) => {
        if (finished(p) && finished(q)) {
          return (built.finishPos.get(p.gate) ?? 99) - (built.finishPos.get(q.gate) ?? 99);
        }
        if (finished(p) !== finished(q)) return finished(p) ? -1 : 1;
        return q.meters - p.meters;
      });
      const allIn = rank[0] !== undefined && finished(rank[0]);
      if (hud.standings) {
        drawStandings(ctx, art.pal as Record<string, string>, vp, FONT, rank.map((h) => ({
          gate: h.gate,
          lengths: ((rank[0]?.meters ?? h.meters) - h.meters) / HORSE_LENGTH_M,
          timeSec: allIn ? built.finishSec.get(h.gate) : undefined,
          isOwn: h.gate === ownGate,
        })), FIELD, frameRoleOf);
      }

      /**
       * ★**実況は「変化」を言う**（Q-P4-14 ①）。
       *   ⚠️ ★同じことを繰り返させません。**状態が変わったときだけ**足します
       *      （一度、機械的に足して**3行とも同じ文**になりました）。
       */
      const ownIdx = rank.findIndex((h) => h.gate === ownGate);
      const ownM = rank[ownIdx]?.meters ?? 0;
      const aheadM = ownIdx > 0 ? rank[ownIdx - 1]!.meters : undefined;
      const before = built.model.at(Math.max(0, sec - 0.5));
      const ownBefore = before.find((h) => h.gate === ownGate)?.meters ?? ownM;
      const aheadGate = ownIdx > 0 ? rank[ownIdx - 1]!.gate : undefined;
      const aheadBefore = aheadGate === undefined
        ? undefined : before.find((h) => h.gate === aheadGate)?.meters;
      const gapNow = aheadM === undefined ? 0 : aheadM - ownM;
      const gapBefore = (aheadM === undefined || aheadBefore === undefined)
        ? 0 : aheadBefore - ownBefore;
      const closing = gapBefore - gapNow;
      const lengths = gapNow / HORSE_LENGTH_M;
      const phaseName = v2SectionLabel ?? sectionLabel[courseSection];
      const say: CallPart[] = [{ text: `${ownGate}番`, role: frameRoleOf(ownGate, FIELD) }];
      if (aheadM === undefined) say.push({ text: ' が先頭。' });
      else if (lengths < 0.3) say.push({ text: ' は前と並んでいます' });
      else {
        say.push({ text: ` は前と ${lengths.toFixed(1)} 馬身` });
        say.push({
          text: closing > 0.15 ? '、詰めています' : closing < -0.15 ? '、離されています' : 'の差',
        });
      }
      say.push({ text: `　★${phaseName}` });
      const key = `${phaseName}/${lengths < 0.3 ? '並' : closing > 0.15 ? '詰' : closing < -0.15 ? '離' : '同'}/${ownIdx + 1}`;
      if (hud.calls && shouldEmitRaceCall(callKeyRef.current, key, callLastSecRef.current, raceD)) {
        callKeyRef.current = key;
        callLastSecRef.current = raceD;
        callRef.current = [...callRef.current, say].slice(-3);
      }
      if (hud.calls) drawCallBand(ctx, art.pal as Record<string, string>, vp, FONT, callRef.current,
        { image: art.raceNarrator, width: art.raceNarrator.width, height: art.raceNarrator.height });

      if (winnerFinishedNow && winnerAfterSec < 3.4) {
        drawWinnerLowerThird(ctx, art.pal as Record<string, string>, vp, FONT,
          winnerGate, HORSE_NAMES[winnerGate - 1] ?? `スター${winnerGate}`,
          JOCKEY_NAMES[winnerGate - 1] ?? 'STAR騎手', built.finishSec.get(winnerGate));
      }

      if (hud.result) {
        drawResultPanel(ctx, art.pal as Record<string, string>, vp, FONT,
          built.result, FIELD, frameRoleOf);
      }
    }
  }, [built, ownGate, surface, trackCondition, turn, renderer]);

  useEffect(() => {
    const auditSec = Number(new URLSearchParams(window.location.search).get('auditSec'));
    if (Number.isFinite(auditSec) && auditSec >= 0) dRef.current = auditSec;
    render(dRef.current);
  }, [render, ready]);

  useEffect(() => {
    if (!playing || built === null) return;
    t0Ref.current = performance.now() - dRef.current * 1000;
    const loop = (): void => {
      const d = (performance.now() - t0Ref.current) / 1000;
      // ゴール後はランアウト→勝者紹介→正式着順まで5.2秒確保する。
      const totalDisplaySec = RACE_INTRO_RACE_START_SEC + built.warp.displaySec + 5.2;
      if (d >= totalDisplaySec) {
        dRef.current = totalDisplaySec;
        setClock(built.warp.displaySec);
        render(dRef.current);
        setPlaying(false);
        return;
      }
      dRef.current = d;
      setClock(Math.min(raceIntroAt(d).raceDisplaySec, built.warp.displaySec));
      render(d);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current); };
  }, [playing, built, render]);

  return (
    <main style={{ background: '#14120f', color: '#efe9dc', padding: 14, fontFamily: 'system-ui, sans-serif', minHeight: '100vh' }}>
      <h1 style={{ fontSize: 18, margin: '4px 0 8px' }}>
        レース
        <span style={{ opacity: 0.6, fontSize: 13, marginLeft: 12 }}>
          ★本番と同じエンジン → 境界時刻 → 位置モデル → {renderer === 'v2' ? 'Broadcast V2（透視カメラ中継）' : '旧固定2D描画（legacy）'}
        </span>
        <span style={{
          marginLeft: 12, padding: '2px 8px', fontSize: 12, fontWeight: 'bold', borderRadius: 3,
          background: renderer === 'v2' ? '#c81e78' : '#505050', color: '#fff',
        }}>
          {renderer === 'v2' ? 'BROADCAST V2 ACTIVE' : 'LEGACY RENDERER'}
        </span>
      </h1>
      {err !== null && <p style={{ color: '#e06a4a', fontWeight: 'bold' }}>★{err}</p>}
      <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap', margin: '8px 0' }}>
        <button
          type="button" onClick={() => setPlaying((p) => !p)} disabled={!ready || built === null}
          style={{ padding: '8px 22px', fontSize: 15, fontWeight: 'bold', cursor: 'pointer', background: playing ? '#8a4030' : '#3a6a40', color: '#fff', border: 0 }}
        >
          {playing ? '停止' : '演出開始'}
        </button>
        <button
          type="button" onClick={() => {
            dRef.current = 0;
            callRef.current = [];
            callKeyRef.current = '';
            callLastSecRef.current = -Infinity;
            setClock(0); setPlaying(false); render(0);
          }}
          style={{ padding: '8px 14px', cursor: 'pointer', background: '#3a3630', color: '#efe9dc', border: 0 }}
        >
          最初から
        </button>
        <label>シード <input type="number" value={seed} onChange={(e) => setSeed(Number(e.target.value))} style={{ width: 70 }} /></label>
        <label>
          自馬{' '}
          <select value={ownGate} onChange={(e) => setOwnGate(Number(e.target.value))}>
            {Array.from({ length: FIELD }, (_, i) => i + 1).map((g) => <option key={g} value={g}>{g} 番</option>)}
          </select>
        </label>
        <label>
          走路{' '}
          <select value={surface} onChange={(e) => setSurface(e.target.value as Surface)}>
            <option value="turf">芝</option><option value="dirt">ダート</option>
          </select>
        </label>
        <label>
          馬場{' '}
          <select value={trackCondition} onChange={(e) => setTrackCondition(e.target.value as TrackCondition)}>
            <option value="good">良</option><option value="yielding">稍重</option>
            <option value="soft">重</option><option value="bad">不良</option>
          </select>
        </label>
        <label>
          回り{' '}
          <select value={turn} onChange={(e) => setTurn(e.target.value as 'left' | 'right')}>
            <option value="left">左回り</option><option value="right">右回り</option>
          </select>
        </label>
        {built !== null && <span style={{ fontSize: 13, opacity: 0.8 }}>{clock.toFixed(1)} / {built.warp.displaySec.toFixed(1)} 秒</span>}
      </div>
      <canvas
        ref={canvasRef} width={W} height={H}
        style={{ width: '100%', maxWidth: W, border: '1px solid #4a453d', imageRendering: 'auto', background: '#111' }}
      />
      <p style={{ fontSize: 12, opacity: 0.55, marginTop: 10, lineHeight: 1.8 }}>
        ★<b>着順はエンジンが決めたもの</b>です（開始時に D-059 のゲートを通しています）。<br />
        {renderer === 'v2'
          ? <>★Broadcast V2: コース座標 (s, w) を透視カメラで投影し、区間ごとに中継カメラを切り替えています（旧版は <code>?renderer=legacy</code>）。<br /></>
          : <>★旧固定2Dカメラの前景・中景・後景3帯で、距離差とレーンを表示しています（比較用 legacy）。<br /></>}
        ★横位置と距離ロスはレースエンジンが決めた値を読み、描画側では着順を変更しません。
      </p>
    </main>
  );
}
