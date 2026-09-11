/**
 * ★**レースを頭から終わりまで 1 本で撮る**（★2026-09-12・★計画書 工程 3「通し第 1 版」）
 *
 * 【★なぜ要るか】
 *   ★局所の見比べを重ねても、★**次にどこが不合格か**は分かりませんでした。
 *   ★オーナー判断（★2026-09-11）: ★**「通しで一本見て、次の不合格を拾う」**。
 *
 * 【★この道具の作法】
 *   ⚠️ ★**画面の既定のまま撮ります。** ★`?dev=1&seed=...` 以外のパラメータを渡しません
 *      （★渡すと「道具だけが違う画を撮る」ことになります・★R-31）。
 *   ⚠️ ★尺は ★**画面のシークの `max` から取ります**。★手置きの秒数を書きません
 *      （★台本が伸び縮みしても、通しは通しのまま撮れます）。
 *   ★絵の上には何も描きません。★**時刻とカット名は画の外の帯**に出します
 *      （★画の中に焼くと、その字で合否が変わります）。
 *
 * 【★出すもの】
 *   ★`out/race-through/race-through.mp4` … ★通しの映像（★等速）
 *   ★`out/race-through/cuts.md`          … ★**何秒がどのカットか**の表
 *      （★オーナーが「◯分◯秒がおかしい」と言えば、★どのカットの話か即分かるように）
 *
 * 【★使い方】
 *   node tools/capture-race-through.mjs                 … ★seed 42・15fps
 *   node tools/capture-race-through.mjs --publish       … ★見比べ台へ置く
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync, copyFileSync, rmSync } from 'node:fs';
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
const fps = Number(arg('fps', 15));
const publish = process.argv.includes('--publish');
/**
 * ★**2 倍で描かせて撮る**（★2026-09-12・★オーナー評「絵が滲んでいます」）。
 *
 * 【★測った事実】★どこにも 1:1 がありませんでした:
 *   ★映像 素 1280 → 表示 1116（★87.2%）／★画面は ★**dpr 1.5**
 *   → ★1116 × 1.5 ＝ ★**1674 物理 px へ引き伸ばし**。★h264 の設定では直りません。
 * → ★`?render=2x` で ★**画布だけ**倍にして撮り、★1920 幅で書き出します。
 *   ★**縮小は滲みません。引き伸ばしが滲みます。**
 * ⚠️ ★描く座標は 1280×720 のままなので、★版面・文字・カット・馬の位置は変わりません
 *    （★実測: 2 倍を 1280 へ縮めて 1 倍と比べ、★平均差 1.58 階調＝縁の滑らかさだけ）。
 */
const render2x = !process.argv.includes('--no-2x');
const outW = Number(arg('out-width', 1920));
/**
 * ★**途中から撮り直せるようにする**（★2026-09-12）。
 * ⚠️ ★2 倍で 15fps を通しで撮ると、★**1133 コマ目（87%）でブラウザが詰まりました**
 *    （`Page.captureScreenshot` がタイムアウト）。★長い撮影は必ず詰まる前提で作ります。
 * ★`--start-sec 75.5 --keep` … その秒から撮り足す（★コマ番号は通しと揃えます）
 * ★`--encode-only`           … 撮らずに、★既にあるコマから映像と表だけ作る
 */
const startSec = Number(arg('start-sec', 0));
const keep = process.argv.includes('--keep') || startSec > 0;
const encodeOnly = process.argv.includes('--encode-only');
const rowsPath = path.resolve('out/race-through/rows.json');
const out = path.resolve('out/race-through');
const frameDir = path.join(out, 'f');
if (!keep && !encodeOnly) rmSync(frameDir, { recursive: true, force: true });
mkdirSync(frameDir, { recursive: true });

const BAR_H = render2x ? 60 : 30;
const browser = await launch({ port: Number(arg('debug-port', 9475)), width: 1400, height: 1000, timeoutMs: 180000 });
const errors = [];
browser.on('Runtime.exceptionThrown', e => errors.push(e.exceptionDetails));

