/**
 * ★**レースの画布の「裏の画素 ÷ 画面の物理画素」を測る**（★読むだけ・2026-09-28・正典 D-058b）
 *
 * ★D-058b の合格条件（★レビュー側）: ★PC・★dpr 1.5・★携帯 390px で ★比が 1.000（★ブラウザに縮め直させない）。
 * ★3 つの画面を真似て `/race` を開き、★画布が描き始めたら ★`canvas.width` と ★画面上の箱 × devicePixelRatio を読みます。
 *
 * 使い方:
 *   AUDIT_BASE=https://star-two-chi.vercel.app npx tsx tools/measure-race-canvas-ratio.mjs
 *   npx tsx tools/measure-race-canvas-ratio.mjs            （★next start ・ただし手元は素材が無く 描き始めないことがある）
 *   AUDIT_BASE=… npx tsx tools/measure-race-canvas-ratio.mjs --frames              （★コマの間隔も・5 秒）
 *   AUDIT_BASE=… npx tsx tools/measure-race-canvas-ratio.mjs --query dpr=2 --frames （★これまでの携帯と見比べ）
 * ⚠️ ★素材（約 20MB）が落ちてくるまで待つので ★1 画面 数十秒かかります。
 */
import { launch } from './lib/cdp.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : process.argv[i + 1]; };
const BASE = process.env.AUDIT_BASE ?? 'http://localhost:3210';
/** ★`--query dpr=2` … ★これまでの携帯（★裏 2560）と見比べる（★戻し口） */
const QUERY = String(arg('query', ''));
/** ★`--frames` … ★5 秒 ★コマの間隔を測る（★コマ落ちの測り方・超標本化の口を開ける前後で並べる） */
const FRAMES = process.argv.includes('--frames');
const FRAME_STATS = `new Promise((done) => { const t = []; let last = performance.now(); const end = last + 5000;
  const tick = (now) => { t.push(now - last); last = now; if (now < end) requestAnimationFrame(tick); else {
    t.sort((a, b) => a - b); const p = (q) => t[Math.min(t.length - 1, Math.floor(t.length * q))];
    done(JSON.stringify({ n: t.length, p50: p(0.5), p95: p(0.95), over33: t.filter((x) => x > 33.4).length })); } };
  requestAnimationFrame(tick); })`;
const CASES = [
  { name: 'PC（dpr 1）', width: 1400, height: 900, dpr: 1, mobile: false },
  { name: 'オーナーの画面（dpr 1.5）', width: 1400, height: 900, dpr: 1.5, mobile: false },
  { name: '携帯 390px（dpr 3）', width: 390, height: 844, dpr: 3, mobile: true },
];
/** ★画布が「描き始めた」＝ ★裏の画素が 1280×720 の既定から動いた か ★黒以外の画素がある */
const READ = `(() => {
  const c = document.querySelector('canvas');
  if (!c) return JSON.stringify({ ok: false, why: 'no canvas' });
  const r = c.getBoundingClientRect();
  const shown = Math.max(r.width, r.height) * window.devicePixelRatio;
  return JSON.stringify({ ok: true, backing: c.width, shownCss: Math.max(r.width, r.height), shownDevice: shown, dpr: window.devicePixelRatio });
})()`;
const DRAWN = `(() => { const c = document.querySelector('canvas'); if (!c) return false;
  const x = c.getContext('2d'); const d = x.getImageData(0, 0, c.width, c.height).data;
  let n = 0; for (let i = 0; i < d.length; i += 4000) if (d[i] > 20) n++; return n > 50; })()`;

const b = await launch({ width: 1400, height: 900 });
try {
  for (const k of CASES) {
    await b.send('Emulation.setDeviceMetricsOverride', { width: k.width, height: k.height, deviceScaleFactor: k.dpr, mobile: k.mobile });
    await b.goto('about:blank', 'true', { timeoutMs: 20000, settleMs: 100 });
    const drawn = await b.goto(`${BASE}/race?badge=0&auditSec=20&seed=42${QUERY === '' ? '' : `&${QUERY}`}`, DRAWN, { timeoutMs: 180000, settleMs: 1500 });
    const m = JSON.parse(await b.evaluate(READ));
    if (!m.ok) { console.log(`${k.name}: ★${m.why}`); continue; }
    const ratio = m.backing / m.shownDevice;
    console.log(`${k.name.padEnd(22)} ${drawn ? '' : '★描き始めていない  '}裏 ${m.backing}px ／ 画面 ${m.shownCss.toFixed(1)} CSS px × dpr ${m.dpr} ＝ ${m.shownDevice.toFixed(1)} 物理 px ／ ★比 ${ratio.toFixed(3)}`);
    if (FRAMES) {
      const fr = JSON.parse(await b.evaluate(FRAME_STATS));
      console.log(`${' '.repeat(24)}コマ ${fr.n} 枚／5 秒・間隔 p50 ${fr.p50.toFixed(1)}ms・p95 ${fr.p95.toFixed(1)}ms・33ms 超 ${fr.over33} 回`);
    }
  }
} finally {
  await b.close();
}
