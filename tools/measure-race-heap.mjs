/**
 * ★**レース画面が素材を組み終えたときの JS ヒープ**を測る（★2026-09-11）
 *
 * 【★なぜ要るか】
 *   ★台帳 A-11 / A-12: ★台本 v6 は ★**2 組しか描かない**ので、残り 2 組を読まないことにした
 *   （★実測 ★102MB → 76MB）。★台帳「side-v9 は本線に入れない」も ★**初期化 +31%** が理由でした。
 *   ★2026-09-11、★オーナー ②③④ のために ★高所斜め（`high-diag-v2`）を ★**3 カットで描く**ように
 *   ★しました。★つまり ★**組が 2 → 3 に戻ります**。
 *   → ★「たぶん +13MB」で済ませない。★**測ってから報告する。**
 *
 * 【★どう切り分けるか】
 *   ★`broadcastV2ScriptAssets` の実測で、★v6 と v5 が読む組の差は ★**`high-diag-v2` ちょうど 1 組**です
 *     ★v6 = diag-front-v2 / high-diag-v2 / side-v6 / winner-v1
 *     ★v5 = diag-front-v2 /                side-v6 / winner-v1
 *   → ★`?cinematography=v5` と既定を撮り比べれば、★差はほぼその 1 組ぶんです。
 * ⚠️ ★**ほぼ**です。★台本が違えばカメラも違うので、★差の全部が素材とは限りません。
 *    ★ここで出るのは ★**上限の目安**であって、★1 組の正味ではありません。
 *
 * ★実行: npx tsx tools/measure-race-heap.mjs
 *        npx tsx tools/measure-race-heap.mjs --url "http://localhost:3210/race?dev=1" --label 既定
 */
import { launch } from './lib/cdp.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : process.argv[i + 1]; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CASES = arg('url', null) !== null
  ? [{ label: String(arg('label', 'url')), url: String(arg('url')) }]
  : [
    { label: 'v6 既定（3 組）', url: 'http://localhost:3210/race?dev=1' },
    { label: 'v5 切り戻し（2 組）', url: 'http://localhost:3210/race?dev=1&cinematography=v5' },
  ];

for (const c of CASES) {
  const browser = await launch({ port: 9457, width: 1400, height: 950, timeoutMs: 20000 });
  try {
    await browser.send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 950, deviceScaleFactor: 1, mobile: false });
    await browser.goto(c.url, "!!document.querySelector('canvas')", { timeoutMs: 120000, settleMs: 4000 });
    /** ⚠️ ★**素材を組み終えるまで待つ**（★撮影用シークのつまみが出たら組み終わり・★他の道具と同じ判定） */
    let ready = false;
    for (let i = 0; i < 90; i += 1) {
      const n = await browser.evaluate("[].slice.call(document.querySelectorAll('input[type=range]')).filter(function(x){return Number(x.max)>30;}).length");
      if (Number(n) > 0) { ready = true; break; }
      await sleep(2000);
    }
    if (!ready) { console.log(`${c.label.padEnd(20)} ★組み終わりませんでした`); continue; }
    await sleep(6000);
    /** ★ごみを集めてから読む（★集めないと直前の一時領域まで数えます） */
    await browser.send('HeapProfiler.collectGarbage').catch(() => {});
    await sleep(1500);
    const raw = await browser.evaluate(`(function(){
      var m = performance.memory;
      var cs = [].slice.call(document.querySelectorAll('canvas'));
      return JSON.stringify({
        heapMB: m ? m.usedJSHeapSize/1048576 : null,
        canvases: cs.length,
        canvasPx: cs.reduce(function(a,c){return a + c.width*c.height;},0),
      });
    })()`);
    const v = JSON.parse(String(raw));
    console.log(`${c.label.padEnd(20)} ヒープ ${v.heapMB === null ? '取得不可' : `${v.heapMB.toFixed(1)} MB`}`
      + `  画布 ${v.canvases} 枚 / ${(v.canvasPx / 1e6).toFixed(1)} Mpx`);
  } finally {
    await browser.close();
  }
}
