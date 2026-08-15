/**
 * ★隊列の生成（Q-P4-38・レビュー側裁定 2026-08-15）
 *
 * 【★この検査が守るもの】
 *   ① ★**漏れない** — 道中の位置に走破タイムが入っていない
 *   ② ★**読める**   — 通過順位が `1-1-1-1` のように揃う（乱数の揺れではない）
 *   ③ ★**着順は動かない**（D-059）
 *   ④ ★**位置は後戻りしない**（馬が下がって見えない）
 *   ⑤ ★**横位置 `w` も同じ生成器から出る**（Q-P4-29）
 */
import { describe, it, expect } from 'vitest';
import {
  replayPositionModel, finalOrderOf, slotOf, packSpreadM, convergeAt, TRACK_WIDTH_M, laneAtStart, laneAt,
  type FormStrategy,
} from '../src/index.js';

const STRAT: FormStrategy[] = ['nige', 'senko', 'sashi', 'oikomi'];
/** ★馬番と着順が**逆**の出走表（漏れていれば道中で 12→1 の並びが見える） */
const boundaries = Array.from({ length: 12 }, (_, i) => {
  const gate = i + 1;
  const finish = 96 + (12 - gate) * 0.5;   // ★12番が最速
  return { gate, startSec: 0, spurtSec: finish * 0.5, straightSec: finish * 0.75, finishSec: finish };
});
const mk = (over?: Record<string, unknown>) => replayPositionModel({
  distanceMeter: 1600, spurtMetersLeft: 800, straightMetersLeft: 400, boundaries,
  strategyOf: (g) => STRAT[(g - 1) % 4]!, pace: 'middle', formationSeed: 4242, ...over,
});
const rankAt = (m: ReturnType<typeof mk>, sec: number): number[] =>
  [...m.at(sec)].sort((a, b) => b.meters - a.meters).map((h) => h.gate);

