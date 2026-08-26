/**
 * ★**既存ショットを実画面（通常 `/race`）で撮る**（読取専用・追加指示 §2〜§6）
 *
 *   ⚠️ ★`page.tsx` の**一時パッチ**（`?auditShot=<shot-id>`）が当たっている間だけ動きます。
 *      撮影が終わったら逆パッチで外します（§3）。
 *   ⚠️ ★勝負服 overlay・毛色焼き込み・鞍布番号・HUD・通常背景がすべて効く**実画面**です。
 *      オフラインの白勝負服経路は使いません。
 *   ⚠️ ★カメラ値・レース状態は変えません。変えるのはショット選択だけ。
 *
 * 【速く撮るために】
 *   `auditShotOverride()` は**毎フレーム `window.location.search` を読む**ので、
 *   `history.replaceState` で URL を書き換えてからシークすれば、
 *   **ページを読み込み直さずに**ショットを差し替えられます。→ 読み込みは seed ごとに 1 回だけ。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { buildAuditRace, auditClock, RACE_DEFAULTS } from './lib/race-audit-build.mjs';
import { launch } from './lib/cdp.mjs';

const OUT = path.resolve('out/2d-existing-shot-gate');
const SHOTS_DIR = path.join(OUT, '_actual');
mkdirSync(SHOTS_DIR, { recursive: true });

const BASE = process.env.AUDIT_BASE ?? 'http://localhost:3210';
const INTRO_SEC = 7.8;

if (!existsSync(path.join(OUT, 'measurements.json'))) {
  throw new Error('★measurements.json が無い。先に tools/audit-existing-shot-gate.mjs を走らせること');
}
const M = JSON.parse(readFileSync(path.join(OUT, 'measurements.json'), 'utf8'));

/** ★§4 の撮影対象（基準を含む） */
const SIDE_SHOTS = ['homestretch-front', 'homestretch-side', 'side-low', 'backstretch-side', 'side-close'];
const HIGH_SHOTS = ['fourth-corner-front', 'second-corner-high', 'fourth-corner-high', 'aerial'];
const ALL_SHOTS = [...new Set([...SIDE_SHOTS, ...HIGH_SHOTS])];

/** ★§5 の撮影地点（最低限の 6 つ ＋ 第3コーナー） */
const POINT_KEYS = ['early', 'backstretch', 'third-corner', 'fourth-corner', 'straight-entry', 'straight-mid', 'pre-finish'];
/** ★§6: seed 42 は全地点、ほかは直線入口・直線中盤・ゴール前だけ */
const NARROW_POINTS = ['straight-entry', 'straight-mid', 'pre-finish'];

const SEEDS = [
  { seed: 42, role: 'default', points: POINT_KEYS },
  { seed: 332, role: 'contest', points: NARROW_POINTS },
  { seed: 474, role: 'solo', points: NARROW_POINTS },
  { seed: 14, role: 'boundary', points: NARROW_POINTS },
];

const READY = "(()=>{const c=document.querySelector('canvas');if(!c)return false;"
  + "const x=c.getContext('2d');const d=x.getImageData(0,0,c.width,c.height).data;"
  + "let n=0;for(let i=0;i<d.length;i+=4000)if(d[i]>20)n++;return n>50;})()";

const SET_SEED = (v) => `(()=>{
  const el = document.querySelector('input[type=number]');
  if (!el) return 'not-found';
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  set.call(el, String(${v}));
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return el.value;
})()`;

/** ★URL を書き換えるだけ（再読込しない）。次の描画で `auditShotOverride()` が拾う */
const SET_SHOT = (shotId, auditSec) => `(()=>{
  history.replaceState(null, '', '/race?badge=0&auditSec=' + ${JSON.stringify(String(auditSec))}
    + '&auditShot=' + ${JSON.stringify(shotId)});
  return location.search;
})()`;

/**
 * ★シークして再描画させる。
 * ⚠️ ★**同じ値を入れ直しても React は「変わっていない」と判断して onChange を飛ばしません。**
 *    同じ地点でショットだけ差し替えるとき、これで一度も描き直されず
 *    **9 枚とも同じ絵**になりました。→ **一度ずらしてから戻します**。
 */
const SEEK = (sec) => `(()=>{
  const el = document.querySelector('input[type=range]');
  if (!el) return 'no-slider';
  el.step = 'any';
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  const fire = (v) => { set.call(el, String(v)); el.dispatchEvent(new Event('input', { bubbles: true })); };
  fire(${sec} + 0.37);
  fire(${sec});
  return el.value;
})()`;

const BADGE_SHOT = "(()=>{const c=document.querySelector('canvas');"
  + "return JSON.stringify({w:c.width,h:c.height,url:location.href});})()";

const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 16);

