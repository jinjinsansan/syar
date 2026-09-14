/**
 * ★**真横の直線だけで緊張を上げる部品**（★2026-09-14・`race-climax-hud.ts`）
 *
 * ★守るもの:
 *   ★カウントダウン … 残り 200m より手前では出さない ／ 決勝線を越えたら消える
 *   ★周辺の減光   … 残り 100m より手前では 0 ／ 脚さばきを隠さない強さ（★最大 0.32）
 *   ★HUD の濃さ   … 数を減らさず 1 → 0.4
 *   ★勢い         … 段階だけ（★0〜3）・★全馬の中央との差で決める
 *   ★写真判定     … 着差の言葉がクビ以内のときだけ出す（★言葉は渡した関数から引く）
 */
import { describe, it, expect } from 'vitest';
import {
  goalCountdownAlpha, drawGoalCountdown, GOAL_COUNTDOWN_FROM_M,
  climaxVignetteAlpha, CLIMAX_VIGNETTE_MAX_ALPHA, CLIMAX_VIGNETTE_FROM_M,
  climaxHudFade, CLIMAX_HUD_MIN_ALPHA,
  momentumLevels, photoFinishOf, PHOTO_FINISH_LABELS, MOMENTUM_FROM_M,
} from '../src/race-climax-hud.js';
import { CONVERGE_END_M } from '../src/formation.js';

function recorder() {
  const ops: string[] = [];
  const target: Record<string, unknown> = {
    fillText: (t: string) => ops.push(`text:${t}`),
    strokeText: () => undefined,
    measureText: () => ({ width: 40 }),
    fillRect: () => ops.push('rect'),
  };
  const ctx = new Proxy(target, {
    get: (obj, key) => (key in obj ? obj[key as string] : key === 'globalAlpha' ? 1 : () => undefined),
    set: (obj, key, value) => { obj[key as string] = value; return true; },
  });
  return { ctx, ops };
}
const FONT = (px: number): string => `${px}px sans-serif`;

describe('★カウントダウン', () => {
  it('★残り 200m より手前では出さない・★決勝線を越えたら消える', () => {
    expect(goalCountdownAlpha(400)).toBe(0);
    expect(goalCountdownAlpha(GOAL_COUNTDOWN_FROM_M)).toBe(0);
    expect(goalCountdownAlpha(190)).toBeGreaterThan(0);
    expect(goalCountdownAlpha(150)).toBe(1);
    expect(goalCountdownAlpha(0)).toBe(0);
    expect(goalCountdownAlpha(-3)).toBe(0);
    expect(goalCountdownAlpha(Number.NaN)).toBe(0);
  });

  it('★出ないときは 1 文字も描かない（★対照: 出るときは数字を描く）', () => {
    const far = recorder();
    drawGoalCountdown(far.ctx as never, FONT, { viewport: { width: 1280, height: 720 }, metersLeft: 300 });
    expect(far.ops).toEqual([]);
    const near = recorder();
    drawGoalCountdown(near.ctx as never, FONT, { viewport: { width: 1280, height: 720 }, metersLeft: 86.4 });
    expect(near.ops).toContain('text:87');
  });
});

describe('★周辺の減光', () => {
  it('★残り 100m より手前では 0・★最大でも脚を隠さない濃さ・★決勝線を越えたら 0', () => {
    expect(climaxVignetteAlpha(150)).toBe(0);
    expect(climaxVignetteAlpha(CLIMAX_VIGNETTE_FROM_M)).toBe(0);
    expect(climaxVignetteAlpha(60)).toBeGreaterThan(0);
    expect(climaxVignetteAlpha(60)).toBeLessThan(CLIMAX_VIGNETTE_MAX_ALPHA);
    expect(climaxVignetteAlpha(10)).toBeCloseTo(CLIMAX_VIGNETTE_MAX_ALPHA, 9);
    expect(climaxVignetteAlpha(0)).toBe(0);
    expect(CLIMAX_VIGNETTE_MAX_ALPHA).toBeLessThanOrEqual(0.35);
  });
});

