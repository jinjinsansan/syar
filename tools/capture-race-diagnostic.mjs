/**
 * ★**診断用のレース映像を撮る**（★2026-09-09・レビュー側の指示）
 *
 * 【★なぜ要るか】
 *   ★オーナー評「★コーナーが不自然」。★原因は未確定です。
 *   ⚠️ ★開発側が最初に出した映像は ★**等速ではありませんでした**:
 *      ★80ms 間隔で撮ったつもりが、★1 コマの取得に時間がかかり、
 *      ★実際の経過は約 30 秒。★それを 20fps で 6.5 秒に書き出したので、
 *      ★**倍率が不明で、しかも一定でない**映像になっていました。
 *   → ★**各コマの実時刻（レースの表示秒）を記録**し、★等速で書き出します。
 *
 * 【★何を出すか】
 *   ★① 矢印なしの映像
 *   ★② ★**各馬の足元に、走路の接線方向の矢印**を重ねた映像
 *      ★馬番・使用素材・カメラに対する角度も出します
 *   ★③ 各コマの表示秒を書いた `frames.json`
 *
 * ★実行: npx tsx tools/capture-race-diagnostic.mjs --from 12 --to 22 [--fps 10]
 */
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { launch } from './lib/cdp.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : process.argv[i + 1]; };
const FROM = Number(arg('from', 12));
const TO = Number(arg('to', 22));
/** ★出す映像のコマ数／秒。★レースの 1 秒を映像の 1 秒にします（★等速） */
const FPS = Number(arg('fps', 10));
const OUT = String(arg('out', 'tmp/race-diagnostic'));

rmSync(OUT, { recursive: true, force: true });
mkdirSync(`${OUT}/plain`, { recursive: true });

const browser = await launch({ port: 9451, width: 1400, height: 950, timeoutMs: 20000 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const click = (t) => browser.evaluate(`(function(){var b=[].slice.call(document.querySelectorAll('button')).filter(function(x){return x.textContent.indexOf(${JSON.stringify(t)})>=0;});if(b[0]){b[0].click();return true;}return false;})()`);
try {
  await browser.send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 950, deviceScaleFactor: 1, mobile: false });
  await browser.goto('http://localhost:3210/race?dev=1', "!!document.querySelector('canvas')", { timeoutMs: 120000, settleMs: 4000 });
  await browser.send('Page.bringToFront');
  for (let i = 0; i < 30; i += 1) {
    await sleep(4000);
    const t = await browser.evaluate("[].slice.call(document.querySelectorAll('button')).map(function(x){return x.textContent.trim();}).slice(0,1).join('')");
    if (String(t).indexOf('読み込み中') < 0) break;
  }
  /**
   * ⚠️ ★**「観る」を押さないとレース画面が始まりません**（★2026-09-09）。
   *    ★開発側は「開発用の操作」だけ出して撮り、★101 コマ全部同じ絵になりました。
   */
  /**
   * ⚠️ ★「開発用の操作を出す」は ★**ボタンではなくリンク**です。
   *    ★開発側は button として押そうとして失敗し続けました（★戻り値 false）。
   * → ★`?dev=1` を付けて開きます。
   */
  await click('観る'); await sleep(2500);
  await click('停止'); await sleep(500);
  /**
   * ★**シークで 1 コマずつ出します**（★再生しながら撮ると等速になりません）。
   *   ★`seekPos` のつまみに値を入れて、★その表示秒の絵を撮ります。
   */
  /**
   * ⚠️ ★**シークのつまみは、演出を開始しないと出ません**（★2026-09-09）。
   *    ★開発側は最初「いちばん後ろのつまみ」を掴み、★**馬の大きさのつまみ**を
   *    ★動かしていました（★12〜22 は範囲外なので何も起きず、★101 コマ全部同じ絵）。
   *    ★出す前に測って気づきました。
   * → ★**範囲で見分けます**（★シークは max がレースの長さ ＝ 数十秒）。
   */
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
  const frames = [];
  const step = 1 / FPS;
  let n = 0;
  for (let t = FROM; t <= TO + 1e-9; t += step) {
    const got = await seekTo(t.toFixed(2));
    await sleep(260);
    await browser.send('Page.bringToFront');
    const f = await browser.evaluate("(function(){var c=document.querySelector('canvas');return c.toDataURL('image/jpeg',0.92);})()");
    writeFileSync(`${OUT}/plain/f${String(n).padStart(4, '0')}.jpg`, Buffer.from(f.split(',')[1], 'base64'));
    /**
     * ★**各馬の「本来向くべき向き」を、画面座標で取り出します**（★レビュー側の指示②）。
     *   ★足元（走路上の点）と、★そこから接線方向に 3m 進んだ点を、★同じカメラで投影します。
     *   ★2 点を結べば ★**走路の接線方向の矢印**になります。
     * ⚠️ ★描画には一切影響しません。★読むだけです。
     */
    const marks = await browser.evaluate("window.__raceDiag ? JSON.stringify(window.__raceDiag) : 'null'");
    frames.push({
      index: n, displaySec: Number(t.toFixed(2)), slider: String(got),
      marks: marks === 'null' ? null : JSON.parse(String(marks)),
    });
    n += 1;
  }
  writeFileSync(`${OUT}/frames.json`, JSON.stringify({
    from: FROM, to: TO, fps: FPS,
    note: '★レースの表示秒 1 秒 = 映像 1 秒（等速）。★書き出し倍率 1.0',
    frames,
  }, null, 1));
  console.log(`★${n} コマ（★表示秒 ${FROM}〜${TO}・${FPS}fps・★等速）→ ${OUT}/plain`);
} finally { await browser.close(); }
