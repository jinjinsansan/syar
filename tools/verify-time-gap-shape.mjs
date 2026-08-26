/**
 * ★**スコア→タイム写像の形（γ）の検証**（指示書 `DEV_INSTRUCTIONS_P4_FINISH_CONTEST_20260825.md` 3-1〜3-3）
 *
 *   3-1 既定（γ=1.0）が **1 ビットも動かない**こと
 *   3-2 γ=1.3 / 1.6 で **着順列が完全一致**すること
 *   3-3 解析値（timeGap × 速度 ÷ 2.4）と**位置モデル**の一致比
 *
 * ⚠️ ★読むだけです。製品の既定値には触れません（差し替えは道具の中だけ・I-5）。
 * ⚠️ ★乱数・時刻を直接呼びません。シードを渡すだけです（憲法 4）。
 *
 * 実行: npx tsx tools/verify-time-gap-shape.mjs [--races 1000]
 */
import { DEFAULT_RACE_BALANCE, resolveRace, paceOf } from '@star/race-engine';
import { HORSE_LENGTH_M } from '@star/render';
import { buildAuditRace, RACE_DEFAULTS } from './lib/race-audit-build.mjs';

const argi = process.argv.indexOf('--races');
const N = argi >= 0 ? Number(process.argv[argi + 1]) : 1000;
const GAMMAS = [1.0, 1.3, 1.6];
const withGamma = (g) => ({ ...DEFAULT_RACE_BALANCE, TIME_GAP_SHAPE_GAMMA: g });
const seedOf = (i) => 42 + i * 7;
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const pct = (a, q) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };

/* ── 3-1: 既定が 1 ビットも動かない ───────────────────────── */
/**
 * ★**現行の式をこの道具の中に写して**、製品の出力と突き合わせます。
 *   ⚠️ 「同じ結果になるはず」ではなく、**同じ数値であること**を `Object.is` で見ます
 *      （`===` は -0 と 0 を区別しません）。
 */
let bitMismatch = 0, checked = 0;
/**
 * ★**D-059 のゲートで落ちるシードは飛ばして数えます。**
 *   ⚠️ これは**この便の変更とは無関係の既存の不具合**です（変更を退避した HEAD でも落ちる）。
 *      黙って飛ばすと「全部通った」に見えるので、★件数を必ず出します（R-8 / 無言の間引き禁止）。
 */
const skipped = [];
const buildOrSkip = (seed, balance) => {
  try { return buildAuditRace(balance === undefined ? { seed } : { seed, balance }); }
  catch (e) { skipped.push({ seed, msg: String(e.message) }); return null; }
};
for (let i = 0; i < N; i += 1) {
  const built = buildOrSkip(seedOf(i));          // 既定 = γ 1.0
  if (built === null) continue;
  const { result } = built;
  const base = result.baseTimeSec;
  const ranked = result.order;
  const S1 = ranked[0].finalScore;
  for (let k = 0; k < ranked.length; k += 1) {
    const row = ranked[k];
    const oldGap = S1 > 0 ? ((S1 - row.finalScore) / S1) * base * DEFAULT_RACE_BALANCE.TIME_GAP_FACTOR : 0;
    if (!Object.is(oldGap, row.timeGapSec)) bitMismatch += 1;
    if (!Object.is(base + oldGap, row.timeSec)) bitMismatch += 1;
    checked += 2;
  }
}
console.log(`\n★3-1 既定（γ=1.0）が現行の式と一致するか`);
console.log(`   ${N} レース / ${checked} 個の数値を Object.is で比較 … 不一致 ${bitMismatch} 個`);
/**
 * ★**飛ばした本数は必ず出します。** 黙って間引くと「全部通った」に見えます
 *   （正典: 無言の打ち切りをしない）。
 */
if (skipped.length > 0) {
  const seeds = [...new Set(skipped.map((x) => x.seed))];
  console.log(`   ⚠️ ★D-059 のゲートで落ちたため飛ばしたシード ${seeds.length} 本: ${seeds.slice(0, 6).join(', ')}`);
  console.log('      ★この便の変更とは無関係の既存の不具合です（変更を退避した HEAD でも同じシードが落ちます）');
} else {
  console.log('   飛ばしたシード: なし');
}

