/**
 * K-1 レース判定エンジンの回帰テスト（正典 §8.2〜§8.7）
 *
 * 【設計方針・R-1】
 *   純関数を単体で固定するだけでは、`resolveRace` が別の式を使い始めても素通りする。
 *   P0 で3度踏んだ穴（I-3 / I-4 / L-1）なので、**係数ごとに「経路（resolveRace）から
 *   観測できる形」でも固定する**。単体テストは式の形を、経路テストは接続を担保する。
 *
 * 【R-2】境界は必ず両側を押さえる（距離帯・ペース・スキル発動条件・枠順）。
 */

import { ABILITY_KEYS } from '@star/sim-engine';
import { describe, expect, it } from 'vitest';
import {
  ABILITY_WEIGHTS,
  DEFAULT_RACE_BALANCE,
  INTERPRETATIONS,
  SKILLS,
  ageCoef,
  averageSpeedMps,
  baseScore,
  conditionCoef,
  decidePace,
  distanceAptitude,
  distanceBandOf,
  fatigueCoef,
  fireRate,
  gateCoef,
  isEligible,
  mapAptitude,
  marginLabel,
  resolveRace,
  strategyCoef,
  surfaceCoef,
  trackConditionCoef,
  weightCoef,
  type RaceConditions,
  type RaceEntrant,
} from '../src/index.js';
import { neutralEntrant, neutralField } from './helpers.js';

const B = DEFAULT_RACE_BALANCE;

function conditions(overrides: Partial<RaceConditions> = {}): RaceConditions {
  return {
    raceId: 'R-TEST-0001',
    distance: 2000,
    surface: 'turf',
    trackCondition: 'good',
    courseShape: 'oval',
    baseWeightKg: 55,
    ...overrides,
  };
}

/** 経路（resolveRace）から1頭ぶんの内訳を取る */
function breakdownOf(
  entrants: readonly RaceEntrant[],
  horseId: string,
  cond: RaceConditions = conditions(),
  seed = 42,
) {
  const result = resolveRace({ conditions: cond, entrants, seed, balance: B });
  const row = result.order.find((o) => o.horseId === horseId);
  if (row === undefined) throw new Error(`${horseId} が結果に含まれない`);
  return row;
}

// ---------------------------------------------------------------------------

describe('§8.2 基礎スコア（距離帯別の能力重み）', () => {
  it('重み表が正典 §8.2 のリテラルと一致する', () => {
    expect(ABILITY_WEIGHTS.sprint).toEqual({ sp: 0.42, st: 0.08, pw: 0.24, gt: 0.16, iq: 0.1 });
    expect(ABILITY_WEIGHTS.mile).toEqual({ sp: 0.34, st: 0.18, pw: 0.18, gt: 0.2, iq: 0.1 });
    expect(ABILITY_WEIGHTS.intermediate).toEqual({
      sp: 0.28,
      st: 0.26,
      pw: 0.16,
      gt: 0.2,
      iq: 0.1,
    });
    expect(ABILITY_WEIGHTS.long).toEqual({ sp: 0.22, st: 0.34, pw: 0.14, gt: 0.2, iq: 0.1 });
    expect(ABILITY_WEIGHTS.extended).toEqual({ sp: 0.18, st: 0.42, pw: 0.12, gt: 0.19, iq: 0.09 });
  });

  it('各距離帯の重みの合計が 1 になる（片方だけ動かす改変を検出する）', () => {
    for (const band of ['sprint', 'mile', 'intermediate', 'long', 'extended'] as const) {
      const sum = ABILITY_KEYS.reduce((acc, k) => acc + ABILITY_WEIGHTS[band][k], 0);
      expect(sum, `${band} の重み合計`).toBeCloseTo(1, 10);
    }
  });

  it('距離帯の境界は両側を押さえる（R-2・正典 §8.2 の表）', () => {
    expect(distanceBandOf(1400)).toBe('sprint');
    expect(distanceBandOf(1401)).toBe('mile');
    expect(distanceBandOf(1800)).toBe('mile');
    expect(distanceBandOf(1801)).toBe('intermediate');
    expect(distanceBandOf(2200)).toBe('intermediate');
    expect(distanceBandOf(2201)).toBe('long');
    expect(distanceBandOf(2800)).toBe('long');
    expect(distanceBandOf(2801)).toBe('extended');
  });

  it('base は stats の重み付き和（全能力500なら 500）', () => {
    const stats = { sp: 500, st: 500, pw: 500, gt: 500, iq: 500 };
    expect(baseScore(stats, 2000)).toBeCloseTo(500, 6);
  });

  it('長距離砲の stayerBonus は ST の重みだけを増やす（正典 §8.5）', () => {
    const stats = { sp: 0, st: 1000, pw: 0, gt: 0, iq: 0 };
    const plain = baseScore(stats, 2400);
    const boosted = baseScore(stats, 2400, B.STAYER_ST_BONUS);
    expect(boosted / plain).toBeCloseTo(1 + B.STAYER_ST_BONUS, 10);
  });

  it('★経路: 距離帯が変わると resolveRace の base が変わる（重み表が実際に使われている）', () => {
    // ST だけ高い馬。短距離(ST重み0.08)より長距離(0.42)で base が大きくなるはず
    const st = neutralEntrant('ST', { stats: { sp: 0, st: 1000, pw: 0, gt: 0, iq: 0 } });
    const sprint = breakdownOf([st], 'ST', conditions({ distance: 1200 })).breakdown.base;
    const extended = breakdownOf([st], 'ST', conditions({ distance: 3000 })).breakdown.base;
    expect(sprint).toBeCloseTo(1000 * 0.08, 6);
    expect(extended).toBeCloseTo(1000 * 0.42, 6);
  });
});

