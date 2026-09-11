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
import { mkdirSync, writeFileSync, copyFileSync, rmSync } from 'node:fs';
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
const out = path.resolve('out/race-through');
const frameDir = path.join(out, 'f');
rmSync(frameDir, { recursive: true, force: true });
mkdirSync(frameDir, { recursive: true });

const BAR_H = 30;
const browser = await launch({ port: Number(arg('debug-port', 9475)), width: 1400, height: 1000, timeoutMs: 30000 });
const errors = [];
browser.on('Runtime.exceptionThrown', e => errors.push(e.exceptionDetails));

const mmss = (sec) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}.${String(Math.floor((sec % 1) * 10))}`;

try {
  /** ⚠️ ★`auditSec` が無いと画布は白紙のまま（描くのは再生かシークのとき） */
  const url = `http://localhost:3210/race?dev=1&badge=0&seed=${seed}&auditSec=0`;
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

  const rows = [];
  for (let i = 0; i <= count; i += 1) {
    const sec = span.min + i / fps;
    const r = await browser.evaluate(`(async () => {
      const el = document.querySelector('input[aria-label="撮影用シーク"]');
      const k = Object.keys(el).find(x => x.startsWith('__reactProps$'));
      el.step = 'any';
      el[k].onChange({ target: { value: '${sec}' } });
      await new Promise(r => setTimeout(r, 55));
      const c = document.querySelector('canvas');
      return {
        sec: Number(el.value),
        diag: window.__raceDiag ?? null,
        jpeg: c.toDataURL('image/jpeg', 0.92).split(',')[1],
      };
    })()`);
    if (Math.abs(r.sec - sec) > 0.06) throw new Error(`★秒がずれました ${sec} → ${r.sec}`);
    const shot = r.diag?.shot ?? '（導入）';
    const cutIn = r.diag?.cutIn ?? null;
    rows.push({ sec, shot, cutIn });

    /** ★絵の上には何も描かない。★時刻とカット名は画の外の帯に出す */
    const img = await loadImage(Buffer.from(r.jpeg, 'base64'));
    const c = createCanvas(img.width, img.height + BAR_H);
    const g = c.getContext('2d');
    g.fillStyle = '#0b0f13';
    g.fillRect(0, 0, c.width, c.height);
    g.drawImage(img, 0, BAR_H);
    g.font = 'bold 17px "Yu Gothic UI", "Meiryo", monospace';
    g.textBaseline = 'middle';
    g.fillStyle = '#ffd34d';
    g.fillText(mmss(sec), 12, BAR_H / 2);
    g.fillStyle = '#9fb4c6';
    g.fillText(`${shot}${cutIn === null ? '' : ` ／ カットイン: ${cutIn}`}`, 92, BAR_H / 2);
    writeFileSync(path.join(frameDir, `f${String(i).padStart(5, '0')}.jpg`), c.toBuffer('image/jpeg', 0.92));
    if (i % (fps * 5) === 0) console.log(`  ${mmss(sec)}  ${shot}`);
  }
  if (errors.length > 0) throw new Error(`★ブラウザが描画中に例外を出しました（${errors.length} 件）`);

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
  execFileSync(ffmpeg, ['-v', 'error', '-y', '-framerate', String(fps), '-i', path.join(frameDir, 'f%05d.jpg'),
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '21', '-pix_fmt', 'yuv420p', mp4]);
  console.log(`★書き出し ${mp4}`);
  console.log(`★カット表 ${path.join(out, 'cuts.md')}（★カット数 ${cuts.length}）`);

  if (publish) {
    copyFileSync(mp4, path.resolve('apps/web/public/gait-review/race-through.mp4'));
    console.log('★見比べ台へ置きました');
  }
} finally { await browser.close(); }
process.exit(0);
