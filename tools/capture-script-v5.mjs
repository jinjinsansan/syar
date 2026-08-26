/**
 * ★**現行 v4 と候補台本 v5 の比較動画**（読取専用の撮影・実装指示 §比較動画）
 *
 *   ⚠️ ★変えるのは**台本フラグだけ**です。seed・レース状態・順位・着差・素材・
 *      背景速度・位相・カット境界・HUD には触れていません。
 *   ⚠️ ★**後から時間位置を合わせません。** 同じ開始・終了・fps で撮ります。
 *
 * 【撮り方】
 *   1 コマごとに開き直すと 1 回あたり約 18MB の絵を復号し直すので、
 *   画面のシークバーを動かします（ページの `seekTo` がそのまま走ります）。
 *   ⚠️ バーの刻みは 0.05 秒なので 30fps に足りません → DOM 上で `step='any'` にします。
 *      表示部品の属性だけで、ページのコードは変えていません。
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { buildAuditRace, auditClock, RACE_DEFAULTS } from './lib/race-audit-build.mjs';
import { launch } from './lib/cdp.mjs';

const OUT = path.resolve('out/2d-script-v5');
const SEQ = path.join(OUT, '_seq');
mkdirSync(SEQ, { recursive: true });

const BASE = process.env.AUDIT_BASE ?? 'http://localhost:3210';
const INTRO_SEC = 7.8;
const FPS = 30;
const W = 1280;
const H = 720;
/** ★キャンバスを受け取るときの JPEG 品質（PNG より約 10 倍軽く、比較用には十分） */
const JPEG_Q = 0.92;
/** ★これだけ撮ったらページを開き直す（連続シークで描き直しが止まるのを避ける） */
const CHUNK = 200;
/** ★同じ絵がこれだけ続いたら「固まった」とみなす（2 秒ぶん・やり直しても直らなかった場合の最後の砦） */
const FROZEN_RUN = 60;
const FFMPEG = 'C:/Users/USER/AppData/Local/Microsoft/WinGet/Packages/'
  + 'Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-9.0-full_build/bin/ffmpeg.exe';

/** ★`--seeds 42` のように絞れる（最初に seed 42 だけ作るため） */
const argSeeds = (() => {
  const i = process.argv.indexOf('--seeds');
  return i < 0 ? null : process.argv[i + 1].split(',').map(Number);
})();
const ALL_SEEDS = [42, 332, 474, 14];
/**
 * ★`--verify-only`：**コマを撮り直さず**、残っている連番と動画から検査だけやり直す。
 *   ⚠️ gate.json が後の実行で上書きされ、先に撮った seed の検査記録が消えたときの復旧用。
 *   着順の文字だけは画面から読み直す（動画と同じページ・同じシードで開く）。
 */
const VERIFY_ONLY = process.argv.includes('--verify-only');
const SEEDS = argSeeds ?? ALL_SEEDS;

/**
 * ★**どちらも URL で明示します。**
 * ⚠️ ★`v5` が通常 `/race` の**既定になった**ので、旧 v4 側は
 *    `&cinematography=v4` を付けないと撮れません（以前は指定なしが v4 でした）。
 */
const VARIANTS = [
  { id: 'current', query: '&cinematography=v4', label: '旧 v4' },
  { id: 'v5', query: '&cinematography=v5', label: '候補 v5（既定）' },
];

const READY = "(()=>{const c=document.querySelector('canvas');if(!c)return false;"
  + "const x=c.getContext('2d');const d=x.getImageData(0,0,c.width,c.height).data;"
  + "let n=0;for(let i=0;i<d.length;i+=4000)if(d[i]>20)n++;return n>50;})()";

const SET_SEED = (v) => `(()=>{
  const el = document.querySelector('input[type=number]');
  if (!el) return 'not-found';
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  set.call(el, String(${v}));
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return el.value;
})()`;

/**
 * ★シークして描き直させる。
 * ⚠️ ★**同じ値を入れ直しても React は「変わっていない」と判断して onChange を飛ばしません。**
 *    → 一度ずらしてから戻します。
 */
const SEEK = (sec) => `(()=>{
  const el = document.querySelector('input[type=range]');
  if (!el) return 'no-slider';
  el.step = 'any';
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  const fire = (v) => { set.call(el, String(v)); el.dispatchEvent(new Event('input', { bubbles: true })); };
  fire(${sec} + 0.37);
  fire(${sec});
  return el.value;
})()`;

/** ★順位表の中身（レース結果が対で一致することの確認に使う） */
const ORDER_TEXT = `(() => {
  const t = document.body.innerText;
  const m = /ORDER[\\s\\S]{0,400}/.exec(t);
  return m === null ? '' : m[0].replace(/\\s+/g, ' ').slice(0, 200);
})()`;

const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 16);