describe('★HUD を濃さで下げる', () => {
  it('★1 → 0.4（★0 にはしない＝数を減らさない）', () => {
    expect(climaxHudFade(400)).toBe(1);
    expect(climaxHudFade(250)).toBe(1);
    const mid = climaxHudFade(225);
    expect(mid).toBeLessThan(1);
    expect(mid).toBeGreaterThan(CLIMAX_HUD_MIN_ALPHA);
    expect(climaxHudFade(200)).toBeCloseTo(CLIMAX_HUD_MIN_ALPHA, 9);
    expect(climaxHudFade(10)).toBeCloseTo(CLIMAX_HUD_MIN_ALPHA, 9);
  });
});

describe('★勢い', () => {
  it('★出し始めは寄せが終わる地点と同じ（★レビュー側 Q-R8）', () => {
    expect(MOMENTUM_FROM_M).toBe(CONVERGE_END_M);
  });

  it('★段階は 0〜3 だけ・★全馬の中央の速さとの差で決まる', () => {
    const ago = [1, 2, 3, 4, 5].map((g) => ({ gate: g, meters: 1400 }));
    /** ★0.5 秒で 8.0 / 8.05 / 8.3 / 8.5 / 7.5 m 進んだ ＝ 16.0 / 16.1 / 16.6 / 17.0 / 15.0 m/s */
    const now = [
      { gate: 1, meters: 1408.0 }, { gate: 2, meters: 1408.05 }, { gate: 3, meters: 1408.3 },
      { gate: 4, meters: 1408.5 }, { gate: 5, meters: 1407.5 },
    ];
    const lv = momentumLevels(now, ago, 0.5);
    expect(lv.get(2)).toBe(1);   // ★中央（16.1）
    expect(lv.get(1)).toBe(1);   // ★−0.1
    expect(lv.get(3)).toBe(2);   // ★+0.5
    expect(lv.get(4)).toBe(3);   // ★+0.9
    expect(lv.get(5)).toBe(0);   // ★−1.1
    for (const v of lv.values()) expect([0, 1, 2, 3]).toContain(v);
  });

  it('★全馬が同じだけ減速しても「全員が落ちている」とは出さない', () => {
    const ago = [1, 2, 3].map((g) => ({ gate: g, meters: 1500 }));
    const now = [1, 2, 3].map((g) => ({ gate: g, meters: 1507 }));
    expect([...momentumLevels(now, ago, 0.5).values()]).toEqual([1, 1, 1]);
  });
});

describe('★写真判定の止め絵', () => {
  /** ★着順ボードの境目（★秒差）と同じ形の写し。★本物は `@star/race-engine` の `marginLabel` */
  const label = (gapSec: number): string =>
    gapSec <= 0 ? '同着' : gapSec <= 0.03 ? 'ハナ' : gapSec <= 0.06 ? 'アタマ' : gapSec <= 0.1 ? 'クビ' : '1/2馬身';

  it('★クビ以内なら出す・★それより離れていれば出さない', () => {
    const near = photoFinishOf([{ gate: 3, meters: 1600 }, { gate: 7, meters: 1599.7 }], 16, label);
    expect(near?.show).toBe(true);
    expect(near?.label).toBe('ハナ');
    const far = photoFinishOf([{ gate: 3, meters: 1600 }, { gate: 7, meters: 1596 }], 16, label);
    expect(far?.show).toBe(false);
    expect(PHOTO_FINISH_LABELS).toEqual(['同着', 'ハナ', 'アタマ', 'クビ']);
  });

  it('★1〜2 着の差は ★渡した並びの順ではなく、★位置で決める', () => {
    const shuffled = photoFinishOf([{ gate: 7, meters: 1599.7 }, { gate: 9, meters: 1590 }, { gate: 3, meters: 1600 }], 16, label);
    expect(shuffled?.gapM).toBeCloseTo(0.3, 9);
  });

  it('★1 頭しかいなければ判定しない', () => {
    expect(photoFinishOf([{ gate: 1, meters: 1600 }], 16, label)).toBeUndefined();
  });
});
