/**
 * ★D-059 のゲート — 補間は境界と着順を1頭も動かしてはいけない
 *
 * > 再計算した位置の最終順が、確定済みの着順と完全一致すること。
 * > 描画層が少しでもずれたら必ず落ちます。
 */
import { describe, it, expect } from 'vitest';
import { replayPositionModel, finalOrderOf, withFinishRunOut, type Boundaries } from '../src/index.js';

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

const model = (formation?: number) => replayPositionModel({
  distanceMeter: DIST, spurtMetersLeft: 800, straightMetersLeft: 400,
  boundaries: boundaries(),
  strategyOf: (g) => (['nige', 'senko', 'sashi', 'oikomi'] as const)[(g - 1) % 4]!,
  formationSeed: 777,
  ...(formation === undefined ? {} : { formation }),
});

describe('ゴール後ランアウト', () => {
  it('確定時刻を変えず、先着馬ほど決勝線の先へ流す', () => {
    const at = [
      { gate: 1, meters: DIST, staminaRatio: 0, w: 2 },
      { gate: 2, meters: DIST, staminaRatio: 0, w: 3 },
    ];
    const finish = new Map([[1, 95], [2, 96]]);
    const visual = withFinishRunOut(at, (gate) => finish.get(gate), 96, DIST, 0.5, 10);
    expect(visual[0]!.meters).toBe(1615);
    expect(visual[1]!.meters).toBe(1605);
    expect(at.map((h) => h.meters)).toEqual([DIST, DIST]);
  });
});

describe('★D-059 補間は境界を動かさない', () => {
  /**
   * ★★**2026-08-15（Q-P4-38）で、この検査の対象が変わりました。**
   *
   * 【旧】**中間境界（残り800m / 400m）でも**位置がぴったり
   * 【新】★**発走とゴールだけ**がぴったり
   *
   * 【なぜ】道中の位置を**脚質から生成**するようになったためです。
   *   ⚠️ そして、これは**副作用ではなく目的**です:
   *      中間境界がぴったりだと、★**その時刻に「位置＋脚質」から走破タイムが厳密に逆算でき**、
   *      実測でも**そこだけ AUC が落ちませんでした**（道中 0.923 → 0.731 なのに境界は 0.963 のまま）。
   *   ★**D-059 が守るのは着順です。** 中間境界の位置ではありません。
   *
   * ⚠️ ★**残っている問い**: 仕掛けの受付（C-6）と局面の合図は「残り距離」で決まります。
   *    画面の位置が真の位置と最大 20m ずれるので、**どちらを基準にするか**を照会します。
   */
  it('★★発走とゴールは、生成器を通しても厳密に一致する（D-059）', () => {
    for (const b of boundaries()) {
      for (const f of [0, 0.5, 1]) {
        const m = model(f);
        expect(m.at(b.startSec).find((x) => x.gate === b.gate)!.meters).toBeCloseTo(0, 6);
        expect(m.at(b.finishSec).find((x) => x.gate === b.gate)!.meters).toBeCloseTo(DIST, 6);
      }
    }
  });

  it('★★中間境界は、生成器のぶんだけずれる（＝逆算できない）', () => {
    const b = boundaries()[4]!;
    const off = model(0).at(b.spurtSec).find((x) => x.gate === b.gate)!.meters;
    const on = model(1).at(b.spurtSec).find((x) => x.gate === b.gate)!.meters;
    expect(off).toBeCloseTo(DIST - 800, 6);      // 生成しなければ真実
    expect(Math.abs(on - off)).toBeGreaterThan(1);
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
    const on = model(1).at(mid).find((x) => x.gate === b.gate)!.meters;
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
    /**
     * ⚠️ ★生成器のぶん位置がずれるので、**時刻ではなく残り距離**で見ます。
     *    （「勝負所に入った」の判定は §13 で**残り距離**と定められています）
     */
    const late = m.at(b.spurtSec + 6).find((h) => h.gate === 1)!;
    expect(late.meters).toBeGreaterThan(DIST - 800);
    expect(late.staminaRatio).toBeLessThan(1);
  });

  it('★同じ入力から同じ位置（乱数を使っていない）', () => {
    const a = JSON.stringify(model(0.15).at(42));
    const c = JSON.stringify(model(0.15).at(42));
    expect(a).toBe(c);
  });
});

/**
 * ★**隊列の生成**（D-061 改訂 → ★Q-P4-38 で `jostle` から置き換え）
 *
 * > 正しくは「結果に影響する乱数を引かない」でした（D-061 改訂）。
 * > **別ストリーム**から引くので Provably Fair は保たれ、`resolveRace` に触れないので
 * > 再較正も要りません。★**その性質は生成器でもそのまま**です。
 *
 * ★2026-08-15（Q-P4-38）: `jostle`（揺らぎ）を撤去し、
 *   **道中を脚質から生成して真の着順へ収束させる**形に置き換えました。
 */
