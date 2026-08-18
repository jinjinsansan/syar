import { posOf, type Course } from './course.js';
import type { Ctx2D, Palette, SheetSpec } from './oblique-draw.js';
import { cameraBasis, project } from './perspective.js';
import { drawParallaxObjects, drawParallaxPlate, type ParallaxDrawOptions, type ParallaxPlate } from './parallax-plate.js';
import { drawTexturedWorld, type TexturedWorldAssets } from './world-textured.js';
import {
  broadcastCamera,
  drawPerspectiveHorses,
  drawPerspectiveWorld,
  type PerspHorse,
  type RenderSurface,
  type RenderTrackCondition,
} from './perspective-draw.js';
import type { PerspectiveCamera } from './perspective.js';
import {
  broadcastV2FixedFov,
  broadcastV2SegmentSpan,
  broadcastV2ShotById,
  type BroadcastV2ShotId,
  broadcastV2AnchorWeight,
  broadcastV2CutProgress,
  broadcastV2FinishCamera,
  broadcastV2FocusMeters,
  broadcastV2LeadFrameFocusMeters,
  broadcastV2ShotAt,
  broadcastV2StartCamera,
  broadcastV2StartFocus,
  type BroadcastV2FinishStyle,
  type BroadcastV2HorseAssetRole,
  type BroadcastV2Shot,
} from './broadcast-v2.js';

export interface BroadcastV2Horse extends PerspHorse {
  readonly finished?: boolean;
}

export interface BroadcastV2Scene {
  readonly shot: BroadcastV2Shot;
  readonly camera: PerspectiveCamera;
  readonly focusS: number;
  readonly focusW: number;
  readonly visibleHorses: readonly BroadcastV2Horse[];
  /** コーナー専用カットの進行率（0→1）。1 枚絵のパン・ズームに使う。カット外は 0 */
  readonly cutProgress: number;
}

export interface BroadcastV2FrameLibrary<TImage> {
  readonly sheet: TImage;
  readonly sheetWidth: number;
  readonly spec: SheetSpec;
  readonly frameImages?: readonly {
    readonly image: TImage;
    readonly source: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
    readonly referenceHeight: number;
    readonly overlay?: {
      readonly image: TImage;
      readonly width: number;
      readonly height: number;
      readonly offsetXSourcePx: number;
      readonly offsetYSourcePx: number;
    } | undefined;
  }[];
  readonly frameImagesByGate?: readonly (readonly {
    readonly image: TImage;
    readonly source: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
    readonly referenceHeight: number;
    readonly overlay?: {
      readonly image: TImage;
      readonly width: number;
      readonly height: number;
      readonly offsetXSourcePx: number;
      readonly offsetYSourcePx: number;
    } | undefined;
  }[])[];
}

export type BroadcastV2FrameLibraries<TImage> = Readonly<
  Record<BroadcastV2HorseAssetRole, BroadcastV2FrameLibrary<TImage>>
>;

function leading(horses: readonly BroadcastV2Horse[], count: number): readonly BroadcastV2Horse[] {
  return [...horses].sort((a, b) => b.s - a.s).slice(0, count);
}

/**
 * エンジンが決めた全馬の(s,w)を一切変更せず、中継カメラの注視対象だけを選ぶ。
 * 旧固定2Dのように、カットごとに別の隊列を組み直してはいけない。
 */
