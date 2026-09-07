/**
 * ★購入リグのアニメーションに ★**何が入っているか**を洗い出す（★読取専用）
 *
 * 【★なぜ要るか】
 *   ★購入素材のクリップは ★**29.2 秒が 1 本に連結**されています。
 *   ★いま使っているのは ★**1.97 秒だけ**（全力疾走の 1 完歩）。
 *   ★残り 27 秒に何が入っているかを見ずに「素材の限界」と言えません。
 *
 * 【★測るもの】★時刻ごとに:
 *   ★① 4 本の蹄の高さ（★接地しているか）
 *   ★② 腰の高さ（★沈み・跳ね）
 *   ★③ 頭の高さ（★立ち上がりを拾う）
 *   ★④ 接地中の蹄が後ろへ流れる速さ（★＝その場走りの「実速度」）
 *   ★⑤ 骨盤の前後移動（★その場か、移動するか）
 *
 * ⚠️ ★製品コードは変更しません。★DB も見ません。
 *
 * ★実行: npx tsx tools/probe-rig-clip.mjs [--step 0.02]
 */
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';

THREE.TextureLoader.prototype.load = function load(url, onLoad) {
  const t = new THREE.Texture(); t.name = String(url); onLoad?.(t); return t;
};

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : Number(process.argv[i + 1]); };
const STEP = arg('step', 0.02);

const FILE = 'assets-spike/3d/race-horse-jockey-lod-source/ANIM_allmodels_allanim_BlenderFriendly.fbx';
const bytes = await readFile(FILE);
const model = new FBXLoader().parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
const clip = model.animations[0];
if (clip === undefined) { console.error('★アニメーションがありません'); process.exit(1); }

const bones = [];
model.traverse((n) => { if (n.isBone) bones.push(n); });
const byName = (n) => bones.find((b) => b.name === n);
const HOOVES = ['HorseLFrontHoof', 'HorseFrontRLegFrontHoof', 'HorseLRearHoof', 'HorseRRearHoof']
  .map(byName).filter((b) => b !== undefined);
const pelvis = byName('HorsePelvis');
const head = bones.find((b) => /HorseHead$|HorseNeck3|HorseHead/i.test(b.name));

const mixer = new THREE.AnimationMixer(model);
mixer.clipAction(clip).play();
const v = new THREE.Vector3();
const at = (bone) => { bone.getWorldPosition(v); return { x: v.x, y: v.y, z: v.z }; };

const rows = [];
for (let t = 0; t <= clip.duration; t += STEP) {
  mixer.setTime(t); model.updateMatrixWorld(true);
  const hooves = HOOVES.map(at);
  rows.push({
    t,
    hooves,
    pelvisY: pelvis ? at(pelvis).y : 0,
    pelvisZ: pelvis ? at(pelvis).z : 0,
    headY: head ? at(head).y : 0,
  });
}

/** ★接地とみなす高さ（★全体の最小から少しだけ上） */
const allY = rows.flatMap((r) => r.hooves.map((h) => h.y));
const floor = Math.min(...allY);
const CONTACT = floor + 0.14;

/** ★1 秒ごとにまとめる */
const BUCKET = 1.0;
const buckets = [];
for (let s = 0; s < clip.duration; s += BUCKET) {
  const seg = rows.filter((r) => r.t >= s && r.t < s + BUCKET);
  if (seg.length === 0) continue;
  const hoofY = seg.flatMap((r) => r.hooves.map((h) => h.y));
  const pelY = seg.map((r) => r.pelvisY);
  const headY = seg.map((r) => r.headY);
  /** ★接地している蹄の平均本数 */
  const support = seg.reduce((n, r) => n + r.hooves.filter((h) => h.y <= CONTACT).length, 0) / seg.length;
  /** ★踏み替えの回数（★1 本の蹄が接地に入った回数）→ 完歩/秒 */
  let strikes = 0;
  for (let i = 1; i < seg.length; i += 1) {
    const a = seg[i - 1].hooves[0]; const b = seg[i].hooves[0];
    if (a !== undefined && b !== undefined && a.y > CONTACT && b.y <= CONTACT) strikes += 1;
  }
  /** ★接地中の蹄が後ろへ流れる速さ（★中央値） */
  const speeds = [];
  for (let i = 1; i < seg.length; i += 1) {
    for (let k = 0; k < HOOVES.length; k += 1) {
      const a = seg[i - 1].hooves[k]; const b = seg[i].hooves[k];
      if (a === undefined || b === undefined) continue;
      if (a.y <= CONTACT && b.y <= CONTACT) speeds.push((b.z - a.z) / STEP);
    }
  }
  speeds.sort((x, y) => x - y);
  const median = speeds.length > 0 ? speeds[Math.floor(speeds.length / 2)] : 0;
  buckets.push({
    from: Number(s.toFixed(1)),
    to: Number(Math.min(s + BUCKET, clip.duration).toFixed(1)),
    support: Number(support.toFixed(2)),
    strides: strikes,
    hoofLift: Number((Math.max(...hoofY) - floor).toFixed(2)),
    pelvis: Number((Math.max(...pelY) - Math.min(...pelY)).toFixed(2)),
    pelvisMean: Number((pelY.reduce((a, x) => a + x, 0) / pelY.length).toFixed(2)),
    headMax: Number(Math.max(...headY).toFixed(2)),
    stanceSpeed: Number(median.toFixed(2)),
    pelvisTravel: Number((Math.max(...seg.map((r) => r.pelvisZ)) - Math.min(...seg.map((r) => r.pelvisZ))).toFixed(2)),
  });
}

console.log(`★クリップ「${clip.name}」 ${clip.duration.toFixed(2)} 秒 / トラック ${clip.tracks.length} 本`);
console.log(`★接地の敷居 y ≤ ${CONTACT.toFixed(2)}（床 ${floor.toFixed(2)}）`);
console.log('');
console.log(' 区間      接地本数  完歩  蹄の上げ  腰の上下  腰の高さ  頭の最高  接地の流れ  腰の前後');
for (const b of buckets) {
  console.log(
    `${String(b.from).padStart(5)}–${String(b.to).padStart(5)}s`
    + `${String(b.support).padStart(8)}`
    + `${String(b.strides).padStart(6)}`
    + `${String(b.hoofLift).padStart(10)}`
    + `${String(b.pelvis).padStart(10)}`
    + `${String(b.pelvisMean).padStart(10)}`
    + `${String(b.headMax).padStart(10)}`
    + `${String(b.stanceSpeed).padStart(12)}`
    + `${String(b.pelvisTravel).padStart(10)}`,
  );
}
