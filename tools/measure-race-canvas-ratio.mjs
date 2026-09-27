/**
 * ★**レースの画布の「裏の画素 ÷ 画面の物理画素」を測る**（★読むだけ・2026-09-28・正典 D-058b）
 *
 * ★D-058b の合格条件（★レビュー側）: ★PC・★dpr 1.5・★携帯 390px で ★比が 1.000（★ブラウザに縮め直させない）。
 * ★3 つの画面を真似て `/race` を開き、★画布が描き始めたら ★`canvas.width` と ★画面上の箱 × devicePixelRatio を読みます。
 *
 * 使い方:
 *   AUDIT_BASE=https://star-two-chi.vercel.app npx tsx tools/measure-race-canvas-ratio.mjs
 *   npx tsx tools/measure-race-canvas-ratio.mjs            （★next start ・ただし手元は素材が無く 描き始めないことがある）
 * ⚠️ ★素材（約 20MB）が落ちてくるまで待つので ★1 画面 数十秒かかります。
 */
import { launch } from './lib/cdp.mjs';

const BASE = process.env.AUDIT_BASE ?? 'http://localhost:3210';
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
    const drawn = await b.goto(`${BASE}/race?badge=0&auditSec=20&seed=42`, DRAWN, { timeoutMs: 180000, settleMs: 1500 });
    const m = JSON.parse(await b.evaluate(READ));
    if (!m.ok) { console.log(`${k.name}: ★${m.why}`); continue; }
    const ratio = m.backing / m.shownDevice;
    console.log(`${k.name.padEnd(22)} ${drawn ? '' : '★描き始めていない  '}裏 ${m.backing}px ／ 画面 ${m.shownCss.toFixed(1)} CSS px × dpr ${m.dpr} ＝ ${m.shownDevice.toFixed(1)} 物理 px ／ ★比 ${ratio.toFixed(3)}`);
  }
} finally {
  await b.close();
}
