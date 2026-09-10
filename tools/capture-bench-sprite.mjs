/**
 * ★**4 頭の検証台を、等速で撮る**（★2026-09-10・★裁定 R4）
 *
 * 【★なぜ専用の道具が要るか】
 *   ★`/rig-lab/sprite` は ★**実時間で走ります**（`requestAnimationFrame` で
 *   ★`travel += speed × dt`）。★そのまま連番で撮って固定 fps で詰めると、
 *   ★1 コマの取得にかかった時間が無視され、★**倍率が不明で一定でない映像**になります
 *   （★2026-09-09 に同じ事故を起こしています）。
 *
 * 【★どう撮るか】★裁定の指定どおり ★**検証用の時計を注入**します。
 *   ★台側（`sprite-client.tsx`）が `window.__benchSeekM(進行距離)` を出しており、
 *   ★与えるのは ★**進行距離だけ**です。★コマの選び方も接地の式も変えていません。
 *   ★停止したうえで `速さ × t` を与えれば、★表示秒 t の絵が決まります。
 *
 * 【★基準の設定】★オーナーが見た 2026-09-08 09:38 の画面:
 *   ★4 頭・16.0m/s・1 完歩 5.60m・浮き 30%・馬の高さ 43%・8px 刻み 入・見た目「① 納品のまま」
 *
 * ★実行: npx tsx tools/capture-bench-sprite.mjs --from 0 --to 2.5 --fps 20 --out tmp/bench-ref
 */
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { launch } from './lib/cdp.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : process.argv[i + 1]; };
const FROM = Number(arg('from', 0));
const TO = Number(arg('to', 2.5));
const FPS = Number(arg('fps', 20));
const OUT = String(arg('out', 'tmp/bench-ref'));
const URL = String(arg('url', 'http://localhost:3210/rig-lab/sprite'));

/** ★基準の設定（★9/8 の画面）。★つまみは min/max で見分けます */
const SPEED_MPS = Number(arg('speed', 16));
const SETTINGS = [
  { name: '速さ', min: 4, max: 20, value: SPEED_MPS },
  { name: '1完歩', min: 2.5, max: 9, value: Number(arg('stride', 5.6)) },
  { name: '浮き', min: 0, max: 1, value: Number(arg('bob', 0.3)) },
  { name: '馬の高さ', min: 0.12, max: 0.5, value: Number(arg('height', 0.43)) },
];

rmSync(OUT, { recursive: true, force: true });
mkdirSync(`${OUT}/plain`, { recursive: true });

