/**
 * ★**演出なしで、最後の直線に「追い抜き」は実在するのか**（読取専用）
 *
 *   ⚠️ ★これが 0 なら、どんなカメラを使っても「せめぎ合い」は映せません。
 *      在らないものは映らないからです。★カメラの問題か、レースの問題かを切り分けます。
 */
import { CLIMAX_LEAD_COUNT } from '@star/render';
import { buildAuditRace, auditClock, auditSceneAt } from './lib/race-audit-build.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : process.argv[i + 1]; };
const SEEDS = String(arg('seeds', '42,14,332,474')).split(',').map(Number);
const HORSE_M = 2.4;

for (const seed of SEEDS) {
  const built = buildAuditRace({ seed });
  const clock = auditClock(built);
  const place = new Map(built.result.order.map((row, i) => {
    const g = built.entrants.find((e) => e.horseId === row.horseId)?.gate;
    return [g, row.finishPosition ?? i + 1];
  }));
  const top5 = [...place.entries()].filter(([, p]) => p <= CLIMAX_LEAD_COUNT)
    .sort((a, b) => a[1] - b[1]).map(([g]) => g);
  const samples = [];
  const total = clock.introSec + clock.warp.displaySec;
  for (let d = clock.introSec; d <= total; d += 0.1) {
    const r = auditSceneAt(built, clock, d, { width: 1280, height: 720 }, 'v6', { climax: false });
    const lead = Math.max(...r.drawn.map((h) => h.s));
    const remain = built.DIST - lead;
    if (remain > 634 || remain < 0) continue;          // ★直線だけ
    samples.push({ remain, byGate: new Map(r.drawn.map((h) => [h.gate, h.s])) });
  }
  let overtakes = 0; let levels = 0; const detail = [];
  for (let i = 0; i < top5.length; i++) {
    for (let j = i + 1; j < top5.length; j++) {
      const a = top5[i], b = top5[j];
      let prev = null; let wasLevel = false;
      for (const s of samples) {
        const d = s.byGate.get(a) - s.byGate.get(b);
        if (Math.abs(d) <= HORSE_M * 0.5 && !wasLevel) { levels++; wasLevel = true; }
        if (Math.abs(d) > HORSE_M) wasLevel = false;
        if (prev !== null && Math.sign(prev) !== Math.sign(d) && Math.sign(d) !== 0) {
          overtakes++; detail.push(`${a}-${b} @残り${Math.round(s.remain)}m`);
        }
        prev = d;
      }
    }
  }
  const first = samples[0], last = samples[samples.length - 1];
  const spreadOf = (s) => { const v = top5.map((g) => s.byGate.get(g)); return Math.max(...v) - Math.min(...v); };
  console.log(`seed ${String(seed).padStart(3)}  上位5頭=${top5.join(',')}` +
    `  ★直線での追い抜き ${overtakes} 回  / 並んだ場面 ${levels} 回` +
    `  伸び ${spreadOf(first).toFixed(1)}m → ${spreadOf(last).toFixed(1)}m`);
  if (detail.length) console.log('     ' + detail.slice(0, 6).join(' / '));
}
