/**
 * ★**カットごとに、馬が画面高の何 % で描かれているか**を ★画面から測る（★2026-09-11）
 *
 * 【★なぜ要るか】
 *   ★オーナー ④「★コーナーは今のところ 1 つも上手くいっていません」。
 *   ★参考映像を測ると、★コーナーと発走直後の引きでは ★**馬が画面高の 5% 前後**しかありません。
 *   ★こちらは ★**どこでも 25% 前後**で描いています。★大きく写せば写すほど、
 *   ★不合格の走り（★斜め前・★斜め後ろ）が読めてしまいます。
 *   → ★まず ★**今いくつなのか**を、★推定ではなく ★**実際に描いた矩形**から出します。
 *
 * ⚠️ ★幾何から計算しません（★`tools/_shotsize.mjs` は式を写した別物で、★画面と一致しません）。
 *    ★この道具は ★**画面が `__raceDiag.boxes` に書いた実寸**だけを読みます（★R-30）。
 *
 * ★実行:
 *   npx tsx tools/measure-shot-horse-size.mjs --from 0 --to 60 --step 0.5
 *   npx tsx tools/measure-shot-horse-size.mjs --url "http://localhost:3210/race?dev=1&corner=wide"
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { launch } from './lib/cdp.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : process.argv[i + 1]; };
const FROM = Number(arg('from', 0));
const TO = Number(arg('to', 60));
const STEP = Number(arg('step', 0.5));
const URL = String(arg('url', 'http://localhost:3210/race?dev=1'));
const OUT = String(arg('out', 'tmp/shot-horse-size'));

const browser = await launch({ port: 9455, width: 1400, height: 950, timeoutMs: 20000 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** ⚠️ ★文字は完全一致で押す（★部分一致は「ほかのコースを観る」を掴む・★2026-09-09） */
const click = (t) => browser.evaluate(`(function(){var b=[].slice.call(document.querySelectorAll('button')).filter(function(x){return x.textContent.trim()===${JSON.stringify(t)};});if(b[0]){b[0].click();return true;}return false;})()`);

try {
  await browser.send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 950, deviceScaleFactor: 1, mobile: false });
  await browser.goto(URL, "!!document.querySelector('canvas')", { timeoutMs: 120000, settleMs: 4000 });
  await browser.send('Page.bringToFront');
  /** ⚠️ ★撮影用シークのつまみが出るまで待つ（★素材を読み終える前は真っ黒） */
  let ready = false;
  for (let i = 0; i < 90; i += 1) {
    const n = await browser.evaluate("[].slice.call(document.querySelectorAll('input[type=range]')).filter(function(x){return Number(x.max)>30;}).length");
    if (Number(n) > 0) { ready = true; break; }
    await sleep(2000);
  }
  if (!ready) { console.error('★★シークのつまみが出ませんでした'); await browser.close(); process.exit(1); }
  await sleep(8000);
  const started = (await click('観る')) === true || (await click('演出開始')) === true;
  if (!started) { console.error('★★レースを始められませんでした'); await browser.close(); process.exit(1); }
  await sleep(3000);
  await click('停止'); await sleep(500);

  const seekTo = (sec) => browser.evaluate(`(function(){
    var is=[].slice.call(document.querySelectorAll('input[type=range]'));
    var i=is.filter(function(x){return Number(x.max)>30;})[0];
    if(!i) return 'シークのつまみが無い';
    var set=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;
    set.call(i, ${JSON.stringify(String(sec))});
    i.dispatchEvent(new Event('input',{bubbles:true}));
    i.dispatchEvent(new Event('change',{bubbles:true}));
    return i.value;
  })()`);

  const rows = [];
  for (let t = FROM; t <= TO + 1e-9; t += STEP) {
    await seekTo(t.toFixed(2));
    await sleep(180);
    const raw = await browser.evaluate(`(function(){
      var c=document.querySelector('canvas'); var d=window.__raceDiag;
      if(!c||!d) return 'なし';
      return JSON.stringify({H:c.height, W:c.width, shot:d.shot, cutIn:d.cutIn||null, asset:d.asset||null,
        hs:(d.boxes||[]).map(function(b){return b.h;})});
    })()`);
    if (String(raw) === 'なし') { rows.push({ sec: Number(t.toFixed(2)), shot: null }); continue; }
    const v = JSON.parse(String(raw));
    const hs = (v.hs || []).slice().sort((a, b) => a - b);
    const med = hs.length === 0 ? null : hs[Math.floor(hs.length / 2)];
    rows.push({
      sec: Number(t.toFixed(2)), shot: v.shot, cutIn: v.cutIn, asset: v.asset, canvasH: v.H,
      n: hs.length,
      medPct: med === null ? null : Number(((100 * med) / v.H).toFixed(2)),
      maxPct: hs.length === 0 ? null : Number(((100 * hs[hs.length - 1]) / v.H).toFixed(2)),
    });
  }

  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/rows.json`, JSON.stringify(rows, null, 2));

  /** ★カットごとにまとめる（★中央値の中央値） */
  const byShot = new Map();
  for (const r of rows) {
    if (r.shot === null || r.medPct === null) continue;
    const key = r.cutIn ? `${r.shot}(cutIn:${r.cutIn})` : r.shot;
    if (!byShot.has(key)) byShot.set(key, []);
    byShot.get(key).push(r.medPct);
  }
  console.log('カット'.padEnd(34), 'コマ'.padEnd(5), '馬高%（中央値）  範囲');
  for (const [k, v] of byShot) {
    const s = v.slice().sort((a, b) => a - b);
    console.log(k.padEnd(34), String(v.length).padEnd(5),
      String(s[Math.floor(s.length / 2)]).padStart(6), '   ', `${s[0]}〜${s[s.length - 1]}`);
  }
  console.log(`\n★${OUT}/rows.json`);
} finally {
  await browser.close();
}
