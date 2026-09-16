/**
 * ★**厩舎の格を週送りに配線した**（★ゲーム本体 (a) 第 5 便-1・2026-09-16・正典 §6.7・§7.2・**D-103**）
 *
 * 【★見ている壊れ方】
 *   ① ★**格を入れる前と挙動が変わる**（★既定のブロンズは倍率 1.0 で ★**1 ビット同じ**でなければならない）
 *   ② ★**同じ EP で上の格が強くなる**（★D-103 ②・V-14 ③ の家族。★「お金で強さを買う」形になる）
 *   ③ ★**天井（`potential`）が動く**（★§7.3 の `current ≤ potential`・V-2b）
 *   ④ ★**費用が二重帳簿になる**（★ワーカーが `MENUS[menu].epCost` を直接読み、格の倍率を掛け忘れる）
 *   ⑤ ★**記録だけの馬を週送りしてしまう**（★§18 LR-3。★バッチが頭数に比例して増える）
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Rng, deriveRng, ABILITY_KEYS, type AbilityKey } from '@star/sim-engine';
import {
  advanceWeek, initialState, grow, gradeEpCost, gradeGainMult, gainPerEpRatio,
  STABLE_GRADES, DEFAULT_STABLE_GRADE, MENUS, MENU_IDS,
  type HorseTraits, type MenuId, type StableGrade,
} from '@star/training';
import { stableGradeOf } from '../../../apps/worker/src/training-runner.js';

const ROOT = path.resolve(__dirname, '../../..');
const RUNNER = readFileSync(path.join(ROOT, 'apps/worker/src/training-runner.ts'), 'utf8');

const traits: HorseTraits = { sex: 'male', growth: 'normal', birthTemper: 50, injuryRateMult: 1 };
const potential: Record<AbilityKey, number> = { sp: 800, st: 800, pw: 800, gt: 800, iq: 800 };
const current: Record<AbilityKey, number> = { sp: 300, st: 300, pw: 300, gt: 300, iq: 300 };
const startState = () => ({
  ...initialState({ potential, current, durability: 650, temper: 50 }),
  ageWeeks: 120,
});

const bits = (v: unknown): string => JSON.stringify(v, (_k, x: unknown) =>
  (typeof x === 'number' ? (Object.is(x, -0) ? '-0' : `n:${x.toString()}`) : x));

const run = (grade: StableGrade | undefined, weeks: number) => {
  let state = startState();
  const logs = [];
  for (let w = 0; w < weeks; w += 1) {
    const out = advanceWeek({
      state, traits, menu: 'hard', enableEvents: false,
      rngFor: (stream: number): Rng => deriveRng(4242, stream, w),
      ...(grade === undefined ? {} : { grade }),
    });
    state = out.state;
    logs.push(out.log);
  }
  return { state, logs };
};

describe('★厩舎の格の週送りへの配線（D-103）', () => {
  it('① ★ブロンズ（既定）は、格を渡さない場合と 1 ビット同じ', () => {
    const none = run(undefined, 52);
    const bronze = run('bronze', 52);
    expect(bits(bronze.state)).toBe(bits(none.state));
    expect(bits(bronze.logs)).toBe(bits(none.logs));
    /** ★倍率そのものも 1.0（★入れる前の世界と同じ） */
    expect(gradeGainMult(DEFAULT_STABLE_GRADE)).toBe(1);
  });

  it('② ★同じ EP あたりの伸びはどの格でも同じ（★お金で強さを買えない・D-103 ②）', () => {
    for (const g of STABLE_GRADES) expect(gainPerEpRatio(g), g).toBe(1.0);
    /**
     * ★1 週ぶんを直接比べる（★同じ状態・同じ乱数列から始める）。
     * ★伸びは ★**ちょうど倍率ぶん**で、★費用も ★**同じ倍率**です。
     */
    for (const g of STABLE_GRADES) {
      const base = grow({ menu: 'hard', ageWeeks: 120, growth: 'normal', temper: 50, condition: 3, current, potential }, deriveRng(7, 61, 0));
      const withGrade = grow({ menu: 'hard', ageWeeks: 120, growth: 'normal', temper: 50, condition: 3, current, potential, gainMult: gradeGainMult(g) }, deriveRng(7, 61, 0));
      for (const k of ABILITY_KEYS) {
        const gainBase = base[k] - current[k];
        const gainGrade = withGrade[k] - current[k];
        expect(gainGrade / gainBase, `${g} の ${k}`).toBeCloseTo(gradeGainMult(g), 12);
      }
      /** ★費用も同じ倍率（★`hard` は整数倍になる） */
      expect(gradeEpCost('hard', g) / MENUS['hard'].epCost).toBeCloseTo(gradeGainMult(g), 12);
    }
  });

  it('③ ★天井は動かない（★どの格でも `current ≤ potential`・§7.3・V-2b）', () => {
    for (const g of STABLE_GRADES) {
      /** ★週齢 120 から 130 週（＝250 週）。★260 週で引退するので、それを越えない長さにする */
      const out = run(g, 130);
      for (const k of ABILITY_KEYS) {
        expect(out.state.current[k], `${g} の ${k}`).toBeLessThanOrEqual(out.state.potential[k]);
      }
      /**
       * ★天井そのものが ★**上がっていない**（★格は `potential` に触らない）。
       * ⚠️ ★**「変わらない」ではありません** — ★故障の恒久ダメージ（§7.5・`applyInjury`）で
       *    ★天井は ★**下がりえます**（★実測: 800 → 776）。★最初「変わらない」と書いて落としました。
       *    ★格について言えるのは ★**上げないこと**だけです。
       */
      for (const k of ABILITY_KEYS) {
        expect(out.state.potential[k], `${g} の ${k} の天井`).toBeLessThanOrEqual(potential[k]);
      }
    }
  });

  it('④ ★ワーカーが費用を二重帳簿にしていない（★格の表から引く）', () => {
    /** ★`MENUS[...].epCost` を直接読んでいない（★格の倍率を掛け忘れる形） */
    expect(RUNNER).not.toMatch(/MENUS\[[^\]]+\]\.epCost/);
    expect(RUNNER).toMatch(/gradeEpCost\(menu, grade\)/);
    /** ★格を読んで `advanceWeek` に渡している */
    expect(RUNNER).toMatch(/stable_grade/);
    expect(RUNNER).toMatch(/grade,/);
    /** ★知らない格を黙って既定にしない（★警報を出す） */
    expect(RUNNER).toMatch(/厩舎の格が名簿にありません/);
  });

  it('★値が無い格では警報を出さず、知らない語のときだけ出す（★警報で他の警報を埋めない）', () => {
    /**
     * ⚠️ ★**2026-09-16 に踏みました。** ★`undefined` を「知らない語」と見なして**毎頭に警報**を出し、
     *    ★`training-runner-skip` の「失敗した馬の警報は 1 回だけ」が落ちました。
     *    ★値が無いのは「格を入れる前の行」であって、★異常ではありません（★既定は倍率 1.0）。
     */
    const alerts: string[] = [];
    expect(stableGradeOf(null, (m) => alerts.push(m), 'h1')).toBe(DEFAULT_STABLE_GRADE);
    expect(stableGradeOf(undefined, (m) => alerts.push(m), 'h1')).toBe(DEFAULT_STABLE_GRADE);
    expect(alerts, '★値が無いだけで警報を出している').toEqual([]);
    /** ★知らない語のときは出す（★列の CHECK を外した日に気づく） */
    expect(stableGradeOf('platinum', (m) => alerts.push(m), 'h1')).toBe(DEFAULT_STABLE_GRADE);
    expect(alerts.length).toBe(1);
    expect(alerts[0]).toContain('platinum');
    /** ★名簿にある格はそのまま通る */
    for (const g of STABLE_GRADES) {
      expect(stableGradeOf(g, () => { throw new Error('警報が出た'); }, 'h1')).toBe(g);
    }
  });

  it('⑤ ★週送りの対象から引退馬を外している（★§18 LR-3・記録だけの馬を進めない）', () => {
    /**
     * ★ワーカーが選ぶ SQL に `retired_at_week is null` があること。
     * ⚠️ ★これは ★**新しく足した条件ではありません** — ★もともと入っています。
     *    ★この検査は「★外した日に落ちる」ための錨です（★LR-3 は「増やさない」ことの約束）。
     */
    expect(RUNNER).toMatch(/where retired_at_week is null/);
    expect(RUNNER).toMatch(/from horses\s+where retired_at_week is null/);
  });

  it('★どのメニューでも費用の倍率が伸びの倍率と一致する（★片方だけ掛ける改変を捕まえる）', () => {
    for (const menu of MENU_IDS as readonly MenuId[]) {
      for (const g of STABLE_GRADES) {
        const cost = MENUS[menu].epCost;
        if (cost === 0) { expect(gradeEpCost(menu, g), `${menu}/${g}`).toBe(0); continue; }
        expect(gradeEpCost(menu, g), `${menu}/${g}`).toBe(Math.round(cost * gradeGainMult(g)));
      }
    }
  });
});
