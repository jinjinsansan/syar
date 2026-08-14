/**
 * ★自分で画面を見るための静止画（開発用）
 *   ⚠️ 「たぶんこう」で直すと外します。**描いたものを自分で見ます。**
 * 実行: npx tsx tools/shot.mjs
 */
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'node:fs';
import { DEFAULT_RACE_BALANCE, resolveRace, paceOf, replayOf } from '@star/race-engine';
import {
  replayPositionModel, sceneAt, cameraFor, timeWarpFor, knotsFor, DEFAULT_PHASE_RATES,
} from '@star/render';
import { loadFrames, dressed, commonDigitScale } from './lib/dress.mjs';
import POOL from '../apps/web/src/lib/watch-pool.json' with { type: 'json' };

const SEED = 42, OWN = 3, DIST = 1600, FIELD = 12, LANES = 6;
const VIEW = { width: 1280, height: 720, trackTop: 330, laneHeight: 46 };
const STRATS = ['nige', 'senko', 'sashi', 'oikomi'];

const start = (SEED * 13) % Math.max(1, POOL.length - FIELD);
const entrants = POOL.slice(start, start + FIELD).map((h, i) => ({
  horseId: String(i + 1), stats: h.stats, surfaceAptitude: h.surfaceAptitude,
  distanceCenter: h.distanceCenter, distanceRange: h.distanceRange,
  strategyAptitude: h.strategyAptitude, heavyAptitude: h.heavyAptitude,
  strategy: STRATS[(i + SEED) % 4], condition: 3, fatigue: 20,
  weightKg: 55, gate: i + 1, age: 4, skillGenes: h.skillGenes,
}));
const conditions = { raceId: 's', distance: DIST, surface: 'turf', trackCondition: 'good', courseShape: 'oval', baseWeightKg: 55 };
const result = resolveRace({ conditions, entrants, seed: SEED, balance: DEFAULT_RACE_BALANCE });
const { pace } = paceOf(entrants, DEFAULT_RACE_BALANCE);
const boundaries = replayOf(result, (g) => entrants[g - 1].strategy, pace);
const model = replayPositionModel({
  distanceMeter: DIST, spurtMetersLeft: 800, straightMetersLeft: 400, boundaries,
  jostle: 0.6, jostleSeed: SEED * 2654435761,
});
const warp = timeWarpFor(knotsFor(boundaries, OWN), DEFAULT_PHASE_RATES);
const frames = await loadFrames('design/art/assets/horse-gallop-sheet.png');

const P = { sky: [143,184,207], stand: [107,111,116], hedge: [47,74,43], fence: [59,63,54], rail: [200,198,189], turf: [75,122,65] };
mkdirSync('design/art/assets/shots', { recursive: true });

