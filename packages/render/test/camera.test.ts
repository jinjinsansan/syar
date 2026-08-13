/**
 * ★カメラ（アートバイブル §9）— **C-6 を殺さないこと**
 *
 * 【なぜこの検査が要るか】
 *   > 勝負所は、プレイヤーが仕掛ける瞬間そのものです。
 *   > ゲージが隠れる／合図が見えなくなる／遷移中にフレームが落ちる、
 *   > このどれかが起きると **V-13 は通り続けたまま**、
 *   > プレイヤーには「仕掛けても何も変わらない」ゲームになります。
 *
 *   ★**そして数字のどこにも現れません。** だから機械で見ます。
 *
 * 【★この検査が言えないこと】
 *   ここが守るのは「**描画コマンドに出ているか**」だけです。
 *   「人間に見えるか」は C-6 の3種ボットが測ります（見て判断しない）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  sceneAt, phaseOf, lanesOnScreen, SPRITE,
  type PositionModel, type SceneInput, type HorseAt, type Zoom,
} from '../src/index.js';

const DIST = 1600;
const model = (n: number): PositionModel => ({
  raceSec: 100,
  distanceMeter: DIST,
  at(sec) {
    const out: HorseAt[] = [];
    for (let g = 1; g <= n; g += 1) {
      out.push({ gate: g, meters: sec * (16 + g * 0.05), staminaRatio: Math.max(0, 1 - sec / 130) });
    }
    return out;
  },
});

const input = (zoom: Zoom, follow?: number): SceneInput => ({
  model: model(18),
  viewport: { width: 1280, height: 720, trackTop: 380, laneHeight: 40 },
  camera: { zoom, ...(follow === undefined ? {} : { followGate: follow }) },
  ownGate: 5,
  silkOf: (g) => `silk-${g}`,
  gallopFrames: 6,
});

const overlays = (z: Zoom, sec: number) =>
  sceneAt(input(z), sec).commands.filter((c) => c.kind === 'gauge' || c.kind === 'cue');

describe('★カメラがゲージと合図を隠さない（C-6 の前提）', () => {
  it('★倍率を変えても、ゲージと合図の位置が1画素も動かない', () => {
    // ★これが本題。寄りの最中に動いたら、プレイヤーは読めません
    for (const sec of [0, 20, 50, 80, 99]) {
      const wide = JSON.stringify(overlays(1, sec).map((c) => ({ ...c, ratio: undefined })));
      const near = JSON.stringify(overlays(2, sec).map((c) => ({ ...c, ratio: undefined })));
      expect(near).toBe(wide);
    }
  });

  it('★倍率を変えても、ゲージと合図が消えない', () => {
    for (const z of [1, 2] as Zoom[]) {
      for (const sec of [0, 20, 50, 80, 99]) {
        const kinds = overlays(z, sec).map((c) => c.kind).sort();
        expect(kinds).toEqual(['cue', 'gauge']);
      }
    }
  });

  it('★対照: 馬の位置は倍率で変わる（上の検査が空振りでない）', () => {
    const wide = sceneAt(input(1), 50).commands.filter((c) => c.kind === 'sprite');
    const near = sceneAt(input(2), 50).commands.filter((c) => c.kind === 'sprite');
    expect(JSON.stringify(near)).not.toBe(JSON.stringify(wide));
  });

  it('★合図は「出ていない間」も false で出る（見落としと未到達を区別できる）', () => {
    const early = sceneAt(input(1), 5).commands.find((c) => c.kind === 'cue');
    expect(early).toBeDefined();
    expect((early as { active: boolean }).active).toBe(false);
  });

  it('★局面は残り距離で決まる（§13 の 800m / 400m）', () => {
    // ★両側（R-2）。境界のどちら側も見る
    expect(phaseOf(801)).toBe('cruise');
    expect(phaseOf(800)).toBe('spurt');
    expect(phaseOf(401)).toBe('spurt');
    expect(phaseOf(400)).toBe('straight');
  });

  it('★勝負所に入ると合図が立つ', () => {
    // 自馬（gate 5）が残り 800m を切る時刻を探す
    let seen = false;
    for (let sec = 0; sec <= 100; sec += 1) {
      const own = model(18).at(sec).find((h) => h.gate === 5)!;
      const cue = sceneAt(input(1), sec).commands.find((c) => c.kind === 'cue') as { active: boolean };
      const expected = DIST - own.meters <= 800;
      expect(cue.active).toBe(expected);
      if (expected) seen = true;
    }
    // ★一度も勝負所に入らないなら、この検査は何も見ていない
    expect(seen).toBe(true);
  });

  it('★倍率は 1 と 2 だけ（非整数はピクセルアートを壊す・D-058）', () => {
    for (const bad of [0.5, 1.5, 3, 0, -1]) {
      expect(() => sceneAt({ ...input(1), camera: { zoom: bad as Zoom } }, 10)).toThrow();
    }
  });

  it('★画面に入る段数（オーナーの判断と整合する）', () => {
    expect(SPRITE.width).toBe(220);
    expect(SPRITE.height).toBe(140);
    // 720p で 220px なら 3段、440px（2×）なら 1段
    expect(lanesOnScreen(720, 1)).toBe(3);
    expect(lanesOnScreen(720, 2)).toBe(1);
    // ★18頭は入りません。カメラで選ぶ必要がある、という事実を固定します
    expect(lanesOnScreen(720, 1)).toBeLessThan(18);
  });
});

describe('★カメラの実装が、隠せない構造になっている（メタテスト）', () => {
  it('★ゲージと合図の組み立てに、倍率もカメラ中心も使っていない', () => {
    /**
     * ★コメントではなくコードを見ます。
     *   ゲージ・合図を作っている部分に `z` や `cam` が入った瞬間、
     *   **寄りの最中に動くようになります**。
     */
    const src = readFileSync(join(process.cwd(), 'packages', 'render', 'src', 'scene.ts'), 'utf8');
    const code = src.replace(new RegExp('/\\*[\\s\\S]*?\\*/', 'g'), ' ').replace(new RegExp('//.*$', 'gm'), ' ');
    const start = code.indexOf("kind: 'gauge'");
    const end = code.indexOf('return { atSec: sec');
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    const block = code.slice(start, end);
    for (const forbidden of [' z ', ' z*', 'z)', 'cam']) {
      expect(block).not.toContain(forbidden);
    }
  });
});

