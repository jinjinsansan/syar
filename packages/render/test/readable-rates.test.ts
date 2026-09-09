/**
 * ★**画面の既定（`readable`）の時間写像**を見る（★2026-09-09・F-1・裁定 §3 Q-1a-3/4）
 *
 * 【★なぜ別のファイルなのか】
 *   ★`time-target.test.ts` は ★`ratesForTarget`（★従来方式・切らない）を測っています。
 *   ★画面の既定は ★`readableRaceRates`（★逆算してから 2 倍で切る）なので、
 *   ★**あちらが全部通っても、画面の既定については何も言えていません**（★裁定 §2 F-1）。
 *
 * 【★ここで見るもの】
 *   ★① 時間写像が ★有限で ★単調（★逆行しない・止まらない）
 *   ★② ★終点が最終ゴール時刻（★本編が途中で切れない・馬が置き去りにならない）
 *   ★③ ★どの局面も ★`READABLE_MAX_RATE` を超えない
 *   ★④ ★発走とゴール前は ★等速のまま（★可読性のために実時間を壊さない）
 *   ★⑤ ★目標が実現できるときは ★**目標の変更が時計に出る**（★引数を無視する実装を通さない）
 *   ★⑥ ★実現できないときは ★**上限を超えて圧縮しない**。★差は `racePaceReport` に残る
 *   ★⑦ ★**常に 2 倍を返すだけの実装**を通さない（★目標が緩ければ 2 倍未満になる）
 *
 * ⚠️ ★実測値をそのまま期待値へ写さないこと（★裁定 §3）。
 *    ★ここで固定するのは ★**性質**であって、★いまの秒数ではありません。
 *    ★65〜66 秒などは ★現状の測定値であって ★承認済みの許容帯ではありません。
 */
import { describe, it, expect } from 'vitest';
import {
  timeWarpFor, ratesForTarget, ratesForPolicy, racePaceReport, targetDisplaySec,
  READABLE_MAX_RATE, GOAL_RATE, GOAL_REAL_TIME_M, START_REAL_TIME_M, type PhaseKnots,
} from '../src/index.js';

/**
 * 距離 → だいたいの走破タイムで knots を作る。
 * ⚠️ ★`goalSec` / `startRealSec` を入れること（★本番の `knotsFor` は必ず入れます）。
 *    ★入れずに測ると**実時間区間が無い別の構成**を測ることになります。
 */
function knotsOf(distanceMeter: number): PhaseKnots {
  const finish = distanceMeter / 15.6;
  const perM = finish / distanceMeter;
  const straightSec = (distanceMeter - 400) * perM;
  const straightRace = finish - straightSec;
  return {
    startSec: 0,
    spurtSec: (distanceMeter - 800) * perM,
    straightSec,
    finishSec: finish,
    goalSec: straightSec + straightRace * (1 - GOAL_REAL_TIME_M / 400),
    startRealSec: START_REAL_TIME_M * perM,
  };
}
const DISTANCES = [1200, 1400, 1600, 2000, 2400, 3000, 3600] as const;
const readableWarp = (d: number, target = targetDisplaySec(d)) => {
  const k = knotsOf(d);
  return { k, w: timeWarpFor(k, ratesForPolicy(k, target, 'readable')) };
};

