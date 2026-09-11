/**
 * ★**画面の細かさを測る**（★2026-09-12・★引継ぎ書 `HANDOVER_P4_RENDER_SCALE_20260912.md` §3）
 *
 * 【★なぜ要るか】
 *   ⚠️ ★2026-09-11〜12 は ★**測り方を持たないまま滲みを直そうとして 3 回壊しました**。
 *      ★`?render=2x` は「文字が 2.72 倍細かくなった」だけを見て出し、
 *      ★**芝とスタンドが破綻していたのに気づけず**、オーナー評「壊したのですか？」を頂きました。
 *   → ★**直す前にこれを作り、直す前後で同じものを測る。**
 *
 * 【★測る 4 つ】★引継ぎ書 §3 の項目とそのまま対応します。
 *   ① 細かさ … ★芝・馬・文字の 3 か所を、★**同じ表示の大きさ**で測る（★芝が下がったら不合格）
 *   ② 同じ絵 … ★画布の中身を 1280 に揃えて比べ、★**平均 2 階調未満**（★＝縁の滑らかさだけ）
 *   ③ 検定   … ★`npm test` と `npm run typecheck`（★この道具の外で実行）
 *   ④ 速度   … ★再生中の実コマ数（★画素数が増えてコマ落ちしないか）
 *
 * 【★この道具の作法】
 *   ⚠️ ★**画面の既定のまま開きます。** ★`?dev=1&badge=0&seed=&auditSec=0` 以外を渡しません（★R-31）。
 *   ⚠️ ★**オーナーの画面と同じ条件で測ります** … ★頁の上で ★**1152 CSS px・dpr 1.5**
 *      （★引継ぎ書 F-1 の実測値）。★窓の幅は ★**測って合わせます**（★手置きしない）。
 *   ⚠️ ★**絵は `Page.captureScreenshot`、★画布の中身は `toDataURL`** で受け取ります。
 *      ★前者は「★画面に出ている物理画素」、★後者は「★画布が持っている画素」で、★別物です。
 *      ★① は前者で、★② は後者で測ります。
 *   ★ブラウザは ★**ヘッドレス**（★`lib/cdp.mjs` の既定・★T-7）。
 *
 * 【★使い方】
 *   node tools/measure-render-scale.mjs --probe            … ★下見（★どこを測るか決めるための全景）
 *   node tools/measure-render-scale.mjs --label before     … ★直す前の基準値
 *   node tools/measure-render-scale.mjs --label after      … ★直した後（★before と突き合わせて合否を出す）
 *
 * 【★出すもの】★`out/render-scale/<label>/`
 *   `display-<sec>.png`  … ★画面に出ている物理画素そのまま
 *   `canvas-<sec>.png`   … ★画布の中身（★② 用）
 *   `crop-<sec>-<名>.png`… ★① で実際に測った切り出し（★**測った所が目で確かめられるように**）
 *   `metrics.json`       … ★数値
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { launch } from './lib/cdp.mjs';

const arg = (key, fallback) => {
  const i = process.argv.indexOf(`--${key}`);
  return i < 0 ? fallback : process.argv[i + 1];
};
const probe = process.argv.includes('--probe');
/**
 * ★**戻し口を通して測る**（★`?dpr=1`）。
 *
 * ★これは ★**製品が持っている口**です（★`pixelScaleFromSearch`）。
 * ★`before`（★直す前）と突き合わせると、★**「戻し口が本当に元の絵に戻るか」**が分かります。
 * ⚠️ ★検定の②（★倍率 1 なら指定なしと一致）は ★**新しいコード同士**の比較でしかありません。
 *    ★元のコードと同じかどうかは、★こうして実画面で確かめるしかありません。
 */
