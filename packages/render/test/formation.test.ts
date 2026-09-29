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
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  replayPositionModel, finalOrderOf, slotOf, packSpreadM, convergeAt, FORM_PULL_CAP_M, FORM_PULL_RAMP_M,
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
    /**
     * ⚠️ ★**測る点をずらしました。理由を書きます（通す都合ではありません）。**
     *
     *   以前は t=6 秒（＝**発走から約 96m**）から測っていました。
     *   ★動画を見て「**発走 0.25秒で先頭が 18.3m 進む**（＝73 m/s）」が見つかり、
     *     隊列を**発走から 250m かけて組み上げる**ように直しました（`formStartRamp`）。
     *   → t=6 秒は**まだ隊列ができていない区間**です。そこを「道中」として測ると、
     *     ★**隊列が組み上がる動き**を「道中の揺れ」として数えてしまいます。
     *
     *   ★**この検査が見たいのは「道中で順位がガチャガチャしないこと」**なので、
     *     隊列ができてから（250m 以降）を測ります。
     *     ⚠️ 組み上がるまでの動きは、別の検査（★下の「立ち上がりで飛ばない」）で見ます。
     */
    const pts = [18, 22, 26, 30].map((t) => rankAt(m, t));
    let move = 0, n = 0;
    for (let i = 1; i < pts.length; i++) {
      for (const g of pts[i]!) move += Math.abs(pts[i]!.indexOf(g) - pts[i - 1]!.indexOf(g));
      n += pts[i]!.length;
    }
    // ★jostle のときは 2.7〜3.5着 動いていた
    expect(move / n).toBeLessThan(0.5);
  });

  /**
   * ★★**発走で飛ばないこと**（⚠️ 動画を見て見つけた不具合）。
   *
   *   実測: 発走 0.25秒で先頭が **18.3m**（＝**73 m/s**）進んでいました。
   *   ★`convergeAt` が残り 1000m 以上で 1 を返すので、
   *     **ゲートが開いた瞬間に隊列（前後 27m）へ飛んでいました。**
   *
   *   ⚠️ ★**数字も静止画も、これを捕まえませんでした。** 動かして初めて見えました。
   */
  it('★★発走で瞬間移動しない（画面上の速度が馬の速度を超えない）', () => {
    const m = mk();
    const MAX_MPS = 22;   // ★競走馬の最高速はおよそ 18〜19 m/s。余裕を見て 22
    let prev = m.at(0).map((h) => h.meters);
    for (let t = 0.25; t <= 40; t += 0.25) {
      const now = m.at(t).map((h) => h.meters);
      now.forEach((v, i) => {
        const mps = (v - prev[i]!) / 0.25;
        expect(mps).toBeLessThan(MAX_MPS);
      });
      prev = now;
    }
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

/**
 * ★**大差のレース**（★2026-09-29・オーナー「あり得ないスピード」・レビュー側 ③ 案 A）
 *
 *   ★隊列の中心は全馬の平均なので、★勝ち馬から何十秒も離れた馬がいると ★中心が何百 m も後ろに残り、
 *   ★先頭が中心へ引き戻されたまま ★`finishSec` で真の位置へ跳んでいた（★直す前の実測 1 コマ最大 970 m/秒）。
 *   → ★寄せる量を `FORM_PULL_CAP_M` で丸め、★自分の残り距離で 0 へ細らせる。
 */
describe('★大差のレースでも あり得ない速さを出さない', () => {
  /** ★利用者から見た「直った」の線: 実馬は 17〜18 m/秒 */
  const MAX_FRAME_MPS = 20;
  const DT = 1 / 60;
  const fieldOf = (gaps: readonly number[], dist: number) => {
    const win = dist / 15.72;
    return gaps.map((g, i) => {
      const finish = win + g;
      /** ★区間は走破タイムの按分（★真の速さは一定＝実馬の範囲・★丸めが足した速さだけが上に出る） */
      return { gate: i + 1, startSec: 0, spurtSec: finish * (dist - 800) / dist, straightSec: finish * (dist - 400) / dist, finishSec: finish };
    });
  };
  const modelOf = (gaps: readonly number[], dist: number, over?: Record<string, unknown>) => replayPositionModel({
    distanceMeter: dist, spurtMetersLeft: 800, straightMetersLeft: 400, boundaries: fieldOf(gaps, dist),
    strategyOf: (g) => STRAT[(g - 1) % 4]!, pace: 'middle', formationSeed: 4242, ...over,
  });
  const LARGE: readonly (readonly number[])[] = [
    [0, 0.3, 0.6, 1, 1.5, 2, 3, 5, 8, 12, 20, 30],
    [0, 4, 8, 12, 16, 20, 24, 28],
    [0, 0.2, 0.4, 25, 26, 27, 40, 41, 42, 43],
  ];

  it('★① どのコマでも 1 コマあたりの速さが 20 m/秒を超えない（★1/60 秒ごと・大差 × 距離）', () => {
    let worst = 0;
    for (const gaps of LARGE) for (const dist of [1200, 2400]) {
      const m = modelOf(gaps, dist);
      const end = dist / 15.72 + gaps[gaps.length - 1]! + 1;
      let prev = m.at(0).map((h) => h.meters);
      for (let i = 1; i * DT <= end; i++) {
        const now = m.at(i * DT).map((h) => h.meters);
        now.forEach((v, j) => {
          const mps = (v - prev[j]!) / DT;
          worst = Math.max(worst, mps);
          expect(mps, `dist=${dist} gaps=${gaps.join(',')} t=${(i * DT).toFixed(2)} gate=${j + 1}`).toBeLessThanOrEqual(MAX_FRAME_MPS);
          expect(mps).toBeGreaterThanOrEqual(-1e-6);
        });
        prev = now;
      }
    }
    expect(worst).toBeGreaterThan(10);
  });

  it('★② 着順は丸めの後も動かない（D-059）', () => {
    for (const gaps of LARGE) for (const dist of [1200, 3200]) {
      expect(finalOrderOf(modelOf(gaps, dist))).toEqual(finalOrderOf(modelOf(gaps, dist, { formation: 0 })));
    }
  });

  /**
   * ★③ 通常のレース（★上の 12 頭・0.5 秒刻み）では ★丸めが 1 度も効かない ＝ ★直す前と同じ位置。
   *   ★効いていないことは「寄せた量 < 上限」で確かめる（★上限に当たった所だけが丸めで変わる）。
   */
  it('★③ 通常のレースでは 丸めが 1 度も効かない（寄せた量は どのコマでも上限より小さい）', () => {
    const m = mk();
    const truth = mk({ formation: 0 });
    let maxPull = 0;
    for (let t = 0; t <= 102; t += DT) {
      const shown = m.at(t);
      const real = truth.at(t);
      shown.forEach((h, j) => {
        const pull = Math.abs(h.meters - real[j]!.meters);
        maxPull = Math.max(maxPull, pull);
        const cap = FORM_PULL_CAP_M * Math.min(1, Math.max(0, 1600 - real[j]!.meters) / FORM_PULL_RAMP_M);
        expect(pull, `t=${t.toFixed(2)} gate=${h.gate}`).toBeLessThan(Math.max(cap, 1e-9));
      });
    }
    expect(maxPull).toBeGreaterThan(1);
  });

  /** ★④ `a`（寄せる強さ）は全馬共通のまま（Q-P4-38）。★中心と強さだけから作り、馬ごとの値を読まない */
  it('★④ 寄せる強さ a は 隊列の中心と強さだけから作る（Q-P4-38）', () => {
    const src = readFileSync(path.resolve(__dirname, '../src/replay-model.ts'), 'utf8');
    expect(src).toMatch(/const a = convergeAt\(distanceMeter - centre\)\s*\n\s*\* formStartRamp\(centre\)\s*\n\s*\* Math\.max\(0, Math\.min\(1, strength\)\);/);
    expect(src).toContain('const pull = Math.max(-cap, Math.min(cap, a * (form - truth)));');
  });
});
