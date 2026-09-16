/**
 * ★**厩舎の格**（★GB-5・2026-09-16・指示書 `DEV_INSTRUCTIONS_GAME_BODY_1_20260916.md` §5-1・D-103）
 *
 * 【★見ている壊れ方】
 *   ① ★格が `potential`（天井）を動かす（★§7.3 の `current ≤ potential`・V-2b）
 *   ② ★**同じ EP を注いだとき、上の格が強くなる**（★お金で強さを買える形・S-5／L-4 の近縁・D-103 ②）
 *   ③ ★既定（ブロンズ）が 1.0 でなく、★格を入れただけで V-14・V-15・V-7 が動く
 */
import { describe, it, expect } from 'vitest';
import {
  STABLE_GRADES, STABLE_GRADE_MULT, DEFAULT_STABLE_GRADE, MENU_IDS, MENUS,
  gradeEpCost, gradeGainMult, gainPerEpRatio, grow, headroom,
} from '../src/index.js';

/** ★決定的な乱数（★`grow` に注入する・★時刻もグローバル乱数も使わない） */
const fixedRng = (value: number) => ({
  nextUint32: () => 0,
  next: () => value,
  range: (min: number, max: number) => min + (max - min) * value,
  int: (min: number) => min,
  bool: () => false,
} as unknown as Parameters<typeof grow>[1]);

const potential = { sp: 800, st: 800, pw: 800, gt: 800, iq: 800 };
const current = { sp: 400, st: 400, pw: 400, gt: 400, iq: 400 };

describe('★厩舎の格（GB-5・D-103）', () => {
  it('① ★既定はブロンズで倍率 1.0（★格を入れる前と同じ）', () => {
    expect(DEFAULT_STABLE_GRADE).toBe('bronze');
    expect(STABLE_GRADE_MULT.bronze).toBe(1.0);
    /** ★既定の調教費は §7.2 の表そのもの */
    for (const id of MENU_IDS) expect(gradeEpCost(id), id).toBe(MENUS[id].epCost);
    expect(gradeGainMult()).toBe(1.0);
  });

  it('② ★同じ EP を注いだとき、上の格が強くならない（★EP あたりの伸びがどの格でも同じ）', () => {
    for (const g of STABLE_GRADES) {
      expect(gainPerEpRatio(g), `${g} の EP あたりの伸び`).toBeCloseTo(1.0, 10);
    }
    /** ★費用と伸びが同じ倍率で動く（★片方だけに掛けたらここが落ちる） */
    for (const g of STABLE_GRADES) {
      const costRatio = gradeEpCost('hill', g) / MENUS.hill.epCost;
      expect(costRatio, `${g} の費用の比`).toBeCloseTo(gradeGainMult(g), 2);
    }
  });

  it('③ ★上の格は「時間の効率」だけ上がる（★1 週の伸びは増えるが、そのぶん高い）', () => {
    expect(gradeGainMult('gold')).toBeGreaterThan(gradeGainMult('bronze'));
    expect(gradeEpCost('hard', 'gold')).toBeGreaterThan(gradeEpCost('hard', 'bronze'));
    /** ★何週で同じ EP を使い切るか: 上の格ほど少ない週数（＝時間が早い） */
    const budget = 24_000;
    const weeksBronze = Math.floor(budget / gradeEpCost('hard', 'bronze'));
    const weeksGold = Math.floor(budget / gradeEpCost('hard', 'gold'));
    expect(weeksGold).toBeLessThan(weeksBronze);
    /** ★同じ予算で得られる「伸びの量の合計」は同じ水準（★強さは買えない） */
    expect(weeksGold * gradeGainMult('gold')).toBeCloseTo(weeksBronze * gradeGainMult('bronze'), 0);
  });

  it('④ ★格は `potential` を動かさない（★`current ≤ potential` が破れない）', () => {
    /** ★`grow` は格を引数に取らない（★天井に関わる式に格が入らないことを型で示す） */
    expect(grow.length).toBe(2);
    const next = grow({ menu: 'hard', ageWeeks: 120, growth: 'normal', temper: 50, condition: 3, current, potential }, fixedRng(0.5));
    for (const k of ['sp', 'st', 'pw', 'gt', 'iq'] as const) {
      expect(next[k], k).toBeLessThanOrEqual(potential[k]);
    }
    /** ★天井に達した馬は、どの格でも伸びない（★headroom が 0） */
    expect(headroom(800, 800)).toBe(0);
    for (const g of STABLE_GRADES) {
      expect(gradeGainMult(g) * headroom(800, 800), `${g}`).toBe(0);
    }
  });

  it('⑤ ★後半の伸びが 0 に張り付かない（★D-044: 上の格でも天井に着きすぎない）', () => {
    /** ★キャリア後半（current が potential の 9 割）でも、伸びしろは 0 より大きい */
    const late = headroom(720, 800);
    expect(late).toBeGreaterThan(0);
    for (const g of STABLE_GRADES) {
      expect(gradeGainMult(g) * late, `${g} の後半の伸び`).toBeGreaterThan(0);
    }
  });
});