const revert = process.argv.includes('--revert');
const label = arg('label', probe ? 'probe' : revert ? 'revert' : '');
const seed = Number(arg('seed', 42));
/**
 * ★**オーナーの画面の実測値**（★引継ぎ書 F-1）。
 * ⚠️ ★ここを変えると「誰の画面の話か」が変わります。★before と after で必ず同じにすること。
 */
const CSS_W = Number(arg('css-width', 1152));
const DPR = Number(arg('dpr', 1.5));
/** ★画布の論理の大きさ（★`page.tsx` の `W` / `H`）。★切り出しの枠はこの座標で書きます */
const LOGICAL_W = 1280, LOGICAL_H = 720;

/**
 * ★**いつ・どこを測るか。**
 *
 *   ★秒は `out/race-through/cuts.md`（★通し 86 秒・16 カット）から選びました。
 *   ★枠は ★**論理座標（1280x720）**で書き、★表示の大きさへ掛けて使います。
 *   ⚠️ ★`--probe` で全景を出し、★**目で見て**決めた枠です。★中身が変わったら取り直すこと。
 */
const SAMPLES = [
  /**
   * ★**真横の道中**（★合格済みのカット）。★地面は `parallax-plate.ts` の ★**1 枚貼り**（★F-4）。
   *   ⚠️ ★ここの芝は ★**走査線ループを通りません**。★画布を大きくすれば自動で追随するはずの側です。
   */
  {
    sec: 30.0, cut: 'side-drive',
    regions: {
      芝: { x: 340, y: 435, w: 290, h: 50 },
      馬: { x: 459, y: 259, w: 133, h: 89 },
      文字: { x: 940, y: 74, w: 304, h: 163 },
    },
  },
  /**
   * ★**4 コーナー**。★地面は `world-textured.ts` の ★**走査線ループ**（★F-3）。
   *   ★①（★走査線を物理画素で回す）が効くのは ★**ここの芝**です。
   */
  {
    sec: 38.0, cut: 'fourth-corner-far',
    regions: {
      芝: { x: 930, y: 372, w: 255, h: 100 },
      馬: { x: 704, y: 259, w: 170, h: 111 },
      文字: { x: 940, y: 74, w: 304, h: 163 },
    },
  },
  /** ★**最後の直線**（★オーナー「とりあえず OK」の画）。★HUD が少なく、★馬が大きい */
  {
    sec: 51.0, cut: 'straight-contest',
    regions: {
      芝: { x: 415, y: 444, w: 252, h: 74 },
      馬: { x: 911, y: 281, w: 126, h: 74 },
      文字: { x: 1090, y: 605, w: 160, h: 85 },
    },
  },
];

const outRoot = path.resolve('out/render-scale');
const out = path.join(outRoot, label === '' ? 'probe' : label);
if (label === '') {
  console.error('★`--label before` か `--label after`、または `--probe` を渡してください');
  process.exit(1);
}
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

/** ★輝度（★Rec.601）。★細かさは色ではなく明暗の刻みで測ります */
const lumaOf = (data, i) => 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];

/**
 * ★**細かさ** … ★輝度のラプラシアンの絶対値の平均（★0〜255 の刻み）。
 *
 *   ★隣の画素との差が大きいほど大きくなります。★引き伸ばした絵は隣が似てくるので下がります。
 * ⚠️ ★**同じ表示の大きさで比べたときだけ意味を持ちます。** ★大きさが違えば別物です。
 */
function sharpness(img, rect) {
  const c = createCanvas(rect.w, rect.h);
  const g = c.getContext('2d');
  g.drawImage(img, rect.x, rect.y, rect.w, rect.h, 0, 0, rect.w, rect.h);
  const { data } = g.getImageData(0, 0, rect.w, rect.h);
  let sum = 0, n = 0;
  for (let y = 1; y < rect.h - 1; y += 1) {
    for (let x = 1; x < rect.w - 1; x += 1) {
      const i = (y * rect.w + x) * 4;
      const lap = 4 * lumaOf(data, i)
        - lumaOf(data, i - 4) - lumaOf(data, i + 4)
        - lumaOf(data, i - rect.w * 4) - lumaOf(data, i + rect.w * 4);
      sum += Math.abs(lap); n += 1;
    }
  }
  return { value: n === 0 ? 0 : sum / n, canvas: c };
}

