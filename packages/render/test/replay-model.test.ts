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

/**
 * ★**別ストリームの揺らぎ**（正典 D-061 改訂）
 *
 * > 正しくは「結果に影響する乱数を引かない」でした。
 * > 別ストリームから引く揺らぎは、シードから再計算できるので Provably Fair は保たれ、
 * > `resolveRace` に触れないので再較正も要りません。
 */
describe('★別ストリームの揺らぎ（D-061 改訂）', () => {
  const bs: readonly Boundaries[] = [
    { gate: 1, startSec: 0, spurtSec: 61, straightSec: 86, finishSec: 97.4 },
    { gate: 2, startSec: 0, spurtSec: 59, straightSec: 84, finishSec: 96.1 },
    { gate: 3, startSec: 0, spurtSec: 62, straightSec: 87, finishSec: 96.8 },
    { gate: 4, startSec: 0, spurtSec: 58, straightSec: 85, finishSec: 98.2 },
  ];
  const mk = (o: Record<string, unknown>) => replayPositionModel({
    distanceMeter: 1600, spurtMetersLeft: 800, straightMetersLeft: 400, boundaries: bs, ...o,
  });
  const EXPECTED = [2, 3, 1, 4];   // finishSec の順

  it('★★どのシード・どの強さでも、着順は1頭も動かない', () => {
    for (const fid of ['exact', 'shape'] as const) {
      for (const jostleSeed of [0, 1, 42, 99991, -7]) {
        for (const jostle of [0, 0.06, 0.5, 0.9]) {
          expect(finalOrderOf(mk({ jostle, jostleSeed, boundaryFidelity: fid }))).toEqual(EXPECTED);
        }
      }
    }
  });

  it('★同じシードから同じ位置（乱数を直接呼んでいない・憲法4）', () => {
    const a = mk({ jostle: 0.9, jostleSeed: 12345, boundaryFidelity: 'shape' });
    const b = mk({ jostle: 0.9, jostleSeed: 12345, boundaryFidelity: 'shape' });
    for (const sec of [5, 20, 50, 80, 95]) {
      expect(JSON.stringify(a.at(sec))).toBe(JSON.stringify(b.at(sec)));
    }
  });

  it('★シードが違えば揺らぎが違う（レースごとに違う＝学習で除けない）', () => {
    const a = mk({ jostle: 0.9, jostleSeed: 1, boundaryFidelity: 'shape' });
    const b = mk({ jostle: 0.9, jostleSeed: 2, boundaryFidelity: 'shape' });
    expect(JSON.stringify(a.at(40))).not.toBe(JSON.stringify(b.at(40)));
  });

  it('★位置は後戻りしない（どの強さでも・馬が下がって見えない）', () => {
    for (const fid of ['exact', 'shape'] as const) {
      for (const jostle of [0.06, 0.5, 0.9]) {
        const m = mk({ jostle, jostleSeed: 777, boundaryFidelity: fid });
        for (const g of [1, 2, 3, 4]) {
          let prev = -1;
          for (let sec = 0; sec <= 99; sec += 0.25) {
            const v = m.at(sec).find((h) => h.gate === g)!.meters;
            expect(v).toBeGreaterThanOrEqual(prev - 1e-9);
            prev = v;
          }
        }
      }
    }
  });

  it("★'exact' は中間境界を動かさない（D-059 の明文どおり）", () => {
    const m = mk({ jostle: 0.9, jostleSeed: 3, boundaryFidelity: 'exact' });
    for (const b of bs) {
      expect(m.at(b.spurtSec).find((h) => h.gate === b.gate)!.meters).toBeCloseTo(800, 6);
      expect(m.at(b.straightSec).find((h) => h.gate === b.gate)!.meters).toBeCloseTo(1200, 6);
    }
  });

  it("★★'shape' は中間境界を動かす — **そこが漏洩の口だったから**", () => {
    /**
     * ★区間ごとに揺らぐと、**境界ではちょうど 0** になります。
     *   そこでは `位置 + 脚質` から走破タイムが厳密に逆算でき、
     *   実測で**揺らぎをいくら強くしても残り800m の AUC は 0.931 のまま**でした
     *   （道中は 0.923 → 0.731 まで落ちるのに）。
     *   → `'shape'` で 0.931 → **0.799**。
     */
    const m = mk({ jostle: 0.9, jostleSeed: 3, boundaryFidelity: 'shape' });
    let moved = 0;
    for (const b of bs) {
      if (Math.abs(m.at(b.spurtSec).find((h) => h.gate === b.gate)!.meters - 800) > 1) moved += 1;
    }
    expect(moved).toBeGreaterThan(0);
    // ★それでも端は端（着順は動かない）
    expect(finalOrderOf(m)).toEqual(EXPECTED);
  });

  it('★揺らぎ 0 なら、シードを変えても何も変わらない（空振りでない対照）', () => {
    const a = mk({ jostle: 0, jostleSeed: 1, boundaryFidelity: 'shape' });
    const b = mk({ jostle: 0, jostleSeed: 999, boundaryFidelity: 'shape' });
    expect(JSON.stringify(a.at(40))).toBe(JSON.stringify(b.at(40)));
  });
});