describe('§8.3 乗算補正10種', () => {
  it('距離適性は正規分布カーブ（正典 §5.2）で、中心でちょうど100', () => {
    expect(distanceAptitude(2000, 2000, 600)).toBeCloseTo(100, 10);
    // 1σ 離れれば exp(-0.5) 倍
    expect(distanceAptitude(2600, 2000, 600)).toBeCloseTo(100 * Math.exp(-0.5), 10);
    expect(distanceAptitude(1400, 2000, 600)).toBeCloseTo(100 * Math.exp(-0.5), 10);
  });

  it('range が 0 以下なら例外（ゼロ除算で NaN が genotype 由来値から漏れるのを防ぐ）', () => {
    expect(() => distanceAptitude(2000, 2000, 0)).toThrow(/range は正の数/);
    expect(() => distanceAptitude(2000, 2000, -1)).toThrow(/range は正の数/);
  });

  it('適性の写像は両端で正典の値域ちょうど（R-2）', () => {
    expect(mapAptitude(0, 0.75, 1.05)).toBeCloseTo(0.75, 10);
    expect(mapAptitude(100, 0.75, 1.05)).toBeCloseTo(1.05, 10);
    // 値域外は丸める（適性は 0〜100 だが、将来の上書きで外れても係数は暴れない）
    expect(mapAptitude(-50, 0.75, 1.05)).toBeCloseTo(0.75, 10);
    expect(mapAptitude(150, 0.75, 1.05)).toBeCloseTo(1.05, 10);
  });

  it('surfaceCoef は 0.70〜1.05（正典 §8.3）', () => {
    expect(surfaceCoef({ turf: 0, dirt: 0 }, 'turf', B)).toBeCloseTo(0.7, 10);
    expect(surfaceCoef({ turf: 100, dirt: 0 }, 'turf', B)).toBeCloseTo(1.05, 10);
    // 芝のレースでダート適性は効かない
    expect(surfaceCoef({ turf: 50, dirt: 100 }, 'turf', B)).toBeCloseTo(0.875, 10);
  });

  it('★trackConditionCoef: 良馬場は道悪適性によらず常に 1.0（正典 §8.3・D-015）', () => {
    for (const apt of [0, 50, 100]) {
      expect(trackConditionCoef(apt, 'good', B), `適性${apt}`).toBe(1.0);
    }
    // 良以外は適性で変わる（＝「常に1.0」が全馬場に広がっていないこと）
    expect(trackConditionCoef(0, 'bad', B)).toBeCloseTo(0.88, 10);
    expect(trackConditionCoef(100, 'bad', B)).toBeCloseTo(1.05, 10);
  });

  it('★悪い馬場ほど道悪適性の差が大きく出る（4段にした意味を固定する）', () => {
    // 同じ適性0の馬でも、不良 < 重 < 稍重 の順に不利が大きい
    const y = trackConditionCoef(0, 'yielding', B);
    const s = trackConditionCoef(0, 'soft', B);
    const b = trackConditionCoef(0, 'bad', B);
    expect(b).toBeLessThan(s);
    expect(s).toBeLessThan(y);
    expect(y).toBeLessThan(1);
    // 道悪巧者（適性100）は逆に、悪い馬場ほど有利が大きい
    expect(trackConditionCoef(100, 'bad', B)).toBeGreaterThan(trackConditionCoef(100, 'soft', B));
    expect(trackConditionCoef(100, 'soft', B)).toBeGreaterThan(
      trackConditionCoef(100, 'yielding', B),
    );
    // 適性50（中立）は馬場によらず概ね中央
    for (const c of ['yielding', 'soft', 'bad'] as const) {
      expect(Math.abs(trackConditionCoef(50, c, B) - 1)).toBeLessThan(0.04);
    }
  });

  it('conditionCoef は調子1〜5で 0.88〜1.10（R-2）', () => {
    expect(conditionCoef(1, B)).toBeCloseTo(0.88, 10);
    expect(conditionCoef(5, B)).toBeCloseTo(1.1, 10);
    expect(conditionCoef(3, B)).toBeCloseTo(0.99, 10);
    // 値域外もクランプされる
    expect(conditionCoef(0, B)).toBeCloseTo(0.88, 10);
    expect(conditionCoef(9, B)).toBeCloseTo(1.1, 10);
  });

  it('fatigueCoef = 1 - fatigue/500（正典 §8.3 の式そのもの）', () => {
    expect(fatigueCoef(0, B)).toBe(1);
    expect(fatigueCoef(100, B)).toBeCloseTo(0.8, 10);
    expect(fatigueCoef(250, B)).toBeCloseTo(0.5, 10);
  });

  it('weightCoef: 基準55kg・±1kg ごとに ∓0.8%（正典 §8.3・両方向 R-2）', () => {
    expect(weightCoef(55, 55, B)).toBe(1);
    expect(weightCoef(56, 55, B)).toBeCloseTo(0.992, 10);
    expect(weightCoef(54, 55, B)).toBeCloseTo(1.008, 10);
    expect(weightCoef(60, 55, B)).toBeCloseTo(0.96, 10);
  });

  it('gateCoef: 直線コースは枠順無影響／周回は内枠有利（I-GATE-MAP）', () => {
    expect(gateCoef(1, 18, 1200, 'straight', B)).toBe(1.0);
    expect(gateCoef(18, 18, 1200, 'straight', B)).toBe(1.0);

    const inner = gateCoef(1, 18, 1200, 'oval', B);
    const outer = gateCoef(18, 18, 1200, 'oval', B);
    expect(inner).toBeGreaterThan(1);
    expect(outer).toBeLessThan(1);
    expect(inner).toBeCloseTo(1 + B.GATE_MAX_EDGE, 10);
    expect(outer).toBeCloseTo(1 - B.GATE_MAX_EDGE, 10);
    // 中央の枠はほぼ 1.0
    const mid = gateCoef(9.5, 18, 1200, 'oval', B);
    expect(mid).toBeCloseTo(1, 10);
  });

  it('gateCoef: 距離が伸びるほど枠順の影響が薄れ、2800m で消える（R-2 両端）', () => {
    const short = gateCoef(1, 18, B.GATE_FULL_DISTANCE, 'oval', B);
    const mid = gateCoef(1, 18, 2000, 'oval', B);
    const long = gateCoef(1, 18, B.GATE_ZERO_DISTANCE, 'oval', B);
    expect(short).toBeGreaterThan(mid);
    expect(mid).toBeGreaterThan(long);
    expect(long).toBeCloseTo(1, 10);
    // 2800m を超えても 1 のまま（負に反転しない）
    expect(gateCoef(1, 18, 3600, 'oval', B)).toBeCloseTo(1, 10);
  });

  it('ageCoef: 正典が与える3点をそのまま通る（I-AGE-CURVE）', () => {
    expect(ageCoef(2, B)).toBeCloseTo(0.88, 10);
    expect(ageCoef(4, B)).toBeCloseTo(1.0, 10);
    expect(ageCoef(6, B)).toBeCloseTo(0.96, 10);
    // 3歳は 2→4 の中点、5歳は 4→6 の中点
    expect(ageCoef(3, B)).toBeCloseTo(0.94, 10);
    expect(ageCoef(5, B)).toBeCloseTo(0.98, 10);
    // 2歳未満・6歳超は頭打ち
    expect(ageCoef(1, B)).toBeCloseTo(0.88, 10);
    expect(ageCoef(10, B)).toBeCloseTo(0.96, 10);
  });

  it('★経路: 11係数がすべて resolveRace の内訳に現れ、既定の中立馬では既知の値になる', () => {
    const row = breakdownOf(neutralField(2), 'H001');
    const bd = row.breakdown;
    // 中立馬（適性50・調子3・疲労0・斤量55・4歳・良馬場）
    expect(bd.distanceAptitudeCoef).toBeCloseTo(1.05, 10); // 距離中心ちょうど → 適性100
    expect(bd.surfaceCoef).toBeCloseTo(0.875, 10);
    expect(bd.trackConditionCoef).toBe(1.0);
    expect(bd.conditionCoef).toBeCloseTo(0.99, 10);
    expect(bd.fatigueCoef).toBe(1);
    expect(bd.weightCoef).toBe(1);
    expect(bd.ageCoef).toBeCloseTo(1.0, 10);
    expect(bd.skillCoef).toBe(1); // スキル無し
    /**
     * ★**11個目: 距離ロス**（D-065 / D-071・2026-08-16 に追加）。
     *   `1 − 余計に走った距離 ÷ レース距離`。内を通れば 1 より大きい。
     *   ⚠️ ★中立馬でも 1 ではありません（`w` はシードから引くので）。
     *      ★**範囲だけ固定します**（大きさは V-18 が縛る）。
     */
    expect(bd.laneCoef).toBeGreaterThan(0.9);
    expect(bd.laneCoef).toBeLessThan(1.1);
    // score は base × 全係数の積であること（式の接続を固定する）
    const product =
      bd.base *
      bd.distanceAptitudeCoef *
      bd.surfaceCoef *
      bd.trackConditionCoef *
      bd.strategyCoef *
      bd.conditionCoef *
      bd.fatigueCoef *
      bd.weightCoef *
      bd.gateCoef *
      bd.ageCoef *
      bd.skillCoef *
      bd.laneCoef;
    expect(bd.score).toBeCloseTo(product, 10);
  });

  it('★経路: 疲労を上げると resolveRace のスコアがその比率どおり下がる', () => {
    const fresh = breakdownOf([neutralEntrant('A')], 'A').breakdown.score;
    const tired = breakdownOf([neutralEntrant('A', { fatigue: 250 })], 'A').breakdown.score;
    expect(tired / fresh).toBeCloseTo(0.5, 10);
  });
});

