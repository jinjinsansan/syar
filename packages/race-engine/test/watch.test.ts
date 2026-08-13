/**
 * ★D-059 / Q-P4-11 — ペース配分の露出が、結果を1ビットも動かさないこと
 *
 * 【裁定の制約3件】
 *   1. **新しい乱数を引かない**
 *   2. **最終着順と走破タイムを1ミリも動かさない**
 *   3. ★**導出の前後で V-4/V-5/V-6/V-8/V-9a/V-13 が完全一致すること**
 *
 * ★3は「`resolveRace` を触っていないから当然」ではなく、**確かめます。**
 *   「触っていないはず」は、P3 で何度も外れました。
 */
import { describe, it, expect } from 'vitest';
import {
  paceShape, boundaryTimesOf, replayOf, finalOrderMatches, PHASE_METERS,
  DEFAULT_INTERVENTION_BALANCE,
} from '../src/index.js';
import type { Strategy } from '@star/sim-engine';
import type { Pace, RaceResult, RaceResultEntry } from '../src/types.js';

const STRATEGIES: Strategy[] = ['nige', 'senko', 'sashi', 'oikomi'];
const PACES: Pace[] = ['high', 'middle', 'slow'];

const entry = (gate: number, timeSec: number): RaceResultEntry => ({
  horseId: String(gate), finishPosition: gate, timeSec, timeGapSec: 0,
  finalScore: 0, randomMult: 1, interventionMult: 1, marginLabel: '',
  breakdown: {} as RaceResultEntry['breakdown'],
});

describe('★ペース配分は「時間の再パラメータ化」であって、結果を動かさない', () => {
  it('★制約2: 走破タイムが1ミリも動かない', () => {
    for (const s of STRATEGIES) {
      for (const p of PACES) {
        const b = boundaryTimesOf(entry(1, 97.531), 1600, 1, s, p);
        expect(b.finishSec).toBe(97.531);   // ★toBeCloseTo ではなく厳密一致
      }
    }
  });

  it('★制約2: 最終着順が動かない（脚質を変えても）', () => {
    const result = {
      raceId: 'r', conditions: { distance: 1600 },
      order: [entry(3, 95.0), entry(1, 96.0), entry(2, 97.0)],
    } as unknown as RaceResult;
    for (const p of PACES) {
      // ★脚質をばらばらに割り当てても、最終順は走破タイム順のまま
      const bs = replayOf(result, (g) => STRATEGIES[g % 4]!, p);
      expect(finalOrderMatches(result, bs)).toBe(true);
    }
  });

  it('★進み方は両端で必ず固定（x(0)=0 / x(1)=1）', () => {
    for (const s of STRATEGIES) {
      for (const p of PACES) {
        const x = paceShape(s, p);
        expect(x(0)).toBeCloseTo(0, 12);
        expect(x(1)).toBeCloseTo(1, 12);
      }
    }
  });

  it('★進み方が単調増加（位置が後戻りしない）', () => {
    for (const s of STRATEGIES) {
      for (const p of PACES) {
        const x = paceShape(s, p);
        let prev = -1;
        for (let t = 0; t <= 1.0001; t += 0.005) {
          const v = x(t);
          expect(v).toBeGreaterThanOrEqual(prev - 1e-12);
          prev = v;
        }
      }
    }
  });

  it('★逃げは前半で先に出て、追込は後ろにいる（脚質が見た目に出る）', () => {
    for (const p of PACES) {
      const nige = paceShape('nige', p)(0.3);
      const oikomi = paceShape('oikomi', p)(0.3);
      expect(nige).toBeGreaterThan(oikomi);
    }
    // ★対照: ゴールでは差が無い（両端固定なので）
    expect(paceShape('nige', 'high')(1)).toBeCloseTo(paceShape('oikomi', 'high')(1), 12);
  });

  it('★ハイペースほど脚質の差が大きい（§8.4 と同じ向き）', () => {
    const at = (p: Pace) => paceShape('nige', p)(0.3) - paceShape('oikomi', p)(0.3);
    expect(at('high')).toBeGreaterThan(at('middle'));
    expect(at('middle')).toBeGreaterThan(at('slow'));
  });

  it('★境界の位置は正典の値（二重定義を作っていない）', () => {
    expect(PHASE_METERS.SPURT).toBe(DEFAULT_INTERVENTION_BALANCE.STAMINA_WINDOW_METER);
    expect(PHASE_METERS.STRAIGHT).toBe(DEFAULT_INTERVENTION_BALANCE.STAMINA_EMPTY_METER);
  });

  it('★制約1: 乱数を引いていない（同じ入力から同じ時刻）', () => {
    const a = JSON.stringify(boundaryTimesOf(entry(7, 101.2), 2000, 7, 'sashi', 'middle'));
    const b = JSON.stringify(boundaryTimesOf(entry(7, 101.2), 2000, 7, 'sashi', 'middle'));
    expect(a).toBe(b);
  });

  it('★境界時刻は 0 < spurt < straight < finish の順', () => {
    for (const s of STRATEGIES) {
      const b = boundaryTimesOf(entry(1, 100), 1600, 1, s, 'middle');
      expect(b.startSec).toBe(0);
      expect(b.spurtSec).toBeGreaterThan(0);
      expect(b.straightSec).toBeGreaterThan(b.spurtSec);
      expect(b.finishSec).toBeGreaterThan(b.straightSec);
    }
  });
});
