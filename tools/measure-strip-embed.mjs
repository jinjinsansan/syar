/**
 * ★**帯（小窓）で流す本編の重さと滑らかさを測る**（★読むだけ・★2026-09-28・レビュー側の条件 2〜4・6）
 *
 *   npx tsx tools/measure-strip-embed.mjs                   … 本番・本編（見本のレース）の追加転送と コマ間隔・止める確認
 *   npx tsx tools/measure-strip-embed.mjs --simple /howto   … ＋ 簡易版の走行（★録画の窓を最大 8 分待つ）
 *   npx tsx tools/measure-strip-embed.mjs --base http://localhost:3210
 *
 * 【★測り方】 ★390px・dpr 3・★キャッシュ無効（★冷えた初回）。★帯と同じ置き方の iframe（`/race?embed=strip`・362×204）を
 *   ★観戦の面（`/watch-race`）に差し込み、★`playing` までと ★その後 20 秒の `encodedDataLength` を足す。
 *   ⚠️ ★実レース（`?race=<id>`）は ★ログインが要るので ★見本のレースで測る（★通る道は同じ・素材の顔ぶれは近い）。
 * 【★目安】 ★playing までの追加転送 ★5MB 以下（★技術方針「初回 5MB 以下」・レビュー側の決定）。★超えたら `/home` は簡易版を既定にする。
 * 🔴 ★**ヘッドレスは GPU が無い**ので ★本編（子）のコマ間隔は ★実機の値ではありません（★出力にも毎回書きます）。★実機の滑らかさはオーナーの目で。
 * ⚠️ ★画面に窓は開きません（★`lib/cdp.mjs` の既定はヘッドレス）。★ブラウザは 1 つだけ・★必ず閉じる。
 */
import { launch } from './lib/cdp.mjs';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i < 0 ? fallback : process.argv[i + 1];
};
const BASE = arg('--base', 'https://star-two-chi.vercel.app');
const SIMPLE = arg('--simple', null);
const BUDGET_MB = 5;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const FRAMES = (win) => `new Promise((done) => { const w = ${win}; const t = []; let last = w.performance.now(); const end = last + 5000;
  const tick = (now) => { t.push(now - last); last = now; if (now < end) w.requestAnimationFrame(tick); else {
    t.sort((a, b) => a - b); const p = (q) => t[Math.min(t.length - 1, Math.floor(t.length * q))];
    done(JSON.stringify({ n: t.length, p50: +p(0.5).toFixed(1), p95: +p(0.95).toFixed(1), over33: t.filter((x) => x > 33.4).length })); } };
  w.requestAnimationFrame(tick); })`;
const kindOf = (u) => /\.js(\?|$)/.test(u) ? 'JS' : /\.css(\?|$)/.test(u) ? 'CSS'
  : /\/art\//.test(u) ? `絵 ${u.split('/art/')[1].split('?')[0].replace(/-pose\d+.*$|-frame\d+.*$/, '')}`
    : /\.(mp3|ogg|wav|m4a)/.test(u) ? '音' : /supabase/.test(u) ? 'DB' : 'その他';

