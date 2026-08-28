/**
 * ★**馬が画面のどれだけを占めるかを、台本ごとに測る**（読取専用）
 *
 * 【なぜ要るか】
 *   オーナー指摘②「**最後の直線で馬が巨大化する**」を数字にします。
 *   ★既にある `tools/audit-edit-grammar-race.mjs` は同じ「馬高比」を測っていますが、
 *     ★**`script` を渡していないので既定の v4 を測っています**。
 *     ⚠️ 通常 `/race` の既定は **v5**（`homestretch-side`）なので、
 *        ★**指摘されている当のカットが、あの監査では一度も測られていません。**
 *   この道具は **v4 と v5 を同じ経路で並べて**測ります。
 *
 * ⚠️ ★場面解決は実画面と同じ `resolveBroadcastV2Scene` を通します（R-30・式を作り直さない）。
 * ⚠️ ★製品コードは変更しません。着順・馬の位置・カメラ定義値・台本に触れません（憲法3）。
 * ⚠️ 時刻も乱数も使いません（憲法4）。seed と表示秒だけで決まります。
 *
 * 使い方:
 *   node tools/audit-horse-size.mjs [--seeds 42,332,474,14] [--step 0.2]
 */
import { cameraBasis, posOf, project } from '@star/render';
import { DEFAULT_RACE_BALANCE } from '@star/race-engine';
import { buildAuditRace, auditClock, auditSceneAt, RACE_DEFAULTS } from './lib/race-audit-build.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : process.argv[i + 1]; };
/**
 * ★**着差の見せ方（γ）を渡せるようにします。**
 *
 *   ⚠️ ★`buildAuditRace` は既定で `DEFAULT_RACE_BALANCE`（γ=1.0）を使います。
 *      ところが**通常 `/race` のデモ既定は γ=1.3** です（`page.tsx` の `DEMO_CONTEST_GAMMA`）。
 *   ★つまり既存の監査は**オーナーが見ている画面と違う条件**を測っていました。
 *     γ を上げると先頭付近が締まり、`frameContenders` が**寄る**ので馬は大きくなります。
 *     ここを切り替えられないと、指摘②の原因に届きません。
 */
/** ★既定値を 1 と書き直さない。★エンジンの既定が動いたとき、★**黙ってずれます**（R-30） */
const GAMMA = Number(arg('gamma', DEMO_CONTEST_GAMMA));
const BALANCE = GAMMA === DEFAULT_RACE_BALANCE.TIME_GAP_SHAPE_GAMMA
  ? DEFAULT_RACE_BALANCE
  : { ...DEFAULT_RACE_BALANCE, TIME_GAP_SHAPE_GAMMA: GAMMA };
const W = 1280;
const H = 720;
const HORSE_HEIGHT_M = 2.4;
const STEP = Number(arg('step', 0.2));
const SEEDS = String(arg('seeds', '42,332,474,14')).split(',').map(Number);
const SCRIPTS = ['v4', 'v5'];

/** ★参考映像の実測（`tools/measure-contest-video.mjs`・走路 480×390） */
const REF = { p50: 0.141, p90: 0.244, max: 0.410 };

const med = (a) => { if (a.length === 0) return 0; const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };
const qOf = (sorted, p) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] : 0);

/** そのコマの「見えている馬の馬高比」を返す */
function ratiosAt(built, clock, displaySec, script) {
  const r = auditSceneAt(built, clock, displaySec, { width: W, height: H }, script);
  const basis = cameraBasis(r.scene.camera);
  const out = [];
  for (const h of r.drawn) {
    const p = posOf(built.course, h.s, h.w);
    const foot = project(r.scene.camera, basis, { x: p.x, y: p.y, z: 0 });
    const head = project(r.scene.camera, basis, { x: p.x, y: p.y, z: HORSE_HEIGHT_M });
    if (foot.depth <= 0) continue;                       // カメラの後ろ
    const heightPx = Math.max(0, foot.y - head.y);
    const widthPx = heightPx * 1.6;
    const x0 = foot.x - widthPx / 2, x1 = foot.x + widthPx / 2;
    /** ★画面とまったく重ならない馬は数えない（`audit-edit-grammar-race.mjs` と同じ判定） */
    if (!(x1 > 0 && x0 < W && foot.y > 0 && head.y < H)) continue;
    out.push({ gate: h.gate, ratio: heightPx / H });
  }
  return {
    shot: r.scene.shot.id,
    raceDisplaySec: r.raceDisplaySec,
    fovDeg: (r.scene.camera.fovY * 180) / Math.PI,
    ratios: out,
  };
}