for (const [name, d] of [['a-start', 1], ['b-cruise', warp.displaySec * 0.35], ['c-spurt', warp.displaySec * 0.72], ['d-straight', warp.displaySec * 0.93]]) {
  const sec = warp.raceSecAt(d);
  const own = model.at(sec).find((h) => h.gate === OWN);
  const frame = sceneAt({
    model, viewport: VIEW, camera: cameraFor(DIST - own.meters, OWN), ownGate: OWN,
    silkOf: (g) => `silk-${g}`, gallopFrames: 6, laneOf: (g) => (g - 1) % LANES,
    laneCount: LANES, foregroundRail: true, strategyOf: (g) => entrants[g - 1].strategy, pace,
    animSec: d, poleEveryMeter: 200, pxPerMeter: 24,
    ...(name === 'd-straight' ? { result: result.order.slice(0, 5).map((e, i) => ({ place: i + 1, gate: Number(e.horseId), margin: e.marginLabel })) } : {}),
  }, sec);

  let img = sharp({ create: { width: VIEW.width, height: VIEW.height, channels: 4, background: { r: 17, g: 17, b: 17, alpha: 1 } } });
  const layers = [];

  /**
   * ★**ブラウザと同じ模様を描きます。**
   *
   *   ⚠️ ここは長らく**べた塗り**でした。ブラウザ（`canvas-renderer.ts`）は模様を描くので、
   *      ★**私が見ている絵と、オーナーが見ている絵が違っていました。**
   *      「背景が寂しい」と私が判断していたのは、**確認用ツールの絵**でした。
   *   → 同じ模様をここでも描きます。**判断する道具が違うものを見せてはいけません。**
   */
  const tile = (role, w, h, base) => {
    const buf = Buffer.alloc(w * h * 4);
    const put = (x, y, c, a = 255) => {
      const i = (y * w + x) * 4; buf[i] = c[0]; buf[i + 1] = c[1]; buf[i + 2] = c[2]; buf[i + 3] = a;
    };
    for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) put(x, y, base);
    const mix = (c, t, k) => c.map((v, i) => Math.round(v * (1 - k) + t[i] * k));
    if (role === 'sky') {
      // ★横に流れる薄い雲（斜めの縞にしない）
      for (const [a, b] of [[0.30, 0.34], [0.42, 0.45], [0.55, 0.57]]) {
        const y0 = Math.floor(h * a), y1 = Math.floor(h * b);
        for (let y = y0; y < y1; y += 1) {
          const fade = 1 - Math.abs((y - (y0 + y1) / 2) / Math.max(1, (y1 - y0) / 2));
          for (let x = 0; x < w; x += 1) put(x, y, mix(base, [255, 255, 255], 0.10 * fade));
        }
      }
    } else if (role === 'stand') {
      for (let y = 2; y < h - 2; y += 3)
        for (let x = 1; x < w; x += 4) put(x, y, mix(base, ((x + y) % 7 < 3) ? [255, 255, 255] : [0, 0, 0], 0.18));
    } else if (role === 'hedge') {
      for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 3) {
        const c2 = mix(base, ((x * 5 + y * 3) % 11 < 5) ? [255, 255, 255] : [0, 0, 0], 0.12);
        for (let dy = 0; dy < 2 && y + dy < h; dy += 1) for (let dx = 0; dx < 2 && x + dx < w; dx += 1) put(x + dx, y + dy, c2);
      }
    } else if (role === 'fence') {
      for (let y = 0; y < h; y += 1) for (let x = 0; x < 2; x += 1) put(x, y, mix(base, [0, 0, 0], 0.45));
      for (let x = 0; x < w; x += 1) put(x, Math.floor(h / 2), mix(base, [0, 0, 0], 0.2));
    } else if (role === 'rail') {
      for (let y = 0; y < h; y += 1) for (let x = 0; x < 3; x += 1) put(x, y, mix(base, [0, 0, 0], 0.35));
    } else if (role === 'turf') {
      for (let y = 0; y < h; y += 1) {
        if (Math.floor(y / 26) % 2 === 1) for (let x = 0; x < w; x += 1) put(x, y, mix(base, [0, 0, 0], 0.08));
      }
    }
    return buf;
  };

  for (const c of frame.commands) {
    if (c.kind !== 'parallax') continue;
    const col = P[c.role] ?? [120, 120, 120];
    const hh = Math.max(1, c.height);
    const t = tile(c.role, c.tileWidth, hh, col);
    // ★敷き詰め（offset の剰余を取る。ブラウザと同じ）
    const strip = Buffer.alloc((VIEW.width + c.tileWidth) * hh * 4);
    const off = c.offset % c.tileWidth;
    for (let y = 0; y < hh; y += 1) for (let x = 0; x < VIEW.width + c.tileWidth; x += 1) {
      const sx = (x + off) % c.tileWidth;
      const so = (y * c.tileWidth + sx) * 4, doo = (y * (VIEW.width + c.tileWidth) + x) * 4;
      strip[doo] = t[so]; strip[doo + 1] = t[so + 1]; strip[doo + 2] = t[so + 2]; strip[doo + 3] = t[so + 3];
    }
    layers.push({
      input: await sharp(strip, { raw: { width: VIEW.width + c.tileWidth, height: hh, channels: 4 } })
        .extract({ left: 0, top: 0, width: VIEW.width, height: hh }).png().toBuffer(),
      left: 0, top: c.y,
    });
  }

  for (const c of frame.commands) {
    if (c.kind !== 'shadow') continue;
    const w = Math.max(2, c.width), hh = Math.max(2, Math.round(c.width / 5));
    const a = Math.round(255 * c.strength * 0.4);
    const buf = Buffer.alloc(w * hh * 4);
    for (let y = 0; y < hh; y += 1) for (let x = 0; x < w; x += 1) {
      const nx = (x - w / 2) / (w / 2), ny = (y - hh / 2) / (hh / 2);
      const o = (y * w + x) * 4;
      if (nx * nx + ny * ny <= 1) { buf[o] = 36; buf[o + 1] = 58; buf[o + 2] = 30; buf[o + 3] = a; }
    }
    const left = Math.round(c.at.x - w / 2), top = Math.round(c.at.y - hh / 2);
    if (left + w < 0 || left > VIEW.width || top + hh < 0 || top > VIEW.height) continue;
    layers.push({ input: await sharp(buf, { raw: { width: w, height: hh, channels: 4 } }).png().toBuffer(), left: Math.max(0, left), top: Math.max(0, top) });
  }
  for (const c of frame.commands) {
    if (c.kind !== 'sprite') continue;
    const gate = Number(String(c.silk).replace('silk-', ''));
    const w = 220 * c.scale, hh = 140 * c.scale;
    if (c.at.x + w < 0 || c.at.x > VIEW.width || c.at.y + hh < 0 || c.at.y > VIEW.height) continue;
    let buf = await dressed(frames, c.sprite.frame, gate, await commonDigitScale(frames, gate));
    if (c.scale !== 1) buf = await sharp(buf).resize(w, hh, { kernel: 'nearest' }).png().toBuffer();
    layers.push({ input: buf, left: Math.round(c.at.x), top: Math.round(c.at.y) });
  }
  const out = `design/art/assets/shots/${name}.png`;
  writeFileSync(out, await img.composite(layers).png().toBuffer());
  console.log(`  ${out}  sec=${sec.toFixed(1)} 残り${(DIST - own.meters).toFixed(0)}m zoom=${frame.commands.find((c)=>c.kind==='sprite').scale}`);
}