describe('★隊列の生成', () => {
  it('★★道中の順位は脚質で決まる（走破タイムの順ではない）', () => {
    const m = mk();
    const mid = rankAt(m, 20);
    const truth = finalOrderOf(m);
    // ★着順は 12,11,10,… だが、道中は脚質順（逃げが前）になっているはず
    expect(mid).not.toEqual(truth);
    // 先頭集団は逃げ（gate % 4 === 1）が占める
    const front = mid.slice(0, 3);
    expect(front.every((g) => STRAT[(g - 1) % 4] === 'nige')).toBe(true);
  });

  it('★★道中の通過順位が揃う（1-1-1-1 の形。乱数の揺れではない）', () => {
    const m = mk();
    // 残り1600〜900m を4点
    const pts = [6, 14, 22, 30].map((t) => rankAt(m, t));
    let move = 0, n = 0;
    for (let i = 1; i < pts.length; i++) {
      for (const g of pts[i]!) move += Math.abs(pts[i]!.indexOf(g) - pts[i - 1]!.indexOf(g));
      n += pts[i]!.length;
    }
    // ★jostle のときは 2.7〜3.5着 動いていた
    expect(move / n).toBeLessThan(0.5);
  });

  it('★★終盤は真の順位へ収束する', () => {
    const m = mk();
    expect(rankAt(m, 95)).toEqual(finalOrderOf(m));
  });

  it('★★着順は生成器で動かない（D-059）', () => {
    const base = finalOrderOf(mk({ formation: 0 }));
    for (const seed of [1, 4242, 99999]) {
      expect(finalOrderOf(mk({ formationSeed: seed }))).toEqual(base);
    }
  });

  it('★位置は後戻りしない（馬が下がって見えない）', () => {
    const m = mk();
    let prev = m.at(0).map((h) => h.meters);
    for (let t = 0.25; t <= 102; t += 0.25) {
      const now = m.at(t).map((h) => h.meters);
      now.forEach((v, i) => expect(v).toBeGreaterThanOrEqual(prev[i]! - 1e-6));
      prev = now;
    }
  });

  it('★同じシードから同じ映像（乱数を直接呼んでいない・憲法4）', () => {
    expect(JSON.stringify(mk().at(30))).toBe(JSON.stringify(mk().at(30)));
  });

  /**
   * ★★**2026-08-15 に、この検査の要求が反転しました。**
   *
   * 【旧】`w` は脚質から作る（逃げは内・追込は外）— Q-P4-29
   * 【新】★**`w` を脚質から作ってはいけない**（レビュー側が撤回）
   *   > それでは `w` も**出走表から予測でき**、V-16 ① が成立しません。
   *   > → `w` は**シードから引かれ、距離ロスを通じて着順に効き、
   *   >   レース中に段階的に判明する**ものにしてください。
   */
  it('★★w は脚質から予測できない（出走表に無い情報である）', () => {
    /**
     * ⚠️ ★最初は「同じ時刻の w が一致すること」で検査し、**落ちました**。
     *    `w` は**その馬の残り距離**で決まるので、脚質が**位置を通して間接的に**効きます
     *    （逃げ馬は同じ時刻でも先にいるので、`w` も先の値になる）。
     *    ★**それは漏洩ではありません。** 漏洩になるのは
     *    「**同じ地点での `w` が脚質で決まる**」場合です。
     * → ★**同じ残り距離で比べます。**
     */
    const wAtLeft = (m: ReturnType<typeof mk>, gate: number, left: number): number => {
      let lo = 0, hi = 120;
      for (let i = 0; i < 60; i++) {
        const mid = (lo + hi) / 2;
        const h = m.at(mid).find((x) => x.gate === gate)!;
        if (1600 - h.meters > left) lo = mid; else hi = mid;
      }
      return m.at(hi).find((x) => x.gate === gate)!.w ?? 0;
    };
    const a2 = mk();
    const b2 = replayPositionModel({
      distanceMeter: 1600, spurtMetersLeft: 800, straightMetersLeft: 400, boundaries,
      strategyOf: (g) => STRAT[(g + 1) % 4]!,   // ★脚質を総取り替え
      pace: 'middle', formationSeed: 4242,
    });
    for (const gate of [1, 5, 9, 12]) {
      for (const left of [1200, 800, 400]) {
        expect(wAtLeft(b2, gate, left)).toBeCloseTo(wAtLeft(a2, gate, left), 3);
      }
    }
  });

  it('★★w を作る関数は、そもそも脚質を受け取らない', () => {
    // ★型と引数の形で保証する（実装が変わっても、脚質が入り込む余地がない）
    expect(laneAt.length).toBe(6);   // gate, fieldSize, widthM, metersLeft, distance, seed
  });

  it('★★w はシードで変わる（レース中に決まる情報）', () => {
    const a2 = mk({ formationSeed: 1 });
    const b2 = mk({ formationSeed: 2 });
    const wOf = (m: ReturnType<typeof mk>, sec: number) =>
      m.at(sec).map((h) => (h.w ?? 0).toFixed(4)).join(',');
    expect(wOf(b2, 60)).not.toBe(wOf(a2, 60));
  });

  it('★★w は段階的に開く（発走時は枠順どおり・進むほどばらける）', () => {
    const m = mk();
    const spread = (sec: number) => {
      const ws = m.at(sec).map((h) => h.w ?? 0);
      // ★枠順どおりの並びからのずれ
      const sorted = [...m.at(sec)].sort((x, y) => x.gate - y.gate).map((h) => h.w ?? 0);
      let dev = 0;
      for (let i = 1; i < sorted.length; i++) dev += Math.abs(sorted[i]! - sorted[i - 1]!);
      void ws;
      return dev;
    };
    const early = spread(2);
    const late = spread(90);
    // ★発走直後は枠順どおり（隣との差がほぼ一定 = ずれが小さい）
    expect(late).toBeGreaterThan(early * 1.5);
  });

  it('★w は走路の内側に収まる', () => {
    const m = mk();
    for (const sec of [0, 20, 50, 80, 99]) {
      for (const h of m.at(sec)) {
        expect(h.w ?? -1).toBeGreaterThan(0.5);
        expect(h.w ?? 1e9).toBeLessThan(TRACK_WIDTH_M - 0.5);
      }
    }
  });

  it('★生成器そのもの: スロット・広がり・収束', () => {
    expect(slotOf('nige', 1, 7)).toBeLessThan(slotOf('oikomi', 1, 7));
    expect(packSpreadM(1200)).toBeCloseTo(24, 5);
    expect(packSpreadM(0)).toBeGreaterThan(packSpreadM(800));
    expect(convergeAt(1600)).toBeCloseTo(1, 5);
    expect(convergeAt(200)).toBeCloseTo(0, 5);
    expect(convergeAt(0)).toBeCloseTo(0, 5);
    // ★発走時の横位置は枠順どおり（内枠ほど内）
    expect(laneAtStart(1, 12, 25)).toBeLessThan(laneAtStart(12, 12, 25));
  });
});
