/**
 * ★カメラ（Layer C・PR2）— **ワールド座標 → スクリーン座標**
 *
 * 【なぜ要るか】
 *   ⚠️ ここまでは「進行度 → 画面の x」の直結で、**カメラが1次元**でした。
 *      コースを2次元にした（PR1）以上、**平面をどう画面に落とすか**が要ります。
 *
 * 【★この層の約束】
 *   **純粋関数**です。副作用も乱数も時刻もありません。
 *   ⚠️ **着順に触れません。** カメラをどう変えても結果は 1ビットも変わりません
 *      （`camera.test.ts` が機械で見ています）。
 *
 * 【★D-058 との整合】
 *   正典 D-058 は「**表示は整数倍のみ**（ピクセルアートを壊さない）」と定めています。
 *   一方で中継の画作りには連続した寄り引きが要ります。**両立させます**:
 *
 *     `zoom`（px/m）    … **連続**。走路の縮尺。**位置の変換にだけ使う**
 *     `spriteScale`     … **整数のみ**（1 or 2）。**スプライトの拡大に使う**
 *
 *   ★これは既にやっていることの一般化です（`pxPerMeter` と `Zoom` は既に別物）。
 *   ⚠️ **混ぜると 150倍のずれが起きます**（実際に起きました）。
 */

import type { Course, WorldPos } from './course.js';
import { posOf } from './course.js';
import type { Zoom } from './commands.js';

/** カメラが何を追うか */
export type TargetMode =
  /** 馬群の重心 */
  | 'PACK_CENTROID'
  /** 先頭 */
  | 'LEADER'
  /** 自馬 */
  | 'OWN_HORSE'
  /** ★先頭から1馬身以内の馬群（叩き合い） */
  | 'CONTENDERS'
  /** ゲート */
  | 'GATE';

/** 見る角度。`tilt` が実際の圧縮率で、これはその意図を表す名前 */
export type CameraAngle = 'SIDE' | 'DIAG_FRONT' | 'DIAG_REAR' | 'OVERHEAD' | 'HEAD_ON';

export interface CameraState {
  readonly targetMode: TargetMode;
  /**
   * ★**走路の縮尺**（1m あたりの画素）。**連続値**。
   *   ⚠️ スプライトの拡大率ではありません（下の `spriteScale`）。
   */
  readonly zoom: number;
  readonly angle: CameraAngle;
  /**
   * ★**縦の圧縮率**。`0` = 真横（平面が一本の線に潰れる）、`1` = 真俯瞰。
   *   これが「斜め上から見ている」感じを作ります。**3次元は要りません。**
   */
  readonly tilt: number;
  /** ★望遠圧縮。1.0 = 等倍、0.6 = 馬間を詰めて見せる（中継の望遠レンズ感） */
  readonly xCompression: number;
  /** 追従の緩さ 0（即時）〜1（動かない） */
  readonly followLerp: number;
  /**
   * ★**スプライトの拡大率**。**整数のみ**（D-058）。
   *   ⚠️ `zoom` とは別物です。**混ぜないこと。**
   */
  readonly spriteScale: Zoom;
}

/**
 * 画面の寸法。
 * ⚠️ `scene.ts` の `Viewport` とは**別の型**です（あちらは走路の段も持つ）。
 *    名前が衝突したので、この層は `ScreenSize` と呼びます。
 */
export interface ScreenSize {
  readonly width: number;
  readonly height: number;
}

/** カメラが今どこを、どの向きで見ているか */
export interface CameraPose {
  readonly state: CameraState;
  /** 注視点（ワールド座標） */
  readonly centre: { readonly x: number; readonly y: number };
  /** ★注視点での進行方向。**これを画面の水平に合わせます** */
  readonly heading: number;
}

/**
 * ★ワールド座標 → スクリーン座標。
 *
 *   ① 注視点を原点に移す
 *   ② ★**進行方向が画面の右向きになるよう回す**（＝走路が常に左→右に流れる）
 *   ③ ★**縦を `tilt` で圧縮する**（0 で真横、1 で真俯瞰）
 *   ④ 横を `xCompression` で圧縮する（望遠感）
 *   ⑤ 縮尺をかけ、画面中央へ寄せる
 *
 * ⚠️ **奥行きの手掛かりは②③だけ**で作ります。線遠近は描き込みません（アートバイブル §3）。
 */
export function worldToScreen(
  pose: CameraPose, vp: ScreenSize, world: { readonly x: number; readonly y: number },
): { readonly x: number; readonly y: number; readonly depth: number } {
  const { state, centre, heading } = pose;
  const dx = world.x - centre.x;
  const dy = world.y - centre.y;
  // ② 進行方向を画面の右向きへ
  const c = Math.cos(-heading), s = Math.sin(-heading);
  const rx = dx * c - dy * s;
  const ry = dx * s + dy * c;
  // ③④⑤
  return {
    x: vp.width * 0.5 + rx * state.zoom * state.xCompression,
    y: vp.height * 0.5 + ry * state.zoom * state.tilt,
    /**
     * ★**手前ほど大きい値**。描く順序と拡大に使います。
     *   ⚠️ ここで「大きさ」を返しません。**どう使うかは描く側**です。
     */
    depth: ry,
  };
}

