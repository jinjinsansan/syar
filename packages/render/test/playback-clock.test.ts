import { describe, expect, it } from 'vitest';
import { nextShownTime, PLAYBACK_STEP_CAP_SEC } from '../src/playback-clock.js';

/**
 * ★**画面の時計を 1 コマで大きく飛ばさない**（★2026-10-03・オーナー「芝・ダートが 逆回転・超高速」）。
 *   ★コマ落ち 0.2〜0.4 秒で 芝が 1 コマ 3〜6m 進み ★刈り目の縞（8〜12m 周期）が逆に流れて見えた。
 */
/** ★壁の時計のコマの間（秒）の列を流し、★画面の時刻の 1 コマごとの進みを返す */
function play(gaps: readonly number[]): { advances: number[]; final: number; target: number } {
  let shown = 0, target = 0;
  const advances: number[] = [];
  for (const g of gaps) {
    target += g;
    const next = nextShownTime(shown, target, g);
    advances.push(next - shown);
    shown = next;
  }
  return { advances, final: shown, target };
}

describe('★画面の時計', () => {
  it('★60 コマ・30 コマの端末では 壁の時計どおり（★遅れない）', () => {
    for (const g of [1 / 60, 1 / 45, 1 / 30]) {
      const r = play(Array.from({ length: 300 }, () => g));
      expect(r.target - r.final).toBeLessThan(1e-9);
      expect(Math.max(...r.advances)).toBeCloseTo(g, 9);
    }
  });

  it('🔴 ★0.3 秒のコマ落ちでも 1 コマで 1/30 秒より進めない・★2 秒以内に追いつく（★対照: 壁の時計どおりなら 0.3 秒進む）', () => {
    const gaps = [...Array.from({ length: 60 }, () => 1 / 60), 0.3, ...Array.from({ length: 180 }, () => 1 / 60)];
    const r = play(gaps);
    expect(Math.max(...r.advances)).toBeLessThanOrEqual(PLAYBACK_STEP_CAP_SEC * 1.2 + 1e-9);
    /** ★追いつくまでの速さは 2 割増しまで（★超高速にしない） */
    expect(Math.max(...r.advances.slice(61))).toBeLessThanOrEqual((1 / 60) * 1.2 + 1e-9);
    /** ★0.3 秒の後 2 秒（120 コマ）で追いつく */
    let shown = 0, target = 0;
    gaps.slice(0, 61 + 120).forEach((g) => { target += g; shown = nextShownTime(shown, target, g); });
    expect(target - shown).toBeLessThan(1e-9);
    expect(gaps.reduce((a, b) => Math.max(a, b), 0)).toBe(0.3);
  });

  it('★1 秒を超える遅れ（★タブを裏に回していた）は 取り戻さず合わせる・★時計が戻ったら合わせる', () => {
    expect(nextShownTime(10, 12.5, 2.5)).toBe(12.5);
    expect(nextShownTime(10, 4, 0.016)).toBe(4);
  });

  it('🔴 ★0.1 秒までの 少し重いコマ（★60ms）が続いても ゆっくりにならない（★残り 70m のトーンダウン・2026-10-03）', () => {
    const r = play(Array.from({ length: 60 }, () => 0.06));
    expect(r.target - r.final).toBeLessThan(1e-9);
    expect(Math.min(...r.advances)).toBeCloseTo(0.06, 9);
  });
});