describe('★画面の既定（readable）の時間写像', () => {
  it('★★時間写像が有限で単調（★逆行しない・止まらない）', () => {
    for (const d of DISTANCES) {
      const { w } = readableWarp(d);
      expect(Number.isFinite(w.displaySec)).toBe(true);
      expect(w.displaySec).toBeGreaterThan(0);
      let prev = -Infinity;
      for (let i = 0; i <= 200; i++) {
        const race = w.raceSecAt((w.displaySec * i) / 200);
        expect(Number.isFinite(race)).toBe(true);
        // ★等しいのは許す（実時間区間の端）。★**戻ってはいけない**
        expect(race).toBeGreaterThanOrEqual(prev - 1e-9);
        prev = race;
      }
    }
  });

  it('★★終点が最終ゴール時刻（★本編が途中で切れない）', () => {
    for (const d of DISTANCES) {
      const { k, w } = readableWarp(d);
      expect(w.raceSecAt(w.displaySec)).toBeCloseTo(k.finishSec, 6);
    }
  });

  it('★★どの局面も可読性の上限を超えない', () => {
    for (const d of DISTANCES) {
      const k = knotsOf(d);
      const r = ratesForPolicy(k, targetDisplaySec(d), 'readable');
      for (const phase of ['cruise', 'spurt', 'straight'] as const) {
        expect(r[phase], `${d}m の ${phase}`).toBeLessThanOrEqual(READABLE_MAX_RATE + 1e-12);
      }
    }
  });

  it('★★実際に画面上を進む速さも上限の内側（★区間ではなく写像で測る）', () => {
    for (const d of DISTANCES) {
      const { w } = readableWarp(d);
      const step = w.displaySec / 400;
      for (let i = 0; i < 400; i++) {
        const rate = (w.raceSecAt((i + 1) * step) - w.raceSecAt(i * step)) / step;
        expect(rate, `${d}m の ${i} コマ目`).toBeLessThanOrEqual(READABLE_MAX_RATE + 1e-6);
      }
    }
  });

  it('★★発走とゴール前は等速のまま（★可読性のために実時間を壊さない）', () => {
    for (const d of DISTANCES) {
      const r = ratesForPolicy(knotsOf(d), targetDisplaySec(d), 'readable');
      expect(r.start).toBe(GOAL_RATE);
      expect(r.goal).toBe(GOAL_RATE);
    }
  });

  /**
   * ⚠️ ★**可読性方針では `spurt` / `straight` は常に切られます**（★2026-09-09・実測で判明）。
   *
   *   ★`FIXED_SPURT_RATE = 5.2` と `FIXED_STRAIGHT_RATE = 2.1` は ★**定数**であって、
   *   ★目標には反応しません。★どちらも `READABLE_MAX_RATE = 2` を超えているので、
   *   ★**目標をどんなに緩くしても、この 2 つは切られたまま**です。
   *
   * ⚠️ ★**「だから目標に届かない」ではありません**（★2026-09-09・第 2 便の裁定 §3 F-4 で撤回）。
   *    ★切られるのは ★`spurt` / `straight` の**倍率**であって、★**尺の達成可否とは別**です。
   *    ★切ったあとの区間時間で `cruise` を逆算すれば、★**達成できる領域では目標に一致します**
   *    （★下の「達成できる目標では、実尺が目標に合う」）。
   *    ★合成 knots の 2400m で ★達成領域は ★約 91.23〜140.50 秒。★本番の 45.7 秒はその外です。
   */
  it('★★可読性方針では、目標を緩くしても spurt / straight は切られたまま', () => {
    for (const target of [40, 120, 260, 600]) {
      const rep = racePaceReport(knotsOf(2400), target, 'readable');
      expect(rep.cappedPhases, `目標 ${target} 秒`).toContain('spurt');
      expect(rep.cappedPhases, `目標 ${target} 秒`).toContain('straight');
    }
  });

  /**
   * ★**達成できる目標なら、実尺は目標に合うこと**（★2026-09-09・F-4・裁定 §3）
   *
   * ⚠️ ★以前はここが ★**ずれていました**。★勝負所 5.2 倍・直線 2.1 倍で組んだ区間時間から
   *    ★道中を逆算し、★そのあとで 3 つとも 2 倍に切っていたためです。
   *    ★切ると勝負所と直線は**伸びる**のに、★道中を**そのまま**にしていました。
   *
   *    ★実測（2400m・目標 100 秒）: ★旧 107.521 秒（★+7.5）→ ★新 ★**100.000 秒**
   *
   * ⚠️ ★「目標を延ばせば実尺も延びる」だけでは ★**この不具合を捕まえられません**
   *    （★ずれたまま単調でありうる）。★**目標そのものに合うこと**を見ます。
   */
  it('★★達成できる目標では、実尺が目標に合う（★F-4）', () => {
    const k = knotsOf(2400);
    for (const target of [95, 100, 110, 120, 135]) {
      const rep = racePaceReport(k, target, 'readable');
      expect(rep.saturation, `目標 ${target} 秒は端に張り付いていないこと`).toBe(null);
      expect(rep.achieved, `目標 ${target} 秒: 実尺 ${rep.displaySec}`).toBe(true);
      expect(Math.abs(rep.overshootSec)).toBeLessThan(rep.toleranceSec);
      // ★達成しても、★上限と等速区間は守られていること
      expect(rep.rates.spurt).toBeLessThanOrEqual(READABLE_MAX_RATE + 1e-12);
      expect(rep.rates.straight).toBeLessThanOrEqual(READABLE_MAX_RATE + 1e-12);
      expect(rep.rates.start).toBe(GOAL_RATE);
      expect(rep.rates.goal).toBe(GOAL_RATE);
    }
  });

  it('★★目標の変更が時計に出る（★目標引数を無視する実装を通さない）', () => {
    /**
     * ★自由度は `cruise` だけなので、★**端に張り付いていない**目標で測ります。
     * ⚠️ ★張り付いている所で「目標が効くか」を測ってはいけません
     * （★何を測っても平らで、★壊れていても通ります）。
     */
    const k = knotsOf(2400);
    const loose = racePaceReport(k, 100, 'readable');
    const looser = racePaceReport(k, 120, 'readable');
    for (const rep of [loose, looser]) {
      expect(rep.saturation, '★端に張り付いていないこと').toBe(null);
      expect(rep.rates.cruise).toBeGreaterThan(1);
      expect(rep.rates.cruise).toBeLessThan(READABLE_MAX_RATE);
    }
    // ★目標を 20 秒延ばしたら、★実尺も延びること
    expect(looser.displaySec).toBeGreaterThan(loose.displaySec + 10);
  });

  /**
   * ⚠️ ★**本番の目標では、目標を動かしても尺が変わりません**（★上限に張り付いているため）。
   *    ★これは ★`targetDisplaySec` を変えて尺を詰める道が ★**塞がっている**ということです。
   *    ★留めておかないと、★「目標を縮めたのに画面が変わらない」で ★また 1 往復を捨てます
   *    （★2026-08-21 に同じ形の事故がありました）。
   */
  it('★★本番の目標では、目標を動かしても尺が変わらない（★上限に張り付いている）', () => {
    const k = knotsOf(2400);
    const atTarget = racePaceReport(k, targetDisplaySec(2400), 'readable');
    const halved = racePaceReport(k, targetDisplaySec(2400) / 2, 'readable');
    expect(atTarget.rates.cruise).toBe(READABLE_MAX_RATE);
    expect(halved.displaySec).toBeCloseTo(atTarget.displaySec, 9);
  });

  it('★★目標が達成できないときは、上限を超えて圧縮しない（★制約のほうを優先する）', () => {
    const d = 2400;
    const rep = racePaceReport(knotsOf(d), targetDisplaySec(d), 'readable');
    // ★端に張り付いている＝これ以上速くできない
    expect(rep.saturation).toBe('max');
    expect(rep.achieved).toBe(false);
    expect(rep.displaySec).toBeGreaterThan(rep.targetSec);
    // ★それでも上限は破らない
    for (const phase of ['cruise', 'spurt', 'straight'] as const) {
      expect(rep.rates[phase]).toBeLessThanOrEqual(READABLE_MAX_RATE + 1e-12);
    }
  });

  it('★★目標をいくら短くしても、上限より速くならない（★詰め込みで潰さない）', () => {
    const k = knotsOf(3000);
    for (const target of [1, 5, 20]) {
      const r = ratesForPolicy(k, target, 'readable');
      for (const phase of ['cruise', 'spurt', 'straight'] as const) {
        expect(r[phase]).toBeLessThanOrEqual(READABLE_MAX_RATE + 1e-12);
      }
    }
  });

  it('★★「cruise も常に上限を返すだけ」の実装を通さない', () => {
    // ★目標が緩ければ `cruise` は上限未満（★ここだけが目標に反応します）
    expect(ratesForPolicy(knotsOf(2400), 260, 'readable').cruise).toBeLessThan(READABLE_MAX_RATE);
    // ★目標が厳しければ上限に張り付く
    expect(ratesForPolicy(knotsOf(2400), 30, 'readable').cruise).toBe(READABLE_MAX_RATE);
  });

  it('★★従来方式へ戻せる（`?motion=legacy` が別物であること）', () => {
    const k = knotsOf(1600);
    const target = targetDisplaySec(1600);
    const legacy = ratesForPolicy(k, target, 'legacy');
    const readable = ratesForPolicy(k, target, 'readable');
    // ★方針が違えば送り速さも違う（★同じなら分岐が死んでいる）
    expect(legacy.spurt).toBeGreaterThan(readable.spurt);
    // ★`legacy` は `ratesForTarget` そのもの
    expect(legacy).toEqual(ratesForTarget(k, target));
    // ★従来方式のほうが尺は短い（★切っていないぶん詰められる）
    expect(timeWarpFor(k, legacy).displaySec).toBeLessThan(timeWarpFor(k, readable).displaySec);
  });

  /**
   * ⚠️ ★**`cappedPhases` と「目標の成否」は別のこと**（★2026-09-09・F-5・裁定 §4）
   *
   *   ★以前ここは「★切られていれば必ず超過が正」と書いていました。★**偽です。**
   *   ★既定の短い目標しか走査していなかったので通っていただけです。
   *   ★裁定が挙げた反例をそのまま検定にします。
   */
  it('★★「切られた」と「達成できない」を同義にしない（★F-5 の反例 2 件）', () => {
    const k = knotsOf(2400);

    // ★反例① ★`legacy`・目標 1 秒 … ★切られていないのに ★大きく超過する
    const legacyTiny = racePaceReport(k, 1, 'legacy');
    expect(legacyTiny.cappedPhases, '★可読性の上限を使っていないので空').toEqual([]);
    expect(legacyTiny.saturation).toBe('max');
    expect(legacyTiny.achieved, '★空でも達成できていない').toBe(false);
    expect(legacyTiny.overshootSec).toBeGreaterThan(40);

    // ★反例② ★`readable`・目標 150 秒 … ★切られているのに ★超過は**負**（★目標より短い）
    const readableLong = racePaceReport(k, 150, 'readable');
    expect(readableLong.cappedPhases).toEqual(['spurt', 'straight']);
    expect(readableLong.saturation).toBe('min');
    expect(readableLong.achieved).toBe(false);
    expect(readableLong.overshootSec, '★切られていても超過が負になりうる').toBeLessThan(0);

    // ★対照 ★切られていても ★達成できる場合がある（★F-4 を直したので成立します）
    const achievable = racePaceReport(k, 100, 'readable');
    expect(achievable.cappedPhases).toEqual(['spurt', 'straight']);
    expect(achievable.achieved, '★切られていても達成しうる').toBe(true);
  });

  /**
   * ★**端にいることと、達成できないことは別**（★2026-09-09・第 3 便の裁定 §F-5）。
   *   ★端そのものを目標にすれば ★両立します。★注記だけでなく検定でも押さえます。
   */
  it('★★端に張り付いていても達成しうる（★saturation と achieved は別）', () => {
    const k = knotsOf(2400);
    // ★達成領域の最短端（★cruise が上限）をそのまま目標にする
    const shortest = racePaceReport(k, 200, 'readable').displaySec; // ★下限側で最長
    const fastest = racePaceReport(k, 1, 'readable').displaySec;    // ★上限側で最短
    for (const edge of [fastest, shortest]) {
      const rep = racePaceReport(k, edge, 'readable');
      expect(rep.saturation, `端 ${edge} 秒`).not.toBe(null);
      expect(rep.achieved, `端 ${edge} 秒は達成できている`).toBe(true);
    }
  });

  it('★racePaceReport の実尺が、実際に組んだ時計と一致する', () => {
    for (const d of DISTANCES) {
      const rep = racePaceReport(knotsOf(d), targetDisplaySec(d), 'readable');
      expect(rep.displaySec).toBeCloseTo(readableWarp(d).w.displaySec, 9);
    }
  });
});
