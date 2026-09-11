/**
 * ★**カットごとに「馬が画面上でどちらへ進むか」と「隊列の形」**を測る（★2026-09-11）
 *
 * 【★なぜ要るか】
 *   ★オーナー評「★カットインや真横カメラワークでも ★**切り替わりの時にレースが
 *   ★イメージとして繋がっていかない**」。
 *
 *   ★映像で「繋がらない」と感じる原因の筆頭は ★**進行方向の反転**です
 *   （★映画でいう「イマジナリーラインを越える」）。★前のカットで右へ走っていた馬が
 *   ★次のカットで左へ走ると、★見ている側は ★**別のレース**として受け取ります。
 *   ★この案件でも 2026-08-28 に同じ症状が出ています（★4 角の正面カットの反転）。
 *
 *   ★もう 1 つ、★オーナー評「★陣地取りはもう少し ★**自然に縦長の列**に」。
 *   ★これは ★**隊列が画面上で縦長か横長か**の話なので、同じ場所で測れます。
 *
 * ⚠️ ★幾何を作り直しません。★画面が `__raceDiag` に書いた ★**実際の投影**を読みます（★R-30）。
 *    ★`x0,y0` は馬の足元、★`x1,y1` は ★**そこから走路に沿って 3m 先**の投影です。
 *
 * ★実行: npx tsx tools/measure-screen-direction.mjs --from 5 --to 62 --step 0.35
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { launch } from './lib/cdp.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : process.argv[i + 1]; };
const FROM = Number(arg('from', 5));
const TO = Number(arg('to', 62));
const STEP = Number(arg('step', 0.35));
const URL = String(arg('url', 'http://localhost:3210/race?dev=1'));
const OUT = String(arg('out', 'tmp/screen-direction'));

const browser = await launch({ port: 9459, width: 1400, height: 950, timeoutMs: 20000 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const click = (t) => browser.evaluate(`(function(){var b=[].slice.call(document.querySelectorAll('button')).filter(function(x){return x.textContent.trim()===${JSON.stringify(t)};});if(b[0]){b[0].click();return true;}return false;})()`);

try {
  await browser.send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 950, deviceScaleFactor: 1, mobile: false });
  await browser.goto(URL, "!!document.querySelector('canvas')", { timeoutMs: 120000, settleMs: 4000 });
  await browser.send('Page.bringToFront');
  let ready = false;
  for (let i = 0; i < 90; i += 1) {
    const n = await browser.evaluate("[].slice.call(document.querySelectorAll('input[type=range]')).filter(function(x){return Number(x.max)>30;}).length");
    if (Number(n) > 0) { ready = true; break; }
    await sleep(2000);
  }
  if (!ready) { console.error('★★シークのつまみが出ませんでした'); await browser.close(); process.exit(1); }
  await sleep(8000);
  if (!((await click('観る')) === true || (await click('演出開始')) === true)) {
    console.error('★★レースを始められませんでした'); await browser.close(); process.exit(1);
  }
  await sleep(3000);
  await click('停止'); await sleep(500);

  const seekTo = (sec) => browser.evaluate(`(function(){
    var is=[].slice.call(document.querySelectorAll('input[type=range]'));
    var i=is.filter(function(x){return Number(x.max)>30;})[0];
    if(!i) return 'なし';
    var set=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;
    set.call(i, ${JSON.stringify(String(sec))});
    i.dispatchEvent(new Event('input',{bubbles:true}));
    i.dispatchEvent(new Event('change',{bubbles:true}));
    return i.value;
  })()`);

  const rows = [];
  for (let t = FROM; t <= TO + 1e-9; t += STEP) {
    await seekTo(t.toFixed(2));
    await sleep(170);
    const raw = await browser.evaluate(`(function(){
      var c=document.querySelector('canvas'); var d=window.__raceDiag;
      if(!c||!d||!d.horses||d.horses.length===0) return 'なし';
      return JSON.stringify({W:c.width,H:c.height,shot:d.shot,cutIn:d.cutIn||null,
        hs:d.horses.map(function(h){return [h.x0,h.y0,h.x1,h.y1];})});
    })()`);
    if (String(raw) === 'なし') continue;
    const v = JSON.parse(String(raw));
    /** ★進行方向（★画面座標）。★足元から 3m 先への向きの平均 */
    let dx = 0, dy = 0;
    for (const [x0, y0, x1, y1] of v.hs) { dx += x1 - x0; dy += y1 - y0; }
    dx /= v.hs.length; dy /= v.hs.length;
    /** ★隊列の形。★足元の散らばりの幅と高さ（★画面高で正規化） */
    const xs = v.hs.map((h) => h[0]), ys = v.hs.map((h) => h[1]);
    const spanX = Math.max(...xs) - Math.min(...xs);
    const spanY = Math.max(...ys) - Math.min(...ys);
    rows.push({
      sec: Number(t.toFixed(2)), shot: v.shot, cutIn: v.cutIn,
      dirDeg: Number(((Math.atan2(dy, dx) * 180) / Math.PI).toFixed(1)),
      toRight: dx > 0,
      spanXpct: Number(((100 * spanX) / v.W).toFixed(1)),
      spanYpct: Number(((100 * spanY) / v.H).toFixed(1)),
      /** ★1 より大きいほど「横長」、小さいほど「縦長」（★画面の縦横比を揃えて比べる） */
      wideness: Number(((spanX / v.W) / Math.max(1e-6, spanY / v.H)).toFixed(2)),
    });
  }

  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/rows.json`, JSON.stringify(rows, null, 2));

  const byShot = new Map();
  for (const r of rows) {
    if (r.shot === null) continue;
    if (!byShot.has(r.shot)) byShot.set(r.shot, []);
    byShot.get(r.shot).push(r);
  }
  const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
  console.log('カット'.padEnd(22), '進行方向', ' 右向き', '  隊列 横%', ' 縦%', ' 横長さ');
  for (const [k, v] of byShot) {
    const right = v.filter((r) => r.toRight).length;
    console.log(
      k.padEnd(22),
      String(med(v.map((r) => r.dirDeg))).padStart(7) + '°',
      `${right}/${v.length}`.padStart(7),
      String(med(v.map((r) => r.spanXpct))).padStart(9),
      String(med(v.map((r) => r.spanYpct))).padStart(6),
      String(med(v.map((r) => r.wideness))).padStart(6));
  }
  console.log(`\n★${OUT}/rows.json`);
} finally {
  await browser.close();
}
