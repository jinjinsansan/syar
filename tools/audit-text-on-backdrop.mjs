/**
 * ★**芝の上にじかに置かれた文字**を ★実ブラウザで洗い出す（★読むだけ・2026-09-28）
 *
 * 【★なぜ要るか】
 *   ★デザイナーの決まり（★R-18 回答 🟡 #7）: ★「本文は必ず濃紺パネルか紙パネルの上に置く。★芝の上に文字をじかに置かない」。
 *   ★暗幕を濃くした後でも ★芝の上部（★木立・柵の明るい所）は ★本文 4.5:1 に届かない所がある（★計算で 2.82〜4.39:1）。
 *   ★どこに ★パネル無しの文字が在るかを ★1 件ずつ出します。★直すのは ★パネルを当てるだけ（★既存の部品）。
 *
 * 【★見分け方】
 *   ★馬物語の根（`[data-theme="uma"]`・最上位）の中で、★芝（`Backdrop` ＝ 根の最初の子の aria-hidden）の外にある ★文字の葉を集め、
 *   ★文字から根までの先祖に ★地の色（透明でない background-color）か ★背景画像を持つ要素が 1 つでも在れば ★「パネルの上」、★無ければ ★「芝の上にじか」。
 *   ★じかの文字は ★縦の位置（★根の高さに対する %）から ★芝のどの層の上かを出し、★その層の明るい所（輝度 95%）に暗幕を重ねた色と ★文字色で ★明度差を出します。
 *   ★基準: ★本文 4.5:1 ／ ★大きい文字（★18.66px 以上の太字か 24px 以上）3:1（★レビュー側の線）。
 *
 * 使い方（★開発サーバーか next start が要ります）:
 *   npx tsx tools/audit-text-on-backdrop.mjs --widths 390,1280
 *   AUDIT_BASE=https://star-two-chi.vercel.app npx tsx tools/audit-text-on-backdrop.mjs
 *
 * ⚠️ ★ログインの要る画面は ★ログインしていない姿で測ります。
 * ★層の位置と暗幕の段は ★`apps/web/src/components/uma/backdrop-plate.ts`（★Backdrop と同じ 1 か所）から読みます。
 */
import path from 'node:path';
import sharp from 'sharp';
import { launch } from './lib/cdp.mjs';
import { PLATE_LAYERS, SCREEN_OVERLAY_STOPS } from '../apps/web/src/components/uma/backdrop-plate.ts';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : process.argv[i + 1]; };
const BASE = process.env.AUDIT_BASE ?? 'http://localhost:3210';
const WIDTHS = String(arg('widths', '390')).split(',').map((s) => Number(s.trim()));
const PAGES = [
  '/stable/breed', '/stable/roles', '/stable/foal', '/stable/name',
  '/home', '/howto', '/earn', '/exchange', '/watch-race', '/train', '/mypage', '/vote', '/entry', '/records',
  '/odds/demo?demo=1', '/login', '/signup', '/setup', '/forgot-password', '/reset-password',
];

/** ★芝の 9 層と暗幕の段は ★Backdrop と同じ 1 か所から読む（★写さない・レビュー側の条件） */
const LAYERS = PLATE_LAYERS.map((L) => [L.src, L.y, L.h]);
const OVERLAY = SCREEN_OVERLAY_STOPS.map((st) => [st.pos, [...st.rgb], st.a]);
const ART = path.resolve('apps/web/public/art/parallax/backstretch-side-v1');

