/**
 * ★**#1 の直しを実画面で見るための取り込み**（読取専用・`out/` にしか書きません）
 *
 *   通常 `/race`（既定 v5）を**本物のブラウザで開き**、指摘のあった第4コーナーの俯瞰
 *   （`fourth-corner-high`）の前後だけを 30fps で取り込みます。
 *
 * ⚠️ ★オフライン描画（`tools/shot-race-at.mjs`）では**勝負服 overlay と毛色の焼き込みを
 *    通りません**（`page.tsx` の私有関数）。オーナーが見る絵と違うものを見せないため、
 *    ここは実画面から取ります（R-30）。
 * ⚠️ ★時刻も乱数も使いません。シークバーに表示秒を入れるだけです（憲法 4）。
 * ⚠️ ★製品コードには触れません。着順・馬の位置も読むだけです（憲法 3）。
 *
 *
 * ⚠️ ★**この道具は 1 コマ単位では決定論ではありません**（2026-08-25 実測）。
 *    同じ条件で 2 回撮ると、カットの境目付近で **19/123 コマ**が別のバイト列になりました
 *    （見た目では判別できず、画素差は平均 3〜13/255）。シークしてから 90ms で読むので、
 *    HUD の落ち着き（`HUD_SETTLE_SEC`）など時間で動くものが撮る瞬間ごとに変わるためと見ています。
 *    ★**したがって「バイト一致しない＝絵が違う」と読んではいけません。**
 *      台本どうしを比べるときは、**同じ条件を 2 回撮って、その揺れより大きいか**を先に見ること。
 *      ショットや画角が本当に同じかは、`auditSceneAt` の値（決定論）で判定します。
 * 実行: node tools/capture-overhead-stride.mjs --label stride9
 */
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { buildAuditRace, auditClock, auditSceneAt, auditTotalDisplaySec, RACE_DEFAULTS } from './lib/race-audit-build.mjs';
import { launch } from './lib/cdp.mjs';

const LABEL = (() => {
  const i = process.argv.indexOf('--label');
  if (i < 0) throw new Error('★--label が要ります（例: --label stride9）');
  return process.argv[i + 1];
})();
const BASE = process.env.AUDIT_BASE ?? 'http://localhost:3210';
const OUT = path.resolve('out/2d-overhead-stride', LABEL);
/** ★`AUDIT_SEED` で seed を替えられます（指示書 §8-C の seed 違い） */
const SEED = Number(process.env.AUDIT_SEED ?? RACE_DEFAULTS.seed);
const FPS = 30;
const W = 1280, H = 720;
const INTRO_SEC = 7.8;
const SHOT = process.env.AUDIT_SHOT ?? "fourth-corner-high";
/** ★前後のカットも少しだけ入れる（ハードカットで切り替わるところを見ていただくため） */
const MARGIN_SEC = 0.4;
const JPEG_Q = 0.95;

/* ── 撮る時刻を決める（製品の台本がそのまま決める・こちらでは決めない） ── */
const built = buildAuditRace({ seed: SEED });
const clock = auditClock(built, RACE_DEFAULTS.ownGate);
/**
 * ★**総尺は共通の式から引きます**（`raceTotalDisplaySec`・D-052 / R-30）。
 *   ⚠️ ★以前ここは `introSec + warp.displaySec` だけで、★**勝馬の寄り・着順ボード・
 *      ゴール前リプレイを知りませんでした。** そのためリプレイ区間を指定しても
 *      ★範囲外に丸められて **0 コマ**になりました（2026-08-28 に実際に起きた）。
 */
