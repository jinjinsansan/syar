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

  /**
   * ★**③ 4 角正面から「出る」境目で、走行方向が反転しない。**（2026-08-29・残件 A-1）
   *
   * 【★何を守っているのか】
   *   ★4 角正面は台本で唯一 ← へ進む画で、★前後の `side-drive` は → です。
   *   ★2026-08-29 まで**入口と出口の両方**が反転していました（4 seed 中 4 本とも 2 箇所）。
   *   ★カメラを 90m → 30m へ寄せて、★**出口の反転を消しました**（実測 4 seed 中 0 箇所）。
   *
   * ⚠️ ★**入口の反転は残っています。** ★カメラの据え位置では消せないことを
   *    掃引（5〜160m × 横 8 通り）で確かめました。★残件台帳 A-1 に「未解決」として残します。
   *    → ★**ここで守るのは「出口の 0」だけ**です。★入口を一緒に入れると、この検査は
   *      ★**最初から赤**になり、守るべき 0 まで一緒に見えなくなります。
   *
   * 【★向きの定義は道具と同じもの】（R-30: 指標を自作しない）
   *   ★`tools/audit-cut-seam.mjs` の `screenDirection` と同じ式です（2m 先との画面 x の差 ÷ 2）。
   */
  it('★4 角正面から出る境目で走行方向が反転しない', () => {
    /** ★`audit-cut-seam.mjs:103` と同じ式 */
    const dirOf = (course: AuditCourse, scene: AuditScene, s: number, w: number): number => {
      const camera = scene.camera as unknown as Parameters<typeof cameraBasis>[0];
      const basis = cameraBasis(camera);
      const c = course as unknown as Parameters<typeof posOf>[0];
      const a = project(camera, basis, { ...posOf(c, s, w), z: 0 });
      const b = project(camera, basis, { ...posOf(c, s + 2, w), z: 0 });
      if (!(a.depth > 0) || !(b.depth > 0)) return 0;
      return (b.x - a.x) / 2;
    };

    for (const seed of SEEDS) {
      const built = buildAuditRace({ seed });
      const clock = auditClock(built);
      const total = clock.introSec + clock.warp.displaySec;
      const flips: string[] = [];
      let exits = 0;
      let prev: { id: string; dir: number } | undefined;
      for (let f = 0; f <= Math.ceil(total * FPS); f += 1) {
        const d = f / FPS;
        if (d < clock.introSec) continue;
        const r = auditSceneAt(built, clock, d, { width: W, height: H });
        if (r.drawn.length === 0) { prev = undefined; continue; }
        const lead = r.drawn.reduce((b, h) => (h.s > b.s ? h : b), r.drawn[0]!);
        const cur = { id: r.scene.shot.id, dir: dirOf(built.course, r.scene, lead.s, lead.w) };
        if (prev !== undefined && prev.id === 'fourth-corner-front' && cur.id !== prev.id) {
          exits += 1;
          if (Math.sign(prev.dir) !== 0 && Math.sign(cur.dir) !== 0
            && Math.sign(prev.dir) !== Math.sign(cur.dir)) {
            flips.push(`${d.toFixed(2)}s ${prev.id} → ${cur.id}`
              + `（${prev.dir.toFixed(1)} → ${cur.dir.toFixed(1)} px/m）`);
          }
        }
        prev = cur;
      }
      /** ★出口を 1 つも拾えていないなら「異常なし」ではありません（R-3 / R-21） */
      expect(exits, `seed ${seed}: ★4 角正面から出る境目を 1 つも拾えていません`).toBeGreaterThan(0);
      expect(flips,
        `seed ${seed}: ★4 角正面の出口で走行方向が反転しています`).toEqual([]);
    }
  });
});