/** ★2 枚の平均の差（★0〜255）。★② 同じ絵であることの判定に使う */
function meanAbsDiff(a, b) {
  if (a.width !== b.width || a.height !== b.height) {
    throw new Error(`★大きさが違います ${a.width}x${a.height} と ${b.width}x${b.height}`);
  }
  const ga = createCanvas(a.width, a.height).getContext('2d');
  const gb = createCanvas(b.width, b.height).getContext('2d');
  ga.drawImage(a, 0, 0); gb.drawImage(b, 0, 0);
  const da = ga.getImageData(0, 0, a.width, a.height).data;
  const db = gb.getImageData(0, 0, b.width, b.height).data;
  let sum = 0, n = 0, max = 0;
  /**
   * ★**差の地図も出します**（★2026-09-12）。
   * ⚠️ ★「平均 1.4・最大 238」を数字だけで「縁の滑らかさです」と言い切らないこと。
   *    ★**版面が動いた**のか ★**縁だけ**なのかは、★地図を見れば分かります（★台帳「交絡を潰してから印と呼ぶ」）。
   */
  const map = createCanvas(a.width, a.height);
  const gm = map.getContext('2d');
  const out = gm.createImageData(a.width, a.height);
  for (let i = 0; i < da.length; i += 4) {
    let worst = 0;
    for (let k = 0; k < 3; k += 1) {
      const d = Math.abs(da[i + k] - db[i + k]);
      sum += d; n += 1; if (d > max) max = d;
      if (d > worst) worst = d;
    }
    const v = Math.min(255, worst * 4);            // ★4 倍に強調して見やすくする
    out.data[i] = v; out.data[i + 1] = v; out.data[i + 2] = v; out.data[i + 3] = 255;
  }
  gm.putImageData(out, 0, 0);
  return { mean: sum / n, max, map };
}

/** ★1280 幅へ揃える（★② は「同じ版面か」を見るので、★細かい方を縮めて比べます） */
async function toLogicalSize(img) {
  if (img.width === LOGICAL_W && img.height === LOGICAL_H) return img;
  const c = createCanvas(LOGICAL_W, LOGICAL_H);
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0, img.width, img.height, 0, 0, LOGICAL_W, LOGICAL_H);
  return await loadImage(c.toBuffer('image/png'));
}

const browser = await launch({ port: Number(arg('debug-port', 9481)), width: 1600, height: 1200, timeoutMs: 180000 });
const errors = [];
browser.on('Runtime.exceptionThrown', e => errors.push(e.exceptionDetails));

