/**
 * ★**監査道具と画面が同じ入力を見ているか**（★2026-09-09・F-2・裁定 §2 / §3 Q-1a-6）
 *
 * 【★何が起きていたか】
 *   ★`tools/lib/race-audit-build.mjs` は ★`straightMetersLeft: 400` を ★**べた書き**していました。
 *   ★画面は `homeStretchMetersOf(course)` を渡していました。
 *
 * 【★2026-09-15 の訂正】★オーナー評「★有り得ないくらいに足が早い」（★流星大賞典・天河 2000m）。
 *   ⚠️ ★`straightMetersLeft` は ★**走路の直線の長さではなく、「境界時刻 `straightSec` が指す地点」**でした。
 *      ★境界時刻はエンジンの `boundaryTimesOf` が ★**残り `PHASE_METERS.STRAIGHT`（400m）固定**で出します。
 *      ★走路の直線（290〜620m）を渡すと、★400m 分の時間でその長さを走らせることになり、
 *      ★実測で ★**天河 620m は先頭が秒速 28.9m・潮風 310m は 12.2m**（★桜星賞 400m は 17.0m）でした。
 *   → ★画面も道具も ★`PHASE_METERS.STRAIGHT` を渡します。★「道具と画面が同じ値」は保ったまま、★値の意味を直しました。
 *
 * 【★ここで見るもの】
 *   ★① 道具が直線に入る地点をべた書きしていない（★源を見る）
 *   ★② ★**境界時刻と同じ地点が位置模型まで届く**（★走路の直線の長さに依らない）
 *   ★③ ★**直線の長さの違う走路でも、最後の直線の速さが桜星賞と同じ帯**（★この訂正の本体・対照つき）
 *   ★④ 画面と監査が同じ時計を返す
 *   ★⑤ ★従来方式へ戻せる（`legacyMotion`）
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PHASE_METERS } from '@star/race-engine';
import { buildAuditRace, auditClock, auditPaceReport } from '../../../tools/lib/race-audit-build.mjs';
import { knotsFor, raceClockFor, replayPositionModel } from '../src/index.js';

const ROOT = path.resolve(__dirname, '../../..');
const AUDIT_SRC = path.join(ROOT, 'tools/lib/race-audit-build.mjs');
/** ★直線の実測の幅（`tools/_terrain.mjs`・10 場 50 鞍で 290〜620m） */
const STRAIGHTS = [290, 400, 620] as const;
const specOf = (homeStretchM: number) => ({ lapM: 2000, homeStretchM, widthM: 20 });

/** ★先頭が残り `fromLeftM` からゴールまでを走る平均の速さ（m/s）。★位置模型から 0.05 秒刻みで測る */
function leaderSpeedOverLast(model: { at(sec: number): readonly { meters: number }[] }, distance: number, fromLeftM: number): number {
  const lead = (sec: number): number => Math.max(...model.at(sec).map((h) => h.meters));
  let t0 = NaN, t1 = NaN;
  for (let sec = 0; sec <= 600; sec += 0.05) {
    if (Number.isNaN(t0) && lead(sec) >= distance - fromLeftM) t0 = sec;
    if (lead(sec) >= distance - 1e-6) { t1 = sec; break; }
  }
  return fromLeftM / (t1 - t0);
}

