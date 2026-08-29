import { contestFocusMeters, contestFocusWithLeadInFrame } from './contest-focus.js';
import { laneArcLengthAt, posOf, sAtLaneArcLength, type Course } from './course.js';
import type { Ctx2D, FontOf, Palette, SheetSpec } from './oblique-draw.js';
import { cameraBasis, project } from './perspective.js';
import { drawDistancePoles } from './distance-poles.js';
import { drawFinishPost } from './finish-post.js';
import { drawMowStripes } from './mow-stripes.js';
import { drawParallaxObjects, drawParallaxPlate, drawWorldBillboards, type ParallaxDrawOptions, type ParallaxPlate, type WorldBillboard } from './parallax-plate.js';
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
  DEFAULT_RACE_SCRIPT,
  LANE_ALIGNED_FOCUS_DEFAULT,
  broadcastV2FixedFov,
  broadcastV2SegmentSpan,
  broadcastV2ShotEndM,
  broadcastV2ShotById,
  type BroadcastV2ShotId,
  broadcastV2AnchorWeight,
  broadcastV2ContenderFov,
  broadcastV2CutProgress,
  broadcastV2FinishCamera,
  broadcastV2FocusMeters,
  broadcastV2LeadFrameFocusMeters,
  broadcastV2ShotAt,
  broadcastV2StartCamera,
  broadcastV2StartFocus,
  type BroadcastV2FinishStyle,
  type BroadcastV2HorseAssetRole,
  type BroadcastV2Script,
  type BroadcastV2Shot,
} from './broadcast-v2.js';
import type { ShotCameraPreset } from './shot-sequence.js';

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
    /** 台本。既定は 'v5'。'v4' は URL による旧台本への切り戻し用（`?cinematography=v4`） */
    readonly script?: BroadcastV2Script;
    /** ★勝馬追従を後方寄りにする（勝馬の後方寄り素材があるとき） */
    readonly winnerRear?: boolean;
    /**
     * ★**主役群の馬番**（＝確定着順の上位 5 頭）。指示書 §4-4。
     *
     * 【★何のためにあるか】
     *   ⚠️ ★これが無いと、`frameContenders` は「先頭から `withinM` 以内の**全馬**」を
     *      画に収めようとします。★主役 5 頭の間に着外の馬が挟まっていると、
     *      ★**その馬まで入れるためにカメラが引き**、主役 5 頭は画面のごく一部に縮みます。
     *
     *   実測（`tools/audit-climax-camera.mjs`・4 seed・残り 260〜60m）:
     *     主役 5 頭が画面幅に占める割合の中央値 = **21.6 / 31.9 / 32.8 / 38.6%**
     *     → 指示書 §4-4 の要求（**60〜75%**）に**まったく届いていませんでした**。
     *
     * 【★なぜ「画面内の頭数」では駄目か】
     *   ★頭数は足りていました（画面内 5〜7 頭）。★**足りないのは「その 5 頭の大きさ」**です。
     *      指示書 §4-1「4〜5 頭が同時に入ったことをせめぎ合いと数えない」はここにも効きます。
     *
     * ⚠️ ★この集合は**レース中ずっと変わりません**（確定着順から決めるため）。
     *    ★だから「順位が入れ替わると集合ごと入れ替わって画角が跳ぶ」問題は起きません
     *    （`focusW` の注記にある 2026-08-22 の実害と同じ罠を踏みません）。
     * ⚠️ ★渡さなければ**従来どおり**です。着順・馬の位置には触れません（憲法3）。
     */
    readonly leadGates?: readonly number[];
    /**
     * ★**§4-4 のカメラ側の直しを丸ごと切る**（★新旧比較の映像を撮るためだけ・指示書 §8-B）
     *
     *   `leadGates`（主役群だけを収める）と `fillFraction`（絵の外縁で 68%）の**両方**を無視し、
     *   ★2026-08-26 より前とまったく同じ画角の決め方に戻します。
     *
     * ⚠️ ★`ClimaxOptions.disabled` と対になる比較用の切替です（`/race?climax=off`）。
     *    ★これが無いと、比較映像の「修正前」の側にカメラの直しだけが残り、
     *    ★**何と何を比べているのか言えなくなります。**
     */
    readonly climaxCameraDisabled?: boolean;
    /**
     * ★**この ID のカットでは `frameContenders` を丸ごと使わない**（台本 v6 用）。
     *
     * 【なぜ要るか】
     *   ⚠️ `finish-line` に付いている `frameContenders`（`withinM: 24, maxFovDeg: 26`）は
     *      ★**直線を 1 カットで通す v5 のために「引く」仕掛け**です。
     *      馬群が伸びるほど画角が広がり、実測で馬は画面高の **11.8%** まで小さくなります。
     *   ★v6 は直線をカットで割るので**引く必要がありません**。同じ場面で **25.6%** になります。
     *
     * ⚠️ ★`climaxCameraDisabled` では足りません。あれは `leadGates` と `fillFraction` だけを
     *    無効にし、`maxFovDeg` は残るからです。★ここは上限ごと外します。
     * ⚠️ ★渡さなければ**従来どおり**です（v5 の挙動は 1 ビットも変わりません）。
     */
    readonly noContenderFrameShots?: readonly BroadcastV2ShotId[];
    /**
     * ★**注視点を「走線に沿った長さ」で置く**（残件 A-2 の候補 (b′)・2026-08-29）
     *
     * ⚠️ ★**既定は `LANE_ALIGNED_FOCUS_DEFAULT`（いまは `false`）です。**
     *    ★正典 R-15「入っているが使われない状態で一度コミットする」。
     *    ★既定を変えるのは、裁定 §7 が指定した 3 つの測定を通してからです。
     * ⚠️ ★道具は**この既定から引くこと**（R-31）。★`true`/`false` を直書きしない。
     */
    readonly laneAlignedFocus?: boolean;
  } = {},
): BroadcastV2Scene {
  const leaderS = horses.reduce((max, horse) => Math.max(max, horse.s), 0);
  const shot = options.forceShotId !== undefined
    ? broadcastV2ShotById(options.forceShotId)
    : broadcastV2ShotAt(course, leaderS, allFinished, options.cornerCutM, { fourthCornerFront: options.fourthCornerFront, script: options.script, winnerRear: options.winnerRear });
  // ★直線→ゴール前は展開に応じた連続ズーム（`broadcastV2FinishCamera`）
  /**
   * ★基準の画角は**ショット定義から**渡します（`shot.camera`）。
   *   渡さないと `broadcastV2FinishCamera` が `SIDE_TELE` 固定で作り直すので、
   *   この 2 ショットだけ `camera:` を変えても画面が変わりません（2026-08-22 の実害）。
   */
  const finish = (shot.id === 'homestretch-side' || shot.id === 'finish-line')
    ? broadcastV2FinishCamera(options.finishStyle ?? 'solo', broadcastV2AnchorWeight(course, shot.id, leaderS), shot.camera, shot.leadFraction)
    : undefined;
  const startPreset = shot.id === 'start-follow' && options.raceDisplaySec !== undefined
    ? broadcastV2StartCamera(options.raceDisplaySec) : undefined;
  const basePreset = startPreset ?? finish?.camera ?? shot.camera;
  /**
   * ★**争っている馬を画面に収める**（設計外・オーナー指摘 2026-08-22）。
   *
   *   固まっていれば寄り、ばらけていれば引く。**画角だけ**を動かします（着順・位置は不変）。
   *   ⚠️ カメラの**位置**は動かしません。位置を動かすと画の性格まで変わります。
   */
  const contenderFov = ((): number | undefined => {
    const spec = shot.frameContenders;
    if (spec === undefined || horses.length === 0) return undefined;
    /** ★台本がこのカットの枠取りを要らないと言っている（`noContenderFrameShots` の注記） */
    if (options.noContenderFrameShots?.includes(shot.id) === true) return undefined;
    const lead = horses.reduce((max, h) => Math.max(max, h.s), horses[0]!.s);
    /**
     * ★**「12m 以内か否か」で数えると、馬が境目をまたいだ 1 コマで画角が跳びます。**
     *
     * ⚠️ ★実測（seed 42・`homestretch-side` 19.83→19.86 秒）:
     *      画角 **13.00° → 5.96°**、注視点 **+0.55m/コマ → +2.2m/コマ**
     *      → 画面上で馬が **1113px 後ろへ跳ぶ**。オーナー評「まるで巻き戻しを見ているよう」。
     *
     *    これは注視点の横位置で一度直したのと**同じ間違い**です（下の重みの説明を参照）。
     *    → 端の馬の効きを**連続**にします。`withinM` までは丸ごと数え、そこから
     *      3m かけて 0 へ落とすので、境目をまたいでも寄与が少しずつ変わるだけです。
     *
     * ★数えるのは「先頭からの差」だけで、着順にも位置にも触れていません（憲法 3）。
     */
    /**
     * ★**落とし方が急だと、そこがまた新しい境目になります。**
     *   3m で 0 にすると、先頭差 14m あたりで画角が 0.5m の移動につき 3.22° 変わりました
     *   （`contender-frame-continuity.test.ts` が検出）。→ `withinM` と同じ幅をかけて落とします。
     */
    const band = spec.withinM;
    const weightOf = (gap: number): number => {
      const u = Math.max(0, Math.min(1, (gap - spec.withinM) / band));
      return 1 - u * u * (3 - 2 * u);
    };
    /**
     * ★**画に収める相手を「主役群」だけに絞る**（指示書 §4-4）。
     *   ⚠️ ★絞らないと、主役の間に挟まった着外の馬まで入れようとしてカメラが引き、
     *      ★主役 5 頭が画面幅の 2〜4 割まで縮みます（`leadGates` の注記の実測）。
     *   ★渡されていなければ従来どおり全馬です。
     */
    const framed = shot.frameLeadGroup !== true || options.climaxCameraDisabled === true
      || options.leadGates === undefined || options.leadGates.length === 0
      ? horses
      : horses.filter((h) => options.leadGates?.includes(h.gate) === true);
    /**
     * ★**先頭は「収める相手」の中で測ります。**
     *   ⚠️ 全馬の先頭を基準にすると、主役群がまだ後ろにいる間、
     *      ★居ない馬までの差を span に数えてしまいます。
     */
    const framedLead = framed.length === 0 ? lead : framed.reduce((m, h) => Math.max(m, h.s), framed[0]!.s);
    let tail = framedLead;
    for (const h of framed) {
      const gap = framedLead - h.s;
      if (gap <= 0) continue;
      tail = Math.min(tail, framedLead - gap * weightOf(gap));
    }
    // カメラから注視点までの距離（プリセットの3成分から。位置は動かさないので固定値）
    const distM = Math.hypot(basePreset.backM, basePreset.upM, basePreset.sideM);
    return broadcastV2ContenderFov(
      framedLead - tail, distM, viewport.width / viewport.height, basePreset.fovDeg, spec.maxFovDeg,
      options.climaxCameraDisabled === true ? undefined : spec.fillFraction,
    );
  })();
  const cameraPreset = contenderFov === undefined ? basePreset : { ...basePreset, fovDeg: contenderFov };
  const leadFraction = finish?.leadFraction ?? shot.leadFraction;
  const leaders = leading(horses, 1);
  const contenders = leading(horses, Math.min(5, horses.length));
  const focus = shot.target === 'leader' || shot.target === 'winner'
    ? leaders
    : shot.target === 'contenders' ? contenders : horses;
  const focusMeters = focus.map((horse) => horse.s);
  /**
   * ★注視点の**横位置**は、先頭からの差で**なだらかに重みを付けた平均**にします。
   *
   * ⚠️ ★以前は「上位 5 頭の単純平均」でした。順位が入れ替わると**集合ごと入れ替わる**ので、
   *    平均が 1 コマで跳びます。実測（`front-close` 23.13 秒）:
   *      注視点の横位置 **3.36m → 5.87m（1 コマで 2.51m）**
   *      → カメラが横に 2.5m 動き、★**画面が 237px 飛ぶ**
   *    ★オーナー評「順位を抜く時、様々な場面で滑らかさがなく、**馬が飛ぶ**印象があります」。
   *
   * ★重みを「入る／入らない」ではなく**連続**にすれば、順位が入れ替わっても
   *   重みが少しずつ移るだけなので跳びません。
   *
   * ⚠️ ★これは**カメラの向け先**の話で、馬の位置ではありません。
   *    着順にも位置にも触れていません（憲法 3）。
   */
  const focusW = ((): number => {
    if (focus.length === 0) return course.widthM / 2;
    if (shot.target === 'leader' || shot.target === 'winner') {
      return focus.reduce((sum, horse) => sum + horse.w, 0) / focus.length;
    }
    const top = leaders[0]?.s ?? 0;
    /** 先頭から `FALLOFF_M` 離れるまでに重みが 1→0 へなだらかに落ちる */
    const FALLOFF_M = shot.target === 'contenders' ? 24 : 60;
    let sum = 0, weight = 0;
    for (const horse of horses) {
      const u = Math.max(0, Math.min(1, (top - horse.s) / FALLOFF_M));
      const w = 1 - u * u * (3 - 2 * u);          // smoothstep（端で滑らかに 0）
      sum += horse.w * w;
      weight += w;
    }
    return weight > 1e-6 ? sum / weight : course.widthM / 2;
  })();
  const cameraAt = (atS: number): PerspectiveCamera => {
    if (shot.fixedCamera !== undefined) {
      // ★固定カメラ: 位置は区間終点基準で固定、注視点（馬群）だけを追う
      /**
       * ★据え位置は**台本のカットの終わり**を基準にします（2026-08-22）。
       *
       * ⚠️ ★以前は `broadcastV2SegmentSpan(course, leaderS).end`＝**先頭の現在位置が属する
       *    コース区間の終点**でした。カットの途中で馬が区間の境界を跨ぐと、
       *    ★**カメラが次の区間の終点へ瞬間移動**します。
       *
       *    実測（4 角正面・注視点 890m→900m）:
       *      画角 **12.82° → 2.80°（−78%）**、馬の画面上の位置が **1 コマで 517px** 跳び、
       *      大きさが **33% 変わる**。
       *      ★オーナー評「カーブから曲がってくる時が雑、滑らかに走っていない」。
       *
       *    カットの終わりならカットの中で動かないので、跳びません。
       *    ⚠️ 台本に無いショット（強制指定など）は従来どおり区間の終点を使います。
       */
      const shotEnd = broadcastV2ShotEndM(course, shot.id, options.script ?? DEFAULT_RACE_SCRIPT);
      const anchorEnd = shotEnd ?? broadcastV2SegmentSpan(course, leaderS).end;
      const eyePos = posOf(course, anchorEnd + shot.fixedCamera.sFromSegmentEnd, shot.fixedCamera.w);
      const target = posOf(course, atS, focusW);
      const dist = Math.hypot(target.x - eyePos.x, target.y - eyePos.y);
      return {
        eye: { x: eyePos.x, y: eyePos.y, z: shot.fixedCamera.upM },
        target: { x: target.x, y: target.y, z: 0.8 },
        fovY: (broadcastV2FixedFov(dist, cameraPreset.fovDeg, shot.fixedCamera.approach) * Math.PI) / 180,
        width: viewport.width, height: viewport.height,
      };
    }
    /**
     * ★**正面追従は残り距離に応じて前方距離を詰めます**（`closeIn` の注記・オーナー指摘）。
     *   ★カメラが抜かれていく＝馬が大きくなりながら迫る、が正面カットの速さの手掛かりです。
     * ⚠️ ★位置だけの関数なので決定論（憲法4）。★同じ場所なら必ず同じ画になります。
     */
    const preset = ((): ShotCameraPreset => {
      const c = shot.closeIn;
      if (c === undefined) return cameraPreset;
      const left = course.distance - leaderS;
      const u = Math.max(0, Math.min(1,
        (c.fromMetersLeft - left) / Math.max(1e-6, c.fromMetersLeft - c.toMetersLeft)));
      const e = u * u * (3 - 2 * u);
      return { ...cameraPreset, backM: cameraPreset.backM + (c.nearBackM - cameraPreset.backM) * e };
    })();
    return broadcastCamera(course, {
      atS, atW: focusW, width: viewport.width, height: viewport.height, view: shot.view, preset,
    });
  };
  let focusS = broadcastV2FocusMeters(focusMeters);
  /**
   * ★**競り合っている場所を見る**（`contest-focus.ts`・台本 v6 の ①③）
   *
   *   ⚠️ ★下の「先頭を画面に置く」処理を**通しません。** 通すと先頭が必ず画面に
   *      入るよう引き戻されるので、★後方の競り合いを抜けません。
   *   ★見るのは主役群（`leadGates`）だけです。着外の馬の小競り合いは追いません。
   *   ⚠️ ★馬の位置には触れていません。動くのはカメラの向け先だけです（憲法3）。
   */
  if (shot.focusContest === true) {
    const gates = options.leadGates;
    const targets = gates === undefined || gates.length === 0
      ? focusMeters
      : horses.filter((h) => gates.includes(h.gate)).map((h) => h.s);
    focusS = contestFocusMeters(targets.length === 0 ? focusMeters : targets);
    /**
     * ★**先頭を枠の内側に残す**（`CONTEST_LEAD_MARGIN_M` の註記・2026-08-28）
     *
     *   ⚠️ ★上の注視点は競り合いだけを見ており、★**画面の幅を見ていません。**
     *      ★そのため seed 14 で **6.2 秒間、先頭（自馬）が画面の外**に出ていました。
     *   ★下がれる上限を**定数ではなく、そのカメラの px/m から**求めます
     *   （馬群ショットの `halfFrameM` と同じ手の内です。★手置きの m 数を使いません）。
     *
     *   ★`Math.max` なので**連続**です。★このファイルが繰り返し警告している
     *   ★「1 コマの跳び」はここでは起きません（連続な 2 つの大きい方）。
     *   ⚠️ ★「先頭を画面に置く」処理（`broadcastV2LeadFrameFocusMeters`）は使いません。
     *      ★あちらは先頭を**決めた位置に置きにいく**ので、後方の競り合いを抜けません。
     *      ★ここは**枠から出さないだけ**で、入っている間は競り合いを中心に捉えたままです。
     */
    const probeCam = cameraAt(focusS);
    const probe = posOf(course, focusS, focusW);
    const projected = project(probeCam, cameraBasis(probeCam), { x: probe.x, y: probe.y, z: 0 });
    if (projected.pxPerM > 0) {
      focusS = contestFocusWithLeadInFrame(focusS, leaderS, (viewport.width / 2) / projected.pxPerM);
    }
  } else if (shot.target === 'pack') {
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
    if ((shot.id === 'start-follow' || shot.id === 'start-front') && options.raceDisplaySec !== undefined) {
      focusS = broadcastV2StartFocus(focusS, options.raceDisplaySec);
    }
  }
  /**
   * ★**注視点を「走線に沿った長さ」で置く**（残件 A-2 の候補 (b′)・★既定では効きません）
   *
   *   ★`focusS` は**中心線の弧長**です。★曲線では走線ごとに実移動が違うので、
   *   ★走路の折れ目でカメラと馬が**別のコマで**越え、その 1 コマだけ滑ります（実測 12.6px）。
   *   → ★**先頭との差を「走線に沿った長さ」で保った点**へカメラを向けます。
   *
   * ⚠️ ★動かすのは**カメラの向け先だけ**です。★返す `focusS` は変えません
   *    （あちらは「何 m 地点を見ているか」という意味の値で、可視判定などに使われます）。
   * ⚠️ ★馬の位置・着順・`laneExtraM` には触れていません（憲法 3）。
   */
  const laneAligned = options.laneAlignedFocus ?? LANE_ALIGNED_FOCUS_DEFAULT;
  const cameraFocusS = ((): number => {
    if (!laneAligned) return focusS;
    const gapS = leaderS - focusS;
    const aligned = sAtLaneArcLength(course, laneArcLengthAt(course, leaderS, focusW) - gapS, focusW);
    return Number.isFinite(aligned) ? aligned : focusS;
  })();

  return {
    shot,
    focusS,
    focusW,
    camera: cameraAt(cameraFocusS),
    visibleHorses: allFinished ? leaders : visibleFor(horses, focusS, shot.maxVisible),
    cutProgress: broadcastV2CutProgress(course, leaderS, options.cornerCutM),
  };
}

