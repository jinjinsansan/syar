/**
 * ★**馬の絵を走路の接線へ回す — その「既定」を留める**（★2026-09-11）
 *
 * 【★経緯】★オーナー評（★4 角）「★芝に対して ★**馬が斜め前を向いている**」。
 *   ★馬の絵は ★**画面に対してまっすぐ立つ板**で、★回りません。
 *   ★直線はカメラで解けましたが、★**コーナーは走路が曲がる**ので構え方では解けません。
 *   ★測った値（★馬と芝の目がなす角・★90° が直交）: ★4 角 **52° → 回すと 80.5°**。
 *   → ★オーナー判定「★**回したほうがまだマシ**」で ★**既定を「回す」**にしました。
 *
 * 【★何を留めるか】⚠️ ★既定を変えた事実は、★**絵が本当に回っていること**でしか確かめられません。
 *   ★定数の値を読むだけの検定は、★呼び出し側が渡し忘れていても緑になります（★R-16 の家族）。
 *   → ★`drawPerspectiveHorses` が ★**実際に `rotate` を呼ぶか**を見ます。
 *
 *   ①★**弧の上では回る**（★既定・★引数を渡さない）
 *   ②★**直線では回らない**（★接線がほぼ 0＝★1 画素も動かない）
 *   ③★**`false` を渡せば回らない**（★`?tilt=off` の戻し口が生きている）
 */
import { describe, it, expect } from 'vitest';
import { ovalCourse } from '../src/course.js';
import { resolveBroadcastV2Scene } from '../src/broadcast-v2-scene.js';
import { drawPerspectiveHorses, DEFAULT_ALIGN_TO_TRACK, screenTrackAngle } from '../src/perspective-draw.js';

const course = ovalCourse(1600, { widthM: 20, turn: 'left' });
const VIEWPORT = { width: 1280, height: 720 };

/** ★その地点で描いたときの `rotate` の角度（ラジアン）を全部拾う。 */
function rotations(s: number, opts: { readonly alignToTrack?: boolean } = {}): number[] {
  const horse = { gate: 1, s, w: 10 };
  const scene = resolveBroadcastV2Scene(course, [horse], VIEWPORT, false, {
    cornerCutM: 400, raceDisplaySec: 30, script: 'v6',
    noContenderFrameShots: ['finish-line'] as const,
  });
  const frame = {
    image: 'body' as never,
    source: { x: 0, y: 0, width: 300, height: 200 },
    referenceHeight: 200,
    bodyAnchorSourcePx: { x: 150, y: 120 },
    bodyLiftSourcePx: 0,
  };
  const out: number[] = [];
  const target: Record<string, unknown> = {
    save: () => undefined, restore: () => undefined, transform: () => undefined,
    translate: () => undefined,
    rotate: (a: unknown) => { out.push(a as number); },
    drawImage: () => undefined,
    beginPath: () => undefined, fill: () => undefined, ellipse: () => undefined,
    fillRect: () => undefined, moveTo: () => undefined, lineTo: () => undefined,
    closePath: () => undefined, stroke: () => undefined, measureText: () => ({ width: 10 }),
  };
  const ctx = new Proxy(target, {
    get: (obj, key) => (key in obj ? obj[key as string] : () => undefined),
    set: (obj, key, value) => { obj[key as string] = value; return true; },
  });
  drawPerspectiveHorses(ctx as never, course, scene.camera, [horse], {
    sheet: 'sheet' as never, sheetWidth: 800, spec: { frames: 8, cellH: 100 } as never,
    frameImagesByGate: [[frame], [frame]],
    fieldSize: 12, frameOf: () => 0, frameRoleOf: () => 'frame-1', distanceMeter: 1600,
    ...(opts.alignToTrack === undefined ? {} : { alignToTrack: opts.alignToTrack }),
  });
  return out;
}

const deg = (rad: number): number => Math.abs((rad * 180) / Math.PI);

describe('★走路の接線へ回す（既定）', () => {
  /** ★既定値そのもの。★これが false に戻ったら、下の①が落ちるのと同時にここも落ちる */
  it('★既定は「回す」', () => {
    expect(DEFAULT_ALIGN_TO_TRACK).toBe(true);
  });

  /**
   * ①★**弧の上では、引数を渡さなくても回る。**
   * ⚠️ ★ここが本体です。★定数だけ true にして渡し忘れていれば、★この検定が落ちます。
   */
  it('★4 コーナーでは、引数を渡さなくても絵が回る', () => {
    /**
     * ⚠️ ★**900m はもう 4 角のカットではありません**（★2026-09-12）。
     *    ★コーナーのカットを走路の本当のコーナーへ貼り直したので、★桜星賞の 4 角は
     *    ★**1080〜1200m**（★4 角の出口）になりました。★900m は 4 角の入口で、★まだ `side-drive` です。
     */
    const rots = rotations(1100);
    expect(rots.length, '★rotate が呼ばれること').toBeGreaterThan(0);
    expect(Math.max(...rots.map(deg)), '★弧の傾きぶん回る').toBeGreaterThan(10);
  });

  /**
   * ②★**直線では回らない。**
   * ★接線が画面でほぼ水平なので、★回す処理が入っていても ★**1 画素も動きません**。
   * ⚠️ ★ここが落ちるなら、★カメラが走路方向へずれています（★2026-09-11 に直した症状）。
   */
  it('★直線では回らない（★既定を変えても真横のカットは動かない）', () => {
    for (const s of [200, 400, 700, 1250, 1350]) {
      const rots = rotations(s);
      const max = rots.length === 0 ? 0 : Math.max(...rots.map(deg));
      expect(max, `${s}m`).toBeLessThan(1);
      /** ★念のため、接線そのものも小さいことを見る（★回さない理由が「接線が 0」であること） */
      const scene = resolveBroadcastV2Scene(course, [{ gate: 1, s, w: 10 }], VIEWPORT, false, {
        cornerCutM: 400, raceDisplaySec: 30, script: 'v6',
        noContenderFrameShots: ['finish-line'] as const,
      });
      expect(deg(screenTrackAngle(course, scene.camera, s, 10)), `${s}m の接線`).toBeLessThan(6);
    }
  });

  /** ③★戻し口（`?tilt=off`）が生きていること。 */
  it('★`false` を渡せば、弧の上でも回らない', () => {
    const rots = rotations(900, { alignToTrack: false });
    const max = rots.length === 0 ? 0 : Math.max(...rots.map(deg));
    expect(max, '★1 度も回さない').toBeLessThan(0.3);
  });
});