/**
 * ★**面積で見ること。**「馬高比」だけでは②を見落とします。
 *   真横素材 `side-v6` は 幅÷高さ = 1.71、斜め前 `diag-front-v3` は 0.77（外接矩形の実測）。
 *   ★同じ高さでも真横は 2.22 倍横に広いので、**面積は 3 倍**違います。
 */
const ASPECT_OF = { side: 1.71, 'diag-front': 0.77, 'diag-rear': 0.70, 'high-diag': 1.13 };
const areaOf = (ratio, view) => ratio * ((ratio * (ASPECT_OF[view] ?? 1.71) * H) / W);

console.log(`★馬高比 = 画面上の馬の高さ ÷ 画面の高さ（720px）。★着差の見せ方 γ = ${GAMMA}`);
console.log(`★参考映像の実測: p50 ${(REF.p50 * 100).toFixed(1)}% / p90 ${(REF.p90 * 100).toFixed(1)}% / 最大 ${(REF.max * 100).toFixed(1)}%\n`);

const perShot = new Map();   // `${script}|${shot}` -> ratios[]
for (const seed of SEEDS) {
  const built = buildAuditRace({ ...RACE_DEFAULTS, seed, ...(BALANCE === undefined ? {} : { balance: BALANCE }) });
  const clock = auditClock(built);
  const total = clock.introSec + clock.warp.displaySec;
  for (const script of SCRIPTS) {
    const all = [];
    for (let t = 0; t <= total; t += STEP) {
      const f = ratiosAt(built, clock, t, script);
      if (f.ratios.length === 0) continue;
      const mx = Math.max(...f.ratios.map((r) => r.ratio));
      all.push(mx);
      const key = `${script}|${f.shot}`;
      if (!perShot.has(key)) perShot.set(key, []);
      perShot.get(key).push(mx);
    }
    const s = [...all].sort((a, b) => a - b);
    console.log(`seed ${String(seed).padStart(3)}  台本 ${script}`
      + `  最大馬高比 p50 ${(qOf(s, 0.5) * 100).toFixed(1).padStart(5)}%`
      + `  p90 ${(qOf(s, 0.9) * 100).toFixed(1).padStart(5)}%`
      + `  ★最大 ${(qOf(s, 1) * 100).toFixed(1).padStart(6)}%`
      + `  （参考の最大 ${(REF.max * 100).toFixed(1)}% の ${(qOf(s, 1) / REF.max).toFixed(2)} 倍）`);
  }
}

/* ── ★①②に直接答える表: 直線の「大きさ」と「頭数」を一緒に見る ── */
console.log('\n★★直線（`homestretch-side`）— ①頭数 と ②大きさ は同じ画角の裏表');
console.log('  台本  馬高比p50  面積p50  画角p50  画面内の頭数(中央)  ★最少頭数');
for (const script of SCRIPTS) {
  const shotId = script === 'v4' ? 'homestretch-front' : 'homestretch-side';
  const view = script === 'v4' ? 'diag-front' : 'side';
  const hs = [], cs = [], fs = [];
  for (const seed of SEEDS) {
    const built = buildAuditRace({ ...RACE_DEFAULTS, seed, ...(BALANCE === undefined ? {} : { balance: BALANCE }) });
    const clock = auditClock(built);
    const total = clock.introSec + clock.warp.displaySec;
    for (let t = 0; t <= total; t += STEP) {
      const f = ratiosAt(built, clock, t, script);
      if (f.shot !== shotId || f.ratios.length === 0) continue;
      hs.push(Math.max(...f.ratios.map((r) => r.ratio)));
      cs.push(f.ratios.length);
      fs.push(f.fovDeg);
    }
  }
  /**
   * ★**1 コマも揃わなかったなら、それは「異常なし」ではありません**（R-3 / R-21）。
   * ⚠️ ★`qOf` は空なら 0 を返し、`Math.min(...[])` は Infinity になります。
   *    ★そのまま印字すると **`0.0%`** と並び、★**測れなかったことが見えません。**
   */
  if (hs.length === 0) {
    console.log(`  ${script.padEnd(4)}  ★★ショット ${shotId} が 1 コマも出ていません（台本を確かめてください）`);
    process.exitCode = 1;
    continue;
  }
  const sh = [...hs].sort((a, b) => a - b);
  const h50 = qOf(sh, 0.5);
  console.log(
    `  ${script.padEnd(4)}  ${(h50 * 100).toFixed(1).padStart(8)}%`
    + `  ${(areaOf(h50, view) * 100).toFixed(1).padStart(6)}%`
    + `  ${qOf([...fs].sort((a, b) => a - b), 0.5).toFixed(1).padStart(6)}°`
    + `  ${String(qOf([...cs].sort((a, b) => a - b), 0.5)).padStart(14)} 頭`
    + `  ${String(Math.min(...cs)).padStart(8)} 頭`,
  );
}
console.log(`  参考  ${(REF.p50 * 100).toFixed(1).padStart(8)}%  ${(REF.p50 * ((REF.p50 * 1.71 * 390) / 480) * 100).toFixed(1).padStart(6)}%       —               3〜8 頭`);

