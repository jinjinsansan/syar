/**
 * ★ゲージの向きを測る（D-072）
 *
 * 【なぜ要るか】
 *   ⚠️ 前回、描画層で作った近似式が★**符号が逆**でした。
 *      残り200m で「余力と最終着順の順位相関 −0.653」＝ **勝つ馬ほどバテて見えていた**。
 *      ★**通ったこと自体は前回も同じ**です（式は正常に動き、それらしい値を返していました）。
 *
 *   → ★**測って、向きを確かめます。**
 *
 * 【★正しい向き】
 *   余力が多い ⇔ 着順が良い（＝着順の数字が小さい）
 *   → ★順位相関は**負**が正しい（余力↑ と 着順の数字↓）。
 *   ⚠️ ここを取り違えると符号の議論が反転するので、**「良い馬ほど余力が多いか」で言い直します。**
 *
 * 実行: npx tsx tools/diag-gauge.mjs [--races 400] [--field 12]
 */
import { readFileSync } from 'node:fs';
import {
  DEFAULT_RACE_BALANCE, DEFAULT_INTERVENTION_BALANCE as IB,
  resolveRace, averageSpeedMps, aiProxyPlan,
  staminaTrackOf, staminaAtMeter,
} from '@star/race-engine';
// ★乱数は注入する（憲法4）。`Math.random` は呼ばない
import { deriveRng } from '@star/sim-engine';

const POOL = JSON.parse(readFileSync('apps/web/src/lib/watch-pool.json', 'utf8'));
const argv = process.argv.slice(2);
const num = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? Number(argv[i + 1]) : d; };
const RACES = num('--races', 400);
const FIELD = num('--field', 12);
const STRATS = ['nige', 'senko', 'sashi', 'oikomi'];
const DISTANCES = [1200, 1600, 2000, 2400];

/** ★V-18 と同じ理由で、まともな擬似乱数を使う（弱いハッシュの剰余は混ざらない） */
function mulberry32(a) {
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function spearman(xs, ys) {
  const n = xs.length;
  const rank = (v) => {
    const idx = v.map((x, i) => [x, i]).sort((a, b) => a[0] - b[0]);
    const r = new Array(n);
    for (let i = 0; i < n;) {
      let j = i;
      while (j + 1 < n && idx[j + 1][0] === idx[i][0]) j++;
      const avg = (i + j) / 2 + 1;
      for (let k = i; k <= j; k++) r[idx[k][1]] = avg;
      i = j + 1;
    }
    return r;
  };
  const rx = rank(xs), ry = rank(ys);
  const mx = rx.reduce((a, b) => a + b, 0) / n;
  const my = ry.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = rx[i] - mx, dy = ry[i] - my;
    sxy += dx * dy; sxx += dx * dx; syy += dy * dy;
  }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : 0;
}

console.log('# ★ゲージの向き（D-072）— 良い馬ほど余力が多いか');
console.log(`  ${RACES} レース × ${DISTANCES.length} 距離 / ${FIELD}頭 / AI 代行の乗り方\n`);
console.log('  ★正しい向き: 余力と着順の順位相関が**負**（余力が多い馬ほど着順の数字が小さい）\n');

