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
  replayPositionModel, finalOrderOf, slotOf, packSpreadM, convergeAt,
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
  /**
   * ★★**2026-08-16 に、この検査の対象が移りました。**
   *
   * 【旧】`w` を描画層が引き、脚質から予測できないことを見る
   * 【新】★**`w` は描画層では引かない**（D-071）。
   *   > `w` は着順に効く以上、**レースの結果の一部**であり、描画層が引くのは責務が逆。
   *   > ★**2か所で引けば必ず離れる。**
   *   → ★`w` の性質（脚質から予測できない・シードで変わる・段階的に開く）は
   *     **エンジン側の検査**（`race-engine/test/lane.test.ts`）と **V-18** が見ます。
   *     ここは「**受け取ったものをそのまま出しているか**」だけを見ます。
   */
  it('★★w はエンジンから受け取る（この層では作らない）', () => {
    const seen: number[] = [];
    const m = replayPositionModel({
      distanceMeter: 1600, spurtMetersLeft: 800, straightMetersLeft: 400, boundaries,
      strategyOf: (g) => STRAT[(g - 1) % 4]!, pace: 'middle', formationSeed: 4242,
      laneOf: (gate, metersLeft) => { seen.push(gate); return 3 + (gate % 5) + metersLeft / 10000; },
    });
    const at = m.at(30);
    expect(seen.length).toBeGreaterThan(0);
    for (const h of at) {
      const expected = 3 + (h.gate % 5) + (1600 - h.meters) / 10000;
      expect(h.w ?? -1).toBeCloseTo(expected, 9);
    }
  });

  it('★渡さなければ w は 0（＝内/外が画面に出ない）', () => {
    const m = replayPositionModel({
      distanceMeter: 1600, spurtMetersLeft: 800, straightMetersLeft: 400, boundaries,
      strategyOf: (g) => STRAT[(g - 1) % 4]!, pace: 'middle', formationSeed: 1,
    });
    for (const h of m.at(30)) expect(h.w).toBe(0);
  });

  it('★生成器そのもの: スロット・広がり・収束', () => {
    expect(slotOf('nige', 1, 7)).toBeLessThan(slotOf('oikomi', 1, 7));
    expect(packSpreadM(1200)).toBeCloseTo(24, 5);
    expect(packSpreadM(0)).toBeGreaterThan(packSpreadM(800));
    expect(convergeAt(1600)).toBeCloseTo(1, 5);
    expect(convergeAt(200)).toBeCloseTo(0, 5);
    expect(convergeAt(0)).toBeCloseTo(0, 5);
  });
});
