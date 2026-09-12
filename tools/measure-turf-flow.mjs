/**
 * ★**芝の目が「どちらへ動くか」を測る**（★2026-09-12・★オーナー指摘③）
 *
 * 【★なぜ要るか】
 *   ★オーナー評「★**芝の目の動く方向**です。★馬が走る方向と垂直に、逆方向に動かないといけない。
 *   ★しかし ★**馬が走る方向と水平に**動いている」。
 *
 *   ⚠️ ★2026-09-11 は ★**静止画の角度だけ**を測って「案 A は効かない」と結論しました。
 *      ★**動きを一度も測っていません。** ★苦情は「動き」です（★台帳「指標が動いても苦情は残る」）。
 *
 * 【★何と何を比べるか — ★この画面の中だけで完結させます】
 *   ★地面には ★**2 系統**の模様があります:
 *     ★① 刈り目（`mow-stripes.ts`）… ★**世界座標**の多角形。★走路に貼り付いている（正しい）
 *     ★② 地面タイル（`world-turf.png`）… ★`world-textured.ts` が ★**カメラの軸**で貼る
 *   ★②の貼り付け座標は `u =（世界点・カメラの右）` `v =（世界点・カメラの前）` なので、
 *   ★**カメラが向きを変えると、地面の同じ場所の模様がずれます。**
 *
 *   → ★①は ★**低い周波数**（10m の帯）、★②は ★**高い周波数**（草の目）。
 *     ★同じ 2 コマを ★**低域と高域に分けて**それぞれの移動量を測れば、
 *     ★**片方だけが違う方向へ動いている**かどうかが、この画面の中だけで分かります。
 *   ★外から「正しい方向」を持ち込まないので、★カメラの式を信じる必要がありません。
 *
 * 【★測り方】★正規化相互相関（★平均を引いてから内積）で、★ずれ (dx,dy) を総当たり。
 *
 * 【⚠️ ★2026-09-12 の結果 — ★**この道具では答えが出ませんでした**】
 *   ★芝は ★**模様が周期的**です。★相関の山が何本も並ぶので、★最大の山が
 *   ★**探索の端に張り付いたり、刻みを変えると符号が反転したり**します。★実測:
 *
 *     ★dt 0.02 … ①dx **+18**（端） ②dx **−18**（端）
 *     ★dt 0.04 … ①dx **−18**（端） ②dx **+13**
 *     ★dt 0.10 … ①dx **−40**（端） ②dx **−34**（端）
 *
 *   ★同じ場所・同じ方法で ★**符号が入れ替わる**ので、★どの数字も採れません。
 * ⚠️ ★**この数字を「芝が別方向へ動いている証拠」として使わないこと。**
 *    ★端に張り付いた値と一致度の低い値は、★下の警告が必ず印字されます。★出たら結論を書かない。
 *
 * 【★それでも言えること（★コードを読めば分かる事実）】
 *   ★`world-textured.ts` の貼り付け座標は ★**カメラの軸**です。
 *   ★固定した地面の点でも、★カメラが向きを変えれば (u,v) が変わります
 *   ★＝ ★**模様は地面に貼り付いていません**。★これは測定ではなく、式がそう書いてあります。
 *   ★「それが画面でどう見えるか」は ★**オーナーの目で決めます**（★台帳「映像の真因はオーナー確認後に書く」）。
 *
 * 【★次に試すなら】★画素の相関ではなく、★**式から (u,v) の時間変化**を出すこと。
 *   ⚠️ ★そのとき `resolveBroadcastV2Scene` には ★**画面と同じ引数**を渡すこと
 *      （★2026-09-12 に省いて、★画面と違うカットを測りました・★R-31）。
 *
 * 【★使い方】
 *   node tools/measure-turf-flow.mjs                  … ★画面の既定
 *   node tools/measure-turf-flow.mjs --grain flat     … ★タイルを平した版（`?grain=flat`）と比べる
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { launch } from './lib/cdp.mjs';

const arg = (key, fallback) => {
  const i = process.argv.indexOf(`--${key}`);
  return i < 0 ? fallback : process.argv[i + 1];
};
const seed = Number(arg('seed', 42));
const grain = arg('grain', '');
/** ★2 コマの間隔（表示秒）。★短すぎると量子化で潰れ、長すぎると別の物が入り込む */
const DT = Number(arg('dt', 0.1));
const LOGICAL_W = 1280, LOGICAL_H = 720;
/** ★総当たりで探すずれの範囲（画素） */
const SEARCH = Number(arg('search', 40));

/**
 * ★**測る場所。** ★芝だけが写り、★探索の範囲（±40px）を足しても馬・HUD が入らないこと。
 * ⚠️ ★枠は `out/render-scale/probe/grid-*.png`（目盛り付きの全景）を見て決めました。
 */
const SAMPLES = [
  {
    sec: 37.0, cut: 'fourth-corner-far', note: '★4 コーナー（★地面は world-textured の走査線）',
    rect: { x: 940, y: 380, w: 220, h: 80 },
  },
  {
    sec: 51.0, cut: 'straight-contest', note: '★直線（★地面は parallax-plate の 1 枚貼り・★対照）',
    rect: { x: 430, y: 450, w: 220, h: 60 },
  },
];