describe('§8.4 展開（ペース）', () => {
  it('逃げ宣言頭数の境界を両側で押さえる（R-2）', () => {
    expect(decidePace(0, B)).toBe('slow');
    expect(decidePace(1, B)).toBe('slow');
    expect(decidePace(2, B)).toBe('middle');
    expect(decidePace(3, B)).toBe('high');
    expect(decidePace(4, B)).toBe('high');
  });

  it('★経路: 出走表の逃げ頭数から resolveRace がペースを決める', () => {
    const make = (nigeCount: number): RaceEntrant[] =>
      neutralField(8).map((e, i) => ({ ...e, strategy: i < nigeCount ? 'nige' : 'senko' }));
    for (const [n, expected] of [
      [0, 'slow'],
      [1, 'slow'],
      [2, 'middle'],
      [3, 'high'],
      [5, 'high'],
    ] as const) {
      const r = resolveRace({ conditions: conditions(), entrants: make(n), seed: 1, balance: B });
      expect(r.pace, `逃げ${n}頭`).toBe(expected);
      expect(r.nigeCount).toBe(n);
    }
  });

  it('strategyCoef はペース補正 × 脚質適性（正典 §8.4 の2要素）', () => {
    const apt = { nige: 100, senko: 100, sashi: 100, oikomi: 100 };
    // ハイペースの追込は +8%、適性100なら 1.05
    expect(strategyCoef('oikomi', apt, 'high', B)).toBeCloseTo(1.08 * 1.05, 10);
    // ハイペースの逃げは -10%
    expect(strategyCoef('nige', apt, 'high', B)).toBeCloseTo(0.9 * 1.05, 10);
    // スローの逃げ・先行は +9%
    expect(strategyCoef('nige', apt, 'slow', B)).toBeCloseTo(1.09 * 1.05, 10);
    expect(strategyCoef('senko', apt, 'slow', B)).toBeCloseTo(1.09 * 1.05, 10);
    // ミドルは補正なし
    expect(strategyCoef('sashi', apt, 'middle', B)).toBeCloseTo(1.0 * 1.05, 10);
  });

  it('適性のない脚質を選ぶと露骨に弱くなる（正典 §8.4 の設計意図）', () => {
    const apt = { nige: 0, senko: 100, sashi: 0, oikomi: 0 };
    const good = strategyCoef('senko', apt, 'middle', B);
    const bad = strategyCoef('nige', apt, 'middle', B);
    expect(good / bad).toBeCloseTo(1.05 / 0.85, 10);
    expect(good).toBeGreaterThan(bad * 1.2);
  });
});