export function resolveBroadcastV2Scene(
  course: Course,
  horses: readonly BroadcastV2Horse[],
  viewport: { readonly width: number; readonly height: number },
  allFinished = false,
  options: {
    readonly finishStyle?: BroadcastV2FinishStyle;
    readonly cornerCutM?: number;
    /**
     * ★発走の統合: レース表示時間（秒・負なら待機中）。指定があると発走ショットの注視点を
     *   ゲート固定 → 馬群追従へ滑らかに移す（`broadcastV2StartFocus`）。
     */
    readonly raceDisplaySec?: number;
    /** ★ショットを強制する（カット切替のディゾルブで「直前のショット」を同時刻に描くため） */
    readonly forceShotId?: BroadcastV2ShotId;
    /** ★4 角を「奥からこちらへ」の固定カメラにする（正面寄りの素材が揃っているとき） */
    readonly fourthCornerFront?: boolean;
    /** 台本: 'v3'（既定・アーケード参考映像）／'v2'（区間ベースの旧台本） */
    readonly script?: 'v2' | 'v3';
  } = {},
): BroadcastV2Scene {
  const leaderS = horses.reduce((max, horse) => Math.max(max, horse.s), 0);
  const shot = options.forceShotId !== undefined
    ? broadcastV2ShotById(options.forceShotId)
    : broadcastV2ShotAt(course, leaderS, allFinished, options.cornerCutM, { fourthCornerFront: options.fourthCornerFront, script: options.script });
  // ★直線→ゴール前は展開に応じた連続ズーム（`broadcastV2FinishCamera`）
  const finish = (shot.id === 'homestretch-side' || shot.id === 'finish-line')
    ? broadcastV2FinishCamera(options.finishStyle ?? 'solo', broadcastV2AnchorWeight(course, shot.id, leaderS))
    : undefined;
  const startPreset = shot.id === 'start-follow' && options.raceDisplaySec !== undefined
    ? broadcastV2StartCamera(options.raceDisplaySec) : undefined;
  const cameraPreset = startPreset ?? finish?.camera ?? shot.camera;
  const leadFraction = finish?.leadFraction ?? shot.leadFraction;
  const leaders = leading(horses, 1);
  const contenders = leading(horses, Math.min(5, horses.length));
  const focus = shot.target === 'leader' || shot.target === 'winner'
    ? leaders
    : shot.target === 'contenders' ? contenders : horses;
  const focusMeters = focus.map((horse) => horse.s);
  const focusW = focus.length === 0
    ? course.widthM / 2
    : focus.reduce((sum, horse) => sum + horse.w, 0) / focus.length;
  const cameraAt = (atS: number): PerspectiveCamera => {
    if (shot.fixedCamera !== undefined) {
      // ★固定カメラ: 位置は区間終点基準で固定、注視点（馬群）だけを追う
      const span = broadcastV2SegmentSpan(course, leaderS);
      const eyePos = posOf(course, span.end + shot.fixedCamera.sFromSegmentEnd, shot.fixedCamera.w);
      const target = posOf(course, atS, focusW);
      const dist = Math.hypot(target.x - eyePos.x, target.y - eyePos.y);
      return {
        eye: { x: eyePos.x, y: eyePos.y, z: shot.fixedCamera.upM },
        target: { x: target.x, y: target.y, z: 0.8 },
        fovY: (broadcastV2FixedFov(dist, cameraPreset.fovDeg) * Math.PI) / 180,
        width: viewport.width, height: viewport.height,
      };
    }
    return broadcastCamera(course, {
      atS, atW: focusW, width: viewport.width, height: viewport.height, view: shot.view, preset: cameraPreset,
    });
  };
  let focusS = broadcastV2FocusMeters(focusMeters);
  if (shot.target === 'pack') {
    /**
     * ★馬群ショットの注視: 画面の半幅（m）を**そのカメラの px/m** から求め、
     *   収まらなければ先頭を画面内に置く（参考映像の横追従）。手置きの m 数は使わない。
     */
    const probeS = broadcastV2LeadFrameFocusMeters(focusMeters, Number.POSITIVE_INFINITY);
    const probeCam = cameraAt(probeS);
    const probe = posOf(course, probeS, focusW);
    const projected = project(probeCam, cameraBasis(probeCam), { x: probe.x, y: probe.y, z: 0 });
    const halfFrameM = projected.pxPerM > 0 ? (viewport.width / 2) / projected.pxPerM : Number.POSITIVE_INFINITY;
    focusS = broadcastV2LeadFrameFocusMeters(focusMeters, halfFrameM, leadFraction);
    if (shot.id === 'start-follow' && options.raceDisplaySec !== undefined) {
      focusS = broadcastV2StartFocus(focusS, options.raceDisplaySec);
    }
  }
  return {
    shot,
    focusS,
    focusW,
    camera: cameraAt(focusS),
    visibleHorses: allFinished ? leaders : horses,
    cutProgress: broadcastV2CutProgress(course, leaderS, options.cornerCutM),
  };
}