async function waitFor(browser, expr, timeoutMs) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    try { if (await browser.evaluate(expr) === true) return true; } catch { /* 再描画中 */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

/* ── 地点 → 表示秒（レースの進行率から二分探索） ─────────── */

function displaySecOfRatio(built, clock, ratio) {
  const targetM = ratio * built.DIST;
  let lo = 0; let hi = clock.warp.displaySec;
  for (let i = 0; i < 40; i += 1) {
    const mid = (lo + hi) / 2;
    const leader = Math.max(...built.model.at(clock.warp.raceSecAt(mid)).map((h) => h.meters));
    if (leader >= targetM) hi = mid; else lo = mid;
  }
  return hi;
}

/* ── 撮影 ───────────────────────────────────── */

const browser = await launch({ width: 1500, height: 1100 });
const captured = [];

try {
  for (const spec of SEEDS) {
    const built = buildAuditRace({ seed: spec.seed });
    const clock = auditClock(built, RACE_DEFAULTS.ownGate);
    const seedRows = M.seeds.find((s) => s.seed === spec.seed);

    await browser.goto('about:blank', 'true', { timeoutMs: 20000, settleMs: 200 });
    if (!await browser.goto(`${BASE}/race?badge=0&auditSec=${INTRO_SEC}`, READY, { timeoutMs: 180000, settleMs: 1500 })) {
      throw new Error('★ページが用意できませんでした');
    }
    const set = await browser.evaluate(SET_SEED(spec.seed));
    if (Number(set) !== spec.seed) throw new Error(`★シードを ${spec.seed} にできませんでした（${set}）`);
    if (!await waitFor(browser, "(()=>!!document.querySelector('input[type=range]'))()", 60000)) {
      throw new Error(`★seed ${spec.seed} の組み直しが終わりません`);
    }

    for (const pk of spec.points) {
      const p = M.points.find((x) => x.key === pk);
      const displaySec = displaySecOfRatio(built, clock, p.ratio);
      for (const shotId of ALL_SHOTS) {
        const auditSec = +(displaySec + INTRO_SEC).toFixed(4);
        await browser.evaluate(SET_SHOT(shotId, auditSec));
        if (await browser.evaluate(SEEK(auditSec)) === 'no-slider') throw new Error('★シークバーが無い');
        const meta = JSON.parse(await browser.evaluate(BADGE_SHOT));
        if (!meta.url.includes(`auditShot=${shotId}`)) throw new Error(`★URL にショットが乗っていない: ${meta.url}`);
        const data = await browser.evaluate("document.querySelector('canvas').toDataURL('image/png')");
        const buf = Buffer.from(String(data).split(',')[1], 'base64');
        const name = `seed${spec.seed}-${pk}-${shotId}.png`;
        writeFileSync(path.join(SHOTS_DIR, name), buf);
        /* ★幾何監査の行を突き合わせて、同じ場面を撮っているか確かめる */
        const geo = seedRows.rows.find((r) => r.point === pk && r.shotId === shotId);
        captured.push({
          seed: spec.seed, role: spec.role, point: pk, pointLabel: p.label,
          shotId, displaySec: +displaySec.toFixed(3), auditSec,
          progressRatio: geo?.progressRatio ?? null,
          geometryRole: geo?.role ?? null,
          fullCount: geo?.fullCount ?? null, partialCount: geo?.partialCount ?? null,
          offCount: geo?.offCount ?? null,
          top2Visible: geo?.top2Visible ?? null, top3Visible: geo?.top3Visible ?? null,
          top4Visible: geo?.top4Visible ?? null,
          maxHeightRatio: geo?.maxHeightRatio ?? null,
          target: geo?.target ?? null,
          file: name, sha256: sha(buf), ...meta,
        });
      }
      console.log(`  seed ${spec.seed} ${p.label}（表示 ${displaySec.toFixed(2)}s）→ ${ALL_SHOTS.length} 枚`);
    }
  }
} finally {
  await browser.close();
}

/* ★同じ地点で全ショットが別の絵になっているか（強制が効いていることの確認） */
const distinctPerPoint = {};
for (const c of captured) {
  const k = `${c.seed}/${c.point}`;
  (distinctPerPoint[k] ??= new Set()).add(c.sha256);
}
const notDistinct = Object.entries(distinctPerPoint)
  .filter(([, v]) => v.size < ALL_SHOTS.length)
  .map(([k, v]) => ({ at: k, distinct: v.size, expected: ALL_SHOTS.length }));

writeFileSync(path.join(OUT, 'actual-capture.json'), JSON.stringify({
  base: BASE, introSec: INTRO_SEC, shots: { side: SIDE_SHOTS, high: HIGH_SHOTS },
  note: '★実ブラウザの通常 /race を、一時フラグ ?auditShot で既存ショットへ強制して撮ったもの。'
    + 'カメラ値・レース状態は変えていない。',
  captured,
  distinctCheck: { notDistinct },
}, null, 2));

console.log(`\n撮影 ${captured.length} 枚`);
console.log(notDistinct.length === 0
  ? '  ★同じ地点でショットごとに別の絵になっている（強制が効いている）'
  : `  ★NG 同じ絵が混ざっている地点: ${JSON.stringify(notDistinct)}`);
console.log(`→ ${path.join(OUT, 'actual-capture.json')}`);