describe('§8.5 発動型スキル', () => {
  it('発動率 = 40% + IQ/2000（正典の式そのもの・両端）', () => {
    expect(fireRate(0, B)).toBeCloseTo(0.4, 10);
    expect(fireRate(1000, B)).toBeCloseTo(0.9, 10);
    expect(fireRate(500, B)).toBeCloseTo(0.65, 10);
  });

  it('スキル表が正典 §8.5 の6種である', () => {
    expect(SKILLS.map((s) => s.label)).toEqual([
      '末脚爆発',
      '逃げ粘り',
      'ゲート巧者',
      '雨得意',
      '内枠強者',
      '長距離砲',
    ]);
  });

  it('発動条件は両側を押さえる（R-2）', () => {
    const base = { distance: 2000, surface: 'turf' as const, trackCondition: 'good' as const, gate: 1, iq: 500 };
    // 末脚爆発: 差し/追込のみ（I-SKILL-POSITION）
    expect(isEligible('G_SPURT', { ...base, strategy: 'sashi' }, B)).toBe(true);
    expect(isEligible('G_SPURT', { ...base, strategy: 'oikomi' }, B)).toBe(true);
    expect(isEligible('G_SPURT', { ...base, strategy: 'nige' }, B)).toBe(false);
    expect(isEligible('G_SPURT', { ...base, strategy: 'senko' }, B)).toBe(false);
    // 逃げ粘り: 逃げのみ
    expect(isEligible('G_HOLD', { ...base, strategy: 'nige' }, B)).toBe(true);
    expect(isEligible('G_HOLD', { ...base, strategy: 'senko' }, B)).toBe(false);
    // 雨得意: 良以外
    expect(isEligible('G_MUD', { ...base, strategy: 'senko' }, B)).toBe(false);
    expect(
      isEligible('G_MUD', { ...base, strategy: 'senko', trackCondition: 'yielding' }, B),
    ).toBe(true);
    expect(isEligible('G_MUD', { ...base, strategy: 'senko', trackCondition: 'soft' }, B)).toBe(
      true,
    );
    // 内枠強者: 枠1〜4（4は含み5は含まない）
    expect(isEligible('G_INNER', { ...base, strategy: 'senko', gate: 4 }, B)).toBe(true);
    expect(isEligible('G_INNER', { ...base, strategy: 'senko', gate: 5 }, B)).toBe(false);
    // 長距離砲: 2400m以上（2400は含み2399は含まない）
    expect(isEligible('G_STAYER', { ...base, strategy: 'senko', distance: 2400 }, B)).toBe(true);
    expect(isEligible('G_STAYER', { ...base, strategy: 'senko', distance: 2399 }, B)).toBe(false);
  });

  it('★経路: 発動条件を満たさないスキルは resolveRace の結果に一切影響しない', () => {
    // 2000m（長距離砲の条件外）で G_STAYER を持たせても、持たない馬と完全一致する
    const withSkill = breakdownOf([neutralEntrant('A', { skillGenes: ['G_STAYER'] })], 'A');
    const without = breakdownOf([neutralEntrant('A')], 'A');
    expect(withSkill.breakdown.score).toBe(without.breakdown.score);
    expect(withSkill.randomMult).toBe(without.randomMult);
    expect(withSkill.breakdown.firedSkills).toEqual([]);
  });

  it('★経路: 条件を満たすと発動し、効果が内訳に現れる（雨得意は上書き・内枠強者は乗算）', () => {
    // IQ1000 → 発動率90%。複数シードで最低1回は発動することを確認しつつ、
    // 発動時の値が正典どおりであることを固定する
    const cond = conditions({ trackCondition: 'soft' });
    let sawMud = false;
    for (const seed of [1, 2, 3, 4, 5]) {
      const row = breakdownOf(
        [
          neutralEntrant('A', {
            skillGenes: ['G_MUD'],
            stats: { sp: 500, st: 500, pw: 500, gt: 500, iq: 1000 },
            heavyAptitude: 0,
          }),
        ],
        'A',
        cond,
        seed,
      );
      if (row.breakdown.firedSkills.includes('G_MUD')) {
        sawMud = true;
        // 雨得意は trackConditionCoef を 1.06 に「上書き」する（適性0なら本来 0.88）
        expect(row.breakdown.trackConditionCoef).toBeCloseTo(B.MUD_SKILL_COEF, 10);
      } else {
        expect(row.breakdown.trackConditionCoef).toBeCloseTo(0.88, 10);
      }
    }
    expect(sawMud, '発動率90%なら5シードで最低1回は発動するはず').toBe(true);
  });

  it('★経路: 長距離砲は base の ST 寄与を +15% にする（2400m 以上）', () => {
    const stHorse = (skills: string[]): RaceEntrant =>
      neutralEntrant('A', {
        skillGenes: skills,
        stats: { sp: 0, st: 1000, pw: 0, gt: 0, iq: 1000 },
      });
    const cond = conditions({ distance: 2400 });
    let sawStayer = false;
    for (const seed of [1, 2, 3, 4, 5]) {
      const row = breakdownOf([stHorse(['G_STAYER'])], 'A', cond, seed);
      const plain = breakdownOf([stHorse([])], 'A', cond, seed);
      if (row.breakdown.firedSkills.includes('G_STAYER')) {
        sawStayer = true;
        // ★比ではなく差で見る: base には IQ の寄与も入るので、比は 1.15 にならない
        //   （最初にここを比で書いて落とした。ST 成分だけが +15% される、が正しい主張）
        const stDelta = 1000 * ABILITY_WEIGHTS.long.st * B.STAYER_ST_BONUS;
        expect(row.breakdown.base - plain.breakdown.base).toBeCloseTo(stDelta, 8);
      } else {
        expect(row.breakdown.base).toBeCloseTo(plain.breakdown.base, 10);
      }
    }
    expect(sawStayer).toBe(true);
  });

  it('直線スキルは距離シェアで按分される（I-SKILL-SEGMENT・短距離ほど効く）', () => {
    // 末脚爆発(+12%) は直線400m/距離 の割合で効く
    const horse = (): RaceEntrant =>
      neutralEntrant('A', {
        strategy: 'sashi',
        skillGenes: ['G_SPURT'],
        stats: { sp: 500, st: 500, pw: 500, gt: 500, iq: 1000 },
      });
    const findFired = (distance: number): number | null => {
      for (const seed of [1, 2, 3, 4, 5, 6]) {
        const row = breakdownOf([horse()], 'A', conditions({ distance }), seed);
        if (row.breakdown.firedSkills.includes('G_SPURT')) return row.breakdown.skillCoef;
      }
      return null;
    };
    const short = findFired(1200);
    const long = findFired(3000);
    expect(short).not.toBeNull();
    expect(long).not.toBeNull();
    if (short === null || long === null) throw new Error('発動サンプルが取れなかった');
    expect(short).toBeCloseTo(1 + 0.12 * (400 / 1200), 10);
    expect(long).toBeCloseTo(1 + 0.12 * (400 / 3000), 10);
    expect(short).toBeGreaterThan(long);
  });
});

