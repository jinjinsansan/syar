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
import { loadFrames, dressed } from './lib/dress.mjs';
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
const frames = await loadFrames('design/art/assets/horse-gallop-cloth2-sheet.png');

const P = { sky: [143,184,207], stand: [107,111,116], rail: [200,198,189], turf: [75,122,65] };
mkdirSync('design/art/assets/shots', { recursive: true });

for (const [name, d] of [['a-start', 1], ['b-cruise', warp.displaySec * 0.35], ['c-spurt', warp.displaySec * 0.72], ['d-straight', warp.displaySec * 0.93]]) {
  const sec = warp.raceSecAt(d);
  const own = model.at(sec).find((h) => h.gate === OWN);
  const frame = sceneAt({
    model, viewport: VIEW, camera: cameraFor(DIST - own.meters, OWN), ownGate: OWN,
    silkOf: (g) => `silk-${g}`, gallopFrames: 6, laneOf: (g) => (g - 1) % LANES,
    laneCount: LANES, foregroundRail: true, strategyOf: (g) => entrants[g - 1].strategy, pace,
    animSec: d, poleEveryMeter: 200,
  }, sec);

  let img = sharp({ create: { width: VIEW.width, height: VIEW.height, channels: 4, background: { r: 17, g: 17, b: 17, alpha: 1 } } });
  const layers = [];
  for (const c of frame.commands) {
    if (c.kind === 'parallax') {
      const col = P[c.role] ?? [120, 120, 120];
      layers.push({
        input: { create: { width: VIEW.width, height: Math.max(1, c.height), channels: 4, background: { r: col[0], g: col[1], b: col[2], alpha: 1 } } },
        left: 0, top: c.y,
      });
    }
  }
  for (const c of frame.commands) {
    if (c.kind !== 'sprite') continue;
    const gate = Number(String(c.silk).replace('silk-', ''));
    const w = 220 * c.scale, hh = 140 * c.scale;
    if (c.at.x + w < 0 || c.at.x > VIEW.width || c.at.y + hh < 0 || c.at.y > VIEW.height) continue;
    let buf = await dressed(frames, c.sprite.frame, gate);
    if (c.scale !== 1) buf = await sharp(buf).resize(w, hh, { kernel: 'nearest' }).png().toBuffer();
    layers.push({ input: buf, left: Math.round(c.at.x), top: Math.round(c.at.y) });
  }
  const out = `design/art/assets/shots/${name}.png`;
  writeFileSync(out, await img.composite(layers).png().toBuffer());
  console.log(`  ${out}  sec=${sec.toFixed(1)} 残り${(DIST - own.meters).toFixed(0)}m zoom=${frame.commands.find((c)=>c.kind==='sprite').scale}`);
}
