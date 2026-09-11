/**
 * ★**4 コーナーの「絵を回す／回さない」を並べて撮る**（★2026-09-11）
 *
 * 【★なぜこの道具が要るか】
 *   ★2026-09-11 に出した `corner-tilt-equal.mp4` は ★**判断できない比べ物**でした:
 *     ・★3 面あるのに、見比べ台の説明は「左＝回さない／右＝回した」の ★**2 面**
 *     ・★枠にラベルが焼かれていない
 *     ・⚠️ ★**2 面が写実タッチの俯瞰素材**（`high-diag-v4`）で描かれていた。
 *        ★その差し替えは ★**同じ日に取り下げ済み**（`3d954b4`）なのに、★動画だけが古いまま残った
 *     ・⚠️ ★**作ったコマンドがどこにも残っていない**（★セッションの中だけ）
 *   → ★比べ物は ★**道具として残す**。★変える 1 個以外は全部そろえる。
 *
 * 【★この道具が自分で確かめること】（★出す前に落ちる）
 *   ①★2 面の ★**カットが同じ**（★既定の `fourth-corner-far`）
 *   ②★2 面の ★**素材が同じで、デフォルメの `side-v6`**（★写実の `high-diag-v2` なら落とす）
 *   ③★秒がそろっている（★`撮影用シーク` の実値で照合）
 *   ④★`?tilt=track` が ★**実際に効いている**（★2 面が同一画像なら落とす）
 *
 * 【★使い方】
 *   node tools/capture-tilt-compare.mjs --scan                 … ★どの秒がどのカットか一覧
 *   node tools/capture-tilt-compare.mjs --from 47 --to 50      … ★その区間を撮る
 *   node tools/capture-tilt-compare.mjs --from 47 --to 50 --publish
 *                                                             … ★見比べ台へ置く
 */