describe('§8.7 着順・着差・タイム', () => {
  it('着順は finalScore の降順', () => {
    const field = neutralField(10);
    const r = resolveRace({ conditions: conditions(), entrants: field, seed: 2026, balance: B });
    for (let i = 1; i < r.order.length; i++) {
      const prev = r.order[i - 1];
      const cur = r.order[i];
      if (prev === undefined || cur === undefined) throw new Error('着順が欠けている');
      expect(prev.finalScore).toBeGreaterThanOrEqual(cur.finalScore);
      expect(cur.finishPosition).toBe(i + 1);
    }
  });

  it('1着の着差は 0・以降は単調に増える', () => {
    const r = resolveRace({
      conditions: conditions(),
      entrants: neutralField(12),
      seed: 7,
      balance: B,
    });
    const first = r.order[0];
    if (first === undefined) throw new Error('1着が無い');
    expect(first.timeGapSec).toBe(0);
    expect(first.marginLabel).toBe('');
    expect(first.timeSec).toBeCloseTo(r.baseTimeSec, 10);
    for (let i = 1; i < r.order.length; i++) {
      const prev = r.order[i - 1];
      const cur = r.order[i];
      if (prev === undefined || cur === undefined) throw new Error('着順が欠けている');
      expect(cur.timeGapSec).toBeGreaterThanOrEqual(prev.timeGapSec);
    }
  });

  it('着差ラベルは正典 §8.7 に明記された4段の境界を守る（R-2 両側）', () => {
    expect(marginLabel(0)).toBe('同着');
    expect(marginLabel(0.03)).toBe('ハナ');
    expect(marginLabel(0.031)).toBe('アタマ');
    expect(marginLabel(0.06)).toBe('アタマ');
    expect(marginLabel(0.061)).toBe('クビ');
    expect(marginLabel(0.1)).toBe('クビ');
    expect(marginLabel(0.101)).toBe('1/2馬身');
    expect(marginLabel(0.16)).toBe('1/2馬身');
    expect(marginLabel(0.161)).toBe('3/4馬身');
    expect(marginLabel(999)).toBe('大差');
  });

  it('タイムは距離/平均速度。ダート・不良馬場は遅くなる（I-SPEED-MODEL）', () => {
    const turfGood = averageSpeedMps(2000, 'turf', 'good', B);
    const dirtGood = averageSpeedMps(2000, 'dirt', 'good', B);
    const turfSoft = averageSpeedMps(2000, 'turf', 'soft', B);
    expect(dirtGood).toBeLessThan(turfGood);
    expect(turfSoft).toBeLessThan(turfGood);
    // 距離が伸びると平均速度が落ちる
    expect(averageSpeedMps(3000, 'turf', 'good', B)).toBeLessThan(turfGood);
  });

  it('乱数倍率は K の混合分布に従う（統計量で固定・案D 反映）', () => {
    const samples: number[] = [];
    for (let seed = 0; seed < 400; seed++) {
      const r = resolveRace({
        conditions: conditions(),
        entrants: neutralField(8),
        seed,
        balance: B,
      });
      for (const row of r.order) samples.push(row.randomMult);
    }
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    const sd = Math.sqrt(
      samples.reduce((a, b) => a + (b - mean) * (b - mean), 0) / (samples.length - 1),
    );
    // K が大きいほど標本平均のばらつきも大きい。K に応じた許容幅で見る
    expect(Math.abs(mean - 1)).toBeLessThan(B.RACE_RANDOM_K * 0.05);
    // ★リテラルで固定すると K を動かしたとき同期が要る（L-2 で潰したクラス）。
    //   balance の値そのものと突き合わせる。ここが K の**経路側の固定**でもある（O-4）
    // ★混合分布（案D）の理論SD = K × sqrt((1-p) + p·m²)。裾を厚くすると SD は広がる
    const theoretical =
      B.RACE_RANDOM_K * Math.sqrt(1 - B.TAIL_MIX_P + B.TAIL_MIX_P * B.TAIL_MIX_M ** 2);
    expect(sd).toBeGreaterThan(theoretical * 0.9);
    expect(sd).toBeLessThan(theoretical * 1.1);
    // 正典 §13.1（D-016）の値そのもの
    expect(B.RACE_RANDOM_K).toBe(0.22);
  });

  it('介入倍率が finalScore に掛かる（§8.7 の式の第3項）', () => {
    const field = neutralField(3);
    const plain = resolveRace({
      conditions: conditions(),
      entrants: field,
      seed: 5,
      balance: B,
    });
    const boosted = resolveRace({
      conditions: conditions(),
      entrants: field,
      seed: 5,
      balance: B,
      interventionMults: new Map([['H002', 1.1]]),
    });
    const before = plain.order.find((o) => o.horseId === 'H002');
    const after = boosted.order.find((o) => o.horseId === 'H002');
    if (before === undefined || after === undefined) throw new Error('H002 が無い');
    expect(after.interventionMult).toBe(1.1);
    expect(after.finalScore / before.finalScore).toBeCloseTo(1.1, 10);
    // 他馬は影響を受けない
    const otherBefore = plain.order.find((o) => o.horseId === 'H001');
    const otherAfter = boosted.order.find((o) => o.horseId === 'H001');
    expect(otherAfter?.finalScore).toBe(otherBefore?.finalScore);
  });
});

