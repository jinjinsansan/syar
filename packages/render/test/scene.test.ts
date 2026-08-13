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

  it('★描く順序が「位置」で変わらない（同着付近で順序が揺れない）', () => {
    /**
     * ★**この検査の目的は「馬番順であること」ではありません。**
     *   **位置で順序が変わらないこと**です（同着付近で描画コマンドが揺れると C-5 が崩れる）。
     *
     *   ⚠️ 順序は **段（奥→手前）→ 馬番** になりました。
     *      実際の中継は**手前の馬が奥を隠す**ので、馬群に見せるにはこの順序が要ります。
     *      段も馬番も**レース中に変わらない**ので、C-5 の目的は保たれます。
     */
    const silksAt = (meters: (g: number) => number): (string | undefined)[] => {
      const m: PositionModel = {
        raceSec: 10, distanceMeter: 1600,
        at: () => [3, 1, 2].map((g) => ({ gate: g, meters: meters(g), staminaRatio: 1 })),
      };
      return sceneAt({ ...input(), model: m }, 5).commands
        .filter((c) => c.kind === 'sprite').map((c) => (c as { silk?: string }).silk);
    };
    const allSame = silksAt(() => 500);
    expect(allSame.length).toBe(3);
    // ★位置を入れ替えても、描く順序は1つも変わらない
    expect(silksAt((g) => 500 + g * 30)).toEqual(allSame);
    expect(silksAt((g) => 500 - g * 30)).toEqual(allSame);
    expect(silksAt((g) => (g === 2 ? 900 : 100))).toEqual(allSame);
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
