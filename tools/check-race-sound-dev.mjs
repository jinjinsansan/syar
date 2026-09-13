/**
 * ★**レースの音が、場面どおりの秒に鳴っているかを数える**（★2026-09-13・オーナー支給の音源）
 *
 * 【★何を確かめるか】
 *   ★ヘッドレスのブラウザでは ★**音は聴けません**。★ここで確かめるのは 3 つです:
 *     ★① 音源が読めているか（★404 になっていないか）
 *     ★② どの音が、★**いつ**鳴り始めたか
 *     ★③ 場面の順番どおりか（★ファンファーレ → ゲート → いななき → 走行 → 群衆）
 *   ★`AudioContext` を差し替えて、★鳴らし始めた時刻を記録します。
 *
 * ⚠️ ★**音の良し悪しは出しません。** ★聴いて判断するのはオーナーです（★R-16）。
 * ⚠️ ★DB に触れません。★開発サーバーを読むだけです。
 *
 * ★実行: node tools/check-race-sound-dev.mjs [--base http://localhost:3211] [--sec 45]
 */
import { launch } from './lib/cdp.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : process.argv[i + 1]; };
const BASE = arg('base', 'http://localhost:3211');
const WATCH_SEC = Number(arg('sec', 45));
const SEED = arg('seed', '42');

/**
 * ★ページの JS より先に差し込む（★`createRaceAudio` が掴むのはこの偽物）。
 * ★`fetch` も見張って、★どの音源が 404 だったかを残します。
 */
const STUB = `(() => {
  const started = [];
  const fetched = [];
  const t0 = performance.now();
  const now = () => (performance.now() - t0) / 1000;
  /**
   * ⚠️ ★**どの音源かは「大きさ」で見分けます。**
   *    ★decodeAudioData には中身しか渡って来ないので、★取りに行った時に
   *    ★url と長さを控えておき、★長さで引き当てます（★5 つとも長さが違います）。
   *    ★最初これをやらず、★5 件とも「音源不明」としか出せませんでした。
   */
  const byLength = new Map();
  const origFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = String(typeof input === 'string' ? input : input.url);
    const res = await origFetch(input, init);
    if (url.includes('/audio/')) {
      fetched.push({ url, status: res.status });
      try {
        const b = await res.clone().arrayBuffer();
        byLength.set(b.byteLength, url.split('/').pop());
      } catch { /* 控えられなければ「音源不明」のまま */ }
    }
    return res;
  };
  const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {},
    exponentialRampToValueAtTime() {}, cancelScheduledValues() {}, setTargetAtTime() {} });
  class FakeCtx {
    constructor() { this.state = 'running'; this.sampleRate = 48000;
      this.destination = { connect() {}, disconnect() {} }; }
    get currentTime() { return now(); }
    async resume() { this.state = 'running'; }
    async close() {}
    createGain() { return { connect() {}, disconnect() {}, gain: param() }; }
    createBufferSource() {
      const self = this;
      return {
        connect() {}, disconnect() {}, loop: false,
        set buffer(b) { this._id = b && b.__id; }, get buffer() { return { __id: this._id }; },
        start() { started.push({ id: this._id, at: now() }); },
        stop() {}, addEventListener() {},
      };
    }
    /** ⚠️ ★中身は要りません。★**どの音源か**だけ覚えます */
    decodeAudioData(bytes, ok) {
      const buf = { __id: byLength.get(bytes.byteLength), duration: 1, length: 1, sampleRate: 48000 };
      if (typeof ok === 'function') { ok(buf); return undefined; }
      return Promise.resolve(buf);
    }
  }
  Object.defineProperty(window, 'AudioContext', { value: FakeCtx, configurable: true });
  Object.defineProperty(window, 'webkitAudioContext', { value: FakeCtx, configurable: true });
  window.__raceSoundStarted = started;
  window.__raceSoundFetched = fetched;
})();`;

const READY = "(()=>{const c=document.querySelector('canvas');if(!c)return false;"
  + "const x=c.getContext('2d');const d=x.getImageData(0,0,c.width,c.height).data;"
  + "let n=0;for(let i=0;i<d.length;i+=4000)if(d[i]>20)n++;return n>50;})()";

const url = `${BASE}/race?sound=1&seed=${SEED}`;
const browser = await launch({ width: 1400, height: 900 });
try {
  await browser.send('Page.addScriptToEvaluateOnNewDocument', { source: STUB });
  console.log(`★開きます: ${url}`);
  if (!await browser.goto(url, "!!document.querySelector('canvas')", { timeoutMs: 180000, settleMs: 2000 })) {
    throw new Error(`★ページが用意できませんでした（★開発サーバーは動いていますか）: ${url}`);
  }
  /** ⚠️ ★**押せるようになるまで待つこと**（★「演出開始」は用意ができるまで `disabled`） */
  let started = false;
  for (let i = 0; i < 200 && !started; i += 1) {
    started = await browser.evaluate(`(() => {
      const b = [...document.querySelectorAll('button')].find((x) => x.textContent.includes('演出開始'));
      if (b === undefined || b.disabled) return false;
      b.click();
      return true;
    })()`) === true;
    if (!started) await new Promise((r) => { setTimeout(r, 500); });
  }
  if (!started) throw new Error('★「演出開始」が押せるようになりませんでした');
  const t0 = Date.now();
  for (let i = 0; i < 40; i += 1) {
    if (await browser.evaluate(READY) === true) break;
    await new Promise((r) => { setTimeout(r, 500); });
  }
  console.log(`★${WATCH_SEC} 秒ぶん見ます…`);
  await new Promise((r) => { setTimeout(r, WATCH_SEC * 1000); });

  const fetched = JSON.parse(await browser.evaluate('JSON.stringify(window.__raceSoundFetched ?? [])'));
  console.log('');
  console.log('★音源の読み込み');
  if (fetched.length === 0) console.log('  ⚠️ ★1 つも取りに行っていません');
  for (const f of fetched) {
    const name = f.url.split('/').pop();
    console.log(`  ${f.status === 200 ? '○' : '⚠️'} ${String(f.status)}  ${name}`);
  }

  const rows = JSON.parse(await browser.evaluate('JSON.stringify(window.__raceSoundStarted ?? [])'));
  console.log('');
  if (rows.length === 0) {
    console.log('⚠️ ★**1 度も鳴らしていません。** ★`?sound=1` が効いていないか、音源がありません。');
  } else {
    console.log(`★鳴らし始めた合図 ${rows.length} 件（★「演出開始」からの秒）`);
    console.log('');
    const base = (t0 - t0) / 1000;
    void base;
    for (const r of rows) {
      console.log(`  ${r.at.toFixed(2).padStart(6)} 秒  ${r.id ?? '（音源不明）'}`);
    }
  }
  console.log('');
  console.log('★この道具は音の合否を出しません（★聴いて判断するのはオーナー・R-16）。');
} finally {
  await browser.close();
}