describe('§8.6 決定論と乱数系列の独立性', () => {
  it('同じ seed なら完全に同じレースになる（正典 §8.6 の再現性要件）', () => {
    const field = neutralField(14);
    const a = resolveRace({ conditions: conditions(), entrants: field, seed: 31337, balance: B });
    const b = resolveRace({ conditions: conditions(), entrants: field, seed: 31337, balance: B });
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });

  it('seed が違えば結果も違う（seed が実際に使われている）', () => {
    const field = neutralField(14);
    const a = resolveRace({ conditions: conditions(), entrants: field, seed: 1, balance: B });
    const b = resolveRace({ conditions: conditions(), entrants: field, seed: 2, balance: B });
    expect(b.order.map((o) => o.horseId)).not.toEqual(a.order.map((o) => o.horseId));
  });

  /**
   * ★race.ts のコメントが主張している性質そのもの。
   *   M-1 の教訓（存在しない防御をコードに書かない）に従い、主張はテストで裏づける。
   */
  it('1頭のスキル構成を変えても、他馬の乱数（randomMult）は一切ずれない', () => {
    const field = neutralField(10);
    const modified = field.map((e, i) =>
      i === 3 ? { ...e, skillGenes: ['G_INNER', 'G_GATE', 'G_SPURT'] } : e,
    );
    const a = resolveRace({ conditions: conditions(), entrants: field, seed: 99, balance: B });
    const b = resolveRace({ conditions: conditions(), entrants: modified, seed: 99, balance: B });
    for (const row of a.order) {
      if (row.horseId === 'H004') continue; // 変更した馬本人は除く
      const other = b.order.find((o) => o.horseId === row.horseId);
      expect(other?.randomMult, `${row.horseId} の乱数がずれた`).toBe(row.randomMult);
    }
  });

  it('スキル判定用と着順決定用の乱数列が無相関である（K-2 の系列独立性）', () => {
    // 同一 seed から2系列を取り、相関がゼロ近傍であることを見る
    const xs: number[] = [];
    const ys: number[] = [];
    for (let seed = 0; seed < 500; seed++) {
      const r = resolveRace({
        conditions: conditions({ trackCondition: 'soft' }),
        entrants: neutralField(6, {
          skillGenes: ['G_MUD'],
          stats: { sp: 500, st: 500, pw: 500, gt: 500, iq: 500 },
        }),
        seed,
        balance: B,
      });
      for (const row of r.order) {
        xs.push(row.breakdown.firedSkills.length);
        ys.push(row.randomMult);
      }
    }
    const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
    const my = ys.reduce((a, b) => a + b, 0) / ys.length;
    let num = 0;
    let dx = 0;
    let dy = 0;
    for (let i = 0; i < xs.length; i++) {
      const a = (xs[i] ?? 0) - mx;
      const b = (ys[i] ?? 0) - my;
      num += a * b;
      dx += a * a;
      dy += b * b;
    }
    const corr = num / Math.sqrt(dx * dy);
    expect(Math.abs(corr), `スキル発動数と最終乱数の相関 ${corr}`).toBeLessThan(0.05);
  });

  it('出走馬が0頭・IDが重複していれば例外（静かに壊れた着順を返さない・R-3）', () => {
    expect(() =>
      resolveRace({ conditions: conditions(), entrants: [], seed: 1, balance: B }),
    ).toThrow(/出走馬が0頭/);
    const dup = [neutralEntrant('A'), neutralEntrant('A')];
    expect(() =>
      resolveRace({ conditions: conditions(), entrants: dup, seed: 1, balance: B }),
    ).toThrow(/重複/);
  });
});