const out = path.resolve('out/turf-flow');
mkdirSync(out, { recursive: true });

/** ★輝度（Rec.601） */
const lumaOf = (d, i) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];

/** ★画像を輝度の 2 次元配列にする */
function lumaPlane(img) {
  const c = createCanvas(img.width, img.height);
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  const { data } = g.getImageData(0, 0, img.width, img.height);
  const p = new Float64Array(img.width * img.height);
  for (let i = 0, k = 0; i < data.length; i += 4, k += 1) p[k] = lumaOf(data, i);
  return { p, w: img.width, h: img.height };
}

/** ★箱ぼかし（★低域を取り出す）。★半径 r */
function blur(plane, r) {
  const { p, w, h } = plane;
  const tmp = new Float64Array(w * h), outP = new Float64Array(w * h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      let s = 0, n = 0;
      for (let k = -r; k <= r; k += 1) {
        const xx = x + k; if (xx < 0 || xx >= w) continue;
        s += p[y * w + xx]; n += 1;
      }
      tmp[y * w + x] = s / n;
    }
  }
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      let s = 0, n = 0;
      for (let k = -r; k <= r; k += 1) {
        const yy = y + k; if (yy < 0 || yy >= h) continue;
        s += tmp[yy * w + x]; n += 1;
      }
      outP[y * w + x] = s / n;
    }
  }
  return { p: outP, w, h };
}

const sub = (a, b) => ({ p: a.p.map((v, i) => v - b.p[i]), w: a.w, h: a.h });

/**
 * ★A の矩形が、B の中でどこへ動いたか（★正規化相互相関の最大）。
 * ★戻り: `{ dx, dy, score }`（★`score` は −1〜1。★低いと「模様が無い＝測れない」）
 */
function shiftOf(A, B, rect) {
  const patch = [];
  let mean = 0;
  for (let y = 0; y < rect.h; y += 1) {
    for (let x = 0; x < rect.w; x += 1) {
      const v = A.p[(rect.y + y) * A.w + (rect.x + x)];
      patch.push(v); mean += v;
    }
  }
  mean /= patch.length;
  let normA = 0;
  for (let i = 0; i < patch.length; i += 1) { patch[i] -= mean; normA += patch[i] * patch[i]; }
  normA = Math.sqrt(normA);
  if (normA < 1e-9) return { dx: 0, dy: 0, score: 0 };

  let best = { dx: 0, dy: 0, score: -2 };
  for (let dy = -SEARCH; dy <= SEARCH; dy += 1) {
    for (let dx = -SEARCH; dx <= SEARCH; dx += 1) {
      const x0 = rect.x + dx, y0 = rect.y + dy;
      if (x0 < 0 || y0 < 0 || x0 + rect.w > B.w || y0 + rect.h > B.h) continue;
      let m2 = 0;
      for (let y = 0; y < rect.h; y += 1) {
        for (let x = 0; x < rect.w; x += 1) m2 += B.p[(y0 + y) * B.w + (x0 + x)];
      }
      m2 /= rect.w * rect.h;
      let dot = 0, normB = 0, i = 0;
      for (let y = 0; y < rect.h; y += 1) {
        for (let x = 0; x < rect.w; x += 1, i += 1) {
          const v = B.p[(y0 + y) * B.w + (x0 + x)] - m2;
          dot += patch[i] * v; normB += v * v;
        }
      }
      normB = Math.sqrt(normB);
      const score = normB < 1e-9 ? 0 : dot / (normA * normB);
      if (score > best.score) best = { dx, dy, score };
    }
  }
  return best;
}

const degOf = (dx, dy) => (Math.atan2(-dy, dx) * 180) / Math.PI;

