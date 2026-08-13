/**
 * ★D-059 のゲート — 補間は境界と着順を1頭も動かしてはいけない
 *
 * > 再計算した位置の最終順が、確定済みの着順と完全一致すること。
 * > 描画層が少しでもずれたら必ず落ちます。
 */
import { describe, it, expect } from 'vitest';
import { replayPositionModel, finalOrderOf, type Boundaries } from '../src/index.js';

const DIST = 1600;
/** 走破タイムが違う18頭。★境界時刻は走破タイムからの按分（D-059） */
const boundaries = (): Boundaries[] => {
  const out: Boundaries[] = [];
  for (let g = 1; g <= 18; g += 1) {
    const finish = 95 + g * 0.37;          // 馬番が大きいほど遅い
    const at = (left: number) => ((DIST - left) / DIST) * finish;
    out.push({ gate: g, startSec: 0, spurtSec: at(800), straightSec: at(400), finishSec: finish });
  }
  return out;
};

const model = (jostle?: number) => replayPositionModel({
  distanceMeter: DIST, spurtMetersLeft: 800, straightMetersLeft: 400,
  boundaries: boundaries(), ...(jostle === undefined ? {} : { jostle }),
});

describe('★D-059 補間は境界を動かさない', () => {
  it('★境界時刻には、必ず境界の位置にいる', () => {
    for (const b of boundaries()) {
      for (const [sec, expected] of [
        [b.startSec, 0], [b.spurtSec, DIST - 800], [b.straightSec, DIST - 400], [b.finishSec, DIST],
      ] as const) {
        const h = model().at(sec).find((x) => x.gate === b.gate)!;
        expect(h.meters).toBeCloseTo(expected, 6);
      }
    }
  });

  it('★演出の強さをいくら変えても、境界は動かない', () => {
    for (const j of [0, 0.05, 0.2, 0.5]) {
      for (const b of boundaries()) {
        const h = model(j).at(b.spurtSec).find((x) => x.gate === b.gate)!;
        expect(h.meters).toBeCloseTo(DIST - 800, 6);
      }
    }
  });

  it('★最終順が確定着順と完全一致する（D-059 のゲート）', () => {
    const settled = boundaries()
      .slice().sort((a, b) => a.finishSec - b.finishSec).map((b) => b.gate);
    for (const j of [0, 0.06, 0.3]) {
      expect(finalOrderOf(model(j))).toEqual(settled);
    }
  });

  it('★対照: 演出は局面の「間」では実際に効いている（空振りでない）', () => {
    // 境界の中間で、演出あり/なしの位置が違うこと
    const b = boundaries()[4]!;
    const mid = (b.spurtSec + b.straightSec) / 2;
    const off = model(0).at(mid).find((x) => x.gate === b.gate)!.meters;
    const on = model(0.2).at(mid).find((x) => x.gate === b.gate)!.meters;
    expect(on).not.toBeCloseTo(off, 3);
  });

  it('★位置が後戻りしない（単調増加）', () => {
    const m = model(0.2);
    for (const g of [1, 9, 18]) {
      let prev = -1;
      for (let sec = 0; sec <= m.raceSec; sec += 0.25) {
        const cur = m.at(sec).find((h) => h.gate === g)!.meters;
        expect(cur).toBeGreaterThanOrEqual(prev - 1e-9);
        prev = cur;
      }
    }
  });

  it('★ゲージは勝負所まで満タン（正典 §13）', () => {
    const b = boundaries()[0]!;
    const m = model();
    expect(m.at(b.spurtSec - 1).find((h) => h.gate === 1)!.staminaRatio).toBe(1);
    expect(m.at(b.spurtSec + 1).find((h) => h.gate === 1)!.staminaRatio).toBeLessThan(1);
  });

  it('★同じ入力から同じ位置（乱数を使っていない）', () => {
    const a = JSON.stringify(model(0.15).at(42));
    const c = JSON.stringify(model(0.15).at(42));
    expect(a).toBe(c);
  });
});
