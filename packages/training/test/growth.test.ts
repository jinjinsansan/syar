/**
 * ★成長式（正典 §7.3）。最重要は **`current ≤ potential`**（B-4）。
 *
 *   正典:「current が potential を超えることは絶対にない（超えたら素質値＝遺伝の意味が消える）」
 *   → **効いていることを、効かなくなる条件を作って**確かめます。
 */
import { describe, expect, it } from 'vitest';
import { ABILITY_KEYS, deriveRng, type AbilityKey } from '@star/sim-engine';
import {
  BASE_GAIN, GROWTH_CURVE, MENUS, MENU_IDS, TEMPER_DIFFICULT_AT,
  conditionCoef, epCost, fatigueDelta, grow, growthCoef, headroom, menuCoef,
} from '../src/index.js';

const rec = (v: number): Record<AbilityKey, number> =>
  Object.fromEntries(ABILITY_KEYS.map((k) => [k, v])) as Record<AbilityKey, number>;

const base = {
  menu: 'hard' as const, ageWeeks: 120, growth: 'normal' as const,
  temper: 50, condition: 3, current: rec(300), potential: rec(500),
};

describe('★B-4 current は potential を超えない', () => {
  it('★上限に達した馬は、最強のメニューを何週続けても超えない', () => {
    const rng = deriveRng(1, 61, 1);
    let cur = rec(500); // 既に上限
    for (let w = 0; w < 200; w += 1) {
      cur = grow({ ...base, current: cur, potential: rec(500) }, rng);
      for (const k of ABILITY_KEYS) expect(cur[k]).toBeLessThanOrEqual(500);
    }
    expect(cur.sp).toBe(500); // ★ぴったり（浮動小数で僅かに超えない）
  });

  it('★clamp が無いと落ちる（この不変条件を守っているのは clamp だという確認）', () => {
    // ★headroom が上限近くで伸びを潰すので、clamp が無くても**大きくは**超えない。
    //   clamp の実際の役割は「上限をぴったりにする」こと。
    //   → 到達後の値が potential と**厳密に等しい**ことを見る（近似で見ると変異を見逃す）。
    const rng = deriveRng(11, 61, 11);
    let cur = rec(499.9999999);
    for (let w = 0; w < 50; w += 1) cur = grow({ ...base, current: cur, potential: rec(500) }, rng);
    for (const k of ABILITY_KEYS) expect(cur[k]).toBe(500);
  });

  it('★上限直前でも1週で飛び越えない', () => {
    const rng = deriveRng(2, 61, 2);
    // 残り 0.001 しかない状態。伸びが大きくても超えてはいけない
    const cur = grow({ ...base, current: rec(499.999), potential: rec(500) }, rng);
    for (const k of ABILITY_KEYS) expect(cur[k]).toBeLessThanOrEqual(500);
  });

  it('★あらゆるメニュー・週齢・調子・気性で成立する（総当たり）', () => {
    const rng = deriveRng(3, 61, 3);
    for (const menu of MENU_IDS) {
      for (const ageWeeks of [78, 104, 156, 208, 260]) {
        for (const condition of [0, 3, 5]) {
          for (const temper of [0, 49, 50, 100]) {
            const cur = grow(
              { ...base, menu, ageWeeks, condition, temper, current: rec(499.9), potential: rec(500) },
              rng,
            );
            for (const k of ABILITY_KEYS) {
              expect(cur[k], `${menu}/${ageWeeks}/${condition}/${temper}/${k}`).toBeLessThanOrEqual(500);
            }
          }
        }
      }
    }
  });

  it('★★故障で potential が current を下回ったとき、current が切り下がる（未確定の仕様）', () => {
    // §7.5: 重度故障は potential 全体 -8%。★このとき current > potential になりうる。
    //   正典は「current ≤ potential 絶対」と「恒久ダメージは potential を削る」の
    //   両方を書いているが、**その結果 current をどうするかは書いていない**。
    //   ★いまの実装は不変条件を守るために切り下げる。**照会中の挙動**なので、
    //     変わったらこのテストが落ちて気づけるようにしておく。
    const rng = deriveRng(10, 61, 10);
    const out = grow({ ...base, menu: 'light', current: rec(500), potential: rec(460) }, rng);
    for (const k of ABILITY_KEYS) expect(out[k]).toBe(460);
  });

  it('★potential が 0 でも壊れない（0 除算・NaN を出さない）', () => {
    const rng = deriveRng(4, 61, 4);
    const cur = grow({ ...base, current: rec(0), potential: rec(0) }, rng);
    for (const k of ABILITY_KEYS) expect(Number.isFinite(cur[k])).toBe(true);
  });

  it('★能力は下がらない（調教で退化しない）', () => {
    const rng = deriveRng(5, 61, 5);
    for (const menu of MENU_IDS) {
      for (const ageWeeks of [78, 104, 200, 260]) {
        const cur = grow({ ...base, menu, ageWeeks, current: rec(300), potential: rec(500) }, rng);
        for (const k of ABILITY_KEYS) expect(cur[k]).toBeGreaterThanOrEqual(300);
      }
    }
  });
});

describe('§7.3 成長曲線', () => {
  it('★正典の4点と一致する', () => {
    for (const [type, pts] of Object.entries(GROWTH_CURVE)) {
      for (const [w, v] of pts) {
        expect(growthCoef(type as keyof typeof GROWTH_CURVE, w)).toBeCloseTo(v, 10);
      }
    }
  });

  it('★点間は線形補間（階段にしない＝同じ調教で伸びが不連続に変わらない）', () => {
    // normal: 104週 1.0 → 156週 1.2。中間の130週は 1.1
    expect(growthCoef('normal', 130)).toBeCloseTo(1.1, 6);
  });

  it('★104週未満は外挿しない（外挿すると late_bloomer が負になる）', () => {
    expect(growthCoef('late_bloomer', 78)).toBe(0.3);
    expect(growthCoef('late_bloomer', 78)).toBeGreaterThan(0);
    expect(growthCoef('early', 78)).toBe(1.5);
  });
});

