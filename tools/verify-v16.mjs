/**
 * ★V-16 — **画面が情報を運んでいるか**（正典 D-062・裁定 2026-08-13）
 *
 * ① 全局面で 画面ボット ≥ 出走表ボット      （見ることが損にならない）
 * ② 勝負所以降で 画面ボット > 出走表ボット ＋有意差（見ることに意味がある）
 * ③ ★スタート直後の差が小さい
 * ④ ★AUC が局面とともに上がる
 *
 * 【★③④ が要る理由】（裁定）
 *   > ④が「**平坦なら最初から答えが映っている**」を機械が捕まえる形です。
 *   > 今回そちらが目で見つけたものを、**次からはゲートが見ます**。
 *
 *   ★実際、①②だけなら**漏洩したまま通りました**:
 *     位置の順位と脚質の2つだけで、スタート直後から AUC 0.928・**ずっと平坦**。
 *
 * 実行: npx tsx tools/verify-v16.mjs [--races 1200] [--formation 0]
 */
import { execFileSync } from 'node:child_process';

const argv = process.argv.slice(2);
const num = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? Number(argv[i + 1]) : d; };
const RACES = num('--races', 1200);

/** 測る点。★局面の代表点（残りメートル） */
const POINTS = [
  { left: 1500, phase: 'start' },
  { left: 1200, phase: 'cruise' },
  { left: 900, phase: 'cruise' },
  { left: 800, phase: 'spurt' },
  { left: 600, phase: 'spurt' },
  { left: 400, phase: 'straight' },
  { left: 200, phase: 'straight' },
];

const extra = [];
const ji = argv.indexOf('--formation');
if (ji >= 0) extra.push('--formation', argv[ji + 1]);

console.log('# ★V-16 — 画面が情報を運んでいるか');
console.log(`  ${RACES} レース / ${extra.join(' ') || '既定'}`);
console.log('');

const rows = [];
for (const p of POINTS) {
  /**
   * ★`execFileSync` は**非ゼロ終了で例外を投げます**。
   *   ⚠️ 呼ぶ先は「読めない」と判定したときに 1 で終わるので、
   *      **判定が FAIL になった瞬間にこのハーネスが落ちます**。
   *      ★同じ踏み方を前にもしました（ゲートが捕まえたときだけ落ちるハーネス）。
   *   → 出力は成否によらず読みます。
   */
  let out;
  try {
    out = execFileSync('npx', ['tsx', 'tools/verify-readable.mjs',
      '--races', String(RACES), '--at', String(p.left), ...extra],
    { encoding: 'utf8', shell: true });
  } catch (e) {
    out = String(e.stdout ?? '');
    if (out === '') throw e;   // ★本当に動かなかったときは隠さない
  }
  const pick = (label) => {
    const line = out.split('\n').find((l) => l.includes(label));
    const m = line === undefined ? null : line.match(/[01]\.\d{3}/);
    return m === null ? NaN : Number(m[0]);
  };
  const se = (() => {
    const m = out.match(/標準誤差 ≒ ([\d.]+)/);
    return m === null ? NaN : Number(m[1]);
  })();
  rows.push({ ...p, form: pick('出走表ボット'), screen: pick('画面ボット'), se });
}

console.log('  残りm  局面      出走表   画面    差');
for (const r of rows) {
  const d = r.screen - r.form;
  console.log(`  ${String(r.left).padStart(5)}  ${r.phase.padEnd(9)} ${r.form.toFixed(3)}  ${r.screen.toFixed(3)}  ${d >= 0 ? '+' : ''}${d.toFixed(3)}`);
}
console.log('');

const se = rows[0].se;
const fails = [];

// ① 全局面で 画面 ≥ 出走表
const below = rows.filter((r) => r.screen < r.form - se);
if (below.length > 0) fails.push(`① 画面が出走表を下回る局面: ${below.map((r) => `${r.left}m(${(r.screen - r.form).toFixed(3)})`).join(' ')}`);

// ② 勝負所以降で有意に上回る
const late = rows.filter((r) => r.phase === 'spurt' || r.phase === 'straight');
const weak = late.filter((r) => r.screen - r.form <= 2 * r.se);
if (weak.length > 0) fails.push(`② 勝負所以降で有意差なし: ${weak.map((r) => `${r.left}m`).join(' ')}`);

// ③ ★スタート直後の差が小さい
const startRow = rows[0];
const startGap = startRow.screen - startRow.form;
if (startGap > 4 * se) fails.push(`③ ★スタート直後で既に読めすぎ: +${startGap.toFixed(3)}（許容 ${(4 * se).toFixed(3)}）`);

// ④ ★局面とともに上がる
const early = (rows.find((r) => r.left === 1200) ?? rows[1]).screen;
const mid = (rows.find((r) => r.left === 800) ?? rows[3]).screen;
const end = (rows.find((r) => r.left === 200) ?? rows[rows.length - 1]).screen;
const rising = end - early;
if (!(mid >= early - se && end > mid + se)) {
  fails.push(`④ ★平坦（最初から答えが映っている疑い）: 道中 ${early.toFixed(3)} → 勝負所 ${mid.toFixed(3)} → 直線 ${end.toFixed(3)}`);
}

console.log('【判定】');
console.log(`  ③ スタート直後の差 : +${startGap.toFixed(3)}（許容 ${(4 * se).toFixed(3)}）`);
console.log(`  ④ 局面とともに上昇 : ${early.toFixed(3)} → ${mid.toFixed(3)} → ${end.toFixed(3)}（+${rising.toFixed(3)}）`);
console.log('');
if (fails.length === 0) {
  console.log('  ★V-16 PASS（①②③④）');
} else {
  for (const f of fails) console.log(`  ★★FAIL — ${f}`);
}
process.exit(fails.length === 0 ? 0 : 1);
