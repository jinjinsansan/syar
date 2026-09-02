/**
 * ★**焼いた馬コマが、画面で拡大されないこと**（★正典 R-32: ゲートは検定の中に置く）
 *
 * 【★なぜ検定に置くか】
 *   ★焼く解像度（560px）は ★**「画面上の馬は最大 512px」という実測**の上に立っています
 *   （`tools/audit-draw-scale.mjs`・10 場 50 鞍 × 4 シード・2026-09-02）。
 *   ★カメラを 1 つ寄せた日に、★**この前提は黙って崩れます。**
 *   ★崩れても絵は出ます — ★**少しぼやけるだけ**なので、誰も気づきません。
 *   ★V-18 が手で回す道具にしか無く、9 日間 FAIL のまま緑だった件（R-32）と同じ形です。
 *
 * ⚠️ ★**この検定の視野**（R-22: 検定が何を見ていないかを書く）:
 *   ★時間が掛かるので ★**実測で最も大きく映った 6 鞍 × 1 シード**だけを見ます。
 *   ★**別の鞍でカメラだけを寄せた変更は、ここでは捕まりません。**
 *   → ★カメラ・台本・画角を触ったら ★**`npx tsx tools/audit-draw-scale.mjs --seeds 42,332,474,14`
 *     を 50 鞍で回すこと。**★この検定はその代わりではなく、★取りこぼしを拾う網です。
 */
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { cameraBasis, posOf, project, HORSE_HEIGHT_M } from '@star/render';
import { raceSetupById } from '@star/scheduler';
import { buildAuditRace, auditClock, auditSceneAt, auditTotalDisplaySec, RACE_DEFAULTS } from '../../../tools/lib/race-audit-build.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const BAKED = path.join(ROOT, 'apps/web/public/art/baked');
const VIEWPORT = { width: 1280, height: 720 };

/**
 * ★**実測で最も大きく映った 6 鞍**（`tools/audit-draw-scale.mjs --seeds 42,332,474,14`）。
 * ⚠️ ★ここを「短い距離だから」で選ばないこと。★**測った結果**から選んでいます。
 */
const WORST_RACES = ['g3-ryofu', 'g3-shunrai', 'g3-semishigure', 'g3-futagoboshi', 'g2-tsukimi', 'g1-suisei'];
/** ★実測の最大 512px を出したシード */
const SEED = 14;
const STEP = 0.2;

interface Tile { w: number; h: number; anchorKind: string }
interface BakedSet {
  role: string; scale: number; nativeReferenceHeight: number; referenceHeight: number;
  frames: Tile[]; coats: Record<string, string>;
}
interface Manifest { targetHorsePx: number; coats: string[]; sets: BakedSet[] }

const manifestPath = path.join(BAKED, 'manifest.json');
const manifest = existsSync(manifestPath)
  ? JSON.parse(readFileSync(manifestPath, 'utf8')) as Manifest
  : undefined;

describe('★焼いた馬コマ（`tools/bake-race-frames.mjs`）', () => {
  it('★目録がある（★無ければ焼き直しが要る）', () => {
    expect(manifest, `${manifestPath} がありません。npx tsx tools/bake-race-frames.mjs を回してください`).toBeDefined();
  });

  it('★焼いた素材のファイルが実在する（★目録だけ残っていない）', () => {
    const missing: string[] = [];
    for (const set of manifest!.sets) {
      for (const file of Object.values(set.coats)) if (!existsSync(path.join(BAKED, file))) missing.push(file);
    }
    expect(missing, `目録にあってファイルが無い:\n  ${missing.join('\n  ')}`).toEqual([]);
  });

  it('★引き伸ばして焼いていない（★焼いた高さ = min(目標, 原版)）', () => {
    for (const set of manifest!.sets) {
      const want = Math.min(manifest!.targetHorsePx, set.nativeReferenceHeight);
      /** ★丸めのぶん 1px だけ許す */
      expect(Math.abs(set.referenceHeight - want), `${set.role}: 焼いた ${set.referenceHeight}px / 期待 ${want}px`)
        .toBeLessThanOrEqual(1);
      expect(set.scale, `${set.role}: 拡大して焼いている`).toBeLessThanOrEqual(1);
    }
  });

  it('★どのコマにも中身がある（★空タイルを焼いていない）', () => {
    for (const set of manifest!.sets) {
      expect(set.frames.length, `${set.role}: コマ数`).toBe(8);
      for (const [i, t] of set.frames.entries()) {
        expect(t.w, `${set.role} コマ${i + 1}: 幅`).toBeGreaterThan(8);
        expect(t.h, `${set.role} コマ${i + 1}: 高さ`).toBeGreaterThan(8);
      }
    }
  });

  /**
   * ★**本体**。★画面上の馬が、焼いた高さを超えないこと。
   *   ★超えると `scale = hpx / referenceHeight > 1` になり、★焼いた絵を引き伸ばします。
   */
  it('★画面上の馬が、焼いた高さを超えない（★超えたら引き伸ばしになる）', () => {
    let worst = { px: 0, race: '', shot: '' };
    for (const raceId of WORST_RACES) {
      const setup = raceSetupById(raceId);
      const built = buildAuditRace({
        seed: SEED, distance: setup.distanceM, surface: setup.surface,
        field: RACE_DEFAULTS.field, spec: setup.spec, turn: setup.turn,
      });
      const clock = auditClock(built);
      const total = auditTotalDisplaySec(clock);
      let frames = 0;
      for (let t = 0; t <= total; t += STEP) {
        const r = auditSceneAt(built, clock, t, VIEWPORT);
        const cam = r.scene.camera;
        const basis = cameraBasis(cam);
        for (const h of r.scene.visibleHorses) {
          const g = posOf(built.course, Math.max(0, h.s), h.w);
          const p = project(cam, basis, { x: g.x, y: g.y, z: 0 });
          if (!(p.depth > 2)) continue;
          const margin = HORSE_HEIGHT_M * p.pxPerM * 1.6;
          if (!(p.x > -margin && p.x < cam.width + margin
            && p.y > -margin && p.y < cam.height + margin * 2)) continue;
          frames += 1;
          const hpx = HORSE_HEIGHT_M * p.pxPerM;
          if (hpx > worst.px) worst = { px: hpx, race: raceId, shot: r.scene.shot.id };
        }
      }
      /** ★1 頭も描かれなかったなら「異常なし」ではありません（R-3 / R-21） */
      expect(frames, `${raceId}: 1 頭も描かれていない。測れていないだけかもしれません`).toBeGreaterThan(100);
    }
    expect(
      worst.px,
      `★画面上の馬 ${worst.px.toFixed(0)}px（${worst.race} / ${worst.shot}）が`
      + ` 焼いた ${manifest!.targetHorsePx}px を超えました。`
      + '★焼き直す（--target を上げる）か、カメラを戻してください。'
      + '★このまま置くと、見せ場だけが静かにぼやけます',
    ).toBeLessThanOrEqual(manifest!.targetHorsePx);
  }, 240_000);
});
