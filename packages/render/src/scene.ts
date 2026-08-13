/**
 * レース観戦の場面を組む（正典 §12.8）
 *
 * 【★位置モデルを注入する理由】
 *   「時刻ごとに誰がどこにいるか」は、**正典にもエンジンにも定義がありません**
 *   （照会 Q-P4-06）。`RaceResult` が持つのは着順・走破タイム・着差だけです。
 *
 *   ★ここで補間式を**決め打ちすると、画面の見た目が機構になります。**
 *     P3 で繰り返した「生成と確定で別々に組む」と同じ形です
 *     （オッズを計算した馬と、実際に走る馬が違っていた件）。
 *
 *   → **この層は位置を作りません。渡されたものを描くだけです。**
 *     裁定が出たら `PositionModel` の実装が1つ増えるだけで、ここは変わりません。
 *
 * 【この層の責務】
 *   位置 → 描画コマンド。**それだけ**です。
 *   ★時刻を進めるのも、位置を決めるのも、ここではありません。
 */

import { SPRITE, type DrawCommand, type Frame, type PaletteRole, type SpriteRef, type Zoom } from './commands.js';

/** 走行中の1頭の状態。★これが位置モデルの出力です */
export interface HorseAt {
  /** 馬番（1始まり）。★着順の同定と同じ単位（D-056 と揃える） */
  readonly gate: number;
  /** スタート地点からの距離（メートル） */
  readonly meters: number;
  /**
   * 余力 0〜1（§12.6 のスタミナゲージ）。
   * ★正典 §13 は「ゲージが減るのは**勝負所（残り800m）以降**」と定めています。
   *   その前は 1 のままであるべきで、**それを守るのは位置モデル側**です。
   */
  readonly staminaRatio: number;
}

/**
 * 時刻 → 全馬の位置。★実装は**まだ決まっていません**（Q-P4-06）。
 *
 * ⚠️ この型に「順位」を持たせていません。**順位は位置から決まる**ので、
 *    両方を持つと**食い違える**からです（R-22: 照合は壊れ方と同じ粒度で）。
 */
export interface PositionModel {
  readonly raceSec: number;
  readonly distanceMeter: number;
  at(sec: number): readonly HorseAt[];
}

/** 画面の寸法と、走路をどこに敷くか */
export interface Viewport {
  readonly width: number;
  readonly height: number;
  /** 走路の上端 y と、1頭あたりの縦の間隔 */
  readonly trackTop: number;
  readonly laneHeight: number;
}

/**
 * ★倍率を決めたとき、画面に**何段**入るか（実測に基づく判断材料）。
 *
 *   スプライトは 220×140（D-058）。縦は重ねて詰めるので実効 0.62 倍で数えます。
 *   ★オーナーの判断: 350px(2段) と 220px(3段) は可、140px(6段) は**不可**。
 *   → **全頭を同時に映すことはできません**。カメラで見せる範囲を選びます（§9）。
 */
export function lanesOnScreen(viewportHeight: number, zoom: Zoom): number {
  const laneH = SPRITE.height * zoom * 0.62;
  return Math.max(1, Math.floor((viewportHeight * 0.48) / laneH));
}

/**
 * ★カメラ（アートバイブル §9・2026-08-13 承認）
 *
 *   道中は引き（1×）、勝負所で寄る（2×）。
 *   ⚠️ **倍率は整数のみ**。非整数倍はピクセルアートを壊します（D-058）。
 *
 * 【★カメラが隠してはいけないもの】
 *   ゲージと合図は**画面の座標系**に置くので、ここでは扱いません。
 *   ★構造として隠せないようにしてあり、`camera.test.ts` が機械で見ています。
 */
export interface Camera {
  readonly zoom: Zoom;
  /** ★寄る対象（馬番）。undefined なら先頭馬に合わせる */
  readonly followGate?: number | undefined;
}

/**
 * ★§8b の局面。**位置（残り距離）で決まります**（正典 §13）。
 *   ⚠️ 時刻ではありません。**遅い馬と速い馬で、同じ時刻でも局面が違います**。
 */
export function phaseOf(metersLeft: number): 'start' | 'cruise' | 'spurt' | 'straight' {
  if (metersLeft <= 400) return 'straight';
  if (metersLeft <= 800) return 'spurt';   // ★勝負所（STAMINA_WINDOW_METER = 800）
  return 'cruise';
}

