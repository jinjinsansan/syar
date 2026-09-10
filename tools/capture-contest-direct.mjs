import { mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';
import ffmpeg from 'ffmpeg-static';
import { launch } from './lib/cdp.mjs';

const arg = (key, fallback) => {
  const i = process.argv.indexOf(`--${key}`);
  return i < 0 ? fallback : process.argv[i + 1];
};
const label = arg('label', 'baseline');
if (!/^[a-z0-9-]+$/.test(label)) throw new Error('Invalid capture label');
const seed = Number(arg('seed', 42));
const from = Number(arg('from', 48));
const to = Number(arg('to', 67));
const fps = Number(arg('fps', 15));
const debugPort = Number(arg('debug-port', 9463));
const horse = String(arg('horse', ''));
if (horse !== '' && !/^[a-z0-9-]+$/.test(horse)) throw new Error('Invalid horse asset label');
const out = path.resolve('out/contest-direct-review', `${label}-${seed}`);
mkdirSync(out, { recursive: true });
const browser = await launch({ port: debugPort, width: 1400, height: 1000, timeoutMs: 30000 });
const frames = [];
const errors = [];
browser.on('Runtime.exceptionThrown', e => errors.push(e.exceptionDetails));
try {
  const horseQuery = horse === '' ? '' : `&horse=${encodeURIComponent(horse)}&types=0`;
  const url = `http://localhost:3210/race?dev=1&badge=0&seed=${seed}&auditSec=${from}${horseQuery}`;
  const ready = await browser.goto(url,
    `(() => {
      const c = document.querySelector('canvas');
      const seek = document.querySelector('input[aria-label="撮影用シーク"]');
      if (!c || !seek) return false;
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let n = 0;
      for (let i = 0; i < d.length; i += 4000) if (d[i] > 20) n++;
      return n > 50;
    })()`, { timeoutMs: 180000, settleMs: 1500 });
  if (!ready) throw new Error('Race did not load');
  await browser.send('Page.bringToFront');
  console.log(`Loaded ${label}, seed ${seed}`);
  if (process.argv.includes('--live')) {
    const recording = await browser.evaluate(`(async () => {
      const el = document.querySelector('input[aria-label="撮影用シーク"]');
      const key = Object.keys(el).find(k => k.startsWith('__reactProps$'));
      el[key].onChange({ target: { value: '${from}' } });
      await new Promise(resolve => setTimeout(resolve, 100));
      const stream = document.querySelector('canvas').captureStream(30);
      const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
      const chunks = [];
      recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
      const stopped = new Promise(resolve => { recorder.onstop = resolve; });
      const play = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === '演出開始');
      if (!play) throw new Error('Live playback control missing');
      recorder.start();
      play.click();
      await new Promise(resolve => setTimeout(resolve, ${(to - from) * 1000}));
      const end = Number(document.querySelector('input[aria-label="撮影用シーク"]').value);
      [...document.querySelectorAll('button')].find(b => b.textContent.trim() === '停止')?.click();
      recorder.stop();
      await stopped;
      stream.getTracks().forEach(t => t.stop());
      const bytes = new Uint8Array(await new Blob(chunks).arrayBuffer());
      let binary = '';
      for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
      return { end, base64: btoa(binary) };
    })()`);
    writeFileSync(path.join(out, 'live.webm'), Buffer.from(recording.base64, 'base64'));
    writeFileSync(path.join(out, 'live.json'), JSON.stringify({ from, requestedEnd: to, actualEnd: recording.end, errors }, null, 2));
    if (recording.end < to - 1 || recording.end > to + 1) throw new Error(`Live race clock did not advance normally: ${from} -> ${recording.end}`);
    console.log(`Live playback advanced from ${from} to ${recording.end}`);
    await browser.close();
    process.exit(0);
  }
  const count = Math.round((to - from) * fps);
  for (let i = 0; i < count; i++) {
    const sec = from + i / fps;
    const result = await browser.evaluate(`(async () => {
      const el = document.querySelector('input[aria-label="撮影用シーク"]');
      const key = Object.keys(el).find(k => k.startsWith('__reactProps$'));
      el.step = 'any';
      el[key].onChange({ target: { value: '${sec}' } });
      await new Promise(resolve => setTimeout(resolve, 40));
      return {
        sec: Number(el.value),
        scale: Number(document.querySelector('input[aria-label="馬の大きさ"]').value),
        diag: window.__raceDiag ?? null,
        jpeg: document.querySelector('canvas').toDataURL('image/jpeg', 0.9).split(',')[1],
      };
    })()`);
    if (Math.abs(result.sec - sec) > 0.001 || result.scale !== 1) {
      throw new Error(`Capture controls changed at ${sec}: ${result.sec}, scale ${result.scale}`);
    }
    const bytes = Buffer.from(result.jpeg, 'base64');
    writeFileSync(path.join(out, `f${String(i).padStart(4, '0')}.jpg`), bytes);
    frames.push({ sec, diag: result.diag, sha: createHash('sha256').update(bytes).digest('hex') });
    if (i % fps === 0) console.log(`${label} seed ${seed}: ${sec.toFixed(1)}s`);
  }
  if (new Set(frames.map(f => f.sha)).size < frames.length * 0.8) throw new Error('Too many repeated frames');
  writeFileSync(path.join(out, 'frames.json'), JSON.stringify({ url, from, to, fps, errors, frames }, null, 2));
  if (errors.length) throw new Error('Browser reported rendering errors');
  execFileSync(ffmpeg, ['-v', 'error', '-y', '-framerate', String(fps), '-i', path.join(out, 'f%04d.jpg'),
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '19', '-pix_fmt', 'yuv420p', path.join(out, 'race.mp4')]);
  console.log(`Saved ${out}/race.mp4`);
} finally { await browser.close(); }
process.exit(0);
