/**
 * ★**育成の歩き（スプライト表）が、★コマの境目で止まっているかを実ブラウザで測る**（★2026-09-24）
 *
 * 【★なぜ要るか】
 *   ★`/train` の歩きは ★**8 コマを横に並べた 1 枚**を `background-position` で送ります。
 *   ★最初 `animation: u-walk .8s steps(8) infinite` と書きました。★目には歩いて見えます。
 *   ★しかし ★**8 コマ中 7 コマで 2 コマが半分ずつ映って**いました。
 *
 *   ★`background-position-x` は百分率だと「★はみ出し量に対する割合」なので、
 *   ★N コマの境目は ★**k/(N-1)**。★`steps(N)`（既定 `jump-end`）が止まるのは ★**k/N** です。
 *   → ★`steps(N, jump-none)` が ★**両端を含む N 点**（0/(N-1) … (N-1)/(N-1)）で止まり、一致します。
 *
 * 【★測り方】
 *   ★dev サーバーと ★**同じ生成元**でスプライトを 1 枚置き、★止めた姿を撮って、
 *   ★書き出した個別コマ（`horse-walk-NN.png`）と ★画素で突き合わせます（★平均差 0〜255）。
 *   🔴 ★**対照を必ず出します** — ★k/N の位置でも測り、★大きく出ることを見せます。
 *      ★対照が無いと、★小さい差が「★測り方が緩いから」なのか「★合っているから」なのか言えません。
 *
 * ★実測（2026-09-24・`/train` の素材）:
 *   ★k/(N-1) の位置 … 1.01〜1.04（★webp の非可逆ぶん）
 *   ★k/N の位置     … 1.01 / 25.75 / 32.44 / 33.94 / 35.26 / 33.51 / 31.74 / 24.94
 *
 * ⚠️ ★**dev サーバーが要ります**（★既定 `http://localhost:3211`）。★DB には触れません。
 * ⚠️ ★ブラウザは `headless` で開きます（★人の画面に窓を開かない）。
 *
 * ★実行: node tools/measure-walk-sprite-steps.mjs [<dev の URL>]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { launch } from './lib/cdp.mjs';

const BASE = process.argv[2] ?? 'http://localhost:3211';
const ART = 'apps/web/public/art/uma';
const OUT = 'out/walk-steps';
const nn = (i) => String(i + 1).padStart(2, '0');

/** ★コマの寸法とコマ数は ★**素材から**読みます（★ここに書き写さない） */
const frame = await sharp(`${ART}/horse-walk-01.png`).metadata();
const sheet = await sharp(`${ART}/horse-walk-sheet.png`).metadata();
const FRAMES = sheet.width / frame.width;
if (!Number.isInteger(FRAMES)) {
  console.error(`★表 ${sheet.width}px ÷ コマ ${frame.width}px = ${FRAMES}（★割り切れません）`);
  process.exit(1);
}
const W = frame.width, H = frame.height;
console.log(`=== 歩きのスプライト表（${FRAMES} コマ・1 コマ ${W}x${H}） ===`);

/** ★個別コマを、画面と同じ地色に載せた生画素で持っておく */
const refs = [];
for (let i = 0; i < FRAMES; i += 1) {
  refs.push(await sharp(`${ART}/horse-walk-${nn(i)}.png`)
    .flatten({ background: { r: 9, g: 30, b: 55 } }).resize(W, H).removeAlpha().raw().toBuffer());
}
const meanAbs = (a, b) => {
  let sum = 0;
  for (let k = 0; k < a.length; k += 1) sum += Math.abs(a[k] - b[k]);
  return sum / a.length;
};

const browser = await launch({ port: 9359, headless: true, timeoutMs: 25000 });
mkdirSync(OUT, { recursive: true });
try {
  await browser.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  // ★`data:` の頁からは素材を読めません（★生成元が違う）。★dev の頁を土台に組み替えます
  await browser.goto(`${BASE}/design-check`, `document.readyState === 'complete'`, { timeoutMs: 120000, settleMs: 1200 });
  const got = await browser.evaluate(`(async () => {
    document.documentElement.style.cssText = 'margin:0';
    document.body.style.cssText = 'margin:0;background:#091e37;width:${W}px;height:${H}px;overflow:hidden';
    document.body.innerHTML = '<div id="h" style="width:${W}px;height:${H}px;background:url(/art/uma/horse-walk-sheet.webp) no-repeat 0 0 / ${FRAMES * 100}% 100%"></div>';
    const im = new Image(); im.src = '/art/uma/horse-walk-sheet.webp'; await im.decode();
    return im.naturalWidth + 'x' + im.naturalHeight;
  })()`);
  console.log(`  読み込んだ表: ${got}`);
  if (got !== `${sheet.width}x${sheet.height}`) {
    console.error(`🔴 ★dev が配っている表が ${got}、★手元は ${sheet.width}x${sheet.height}（★古い版を測っています）`);
    process.exitCode = 1;
  }

  const shotAt = async (percent) => {
    await browser.evaluate(`document.getElementById('h').style.backgroundPositionX = '${percent}%'`);
    await new Promise((r) => setTimeout(r, 120));
    const s = await browser.send('Page.captureScreenshot', { format: 'png' });
    return Buffer.from(s.data, 'base64');
  };

  console.log(`\n  ★jump-none の位置（k/${FRAMES - 1}）… 同じ番号の個別コマとの差`);
  let worst = 0;
  for (let i = 0; i < FRAMES; i += 1) {
    const png = await shotAt((100 / (FRAMES - 1)) * i);
    writeFileSync(`${OUT}/${nn(i)}.png`, png);
    const d = meanAbs(await sharp(png).removeAlpha().raw().toBuffer(), refs[i]);
    if (d > worst) worst = d;
    console.log(`   ${nn(i)}  ${d.toFixed(2)}`);
  }
  console.log(`  ★最大 ${worst.toFixed(2)}`);

  console.log(`\n  🔴 ★対照: 既定の steps(${FRAMES}) が止まる位置（k/${FRAMES}）… いちばん近い個別コマとの差`);
  let bestOfControl = Infinity;
  for (let i = 0; i < FRAMES; i += 1) {
    const a = await sharp(await shotAt((100 / FRAMES) * i)).removeAlpha().raw().toBuffer();
    const d = Math.min(...refs.map((b) => meanAbs(a, b)));
    if (i > 0 && d < bestOfControl) bestOfControl = d;
    console.log(`   ${nn(i)}  ${d.toFixed(2)}`);
  }
  console.log(`  ★（k=0 は両者で同じ位置なので除く）★対照の最小 ${bestOfControl.toFixed(2)}`);

  if (!(worst < bestOfControl)) {
    console.error('\n🔴 ★不合格: ★対照より小さくなっていません（★位置が合っていないか、★測り方が効いていない）');
    process.exitCode = 1;
  } else {
    console.log(`\n✅ ★合格: ★境目 ${worst.toFixed(2)} ＜ ★対照 ${bestOfControl.toFixed(2)}`);
  }
} finally { await browser.close(); }
