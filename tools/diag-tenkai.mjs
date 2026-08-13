/**
 * ★R-16 を逆向きに当てる — 「展開の計算を全部消したら、画面は変わるか」
 *
 * > 変わらないなら、画面は「レースを見せている」のではなく「馬を動かしている」だけ。
 * > P3 で6回出た「機構は存在するが働いていない」の、プレイヤーの目に対する版。
 *
 * ★描画コマンドの配列を比べます（画像ではなく）。環境で揺れないためです。
 *
 * 実行: npx tsx tools/diag-tenkai.mjs
 */
import { readFileSync } from 'node:fs';
import { DEFAULT_RACE_BALANCE, resolveRace, paceOf, replayOf } from '@star/race-engine';
import { replayPositionModel, sceneAt, cameraFor } from '@star/render';

const DIST = 1600;
const FIELD = 12;
const OWN = 3;
const STRATS = ['nige', 'senko', 'sashi', 'oikomi'];

const pool = JSON.parse(readFileSync('docs/pool-staging.json', 'utf8'));
const arr = Array.isArray(pool) ? pool : (pool.horses ?? []);
const picked = [...arr].filter((h) => h.stats && Number.isFinite(h.stats.sp))
  .sort((a, b) => b.stats.sp - a.stats.sp).slice(0, FIELD);

const mk = (strategyOf) => picked.map((h, i) => ({
  horseId: String(i + 1), stats: h.stats, surfaceAptitude: h.surfaceAptitude,
  distanceCenter: h.distanceCenter, distanceRange: h.distanceRange,
  strategyAptitude: h.strategyAptitude, heavyAptitude: h.heavyAptitude,
  strategy: strategyOf(i), condition: 3, fatigue: 20, weightKg: 55, gate: i + 1, age: 4,
  skillGenes: h.skillGenes ?? [],
}));
const conditions = { raceId: 'd', distance: DIST, surface: 'turf', trackCondition: 'good', courseShape: 'oval', baseWeightKg: 55 };

/** 画面（描画コマンド列）を作る */
function screenOf(entrants) {
  const result = resolveRace({ conditions, entrants, seed: 42, balance: DEFAULT_RACE_BALANCE });
  const { pace } = paceOf(entrants, DEFAULT_RACE_BALANCE);
  const b = replayOf(result, (g) => entrants[g - 1].strategy, pace);
  const model = replayPositionModel({ distanceMeter: DIST, spurtMetersLeft: 800, straightMetersLeft: 400, boundaries: b });
  const input = {
    model, viewport: { width: 1280, height: 720, trackTop: 340, laneHeight: 105 },
    laneOf: (g) => (g - 1) % 3, ownGate: OWN, silkOf: (g) => `silk-${g}`, gallopFrames: 6,
  };
  const frames = [];
  for (let i = 0; i <= 60; i += 1) {
    const sec = (i / 60) * model.raceSec;
    const own = model.at(sec).find((h) => h.gate === OWN);
    const left = own === undefined ? DIST : DIST - own.meters;
    frames.push(sceneAt({ ...input, camera: cameraFor(left, OWN) }, sec));
  }
  return { frames, order: result.order.map((e) => e.horseId), pace };
}

console.log('# ★R-16 を逆向きに: 展開を消したら画面は変わるか');
console.log('');

// ① 展開あり（脚質がばらばら＝逃げ馬がいる）
const withT = screenOf(mk((i) => STRATS[i % 4]));
// ② ★展開を消す（全馬を同じ脚質に＝ペースの差が消える）
const without = screenOf(mk(() => 'senko'));

console.log(`  ① 展開あり: ペース ${withT.pace} / 着順 ${withT.order.join(' ')}`);
console.log(`  ② 展開なし: ペース ${without.pace} / 着順 ${without.order.join(' ')}`);
console.log('');

const a = JSON.stringify(withT.frames);
const b = JSON.stringify(without.frames);
console.log('【判定】');
console.log(`  描画コマンドが同じか: ${a === b ? '★同じ（＝画面は展開を見せていない）' : '違う'}`);

// ★どれだけ違うかを数字で
let diff = 0, total = 0;
for (let f = 0; f < withT.frames.length; f += 1) {
  const s1 = withT.frames[f].commands.filter((c) => c.kind === 'sprite');
  const s2 = without.frames[f].commands.filter((c) => c.kind === 'sprite');
  for (let i = 0; i < Math.min(s1.length, s2.length); i += 1) {
    total += 1;
    if (s1[i].at.x !== s2[i].at.x || s1[i].at.y !== s2[i].at.y) diff += 1;
  }
}
console.log(`  馬の位置が違うコマンド: ${diff} / ${total}（${((diff / Math.max(1, total)) * 100).toFixed(0)}%）`);
console.log('');
console.log('★ただし「位置が違う」は「読める」を意味しません。');
console.log('  画面から**展開が読み取れるか**は別の測定（Q-P4-13 のボット）で見ます。');
