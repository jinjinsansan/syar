import { mkdirSync, writeFileSync } from 'node:fs';
import { launch } from './lib/cdp.mjs';

const browser = await launch({ port: 9347, headless: true, timeoutMs: 20000 });
const errors = [];
browser.on('Runtime.exceptionThrown', (e) => errors.push(e.exceptionDetails.text));
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const output = 'out/lp-preview';
mkdirSync(output, { recursive: true });
try {
  for (const [name, width, height] of [['desktop', 1440, 1000], ['mobile', 390, 844]]) {
    await browser.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: name === 'mobile' });
    if (!await browser.goto('http://localhost:3210/lp-preview', `document.querySelector('.ms-horse canvas')?.style.opacity === '1'`, { timeoutMs: 60000 })) throw new Error('LP horse did not become ready');
    const state = await browser.evaluate(`({title:document.title,width:innerWidth,scrollWidth:document.documentElement.scrollWidth,canvas:document.querySelector('canvas').width,heading:document.querySelector('h1').innerText})`);
    const before = await browser.evaluate(`document.querySelector('canvas').toDataURL()`);
    await pause(270);
    const after = await browser.evaluate(`document.querySelector('canvas').toDataURL()`);
    state.animated = before !== after;
    await browser.evaluate(`document.querySelector('.ms-hero-footer button').click()`);
    await pause(250);
    const stopped = await browser.evaluate(`document.querySelector('canvas').toDataURL()`);
    await pause(270);
    state.paused = stopped === await browser.evaluate(`document.querySelector('canvas').toDataURL()`);
    await browser.evaluate(`document.querySelector('[aria-label="芦毛をプレビュー"]').click()`);
    await pause(1600);
    state.coatSwitched = await browser.evaluate(`document.querySelector('[aria-label="芦毛をプレビュー"]').getAttribute('aria-pressed') === 'true' && document.querySelector('canvas').style.opacity === '1'`);
    const screenshot = await browser.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`${output}/${name}.png`, Buffer.from(screenshot.data, 'base64'));
    await browser.evaluate(`scrollTo(0,1000)`);
    await pause(250);
    state.scrollProgress = await browser.evaluate(`document.querySelector('.ms-journey').style.getPropertyValue('--journey')`);
    const lower = await browser.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`${output}/${name}-story.png`, Buffer.from(lower.data, 'base64'));
    console.log(name, JSON.stringify(state));
    if (state.scrollWidth > width || !state.animated || !state.paused || !state.coatSwitched) throw new Error(`Failed interaction/layout check: ${name}`);
  }
  await browser.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await browser.evaluate(`scrollTo(0,0);document.querySelector('.ms-hero-footer button').click()`);
  await pause(600);
  const a = await browser.evaluate(`document.querySelector('canvas').toDataURL()`);
  await pause(270);
  if (a !== await browser.evaluate(`document.querySelector('canvas').toDataURL()`)) throw new Error('Reduced motion was not respected');
  console.log('reducedMotion: PASS; runtimeErrors:', JSON.stringify(errors));
  if (errors.length) throw new Error('Runtime errors');
} finally { await browser.close(); }
process.exit(0);