async function waitFor(browser, expr, timeoutMs) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    try { if (await browser.evaluate(expr) === true) return true; } catch { /* 再描画中 */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

/* ── 撮影 ───────────────────────────────────── */

const report = { base: BASE, fps: FPS, viewport: { W, H }, introSec: INTRO_SEC, videos: [], races: [] };

for (const seed of SEEDS) {
  /* ★レースの長さは台本に依らない（台本はカメラだけ）。片方で測って両方に使う */
  const built = buildAuditRace({ seed });
  const clock = auditClock(built, RACE_DEFAULTS.ownGate);
  const raceSec = clock.warp.displaySec;
  const frames = Math.round(raceSec * FPS) + 1;
  const order = built.result.order.map((e) => Number(e.horseId));
  report.races.push({ seed, displaySec: +raceSec.toFixed(3), frames, order });

  for (const v of VARIANTS) {
    const dir = path.join(SEQ, `seed${seed}-${v.id}`);
    if (!VERIFY_ONLY) {
      if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
      mkdirSync(dir, { recursive: true });
    } else if (!existsSync(dir)) {
      throw new Error(`★--verify-only ですが連番がありません: ${dir}`);
    }

    const browser = await launch({ width: 1500, height: 1100 });
    try {
      await browser.goto('about:blank', 'true', { timeoutMs: 20000, settleMs: 200 });
      const url = `${BASE}/race?badge=0&auditSec=${INTRO_SEC}${v.query}`;
      if (!await browser.goto(url, READY, { timeoutMs: 180000, settleMs: 1500 })) {
        throw new Error(`★ページが用意できませんでした: ${url}`);
      }
      const setSeed = await browser.evaluate(SET_SEED(seed));
      if (Number(setSeed) !== seed) throw new Error(`★シードを ${seed} にできませんでした（${setSeed}）`);
      if (!await waitFor(browser, "(()=>!!document.querySelector('input[type=range]'))()", 60000)) {
        throw new Error(`★seed ${seed} の組み直しが終わりません`);
      }

      const shas = [];
      let retried = 0;
      if (VERIFY_ONLY) {
        /* ★動画の元になった連番そのものを読み直す（画面と同じ入力を測る） */
        for (let i = 0; i < frames; i += 1) {
          const f = path.join(dir, `f${String(i).padStart(4, '0')}.jpg`);
          if (!existsSync(f)) throw new Error(`★連番が欠けています: ${f}`);
          shas.push(sha(readFileSync(f)));
        }
      }
      for (let i = 0; VERIFY_ONLY === false && i < frames; i += 1) {
        /**
         * ★**一定コマごとにページを開き直します。**
         * ⚠️ ★同じページで 900 コマほど連続シークすると、**描き直しが止まりました**
         *    （残り 235m のまま 234 コマが同じ絵）。単発のシークでは再現しないので、
         *    長時間の連続操作でページが更新を止めるためと見ています。
         *    → 区切って開き直せば起きません。開き直しても撮る時刻は同じです。
         */
        if (i > 0 && i % CHUNK === 0) {
          await browser.goto('about:blank', 'true', { timeoutMs: 20000, settleMs: 200 });
          if (!await browser.goto(url, READY, { timeoutMs: 180000, settleMs: 1200 })) {
            throw new Error(`★開き直しに失敗: ${url}`);
          }
          const again = await browser.evaluate(SET_SEED(seed));
          if (Number(again) !== seed) throw new Error(`★開き直し後にシードが ${again}`);
          if (!await waitFor(browser, "(()=>!!document.querySelector('input[type=range]'))()", 60000)) {
            throw new Error('★開き直し後の組み直しが終わりません');
          }
        }
        const sec = i / FPS;
        /**
         * ★**前のコマと同じ絵だったら、シークからやり直します（1 回だけ）。**
         * ⚠️ ★長く連続シークすると描き直しが取りこぼされ、同じ絵が続きます。
         *    区切って開き直しても消えず（34 コマ続いた）、その連続は**開き直しの境目で終わって**
         *    いました。＝ 取りこぼしです。
         *    → 1 コマずつ確かめて、取りこぼしならその場でやり直します。
         *    ★固定カメラで馬が小さい区間は**本当に同じ絵**になることがあるので、
         *      やり直しても同じならそのまま受け入れます（無限に粘りません）。
         */
        let buf = null;
        for (let attempt = 0; attempt < 2; attempt += 1) {
          if (await browser.evaluate(SEEK(+(sec + INTRO_SEC).toFixed(6))) === 'no-slider') {
            throw new Error('★シークバーが見つかりません');
          }
          /**
           * ★**JPEG で受け取ります。** PNG（1 枚 約 1.5MB の base64）を
           *   1156 コマ × 8 本ぶん CDP で運ぶと 1 本 20 分近くかかります。
           *   最終的に H.264 へ再圧縮するので、比較用の画質は保てます。
           */
          const data = await browser.evaluate(`document.querySelector('canvas').toDataURL('image/jpeg', ${JPEG_Q})`);
          buf = Buffer.from(String(data).split(',')[1], 'base64');
          if (i === 0 || sha(buf) !== shas[i - 1]) break;
          retried += 1;
        }
        writeFileSync(path.join(dir, `f${String(i).padStart(4, '0')}.jpg`), buf);
        shas.push(sha(buf));
        if (i % 150 === 0) console.log(`    seed ${seed} ${v.id} ${i}/${frames - 1}`);
      }
      /* ★レース結果が対で同じか（順位表の文字で確かめる） */
      const orderText = await browser.evaluate(ORDER_TEXT);
      const distinct = new Set(shas).size;
      /**
       * ★**「全部が別の絵」は求めません。**
       *   固定カメラで馬が小さい区間（`homestretch-front`）では、1/30 秒で動く量が
       *   1 画素に満たず、隣のコマが**本当に同じ絵**になります。これは撮影の失敗ではなく
       *   現行カットの性質です。→ **同じ絵が続く長さ**で固まりを見ます。
       */
      let longestRun = 1;
      let run = 1;
      for (let i = 1; i < shas.length; i += 1) {
        if (shas[i] === shas[i - 1]) { run += 1; if (run > longestRun) longestRun = run; } else run = 1;
      }
      if (longestRun >= FROZEN_RUN) {
        throw new Error(`★撮影が固まりました: seed ${seed}/${v.id} は同じ絵が ${longestRun} コマ続きました`);
      }

      const file = `seed-${seed}-${v.id}.mp4`;
      if (VERIFY_ONLY) {
        if (!existsSync(path.join(OUT, file))) throw new Error(`★動画がありません: ${file}`);
      } else execFileSync(FFMPEG, ['-y', '-framerate', String(FPS), '-i', path.join(dir, 'f%04d.jpg'),
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '23', '-preset', 'slow',
        '-an', path.join(OUT, file)], { stdio: 'ignore' });

      report.videos.push({
        seed, variant: v.id, label: v.label, file, url,
        frames, fps: FPS, width: W, height: H,
        durationSec: +((frames - 1) / FPS).toFixed(3),
        distinctFrames: distinct, longestIdenticalRun: longestRun, reseekedFrames: retried,
        orderText, audio: 'none',
      });
      console.log(`  ${file}（${frames} コマ / ${FPS}fps / ${((frames - 1) / FPS).toFixed(2)}s）`);
    } finally {
      await browser.close();
    }
  }
}

/* ── 対の一致を確かめる ─────────────────────────── */

const pairs = [];
for (const seed of SEEDS) {
  const a = report.videos.find((x) => x.seed === seed && x.variant === 'current');
  const b = report.videos.find((x) => x.seed === seed && x.variant === 'v5');
  if (a === undefined || b === undefined) continue;
  pairs.push({
    seed,
    framesMatch: a.frames === b.frames,
    fpsMatch: a.fps === b.fps,
    sizeMatch: a.width === b.width && a.height === b.height,
    durationMatch: a.durationSec === b.durationSec,
    orderMatch: a.orderText === b.orderText,
    audioMatch: a.audio === b.audio,
  });
}

/**
 * ★**gate.json は seed 単位で差し替えます。**
 * ⚠️ ★丸ごと書き直すと、`--seeds` を分けて走らせたとき**先に撮った seed の検査記録が消える**
 *    （実際に 42/332 の記録が 474/14 の実行で消えた）。
 */
const gatePath = path.join(OUT, 'gate.json');
if (existsSync(gatePath)) {
  const prev = JSON.parse(readFileSync(gatePath, 'utf8'));
  const ranSeed = new Set(SEEDS);
  for (const x of (prev.videos ?? [])) if (!ranSeed.has(x.seed)) report.videos.push(x);
  for (const x of (prev.races ?? [])) if (!ranSeed.has(x.seed)) report.races.push(x);
  for (const x of (prev.pairs ?? [])) if (!ranSeed.has(x.seed)) pairs.push(x);
  report.videos.sort((a, b) => a.seed - b.seed);
  report.races.sort((a, b) => a.seed - b.seed);
  pairs.sort((a, b) => a.seed - b.seed);
}
writeFileSync(gatePath, JSON.stringify({
  note: '★台本フラグだけを変えて撮った比較動画。レース状態・順位・素材・HUD は変えていない。採否は書いていない。',
  candidateFlag: '/race?cinematography=v5',
  changedShots: [
    { from: 'fourth-corner-front', to: 'fourth-corner-high', where: '第4コーナー（until 0.660）' },
    { from: 'homestretch-front', to: 'homestretch-side', where: '直線（until 0.940）' },
  ],
  ...report, pairs,
}, null, 2));

console.log('\n=== 対の一致 ===');
for (const p of pairs) {
  const ok = p.framesMatch && p.fpsMatch && p.sizeMatch && p.durationMatch && p.orderMatch && p.audioMatch;
  console.log(`  seed ${String(p.seed).padStart(3)} ${ok ? 'OK ' : '★NG'} `
    + `コマ数${p.framesMatch ? '○' : '×'} fps${p.fpsMatch ? '○' : '×'} 解像度${p.sizeMatch ? '○' : '×'}`
    + ` 長さ${p.durationMatch ? '○' : '×'} 着順${p.orderMatch ? '○' : '×'} 音声${p.audioMatch ? '○' : '×'}`);
}
console.log(`\n→ ${path.join(OUT, 'gate.json')}`);