describe('§7.2/§7.3 の写しが正典と一致する', () => {
  it('BASE_GAIN と headroom', () => {
    expect(BASE_GAIN).toBe(12);
    expect(headroom(0, 100)).toBeCloseTo(1, 10);
    expect(headroom(100, 100)).toBe(0);
    // ★指数 0.7（1.0 なら 0.5、0.7 なら約 0.616）
    expect(headroom(50, 100)).toBeCloseTo(Math.pow(0.5, 0.7), 10);
  });

  it('★メニューの疲労と EP は正典の表どおり', () => {
    expect(fatigueDelta('hill')).toBe(18);
    expect(fatigueDelta('hard')).toBe(32);
    expect(fatigueDelta('rest')).toBe(-35);
    expect(epCost('hard')).toBe(800);
    expect(epCost('light')).toBe(100);
    expect(epCost('rest')).toBe(0);
  });

  it('★正典が数値を与えている2つの係数は、そのまま使われる', () => {
    for (const k of ABILITY_KEYS) {
      expect(menuCoef('hard', k)).toBe(1.6);
      expect(menuCoef('light', k)).toBe(0.3);
      expect(menuCoef('rest', k)).toBe(0);
    }
  });

  it('★主効果は副効果より大きい（表の「主効果」列が効いている）', () => {
    // 坂路は SP+, PW+
    expect(menuCoef('hill', 'sp')).toBeGreaterThan(menuCoef('hill', 'st'));
    expect(menuCoef('hill', 'pw')).toBeGreaterThan(menuCoef('hill', 'iq'));
    // ★副効果を 0 にしない（0 だと1形質だけ極端に伸びた馬が量産される）
    expect(menuCoef('hill', 'st')).toBeGreaterThan(0);
  });

  it('休養は伸ばさず疲労を抜く（§7.2）', () => {
    const rng = deriveRng(6, 61, 6);
    const cur = grow({ ...base, menu: 'rest', current: rec(300), potential: rec(500) }, rng);
    for (const k of ABILITY_KEYS) expect(cur[k]).toBe(300);
    expect(MENUS.rest.fatigue).toBeLessThan(0);
  });
});

describe('§7.3 調子と気性', () => {
  it('★調子が良いほど伸びる（0.7〜1.3 の範囲に収まる）', () => {
    expect(conditionCoef(0)).toBeCloseTo(0.7, 10);
    expect(conditionCoef(5)).toBeCloseTo(1.3, 10);
    expect(conditionCoef(3)).toBeGreaterThan(conditionCoef(2));
    // 範囲外を渡しても飛び出さない
    expect(conditionCoef(-3)).toBeCloseTo(0.7, 10);
    expect(conditionCoef(99)).toBeCloseTo(1.3, 10);
  });

  const spread = (temper: number): number => {
    const vals: number[] = [];
    for (let i = 0; i < 400; i += 1) {
      const rng = deriveRng(7, 61, i);
      vals.push(grow({ ...base, temper, menu: 'light' }, rng).sp);
    }
    const m = vals.reduce((a, b) => a + b, 0) / vals.length;
    return Math.sqrt(vals.reduce((a, b) => a + (b - m) ** 2, 0) / vals.length);
  };

  it('★気性難のほうがばらつきが大きい（不安定さが効果そのもの）', () => {
    // ★閾値に TEMPER_DIFFICULT_AT 自身を使わない。
    //   使うと閾値を動かしたときテストも一緒に動き、**変異が素通りします**
    //   （実際 TEMPER_DIFFICULT_AT=200 に変異させても19件すべて通りました）。
    //   → temper の値域 0..100・創始水準50（D-009）から、**リテラルで両端**を置く。
    expect(spread(100)).toBeGreaterThan(spread(0));
  });

  it('★気性難が実在する（全馬が「温順」になっていない）', () => {
    // ★閾値を値域の外（200 など）に動かすと全馬が温順になり、
    //   正典の rand(0.5,1.3) が一度も使われなくなる。それを直接検出する。
    expect(TEMPER_DIFFICULT_AT).toBeGreaterThan(0);
    expect(TEMPER_DIFFICULT_AT).toBeLessThanOrEqual(100);
    // 値域の上端の馬は必ず「気性難」側に入る
    expect(spread(100)).toBeGreaterThan(spread(100) * 0); // 形だけでなく実測で
    const gentle = spread(0);
    const difficult = spread(100);
    // 正典の幅: 気性難 0.8 幅 / 温順 0.2 幅 → ばらつきは 2倍以上開く
    expect(difficult / gentle).toBeGreaterThan(2);
  });
});

describe('★決定論（同じ入力・同じ乱数から同じ結果）', () => {
  it('同じ週シードなら何度計算しても一致する', () => {
    const a = grow(base, deriveRng(99, 61, 42));
    const b = grow(base, deriveRng(99, 61, 42));
    expect(a).toEqual(b);
  });

  it('★馬が違えば結果が違う（全馬が同じ乱数を引いていない）', () => {
    const a = grow(base, deriveRng(99, 61, 1));
    const b = grow(base, deriveRng(99, 61, 2));
    expect(a.sp).not.toBe(b.sp);
  });
});