const totalSec = auditTotalDisplaySec(clock);
let from = Infinity, to = -Infinity;
for (let f = 0; f / FPS <= totalSec; f += 1) {
  const d = f / FPS;
  const { scene } = auditSceneAt(built, clock, d, { width: W, height: H }, process.env.AUDIT_SCRIPT ?? 'v5');
  if (scene.shot.id !== SHOT) continue;
  if (d < from) from = d;
  if (d > to) to = d;
}
if (!Number.isFinite(from)) throw new Error(`★台本 v5 に ${SHOT} が出てきません`);
/** ★`AUDIT_FROM` / `AUDIT_TO` を渡せば、ショットではなく**表示秒**で窓を決める（決着部分の比較用） */
const START = process.env.AUDIT_FROM !== undefined
  ? Math.max(0, Number(process.env.AUDIT_FROM))
  : Math.max(0, from - MARGIN_SEC);
/**
 * ★**ゴール後（勝馬クローズアップ）まで撮れるようにします**（指示書 §8-A）。
 *   ⚠️ ★以前は `Math.min(totalSec, ...)` で**レース尺で頭打ち**にしていたため、
 *      勝馬のカットが 1 コマも撮れませんでした。余韻ぶん `POST_ROLL_SEC` まで許します。
 */
const POST_ROLL_SEC = 8;
const END = process.env.AUDIT_TO !== undefined
  ? Math.min(totalSec + POST_ROLL_SEC, Number(process.env.AUDIT_TO))
  : Math.min(totalSec + POST_ROLL_SEC, to + MARGIN_SEC);
console.log(`★${SHOT}: 表示 ${from.toFixed(2)}〜${to.toFixed(2)}s（${(to - from).toFixed(2)}s）`);
console.log(`   前後 ${MARGIN_SEC}s を足して ${START.toFixed(2)}〜${END.toFixed(2)}s を撮ります`);

/* ── 実画面から取り込む（`tools/capture-script-v5.mjs` と同じ作法） ── */
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
/** ★同じ値を入れ直しても React は onChange を飛ばさないので、一度ずらして戻す */
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

const waitFor = async (browser, expr, timeoutMs) => {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    try { if (await browser.evaluate(expr) === true) return true; } catch { /* 再描画中 */ }
    await new Promise((r) => { setTimeout(r, 200); });
  }
  return false;
};

if (existsSync(OUT)) rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const url = `${BASE}/race?badge=0&auditSec=${INTRO_SEC}${process.env.AUDIT_QUERY ?? '&cinematography=v5'}`;
const browser = await launch({ width: 1500, height: 1100 });
const frames = Math.round((END - START) * FPS) + 1;
try {
  await browser.goto('about:blank', 'true', { timeoutMs: 20000, settleMs: 200 });
  if (!await browser.goto(url, READY, { timeoutMs: 180000, settleMs: 1500 })) {
    throw new Error(`★ページが用意できませんでした: ${url}`);
  }
  const setSeed = await browser.evaluate(SET_SEED(SEED));
  if (Number(setSeed) !== SEED) throw new Error(`★シードを ${SEED} にできませんでした（${setSeed}）`);
  if (!await waitFor(browser, "(()=>!!document.querySelector('input[type=range]'))()", 60000)) {
    throw new Error('★組み直しが終わりません');
  }
  for (let i = 0; i < frames; i += 1) {
    const d = START + i / FPS;
    if (await browser.evaluate(SEEK(+d.toFixed(6))) === 'no-slider') throw new Error('★シークバーが見つかりません');
    await new Promise((r) => { setTimeout(r, 90); });
    const data = await browser.evaluate(`document.querySelector('canvas').toDataURL('image/jpeg', ${JPEG_Q})`);
    writeFileSync(path.join(OUT, `f${String(i).padStart(4, '0')}.jpg`),
      Buffer.from(String(data).split(',')[1], 'base64'));
    if (i % 20 === 0) console.log(`   ${i}/${frames - 1}`);
  }
  writeFileSync(path.join(OUT, 'meta.json'), JSON.stringify({
    label: LABEL, url, seed: SEED, fps: FPS, startSec: +START.toFixed(3), endSec: +END.toFixed(3),
    shot: SHOT, shotFromSec: +from.toFixed(3), shotToSec: +to.toFixed(3), frames, width: W, height: H,
  }, null, 2));
  console.log(`★${frames} コマを ${OUT} に置きました`);
} finally {
  await browser.close();
}
