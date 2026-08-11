/**
 * ★育成イベント（§7.6）。要点は2つ:
 *   ① 選択肢の効果が **data-driven**（表に1行足せば増える）
 *   ② ★**§7.4 の調子の再判定より「後」に適用する**。
 *      前に適用すると再判定が上書きし、「イベントが出たのに何も起きない」が
 *      静かに成立します（繋ぎ忘れの典型）。
 */
import { describe, expect, it } from 'vitest';
import { ABILITY_KEYS, deriveRng, type AbilityKey } from '@star/sim-engine';
import {
  AWAKENING_MULT, AWAKENING_PROB, EVENTS, PUSH_THROUGH_TEMPER,
  applyEvent, nextCondition, rollEvent,
} from '../src/index.js';

const rec = (v: number): Record<AbilityKey, number> =>
  Object.fromEntries(ABILITY_KEYS.map((k) => [k, v])) as Record<AbilityKey, number>;

const target = { condition: 3, temper: 50, birthTemper: 50, fatigue: 20, current: rec(400), potential: rec(500) };

describe('§7.6 イベント表（data-driven）', () => {
  it('★正典の3つが表にある（テキストは正典の文言）', () => {
    const ids = EVENTS.map((e) => e.id);
    expect(ids).toContain('condition_up');
    expect(ids).toContain('temper_rough');
    expect(ids).toContain('awakening');
    expect(EVENTS.find((e) => e.id === 'awakening')!.probability).toBe(AWAKENING_PROB);
  });

  it('★選択肢のあるイベントには既定の選択肢がある（NPC・放置プレイ用）', () => {
    for (const e of EVENTS) {
      if (e.choices.length > 0) {
        expect(e.defaultChoice, e.id).toBeDefined();
        expect(e.choices.map((c) => c.id)).toContain(e.defaultChoice);
      } else {
        expect(e.effect, e.id).toBeDefined();
      }
    }
  });

  it('★放置の既定が「強行」でない（放置で気性が悪化し続けない）', () => {
    const rough = EVENTS.find((e) => e.id === 'temper_rough')!;
    const def = rough.choices.find((c) => c.id === rough.defaultChoice)!;
    expect(def.effect.temper ?? 0).toBeLessThanOrEqual(0);
  });
});

describe('§7.6 発生', () => {
  it('★1週に複数は起きない（表の順に最初の1つだけ）', () => {
    for (let i = 0; i < 2000; i += 1) {
      const r = rollEvent(deriveRng(90, 64, i));
      if (r !== null) expect(EVENTS.some((e) => e.id === r.def.id)).toBe(true);
    }
  });

  it('★低確率である（毎週起きたらテキストの特別感が消える）', () => {
    let hit = 0;
    const n = 20000;
    for (let i = 0; i < n; i += 1) if (rollEvent(deriveRng(91, 64, i)) !== null) hit += 1;
    expect(hit / n).toBeLessThan(0.1);
    expect(hit / n).toBeGreaterThan(0); // ★0 だと「起きない」＝実装されていないのと同じ
  });

  it('選ばなければ既定の選択肢が使われる', () => {
    let seen = false;
    for (let i = 0; i < 3000 && !seen; i += 1) {
      const r = rollEvent(deriveRng(92, 64, i));
      if (r?.def.id === 'temper_rough') {
        expect(r.choice!.id).toBe(r.def.defaultChoice);
        seen = true;
      }
    }
    expect(seen).toBe(true);
  });
});

describe('★効果の適用', () => {
  it('調子+1（0..5 に収まる）', () => {
    expect(applyEvent(target, { condition: 1 }, deriveRng(93, 64, 1)).condition).toBe(4);
    expect(applyEvent({ ...target, condition: 5 }, { condition: 1 }, deriveRng(93, 64, 2)).condition).toBe(5);
  });

  it('強行: IQ が上がり気性が+10（§7.6）', () => {
    const rough = EVENTS.find((e) => e.id === 'temper_rough')!;
    const push = rough.choices.find((c) => c.id === 'push_through')!;
    const out = applyEvent(target, push.effect, deriveRng(94, 64, 1));
    expect(out.current.iq).toBeGreaterThan(400);
    expect(out.temper).toBe(50 + PUSH_THROUGH_TEMPER);
    // 他の能力は動かない
    expect(out.current.sp).toBe(400);
  });

  it('★開花は potential のうち1形質だけ +5%（§7.6）', () => {
    const out = applyEvent(target, { potentialMultOneRandom: AWAKENING_MULT }, deriveRng(95, 64, 1));
    expect(out.awakenedKey).not.toBeNull();
    const raised = ABILITY_KEYS.filter((k) => out.potential[k] > 500);
    expect(raised).toEqual([out.awakenedKey]);
    expect(out.potential[out.awakenedKey!]).toBeCloseTo(500 * AWAKENING_MULT, 6);
  });

  it('★B-4: イベントでも current は potential を超えない', () => {
    // 既に上限の馬に「強行」の IQ+ を当てる
    const atCap = { ...target, current: rec(500), potential: rec(500) };
    const out = applyEvent(atCap, { currentMult: { iq: 1.5 } }, deriveRng(96, 64, 1));
    expect(out.current.iq).toBe(500);
  });

  it('★入力を書き換えない', () => {
    const t = { ...target, current: rec(400), potential: rec(500) };
    applyEvent(t, { currentMult: { iq: 1.5 }, potentialMultOneRandom: 1.05 }, deriveRng(97, 64, 1));
    expect(t.current.iq).toBe(400);
    expect(t.potential.iq).toBe(500);
  });
});

describe('★§7.4 の再判定との順序（繋ぎ忘れの検出）', () => {
  it('★再判定の「後」に適用すれば効く', () => {
    const fatigue = 20;
    const base = nextCondition(fatigue, deriveRng(98, 62, 1));
    const after = applyEvent({ ...target, condition: base }, { condition: 1 }, deriveRng(98, 64, 1)).condition;
    expect(after).toBe(Math.min(5, base + 1));
  });

  it('★★再判定の「前」に適用すると効果が消える（この順序で繋いではいけない）', () => {
    const fatigue = 20;
    // イベントを先に当ててから再判定すると、再判定が上書きする
    const withEvent = applyEvent({ ...target, condition: 3 }, { condition: 1 }, deriveRng(99, 64, 1)).condition;
    const recalculated = nextCondition(fatigue, deriveRng(99, 62, 1));
    // ★再判定の結果は、イベントで足した値をまったく参照していない
    expect(recalculated).not.toBe(withEvent + 1);
    expect(recalculated).toBe(nextCondition(fatigue, deriveRng(99, 62, 1)));
  });
});