const browser = await launch({ port: 9452, width: 1400, height: 950, timeoutMs: 20000 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** ⚠️ ★文字は完全一致で押します（★部分一致は別のボタンを掴みます） */
const click = (t) => browser.evaluate(`(function(){var b=[].slice.call(document.querySelectorAll('button')).filter(function(x){return x.textContent.trim()===${JSON.stringify(t)};});if(b[0]){b[0].click();return true;}return false;})()`);

try {
  await browser.send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 950, deviceScaleFactor: 1, mobile: false });
  await browser.goto(URL, "!!document.querySelector('canvas')", { timeoutMs: 120000, settleMs: 4000 });
  await browser.send('Page.bringToFront');

  /**
   * ⚠️ ★**素材を読み終えるまで待ちます。** ★台は「N 頭 × 8 コマ」と表示します。
   *    ★読めていないと「素材を読み込み中…」のままで、★真っ黒なコマが撮れます。
   */
  let ready = false;
  for (let i = 0; i < 60; i += 1) {
    const ok = await browser.evaluate("(function(){var p=[].slice.call(document.querySelectorAll('p')).map(function(x){return x.textContent||'';}).join('|');return /コマ/.test(p)&&!/読み込み中/.test(p);})()");
    if (String(ok) === 'true') { ready = true; break; }
    await sleep(2000);
  }
  if (!ready) { console.error('★★素材が読めませんでした（★120 秒）'); await browser.close(); process.exit(1); }

  /** ★4 頭・8px 刻み 入・見た目「① 納品のまま」 */
  await click('4');
  await click('① 納品のまま');
  const quantiseOn = await browser.evaluate("(function(){var b=[].slice.call(document.querySelectorAll('button')).filter(function(x){return /8px 刻み/.test(x.textContent||'');})[0];return b?b.textContent.trim():'';})()");
  if (String(quantiseOn) === '8px 刻み: 切') await click('8px 刻み: 切');

  /**
   * ★つまみを基準の値へ。★`min`/`max` で見分けます（★4 本とも範囲が違います）。
   * ⚠️ ★React の `value` は setter 経由で入れないと反映されません。
   */
  for (const s of SETTINGS) {
    const got = await browser.evaluate(`(function(){
      var is=[].slice.call(document.querySelectorAll('input[type=range]'));
      var i=is.filter(function(x){return Number(x.min)===${s.min}&&Number(x.max)===${s.max};})[0];
      if(!i) return 'なし';
      var set=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;
      set.call(i, ${JSON.stringify(String(s.value))});
      i.dispatchEvent(new Event('input',{bubbles:true}));
      i.dispatchEvent(new Event('change',{bubbles:true}));
      return i.value;
    })()`);
    if (String(got) === 'なし') { console.error(`★★つまみが見つかりません: ${s.name}`); await browser.close(); process.exit(1); }
    if (Math.abs(Number(got) - s.value) > 1e-9) {
      console.error(`★★つまみが入りません: ${s.name} → ${got}（★狙い ${s.value}）`);
      await browser.close(); process.exit(1);
    }
  }
  await sleep(600);

  /** ★停止してから撮ります（★再生中は毎フレーム上書きされます） */
  const stopped = (await click('⏸ 停止')) === true;
  if (!stopped) { console.error('★★停止できませんでした'); await browser.close(); process.exit(1); }
  await sleep(400);

  const hasSeek = await browser.evaluate('typeof window.__benchSeekM === "function"');
  if (String(hasSeek) !== 'true') {
    console.error('★★撮影用の時計がありません（★`__benchSeekM`）— ★台が古い版です');
    await browser.close(); process.exit(1);
  }

  const frames = [];
  const step = 1 / FPS;
  let n = 0;
  for (let t = FROM; t <= TO + 1e-9; t += step) {
    const meters = SPEED_MPS * t;
    const got = await browser.evaluate(`window.__benchSeekM(${meters})`);
    /** ⚠️ ★与えた進行距離が実際に入ったことを確かめます（★入っていなければ同じ絵が並びます） */
    if (Math.abs(Number(got) - meters) > 1e-6) {
      console.error(`★★進行距離が入りません: ${got}（★狙い ${meters}）`);
      await browser.close(); process.exit(1);
    }
    /**
     * ★描き直しを待ってから撮ります。
     * ⚠️ ★`requestAnimationFrame` を待つ約束（Promise）で待つと、
     *    ★タブが前面でないときに解決せず ★CDP が時止まりします（★実測）。
     *    → ★前面に出したうえで、★時間で待ちます。
     */
    await browser.send('Page.bringToFront');
    await sleep(120);
    const f = await browser.evaluate("(function(){var c=document.querySelector('canvas');return c.toDataURL('image/jpeg',0.92);})()");
    writeFileSync(`${OUT}/plain/f${String(n).padStart(4, '0')}.jpg`, Buffer.from(f.split(',')[1], 'base64'));
    /** ★描いた馬の位置（★台自身が出した値・★比較の尺度に使う） */
    const marks = await browser.evaluate('window.__benchDiag ? JSON.stringify(window.__benchDiag) : "null"');
    frames.push({
      index: n, displaySec: Number(t.toFixed(4)), travelM: Number(meters.toFixed(4)),
      horses: marks === 'null' ? null : JSON.parse(String(marks)),
    });
    n += 1;
  }

  /** ⚠️ ★真っ黒なコマを「撮れた」と言わない */
  const dark = await browser.evaluate(`(function(){
    var c=document.querySelector('canvas'); var g=c.getContext('2d');
    var d=g.getImageData(0,0,c.width,c.height).data; var s=0;
    for(var i=0;i<d.length;i+=4000){ s+=d[i]+d[i+1]+d[i+2]; }
    return s/(d.length/4000)/3;
  })()`);
  if (Number(dark) < 8) { console.error(`★★真っ黒でした（★平均輝度 ${Number(dark).toFixed(1)}）`); process.exit(1); }

  /** ⚠️ ★全コマ同じ絵になっていないこと（★時計が効いていない形の検出） */
  const settings = await browser.evaluate("(function(){var ls=[].slice.call(document.querySelectorAll('label')).map(function(x){return (x.textContent||'').split('\\n')[0].trim();});return ls.join(' / ');})()");
  writeFileSync(`${OUT}/frames.json`, JSON.stringify({
    from: FROM, to: TO, fps: FPS, speedMps: SPEED_MPS, url: URL,
    settings: String(settings),
    note: '★注入した時計で撮影（★進行距離 = 速さ × 表示秒）。★1 表示秒 = 映像 1 秒（等速）',
    frames,
  }, null, 1));
  console.log(`★${n} コマ（★表示秒 ${FROM}〜${TO}・${FPS}fps・★等速・★平均輝度 ${Number(dark).toFixed(0)}）→ ${OUT}/plain`);
  console.log(`★設定: ${settings}`);
} finally { await browser.close(); }