const lin = (c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const over = (fg, a, bg) => fg.map((c, k) => c * a + bg[k] * (1 - a));
function overlayAt(pos) {
  for (let i = 0; i < OVERLAY.length - 1; i += 1) {
    const [p0, c0, a0] = OVERLAY[i]; const [p1, c1, a1] = OVERLAY[i + 1];
    if (pos >= p0 && pos <= p1) {
      const t = (pos - p0) / (p1 - p0);
      const a = a0 + (a1 - a0) * t;
      const pm = c0.map((c, k) => (c * a0) + ((c1[k] * a1) - (c * a0)) * t);
      return { rgb: pm.map((v) => (a === 0 ? 0 : v / a)), a };
    }
  }
  return { rgb: OVERLAY.at(-1)[1], a: OVERLAY.at(-1)[2] };
}

/** ★各層の明るい所（★不透明な画素の輝度 95%） */
const BRIGHT = new Map();
for (const [src] of LAYERS) {
  const { data } = await sharp(path.join(ART, `${src}.webp`)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const px = [];
  for (let i = 0; i < data.length; i += 4 * 7) if (data[i + 3] > 200) px.push([data[i], data[i + 1], data[i + 2]]);
  px.sort((p, q) => lum(p) - lum(q));
  BRIGHT.set(src, px[Math.floor(px.length * 0.95)] ?? [255, 255, 255]);
}
const layerAt = (pos) => (LAYERS.find(([, y, h]) => pos >= y && pos < y + h) ?? LAYERS.at(-1))[0];

/** ★ページの中で ★じかの文字を集める（★ここはページへ送る文字列。★註記にバッククォートを書かない） */
const COLLECT = `(() => {
  const root = [...document.querySelectorAll('[data-theme="uma"]')].find((el) => !el.parentElement || !el.parentElement.closest('[data-theme="uma"]'));
  if (!root) return JSON.stringify({ root: false });
  const backdrop = root.firstElementChild && root.firstElementChild.getAttribute('aria-hidden') !== null ? root.firstElementChild : null;
  if (!backdrop) return JSON.stringify({ root: true, backdrop: false });
  const rr = root.getBoundingClientRect();
  const out = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = (n.textContent || '').trim();
    if (text === '') continue;
    const el = n.parentElement;
    if (!el || backdrop.contains(el)) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    let panel = null;
    for (let a = el; a && a !== root; a = a.parentElement) {
      const s = getComputedStyle(a);
      const bg = s.backgroundColor;
      if ((bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') || (s.backgroundImage && s.backgroundImage !== 'none')) { panel = a.tagName.toLowerCase(); break; }
    }
    const m = cs.color.match(/[0-9.]+/g) || ['0', '0', '0'];
    out.push({
      text: text.slice(0, 24), tag: el.tagName.toLowerCase(), panel,
      y: ((r.top + r.height / 2 - rr.top) / rr.height) * 100,
      color: [Number(m[0]), Number(m[1]), Number(m[2])], size: parseFloat(cs.fontSize), weight: Number(cs.fontWeight) || 400,
    });
  }
  return JSON.stringify({ root: true, backdrop: true, items: out });
})()`;

const rows = [];
const browser = await launch({ width: WIDTHS[0], height: 844 });
try {
  for (const w of WIDTHS) {
    await browser.send('Emulation.setDeviceMetricsOverride', { width: w, height: 844, deviceScaleFactor: 2, mobile: w < 800 });
    for (const p of PAGES) {
      await browser.goto('about:blank', 'true', { timeoutMs: 20000, settleMs: 100 });
      const ok = await browser.goto(`${BASE}${p}`, "document.readyState==='complete'", { timeoutMs: 60000, settleMs: 3500 });
      if (!ok) { rows.push({ p, w, note: '★読み込めない' }); continue; }
      const res = JSON.parse(await browser.evaluate(COLLECT));
      if (!res.root) { rows.push({ p, w, note: '★馬物語の根が無い' }); continue; }
      if (!res.backdrop) { rows.push({ p, w, note: '★芝（Backdrop）が無い' }); continue; }
      for (const it of res.items) {
        if (it.panel !== null) continue;
        const pos = Math.max(0, Math.min(100, it.y));
        const layer = layerAt(pos);
        const o = overlayAt(pos);
        const bg = over(o.rgb, o.a, BRIGHT.get(layer));
        const cr = ratio(it.color, bg);
        const large = it.size >= 24 || (it.size >= 18.66 && it.weight >= 700);
        const need = large ? 3 : 4.5;
        rows.push({ p, w, text: it.text, tag: it.tag, y: pos.toFixed(0), layer, size: it.size, weight: it.weight, cr: cr.toFixed(2), need, pass: cr >= need });
      }
    }
  }
} finally {
  await browser.close();
}

console.log('\n=== ★芝の上にじかに置かれた文字（★パネル無し）===');
console.log('  ★判定の背景は ★その層の明るい所（輝度 95%）に暗幕を重ねた色（★いちばん読みにくい所）\n');
for (const r of rows) {
  if (r.note) { console.log(`  ${r.p.padEnd(20)} ${String(r.w).padStart(4)}px  ${r.note}`); continue; }
  console.log(`  ${r.pass ? '  ' : '🔴'} ${r.p.padEnd(20)} ${String(r.w).padStart(4)}px  y ${String(r.y).padStart(3)}%  ${r.layer.padEnd(10)}  ${String(r.size).padStart(4)}px/${r.weight}  ${r.cr}:1（要 ${r.need}）  <${r.tag}>「${r.text}」`);
}
const direct = rows.filter((r) => !r.note);
console.log(`\n★じかの文字: ★${direct.length} 件 ／ ★基準に届かない: ★${direct.filter((r) => !r.pass).length} 件`);
console.log('⚠️ ★合否で止めません（★直すかはレビュー側・デザイナーが決める）。★この道具は測るだけです。');
