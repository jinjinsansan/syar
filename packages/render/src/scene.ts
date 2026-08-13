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

import {
  SPRITE,
  type DrawCommand, type Frame, type PaceMark, type PaletteRole,
  type SpriteRef, type StrategyMark, type Zoom,
} from './commands.js';

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
 * ★**局面に応じたカメラ**（アートバイブル §9・2026-08-13 承認）
 *
 *   道中は引き（1×）、勝負所と直線で寄る（2×）、確定ですっと引く。
 *
 * 【★C-6 を殺さないための約束】
 *   ⚠️ **切り替えは「跨いだ瞬間」に1回だけ**です。行ったり来たりさせません。
 *      寄ったり引いたりを繰り返すと、**プレイヤーはゲージを追えなくなります**。
 *   ⚠️ ゲージと合図は**画面の座標系**なので、倍率が変わっても動きません（構造で保証）。
 *
 * 【なぜ関数にするか】
 *   ★「いつ寄るか」は**位置で決まります**（残り800m）。**時刻ではありません。**
 *     遅い馬と速い馬で、同じ時刻でも局面が違います。
 */
export function cameraFor(
  metersLeft: number,
  followGate: number | undefined,
): Camera {
  const phase = phaseOf(metersLeft);
  const zoom: Zoom = phase === 'spurt' || phase === 'straight' ? 2 : 1;
  return followGate === undefined ? { zoom } : { zoom, followGate };
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
  /**
   * ★「足りる」着順の線（既定3）。`gap.toGo` の計算に使います。
   *
   *   ⚠️ ここで数字を発明しません。**賞金の刻みは正典が決めるもの**で、
   *      画面はそれを**受け取って表示するだけ**です。
   */
  readonly payLine?: number | undefined;
  /**
   * ★馬番 → **脚質**（正典 V-16 ①）。
   *   ⚠️ ここで発明しません。**エンジンが持っているものを受け取るだけ**です。
   */
  readonly strategyOf?: ((gate: number) => StrategyMark) | undefined;
  /** ★ペース。`paceOf()` が出したものをそのまま渡します */
  readonly pace?: PaceMark | undefined;
  /**
   * ★段の数（既定3）。`laneOf` が返す値の範囲と揃えます。
   *   ⚠️ ここがずれると、**馬が走路の外（空やスタンド）に出ます**。実際に出ました。
   */
  readonly laneCount?: number | undefined;
  /**
   * ★**各馬の余力を描くか**（既定 false）。
   *
   *   ⚠️ いま `effort` に入っている値は**余力ではありません**。
   *      `BoundaryTimes` から作れるのは進捗の言い換えだけで、**必ず逆を向きます**
   *      （実測: 残り200m で順位相関 −0.518）。
   *   ★オーナーの指摘「馬の上の黄色の線がある」。**意味の無いものを出しません。**
   *     `emptyAtMeter` が渡るようになったら（Q-P4-21）、既定で出します。
   */
  readonly showEffort?: boolean | undefined;
  /**
   * ★**実走の 1m あたりの秒数**（＝1/速度）。脚の回転をここから決めます。
   *   ⚠️ **表示の速さではありません。** 送りを速くしても脚は馬の速さで回ります。
   *   省略時は 16m/s 相当。
   */
  readonly secondsPerMeter?: number | undefined;
  /**
   * ★**脚を回すための時計（表示の秒）。**
   *   ⚠️ レースの時刻を渡すと、送りを速くしたとき脚も速くなります。
   *   省略時はレースの時刻（＝等速のとき正しい）。
   */
  readonly animSec?: number | undefined;
  /**
   * ★**ハロン棒**（残り距離の標識）を出すか。
   *   オーナーの指摘「競馬コースのポールもない」。
   *   ⚠️ ここで「何mごとか」を発明しません。**間隔は呼び出し側が渡します**。
   */
  readonly poleEveryMeter?: number | undefined;
}

/**
 * ★背景の層（アートバイブル §3「水平の帯で構成する」「奥行きは速度差だけで作る」）。
 *
 *   `speed` は**手前（走路）を 1.0 としたときの流れる速さ**。
 *   実測（馬の見た目の速度 647px/秒）に対して:
 *     空 0.06 → 39px/秒（画面横断 33秒）… 動いていると分かる遅さ
 *     スタンド 0.22 → 142px/秒
 *     ラチ 0.55 → 356px/秒
 *
 *   ⚠️ **速さは奥行きの表現そのもの**です。全部同じにすると平面になります。
 */
