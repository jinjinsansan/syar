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
  finalScore: 0, randomMult: 1, interventionMult: 1, marginLabel: '', laneExtraM: 0,
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

/**
 * ★**係数を2つに分けた**（裁定 Q-P4-28）
 *
 *   > つまみが1つで目標が2つです。**係数を2つに分けてください。**
 *   > 隊列の広がりは**位置の散らばり**、速度の振れは**時間の変動**。
 *
 *   位置 x(τ) = τ + a·sin(πτ) + (d/2π)·sin(2πτ)
 *     `a`（脚質ごと）… 半周期。**τ=0.5 で最大** → 隊列の広がりを決める
 *     `d`（全馬共通）… 1周期。★**τ=0.5 でちょうど 0** → 隊列に効かない
 */
describe('★脚質の偏りと、レースの律動を分けた', () => {
  it('★★道中（τ=0.5）のずれは、脚質だけで決まる', () => {
    /**
     * ★ここが「分けた」ことの本体です。
     *   律動の項は `sin(2π·0.5) = 0` なので、**道中のずれに1ミリも効きません**。
     */
    const mid = (s: Strategy): number => paceShape(s, 'middle')(0.5) - 0.5;
    // 逃げは前、追込は後ろ
    expect(mid('nige')).toBeGreaterThan(0);
    expect(mid('oikomi')).toBeLessThan(0);
    // ★対称（同じ大きさで逆向き）＝律動が混ざっていない証拠
    expect(mid('nige')).toBeCloseTo(-mid('oikomi'), 9);
    expect(mid('senko')).toBeCloseTo(-mid('sashi'), 9);
  });

  it('★★脚質が同じでも、速度は道中で振れる（律動が効いている）', () => {
    const f = paceShape('senko', 'middle');
    const v = (t: number): number => (f(t + 0.005) - f(t - 0.005)) / 0.01;
    // 前半は速く、道中は落ち着き、終いはまた速い
    expect(v(0.1)).toBeGreaterThan(v(0.5));
    expect(v(0.9)).toBeGreaterThan(v(0.5));
  });

  it('★★位置は必ず前に進む（どの脚質・どのペースでも）', () => {
    for (const s of ['nige', 'senko', 'sashi', 'oikomi'] as Strategy[]) {
      for (const p of ['slow', 'middle', 'high'] as Pace[]) {
        const f = paceShape(s, p);
        let prev = -1;
        for (let t = 0; t <= 1.0001; t += 0.002) {
          const x = f(t);
          expect(x).toBeGreaterThanOrEqual(prev - 1e-12);
          prev = x;
        }
      }
    }
  });

  it('★両端は固定（境界も着順も動かない）', () => {
    for (const s of ['nige', 'senko', 'sashi', 'oikomi'] as Strategy[]) {
      expect(paceShape(s, 'high')(0)).toBeCloseTo(0, 12);
      expect(paceShape(s, 'high')(1)).toBeCloseTo(1, 12);
    }
  });
});