describe('★監査道具と画面の入力の一致', () => {
  it('★★道具が直線に入る地点をべた書きしていない（★エンジンの定数から取る）', () => {
    const src = readFileSync(AUDIT_SRC, 'utf8');
    const code = src.split('\n').filter((l) => !/^\s*(\*|\/\/)/.test(l)).join('\n');
    expect(code, '★数字を直書きしないこと').not.toMatch(/straightMetersLeft:\s*\d/);
    expect(code, '★境界時刻を作った側と同じ定数を通すこと').toMatch(/straightMetersLeft:\s*PHASE_METERS\.STRAIGHT\b/);
  });

  it('★★境界時刻と同じ地点が位置模型まで届く（★走路の直線の長さに依らない）', () => {
    expect(PHASE_METERS.STRAIGHT).toBe(400);
    for (const hs of STRAIGHTS) {
      const built = buildAuditRace({ seed: 42, distance: 1600, spec: specOf(hs) });
      expect(built.model.straightMeters, `直線 ${hs}m`).toBe(PHASE_METERS.STRAIGHT);
    }
  });

  /**
   * ★**③ この訂正の本体**: ★直線の長さの違う走路でも、★最後の 250m の先頭の速さが同じ帯に入る。
   *   ★帯は 14〜20 m/s（★桜星賞の実測 17.0m/s の前後。★エンジンの平均速度 約 16m/s）。
   * ⚠️ ★対照: ★走路の直線の長さを渡す形（★2026-09-09〜15 の画面）では ★620m で帯を超え、★290m で帯を割る。
   */
  it('★★直線の長さの違う走路でも、最後の直線の速さは同じ帯（★対照: 直線の長さを渡すと外れる）', () => {
    for (const hs of STRAIGHTS) {
      const built = buildAuditRace({ seed: 42, distance: 2000, spec: specOf(hs) });
      const v = leaderSpeedOverLast(built.model, built.DIST, 250);
      expect(v, `直線 ${hs}m: 秒速 ${v.toFixed(1)}m`).toBeGreaterThanOrEqual(14);
      expect(v, `直線 ${hs}m: 秒速 ${v.toFixed(1)}m`).toBeLessThanOrEqual(20);
    }
    const wrongOf = (hs: number): number => {
      const built = buildAuditRace({ seed: 42, distance: 2000, spec: specOf(hs) });
      const wrong = replayPositionModel({
        distanceMeter: built.DIST, spurtMetersLeft: 800, straightMetersLeft: hs, boundaries: built.boundaries,
        strategyOf: (g: number) => built.entrants[g - 1]!.strategy, pace: built.pace, formationSeed: built.seed * 2654435761,
      });
      return leaderSpeedOverLast(wrong, built.DIST, 250);
    };
    expect(wrongOf(620), '★対照（天河相当）が帯の中なら、この検査は何も見ていない').toBeGreaterThan(20);
    expect(wrongOf(290), '★対照（白砂相当）が帯の中なら、この検査は何も見ていない').toBeLessThan(14);
  });

  it('★★どの会場でも、目標と実尺の差が記録される', () => {
    for (const hs of STRAIGHTS) {
      const built = buildAuditRace({ seed: 42, distance: 1600, spec: specOf(hs) });
      const rep = auditPaceReport(built);
      expect(rep.policy).toBe('readable');
      // ★可読性方針では上限で切られるので、★必ず目標より長くなる
      expect(rep.cappedPhases.length, `直線 ${hs}m`).toBeGreaterThan(0);
      expect(rep.overshootSec, `直線 ${hs}m`).toBeGreaterThan(0);
    }
  });

  /**
   * ★**画面と監査が、同じ入力から同じ時計を返すこと**（★2026-09-09・F-3・裁定 §2）
   *
   * ★画面は `raceClockFor(knots, DIST, policy)` を呼びます（★構文木で確認済み・
   * ★`apps/cli/test/race-clock-wiring.test.ts`）。★ここでは ★**その部品自体**を
   * ★画面と同じ引数で呼び、★監査道具が組んだ時計と ★突き合わせます。
   */
  it('★★画面と監査が同じ時計を返す', () => {
    for (const hs of STRAIGHTS) {
      const built = buildAuditRace({ seed: 42, distance: 1600, spec: specOf(hs) });
      const fromAudit = auditClock(built).warp;
      /**
       * ⚠️ ★**比較側は `built.model.straightMeters` を読まないこと**
       *    （★2026-09-09・第 3 便の裁定 §1「21 点の照合について」）。
       *    ★モデルの出力を期待値へ流用すると、★監査側だけ別の値へ戻しても素通りします。
       * → ★画面と同じ定数 `PHASE_METERS.STRAIGHT` を ★そのまま期待値に使います。
       */
      const knots = knotsFor(built.boundaries, 3, PHASE_METERS.STRAIGHT);
      const fromScreenPart = raceClockFor(knots, built.DIST, 'readable');
      expect(fromScreenPart.displaySec, `直線 ${hs}m`).toBeCloseTo(fromAudit.displaySec, 9);
      for (let i = 0; i <= 20; i++) {
        const d = (fromAudit.displaySec * i) / 20;
        expect(fromScreenPart.raceSecAt(d), `直線 ${hs}m の ${d} 秒`).toBeCloseTo(fromAudit.raceSecAt(d), 9);
      }
    }
  });

  it('★★従来方式へ戻せる（`legacyMotion` が別物であること）', () => {
    const readable = buildAuditRace({ seed: 42, distance: 1600 });
    const legacy = buildAuditRace({ seed: 42, distance: 1600, legacyMotion: true });
    expect(auditPaceReport(readable).policy).toBe('readable');
    expect(auditPaceReport(legacy).policy).toBe('legacy');
    // ★従来方式のほうが尺は短い（★切っていないぶん詰められる）
    expect(auditClock(legacy).warp.displaySec).toBeLessThan(auditClock(readable).warp.displaySec);
    // ★従来方式は目標のほぼ内側
    expect(Math.abs(auditPaceReport(legacy).overshootSec)).toBeLessThan(1.5);
  });
});
