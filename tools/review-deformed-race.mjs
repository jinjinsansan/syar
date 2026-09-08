import { mkdirSync, writeFileSync } from 'node:fs';
import { launch } from './lib/cdp.mjs';

const out = 'out/deformed-review';
mkdirSync(out, { recursive: true });
const browser = await launch({ port: 9341, timeoutMs: 30000 });
try {
  const errors = [];
  browser.on('Runtime.exceptionThrown', e => errors.push(e.exceptionDetails));
  const ready = await browser.goto(`http://localhost:3210/race?dev=1&badge=0&auditSec=22${process.argv[3] === 'baked' ? '&baked=1' : ''}`,
    "(() => { const c = document.querySelector('canvas'); if (!c || !document.querySelector('input[type=range]')) return false; const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4000) if (d[i] > 20) n++; return n > 50; })()", { timeoutMs: 120000, settleMs: 1500 });
  console.log('ready', ready);
  if (!ready) throw new Error('Race canvas did not finish loading');
  for (const sec of [10, 13, 16, 18, 20, 22, 25, 28, 34]) {
    await browser.evaluate(`(() => {
      const el = document.querySelector('input[type=range]');
      if (!el) return;
      el.step = 'any';
      const props = Object.keys(el).find(k => k.startsWith('__reactProps$'));
      el[props].onChange({ target: { value: '${sec}' } });
    })()`);
    await new Promise(r => setTimeout(r, 700));
    const data = await browser.evaluate("document.querySelector('canvas').toDataURL('image/png').split(',')[1]");
    writeFileSync(`${out}/${process.argv[2] ?? 'before'}-${sec}.png`, Buffer.from(data, 'base64'));
    console.log('captured', sec);
  }
  writeFileSync(`${out}/errors.json`, JSON.stringify(errors, null, 2));
} finally {
  await browser.close();
}
process.exit(0);
