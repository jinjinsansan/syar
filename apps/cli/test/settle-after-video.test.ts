/**
 * ★**払戻は 映像が終わってから**（★2026-09-30・移行 0098・レビュー側 条件 2・裁定 A）
 *
 * 【★見ている壊れ方】
 *   ★② 締める（払戻）を 発走から SETTLE_AFTER_START_MS 後に拾うので、★その数が ★映像の総尺より短いと
 *   ★映像がまだ走っている間に払戻が付く（★画面と台帳が食い違う）。★旧 120 秒は 2400m・3000m の映像より短かった。
 * ★総尺は ★監査道具（`tools/lib/race-audit-build.mjs`・画面と同じ公開関数を同じ順に通す）で ★10 場 × すべての距離を測る。
 *   ★時計を詰めない readable の尺（★本番の short より長い＝上限）で比べる。
 * ⚠️ ★距離（DISTANCE_MENU）や競馬場を足したら ★この網が測り直す（★数を書くだけにしない）。
 */
import { describe, it, expect } from 'vitest';
import { buildAuditRace, auditClock, auditTotalDisplaySec } from '../../../tools/lib/race-audit-build.mjs';
import { VENUES, DISTANCE_MENU, SETTLE_AFTER_START_MS } from '@star/scheduler';

describe('★払戻は 映像が終わってから（SETTLE_AFTER_START_MS ＞ すべての距離の総尺）', () => {
  it('🔴 10 場 × すべての距離で 映像の総尺（上限）より SETTLE_AFTER_START_MS が長い', () => {
    let worst = { total: 0, dist: 0, venue: '' };
    for (const dist of DISTANCE_MENU) {
      for (const v of VENUES) {
        const spec = { lapM: v.lapM, homeStretchM: v.homeStretchM, widthM: v.widthM, ...(v.cornerRadiiM ? { cornerRadiiM: v.cornerRadiiM } : {}) };
        const built = buildAuditRace({ distance: dist, seed: 99, spec, turn: v.turn, field: 12 });
        const total = auditTotalDisplaySec(auditClock(built)) as number;
        if (total > worst.total) worst = { total, dist, venue: v.id };
      }
    }
    expect(worst.total, '★総尺が測れていない').toBeGreaterThan(60);
    expect(SETTLE_AFTER_START_MS / 1000, `★最長 ${worst.total.toFixed(1)} 秒（${worst.dist}m・${worst.venue}）より短い`).toBeGreaterThan(worst.total);
  }, 600_000);
});
