/**
 * ★**被写体ブラー**（設計 1-2・参考映像 1.4）が、絵として成立する形で出ていることを留める
 *
 * 【参考で起きていること（`out/judge/ref-size.png` 104s を実見）】
 *   馬体が丸ごと流れ、埒とゴール板の柱は止まっています。カメラぶれではありません。
 *
 * 【★ここで見ているのは「見た目」ではなく、見た目を壊す 3 つの壊れ方です】
 *   ① 速度 0（ゲート待機・ゴール後）で尾を引く → 止まっている馬がぶれる
 *   ② 芯が不透明にならない → **馬が透ける**（一律 `1/n` だと 0.63 にしかならない）
 *   ③ 枚数を固定にする → 寄ったカットで残像が**粒（階段）**に見える
 *   ④ 尾が片側だけ → **前縁だけ硬い**（逐次平均 `1/(n-j)` にすると最後の 1 枚が α=1 になる）
 *   ★①〜④ はどれも「ブラーが出ている」ことでは検出できません（R-16: 通ってしまうゲート）。
 */
import { describe, it, expect } from 'vitest';
import { ovalCourse } from '../src/course.js';
import { resolveBroadcastV2Scene } from '../src/broadcast-v2-scene.js';
import { drawPerspectiveHorses, MOTION_BLUR_CORE_COVER, MOTION_BLUR_STEP_PX } from '../src/perspective-draw.js';
import { MOTION_BLUR_EXPOSURE_SEC, MOTION_BLUR_SAMPLES } from '../src/broadcast-v2.js';

const course = ovalCourse(1600, { widthM: 20, turn: 'left' });

/** 馬の描画呼び出しだけを、そのときの x とαごと記録する画布 */
function recorder() {
  const draws: { x: number; alpha: number }[] = [];
  const state = { globalAlpha: 1 };
  const target: Record<string, unknown> = {
    // 引数 9 個の drawImage（馬本体）だけを拾う。影・芝片は別の呼び方をする
    drawImage: (...a: unknown[]) => {
      if (a.length === 9) draws.push({ x: a[5] as number, alpha: state.globalAlpha });
    },
    save: () => undefined, restore: () => undefined, transform: () => undefined,
    beginPath: () => undefined, fill: () => undefined, ellipse: () => undefined,
  };
  const ctx = new Proxy(target, {
    get: (obj, key) => (key === 'globalAlpha' ? state.globalAlpha : (key in obj ? obj[key as string] : () => undefined)),
    set: (obj, key, value) => {
      if (key === 'globalAlpha') state.globalAlpha = value as number; else obj[key as string] = value;
      return true;
    },
  });
  return { ctx, draws };
}

const horses = [{ gate: 1, s: 1200, w: 6, staminaRatio: 1 }];
const scene = resolveBroadcastV2Scene(course, horses, { width: 1280, height: 720 }, false,
  { forceShotId: 'homestretch-side' });

/** 1 頭だけを描き、本体の描画呼び出しを取り出す */
/**
 * ★既定は**本番と同じ値**を使う。ここに数字を書くと、画面と別の条件で測ることになる（R-30）。
 * ⚠️ ★実際に踏みました: 露光を 1/60 と直書きしていたので、本番が 1/200 に変わったあとも
 *    検査だけ 1/60 のまま測り続け、**上限を下げた瞬間に落ちました**（落ちたのは幸い）。
 */
function drawOnce(speedMps: number, samples = MOTION_BLUR_SAMPLES, exposureSec = MOTION_BLUR_EXPOSURE_SEC) {
  const { ctx, draws } = recorder();
  drawPerspectiveHorses(ctx as never, course, scene.camera, horses, {
    sheet: 'sheet' as never, sheetWidth: 800, spec: { frames: 8, cellH: 100 } as never,
    fieldSize: 12, frameOf: () => 0, frameRoleOf: () => 'frame-1', distanceMeter: 1600,
    motionBlur: { exposureSec, samples, speedMpsOf: () => speedMps },
  });
  return draws;
}

