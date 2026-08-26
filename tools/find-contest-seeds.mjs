/**
 * ★**「せめぎ合い」になる seed を総当たりで探す**（読取専用）
 *
 *   オーナー要求は「終盤で馬が大きい状態で、4〜5 頭がせめぎ合う」＋
 *   「画面の左側から追い込み馬が一気に差してくる」。
 *
 *   ⚠️ ★これはエンジンにも表示にも**手を入れません。** seed を選ぶだけです。
 *      エンジンは seed で決定論なので、★**要求どおりの展開になる seed が必ず在ります。**
 *   ★探すのは「そういうレースが実在する seed」であって、結果の細工ではありません。
 *
 *   使い方: node tools/find-contest-seeds.mjs [--from 1] [--to 800] [--top 12]
 */
import { buildAuditRace } from './lib/race-audit-build.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : Number(process.argv[i + 1]); };
const FROM = arg('from', 1), TO = arg('to', 800), TOP = arg('top', 12);
const HORSE_M = 2.4;
/** ★直線の入口（残り 634m）＝ 4 角を出たところ */
const STRAIGHT_REMAIN = 634;

const rows = [];
for (let seed = FROM; seed <= TO; seed++) {
  let built;
  try { built = buildAuditRace({ seed }); } catch { continue; }
  const DIST = built.DIST;
  const place = new Map(built.result.order.map((row, i) => {
    const g = built.entrants.find((e) => e.horseId === row.horseId)?.gate;
    return [g, row.finishPosition ?? i + 1];
  }));
  const top5 = [...place.entries()].filter(([, p]) => p <= 5).map(([g]) => g);
  /** ★レース時間で走査（表示時間ではない。展開の判定なので実時間でよい） */
  const samples = [];
  for (let sec = 0; sec < 400; sec += 0.2) {
    const at = built.model.at(sec);
    const lead = Math.max(...at.map((h) => h.meters));
    if (lead >= DIST) break;
    const remain = DIST - lead;
    if (remain > STRAIGHT_REMAIN) continue;
    samples.push({ remain, at });
  }
  if (samples.length < 5) continue;
  const spreadOf = (at) => {
    const v = at.filter((h) => top5.includes(h.gate)).map((h) => h.meters);
    return Math.max(...v) - Math.min(...v);
  };
  const last = samples[samples.length - 1];
  const finishSpread = spreadOf(last.at);
  /** ★直線での追い抜き（上位 5 頭の組） */
  let overtakes = 0;
  for (let i = 0; i < top5.length; i++) {
    for (let j = i + 1; j < top5.length; j++) {
      let prev = null;
      for (const s of samples) {
        const a = s.at.find((h) => h.gate === top5[i]).meters;
        const b = s.at.find((h) => h.gate === top5[j]).meters;
        const d = a - b;
        if (prev !== null && Math.sign(prev) !== Math.sign(d) && d !== 0) overtakes++;
        prev = d;
      }
    }
  }
  /** ★追い込み: 直線入口の順位 → 確定着順 で何人抜いたか */
  const entryOrder = [...samples[0].at].sort((a, b) => b.meters - a.meters).map((h) => h.gate);
  let bestGain = 0, closerGate = 0, closerFrom = 0, closerTo = 0;
  for (const [gate, p] of place) {
    const from = entryOrder.indexOf(gate) + 1;
    if (from <= 0) continue;
    const gain = from - p;
    if (p <= 3 && gain > bestGain) { bestGain = gain; closerGate = gate; closerFrom = from; closerTo = p; }
  }
  /** ★1〜2 着の差（馬身）。小さいほど決着が際どい */
  const top2 = [...place.entries()].filter(([, p]) => p <= 2).map(([g]) => g);
  const m1 = last.at.find((h) => h.gate === top2.find((g) => place.get(g) === 1)).meters;
  const m2 = last.at.find((h) => h.gate === top2.find((g) => place.get(g) === 2)).meters;
  const win = Math.abs(m1 - m2) / HORSE_M;
  rows.push({ seed, finishSpread, overtakes, bestGain, closerGate, closerFrom, closerTo, win });
}

/**
 * ★**点数の付け方**
 *   ①上位 5 頭が固まっている ②追い抜きが多い ③後方から突っ込む馬が居る
 *   ④★**決着ははっきりしていること**
 *
 * ⚠️ ★最初は「1-2 着差が小さいほど良い」にしていました。★**逆でした。**
 *    ハナ差の決着は、開発中の確認には★**誰が勝ったのか読めない**ので不向きです
 *    （オーナー指摘 2026-08-26「2 頭同時にゴールする複雑なパターンをなぜ持ってくる」）。
 *    ★狙うのは「直線は競るが、ゴールでは勝者がはっきり分かる」レースです。
 *    → 1-2 着差が `WIN_MIN`〜`WIN_MAX` 馬身の**帯の中**にあるほど高得点にします。
 */
const WIN_MIN = arg('winMin', 1.5), WIN_MAX = arg('winMax', 3.0);
const clarity = (win) => {
  if (win >= WIN_MIN && win <= WIN_MAX) return 30;
  const d = win < WIN_MIN ? WIN_MIN - win : win - WIN_MAX;
  return Math.max(0, 30 - d * 20);
};
const score = (r) =>
  Math.max(0, 20 - r.finishSpread) * 3 + r.overtakes * 2 + r.bestGain * 6 + clarity(r.win);

rows.sort((a, b) => score(b) - score(a));
console.log(`★seed ${FROM}〜${TO} を調べました（${rows.length} 本）\n`);
console.log('  seed   点  ゴール時の上位5頭の伸び  追い抜き  追い込み(何人抜き)      1-2着差');
for (const r of rows.slice(0, TOP)) {
  console.log('  ' + String(r.seed).padStart(4) + String(Math.round(score(r))).padStart(5) +
    (r.finishSpread.toFixed(1) + 'm').padStart(16) + ` (${(r.finishSpread / HORSE_M).toFixed(1)}馬身)` +
    String(r.overtakes).padStart(8) + '回' +
    (r.bestGain > 0 ? `   馬番${r.closerGate}: ${r.closerFrom}番手→${r.closerTo}着` : '   なし').padEnd(22) +
    (r.win.toFixed(2) + '馬身').padStart(9));
}