console.log('\n★ショット別（4 seed 合算・そのカットで最も大きく映る馬）');
console.log('  台本  ショット                  コマ数   p50     p90    ★最大   参考の最大に対して');
for (const [key, arr] of [...perShot.entries()].sort()) {
  const [script, shot] = key.split('|');
  const s = [...arr].sort((a, b) => a - b);
  const mx = qOf(s, 1);
  const mark = mx > REF.max ? '  ★超過' : '';
  console.log(
    `  ${script.padEnd(4)}  ${shot.padEnd(22)}  ${String(arr.length).padStart(5)}`
    + `  ${(qOf(s, 0.5) * 100).toFixed(1).padStart(5)}%`
    + `  ${(qOf(s, 0.9) * 100).toFixed(1).padStart(5)}%`
    + `  ${(mx * 100).toFixed(1).padStart(6)}%`
    + `  ${(mx / REF.max).toFixed(2).padStart(10)} 倍${mark}`,
  );
}

/* ── ★カットの中で育つか（seed 42・v4 と v5 を並べる） ── */
console.log('\n★カットの中で馬が育つか（seed 42・各カットの前半 25% → 後半 25% の中央値）');
console.log('  台本  ショット                  始      終     伸び率');
{
  const built = buildAuditRace({ ...RACE_DEFAULTS, seed: 42, ...(BALANCE === undefined ? {} : { balance: BALANCE }) });
  const clock = auditClock(built);
  const total = clock.introSec + clock.warp.displaySec;
  for (const script of SCRIPTS) {
    const seq = [];
    for (let t = 0; t <= total; t += STEP) {
      const f = ratiosAt(built, clock, t, script);
      if (f.ratios.length === 0) continue;
      seq.push({ shot: f.shot, mx: Math.max(...f.ratios.map((r) => r.ratio)) });
    }
    /** 連続する同じショットを 1 カットにまとめる */
    const cuts = [];
    for (const row of seq) {
      const last = cuts[cuts.length - 1];
      if (last !== undefined && last.shot === row.shot) last.vals.push(row.mx);
      else cuts.push({ shot: row.shot, vals: [row.mx] });
    }
    for (const c of cuts) {
      const n = Math.max(1, Math.ceil(c.vals.length * 0.25));
      const h0 = med(c.vals.slice(0, n));
      const h1 = med(c.vals.slice(-n));
      const grow = h1 / (h0 || 1);
      console.log(
        `  ${script.padEnd(4)}  ${c.shot.padEnd(22)}`
        + `  ${(h0 * 100).toFixed(1).padStart(5)}%`
        + `  ${(h1 * 100).toFixed(1).padStart(5)}%`
        + `  ${grow.toFixed(2).padStart(6)} 倍${grow > 1.3 ? '  ★育つ' : ''}`,
      );
    }
    console.log('');
  }
}
console.log('⚠️ 幾何だけの数字です。実画面の印象は別に確認が要ります（俯瞰の件で実証済み）。');