const MARKS = [800, 600, 400, 200];
console.log('  距離    残800m   残600m   残400m   残200m      ★0 に張り付く区間');
const byDistance = {};
let strongest = 0;
for (const dist of DISTANCES) {
  const left = MARKS.map(() => []);
  const places = [];
  let emptyFrom = 0;   // ★ゲージが 0 になる地点（残り距離）の平均
  let emptyCount = 0;
  for (let r = 0; r < RACES; r++) {
    const seed = r * 2654435761 + dist;
    const rnd = mulberry32(seed);
    const startIdx = (r * 13) % Math.max(1, POOL.length - FIELD);
    const picked = POOL.slice(startIdx, startIdx + FIELD);
    const order = picked.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    const entrants = order.map((src, i) => {
      const h = picked[src];
      return {
        horseId: String(i + 1), stats: h.stats, surfaceAptitude: h.surfaceAptitude,
        distanceCenter: h.distanceCenter, distanceRange: h.distanceRange,
        strategyAptitude: h.strategyAptitude, heavyAptitude: h.heavyAptitude,
        strategy: STRATS[(src + r) % 4], condition: 3, fatigue: 20,
        weightKg: 55, gate: i + 1, age: 4, skillGenes: h.skillGenes,
      };
    });
    const conditions = {
      raceId: `gauge-${dist}-${r}`, distance: dist, surface: 'turf',
      trackCondition: 'good', courseShape: 'oval', baseWeightKg: 55,
    };
    const res = resolveRace({ conditions, entrants, seed, balance: DEFAULT_RACE_BALANCE });
    const speed = averageSpeedMps(dist, 'turf', 'good', DEFAULT_RACE_BALANCE);
    for (const e of res.order) {
      const en = entrants[Number(e.horseId) - 1];
      const horse = { iq: en.stats.iq, gt: en.stats.gt, st: en.stats.st, condition: en.condition, fatigue: en.fatigue };
      // ★AI 代行の乗り方（本番と同じ経路）。乱数は注入する
      const plan = aiProxyPlan(horse, deriveRng(seed, Number(e.horseId)), IB);
      const track = staminaTrackOf(horse, plan, dist, IB);
      MARKS.forEach((m, i) => left[i].push(staminaAtMeter(track, m)));
      places.push(e.finishPosition);
      // ★0 に張り付き始める地点
      for (let m = dist; m >= 0; m -= 10) {
        if (staminaAtMeter(track, m) <= 0) { emptyFrom += m; emptyCount++; break; }
      }
    }
  }
  const rhos = left.map((col) => spearman(col, places));
  byDistance[dist] = rhos;
  for (const r of rhos) if (r < strongest) strongest = r;   // ★負が正しい向き
  const emptyAt = emptyCount > 0 ? emptyFrom / emptyCount : 0;
  const share = emptyCount / places.length;
  console.log(
    `  ${String(dist).padStart(4)}m  ` + rhos.map((r) => `${(r >= 0 ? '+' : '') + r.toFixed(3)}${r < 0 ? ' ' : '★'}`.padStart(8)).join(' ')
    + `   残り ${emptyAt.toFixed(0)}m から（${(share * 100).toFixed(0)}%の馬）`,
  );
}

console.log('');
/**
 * ⚠️ ★**ここで合否を出しません。**
 *
 *    一度「最も弱いところが 0 以上なら FAIL」という判定を書きかけました。
 *    ★**それは通る幅を自分で決めることです**（D-065 の手順は ①測る ②報告 ③帯外なら再較正）。
 *    どこまでのずれを許すかは**裁定**です。
 *
 * ★**この道具が言えること**は2つだけです:
 *    ① 以前の近似（強く逆を向いていた）とは**桁が違う**
 *    ② ★**弱いながら符号が揺れる区間がある**（下に出ます）
 */
const flipped = [];
for (const [dist, marks] of Object.entries(byDistance)) {
  marks.forEach((r, i) => { if (r > 0) flipped.push(`${dist}m 残${MARKS[i]}m: ${r >= 0 ? '+' : ''}${r.toFixed(3)}`); });
}
console.log(`★参考: 以前の近似は ${'−'}0.653 相当の強さで逆を向いていました。`);
console.log(`  今回いちばん強く出た値は ${strongest.toFixed(3)}（向きの正しい側）です。`);
if (flipped.length > 0) {
  console.log(`⚠️ ★符号が揺れた点: ${flipped.join(' / ')}`);
  console.log('   → ★裁定をもらいます（この幅を許すかどうか）。こちらでは決めません。');
} else {
  console.log('  すべての点で向きは正しい側でした。');
}
