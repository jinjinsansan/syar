/**
 * ★描画抽象化（正典 §12.8）と C-5（同じ seed から同じ映像）
 *
 * 【なぜ配列を比べるのか】
 *   画面を比べる検査は環境（フォント・GPU・色空間）で揺れます。
 *   **描画コマンドの配列なら揺れません。** 絵が無くても今日から測れます。
 */
import { describe, it, expect } from 'vitest';
import { sceneAt, sceneFrames, type PositionModel, type SceneInput, type HorseAt } from '../src/index.js';

/** ★検査用の位置モデル。Q-P4-06 が未裁定なので、**本物ではありません** */
const model = (n: number): PositionModel => ({
  raceSec: 100,
  distanceMeter: 1600,
  at(sec) {
    const out: HorseAt[] = [];
    for (let g = 1; g <= n; g += 1) {
      const speed = 16 + g * 0.01;
      out.push({ gate: g, meters: sec * speed, staminaRatio: Math.max(0, 1 - sec / 120) });
    }
    return out;
  },
});

const input = (n = 8): SceneInput => ({
  model: model(n),
  viewport: { width: 640, height: 360, trackTop: 200, laneHeight: 14 },
  ownGate: 3,
  silkOf: (g) => `silk-${g}`,
  gallopFrames: 4,
});

describe('★§12.8 描画抽象化', () => {
  it('★同じ入力から同じ描画コマンドが出る（C-5 の核）', () => {
    const a = sceneFrames(input(), 30);
    const b = sceneFrames(input(), 30);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('★対照: 入力が違えば違う（上の検査が空振りでない）', () => {
    const a = JSON.stringify(sceneFrames(input(8), 30));
    const b = JSON.stringify(sceneFrames(input(9), 30));
    expect(a).not.toBe(b);
  });

  it('★描く順序が馬番で固定される（同着付近で順序が揺れない）', () => {
    // 全馬が同じ位置でも、コマンドの並びは馬番順
    const same: PositionModel = {
      raceSec: 10, distanceMeter: 1600,
      at: () => [3, 1, 2].map((g) => ({ gate: g, meters: 500, staminaRatio: 1 })),
    };
    const f = sceneAt({ ...input(), model: same }, 5);
    const gates = f.commands.filter((c) => c.kind === 'sprite').map((_c, i) => i);
    expect(gates.length).toBe(3);
    // 勝負服の並びで馬番順を確認する
    const silks = f.commands.filter((c) => c.kind === 'sprite').map((c) => (c as { silk?: string }).silk);
    expect(silks).toEqual(['silk-1', 'silk-2', 'silk-3']);
  });

  it('★スタミナゲージは自馬にのみ出る（§12.6）', () => {
    const withOwn = sceneAt(input(), 10).commands.filter((c) => c.kind === 'gauge');
    expect(withOwn.length).toBe(1);
    const noOwn = sceneAt({ ...input(), ownGate: undefined }, 10).commands.filter((c) => c.kind === 'gauge');
    // ★両側（R-2）。自馬が無ければ出ない
    expect(noOwn.length).toBe(0);
  });

  it('★ギャロップのフレームが範囲外を指さない', () => {
    for (const frames of [4, 5, 6]) {
      for (const sec of [0, 0.1, 33.3, 99.9, 100]) {
        const f = sceneAt({ ...input(), gallopFrames: frames }, sec);
        for (const c of f.commands) {
          if (c.kind !== 'sprite') continue;
          expect(c.sprite.frame).toBeGreaterThanOrEqual(0);
          expect(c.sprite.frame).toBeLessThan(frames);
        }
      }
    }
  });

  it('★速い馬ほど脚が速く回る（時刻ではなく距離でフレームを決めている）', () => {
    // 同じ時刻で、走った距離が違えばフレームも違いうる
    const fast: PositionModel = {
      raceSec: 10, distanceMeter: 1600,
      at: () => [
        { gate: 1, meters: 0, staminaRatio: 1 },
        { gate: 2, meters: 3.5, staminaRatio: 1 },
      ],
    };
    const f = sceneAt({ ...input(), model: fast, gallopFrames: 4 }, 1);
    const sprites = f.commands.filter((c) => c.kind === 'sprite');
    expect(sprites[0]!.sprite.frame).not.toBe(sprites[1]!.sprite.frame);
  });

  it('★fps が不正なら黙って進まない', () => {
    expect(() => sceneFrames(input(), 0)).toThrow();
    expect(() => sceneFrames(input(), Number.NaN)).toThrow();
  });
});