describe('被写体ブラー', () => {
  it('★止まっている馬は 1 枚だけ・不透明（①）', () => {
    const draws = drawOnce(0);
    expect(draws).toHaveLength(1);
    expect(draws[0]!.alpha).toBeCloseTo(1, 6);
  });

  it('★走っている馬は進行方向の後ろへ尾を引く', () => {
    const draws = drawOnce(16);
    expect(draws.length).toBeGreaterThan(2);
    const head = draws[draws.length - 1]!.x;
    const tip = draws[0]!.x;
    expect(tip).not.toBeCloseTo(head, 1);
    // 尾の途中は端の間に収まる（＝一直線に並んでいる）
    for (const d of draws) expect(d.x).toBeGreaterThanOrEqual(Math.min(tip, head) - 1e-6);
    for (const d of draws) expect(d.x).toBeLessThanOrEqual(Math.max(tip, head) + 1e-6);
  });

  it('★芯は不透明・端は薄い（②④）', () => {
    const draws = drawOnce(16);
    /**
     * ★全標本が覆う「芯」の濃さ ＝ 1 - Π(1-α)。ここが 1 に近くないと**馬が透けます**。
     *   ⚠️ 一律 1/n だと (1-1/n)^n ≒ 0.37 が残ります。
     */
    let clear = 1;
    for (const d of draws) clear *= 1 - d.alpha;
    expect(1 - clear).toBeCloseTo(MOTION_BLUR_CORE_COVER, 6);

    /**
     * ★**どの 1 枚も単独では薄い**こと（④）。1 枚でも α=1 があると、
     *   そこだけ完全に不透明になり「前縁だけ硬い」絵になります。
     */
    for (const d of draws) expect(d.alpha).toBeLessThan(0.5);
    // 重みは全標本で等しい（＝掃いた帯が均一に濃くなる）
    for (const d of draws) expect(d.alpha).toBeCloseTo(draws[0]!.alpha, 9);
  });

  it('★尾は現在位置を中心に前後へ伸びる（④）', () => {
    const still = drawOnce(0)[0]!.x;
    const draws = drawOnce(16).map((d) => d.x);
    const min = Math.min(...draws), max = Math.max(...draws);
    // 止まっているときの位置が、掃いた帯のほぼ中央にある
    expect((min + max) / 2).toBeCloseTo(still, 6);
    expect(min).toBeLessThan(still);
    expect(max).toBeGreaterThan(still);
  });

  it('★残像が粒に見えない — 標本の間隔が目標以下（③）', () => {
    const draws = drawOnce(16);
    const span = Math.abs(draws[draws.length - 1]!.x - draws[0]!.x);
    const step = span / (draws.length - 1);
    expect(step).toBeLessThanOrEqual(MOTION_BLUR_STEP_PX + 1e-6);
    /**
     * ★対照: 上限を 3 枚に絞ると間隔が目標を**超える**こと。
     *   これが超えなければ、この検査は「尾が短いだけ」を見ていることになります（R-21）。
     */
    const coarse = drawOnce(16, 3);
    const coarseStep = Math.abs(coarse[coarse.length - 1]!.x - coarse[0]!.x) / (coarse.length - 1);
    expect(coarseStep).toBeGreaterThan(MOTION_BLUR_STEP_PX);
  });

  /**
   * ★**画面外の馬は描かない**（ブラーと対で入れた間引き）
   *
   *   ブラーは 1 頭あたりの描画枚数を数十倍にします。画面外まで描いていると、
   *   その費用がそのまま頭数ぶん乗ります。
   *   ⚠️ ただし**切り詰めすぎると画面端で馬が消えます**。両側を押さえます（R-2）。
   */
  it('★画面外の馬は描かず、画面内の馬は描く', () => {
    const drawCountAt = (s: number): number => {
      const { ctx, draws } = recorder();
      const one = [{ gate: 1, s, w: 6, staminaRatio: 1 }];
      drawPerspectiveHorses(ctx as never, course, scene.camera, one, {
        sheet: 'sheet' as never, sheetWidth: 800, spec: { frames: 8, cellH: 100 } as never,
        fieldSize: 12, frameOf: () => 0, frameRoleOf: () => 'frame-1', distanceMeter: 1600,
      });
      return draws.length;
    };
    // 注視点（1200m）にいる馬は描かれる
    expect(drawCountAt(1200)).toBe(1);
    // ★60m 後ろは、この寄り（横 8m 弱の視野）では完全に画面外
    expect(drawCountAt(1140)).toBe(0);
    // ★対照: 間引きが「常に 0」ではないこと。少し外れただけの馬は余白のぶん残る
    expect(drawCountAt(1197)).toBe(1);
  });

  it('★引いたカットでは枚数が減る（尾が短いので粒に見えない）', () => {
    const wide = resolveBroadcastV2Scene(course, horses, { width: 1280, height: 720 }, false,
      { forceShotId: 'finish-line' });
    const { ctx, draws } = recorder();
    drawPerspectiveHorses(ctx as never, course, wide.camera, horses, {
      sheet: 'sheet' as never, sheetWidth: 800, spec: { frames: 8, cellH: 100 } as never,
      fieldSize: 12, frameOf: () => 0, frameRoleOf: () => 'frame-1', distanceMeter: 1600,
      motionBlur: { exposureSec: MOTION_BLUR_EXPOSURE_SEC, samples: MOTION_BLUR_SAMPLES, speedMpsOf: () => 16 },
    });
    // finish-line（26%）は homestretch-side（53%）より px/m が小さい → 尾も枚数も少ない
    expect(draws.length).toBeLessThan(drawOnce(16).length);
  });
});