describe('★多層パララックス（アートバイブル §3「奥行きは速度差だけで作る」）', () => {
  const par = (sec: number) =>
    sceneAt(input(1), sec).commands.filter((c) => c.kind === 'parallax') as
      { role: string; offset: number; tileWidth: number }[];

  it('★層ごとに流れる速さが違う（全部同じなら平面になる）', () => {
    const a = par(20);
    const offs = a.map((c) => c.offset);
    // ★重複なし＝全層が違う速さ
    expect(new Set(offs).size).toBe(offs.length);
  });

  it('★手前ほど速い（空 < スタンド < ラチ < 芝）', () => {
    const byRole = new Map(par(40).map((c) => [c.role, c.offset]));
    const sky = byRole.get('sky')!;
    const stand = byRole.get('stand')!;
    const rail = byRole.get('rail')!;
    const turf = byRole.get('turf')!;
    expect(sky).toBeLessThan(stand);
    expect(stand).toBeLessThan(rail);
    expect(rail).toBeLessThan(turf);
  });

  it('★時間が進むと流れる（止まって見えない）', () => {
    const a = par(10);
    const b = par(30);
    for (let i = 0; i < a.length; i += 1) {
      expect(b[i]!.offset).toBeGreaterThan(a[i]!.offset);
    }
  });

  it('★オフセットは 0 以上（負の剰余はレンダラごとに挙動が違う）', () => {
    for (const sec of [0, 1, 50, 99]) {
      for (const c of par(sec)) expect(c.offset).toBeGreaterThanOrEqual(0);
    }
  });

  it('★倍率を変えても背景の層構成は変わらない（層が消えない）', () => {
    expect(par(30).length).toBe(
      (sceneAt(input(2), 30).commands.filter((c) => c.kind === 'parallax')).length,
    );
  });
});
