import { mkdirSync, writeFileSync } from 'node:fs';
import { buildAuditRace, auditClock } from './lib/race-audit-build.mjs';
import { withFinishRunOut, finalOrderOf } from '../packages/render/src/index.ts';

// Measure physical ground spacing, not sprite occlusion by perspective.
// Run: node --import tsx tools/audit-traffic-motion.mjs
const rows = [];
for (const distance of [1200, 1600, 2400]) for (const seed of [42, 99, 14]) {
  for (const legacyMotion of [true, false]) {
    const race = buildAuditRace({ seed, distance, legacyMotion });
    const clock = auditClock(race);
    let overlapPairFrames = 0, maxLateralMps = 0;
    let previous;
    const dt = 1 / 30;
    for (let d = 0; d <= clock.warp.displaySec; d += dt) {
      const sec = clock.warp.raceSecAt(d);
      const horses = withFinishRunOut(race.model.at(sec), g => clock.finishSec.get(g), sec, distance);
      for (let i = 0; i < horses.length; i++) {
        if (previous) maxLateralMps = Math.max(maxLateralMps, Math.abs(horses[i].w - previous[i].w) / dt);
        for (let j = i + 1; j < horses.length; j++) {
          if (Math.abs(horses[i].meters - horses[j].meters) < 2.4
              && Math.abs(horses[i].w - horses[j].w) < 1) overlapPairFrames++;
        }
      }
      previous = horses;
    }
    const orderPreserved = JSON.stringify(finalOrderOf(race.model))
      === JSON.stringify(race.result.order.map(h => Number(h.horseId)));
    rows.push({ distance, seed, legacyMotion, displaySec: clock.warp.displaySec,
      overlapPairFrames, maxLateralMps, orderPreserved });
    console.log(JSON.stringify(rows.at(-1)));
  }
}
mkdirSync('out/traffic-motion', { recursive: true });
writeFileSync('out/traffic-motion/audit.json', JSON.stringify(rows, null, 2));
if (rows.some(r => !r.orderPreserved || (!r.legacyMotion && (r.overlapPairFrames > 0 || r.maxLateralMps > 1.301)))) {
  process.exitCode = 1;
}