/** Webと動画書き出しが共有するBroadcast V2の唯一の世界描画入口。 */
export function drawBroadcastV2Scene<TImage>(
  ctx: Ctx2D<TImage>,
  course: Course,
  scene: BroadcastV2Scene,
  opts: {
    readonly palette: Palette;
    readonly libraries: BroadcastV2FrameLibraries<TImage>;
    readonly fieldSize: number;
    readonly frameOf: (gate: number) => number;
    /** 走行周期の位相（0〜1）。あればコマ数に依存しない選択（perspective-draw 参照） */
    readonly phaseOf?: ((gate: number) => number) | undefined;
    /** ★承認水準の方向別素材が揃っている集合。揃っていない方向は真横素材で代用 */
    readonly directionalSets?: { readonly rear?: boolean; readonly front?: boolean } | undefined;
    readonly frameRoleOf: (gate: number, fieldSize: number) => string;
    readonly surface: RenderSurface;
    readonly condition: RenderTrackCondition;
    readonly kickupColor: string;
    readonly backgroundPlate?: {
      readonly image: TImage;
      readonly width: number;
      readonly height: number;
      /** 現在ショット内の進行率。背景クロップを左から右へ送る。 */
      readonly progress: number;
      readonly zoom?: number;
    } | undefined;
    /**
     * ★ループする多層パララックス（`parallax-plate.ts`）。指定があれば `backgroundPlate` より優先。
     *   世界は注視点の進行距離 `scene.focusS` に比例して流れる（速度ではなく位置＝決定論）。
     */
    readonly parallaxPlate?: {
      readonly plate: ParallaxPlate<TImage>;
      readonly zoom?: number;
      readonly verticalAnchor?: number;
      /** 見た目の進行距離（m）。省略時は注視点の真の位置 `scene.focusS`（`visual-scroll.ts` 参照） */
      readonly scrollM?: number;
    } | undefined;
    /**
     * ★テクスチャ付き透視ワールド（`world-textured.ts`）。横視点以外（コーナー・斜め・後方）で使う。
     *   `parallaxPlate` / `backgroundPlate` より優先。
     */
    readonly texturedWorld?: TexturedWorldAssets<TImage> | undefined;
  },
): void {
  let parallaxOpts: ParallaxDrawOptions | undefined;
  if (opts.texturedWorld !== undefined) {
    drawTexturedWorld(ctx, course, scene.camera, opts.texturedWorld);
  } else if (opts.parallaxPlate !== undefined) {
    // 注視点（馬群）の px/m・深さ・画面上の進行方向を、馬と同じ透視カメラから取る
    const basis = cameraBasis(scene.camera);
    const p0 = posOf(course, scene.focusS, scene.focusW);
    const p1 = posOf(course, scene.focusS + 1, scene.focusW);
    const q0 = project(scene.camera, basis, { x: p0.x, y: p0.y, z: 0 });
    const q1 = project(scene.camera, basis, { x: p1.x, y: p1.y, z: 0 });
    parallaxOpts = {
      viewport: { width: scene.camera.width, height: scene.camera.height },
      zoom: opts.parallaxPlate.zoom ?? 1.12,
      verticalAnchor: opts.parallaxPlate.verticalAnchor ?? 0.48,
      scrollM: opts.parallaxPlate.scrollM ?? scene.focusS,
      anchorS: scene.focusS,
      projectGround: (s, w) => {
        const p = posOf(course, s, w);
        const q = project(scene.camera, basis, { x: p.x, y: p.y, z: 0 });
        return { x: q.x, y: q.y, depth: q.depth };
      },
      packPxPerM: q0.pxPerM,
      packDepthM: q0.depth,
      direction: q1.x >= q0.x ? 1 : -1,
    };
    drawParallaxPlate(ctx, opts.parallaxPlate.plate, parallaxOpts);
  } else if (opts.backgroundPlate !== undefined) {
    const plate = opts.backgroundPlate;
    const zoom = Math.max(1, plate.zoom ?? 1.12);
    const sourceW = Math.min(plate.width, plate.width / zoom);
    const sourceH = Math.min(plate.height, sourceW * scene.camera.height / scene.camera.width);
    const travelX = Math.max(0, plate.width - sourceW);
    const travelY = Math.max(0, plate.height - sourceH);
    const progress = Math.max(0, Math.min(1, plate.progress));
    ctx.drawImage(
      plate.image,
      travelX * progress, travelY * 0.48, sourceW, sourceH,
      0, 0, scene.camera.width, scene.camera.height,
    );
  } else {
    drawPerspectiveWorld(
      ctx as Ctx2D<never>, course, scene.camera, opts.palette,
      course.distance, scene.focusS, { surface: opts.surface, condition: opts.condition },
    );
  }
  const library = opts.libraries[scene.shot.horseAsset];
  /**
   * ★方向別素材の選択: 馬ごとの「進行方向とカメラの相対角」で集合を選ぶ（俯瞰でも後方でも、その馬が
   *   向いている方向の絵が出る）。左右は進行方向の画面上の向きで反転。
   *   0〜60°: 斜め後ろ / 60〜120°: 真横 / 120〜180°: 斜め前（純後方・正面の素材ができたら細分化）。
   *   勝馬追従は勝馬専用集合を使う。
   */
  const directional = scene.shot.id !== 'winner-follow';
  drawPerspectiveHorses(ctx, course, scene.camera, scene.visibleHorses, {
    ...library,
    frameSetOf: directional ? (horse, view) => {
      /**
       * ★2026-08-18: 方向別の一体素材（後方・斜め後ろ・正面・斜め前）が承認水準で揃うまで、
       *   全ショットで承認済みの真横素材だけを使う（低解像度の方向別素材との混在は「破綻」と評価された）。
       *   左右は進行方向の画面上の向きで反転する。
       */
      const useRear = opts.directionalSets?.rear === true && view.viewDeg < 60;
      const useFront = opts.directionalSets?.front === true && view.viewDeg > 120;
      const key: BroadcastV2HorseAssetRole = useRear ? 'diag-rear-v2' : useFront ? 'diag-front-v2' : 'side-v6';
      const set = opts.libraries[key];
      return { frames: set.frameImagesByGate?.[horse.gate - 1], flip: view.forwardDx < 0 };
    } : undefined,
    fieldSize: opts.fieldSize,
    frameOf: opts.frameOf,
    phaseOf: opts.phaseOf,
    frameRoleOf: opts.frameRoleOf,
    distanceMeter: course.distance,
    trackEffect: { surface: opts.surface, condition: opts.condition, color: opts.kickupColor },
  });
  // ★馬の手前に立つ物体（発馬機の前枠など）
  if (opts.parallaxPlate !== undefined && parallaxOpts !== undefined) {
    drawParallaxObjects(ctx, opts.parallaxPlate.plate, parallaxOpts, 'front');
  }
}