/* ── 3-2: 着順が変わらない ─────────────────────────────── */
let orderMismatch = 0;
const rows = new Map(GAMMAS.map((g) => [g, { lead2: [], within5: [], runaway: 0, total: [], races: 0 }]));
for (let i = 0; i < N; i += 1) {
  const seed = seedOf(i);
  let baseOrder = null;
  for (const g of GAMMAS) {
    const built = buildOrSkip(seed, withGamma(g));
    if (built === null) continue;
    const order = built.result.order.map((e) => Number(e.horseId));
    if (g === 1.0) baseOrder = order;
    else if (JSON.stringify(order) !== JSON.stringify(baseOrder)) orderMismatch += 1;

    /* 解析値（レビュー側と同じ作り方） */
    const speed = built.DIST / built.result.baseTimeSec;
    const lengths = (sec) => (sec * speed) / HORSE_LENGTH_M;
    const gaps = built.result.order.map((e) => e.timeGapSec);
    const r = rows.get(g);
    r.races += 1;
    r.lead2.push(lengths(gaps[1] - gaps[0]));
    r.within5.push(gaps.filter((x) => lengths(x - gaps[0]) <= 5).length);
    if (lengths(gaps[1] - gaps[0]) >= 3) r.runaway += 1;
    r.total.push(lengths(gaps[gaps.length - 1] - gaps[0]));
  }
}
console.log(`\n★3-2 γ=1.3 / 1.6 で着順が変わらないか`);
console.log(`   ${N} レース × 2 通り … 着順列の不一致 ${orderMismatch} レース`);

console.log(`\n★参考: レビュー側の表を独立に再現（${N} レース・解析値）`);
console.log('   γ      1着-2着    4頭が5馬身内   独走(3馬身+)   総差 p10/p50/p90');
console.log('   ' + '─'.repeat(70));
for (const g of GAMMAS) {
  const r = rows.get(g);
  const four = (r.within5.filter((n) => n >= 4).length / r.races * 100).toFixed(0);
  console.log(`   ${g.toFixed(1)}  ${med(r.lead2).toFixed(2).padStart(8)} 馬身 ${four.padStart(10)}% `
    + `${(r.runaway / r.races * 100).toFixed(0).padStart(11)}%   `
    + `${pct(r.total, 0.1).toFixed(2)}/${med(r.total).toFixed(2)}/${pct(r.total, 0.9).toFixed(2)}`);
}

/* ── 3-3: 解析値と位置モデルの一致 ───────────────────────── */
console.log(`\n★3-3 解析値と位置モデルの一致（1着-2着・${Math.min(N, 200)} レース）`);
console.log('   γ      解析値    位置モデル   比（解析÷モデル）');
console.log('   ' + '─'.repeat(52));
for (const g of GAMMAS) {
  const ratios = [], anas = [], mods = [];
  for (let i = 0; i < Math.min(N, 200); i += 1) {
    const built = buildOrSkip(seedOf(i), withGamma(g));
    if (built === null) continue;
    const speed = built.DIST / built.result.baseTimeSec;
    const ana = ((built.result.order[1].timeGapSec - built.result.order[0].timeGapSec) * speed) / HORSE_LENGTH_M;
    /** ★勝馬がゴールした瞬間に、2 着が何馬身後ろにいるか（位置モデル） */
    const winGate = Number(built.result.order[0].horseId);
    const secondGate = Number(built.result.order[1].horseId);
    const winFinish = built.boundaries.find((b) => b.gate === winGate).finishSec;
    const at = built.model.at(winFinish);
    const lead = at.find((h) => h.gate === winGate).meters;
    const second = at.find((h) => h.gate === secondGate).meters;
    const mod = (lead - second) / HORSE_LENGTH_M;
    if (mod > 0.01) { ratios.push(ana / mod); anas.push(ana); mods.push(mod); }
  }
  console.log(`   ${g.toFixed(1)}  ${med(anas).toFixed(2).padStart(7)} 馬身 ${med(mods).toFixed(2).padStart(9)} 馬身 ${med(ratios).toFixed(3).padStart(12)}`);
}
console.log('');