const b = await launch({ width: 390, height: 844, port: 9621 });
const urls = new Map();
const log = [];
let failed = false;
try {
  await b.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 3, mobile: true });
  await b.send('Network.enable', {});
  await b.send('Network.setCacheDisabled', { cacheDisabled: true });
  b.on('Network.responseReceived', (p) => { urls.set(p.requestId, p.response.url); });
  b.on('Network.loadingFinished', (p) => { log.push({ t: Date.now(), url: urls.get(p.requestId) ?? '', n: p.encodedDataLength ?? 0 }); });
  const sum = (a) => a.reduce((s, x) => s + x.n, 0);

  await b.goto(`${BASE}/watch-race`, 'document.readyState === "complete"', { timeoutMs: 30000, settleMs: 3000 });
  const t0 = Date.now();
  await b.evaluate(`(() => { window.__m = []; window.addEventListener('message', (e) => { if (e.data && e.data.source === 'star-race') window.__m.push(e.data.type); });
    const f = document.createElement('iframe'); f.id = '__f'; f.src = '/race?embed=strip';
    f.setAttribute('style', 'position:absolute;left:0;top:0;width:362px;height:204px;border:0'); document.body.appendChild(f); return 1; })()`);
  let playing = false;
  for (let i = 0; i < 120 && !playing; i++) { await sleep(1000); playing = (await b.evaluate('JSON.stringify(window.__m)')).includes('playing'); }
  const tPlay = Date.now();
  await sleep(20000);
  const before = log.filter((x) => x.t >= t0 && x.t <= tPlay);
  const after = log.filter((x) => x.t > tPlay);
  const mb = sum(before) / 1048576;
  console.log('# 帯の本編（★見本のレース・390px dpr3・キャッシュ無効）');
  console.log(`  playing まで ${playing ? `${((tPlay - t0) / 1000).toFixed(1)} 秒` : '★来ない'}・追加転送 ★${mb.toFixed(2)} MB（${before.length} 件）・その後 20 秒 ${(sum(after) / 1048576).toFixed(2)} MB`);
  const byKind = new Map();
  for (const x of before) byKind.set(kindOf(x.url), (byKind.get(kindOf(x.url)) ?? 0) + x.n);
  for (const [k, n] of [...byKind].sort((a, c) => c[1] - a[1]).slice(0, 10)) console.log(`    ${k.padEnd(44)} ${(n / 1048576).toFixed(2)} MB`);
  console.log(`  ★目安 ${BUDGET_MB} MB: ${mb <= BUDGET_MB ? '✅ 以下' : '🔴 超えている（★/home は簡易版を既定に）'}`);
  if (!playing || mb > BUDGET_MB) failed = true;
  console.log(`  親（帯の画面）のコマ間隔 ${await b.evaluate(FRAMES('window'))}`);
  console.log(`  子（本編）のコマ間隔 ${await b.evaluate(FRAMES("document.getElementById('__f').contentWindow"))}`);
  console.log('  ⚠️ ★ヘッドレスは GPU が無い — ★子（本編）のコマ間隔は 実機の値ではありません（★実機の滑らかさはオーナーの目で）');

  const HASH = `(() => { const c = document.getElementById('__f').contentDocument.querySelector('canvas'); if (!c) return 'no-canvas';
    const x = c.getContext('2d'); const d = x.getImageData(0, 0, c.width, c.height).data; let h = 0; for (let i = 0; i < d.length; i += 997) h = (h * 31 + d[i]) >>> 0; return String(h); })()`;
  const moving = async () => { const a = await b.evaluate(HASH); await sleep(800); return a !== await b.evaluate(HASH); };
  const m0 = await moving();
  await b.evaluate(`document.getElementById('__f').contentWindow.postMessage({ source: 'star-strip', type: 'pause' }, location.origin)`);
  await sleep(600);
  const m1 = await moving();
  await b.evaluate(`document.getElementById('__f').contentWindow.postMessage({ source: 'star-strip', type: 'resume' }, location.origin)`);
  await sleep(600);
  const m2 = await moving();
  const pauseOk = m0 && !m1 && m2;
  console.log(`  親から止める: ${m0 ? '動く' : '★止まっている'} → pause ${m1 ? '★動いている' : '止まった'} → resume ${m2 ? '動く' : '★止まったまま'} ${pauseOk ? '✅' : '🔴'}`);
  if (!pauseOk) failed = true;

  if (SIMPLE !== null) {
    await b.goto('about:blank', 'true', { timeoutMs: 10000, settleMs: 100 });
    await b.goto(`${BASE}${SIMPLE}`, 'document.readyState === "complete"', { timeoutMs: 30000, settleMs: 3000 });
    let run = false;
    const until = Date.now() + 8 * 60000;
    while (!run && Date.now() < until) { await sleep(2000); run = await b.evaluate('!!document.querySelector(".u-race-run")'); }
    console.log(`# 簡易版の走行（${SIMPLE}）`);
    if (!run) { console.log('  ★8 分で録画の窓が来なかった'); failed = true; } else {
      const c0 = Date.now();
      await sleep(8000);
      const add = log.filter((x) => x.t >= c0 - 3000);
      console.log(`  追加転送 ${(sum(add) / 1024).toFixed(0)} KB（${add.length} 件）・iframe ${await b.evaluate('document.querySelectorAll("iframe").length')} 個`);
      console.log(`  コマ間隔 ${await b.evaluate(FRAMES('window'))}`);
    }
  }
} finally {
  await b.close();
}
console.log('⚠️ ★読むだけ（★DB にも本番にも書きません）');
process.exit(failed ? 1 : 0);