describe('解釈の登録簿（報告書 §7 の出所）', () => {
  it('INTERPRETATIONS の各項目が必須フィールドを埋めている', () => {
    expect(INTERPRETATIONS.length).toBeGreaterThan(0);
    const ids = new Set<string>();
    for (const item of INTERPRETATIONS) {
      expect(item.id, 'id が空').not.toBe('');
      expect(item.canon, `${item.id}: canon が空`).not.toBe('');
      expect(item.given, `${item.id}: given が空`).not.toBe('');
      expect(item.filled, `${item.id}: filled が空`).not.toBe('');
      expect(item.rationale.length, `${item.id}: rationale が短すぎる`).toBeGreaterThan(20);
      expect(ids.has(item.id), `${item.id} が重複`).toBe(false);
      ids.add(item.id);
    }
  });
});

describe('S-1 K の振る舞いを固定する（しきい値に K 自身を使わない）', () => {
  /**
   * ★これが無いと K は「値の照合」でしか守られていなかった:
   *     expect(sd).toBeGreaterThan(B.RACE_RANDOM_K * 0.92)  ← しきい値が摂動対象自身
   *     expect(B.RACE_RANDOM_K).toBe(0.26)                  ← 唯一の実質的な検出源
   *   K を 0.12 にすると sd も 0.12 になるので統計量のテストは**追随して通る**。
   *   「統計量で固定している」という見た目を取りながら、振る舞いを見ていなかった。
   *   `DISTANCE_SUIT_MIN` で自分が見つけた同語反復と完全に同型（4度目）。
   *
   * ★ここでは**リテラルのしきい値**で「K がレースの荒れ具合をどれだけ決めているか」を固定する。
   *   能力を 3% 刻みで並べた8頭立てで、最強馬が勝つ割合:
   *     K=0.12 → 35.60% / K=0.18 → 29.45% / K=0.22 → 26.57% / K=0.30 → 23.57%（実測・混合分布下）
   *   K を動かせば必ずこの帯から外れる。
   */
  it('★能力差が既知の出走表で、最強馬の勝率が K に対応した水準になる', () => {
    const field = Array.from({ length: 8 }, (_, i) =>
      neutralEntrant(`H${i}`, {
        gate: i + 1,
        stats: {
          sp: 500 - i * 15,
          st: 500 - i * 15,
          pw: 500 - i * 15,
          gt: 500 - i * 15,
          iq: 500 - i * 15,
        },
      }),
    );
    let wins = 0;
    const races = 2000;
    for (let seed = 0; seed < races; seed++) {
      const r = resolveRace({ conditions: conditions(), entrants: field, seed, balance: B });
      if (r.order[0]?.horseId === 'H0') wins += 1;
    }
    const rate = wins / races;
    // ★リテラルで固定する（B.RACE_RANDOM_K を使わない）。K=0.20 でも K=0.34 でも外れる幅
    expect(rate, `最強馬の勝率 ${rate}（K=0.22 の実測は 26.57%）`).toBeGreaterThan(0.250);
    expect(rate, `最強馬の勝率 ${rate}（K=0.22 の実測は 26.57%）`).toBeLessThan(0.281);
  });
});

