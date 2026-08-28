/**
 * ★**レース映像の不変条件**（`REVIEW_P4_GAMMA_V6_DIRT_VERDICT_20260828.md` §4-2・宿題 1・2）
 *
 * 【★なぜ「閾値」ではなく「不変条件」なのか】
 *   裁定 §4: ★**閾値は「悪い状態を切る線」、不変条件は「良い状態を守る線」。**
 *   ★前者は正しい演出を落としうる（跳び px の許容量は演出の裁定事項・R-16）。
 *   ★後者は落とさない。★**ここで守るのは「0 であること」だけ**です。
 *
 * 【★守る 2 つ】
 *   ① ★**カットの境目で、共通の被写体が 0 頭にならない**
 *      ★前後で同じ馬が 1 頭も映っていなければ、視聴者には**別のレース**に見えます。
 *   ② ★**先頭（自馬）が画面の外に出ない**
 *      ⚠️ ★これは 2026-08-28 まで **seed 14 で 6.2 秒間**破れていました。
 *         ★字幕が「自馬・先頭 4番」と出ているのに、その 4 番が画面にいませんでした。
 *      ⚠️ ★**「主役 2 頭以上」では検出できません。**あの指標は上位 5 頭のうち何頭
 *         映っているかしか見ないので、★**先頭が抜けていても満点**になります。
 *
 * 【★測り方】
 *   ★画面と同じ経路（`buildAuditRace` / `auditSceneAt`）を通します（R-30）。
 *   ★台本も γ も**引数で渡しません**。渡さなければ画面の既定に落ちます（R-31）。
 *   ⚠️ ★ここに `'v6'` や `1.6` を直書きしないこと。★既定が動いた瞬間に嘘になります。
 */
import { describe, expect, it } from 'vitest';
import { cameraBasis, posOf, project } from '@star/render';
import { auditClock, auditSceneAt, buildAuditRace } from '../../../tools/lib/race-audit-build.mjs';
import type {
  AuditCourse, AuditDrawnHorse, AuditScene,
} from '../../../tools/lib/race-audit-build.mjs';

const W = 1280;
const H = 720;
/**
 * ★**15fps で刻みます。**
 *   ⚠️ ★実画面は 30fps ですが、ここで守るのは「0 であること」なので、
 *      ★**半分の刻みでも破れは必ず拾えます**（破れは連続する数十コマ続くため。
 *      実害だった seed 14 は 6.2 秒＝186 コマ連続でした）。
 *   ★検査の実行時間を抑えるための選択です。★閾値ではありません。
 */
const FPS = 15;
/** ★実害が出た seed 14 を必ず含めること。★ここを外すと検査が空回りします */
const SEEDS = [42, 14] as const;

/** ★その馬が画面の内側にいるか（足元の点で見る・`audit-cut-seam.mjs` と同じ判定） */
function onScreen(course: AuditCourse, scene: AuditScene, h: AuditDrawnHorse): boolean {
  const camera = scene.camera as unknown as Parameters<typeof cameraBasis>[0];
  const basis = cameraBasis(camera);
  const p = posOf(course as unknown as Parameters<typeof posOf>[0], h.s, h.w);
  const q = project(camera, basis, { x: p.x, y: p.y, z: 0 });
  return q.depth > 0 && q.x >= 0 && q.x <= W;
}

describe('★レース映像の不変条件（画面の既定で測る）', () => {
  /**
   * ★**① 先頭が画面の外に出ない。**
   *
   *   ★2026-08-28 に `contestFocusWithLeadInFrame` を入れて 0% にしました。
   *   ★この検査は**その 0 を守るため**にあります。
   */
  it('★先頭が画面の外に出るコマが 1 つも無い', () => {
    for (const seed of SEEDS) {
      const built = buildAuditRace({ seed });
      const clock = auditClock(built);
      const total = clock.introSec + clock.warp.displaySec;
      const offending: string[] = [];
      for (let f = 0; f <= Math.ceil(total * FPS); f += 1) {
        const d = f / FPS;
        if (d < clock.introSec) continue;
        const r = auditSceneAt(built, clock, d, { width: W, height: H });
        const drawn = r.drawn;
        if (drawn.length === 0) continue;
        const lead = drawn.reduce((b, h) => (h.s > b.s ? h : b), drawn[0]!);
        if (!onScreen(built.course, r.scene, lead)) {
          offending.push(`${d.toFixed(2)}s ${r.scene.shot.id} ${lead.gate}番`);
        }
      }
      expect(offending.slice(0, 5),
        `seed ${seed}: ★先頭が画面の外にいるコマがあります（${offending.length} コマ）`).toEqual([]);
    }
  });

  /**
   * ★**② カットの境目で共通の被写体が 0 頭にならない。**
   *
   *   ⚠️ ★これは「跳びが何 px までか」とは別の話です。★跳びの許容量には線を引きません（R-16）。
   *      ★**前後に同じ馬が 1 頭もいない**なら、それは大きい小さいの問題ではなく、
   *      ★**同じレースに見えない**という質の違いです。
   */
  it('★カットの境目で共通の被写体が 0 頭になる箇所が無い', () => {
    for (const seed of SEEDS) {
      const built = buildAuditRace({ seed });
      const clock = auditClock(built);
      const total = clock.introSec + clock.warp.displaySec;
      const orphans: string[] = [];
      let prevId: string | undefined;
      let prevGates: ReadonlySet<number> = new Set();
      let seams = 0;
      for (let f = 0; f <= Math.ceil(total * FPS); f += 1) {
        const d = f / FPS;
        if (d < clock.introSec) continue;
        const r = auditSceneAt(built, clock, d, { width: W, height: H });
        const gates = new Set(
          r.drawn.filter((h) => onScreen(built.course, r.scene, h))
            .map((h) => h.gate),
        );
        if (prevId !== undefined && r.scene.shot.id !== prevId) {
          seams += 1;
          const shared = [...gates].filter((g) => prevGates.has(g));
          if (shared.length === 0) orphans.push(`${d.toFixed(2)}s ${prevId} → ${r.scene.shot.id}`);
        }
        prevId = r.scene.shot.id;
        prevGates = gates;
      }
      /**
       * ★**境目を 1 つも拾えていないなら、それは「異常なし」ではありません**（R-3 / R-21）。
       * ⚠️ ★刻みや台本が変わって境目が消えると、★上の検査は**黙って通ります**。
       */
      expect(seams, `seed ${seed}: ★カットの境目を 1 つも拾えていません`).toBeGreaterThan(3);
      expect(orphans.slice(0, 5),
        `seed ${seed}: ★前後で共通の馬が 0 頭の境目があります（${orphans.length} 箇所）`).toEqual([]);
    }
  });
});