describe('★隊列の生成（D-061 改訂 → Q-P4-38）', () => {
  const bs: readonly Boundaries[] = [
    { gate: 1, startSec: 0, spurtSec: 61, straightSec: 86, finishSec: 97.4 },
    { gate: 2, startSec: 0, spurtSec: 59, straightSec: 84, finishSec: 96.1 },
    { gate: 3, startSec: 0, spurtSec: 62, straightSec: 87, finishSec: 96.8 },
    { gate: 4, startSec: 0, spurtSec: 58, straightSec: 85, finishSec: 98.2 },
  ];
  const mk = (o: Record<string, unknown>) => replayPositionModel({
    distanceMeter: 1600, spurtMetersLeft: 800, straightMetersLeft: 400, boundaries: bs,
    strategyOf: (g) => (['nige', 'senko', 'sashi', 'oikomi'] as const)[(g - 1) % 4]!,
    ...o,
  });
  const EXPECTED = [2, 3, 1, 4];   // finishSec の順

  it('★★どのシード・どの強さでも、着順は1頭も動かない', () => {
    for (const formationSeed of [0, 1, 42, 99991, -7]) {
      for (const formation of [0, 0.3, 0.7, 1]) {
        expect(finalOrderOf(mk({ formation, formationSeed }))).toEqual(EXPECTED);
      }
    }
  });

  it('★同じシードから同じ位置（乱数を直接呼んでいない・憲法4）', () => {
    const a = mk({ formationSeed: 12345 });
    const b = mk({ formationSeed: 12345 });
    for (const sec of [5, 20, 50, 80, 95]) {
      expect(JSON.stringify(a.at(sec))).toBe(JSON.stringify(b.at(sec)));
    }
  });

  it('★シードが違えば揺らぎが違う（レースごとに違う＝学習で除けない）', () => {
    const a = mk({ formationSeed: 1 });
    const b = mk({ formationSeed: 2 });
    // ★勝負所以降で見ます（道中は意図的に動かしていません。下の検査を参照）
    expect(JSON.stringify(a.at(90))).not.toBe(JSON.stringify(b.at(90)));
  });

  it('★★道中の位置は「脚質」で決まり、「走破タイム」では決まらない（Q-P4-38）', () => {
    /**
     * ★★**2026-08-15（Q-P4-38）で、この検査の意味が2度目の変更を受けました。**
     *
     * 【① 旧】道中は動かない（`PHASE_JOSTLE = [0, 0.2, 1.0]`）
     * 【② 8/15 午前】道中はシードで変わる（★乱数で漏洩を隠す）
     * 【③ 8/15 午後・いま】★**道中は脚質で決まる**（隠す必要がない）
     *
     * > 漏洩の正体は「道中の順位＝最終着順」なので、乱数で順位を動かす以外に隠す手がなかった。
     * > ★**どの振幅でも両立しないのは当然で、同じつまみで反対向きのことをさせていた**（裁定）
     *
     * ★**②は乱数で隠していたので、道中が 2.7〜3.5着 ふらつきました。**
     *   ③は隠していないので、★**道中は揃い、しかも漏れません。**
     */
    // ★走破タイムを入れ替えても、道中の並びは変わらない（＝結果が入っていない）
    const swapped = bs.map((b, i) => ({ ...b, finishSec: bs[bs.length - 1 - i]!.finishSec }));
    const a2 = mk({ formationSeed: 5 });
    const b2 = replayPositionModel({
      distanceMeter: 1600, spurtMetersLeft: 800, straightMetersLeft: 400, boundaries: swapped,
      strategyOf: (g) => (['nige', 'senko', 'sashi', 'oikomi'] as const)[(g - 1) % 4]!,
      formationSeed: 5,
    });
    const order = (m: ReturnType<typeof mk>, sec: number) =>
      [...m.at(sec)].sort((x, y) => y.meters - x.meters).map((h) => h.gate).join(',');
    // ★道中は同じ（走破タイムが違うのに）
    expect(order(b2, 20)).toBe(order(a2, 20));
    // ★★終盤は違う（着順が違うので収束先が違う）
    expect(order(b2, 96)).not.toBe(order(a2, 96));
  });

  it('★★中間境界は動く — **そこが漏洩の口だったから**', () => {
    /**
     * ★区間ごとに揺らぐ形（旧 `'exact'`）では、**境界ではちょうど 0** になります。
     *   そこでは `位置 + 脚質` から走破タイムが厳密に逆算でき、
     *   実測で**揺らぎをいくら強くしても残り800m の AUC は 0.931 のまま**でした
     *   （道中は 0.923 → 0.731 まで落ちるのに）。
     *
     * ★Q-P4-38 の生成器では、道中を**脚質から作る**ので、
     *   中間境界も**そもそも真の位置ではありません**。★逆算する手がかりがありません。
     */
    const m = mk({ formation: 1, formationSeed: 3 });
    let moved = 0;
    for (const b of bs) {
      if (Math.abs(m.at(b.spurtSec).find((h) => h.gate === b.gate)!.meters - 800) > 1) moved += 1;
      if (Math.abs(m.at(b.straightSec).find((h) => h.gate === b.gate)!.meters - 1200) > 1) moved += 1;
    }
    expect(moved).toBeGreaterThan(0);
    // ★それでも着順は動かない
    expect(finalOrderOf(m)).toEqual(EXPECTED);
  });

  it('★生成しなければ（formation: 0）中間境界は真実のまま = 逆算できる', () => {
    const m = mk({ formation: 0 });
    for (const b of bs) {
      expect(m.at(b.spurtSec).find((h) => h.gate === b.gate)!.meters).toBeCloseTo(800, 6);
    }
  });

  it('★揺らぎ 0 なら、シードを変えても何も変わらない（空振りでない対照）', () => {
    const a = mk({ jostle: 0, jostleSeed: 1, boundaryFidelity: 'shape' });
    const b = mk({ jostle: 0, jostleSeed: 999, boundaryFidelity: 'shape' });
    expect(JSON.stringify(a.at(40))).toBe(JSON.stringify(b.at(40)));
  });
});