/** ★`(s, w)` を直接スクリーンへ（コース幾何と組み合わせる） */
export function courseToScreen(
  course: Course, pose: CameraPose, vp: ScreenSize, s: number, w: number,
): { readonly x: number; readonly y: number; readonly depth: number; readonly heading: number } {
  const p: WorldPos = posOf(course, s, w);
  const scr = worldToScreen(pose, vp, p);
  return { ...scr, heading: p.heading - pose.heading };
}

/* ------------------------------------------------------------------ *
 * ★カット表
 * ------------------------------------------------------------------ */

export interface Cut {
  /** ★このカットに入る「残り距離」[m]。大きい順に並べる */
  readonly fromMetersLeft: number;
  readonly label: string;
  readonly state: CameraState;
  /**
   * 前のカットからの繋ぎ方。
   * `0` なら**切り替え**（カット）、正なら**その秒数で補間**。
   * ★実際の中継も、寄り引きは補間、局面の変わり目は切り替えです。
   */
  readonly blendSec: number;
}

/**
 * ★**カット表**（中継の画作りに合わせる・1600m の例）。
 *
 * 【調べたこと】実際の競馬中継は最上級の競走で約20台のカメラを使い、
 *   スタンドのメインカメラ → 向正面は併走車 → 各コーナーのカメラ →
 *   直線とゴール前は別のカメラ、と**切り替え**ています。
 *
 * ⚠️ **数字は「良さそう」で決めていません。**
 *   `zoom` は「画面に何m映るか」から決めます（1280px 幅）:
 *     zoom 12 → 107m（馬群 24m がゆったり入る）
 *     zoom 20 →  64m
 *     zoom 32 →  40m（馬群がほぼ画面いっぱい）
 *   `tilt` は 0（真横）〜1（真俯瞰）。コーナーは寝かせないと**重なって潰れます**。
 */
/**
 * ★**カット表をコースから作る。**
 *
 * 【★間違えました】
 *   最初は切り替え位置を「残り 400+900m」のように**手で書いて**いました。
 *   ⚠️ 結果、**カットの名前と実際の区間がずれました**
 *      （「向正面」のカットで実際は 3角、「3角」のカットで実際は 4角）。
 *   ★**区間の境目はコースが知っています。書き写さず、読みます。**
 *     俯瞰図のラベルでも同じ間違いをしました。**2度目です。**
 *
 * 【数字の根拠】
 *   `zoom` は「画面に何m映るか」から決めます（1280px 幅）:
 *     14px/m →  91m（馬群 24m がゆったり入る）
 *     20px/m →  64m
 *     30px/m →  43m（叩き合いが画面いっぱい）
 *   `tilt` は 0（真横）〜1（真俯瞰）。★**コーナーは寝かせないと馬群が重なって潰れます。**
 *
 * 【調べたこと】実際の競馬中継は最上級の競走で約20台のカメラを使い、
 *   スタンドのメインカメラ → 向正面は併走車 → 各コーナーのカメラ →
 *   直線とゴール前は別のカメラ、と**切り替え**ています。
 */
