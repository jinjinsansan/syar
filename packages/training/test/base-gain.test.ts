/**
 * ★`BASE_GAIN` を振る舞いで守る（変異試験 CAL-BASE_GAIN）
 *
 * 【なぜ要るか】
 *   変異試験を流したら、`BASE_GAIN` は **値照合テストしか落ちていません**でした:
 *     × §7.2/§7.3 の写しが正典と一致する > BASE_GAIN と headroom
 *   ★`toBe(7.8)` は摂動すれば必ず落ちるので、「守られている」とは言えません（R-14）。
 *
 * 【何を固定するか】
 *   D-048: **動機は差**。放置した馬と適切に育てた馬の差が、デイリー来訪の動機です。
 *   正典 §7.3 の既定値 12 に戻すと、**放置でも 87% まで開放**され、差が縮みます。
 *   → 「**放置だけでは上限近くまで開放されない**」を固定します。
 *
 * ★これは値の照合ではありません。`BASE_GAIN` を通した**週送りの結果**を見ています。
 */
import { describe, expect, it } from 'vitest';
import { ABILITY_KEYS, deriveRng, type AbilityKey, type Rng } from '@star/sim-engine';
import { LIFECYCLE_WEEKS } from '@star/scheduler';
import { advanceWeek, initialState, type HorseTraits, type MenuId, type TrainingState } from '../src/index.js';

const rec = (v: number): Record<AbilityKey, number> =>
  Object.fromEntries(ABILITY_KEYS.map((k) => [k, v])) as Record<AbilityKey, number>;

/** キャリアを通して、最終的な開放率（現在能力 ÷ 素質）を返す */
function finalUnlock(menuOf: (week: number, fatigue: number) => MenuId, seed: number): number {
  const traits: HorseTraits = {
    sex: 'male', growth: 'normal',
    // ★故障を止める。故障は素質を削るので、成長そのものを見たいここでは邪魔になる
    injuryRateMult: 0, birthTemper: 50,
  };
  let s: TrainingState = {
    ...initialState({ potential: rec(700), current: rec(210), durability: 650, temper: 50 }),
    ageWeeks: LIFECYCLE_WEEKS.trainableFrom,
  };
  while (s.retirement === null) {
    const w = s.ageWeeks;
    s = advanceWeek({
      state: s, traits, menu: menuOf(w, s.fatigue), enableEvents: false,
      rngFor: (st: number): Rng => deriveRng(seed, st, w),
    }).state;
  }
  return ABILITY_KEYS.reduce((a, k) => a + s.current[k] / s.potential[k], 0) / ABILITY_KEYS.length;
}

const neglect = (): MenuId => 'light';
const balanced = (w: number, f: number): MenuId => {
  if (f >= 70) return 'rest';
  const c = w % 4;
  return c === 0 ? 'hard' : c === 1 ? 'hill' : c === 2 ? 'wood' : 'light';
};

describe('★D-048 育成の動機は「差」（BASE_GAIN を振る舞いで守る）', () => {
  it('★放置だけでは上限近くまで開放されない', () => {
    const u = finalUnlock(neglect, 999);
    // ★実測 68.2%。正典の既定値 12 に戻すと 87% まで上がる。
    //   80% を閾値にすると、どちらの側にも余裕がある
    expect(u).toBeLessThan(0.80);
    // ★下側も見る。低すぎると「放置しても育つ」ではなく「何をしても育たない」になる
    expect(u).toBeGreaterThan(0.50);
  });

  it('★適切に育てた馬は放置より明確に上（動機が成立する）', () => {
    const n = finalUnlock(neglect, 999);
    const b = finalUnlock(balanced, 999);
    expect(b).toBeGreaterThan(n);
    // ★差が 10pt 以上。縮むとデイリー来訪の動機が消える（D-048）
    expect(b - n).toBeGreaterThan(0.10);
  });

  it('★上限は超えない（B-4 の不変条件は成長でも保たれる）', () => {
    expect(finalUnlock(balanced, 999)).toBeLessThanOrEqual(1);
    expect(finalUnlock(neglect, 12345)).toBeLessThanOrEqual(1);
  });
});
