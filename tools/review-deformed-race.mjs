import { mkdirSync, writeFileSync } from 'node:fs';
import { launch } from './lib/cdp.mjs';

const out = 'out/deformed-review';
mkdirSync(out, { recursive: true });
const browser = await launch({ port: 9341, timeoutMs: 30000 });
try {
  const errors = [];
  browser.on('Runtime.exceptionThrown', e => errors.push(e.exceptionDetails));
  const ready = await browser.goto(`http://localhost:3210/race?dev=1&badge=0&auditSec=22${process.argv[3] === 'baked' ? '&baked=1' : ''}`,
    "(() => { const c = document.querySelector('canvas'); if (!c || !document.querySelector('input[aria-label=\"撮影用シーク\"]')) return false; const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4000) if (d[i] > 20) n++; return n > 50; })()", { timeoutMs: 120000, settleMs: 1500 });
  console.log('ready', ready);
  if (!ready) throw new Error('Race canvas did not finish loading');
  for (const sec of [10, 16, 22, 28, 34, 38, 46, 52, 57, 63, 68, 74]) {
    await browser.evaluate(`(() => {
      const el = document.querySelector('input[aria-label="撮影用シーク"]');
      if (!el) throw new Error('Missing race seek control');
      el.step = 'any';
      const props = Object.keys(el).find(k => k.startsWith('__reactProps$'));
      el[props].onChange({ target: { value: '${sec}' } });
    })()`);
    await new Promise(r => setTimeout(r, 700));
    const controls = await browser.evaluate(`({
      sec: Number(document.querySelector('input[aria-label="撮影用シーク"]').value),
      scale: Number(document.querySelector('input[aria-label="馬の大きさ"]').value)
    })`);
    if (Math.abs(controls.sec - sec) > 0.01 || controls.scale !== 1) {
      throw new Error('Capture controls differ from requested conditions: ' + JSON.stringify(controls));
    }
    const data = await browser.evaluate("document.querySelector('canvas').toDataURL('image/png').split(',')[1]");
    writeFileSync(`${out}/${process.argv[2] ?? 'before'}-${sec}.png`, Buffer.from(data, 'base64'));
    console.log('captured', sec);
  }
  writeFileSync(`${out}/errors.json`, JSON.stringify(errors, null, 2));
} finally {
  await browser.close();
}
process.exit(0);
