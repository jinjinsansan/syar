/**
 * ★**芝の目と、馬の向きが、画面上で何度で交わっているか**（★2026-09-11）
 *
 * 【★なぜ測るか】★オーナー評:
 *   ★「★おそらく ★**芝の目の動く方向**です。★馬が走る方向と ★**垂直**に、★逆方向に
 *   ★芝の目が動かないといけない。★しかし動画では ★**馬が走る方向と水平方向に**
 *   ★芝の目が動いているから違和感があるように思います」
 *
 * 【★測れる形に直すと】
 *   ★芝の目（`mow-stripes.ts`）は ★**走路を横切る帯**（★s 一定・w 方向に伸びる多角形）です。
 *   ★帯が流れる向きは ★**走路に沿う向き**＝その場所の ★**接線**。
 *   ★馬の絵は ★**画面に対してまっすぐ立つ板**なので、★描かれる向きは ★**画面の水平**。
 *   → ★**「帯の縁」と「馬の向き」が画面上でなす角**が 90° なら、
 *     ★馬は自分の真横を通る帯を横切る（★オーナーの言う正しい状態）。
 *     ★90° から外れるほど、★帯は馬の進む向きへ滑って見えます。
 *
 * ⚠️ ★式を作り直しません。★画面と同じ `resolveBroadcastV2Scene` でカメラを出し、
 *    ★同じ `project` で投影します（★R-30）。★既定も画面から引きます（★R-31）。
 *
 * ★実行: npx tsx tools/measure-turf-grain.ts
 */
import {
  ovalCourse, cameraBasis, posOf, project, screenTrackAngle,
  DEFAULT_RACE_SCRIPT,
} from '../packages/render/src/index.js';
import { resolveBroadcastV2Scene, type BroadcastV2Horse } from '../packages/render/src/broadcast-v2-scene.js';

const DIST = 1600;
const VIEWPORT = { width: 1280, height: 720 } as const;
const course = ovalCourse(DIST, { widthM: 20, turn: 'left' });

const BASE_GAPS = [0, 1.4, 3.6, 5.9, 8.8, 12.1, 16.0, 20.4, 25.3, 31.0, 37.6, 45.2];
const LANES = [9.2, 7.6, 10.4, 6.2, 11.3, 8.4, 5.1, 12.0, 9.8, 4.3, 6.9, 10.9];
const fieldAt = (leadS: number): BroadcastV2Horse[] =>
  BASE_GAPS.map((g, i) => ({
    gate: i + 1, s: Math.max(0, leadS - g), w: LANES[i]!, finished: leadS - g >= DIST,
  }));

/** ★2 直線のなす角を 0〜90° で返す（★向き・鏡像は問わない）。 */
const crossDeg = (a: number, b: number): number => {
  let d = Math.abs(((a - b) * 180) / Math.PI) % 180;
  if (d > 90) d = 180 - d;
  return d;
};

const rows: {
  s: number; shot: string; tangent: number; stripe: number;
  flat: number; tilted: number; stripeVsTangent: number;
}[] = [];

for (let s = 50; s <= 1550; s += 50) {
  const scene = resolveBroadcastV2Scene(course, fieldAt(s), VIEWPORT, false, {
    /** ⚠️ ★`cornerStyle` を渡しません＝★画面と同じ既定（`far`）を歩かせます（★R-31） */
    cornerCutM: 400, raceDisplaySec: 30, script: DEFAULT_RACE_SCRIPT,
    noContenderFrameShots: ['finish-line'] as const,
  });
  const cam = scene.camera;
  const basis = cameraBasis(cam);
  const w = 10;

  /** ★走路の接線（★帯が流れる向き・★回したときの馬の向き）。 */
  const tangent = screenTrackAngle(course, cam, s, w);

  /** ★芝の目の帯の縁（★s 一定・w 方向）。★`mow-stripes.ts` が描くのと同じ線。 */
  const inner = posOf(course, s, 0);
  const outer = posOf(course, s, course.widthM);
  const pi = project(cam, basis, { x: inner.x, y: inner.y, z: 0 });
  const po = project(cam, basis, { x: outer.x, y: outer.y, z: 0 });
  if (pi.depth <= 2 || po.depth <= 2) continue;
  const stripe = Math.atan2(po.y - pi.y, po.x - pi.x);

  rows.push({
    s, shot: scene.shot.id,
    tangent: (tangent * 180) / Math.PI,
    stripe: (stripe * 180) / Math.PI,
    /** ★いまの既定: 馬は画面の水平に描かれる（0 rad） */
    flat: crossDeg(stripe, 0),
    /** ★回した場合: 馬は接線の向きに描かれる */
    tilted: crossDeg(stripe, tangent),
    stripeVsTangent: crossDeg(stripe, tangent),
  });
}

const fmt = (n: number): string => n.toFixed(1).padStart(6);
console.log('  s   カット                     接線°   帯の縁°  ★馬と帯の交差角');
console.log('                                                回さない  回した');
for (const r of rows) {
  console.log(`${String(r.s).padStart(4)}  ${r.shot.padEnd(24)} ${fmt(r.tangent)} ${fmt(r.stripe)}   ${fmt(r.flat)}  ${fmt(r.tilted)}`);
}

/** ★カットごとの要約（★どのカットが 90° から遠いか）。 */
const byShot = new Map<string, { flat: number[]; tilted: number[] }>();
for (const r of rows) {
  const e = byShot.get(r.shot) ?? { flat: [], tilted: [] };
  e.flat.push(r.flat); e.tilted.push(r.tilted);
  byShot.set(r.shot, e);
}
const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;
console.log('\n★カットごとの平均（★90° が「馬の真横を帯が横切る」状態）');
console.log('カット                      回さない   回した   ★ずれ（回さない）');
for (const [shot, e] of byShot) {
  console.log(`${shot.padEnd(24)} ${fmt(mean(e.flat))} ${fmt(mean(e.tilted))}   ${fmt(Math.abs(90 - mean(e.flat)))}`);
}