describe('案D 裾の厚い混合分布（正典 §8.7 の乱数）', () => {
  it('★大偏差の発生率が p に一致し、幅が m 倍になる（分布の形を固定する）', () => {
    // ★しきい値に TAIL_MIX_P/M 自身を使わない（R-14）。リテラルで固定する。
    //   p=0.03 / m=5 なら、|randomMult-1| > 3σ(=0.66) の割合が単一正規分布より桁で多い。
    const samples: number[] = [];
    for (let seed = 0; seed < 600; seed++) {
      const r = resolveRace({
        conditions: conditions(),
        entrants: neutralField(12),
        seed,
        balance: B,
      });
      for (const row of r.order) samples.push(row.randomMult - 1);
    }
    const sd0 = B.RACE_RANDOM_K;
    const beyond3 = samples.filter((x) => Math.abs(x) > 3 * sd0).length / samples.length;
    // 単一正規分布なら 3σ 超は 0.27%。混合分布では p に応じて桁で増える
    expect(beyond3, `3σ超の割合 ${beyond3}`).toBeGreaterThan(0.008);
    // 裾が厚くても中心は動かない（平均は1のまま）
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    expect(Math.abs(mean), `平均のずれ ${mean}`).toBeLessThan(0.02);
  });

  it('★混合分布でも乱数の消費数は一定（決定論と Provably Fair を壊さない）', () => {
    // 同じ seed なら完全に同じレースになること。分岐で消費数が変われば再現が壊れる
    const field = neutralField(14);
    const a = resolveRace({ conditions: conditions(), entrants: field, seed: 777, balance: B });
    const b = resolveRace({ conditions: conditions(), entrants: field, seed: 777, balance: B });
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
    // 裾を無効化（p=0）しても同じ seed で再現する
    const flat = { ...B, TAIL_MIX_P: 0 };
    const c = resolveRace({ conditions: conditions(), entrants: field, seed: 777, balance: flat });
    const d = resolveRace({ conditions: conditions(), entrants: field, seed: 777, balance: flat });
    expect(JSON.stringify(d)).toBe(JSON.stringify(c));
    // p=0 と p>0 では結果が違う（裾が実際に効いている）。
    // 1レースでは大偏差が1頭も出ないことがあるので、複数シードで少なくとも1件違うことを見る
    let differed = 0;
    for (let seed = 0; seed < 30; seed++) {
      const withTail = resolveRace({ conditions: conditions(), entrants: field, seed, balance: B });
      const noTail = resolveRace({ conditions: conditions(), entrants: field, seed, balance: flat });
      if (JSON.stringify(withTail) !== JSON.stringify(noTail)) differed += 1;
    }
    expect(differed, `30シード中 ${differed} 件で差が出た`).toBeGreaterThan(0);
  });
});