export interface SceneInput {
  readonly model: PositionModel;
  readonly viewport: Viewport;
  /** ★省略時は引き（1×・先頭追従） */
  readonly camera?: Camera | undefined;
  /** 自馬の馬番。★§12.6「自馬にのみスタミナゲージを表示」 */
  readonly ownGate?: number | undefined;
  /** 馬番 → 勝負服。★個体識別の唯一の手段（アートバイブル §3） */
  readonly silkOf: (gate: number) => PaletteRole;
  /** ギャロップのフレーム数（★シート契約。1頭目で確定・A-3） */
  readonly gallopFrames: number;
  /**
   * ★馬番 → **走路の段**（0始まり）。
   *
   *   ⚠️ **`gate` を縦位置に流用しないこと。** `gate` は**馬の識別**です。
   *      12頭立てで `gate-1` を段にすると **12段**になり、画面からはみ出ます
   *      （実際にはみ出して落ちました）。
   *   ★実測どおり **720p / 220px なら3段**しか入りません。
   *      **何頭を何段に置くかは上位が決めます**（カメラの設計・アートバイブル §9）。
   *
   *   省略時は `gate - 1`（＝1頭1段。少頭数のときだけ成り立つ）。
   */
  readonly laneOf?: ((gate: number) => number) | undefined;
  /**
   * ★1m あたりの画素。省略時は**スプライトの実寸から決まります**（220px = 4m）。
   *   ⚠️ 小さくすると馬群が重なります。**演出のつまみではありません。**
   */
  readonly pxPerMeter?: number | undefined;
}

/** ★背景の帯。アートバイブル §3「水平の帯で構成する。縦の要素は最小限」 */
const BANDS: readonly { role: PaletteRole; top: number; height: number }[] = [
  { role: 'sky', top: 0, height: 0.35 },
  { role: 'stand', top: 0.35, height: 0.12 },
  { role: 'rail', top: 0.47, height: 0.03 },
];

/**
 * ★**カメラ**: 先頭馬を画面の一定位置に置き、走路をスクロールさせる。
 *   アートバイブル §3「奥行きは速度差だけで作る（線遠近を描き込まない）」。
 */
function cameraMeters(horses: readonly HorseAt[], follow: number | undefined): number {
  if (follow !== undefined) {
    const target = horses.find((h) => h.gate === follow);
    if (target !== undefined) return target.meters;
  }
  let lead = 0;
  for (const h of horses) if (h.meters > lead) lead = h.meters;
  return lead;
}

/**
 * ★ギャロップのフレームを、**時刻ではなく走った距離**から決める。
 *
 *   時刻で回すと、速い馬も遅い馬も同じ脚さばきになります。
 *   距離で回せば、**速い馬ほど脚が速く回ります**。
 *   アートバイブル §3「接地の瞬間が分かることを優先」。
 */
function gallopFrame(meters: number, frames: number): number {
  /** ★1歩の距離（メートル）。競走馬のストライドは概ね 7m 前後 */
  const STRIDE_M = 7;
  const phase = (meters / STRIDE_M) % 1;
  const f = Math.floor(phase * frames);
  // ★浮動小数の端で frames と等しくなりうる。範囲外のフレームを指さない
  return f >= frames ? frames - 1 : f < 0 ? 0 : f;
}

/**
 * 1フレーム分の描画コマンドを組む。★**純粋関数**（同じ入力 → 同じ配列）。
 */