const browser = await launch({ port: Number(arg('debug-port', 9499)), width: 1400, height: 1000, timeoutMs: 180000 });
try {
  await browser.send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 1600, deviceScaleFactor: 1, mobile: false });
  const url = `http://localhost:3210/race?dev=1&badge=0&seed=${seed}&auditSec=0${grain === '' ? '' : `&grain=${grain}`}`;
  const ready = await browser.goto(url, `(() => !!document.querySelector('input[aria-label="撮影用シーク"]'))()`,
    { timeoutMs: 180000, settleMs: 2500 });
  if (!ready) throw new Error(`★レースが開きませんでした: ${url}`);
  console.log(`★URL ${url}`);

  const rect = await browser.evaluate(`(() => { const e=document.querySelector('canvas'); const r=e.getBoundingClientRect();
    return { x:r.x+scrollX, y:r.y+scrollY, w:r.width, h:r.height, dpr:devicePixelRatio, buf:[e.width,e.height] }; })()`);

  const frameAt = async (sec) => {
    let r = null;
    for (let i = 0; i < 60; i += 1) {
      r = await browser.evaluate(`(async () => {
        const el = document.querySelector('input[aria-label="撮影用シーク"]');
        const k = Object.keys(el).find(x => x.startsWith('__reactProps$'));
        el.step='any'; el[k].onChange({ target:{ value:'${sec}' } });
        await new Promise(r=>setTimeout(r,200));
        return { sec:Number(el.value), diag: window.__raceDiag ? window.__raceDiag.shot : null };
      })()`);
      if (Math.abs(r.sec - sec) <= 0.06 && r.diag !== null) break;
    }
    /** ★画布の画素と 1:1（★`clip.scale` には dpr が掛かるので割る） */
    const png = await browser.send('Page.captureScreenshot', {
      format: 'png', captureBeyondViewport: false,
      clip: { x: rect.x, y: rect.y, width: rect.w, height: rect.h, scale: rect.buf[0] / (rect.w * rect.dpr) },
    });
    return { img: await loadImage(Buffer.from(png.data, 'base64')), shot: r?.diag ?? null };
  };

  const rows = [];
  for (const s of SAMPLES) {
    const a = await frameAt(s.sec);
    const b = await frameAt(s.sec + DT);
    if (a.shot !== s.cut || b.shot !== s.cut) {
      console.warn(`⚠️ ★${s.sec} 秒のカットが ${a.shot} / ${b.shot} です（★表では ${s.cut}）`);
    }
    /** ★論理座標の枠 → ★撮れた絵の枠 */
    const k = a.img.width / LOGICAL_W;
    const R = {
      x: Math.round(s.rect.x * k), y: Math.round(s.rect.y * (a.img.height / LOGICAL_H)),
      w: Math.round(s.rect.w * k), h: Math.round(s.rect.h * (a.img.height / LOGICAL_H)),
    };
    const A = lumaPlane(a.img), B = lumaPlane(b.img);
    /** ★低域＝刈り目（①）／★高域＝タイルの草の目（②） */
    const AL = blur(A, 8), BL = blur(B, 8);
    const AH = sub(A, AL), BH = sub(B, BL);
    const low = shiftOf(AL, BL, R);
    const high = shiftOf(AH, BH, R);
    rows.push({ ...s, low, high });
    console.log(`\n★${s.sec} 秒（${a.shot}）  ${s.note}`);
    console.log(`  ★① 刈り目（低域・世界座標に貼ってある）  dx ${String(low.dx).padStart(4)} dy ${String(low.dy).padStart(4)}  角 ${degOf(low.dx, low.dy).toFixed(1)}°  一致度 ${low.score.toFixed(3)}`);
    console.log(`  ★② 草の目（高域・タイル）              dx ${String(high.dx).padStart(4)} dy ${String(high.dy).padStart(4)}  角 ${degOf(high.dx, high.dy).toFixed(1)}°  一致度 ${high.score.toFixed(3)}`);
    const d = Math.abs(((degOf(low.dx, low.dy) - degOf(high.dx, high.dy)) + 540) % 360 - 180);
    console.log(`  → ★向きの差 ${d.toFixed(1)}°${d > 20 ? '  ⚠️ ★別の方向へ動いています' : '  ★同じ方向です'}`);
    /**
     * ⚠️ ★**探索の端に張り付いていたら、その値は切り捨てられています。**
     *    ★2026-09-12 に 1 度、★`dx = -40`（＝端）のまま「①は 40px・②は 17px」と
     *    ★比べかけました。★真の値はもっと大きいので、★比は嘘になります。
     */
    const lenL = Math.hypot(low.dx, low.dy), lenH = Math.hypot(high.dx, high.dy);
    const clipped = [low, high].some((v) => Math.abs(v.dx) >= SEARCH || Math.abs(v.dy) >= SEARCH);
    if (clipped) console.log(`  ⚠️ ★探索の端（±${SEARCH}px）に達しました。★--dt を小さくして測り直すこと`);
    else console.log(`  → ★動いた量 ①${lenL.toFixed(1)}px ／ ②${lenH.toFixed(1)}px`
      + `（★比 ${lenL < 1e-6 ? '—' : (lenH / lenL).toFixed(2)}。★地面に貼ってあるなら 1.00 のはず）`);
    if (Math.min(low.score, high.score) < 0.5) {
      console.log(`  ⚠️ ★一致度が低い側があります（①${low.score.toFixed(2)} ②${high.score.toFixed(2)}）。★模様が薄く、★測れていない可能性`);
    }

    /** ★測った所を残す（★何を見たかが後から分かるように） */
    const crop = createCanvas(R.w, R.h);
    crop.getContext('2d').drawImage(a.img, R.x, R.y, R.w, R.h, 0, 0, R.w, R.h);
    writeFileSync(path.join(out, `patch-${s.sec}${grain === '' ? '' : `-${grain}`}.png`), crop.toBuffer('image/png'));
  }
  writeFileSync(path.join(out, `flow${grain === '' ? '' : `-${grain}`}.json`), JSON.stringify(rows, null, 2));
  console.log(`\n★書き出し ${out}`);
} finally { await browser.close(); }
process.exit(0);