export function cutsFor(course: Course): readonly Cut[] {
  /** ★区間の「入口」を残り距離に直す */
  const entry = new Map<string, number>();
  let acc = 0;
  for (const seg of course.segments) {
    // ★同じ名前が複数あるときは**最初の入口**を採る
    if (!entry.has(seg.label)) entry.set(seg.label, course.distance - acc);
    acc += seg.length;
  }
  /**
   * ★**存在しない区間のカットは作りません。**
   *   ⚠️ 1000m は向正面を通りません（区間は 3角→4角→直線）。
   *      それでも「向正面」のカットを既定値で作っていました。**検査が捕まえました。**
   */
  const at = (label: string): number | undefined => entry.get(label);

  const maybe: (Cut | undefined)[] = [
    {
      fromMetersLeft: course.distance, label: '発走', blendSec: 0,
      state: {
        targetMode: 'PACK_CENTROID', zoom: 26, angle: 'DIAG_REAR', tilt: 0.28,
        xCompression: 1, followLerp: 0.12, spriteScale: 2,
      },
    },
    {
      fromMetersLeft: course.distance - 200, label: '隊列形成', blendSec: 1.2,
      state: {
        targetMode: 'PACK_CENTROID', zoom: 16, angle: 'SIDE', tilt: 0.22,
        xCompression: 0.9, followLerp: 0.15, spriteScale: 1,
      },
    },
    {
      // ★向正面（併走車のイメージ）。**入口はコースから**
      fromMetersLeft: at('向正面') ?? -1, label: '向正面', blendSec: 0,
      state: {
        targetMode: 'PACK_CENTROID', zoom: 14, angle: 'SIDE', tilt: 0.20,
        xCompression: 0.85, followLerp: 0.18, spriteScale: 1,
      },
    },
    {
      // ★3角。寝かせないと馬群が重なって潰れます
      fromMetersLeft: at('3角') ?? -1, label: '3角', blendSec: 1.0,
      state: {
        targetMode: 'PACK_CENTROID', zoom: 13, angle: 'DIAG_FRONT', tilt: 0.55,
        xCompression: 1, followLerp: 0.18, spriteScale: 1,
      },
    },
    {
      fromMetersLeft: at('4角') ?? -1, label: '4角', blendSec: 0,
      state: {
        targetMode: 'LEADER', zoom: 16, angle: 'DIAG_FRONT', tilt: 0.45,
        xCompression: 1, followLerp: 0.14, spriteScale: 1,
      },
    },
    {
      fromMetersLeft: at('直線') ?? -1, label: '直線', blendSec: 0,
      state: {
        targetMode: 'CONTENDERS', zoom: 20, angle: 'SIDE', tilt: 0.18,
        xCompression: 0.75, followLerp: 0.12, spriteScale: 2,
      },
    },
    {
      // ★じわ寄り（連続補間）
      fromMetersLeft: 200, label: '追い比べ', blendSec: 2.5,
      state: {
        targetMode: 'CONTENDERS', zoom: 30, angle: 'SIDE', tilt: 0.15,
        xCompression: 0.7, followLerp: 0.08, spriteScale: 2,
      },
    },
  ];
  /**
   * ★**距離が短いと、存在しない区間のカットが混ざります。**
   *   ⚠️ 1200m なら 1角・2角を通りません。**そのカットは落とします。**
   *   さらに、残り距離が単調に減る順に並べ直します。
   */
  return maybe
    .filter((c): c is Cut => c !== undefined)
    // ★存在しない区間（fromMetersLeft = -1）と、距離外のものを落とす
    .filter((c) => c.fromMetersLeft <= course.distance && c.fromMetersLeft >= 0)
    .sort((a, b) => b.fromMetersLeft - a.fromMetersLeft)
    .filter((c, i, arr) => i === 0 || c.fromMetersLeft < arr[i - 1]!.fromMetersLeft);
}

/** ★残り距離に対応するカット（と、1つ前） */
export function cutAt(cuts: readonly Cut[], metersLeft: number): { readonly cut: Cut; readonly prev: Cut | undefined } {
  let idx = 0;
  for (let i = 0; i < cuts.length; i += 1) {
    if (metersLeft <= cuts[i]!.fromMetersLeft) idx = i;
  }
  return { cut: cuts[idx]!, prev: idx > 0 ? cuts[idx - 1] : undefined };
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/**
 * ★カットの繋ぎ。`blendSec` が 0 なら**切り替え**、正ならその秒数で補間。
 *
 * ⚠️ `spriteScale` は**整数のみ**なので補間しません（D-058）。**切り替えます。**
 */
export function blendCamera(from: CameraState, to: CameraState, t: number): CameraState {
  const k = Math.max(0, Math.min(1, t));
  return {
    targetMode: k < 0.5 ? from.targetMode : to.targetMode,
    zoom: lerp(from.zoom, to.zoom, k),
    angle: k < 0.5 ? from.angle : to.angle,
    tilt: lerp(from.tilt, to.tilt, k),
    xCompression: lerp(from.xCompression, to.xCompression, k),
    followLerp: lerp(from.followLerp, to.followLerp, k),
    // ★整数のみ。補間したら 1.5 になり、ピクセルアートが壊れます
    spriteScale: k < 0.5 ? from.spriteScale : to.spriteScale,
  };
}

/**
 * ★注視点を決める。
 *
 * ⚠️ `CONTENDERS` は「先頭から1馬身以内」の馬群です。
 *    ★**該当が無ければ先頭に落とします**（画面が空になるのを防ぐ）。
 */
export function focusOf(
  mode: TargetMode,
  horses: readonly { readonly gate: number; readonly s: number }[],
  ownGate: number | undefined,
  horseLengthM: number,
): number {
  if (horses.length === 0) return 0;
  const lead = Math.max(...horses.map((h) => h.s));
  switch (mode) {
    case 'LEADER': return lead;
    case 'GATE': return Math.min(...horses.map((h) => h.s));
    case 'OWN_HORSE': {
      const own = ownGate === undefined ? undefined : horses.find((h) => h.gate === ownGate);
      return own === undefined ? lead : own.s;
    }
    case 'CONTENDERS': {
      const near = horses.filter((h) => lead - h.s <= horseLengthM);
      if (near.length === 0) return lead;
      return near.reduce((a, h) => a + h.s, 0) / near.length;
    }
    case 'PACK_CENTROID':
    default: {
      // ★先頭から離れすぎた馬は「馬群」ではないので数えない
      const PACK_M = 40;
      const pack = horses.filter((h) => lead - h.s <= PACK_M);
      const use = pack.length > 0 ? pack : horses;
      return use.reduce((a, h) => a + h.s, 0) / use.length;
    }
  }
}