/**
 * ★**寄りのカットで描く頭数を絞る**（`maxVisible` の注記・オーナー指摘 2026-08-26）
 *
 *   ⚠️ ★実害: 馬体 46%（画面に入る走路 9.3m）のカットに、密集したレースだと
 *      ★**10 頭**が入って重なり、勝負服が破綻して見えました（seed 99・残り218m）。
 *
 *   ★残すのは**注視点にいちばん近い順**。遠い馬は画面の端に居るので、
 *     ★出入りは端で起きます（画面の真ん中で馬が消えません）。
 *   ⚠️ ★描画だけです。着順・位置・順位表には触れていません（憲法3）。
 */
function visibleFor(
  horses: readonly BroadcastV2Horse[], focusS: number, maxVisible: number | undefined,
): readonly BroadcastV2Horse[] {
  if (maxVisible === undefined || horses.length <= maxVisible) return horses;
  const near = [...horses].sort((a, b) => Math.abs(a.s - focusS) - Math.abs(b.s - focusS))
    .slice(0, maxVisible);
  /** ★描く順は元の並びのまま（重なりの前後関係を変えない） */
  return horses.filter((h) => near.includes(h));
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
    /** ★毛色バリエーション（馬ごとの CSS filter） */
    readonly coatFilterOf?: ((gate: number) => string | undefined) | undefined;
    readonly frameRoleOf: (gate: number, fieldSize: number) => string;
    readonly surface: RenderSurface;
    readonly condition: RenderTrackCondition;
    readonly kickupColor: string;
    /** ★舞い上がった砂煙の色（2026-08-29）。★地面より明るくすること */
    readonly dustColor?: string | undefined;
    /**
     * ★**内側の帯を逆にする**（ダート戦で内回りを芝に見せる）。
     *   ★描画だけ。★裁定 §6-3 の [EYES]。採否はオーナー判断。
     */
    readonly infieldReversed?: boolean | undefined;
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
    /** ★世界に置く看板（発馬機の正面など）。どちらの描画方式でも同じ透視カメラで置く */
    readonly worldBillboards?: readonly WorldBillboard<TImage>[] | undefined;
    /** ★芝の縞刈り（設計 1-3）。既定で描く。`false` で止める（素材の比較用） */
    readonly mowStripes?: boolean | undefined;
    /**
     * ★ハロン棒・距離標（設計 1-7）の数字を描く書体。
     *   省略すると**棒だけ**になります（数字なしでも「世界に固定された物が流れる」効果は出る）。
     */
    readonly poleFont?: FontOf | undefined;
    /** ★ハロン棒を止める（素材の比較用） */
    readonly distancePoles?: boolean | undefined;
    /**
     * ★ゴール板・決勝線（設計 2-3）。既定では**透視ワールドのカットだけ**に描く
     *   （横視点はプレートに既に絵がある）。`false` で完全に止める。
     */
    readonly finishPost?: boolean | undefined;
    /**
     * ★被写体ブラー（参考映像 1.4）。`drawPerspectiveHorses` へそのまま渡す。
     *   速度は呼び出し側が**表示時刻の関数**として渡す（決定論・憲法 4）。
     */
    readonly motionBlur?: {
      readonly exposureSec: number;
      readonly samples: number;
      readonly speedMpsOf: (gate: number) => number;
    } | undefined;
  },
): void {
  const basisForObjects = cameraBasis(scene.camera);
  const projectGround = (s: number, w: number): { readonly x: number; readonly y: number; readonly depth: number } => {
    const p = posOf(course, s, w);
    const q = project(scene.camera, basisForObjects, { x: p.x, y: p.y, z: 0 });
    return { x: q.x, y: q.y, depth: q.depth };
  };
  let parallaxOpts: ParallaxDrawOptions | undefined;
  /**
   * ★**カメラに近いほうのラチは、馬を描いたあとに描きます。**
   *
   * ⚠️ ラチは世界の一部なので馬より先に描かれていました。ところが 4 角正面のように
   *    **内ラチがカメラの手前に来るカット**では、手前にあるはずのラチの上に馬が塗られ、
   *    ★脚がラチを突き抜けて**「馬がラチの向こうに立っている」**ように見えます。
   *    オーナー評「コースの内側に馬の足が入ったりしている」はこれです（2026-08-21）。
   *
   * ⚠️ ★当初は「素材の半幅 0.99m に対し横位置の下限が 0.8m だからはみ出す」と見立て、
   *    エンジンへの照会を書きかけました。**測ったら横位置の最小は 1.575m で、
   *    下限 0.8m には一度も達していませんでした**（291,600 標本）。**素材の幅は無関係。**
   *    ★照会を出す前に測って正解でした。
   */
  let nearRail: (() => void) | undefined;
  if (opts.texturedWorld !== undefined) {
    /**
     * ★**馬場を地面へ渡す**（2026-08-28）。
     *   ⚠️ ★ここで渡していなかったので、★**`surface: 'dirt'` を選んでも
     *      地面は芝のまま**でした（砂煙の色だけがダートになっていました）。
     *   ★走路の幾何には触れません（裁定 §6-3）。
     */
    nearRail = drawTexturedWorld(ctx, course, scene.camera, opts.texturedWorld, {
      focusS: scene.focusS,
      focusW: scene.focusW,
      surface: opts.surface,
      ...(opts.infieldReversed === true ? { infieldReversed: true } : {}),
    }).drawNearRail;
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
  /**
   * ★**芝の縞刈り**（設計 1-3）。地面を描いたあと・馬を描く前に重ねる。
   *
   *   ⚠️ 背景の描き方は 3 通り（透視ワールド／パララックス／1 枚絵）ありますが、
   *      縞は**どれか 1 つに足すのではなく、ここで 1 回**描きます。
   *      走路の投影として描くので、地面の描き方に依らず馬と同じカメラに載ります（R-30）。
   */
  if (opts.mowStripes !== false) {
    drawMowStripes(ctx, course, projectGround,
      { width: scene.camera.width, height: scene.camera.height }, { focusS: scene.focusS });
  }
  if (opts.distancePoles !== false) {
    // ★奥の棒は馬より先に。手前の棒は馬のあと（下の `front`）
    drawDistancePoles(ctx, course, scene.camera, { focusS: scene.focusS, pass: 'behind', font: opts.poleFont });
  }
  /**
   * ★**ゴール板と決勝線**（設計 2-3）。
   *
   *   ⚠️ 横視点（パララックス）には**既に絵があります**（`finish-tower` / `finish-line-*`）。
   *      そこで描くと**二重**になるので、透視ワールドを使うカットだけに出します。
   */
  if (opts.finishPost !== false && opts.texturedWorld !== undefined) {
    drawFinishPost(ctx, course, scene.camera, { focusS: scene.focusS, font: opts.poleFont });
  }
  if (opts.worldBillboards !== undefined) drawWorldBillboards(ctx, opts.worldBillboards, projectGround, 'behind', scene.camera.width);
  const library = opts.libraries[scene.shot.horseAsset];
  /**
   * ★方向別素材の選択: 馬ごとの「進行方向とカメラの相対角」で集合を選ぶ（俯瞰でも後方でも、その馬が
   *   向いている方向の絵が出る）。左右は進行方向の画面上の向きで反転。
   *   0〜60°: 斜め後ろ / 60〜120°: 真横 / 120〜180°: 斜め前（純後方・正面の素材ができたら細分化）。
   *   勝馬追従は勝馬専用集合を使う。
   */
  const directional = scene.shot.id !== 'winner-follow' && scene.shot.id !== 'winner-follow-rear';
  /**
   * ★**向きと素材は、カットにつき 1 つだけ決めます**（2026-08-21）。
   *
   * ⚠️ ★以前は**馬ごと**に `viewDeg` / `forwardDx` を計算して素材と左右反転を選んでいました。
   *    コーナーでは馬ごとに走路の向きが違うので、**同じカットの中で
   *    ある馬は後方素材・ある馬は真横素材、ある馬だけ左右反転**という状態になります。
   *    ★オーナー評「**1匹別の方向に馬が走っている**」（2 カットで指摘）はこれです。
   *
   *   実際の中継では、1 つのカットの中で馬が別々の向きに走ることはありません。
   *   **注視点（馬群の中心）の向きを 1 回だけ求めて、全馬に同じものを使います。**
   */
  const shotView = ((): { viewDeg: number; forwardDx: number } => {
    const p0 = posOf(course, scene.focusS, scene.focusW);
    const p1 = posOf(course, scene.focusS + 1, scene.focusW);
    const fx = p1.x - p0.x, fy = p1.y - p0.y;
    const vx = p0.x - scene.camera.eye.x, vy = p0.y - scene.camera.eye.y;
    const fl = Math.hypot(fx, fy) || 1, vl = Math.hypot(vx, vy) || 1;
    const cosT = Math.max(-1, Math.min(1, (fx * vx + fy * vy) / (fl * vl)));
    const basis = cameraBasis(scene.camera);
    const q0 = project(scene.camera, basis, { x: p0.x, y: p0.y, z: 0 });
    const q1 = project(scene.camera, basis, { x: p1.x, y: p1.y, z: 0 });
    return { viewDeg: (Math.acos(cosT) * 180) / Math.PI, forwardDx: q1.x - q0.x };
  })();
  drawPerspectiveHorses(ctx, course, scene.camera, scene.visibleHorses, {
    ...library,
    frameSetOf: directional ? (horse) => {
      /**
       * ★2026-08-18: 方向別の一体素材（後方・斜め後ろ・正面・斜め前）が承認水準で揃うまで、
       *   全ショットで承認済みの真横素材だけを使う（低解像度の方向別素材との混在は「破綻」と評価された）。
       * ★2026-08-21: **馬ごとの `view` は使いません**（上の `shotView` を参照）。
       */
      const useRear = opts.directionalSets?.rear === true && shotView.viewDeg < 60;
      const useFront = opts.directionalSets?.front === true && shotView.viewDeg > 120;
      const key: BroadcastV2HorseAssetRole = useRear ? 'diag-rear-v2' : useFront ? 'diag-front-v2' : 'side-v6';
      const set = opts.libraries[key];
      /**
       * ★**横に縮めて向きを作るのは取り下げました**（2026-08-26・指示書 §3-1 で不合格）。
       *
       *   ⚠️ ★**横縮小は回転ではありません。** 素材を切り替える案（`broadcastV2TurnFacing`）も
       *      **1 コマで絵の中身が跳ぶ**ので不合格でした。
       *   ★代わりに**編集で不自然な角度を見せません**（`SCRIPT_V5` の 4 角のカット窓）。
       *     関数と検査は記録として残していますが、★**描画からは呼びません。**
       */
      return {
        frames: set.frameImagesByGate?.[horse.gate - 1],
        flip: shotView.forwardDx < 0,
      };
    } : undefined,
    fieldSize: opts.fieldSize,
    frameOf: opts.frameOf,
    phaseOf: opts.phaseOf,
    coatFilterOf: opts.coatFilterOf,
    frameRoleOf: opts.frameRoleOf,
    distanceMeter: course.distance,
    trackEffect: {
      surface: opts.surface,
      condition: opts.condition,
      color: opts.kickupColor,
      ...(opts.dustColor === undefined ? {} : { dustColor: opts.dustColor }),
    },
    motionBlur: opts.motionBlur,
  });
  // ★手前側のラチ（馬の脚が突き抜けないように、馬のあとで描く）
  nearRail?.();
  if (opts.distancePoles !== false) {
    // ★手前の棒（馬より camera 側）は馬のあと。先に描くと馬が棒に乗って見える
    drawDistancePoles(ctx, course, scene.camera, { focusS: scene.focusS, pass: 'front', font: opts.poleFont });
  }
  // ★馬の手前に立つ物体（発馬機の前枠など）
  if (opts.parallaxPlate !== undefined && parallaxOpts !== undefined) {
    drawParallaxObjects(ctx, opts.parallaxPlate.plate, parallaxOpts, 'front');
  }
  if (opts.worldBillboards !== undefined) drawWorldBillboards(ctx, opts.worldBillboards, projectGround, 'front', scene.camera.width);
}