export function sceneAt(input: SceneInput, sec: number): Frame {
  const { model, viewport: vp } = input;
  const camera: Camera = input.camera ?? { zoom: 1 };
  if (camera.zoom !== 1 && camera.zoom !== 2) {
    // ★型で縛っているが、境界（JSON 由来など）から来る場合に備えて実行時にも見る
    throw new Error(`倍率は 1 か 2 だけです（受け取った値: ${String(camera.zoom)}）`);
  }
  const horses = model.at(sec);
  const cam = cameraMeters(horses, camera.followGate);
  const commands: DrawCommand[] = [];

  for (const b of BANDS) {
    commands.push({
      kind: 'band', role: b.role,
      y: Math.round(b.top * vp.height),
      height: Math.round(b.height * vp.height),
    });
  }
  commands.push({
    kind: 'band', role: 'turf',
    y: Math.round(0.5 * vp.height),
    height: vp.height - Math.round(0.5 * vp.height),
  });

  /**
   * ★**描く順序を馬番で固定します。**
   *   位置順にすると、**同着付近で順序が入れ替わって描画コマンドが変わり**、
   *   C-5（同じ seed から同じ映像）が**理由なく**崩れます。
   *   重なりの前後関係が要るなら、レンダラではなくここで明示的に決めること。
   */
  const sorted = [...horses].sort((a, b) => a.gate - b.gate);

  /**
   * ★**1m あたりの画素。スプライトの実寸と整合していなければなりません。**
   *
   *   スプライトは 220px で、馬1頭ぶん（実寸およそ 2.4m ＋ 前後の間隔）を表します。
   *   → **220px ÷ 4m ＝ 55px/m** が整合する縮尺です。
   *
   *   ⚠️ 最初 **0.6px/m** にしていました（★150倍のずれ）。
   *      結果、60秒時点で 359m に広がった馬群が **215px** に収まり、
   *      **全馬が1頭ぶんの幅に重なって団子**になりました。
   *
   *   ★**縮尺は演出ではなく、スプライトの寸法から決まります。**
   *     ここを自由に決めると、馬の大きさと走路の速さが噛み合わなくなります。
   */
  const PX_PER_M = input.pxPerMeter ?? SPRITE.width / 4;
  const z = camera.zoom;
  for (const h of sorted) {
    // ★倍率は**整数**なので、位置も整数倍になります（画素が割れません）
    const x = Math.round(vp.width * 0.35 + (h.meters - cam) * PX_PER_M * z);
    const lane = input.laneOf === undefined ? h.gate - 1 : input.laneOf(h.gate);
    const y = vp.trackTop + lane * vp.laneHeight * z;
    const sprite: SpriteRef = {
      sheet: 'horse-gallop',
      frame: gallopFrame(h.meters, input.gallopFrames),
    };
    commands.push({ kind: 'sprite', sprite, at: { x, y }, silk: input.silkOf(h.gate) });
  }

  /**
   * ★**ゲージと合図は画面の座標系**（アートバイブル §9 の制約）。
   *
   *   カメラの倍率も中心も**一切使いません**。だから**カメラが隠せません**。
   *   ⚠️ ここに `cam` や `z` を持ち込んだ瞬間、寄りの最中にゲージが動きます。
   *      その禁止は `camera.test.ts` が機械で見ています。
   */
  if (input.ownGate !== undefined) {
    const own = sorted.find((h) => h.gate === input.ownGate);
    if (own !== undefined) {
      commands.push({
        kind: 'gauge',
        at: { x: Math.round(vp.width * 0.05), y: Math.round(vp.height * 0.9) },
        width: Math.round(vp.width * 0.3),
        ratio: own.staminaRatio,
      });
      // ★合図は**出ていない間も false で出します**。
      //   「描かない」にすると、ボットは「まだ来ていない」と「見落とした」を区別できません。
      const left = model.distanceMeter - own.meters;
      const phase = phaseOf(left);
      commands.push({
        kind: 'cue',
        at: { x: Math.round(vp.width * 0.05), y: Math.round(vp.height * 0.82) },
        phase,
        active: phase === 'spurt' || phase === 'straight',
      });
    }
  }

  return { atSec: sec, commands };
}

/**
 * レース全体をフレーム列にする。
 *
 * ★`fps` は**描画の都合**なので引数です。ここで既定値を持たせません
 *   （C-1 の 60fps は「そういう設定だから」ではなく C-6 の条件として要る、という
 *    レビュー側の整理に従い、**数値をこの層に埋めない**）。
 */
export function sceneFrames(input: SceneInput, fps: number): readonly Frame[] {
  if (!Number.isFinite(fps) || fps <= 0) throw new Error(`fps が不正です: ${fps}`);
  const out: Frame[] = [];
  const total = Math.ceil(input.model.raceSec * fps);
  for (let i = 0; i <= total; i += 1) out.push(sceneAt(input, i / fps));
  return out;
}