const BANDS: readonly {
  role: PaletteRole; top: number; height: number; speed: number; tile: number;
}[] = [
  { role: 'sky', top: 0, height: 0.35, speed: 0.06, tile: 320 },
  { role: 'stand', top: 0.35, height: 0.12, speed: 0.22, tile: 160 },
  { role: 'rail', top: 0.47, height: 0.03, speed: 0.55, tile: 64 },
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
function gallopFrame(
  gate: number, frames: number, animSec: number, metersPerSec: number,
): number {
  /**
   * ★**脚は「表示の時間」で回します。距離ではありません。**
   *
   * 【★2回書き直しました】
   *   1回目: 「進んだ距離 ÷ 1歩 7m」。
   *     ⚠️ 時間配分（D-062）で道中を3倍速にすると、**脚も3倍速**になります。
   *        オーナーの指摘「**走り方が小走りで全く馬の走りになっていない**」はこれです。
   *   2回目: 距離のまま歩数だけ丸めようとして、**掛けて割るだけの恒等式**を書きました。
   *     ★何も変わっていませんでした。**式を書いたら値が変わるか確かめること。**
   *
   * 【★決め方】
   *   競走馬のストライドは概ね 7m、走行速度は 15〜17m/s → **毎秒 2.1〜2.4 歩**。
   *   ★画面が何倍速で送られていても、**脚は毎秒 2 歩前後で回らないと馬に見えません。**
   *   位相は馬番でずらします（全馬が同じ脚さばきだと**行進**に見えます）。
   */
  const STRIDE_M = 7;
  const strideHz = Math.min(2.6, Math.max(2.0, metersPerSec / STRIDE_M));
  const phase = ((animSec * strideHz) + gate * 0.37) % 1;
  const f = Math.floor(phase * frames);
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
  const PX_PER_M = input.pxPerMeter ?? SPRITE.width / 4;
  const PX_PER_M0 = PX_PER_M;

  /**
   * ★背景は**カメラの位置に応じて流します**（パララックス）。
   *   `cam` は先頭（または自馬）が走った距離なので、**そのまま流れの量**になります。
   */
  for (const b of BANDS) {
    commands.push({
      kind: 'parallax', role: b.role,
      y: Math.round(b.top * vp.height),
      height: Math.round(b.height * vp.height),
      tileWidth: b.tile,
      // ★0 以上に保つ（負の剰余はレンダラごとに挙動が違う）
      offset: Math.max(0, Math.round(cam * PX_PER_M * b.speed)),
    });
  }
  // ★走路は手前なので速度 1.0。馬と同じだけ流れる
  commands.push({
    kind: 'parallax', role: 'turf',
    y: Math.round(0.5 * vp.height),
    height: vp.height - Math.round(0.5 * vp.height),
    tileWidth: 96,
    offset: Math.max(0, Math.round(cam * PX_PER_M)),
  });

  /**
   * ★**ハロン棒**（残り距離の標識）。走路の座標系なので、馬と同じ速さで流れます。
   *   ⚠️ 「200mごと」はこの層で決めません。**渡された間隔で置くだけ**です。
   */
  if (input.poleEveryMeter !== undefined && input.poleEveryMeter > 0) {
    const zz = camera.zoom;
    const step = input.poleEveryMeter;
    /**
     * ★**画面に映る範囲だけを置きます。**
     *   ⚠️ 最初は範囲の式を間違えて**1本も出ませんでした**（検査が落ちて気づきました）。
     *   ★実測: 55px/m・幅1280 なので、**画面に映るのは約23m**です。
     *     200m ごとの標識は**12秒に1本**しか通りません。それが実際の間隔です。
     */
    const leftM = cam - (vp.width * 0.35) / (PX_PER_M0 * zz);
    const rightM = cam + (vp.width * 0.65) / (PX_PER_M0 * zz);
    const first = Math.ceil(Math.max(0, leftM) / step) * step;
    for (let m = first; m <= Math.min(model.distanceMeter, rightM); m += step) {
      commands.push({
        kind: 'pole',
        at: { x: Math.round(vp.width * 0.35 + (m - cam) * PX_PER_M0 * zz), y: vp.trackTop },
        metersLeft: model.distanceMeter - m,
        scale: zz,
      });
    }
  }


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
  const z = camera.zoom;
  for (const h of sorted) {
    // ★倍率は**整数**なので、位置も整数倍になります（画素が割れません）
    const x = Math.round(vp.width * 0.35 + (h.meters - cam) * PX_PER_M * z);
    const lane = input.laneOf === undefined ? h.gate - 1 : input.laneOf(h.gate);
    /**
     * ★**自馬の段を画面に入れる**（C-6 の前提）。
     *
     *   ⚠️ 寄る（2×）と段の間隔も2倍になり、**入る段が減ります**
     *      （実測: 720p で 1× なら3段、2× なら1段）。
     *      このとき自馬の段が画面外だと、**仕掛ける瞬間に自分の馬が消えます**。
     *      ★実際にそうなりました（自馬3番が寄りの間ずっと見えなかった）。
     *
     *   → 自馬の段が**先頭の段に来るよう縦にずらします**。カメラの縦の追従です。
     *     自馬を指定していないときはずらしません（観戦モード）。
     */
    const ownLane = input.ownGate === undefined
      ? 0
      : (input.laneOf === undefined ? input.ownGate - 1 : input.laneOf(input.ownGate));
    /**
     * ★**段は必ず走路の中に収めます。**
     *
     *   ⚠️ 以前は `lane - ownLane` をそのまま使っていました。
     *      自馬が最下段（例: 段2）のとき、段0と段1が **負のずれ**になり、
     *      ★**馬が芝の上（スタンドや空）を走っていました。** 実際に空を走っていました。
     *   → **巡回**させます。自馬が必ず先頭の段に来て、他は下に回ります。
     */
    const laneCount = Math.max(1, input.laneCount ?? 3);
    const rel = (((lane - ownLane) % laneCount) + laneCount) % laneCount;
    const y = vp.trackTop + rel * vp.laneHeight * z;
    const sprite: SpriteRef = {
      sheet: 'horse-gallop',
      frame: gallopFrame(h.gate, input.gallopFrames, input.animSec ?? sec, 1 / (input.secondsPerMeter ?? 1 / 16)),
    };
    commands.push({
      kind: 'sprite', sprite, at: { x, y }, silk: input.silkOf(h.gate), scale: z,
      // ★脚質が見えないと、位置は嘘をつきます（V-16 ①）
      ...(input.strategyOf === undefined ? {} : { strategy: input.strategyOf(h.gate) }),
    });

    /**
     * ★**各馬の余力**（展開を読ませる）。
     *
     *   ⚠️ これが無いと、画面から読めるのは「位置」だけになります。
     *      勝負所で位置だけを読んだときの的中能力は **AUC 0.431**
     *      ＝**何も見ないより悪い**、と実測しました（`tools/verify-readable.mjs`）。
     *      逃げ馬が前にいるのは強いからではないので、**位置は嘘をつきます。**
     *
     *   ★馬に付くので**世界の座標系**です（ゲージ・合図とは扱いが違う）。
     */
    if (input.showEffort === true) {
      commands.push({
        kind: 'effort',
        at: { x, y: y - Math.round(vp.laneHeight * 0.18) * z },
        ratio: h.staminaRatio,
        scale: z,
      });
    }
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

      /**
       * ★**変化を出す**（裁定 Q-P4-14 ①「実況は『位置』ではなく『変化』を言う」）。
       *
       *   順位の数字は出しません。出すのは
       *     ① 前の馬との**差**（m）
       *     ② それが**毎秒どれだけ詰まっているか**（m/s）
       *     ③ **あと何頭抜けば足りるか**
       *   の3つだけです。
       *
       *   ★③ の「足りる」の線（既定3着）は**上位から渡します**。
       *     ここで発明すると、賞金の刻みが変わったとき画面だけ古くなります。
       */
      const ahead = horses.filter((o) => o.meters > own.meters);
      const nearest = ahead.reduce<number | undefined>(
        (best, o) => (best === undefined || o.meters < best ? o.meters : best), undefined,
      );
      /** ★少し前の時刻と比べて、差が縮んでいるかを出す。**位置ではなく変化** */
      const dt = 0.5;
      const before = model.at(Math.max(0, sec - dt));
      const ownBefore = before.find((o) => o.gate === own.gate);
      const nearestBefore = ahead.length === 0 ? undefined
        : before.filter((o) => ahead.some((a) => a.gate === o.gate))
          .reduce<number | undefined>(
            (best, o) => (best === undefined || o.meters < best ? o.meters : best), undefined,
          );
      const gapNow = nearest === undefined ? 0 : nearest - own.meters;
      const gapBefore = (nearestBefore === undefined || ownBefore === undefined)
        ? gapNow : nearestBefore - ownBefore.meters;
      const payLine = input.payLine ?? 3;
      commands.push({
        kind: 'gap',
        at: { x: Math.round(vp.width * 0.05), y: Math.round(vp.height * 0.74) },
        meters: gapNow,
        // ★詰めていれば正。**離されていれば負**（そこも読めなければ意味がない）
        closingMps: (gapBefore - gapNow) / dt,
        toGo: Math.max(0, ahead.length - (payLine - 1)),
      });

      /**
       * ★**ペース**（V-16 ①）。脚質と対で初めて意味を持ちます。
       *   速いペースなら前が止まり、遅いペースなら前が残ります。
       */
      if (input.pace !== undefined) {
        commands.push({
          kind: 'pace',
          at: { x: Math.round(vp.width * 0.05), y: Math.round(vp.height * 0.66) },
          pace: input.pace,
        });
      }
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