try {
  /**
   * ★**窓の大きさを、画布が 1152 CSS px になるまで合わせます。**
   * ⚠️ ★画布は `width:100%; max-width:1280` なので、★頁の余白ぶん窓は広く要ります。
   *    ★何 px 広いかは版面次第なので ★**測って詰めます**（★手置きしない）。
   */
  let viewportW = CSS_W + 80;
  await browser.send('Emulation.setDeviceMetricsOverride', {
    width: Math.round(viewportW), height: 1200, deviceScaleFactor: DPR, mobile: false,
  });

  const url = `http://localhost:3210/race?dev=1&badge=0&seed=${seed}&auditSec=0${revert ? '&dpr=1' : ''}`;
  const ready = await browser.goto(url, `(() => {
    const c = document.querySelector('canvas');
    const s = document.querySelector('input[aria-label="撮影用シーク"]');
    return !!c && !!s;
  })()`, { timeoutMs: 180000, settleMs: 2500 });
  if (!ready) throw new Error(`★レースが開きませんでした: ${url}`);

  const rectOf = () => browser.evaluate(`(() => {
    const el = document.querySelector('canvas');
    const r = el.getBoundingClientRect();
    return { x: r.x + window.scrollX, y: r.y + window.scrollY, w: r.width, h: r.height,
      dpr: window.devicePixelRatio, buffer: [el.width, el.height] };
  })()`);

  let rect = await rectOf();
  for (let i = 0; i < 8 && Math.abs(rect.w - CSS_W) > 0.5; i += 1) {
    viewportW += CSS_W - rect.w;
    await browser.send('Emulation.setDeviceMetricsOverride', {
      width: Math.round(viewportW), height: 1200, deviceScaleFactor: DPR, mobile: false,
    });
    rect = await rectOf();
  }
  if (Math.abs(rect.w - CSS_W) > 1) {
    throw new Error(`★画布を ${CSS_W} CSS px に合わせられませんでした（★いま ${rect.w}）`);
  }
  const displayW = Math.round(rect.w * rect.dpr);
  const displayH = Math.round(rect.h * rect.dpr);
  console.log(`★頁の上の画布 ${rect.w}x${rect.h} CSS px ／ dpr ${rect.dpr}`);
  console.log(`★画面に出る物理画素 ${displayW}x${displayH}（★これが「オーナーが見ている絵」です）`);
  console.log(`★（★開いた直後の画布は ${rect.buffer.join('x')}。★実際の大きさは描かれた後に読みます）`);

  /** ★論理座標（1280x720）の枠を、★表示の物理画素の枠へ移す */
  const toDisplay = (r) => ({
    x: Math.round(r.x * displayW / LOGICAL_W), y: Math.round(r.y * displayH / LOGICAL_H),
    w: Math.round(r.w * displayW / LOGICAL_W), h: Math.round(r.h * displayH / LOGICAL_H),
  });

  const metrics = {
    label, seed, at: new Date().toISOString(),
    screen: { cssW: rect.w, cssH: rect.h, dpr: rect.dpr, buffer: rect.buffer, displayW, displayH },
    samples: [],
  };

  /**
   * ★**その秒へ送って、★本当にその秒が描かれるまで待つ。**
   *
   * ⚠️ ★1 度で決めてはいけません。★`/race` は ★**素材を読み終えた時点で `auditSec`（＝0）を
   *    もう一度当てます**（`page.tsx` の `auditSeekAppliedRef`）。★読み込み中に送った秒は
   *    ★**黙って 0 に戻されます**（★2026-09-12 に踏みました。★30 秒を送ったのに次は 0 でした）。
   * → ★送ったあと ★**秒と `__raceDiag` の両方**を確かめ、★駄目なら送り直します。
   */
  const seekTo = async (sec) => {
    for (let i = 0; i < 60; i += 1) {
      const r = await browser.evaluate(`(async () => {
        const el = document.querySelector('input[aria-label="撮影用シーク"]');
        const k = Object.keys(el).find(x => x.startsWith('__reactProps$'));
        el.step = 'any';
        el[k].onChange({ target: { value: '${sec}' } });
        await new Promise(r => setTimeout(r, 200));
        const c = document.querySelector('canvas');
        return { sec: Number(el.value), max: Number(el.max), diag: window.__raceDiag ?? null,
          buffer: [c.width, c.height] };
      })()`);
      if (Math.abs(r.sec - sec) <= 0.06 && r.diag !== null) return r;
      if (r.max < sec) throw new Error(`★尺が ${r.max} 秒しかありません（★${sec} 秒を測れません）`);
    }
    throw new Error(`★${sec} 秒に留まりませんでした（★素材の読み込みが終わっていない可能性）`);
  };

  for (const sample of SAMPLES) {
    const r = await seekTo(sample.sec);
    const shot = r.diag?.shot ?? '（不明）';
    if (shot !== sample.cut) {
      console.warn(`⚠️ ★${sample.sec} 秒のカットが ${shot} です（★表では ${sample.cut}）。★台本が動いた可能性`);
    }

    /** ★① 用 … ★画面に出ている物理画素（★`clip.scale` には dpr が掛かるので 1 を渡す・★T-6） */
    const shotPng = await browser.send('Page.captureScreenshot', {
      format: 'png', captureBeyondViewport: false,
      clip: { x: rect.x, y: rect.y, width: rect.w, height: rect.h, scale: 1 },
    });
    const display = await loadImage(Buffer.from(shotPng.data, 'base64'));
    if (display.width !== displayW) {
      throw new Error(`★撮れた絵が ${display.width}px です。★${displayW}px になりません（★T-6）`);
    }
    writeFileSync(path.join(out, `display-${sample.sec}.png`), Buffer.from(shotPng.data, 'base64'));

    /** ★② 用 … ★画布が持っている画素そのもの（★画面の引き伸ばしを通さない） */
    const canvasDataUrl = await browser.evaluate(`document.querySelector('canvas').toDataURL('image/png')`);
    const canvasBuf = Buffer.from(canvasDataUrl.split(',')[1], 'base64');
    writeFileSync(path.join(out, `canvas-${sample.sec}.png`), canvasBuf);

    /**
     * ⚠️ ★**画布の大きさは「描かれた後」に読むこと**（★2026-09-12 に間違えました）。
     *    ★頁を開いた直後の画布は ★**JSX が焼いた 1280x720 のまま**です。★実際の大きさは
     *    ★素材が揃って `render` が動いてから決まります。★開いた直後に読んだ値で報告すると、
     *    ★**「画布 1280x720 → 1280x720」という嘘**を印字します（★実際に印字しました）。
     */
    const row = { sec: sample.sec, cut: shot, buffer: r.buffer, regions: {} };
    for (const [name, box] of Object.entries(sample.regions)) {
      const d = toDisplay(box);
      const s = sharpness(display, d);
      row.regions[name] = { logical: box, display: d, sharpness: Number(s.value.toFixed(3)) };
      writeFileSync(path.join(out, `crop-${sample.sec}-${name}.png`), s.canvas.toBuffer('image/png'));
    }
    metrics.samples.push(row);
    console.log(`★${sample.sec} 秒（${shot}）  ${Object.entries(row.regions).map(([k, v]) => `${k} ${v.sharpness.toFixed(2)}`).join(' ／ ') || '★枠の指定なし（下見）'}`);

    if (probe) {
      /** ★下見: ★論理座標の目盛りを焼いた版も出す（★枠を決めるため。★測定には使いません） */
      const c = createCanvas(display.width, display.height);
      const g = c.getContext('2d');
      g.drawImage(display, 0, 0);
      g.font = 'bold 16px monospace'; g.textBaseline = 'top';
      for (let lx = 0; lx <= LOGICAL_W; lx += 160) {
        const x = lx * displayW / LOGICAL_W;
        g.strokeStyle = 'rgba(255,60,60,0.85)'; g.lineWidth = 1;
        g.beginPath(); g.moveTo(x, 0); g.lineTo(x, display.height); g.stroke();
        g.fillStyle = '#ff3c3c'; g.fillText(String(lx), x + 3, 2);
      }
      for (let ly = 0; ly <= LOGICAL_H; ly += 80) {
        const y = ly * displayH / LOGICAL_H;
        g.strokeStyle = 'rgba(60,160,255,0.85)'; g.lineWidth = 1;
        g.beginPath(); g.moveTo(0, y); g.lineTo(display.width, y); g.stroke();
        g.fillStyle = '#3ca0ff'; g.fillText(String(ly), 3, y + 2);
      }
      writeFileSync(path.join(out, `grid-${sample.sec}.png`), c.toBuffer('image/png'));
    }
  }

  /**
   * ★④ 速度 … ★再生させて ★**実際に出たコマ数**を数えます。
   *
   * ⚠️ ★ヘッドレスの数字です。★実機の GPU とは違います。
   * ⚠️ ★**別々に起こしたブラウザどうしで比べてはいけません。** ★同じ道具・同じ機械で
   *    ★31 / 56 / 49.7 / 53.3 コマ/秒と ★**振れました**（★2026-09-12 実測）。
   *    ★それは「画素数の代価」ではなく ★**相手の機嫌**を測っています。
   * → ★**同じセッションの中で、画布の大きさだけを変えて**測ります。
   *   ★`?dpr=1` は製品が持っている戻し口なので、★「引き伸ばしていた頃」の画素数を再現できます。
   */
  const fpsAt = async (sec, rounds) => {
    const got = [];
    for (let i = 0; i < rounds; i += 1) {
      await seekTo(sec);
      got.push(await browser.evaluate(`(async () => {
        const play = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === '演出開始');
        if (!play) return null;
        play.click();
        await new Promise(r => setTimeout(r, 500));
        const n = await new Promise(res => {
          let k = 0; const t0 = performance.now();
          const tick = () => { k += 1; if (performance.now() - t0 < 2000) requestAnimationFrame(tick); else res(k); };
          requestAnimationFrame(tick);
        });
        const stop = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === '停止');
        if (stop) stop.click();
        await new Promise(r => setTimeout(r, 200));
        return n / 2;
      })()`));
    }
    return got;
  };
  const med = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
  /** ★30 秒＝真横（板の地面）／★38 秒＝4 コーナー（★走査線の地面・★いちばん重い） */
  const speed = { 既定: {}, 'dpr=1': {} };
  for (const sec of [30, 38]) speed['既定'][sec] = await fpsAt(sec, 3);
  await browser.goto(`${url}&dpr=1`, `(() => !!document.querySelector('input[aria-label="撮影用シーク"]'))()`,
    { timeoutMs: 180000, settleMs: 2500 });
  for (const sec of [30, 38]) speed['dpr=1'][sec] = await fpsAt(sec, 3);
  metrics.speed = speed;
  const fps = med(speed['既定'][38]);
  /** ★描かれた後の画布の大きさ（★全ての秒で同じはず）。★報告はこちらを使う */
  const buffers = [...new Set(metrics.samples.map(s => s.buffer.join('x')))];
  if (buffers.length !== 1) throw new Error(`★画布の大きさが秒ごとに違います: ${buffers.join(' / ')}`);
  metrics.screen.buffer = metrics.samples[0].buffer;
  metrics.screen.upscale = Number((displayW / metrics.samples[0].buffer[0]).toFixed(3));
  console.log(`★画布（★描かれた後）${buffers[0]} ／ 画面へ ${metrics.screen.upscale} 倍`);

  metrics.fps = fps;
  for (const sec of [30, 38]) {
    const a = speed['既定'][sec], b = speed['dpr=1'][sec];
    console.log(`★速度 ${sec} 秒  画布 ${buffers[0]}: 中央値 ${med(a).toFixed(1)}（${a.map(v => v.toFixed(0)).join('/')}）`
      + `  ／  画布 1280x720（?dpr=1）: 中央値 ${med(b).toFixed(1)}（${b.map(v => v.toFixed(0)).join('/')}） コマ/秒`);
  }

  if (errors.length > 0) throw new Error(`★ブラウザが描画中に例外を出しました（${errors.length} 件）`);
  writeFileSync(path.join(out, 'metrics.json'), JSON.stringify(metrics, null, 2));
  console.log(`★書き出し ${path.join(out, 'metrics.json')}`);

  /**
   * ★**戻し口の照合** … ★`?dpr=1` が ★**直す前と同じ絵**を出すか。
   * ★ここが合えば、★「倍率 1 では 1 画素も変えていない」を ★**実画面で**言えます。
   */
  if (revert && existsSync(path.join(outRoot, 'before', 'metrics.json'))) {
    console.log('\n★───── ★戻し口 `?dpr=1` と「直す前」の照合 ─────');
    let worst = 0;
    for (const s of metrics.samples) {
      const a = await loadImage(path.join(out, `canvas-${s.sec}.png`));
      const b = await loadImage(path.join(outRoot, 'before', `canvas-${s.sec}.png`));
      const d = meanAbsDiff(a, b);
      worst = Math.max(worst, d.max);
      console.log(`  ${d.max === 0 ? '   一致' : '⚠️ 差あり'}  ${s.sec} 秒  平均 ${d.mean.toFixed(3)} 階調 ／ 最大 ${d.max}`);
    }
    console.log(worst === 0
      ? '★**1 画素も違いません。** ★倍率 1 は直す前と同一です'
      : `⚠️ ★差が残っています（最大 ${worst}）。★「1 画素も変えていない」とは書けません`);
  }

  /** ★after のときは before と突き合わせて、★引継ぎ書 §3 の合否をそのまま出す */
  const basePath = path.join(outRoot, 'before', 'metrics.json');
  if (label === 'after' && existsSync(basePath)) {
    const before = JSON.parse(readFileSync(basePath, 'utf8'));
    console.log('\n★───── ★引継ぎ書 §3 の判定 ─────');
    console.log(`★画布 ${before.screen.buffer.join('x')} → ${metrics.screen.buffer.join('x')}`);
    if (before.screen.displayW !== metrics.screen.displayW) {
      throw new Error('★表示の物理画素が before と違います。★同じ条件で測れていません');
    }

    console.log('\n★① 細かさ（★同じ表示の大きさ・★芝が下がったら不合格）');
    let ng = 0;
    for (const [i, s] of metrics.samples.entries()) {
      const b = before.samples[i];
      for (const [name, v] of Object.entries(s.regions)) {
        const bv = b?.regions?.[name]?.sharpness;
        if (bv === undefined) continue;
        const ratio = v.sharpness / bv;
        const bad = ratio < 1.0;
        if (bad) ng += 1;
        console.log(`  ${bad ? '⚠️ NG' : '   OK'}  ${s.sec} 秒 ${name}  ${bv.toFixed(2)} → ${v.sharpness.toFixed(2)}（${ratio.toFixed(3)} 倍）`);
      }
    }

    console.log('\n★② 同じ絵（★1280 に揃えて平均 2 階調未満）');
    for (const s of metrics.samples) {
      const a = await toLogicalSize(await loadImage(path.join(out, `canvas-${s.sec}.png`)));
      const bImg = await toLogicalSize(await loadImage(path.join(outRoot, 'before', `canvas-${s.sec}.png`)));
      const d = meanAbsDiff(a, bImg);
      const bad = d.mean >= 2;
      if (bad) ng += 1;
      writeFileSync(path.join(out, `diff-${s.sec}.png`), d.map.toBuffer('image/png'));
      console.log(`  ${bad ? '⚠️ NG' : '   OK'}  ${s.sec} 秒  平均 ${d.mean.toFixed(2)} 階調 ／ 最大 ${d.max}  → 差の地図 diff-${s.sec}.png`);
    }

    /**
     * ★④ は ★**この便の中の A/B**（★同じセッションで画布の大きさだけ変えたもの）で見ます。
     * ⚠️ ★before の回の数字とは比べません（★別々に起こしたブラウザの機嫌が混ざるため）。
     */
    console.log('\n★④ 速度（★上の A/B を参照。★before の回の数字とは比べません）');
    console.log(`\n★${ng === 0 ? '★①②は通りました。★③ 検定と ④ 速度を見てからオーナーへ' : `⚠️ ★${ng} 件の不合格。★オーナーへ出さないこと`}`);
  }
} finally { await browser.close(); }
process.exit(0);
