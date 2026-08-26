/**
 * ★**通常 `/race` の実画面を、カットごとに 1 枚ずつ撮る**（読取専用・指示書 §3/§17-10）
 *
 *   ⚠️ ★勝負服 overlay と毛色焼き込みが効く**実ブラウザの Broadcast V2** を正典にします。
 *      オフラインの描画ツールはそこを通らないため使いません。
 *   ⚠️ ★改善版の動画は作りません（§2）。EDL の各カットの**証拠画像**だけです。
 *
 * 【seed の与え方】
 *   `/race` は URL から seed を受け取りません（`badge` と `auditSec` だけ）。
 *   → 画面の「シード」入力を書き換えます。ページの `setSeed` がそのまま走ります。
 *      DOM の値を差し替えるだけで、ページのコードは変えていません。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { launch } from './lib/cdp.mjs';

const OUT = path.resolve('out/2d-edit-grammar');
const SHOTS = path.join(OUT, '_race-shots');
mkdirSync(SHOTS, { recursive: true });

const BASE = process.env.AUDIT_BASE ?? 'http://localhost:3210';
const INTRO_SEC = 7.8;

if (!existsSync(path.join(OUT, 'race-edl.json'))) {
  throw new Error('★race-edl.json が無い。先に tools/audit-edit-grammar-race.mjs を走らせること');
}
const edl = JSON.parse(readFileSync(path.join(OUT, 'race-edl.json'), 'utf8'));

const READY = "(()=>{const c=document.querySelector('canvas');if(!c)return false;"
  + "const x=c.getContext('2d');const d=x.getImageData(0,0,c.width,c.height).data;"
  + "let n=0;for(let i=0;i<d.length;i+=4000)if(d[i]>20)n++;return n>50;})()";

/** ★入力欄の値を差し替えて React に伝える（ページの onChange がそのまま走る） */
const SET_INPUT = (selector, value) => `(()=>{
  const el = document.querySelector(${JSON.stringify(selector)});
  if (!el) return 'not-found';
  const proto = el instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLSelectElement.prototype;
  const set = Object.getOwnPropertyDescriptor(proto, 'value').set;
  set.call(el, String(${JSON.stringify(String(value))}));
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return el.value;
})()`;

const SEEK = (sec) => `(()=>{
  const el = document.querySelector('input[type=range]');
  if (!el) return 'no-slider';
  el.step = 'any';
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  set.call(el, String(${sec}));
  el.dispatchEvent(new Event('input', { bubbles: true }));
  return el.value;
})()`;

/** ★遷移せずに条件が満たされるまで待つ */
async function waitFor(browser, expr, timeoutMs) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    try { if (await browser.evaluate(expr) === true) return true; } catch { /* 再描画中 */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 16);

async function grab(browser, file) {
  const d = await browser.evaluate("document.querySelector('canvas').toDataURL('image/png')");
  const buf = Buffer.from(String(d).split(',')[1], 'base64');
  writeFileSync(file, buf);
  return { file: path.basename(file), sha256: sha(buf), bytes: buf.length };
}

const browser = await launch({ width: 1500, height: 1100 });
const captured = [];

try {
  for (const s of edl.seeds) {
    /* ★seed ごとにページを開き直す（前の seed の状態を持ち越さない） */
    await browser.goto('about:blank', 'true', { timeoutMs: 20000, settleMs: 200 });
    if (!await browser.goto(`${BASE}/race?badge=0&auditSec=${INTRO_SEC}`, READY, { timeoutMs: 180000, settleMs: 1500 })) {
      throw new Error('★ページが用意できませんでした');
    }
    const set = await browser.evaluate(SET_INPUT('input[type=number]', s.seed));
    if (set === 'not-found') throw new Error('★シード入力が見つかりません');
    if (Number(set) !== s.seed) throw new Error(`★シードを ${s.seed} にできませんでした（${set}）`);
    /**
     * ★**組み直しを待つ**。
     * ⚠️ ★ここで `goto` を使うと**ページが再読込されて seed が既定へ戻ります**（一度これで踏みました）。
     *    遷移せずに、シークバーが戻ってくるまで待ちます。
     */
    const waited = await waitFor(browser,
      "(()=>!!document.querySelector('input[type=range]') && !!document.querySelector('canvas'))()", 60000);
    if (!waited) throw new Error(`★seed ${s.seed} の組み直しが終わりません`);
    const seedNow = await browser.evaluate("document.querySelector('input[type=number]').value");
    if (Number(seedNow) !== s.seed) throw new Error(`★seed が ${seedNow} に戻っています`);

    for (const cut of s.edl) {
      /* ★カットの中央を撮る（境目の遷移を避ける） */
      const mid = (cut.startSec + cut.endSec) / 2;
      if (await browser.evaluate(SEEK(Number((mid + INTRO_SEC).toFixed(4)))) === 'no-slider') {
        throw new Error('★シークバーが見つかりません');
      }
      const meta = JSON.parse(await browser.evaluate(
        "(()=>{const c=document.querySelector('canvas');return JSON.stringify({w:c.width,h:c.height,url:location.href});})()",
      ));
      const name = `seed${s.seed}-${cut.cutId}-${cut.shotId}-${mid.toFixed(1)}s.png`;
      const g = await grab(browser, path.join(SHOTS, name));
      captured.push({
        seed: s.seed, role: s.role, cutId: cut.cutId, shotId: cut.shotId,
        raceDisplaySec: +mid.toFixed(2), auditSec: +(mid + INTRO_SEC).toFixed(2),
        seedInputValue: Number(seedNow), ...meta, ...g,
      });
      console.log(`  seed ${s.seed} ${cut.cutId} ${cut.shotId} @${mid.toFixed(1)}s → ${name}`);
    }
  }
} finally {
  await browser.close();
}

writeFileSync(path.join(OUT, 'race-captures.json'), JSON.stringify({
  base: BASE, introSec: INTRO_SEC,
  note: '★実ブラウザの通常 Broadcast V2 から、EDL の各カットの中央を 1 枚ずつ撮ったもの（§3）。',
  captured,
}, null, 2));
console.log(`\n撮影 ${captured.length} 枚 → ${path.join(OUT, 'race-captures.json')}`);
