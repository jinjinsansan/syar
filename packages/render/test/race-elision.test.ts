/**
 * ★**見せない区間を「飛ばす」時計**（★2026-09-12・オーナー指示「不要な直線を削って」）
 *
 * ⚠️ ★ここが守るのは ★**「速く流していない」**ことです。
 *    ★2026-09-12、★私は「削る」を「速く流す」と読み替えて送りを 8 倍にし、
 *    ★オーナー評「★なぜ倍速にする？？ ★足が異常に早くなっています」で取り消しました。
 *    ★脚の回転は進んだ距離から決まるので、★送りを上げると ★**そのまま速くなります**。
 * → ★送りは 1 倍のまま、★時計から区間を取り除く。★それがこの検定の主題です。
 */
import { describe, it, expect } from 'vitest';
import {
  elidedWarp, raceEditElisions, timeWarpFor, ONE_TO_ONE_RATES, raceClockFor,
  type PhaseKnots,
} from '../src/index.js';

/** ★1600m のおよその折れ点（★`knotsFor` の実測に近い形） */
const KNOTS: PhaseKnots = {
  startSec: 0, startRealSec: 3.6, spurtSec: 49.4, straightSec: 76.2, goalSec: 76.2, finishSec: 102.5,
};

describe('見せない区間を飛ばす時計', () => {
  it('★★等速のままであること（★倍速で縮めていない）', () => {
    for (const [name, r] of Object.entries(ONE_TO_ONE_RATES)) {
      expect(r, `${name} が 1 倍ではありません`).toBe(1);
    }
    /** ★1 倍なら、★飛ばす前の尺は ★**走破タイムそのもの** */
    expect(timeWarpFor(KNOTS, ONE_TO_ONE_RATES).displaySec).toBeCloseTo(KNOTS.finishSec, 6);
  });

  it('★★取り除いた分だけ尺が短くなる', () => {
    const base = timeWarpFor(KNOTS, ONE_TO_ONE_RATES);
    const cut = elidedWarp(base, raceEditElisions(KNOTS));
    const removed = KNOTS.goalSec! - KNOTS.startRealSec!;
    expect(cut.displaySec).toBeCloseTo(base.displaySec - removed, 6);
    /** ★オーナーの選択「発走 ＋ 最後の直線 ＝ 約 30 秒」 */
    expect(cut.displaySec).toBeGreaterThan(25);
    expect(cut.displaySec).toBeLessThan(34);
  });

  it('★★飛ばした先はゴール前。★飛ばす前は発走のまま', () => {
    const cut = elidedWarp(timeWarpFor(KNOTS, ONE_TO_ONE_RATES), raceEditElisions(KNOTS));
    /** ★跳びの手前 */
    expect(cut.raceSecAt(3.5)).toBeCloseTo(3.5, 6);
    /** ★跳びの直後 ＝ ゴール前の等速が始まる地点 */
    expect(cut.raceSecAt(3.6)).toBeCloseTo(KNOTS.goalSec!, 6);
    /** ★終点は走破タイム（★本編が途中で切れない） */
    expect(cut.raceSecAt(cut.displaySec)).toBeCloseTo(KNOTS.finishSec, 6);
  });

  /**
   * ⚠️ ★**跳び以外では時計が飛ばないこと**（★ここが商品の要件です）。
   *    ★裸の跳びが混ざると「馬が瞬間移動した」に見えます。★跳びは 1 か所だけで、
   *    ★そこはカットインが覆います。
   */
  it('★★跳びは 1 か所だけ（★他の場所では等速で進む）', () => {
    const cut = elidedWarp(timeWarpFor(KNOTS, ONE_TO_ONE_RATES), raceEditElisions(KNOTS));
    const step = 0.05;
    const jumps: number[] = [];
    for (let d = 0; d < cut.displaySec - step; d += step) {
      const rate = (cut.raceSecAt(d + step) - cut.raceSecAt(d)) / step;
      expect(rate, `${d.toFixed(2)} 秒で時計が逆行しています`).toBeGreaterThanOrEqual(0);
      if (rate > 1.05) jumps.push(d);
    }
    expect(jumps.length, `跳びが ${jumps.length} 箇所あります: ${jumps.map((j) => j.toFixed(2)).join(' ')}`)
      .toBeLessThanOrEqual(1);
  });

  it('★★往復で戻る（★飛ばした区間の中は入口へ丸める）', () => {
    const cut = elidedWarp(timeWarpFor(KNOTS, ONE_TO_ONE_RATES), raceEditElisions(KNOTS));
    for (const d of [0, 1, 3.5, 3.6, 10, 20, 29]) {
      if (d > cut.displaySec) continue;
      expect(cut.displaySecAt(cut.raceSecAt(d)), `表示 ${d} 秒`).toBeCloseTo(d, 6);
    }
    /** ★飛ばした区間の中（★道中）を渡したら、★跳びの位置を返す */
    expect(cut.displaySecAt(30)).toBeCloseTo(KNOTS.startRealSec!, 6);
  });

  /**
   * ⚠️ ★**`?pace=short` 以外は 1 ビットも変わらないこと**（★R-27・狭い側へ倒す）。
   *    ★既定をまだ変えていないので、★ここが変わっていたら事故です。
   */
  it('★★既定（readable）と従来（legacy）の時計は取り除かない', () => {
    const plain = timeWarpFor(KNOTS, ONE_TO_ONE_RATES);
    for (const policy of ['readable', 'legacy'] as const) {
      const w = raceClockFor(KNOTS, 1600, policy);
      expect(w.raceSecAt(w.displaySec)).toBeCloseTo(KNOTS.finishSec, 6);
      /** ★取り除いていない＝跳びが無い */
      const step = w.displaySec / 400;
      for (let i = 0; i < 400; i += 1) {
        const rate = (w.raceSecAt((i + 1) * step) - w.raceSecAt(i * step)) / step;
        expect(rate, `${policy} の ${i} コマ目で跳んでいます`).toBeLessThan(9);
      }
    }
    expect(raceClockFor(KNOTS, 1600, 'short').displaySec).toBeLessThan(plain.displaySec);
  });
});
