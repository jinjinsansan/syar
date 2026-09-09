/**
 * ★**監査道具と画面が同じ入力を見ているか**（★2026-09-09・F-2・裁定 §2 / §3 Q-1a-6）
 *
 * 【★何が起きていたか】
 *   ★`tools/lib/race-audit-build.mjs` は ★`straightMetersLeft: 400` を ★**べた書き**していました。
 *   ★画面は `homeStretchMetersOf(course)` を渡します。
 *   ★直線は ★10 場 50 鞍で ★**290〜620m の 10 通り**あるので、
 *   ★**直線の違う会場では、道具と画面が別の knots を見ていた**ことになります。
 *
 * ⚠️ ★**既定走路（`ovalCourse` の 400m）では 1 ビットも変わりません。**
 *    ★だから 9 条件の測定値は前と同じです。★同じであることを「影響なし」と読まないこと —
 *    ★**測っていた 9 条件が、たまたま既定の 1 場だっただけ**です（★R-33 と同じ形）。
 *
 * 【★ここで見るもの】
 *   ★① 道具が直線長をべた書きしていない（★源を見る）
 *   ★② ★**直線長が実際に時計まで届く**（★渡しても効いていない、を通さない）
 *   ★③ ★従来方式へ戻せる（`legacyMotion`）
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { buildAuditRace, auditClock, auditPaceReport } from '../../../tools/lib/race-audit-build.mjs';

const ROOT = path.resolve(__dirname, '../../..');
const AUDIT_SRC = path.join(ROOT, 'tools/lib/race-audit-build.mjs');
/** ★直線の実測の幅（`tools/_terrain.mjs`・10 場 50 鞍で 290〜620m） */
const STRAIGHTS = [290, 400, 620] as const;
const specOf = (homeStretchM: number) => ({ lapM: 2000, homeStretchM, widthM: 20 });

describe('★監査道具と画面の入力の一致', () => {
  it('★★道具が直線長をべた書きしていない', () => {
    const src = readFileSync(AUDIT_SRC, 'utf8');
    const code = src.split('\n').filter((l) => !/^\s*(\*|\/\/)/.test(l)).join('\n');
    expect(code, '★直線長は走路から取ること（画面と同じ）').not.toMatch(/straightMetersLeft:\s*\d/);
    expect(code, '★画面と同じ関数を通すこと').toMatch(/straightMetersLeft:\s*homeStretchMetersOf\(/);
  });

  it('★★直線長が位置モデルまで届く', () => {
    for (const hs of STRAIGHTS) {
      const built = buildAuditRace({ seed: 42, distance: 1600, spec: specOf(hs) });
      expect(built.model.straightMeters, `直線 ${hs}m`).toBe(hs);
    }
  });

  it('★★直線長が時計まで届く（★渡しても効いていない、を通さない）', () => {
    const secs = STRAIGHTS.map((hs) => {
      const built = buildAuditRace({ seed: 42, distance: 1600, spec: specOf(hs) });
      return auditClock(built).warp.displaySec;
    });
    /**
     * ★べた書き（400 固定）だったころは ★**3 つとも同じ値**になりました。
     * ★互いに違うことを見れば、★「渡したが効いていない」を捕まえられます。
     */
    const uniq = new Set(secs.map((s) => s.toFixed(6)));
    expect(uniq.size, `表示秒が会場で変わっていません: ${secs.join(' / ')}`).toBe(STRAIGHTS.length);
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