const mmss = (sec) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}.${String(Math.floor((sec % 1) * 10))}`;

try {
  /** ⚠️ ★`auditSec` が無いと画布は白紙のまま（描くのは再生かシークのとき） */
  const url = `http://localhost:3210/race?dev=1&badge=0&seed=${seed}&auditSec=0${render2x ? '&render=2x' : ''}`;
  const ready = await browser.goto(url, `(() => {
    const c = document.querySelector('canvas');
    const s = document.querySelector('input[aria-label="撮影用シーク"]');
    return !!c && !!s;
  })()`, { timeoutMs: 180000, settleMs: 2500 });
  if (!ready) throw new Error(`★レースが開きませんでした: ${url}`);

  /** ★尺は画面から取る（★手置きしない） */
  const span = await browser.evaluate(`(() => {
    const el = document.querySelector('input[aria-label="撮影用シーク"]');
    return { min: Number(el.min), max: Number(el.max) };
  })()`);
  const total = span.max - span.min;
  const count = Math.floor(total * fps);
  console.log(`★URL ${url}`);
  console.log(`★尺 ${span.min.toFixed(2)} 〜 ${span.max.toFixed(2)} 秒（★画面のシークから）／ ${fps}fps ／ ${count} コマ`);
  console.log(`★描画 ${render2x ? '2 倍（画布 2560×1440）' : '等倍'} → ★書き出し ${outW}px 幅`);

  /**
   * ⚠️ ★**2 倍の絵を `toDataURL` で毎コマ受け取ると落ちます。**
   *    ★2560×1440 の base64 を 1291 回 CDP で運ぶことになり、★実測で ★**タイムアウト**しました。
   * → ★絵は ★`Page.captureScreenshot`（★`clip.scale`）で受け取り、
   *   ★`evaluate` では ★**秒と診断だけ**（★小さい値）を受け取ります。
   * ★画布の CSS 上の位置は画面から読みます（★手置きしない）。
   */
  /**
   * ⚠️ ★**`clip.scale` には、★画面の dpr が掛かります。**
   *    ★実測: 同じ 1.667 を渡して、★前半は 1920px・★後半は ★**2880px** のコマになりました
   *    （★dpr 1.5 のぶん）。★コマの大きさが揃わないと、★書き出しが黙って崩れます。
   * → ★**dpr で割ってから渡します**。★大きさは撮った 1 コマ目で必ず確かめます。
   */
  const rect = await browser.evaluate(`(() => {
    const el = document.querySelector('canvas');
    const r = el.getBoundingClientRect();
    return { x: r.x + window.scrollX, y: r.y + window.scrollY, w: r.width, h: r.height,
      dpr: window.devicePixelRatio, buffer: [el.width, el.height] };
  })()`);
  console.log(`★画布 ${rect.buffer.join('x')} ／ 頁の上では ${Math.round(rect.w)}x${Math.round(rect.h)} CSS px ／ dpr ${rect.dpr}`);
  const shotScale = outW / (rect.w * rect.dpr);

  /** ★前回までの行（★再開したときに表が欠けないように） */
  const rows = existsSync(rowsPath) && keep
    ? JSON.parse(readFileSync(rowsPath, 'utf8')) : [];
  const firstIndex = Math.max(0, Math.round((startSec - span.min) * fps));
  if (firstIndex > 0) console.log(`★${startSec.toFixed(2)} 秒（コマ ${firstIndex}）から撮り足します`);
  for (let i = firstIndex; i <= count; i += 1) {
    const sec = span.min + i / fps;
    const r = await browser.evaluate(`(async () => {
      const el = document.querySelector('input[aria-label="撮影用シーク"]');
      const k = Object.keys(el).find(x => x.startsWith('__reactProps$'));
      el.step = 'any';
      el[k].onChange({ target: { value: '${sec}' } });
      await new Promise(r => setTimeout(r, 55));
      return { sec: Number(el.value), diag: window.__raceDiag ?? null };
    })()`);
    if (Math.abs(r.sec - sec) > 0.06) throw new Error(`★秒がずれました ${sec} → ${r.sec}`);
    const shot0 = await browser.send('Page.captureScreenshot', {
      format: 'jpeg', quality: 94, captureBeyondViewport: true,
      /**
       * ⚠️ ★`captureBeyondViewport` は毎コマ頁ぜんぶを描き直させます（★詰まりの元）。
       *    ★画布は画面の中にあるので要りません。
       * ★`scale` は ★**出したい幅**に合わせます（★運ぶ量が減り、絵は 2 倍のまま撮れます）。
       */
      clip: { x: rect.x, y: rect.y, width: rect.w, height: rect.h, scale: shotScale },
    });
    r.jpeg = shot0.data;
    if (i === firstIndex) {
      const probe = await loadImage(Buffer.from(r.jpeg, 'base64'));
      console.log(`★コマの大きさ ${probe.width}x${probe.height}（★狙い ${outW}px 幅）`);
      if (probe.width !== outW) throw new Error(`★コマの幅が ${probe.width} です。★${outW} になりません`);
    }
    const shot = r.diag?.shot ?? '（導入）';
    const cutIn = r.diag?.cutIn ?? null;
    rows.push({ sec, shot, cutIn });
    if (i % 100 === 0) writeFileSync(rowsPath, JSON.stringify(rows));

    /** ★絵の上には何も描かない。★時刻とカット名は画の外の帯に出す */
    const img = await loadImage(Buffer.from(r.jpeg, 'base64'));
    const c = createCanvas(img.width, img.height + BAR_H);
    const g = c.getContext('2d');
    g.fillStyle = '#0b0f13';
    g.fillRect(0, 0, c.width, c.height);
    g.drawImage(img, 0, BAR_H);
    g.font = `bold ${Math.round(BAR_H * 0.57)}px "Yu Gothic UI", "Meiryo", monospace`;
    g.textBaseline = 'middle';
    g.fillStyle = '#ffd34d';
    g.fillText(mmss(sec), BAR_H * 0.4, BAR_H / 2);
    g.fillStyle = '#9fb4c6';
    g.fillText(`${shot}${cutIn === null ? '' : ` ／ カットイン: ${cutIn}`}`, BAR_H * 3.1, BAR_H / 2);
    writeFileSync(path.join(frameDir, `f${String(i).padStart(5, '0')}.jpg`), c.toBuffer('image/jpeg', 0.92));
    if (i % (fps * 5) === 0) console.log(`  ${mmss(sec)}  ${shot}`);
  }
  if (errors.length > 0) throw new Error(`★ブラウザが描画中に例外を出しました（${errors.length} 件）`);
  rows.sort((a, b) => a.sec - b.sec);
  writeFileSync(rowsPath, JSON.stringify(rows));

  /** ★カットの表（★何秒がどのカットか） */
  const cuts = [];
  for (const r of rows) {
    const last = cuts[cuts.length - 1];
    if (last === undefined || last.shot !== r.shot) cuts.push({ shot: r.shot, from: r.sec, to: r.sec });
    else last.to = r.sec;
  }
  const md = [
    `# ★レース通しのカット表（seed ${seed}・${new Date().toISOString().slice(0, 10)}）`,
    '',
    `★尺 ${span.max.toFixed(2)} 秒 ／ ${fps}fps ／ 映像 \`race-through.mp4\``,
    '★映像の左上の時刻と、この表の秒は同じものです。',
    '',
    '| 何秒 | 長さ | カット |',
    '|---|---|---|',
    ...cuts.map(c => `| ${mmss(c.from)} 〜 ${mmss(c.to)} | ${(c.to - c.from).toFixed(1)}秒 | \`${c.shot}\` |`),
    '',
    `★カット数 ${cuts.length}`,
  ].join('\n');
  writeFileSync(path.join(out, 'cuts.md'), md);

  const mp4 = path.join(out, 'race-through.mp4');
  /**
   * ⚠️ ★**暗い場面は h264 がブロックで潰れます。**
   *    ★導入（暗いタイトル）で ★**16px の升目**が出ました（★2026-09-12・★オーナー評「絵が滲んでいます」）。
   *    ★原因は ★**量子化**で、★元のコマは綺麗でした（★撮り直しは不要）。
   *  ★`-crf 15`     … 暗部の階調を残す（★21 では潰れた）
   *  ★`-tune animation` … ★2D の平らな面向け（★デブロックを弱め、線を残す）
   *  ★`-g ${fps}`   … ★1 秒ごとに鍵コマ。★**止めて見たときにそのコマが綺麗**（★秒で指摘いただくため）
   */
  execFileSync(ffmpeg, ['-v', 'error', '-y', '-framerate', String(fps), '-i', path.join(frameDir, 'f%05d.jpg'),
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '15', '-tune', 'animation',
    '-g', String(fps), '-pix_fmt', 'yuv420p', mp4]);
  console.log(`★書き出し ${mp4}`);
  console.log(`★カット表 ${path.join(out, 'cuts.md')}（★カット数 ${cuts.length}）`);

  if (publish) {
    copyFileSync(mp4, path.resolve('apps/web/public/gait-review/race-through.mp4'));
    console.log('★見比べ台へ置きました');
  }
} finally { await browser.close(); }
process.exit(0);