import { mkdirSync, writeFileSync, copyFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import ffmpeg from 'ffmpeg-static';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { launch } from './lib/cdp.mjs';

const arg = (key, fallback) => {
  const i = process.argv.indexOf(`--${key}`);
  return i < 0 ? fallback : process.argv[i + 1];
};
const seed = Number(arg('seed', 42));
const from = Number(arg('from', 47));
const to = Number(arg('to', 50));
const fps = Number(arg('fps', 10));
const scan = process.argv.includes('--scan');
const publish = process.argv.includes('--publish');
const out = path.resolve('out/tilt-compare');
mkdirSync(out, { recursive: true });

/**
 * ★変える 1 個。★それ以外の query は 2 面で同じ。
 *
 * ★`--compare grain` … ★地面タイルの焼き込み横縞（★案 A・`?grain=flat`）
 * ★`--compare tilt`  … ★馬の絵を走路の接線へ回す（`?tilt=track`）★既定
 */
const COMPARE = String(arg('compare', 'tilt'));
const COMPARES = {
  /**
   * ⚠️ ★**2026-09-11 に既定が「回す」へ変わりました**（★オーナー判定）。
   *    ★だから ★**引数なし＝回した側**です。★回さない側を見るには `?tilt=off` が要ります。
   *    ★ここを直さないと、★道具だけが古い既定を撮り続けます（★R-31）。
   */
  tilt: [
    { key: 'off', query: '&tilt=off', label: '回さない（?tilt=off・前の既定）' },
    { key: 'on', query: '', label: '回した（いまの既定）' },
  ],
  grain: [
    { key: 'off', query: '', label: 'いまの芝（タイルに横縞が焼いてある）' },
    { key: 'on', query: '&grain=flat', label: '横縞を平した芝（?grain=flat）' },
  ],
};
const VARIANTS = COMPARES[COMPARE];
if (VARIANTS === undefined) throw new Error(`★--compare は ${Object.keys(COMPARES).join(' / ')} のどれか`);
const NAME = String(arg('name', COMPARE === 'grain' ? 'corner-grain' : 'corner-tilt2'));
/** ★デフォルメの真横素材。★写実の俯瞰素材が出たら落とす。 */
const WANT_ASSET = 'side-v6';
const BAD_ASSETS = ['high-diag-v2', 'diag-rear-v2', 'diag-front-v2'];

const browser = await launch({ port: Number(arg('debug-port', 9471)), width: 1400, height: 1000, timeoutMs: 30000 });
const errors = [];
browser.on('Runtime.exceptionThrown', e => errors.push(e.exceptionDetails));

const READY = `(() => {
  const c = document.querySelector('canvas');
  const seek = document.querySelector('input[aria-label="撮影用シーク"]');
  if (!c || !seek) return false;
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let n = 0;
  for (let i = 0; i < d.length; i += 4000) if (d[i] > 20) n++;
  return n > 50;
})()`;

/** ★その秒へ飛ばして、★1 コマと診断を持ち帰る。 */
const grab = async (sec) => browser.evaluate(`(async () => {
  const el = document.querySelector('input[aria-label="撮影用シーク"]');
  const key = Object.keys(el).find(k => k.startsWith('__reactProps$'));
  el.step = 'any';
  el[key].onChange({ target: { value: '${sec}' } });
  await new Promise(r => setTimeout(r, 60));
  const c = document.querySelector('canvas');
  return {
    sec: Number(el.value),
    w: c.width, h: c.height,
    diag: window.__raceDiag ?? null,
    png: c.toDataURL('image/png').split(',')[1],
  };
})()`);

/**
 * ⚠️ ★`auditSec` を付けないと ★**画布は白紙のまま**です（★描くのは再生かシークのとき）。
 *    ★付け忘れると「レースが開かない」と読める形で止まります。
 */
const openRace = async (query, sec) => {
  const url = `http://localhost:3210/race?dev=1&badge=0&seed=${seed}&auditSec=${sec}${query}`;
  const ready = await browser.goto(url, READY, { timeoutMs: 180000, settleMs: 1500 });
  if (!ready) throw new Error(`★レースが開きませんでした: ${url}`);
  return url;
};

try {
  if (scan) {
    await openRace('', Number(arg('from', 0)));
    console.log('秒\tカット\t素材');
    for (let s = Number(arg('from', 0)); s <= Number(arg('to', 95)); s += 0.5) {
      const f = await grab(s);
      console.log(`${s.toFixed(1)}\t${f.diag?.shot ?? '-'}\t${f.diag?.asset ?? '-'}`);
    }
    await browser.close();
    process.exit(0);
  }

  const count = Math.round((to - from) * fps) + 1;
  const secs = Array.from({ length: count }, (_, i) => from + i / fps);
  /** ★面ごとに撮る（★読み込みは 1 回・★秒だけ動かす）。 */
  const shots = {};
  for (const v of VARIANTS) {
    const url = await openRace(v.query, from);
    console.log(`★撮影 ${v.key}: ${url}`);
    shots[v.key] = [];
    for (const s of secs) {
      const f = await grab(s);
      if (Math.abs(f.sec - s) > 0.001) throw new Error(`★秒がずれました ${v.key} ${s} → ${f.sec}`);
      shots[v.key].push(f);
    }
  }

  /** ★①②③ 出す前の自己確認。 */
  const report = [];
  for (let i = 0; i < secs.length; i++) {
    const a = shots.off[i], b = shots.on[i];
    const shotA = a.diag?.shot ?? null, shotB = b.diag?.shot ?? null;
    const assetA = a.diag?.asset ?? null, assetB = b.diag?.asset ?? null;
    if (shotA !== shotB) throw new Error(`★${secs[i].toFixed(1)}s でカットが違います: ${shotA} / ${shotB}`);
    if (assetA !== assetB) throw new Error(`★${secs[i].toFixed(1)}s で素材が違います: ${assetA} / ${assetB}`);
    for (const bad of BAD_ASSETS) {
      if (assetA === bad) throw new Error(`★${secs[i].toFixed(1)}s が写実素材で描かれています: ${bad}（★デフォルメは ${WANT_ASSET}）`);
    }
    if (assetA !== null && assetA !== WANT_ASSET) throw new Error(`★${secs[i].toFixed(1)}s の素材が想定外です: ${assetA}`);
    report.push({ sec: secs[i], shot: shotA, asset: assetA, same: a.png === b.png });
  }
  /** ★④ 回転が効いているか（★全コマ同一なら比べ物にならない）。 */
  const identical = report.filter(r => r.same).length;
  if (identical === report.length) throw new Error('★2 面が全コマ同一です（★`?tilt=track` が効いていません）');
  console.log(`★カット ${[...new Set(report.map(r => r.shot))].join(' / ')}`);
  console.log(`★素材 ${[...new Set(report.map(r => r.asset))].join(' / ')}（★デフォルメの ${WANT_ASSET} だけであること）`);
  console.log(`★同一コマ ${identical}/${report.length}`);

  /**
   * ★**馬のところだけを切り出して、★ドットのまま拡大して並べる。**
   *
   * ⚠️ ★1280×720 を 2 枚並べると 2560px になり、★頁では ★**43% に縮んで**表示されます。
   *    ★4 コーナーは ★**わざと馬を小さく撮る**カット（★画面高の約 8%）なので、
   *    ★縮めた時点で馬は 20px ほどになり、★姿勢は読めません（★2026-09-11・★オーナー評
   *    ★「馬が滲んで、汚れて、何がなんだか分からない」）。
   * ⚠️ ★拡大は ★**最近傍**（`imageSmoothingEnabled = false`）。★滑らかに伸ばすとドット絵が滲みます。
   * ⚠️ ★切り出す窓は ★**回さない側で決めて、両面に同じ窓**を使います（★窓が違えば比べ物になりません）。
   */
  const ZOOM = Number(arg('zoom', 2));
  const CROP_W = Number(arg('crop-w', 550)), CROP_H = Number(arg('crop-h', 240));
  const LABEL_H = 30;
  const pairDir = path.join(out, 'pair');
  const wideDir = path.join(out, 'wide');
  mkdirSync(pairDir, { recursive: true });
  mkdirSync(wideDir, { recursive: true });

  /** ★馬体の重心（★HUD・コース図・順位表を避けた範囲で）。 */
  const packCenter = (img) => {
    const c = createCanvas(img.width, img.height);
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    const x0 = 200, y0 = 70, w = Math.min(720, img.width - x0), h = Math.min(360, img.height - y0);
    const d = g.getImageData(x0, y0, w, h).data;
    let n = 0, sx = 0, sy = 0;
    for (let p = 0; p < d.length; p += 4) {
      const r = d[p], gg = d[p + 1], b = d[p + 2];
      const isTurf = gg > r + 12 && gg > b + 12;
      const isWhite = r > 170 && gg > 170 && b > 170;
      const isDarkHud = r < 30 && gg < 34 && b < 40;
      if (!isTurf && !isWhite && !isDarkHud) { const px = (p / 4) % w, py = Math.floor((p / 4) / w); n++; sx += px; sy += py; }
    }
    if (n === 0) return { x: img.width / 2, y: img.height / 2, n };
    return { x: x0 + sx / n, y: y0 + sy / n, n };
  };

  /** ★枠の名前を焼く。 */
  const label = (g, k, y) => {
    g.font = 'bold 18px "Yu Gothic UI", "Meiryo", sans-serif';
    g.textBaseline = 'middle';
    g.fillStyle = k === 0 ? '#ffd34d' : '#4dd2ff';
    g.fillText(`${k === 0 ? '上' : '下'}　${VARIANTS[k].label}`, 10, y + LABEL_H / 2);
  };

  const windows = [];
  for (let i = 0; i < secs.length; i++) {
    const imgs = await Promise.all(VARIANTS.map(v =>
      loadImage(Buffer.from(shots[v.key][i].png, 'base64'))));
    const src = imgs[0];
    const ctr = packCenter(src);
    const sx = Math.max(0, Math.min(src.width - CROP_W, Math.round(ctr.x - CROP_W / 2)));
    const sy = Math.max(0, Math.min(src.height - CROP_H, Math.round(ctr.y - CROP_H / 2)));
    windows.push({ sec: secs[i], sx, sy, w: CROP_W, h: CROP_H, packPixels: ctr.n });

    /** ★寄り（★切り出して最近傍で 2 倍・★縦に積む）。 */
    const pw = CROP_W * ZOOM, ph = CROP_H * ZOOM;
    const c = createCanvas(pw, (ph + LABEL_H) * 2);
    const g = c.getContext('2d');
    g.fillStyle = '#0b0f13';
    g.fillRect(0, 0, c.width, c.height);
    g.imageSmoothingEnabled = false;
    imgs.forEach((im, k) => {
      const top = k * (ph + LABEL_H);
      g.drawImage(im, sx, sy, CROP_W, CROP_H, 0, top + LABEL_H, pw, ph);
      label(g, k, top);
    });
    writeFileSync(path.join(pairDir, `f${String(i).padStart(4, '0')}.png`), c.toBuffer('image/png'));

    /** ★引き（★画面まるごと・★実際に遊ぶときの大きさに近い方）。 */
    const ww = Number(arg('wide-w', 1100));
    const wh = Math.round(src.height * (ww / src.width));
    const c2 = createCanvas(ww, (wh + LABEL_H) * 2);
    const g2 = c2.getContext('2d');
    g2.fillStyle = '#0b0f13';
    g2.fillRect(0, 0, c2.width, c2.height);
    imgs.forEach((im, k) => {
      const top = k * (wh + LABEL_H);
      g2.drawImage(im, 0, 0, im.width, im.height, 0, top + LABEL_H, ww, wh);
      label(g2, k, top);
    });
    writeFileSync(path.join(wideDir, `f${String(i).padStart(4, '0')}.png`), c2.toBuffer('image/png'));
  }
  console.log(`★寄り: ${CROP_W}×${CROP_H} を ${ZOOM} 倍（最近傍）→ 1 面 ${CROP_W * ZOOM}×${CROP_H * ZOOM}・縦積み ／ ★引き: 画面まるごと ${arg('wide-w', 1100)}px 幅・縦積み`);

  writeFileSync(path.join(out, 'frames.json'), JSON.stringify({
    seed, from, to, fps, variants: VARIANTS, wantAsset: WANT_ASSET, errors, report, windows,
  }, null, 2));
  if (errors.length) throw new Error('★ブラウザが描画中に例外を出しました');

  const mp4 = path.join(out, `${NAME}-equal.mp4`);
  const quarter = path.join(out, `${NAME}-quarter.mp4`);
  const still = path.join(out, `${NAME}-still.png`);
  execFileSync(ffmpeg, ['-v', 'error', '-y', '-framerate', String(fps), '-i', path.join(pairDir, 'f%04d.png'),
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', mp4]);
  execFileSync(ffmpeg, ['-v', 'error', '-y', '-framerate', String(Math.max(1, Math.round(fps / 4))), '-i', path.join(pairDir, 'f%04d.png'),
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', quarter]);
  copyFileSync(path.join(pairDir, `f${String(Math.floor(secs.length / 2)).padStart(4, '0')}.png`), still);
  copyFileSync(path.join(wideDir, `f${String(Math.floor(secs.length / 2)).padStart(4, '0')}.png`),
    path.join(out, `${NAME}-wide.png`));
  console.log(`★書き出し ${mp4}`);

  if (publish) {
    const dest = path.resolve('apps/web/public/gait-review');
    for (const f of [`${NAME}-equal.mp4`, `${NAME}-quarter.mp4`, `${NAME}-still.png`, `${NAME}-wide.png`]) {
      copyFileSync(path.join(out, f), path.join(dest, f));
    }
    console.log('★見比べ台へ置きました');
  }
} finally { await browser.close(); }
process.exit(0);
