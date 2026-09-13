import { mkdirSync, writeFileSync } from 'node:fs';
import { launch } from './lib/cdp.mjs';

const browser = await launch({ port: 9351, headless: true, timeoutMs: 25000 });
const output = 'out/story-interiors';
mkdirSync(output, { recursive: true });
const errors = [];
const report = [];
browser.on('Runtime.exceptionThrown', (e) => errors.push(e.exceptionDetails.text));
try {
  await browser.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  const quick = process.argv.includes('--quick');
  if (!quick) await browser.goto('http://localhost:3210/races', `!!document.querySelector('.story-content')`, { timeoutMs: 60000 });
  const race = quick ? null : await browser.evaluate(`Array.from(document.querySelectorAll('a[href]')).map(a=>a.getAttribute('href')).find(h=>h.startsWith('/races/') && h.split('/').length === 3) ?? null`);
  const routes = ['/stable', '/stable/h1', '/training', '/entry', '/records', '/records?tab=ep', '/prizes', '/login', '/signup', '/setup', '/races', '/design-preview/odds', '/design-preview/odds?type=quinella'];
  if (race) routes.push(race, `${race}/odds`, `${race}/bet`);
  else routes.push('/races/demo/bet');
  console.log('Race route:', race);
  for (const width of [1440, 390]) {
    await browser.send('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: width < 720 });
    for (const route of routes.filter((r) => !quick || ['/stable/h1','/training','/entry','/records','/design-preview/odds','/design-preview/odds?type=quinella','/races/demo/bet'].includes(r))) {
      const ready = await browser.goto(`http://localhost:3210${route}`, `location.pathname === ${JSON.stringify(route.split('?')[0])} && document.readyState === 'complete' && !!document.querySelector('.story-content')`, { timeoutMs: 60000, settleMs: 700 });
      if (!ready) throw new Error(`Route did not load: ${route}`);
      const state = await browser.evaluate(`(() => {
        const content = document.querySelector('.story-content');
        const overflow = Array.from(content.querySelectorAll('a,button,input,select,h1,span')).filter(e=>{
          const r=e.getBoundingClientRect(); const s=getComputedStyle(e);
          return r.width>0 && r.height>0 && s.visibility!=='hidden' && (r.right>innerWidth+2 || r.left < -2);
        }).slice(0,12).map(e=>({tag:e.tagName,cls:e.className,text:e.innerText?.slice(0,45),right:Math.round(e.getBoundingClientRect().right)}));
        return {title:content.querySelector('h1')?.innerText, background:getComputedStyle(document.body).backgroundColor,headingFont:content.querySelector('h1') ? getComputedStyle(content.querySelector('h1')).fontFamily : null,overflow,readError:content.innerText.includes('読み取りに失敗'),oddsRows:content.querySelectorAll('.story-odds-row').length};
      })()`);
      report.push({ width, route, ...state });
      console.log(JSON.stringify(report.at(-1)));
      if (['/stable','/training','/races','/records'].includes(route) || route.endsWith('/odds')) {
        const shot = await browser.send('Page.captureScreenshot', { format: 'png' });
        writeFileSync(`${output}/${width}-${route.replaceAll('/','_')}.png`, Buffer.from(shot.data,'base64'));
      }
    }
  }
  await browser.goto('http://localhost:3210/training', `location.pathname === '/training' && !!document.querySelector('.tr-menus')`, { settleMs: 1800 });
  const selection = await browser.evaluate(`(async () => {const b=Array.from(document.querySelectorAll('.tr-menus>div')).find(e=>e.innerText.includes('休養')); if(!b)return false;b.click();await new Promise(r=>setTimeout(r,600));return Array.from(document.querySelectorAll('.tr-menus>div')).some(e=>e.innerText.includes('休養') && e.innerText.includes('選択中'));})()`);
  console.log('Training menu click:', selection);
  await browser.goto('http://localhost:3210/lp-preview', `!!document.querySelector('.ms-page')`);
  console.log('LP isolation:', await browser.evaluate(`!document.querySelector('.story-shell') && getComputedStyle(document.querySelector('.ms-page')).backgroundColor === 'rgb(248, 247, 239)'`));
  writeFileSync(`${output}/report.json`, JSON.stringify({ report, errors, selection }, null, 2));
  console.log('Runtime errors:', JSON.stringify(errors));
  if (!selection || report.some(r=>r.overflow.length)) throw new Error('Interaction/layout checks failed; see report.json');
} finally { await browser.close(); }
process.exit(errors.length ? 1 : 0);
