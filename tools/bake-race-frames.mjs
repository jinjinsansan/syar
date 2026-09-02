/**
 * ★**レース映像の馬コマを、こちらで 1 回だけ焼いて配る**（★書き出しのみ・★DB に触りません）
 *
 * 【★なぜ焼くか】
 *   ★`/race` は ★**開くたびに、その人のブラウザの中で毛色を焼き直して**います。
 *   ★そのため起動時に ★**キャンバス 992 枚・2,398MB** を確保し、★スマホでは開けません
 *   （★オーナー報告「このページを開けません」・2026-09-01）。
 *
 *   ★この道具は ★**同じ処理を、配る前に 1 回だけ**やります。
 *   ★勝負服とゼッケンは既に同じ方式です（`tools/bake-sprites.mjs` の冒頭:
 *     ★「ブラウザで書き直すと必ずズレます。同じ処理で PNG にしてから配ります」）。
 *   ★**毛色だけがブラウザ側に残っていました。**
 *
 * 【★何 px で焼くか — ★測ってから決めました】
 *   ★`node tools/audit-draw-scale.mjs --seeds 42,332,474,14`（★10 場 50 鞍 × 4 シード）
 *     ★画面上の馬の高さ … ★中央 234px ／ p99 418px ／ ★**最大 512px**
 *   → ★**560px**（★最大に 9% の余裕）でオーナー決定（2026-09-02）。
 *
 * ⚠️ ★**変換は原版の解像度で掛けてから縮めます。**
 *    ★縮めてから塗ると、★輪郭の画素が馬体か肌かを区別できなくなり
 *    （`isHorseCoat` は色の比で分けています）、★**騎手の肌が濁ります**。
 *    ★この順番は 2026-08-21 の「肌だけグレー」と同じ失敗の口です。
 *
 * ⚠️ ★**素材は 1 枚も作り直しません。** ★原版（`/art/horse-jockey-*.png`）はそのままです。
 *    ★この道具は ★**原版から作った配布用の写し**を `/art/baked/` に置くだけです。
 *
 * ⚠️ ★**拡大はしません。** ★`horse-jockey-diag-rear-v5`（432px）と
 *    ★`horse-jockey-high-diag-v4`（314px）は ★**560px に届きません。**
 *    ★引き伸ばしても情報は増えないので ★**原寸のまま**焼きます
 *    （★この 2 つは ★**いまも画面で 1.19 倍・1.63 倍に引き伸ばされています** — ★焼くこととは別の残件）。
 *
 * 実行: npx tsx tools/bake-race-frames.mjs [--target 560] [--out apps/web/public/art/baked]
 */
import { mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { applyCoat, isHorseCoat, COAT_TRANSFORMS } from '@star/render';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : process.argv[i + 1]; };
/** ★実測 512px（4 シード × 50 鞍）に 9% の余裕。★オーナー決定 2026-09-02 */
const TARGET = Number(arg('target', 560));
const ART = 'apps/web/public/art';
const OUT = arg('out', join('apps', 'web', 'public', 'art', 'baked'));
const FRAMES = 8;
const p2 = (i) => String(i + 1).padStart(2, '0');

/**
 * ★**可逆 WebP で書き出します。**
 *   ★PNG と ★**画素は 1 つも変わりません**（可逆）。★転送量は実測で 42% 小さくなります
 *   （★真横のアトラス 4.55MB → 2.62MB）。
 * ⚠️ ★**非可逆（`quality`）は使いません。** ★0.87MB まで落ちますが、
 *    ★この便で変えてよい絵は ★**解像度だけ**です（オーナー決定 2026-09-02）。
 *    ★圧縮でもう 1 つ絵を変えると、★何が効いたのか切り分けられなくなります。
 */
const WEBP = { lossless: true, effort: 6 };

/**
 * ★**画面が実際に使う素材**を、★在るものから決めます（`page.tsx` の `??` の並びと同じ）。
 * ⚠️ ★名前を 1 つだけ直書きすると、★素材を差し替えた日に道具だけが古い版を焼きます。
 */
const setExists = (prefix) => Array.from({ length: FRAMES }, (_, i) =>
  `${ART}/${prefix}-pose${p2(i)}.png`).every(existsSync);
const pickSet = (...prefixes) => prefixes.find(setExists);

/**
 * ★役割 → 素材。★`role` は `page.tsx` の `BroadcastV2FrameLibraries` の鍵です。
 * ★`layout` は勝負服の窓（`SILKS_LAYOUT_*`）。★この道具では使いませんが、
 *   ★画面が同じ組を引けるように控えを書き出します。
 */
const SETS = [
  { role: 'side-v6', layout: 'crouch', prefix: pickSet('horse-jockey-side-v7', 'horse-jockey-side-v6') },
  { role: 'diag-front-v2', layout: 'front', prefix: pickSet('horse-jockey-diag-front-v3', 'horse-jockey-diag-front-v2') },
  { role: 'diag-rear-v2', layout: 'rear', prefix: pickSet('horse-jockey-diag-rear-v5', 'horse-jockey-diag-rear-v4', 'horse-jockey-diag-rear-v2') },
  { role: 'high-diag-v2', layout: 'rear', prefix: pickSet('horse-jockey-high-diag-v4', 'horse-jockey-high-diag-v3', 'horse-jockey-high-diag-v2') },
  { role: 'winner-rear', layout: 'rear', prefix: pickSet('horse-jockey-winner-rear-v1') },
  { role: 'winner-cycle', layout: 'winner', prefix: pickSet('horse-jockey-winner-v2') },
];

/** ★鞍布の窓（`page.tsx` の `SILKS_LAYOUT_*.saddlecloth`）。★基準点を探すためだけに使います */
const SADDLE_WINDOW = {
  crouch: [0.27, 0.59, 0.34, 0.58],
  front: [0.05, 0.95, 0.30, 0.48],
  rear: [0.1, 0.9, 0.34, 0.5],
  winner: [0.36, 0.60, 0.48, 0.66],
};

const raw = async (file) => {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height };
};

/** ★`page.tsx` の `opaqueBounds` と同じ規則（α<12 は透明・余白 2px） */
function opaqueBounds({ data, w, h }) {
  let left = w, top = h, right = -1, bottom = -1;
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) {
    if (data[(y * w + x) * 4 + 3] < 12) continue;
    if (x < left) left = x; if (y < top) top = y;
    if (x > right) right = x; if (y > bottom) bottom = y;
  }
  if (right < left || bottom < top) return { x: 0, y: 0, width: w, height: h };
  const pad = 2;
  const x = Math.max(0, left - pad), y = Math.max(0, top - pad);
  return { x, y, width: Math.min(w, right + pad + 1) - x, height: Math.min(h, bottom + pad + 1) - y };
}

/** ★`page.tsx` の `saddleReference` と同じ規則（無彩色で明るい画素の外接・400 画素未満は不採用） */
function saddleReference({ data, w }, bounds, window) {
  const [nx0, nx1, ny0, ny1] = window;
  const X0 = Math.floor(bounds.x + bounds.width * nx0), X1 = Math.ceil(bounds.x + bounds.width * nx1);
  const Y0 = Math.floor(bounds.y + bounds.height * ny0), Y1 = Math.ceil(bounds.y + bounds.height * ny1);
  let l = Infinity, t = Infinity, r = -1, b = -1, n = 0;
  for (let y = Y0; y < Y1; y += 1) for (let x = X0; x < X1; x += 1) {
    const k = (y * w + x) * 4;
    if (data[k + 3] < 200) continue;
    const R = data[k], G = data[k + 1], B = data[k + 2];
    const mx = Math.max(R, G, B), mn = Math.min(R, G, B);
    if (mx > 170 && mx - mn < 28) { n += 1; if (x < l) l = x; if (x > r) r = x; if (y < t) t = y; if (y > b) b = y; }
  }
  if (n < 400 || r < l) return undefined;
  return { x: (l + r) / 2, y: (t + b) / 2, width: r - l + 1 };
}

/** ★`page.tsx` の `bodyCentroid` と同じ規則（外接矩形の上 55% の α 重み付き重心） */
function bodyCentroid({ data, w }, bounds) {
  const cut = bounds.y + bounds.height * 0.55;
  let sx = 0, sy = 0, sw = 0;
  for (let y = bounds.y; y < cut; y += 1) for (let x = bounds.x; x < bounds.x + bounds.width; x += 1) {
    const a = data[(y * w + x) * 4 + 3];
    if (a < 12) continue;
    sx += x * a; sy += y * a; sw += a;
  }
  if (sw === 0) return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height * 0.4 };
  return { x: sx / sw, y: sy / sw };
}

/** ★毛色を**原版の解像度で**掛ける（`page.tsx` の `bakeCoat` と同じ規則・同じ関数） */
function coated({ data, w, h }, coat) {
  const t = COAT_TRANSFORMS[coat];
  if (t === undefined) return Buffer.from(data);          // ★鹿毛は素材そのまま
  const out = Buffer.from(data);
  for (let i = 0; i < out.length; i += 4) {
    if (out[i + 3] < 8) continue;
    const r = out[i], g = out[i + 1], b = out[i + 2];
    if (!isHorseCoat(r, g, b)) continue;
    const [R, G, B] = applyCoat(r, g, b, t);
    out[i] = R; out[i + 1] = G; out[i + 2] = B;
  }
  return out;
}

const COATS = Object.keys(COAT_TRANSFORMS);

if (existsSync(OUT)) rmSync(OUT, { recursive: true });
mkdirSync(OUT, { recursive: true });

console.log(`★焼き出し先 ${OUT} ／ ★目標の馬高 ${TARGET}px ／ ★毛色 ${COATS.length} 色`);
console.log('  役割            素材                          原版の馬高  倍率   タイル      枚');

const manifest = { targetHorsePx: TARGET, coats: COATS, sets: [] };
let totalBytes = 0;

for (const set of SETS) {
  if (set.prefix === undefined) { console.log(`  ★★${set.role}: 素材が 8 枚揃っていません`); process.exitCode = 1; continue; }
  const files = Array.from({ length: FRAMES }, (_, i) => `${ART}/${set.prefix}-pose${p2(i)}.png`);
  const natives = [];
  for (const f of files) natives.push(await raw(f));
  const boundsList = natives.map(opaqueBounds);
  const refNative = Math.max(...boundsList.map((b) => b.height));
  /** ⚠️ ★**拡大はしません**（1 を超えない）。★引き伸ばしても情報は増えません */
  const scale = Math.min(1, TARGET / refNative);

  const tiles = boundsList.map((b) => ({
    w: Math.max(1, Math.round(b.width * scale)),
    h: Math.max(1, Math.round(b.height * scale)),
  }));
  const atlasH = Math.max(...tiles.map((t) => t.h));
  const xs = [];
  let cursor = 0;
  for (const t of tiles) { xs.push(cursor); cursor += t.w; }
  const atlasW = cursor;

  /* ── ★毛色ごとのアトラス ── */
  const coatFiles = {};
  /** ★影を焼くための、鹿毛の焼き上がりコマ（★影は毛色に依りません） */
  const bayCells = [];
  for (const coat of COATS) {
    const cells = [];
    for (let i = 0; i < FRAMES; i += 1) {
      const n = natives[i], b = boundsList[i];
      const buf = coated(n, coat);
      const cell = await sharp(buf, { raw: { width: n.w, height: n.h, channels: 4 } })
        .extract({ left: b.x, top: b.y, width: b.width, height: b.height })
        .resize(tiles[i].w, tiles[i].h, { kernel: 'lanczos3', fit: 'fill' })
        .png().toBuffer();
      if (coat === 'bay') bayCells.push(cell);
      cells.push({ input: cell, left: xs[i], top: 0 });
    }
    const file = `${set.role}-${coat}.webp`;
    const out = await sharp({ create: { width: atlasW, height: atlasH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite(cells).webp(WEBP).toBuffer();
    writeFileSync(join(OUT, file), out);
    totalBytes += out.length;
    coatFiles[coat] = file;
  }

  /* ── ★接地影のアトラス（★2026-09-03・オーナー判断 A「原寸のまま焼く」）── */
  /**
   * ★**画面側の `bakeShadowSilhouette` と同じ手順**でここで 1 回だけ焼きます。
   *   ★① 焼き上がったコマ（★毛色は鹿毛・影は毛色に依りません）を
   *   ★② `blur(3 × scale)` でぼかし
   *   ★③ 不透明度はそのまま、色だけ `#07110a` に置き換える（＝ canvas の `source-in`）
   *
   * ⚠️ ★**画素は一致しません。**
   *    ★ぼかしはブラウザ（Skia）と焼き出し（libvips）で ★**別の実装**です。
   *    ★同じ 3px のガウスでも、丸めが違います。★どれだけ違うかは
   *    ★`/race` の前後を撮って突き合わせた数字を報告に載せること（★勝負服の便と同じ手順）。
   *
   * ⚠️ ★**ぼかし半径は原版基準の 3px ではありません。** ★焼いた絵は既に縮んでいるので
   *    ★同じ比率（`3 × scale`）まで縮めます。★3 のままだと、
   *    ★原版でぼかしてから縮めた場合より ★**ぼやけます**（★画面側の注記と同じ理由）。
   *
   * 【★なぜ焼くか】★画面側は起動時に ★**1 組 8 枚のキャンバス**を作り、
   *   ★1 枚ずつぼかして塗っていました（★6 組で 48 枚・★実測 28MB）。
   *   ★焼けば ★**キャンバス 0 枚**になり、★画像として配られます。
   */
  const shadowCells = [];
  for (let i = 0; i < FRAMES; i += 1) {
    const sigma = 3 * scale;
    /** ⚠️ ★`sharp` は `sigma < 0.3` を受け付けません。★そこまで縮む素材は今ありません */
    const blurred = await sharp(bayCells[i])
      .ensureAlpha()
      .blur(Math.max(0.3, sigma))
      .raw().toBuffer({ resolveWithObject: true });
    const px = blurred.data;
    /** ★canvas の `globalCompositeOperation = 'source-in'` ＋ `fillStyle = '#07110a'` と同じ */
    for (let k = 0; k < px.length; k += 4) { px[k] = 0x07; px[k + 1] = 0x11; px[k + 2] = 0x0a; }
    shadowCells.push({
      input: await sharp(px, { raw: { width: blurred.info.width, height: blurred.info.height, channels: 4 } })
        .png().toBuffer(),
      left: xs[i], top: 0,
    });
  }
  const shadowFile = `${set.role}-shadow.webp`;
  const shadowOut = await sharp({ create: { width: atlasW, height: atlasH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(shadowCells).webp(WEBP).toBuffer();
  writeFileSync(join(OUT, shadowFile), shadowOut);
  totalBytes += shadowOut.length;


  /**
   * ★**基準点は原版で探して、焼いた寸法に直して配ります。**
   *
   * ⚠️ ★**「縮めると必ず落ちる」ではありません**（★2026-09-02 に測り直しました）。
   *    ★560px で焼いた絵に同じ規則を掛けると ★**48 コマすべてで見つかります**
   *    （★鞍布と数えられる画素の最小 793・★しきい値 400）。
   * ★それでも原版で探すのは、★`saddleReference` の採否が ★**画素の絶対数（400）**だからです。
   *    ★目標 px を下げると静かに不採用へ落ち、★基準点が重心に変わって
   *    ★**馬の置き場所が動きます**（R-27）。★実測で最初に落ちるのは
   *    ★`winner-rear`（★目標 **約 371px** 未満）。
   * → ★**目標 px と基準点の当たり外れを、切り離しておきます。**
   */
  const frames = boundsList.map((b, i) => {
    const saddle = saddleReference(natives[i], b, SADDLE_WINDOW[set.layout]);
    const anchor = saddle ?? { ...bodyCentroid(natives[i], b), width: 0 };
    return {
      x: xs[i], y: 0, w: tiles[i].w, h: tiles[i].h,
      /** ★タイルの左上からの相対（焼いた px） */
      anchor: {
        x: (anchor.x - b.x) * scale,
        y: (anchor.y - b.y) * scale,
        width: anchor.width * scale,
      },
      anchorKind: saddle === undefined ? 'centroid' : 'saddle',
      /** ★原版での不透明範囲（★突き合わせ用。★画面は使いません） */
      nativeBounds: b,
    };
  });

  manifest.sets.push({
    role: set.role, prefix: set.prefix, layout: set.layout,
    scale, nativeReferenceHeight: refNative,
    /** ★`referenceHeight`（焼いた px）。★`page.tsx` の `Math.max(...source.height)` と同じ意味 */
    referenceHeight: Math.max(...tiles.map((t) => t.h)),
    /** ★原版の画布の高さ。★`page.tsx` が `HORSE_GROUND_LIFTS` を比例させるのに使います */
    nativeCanvasHeight: natives[0].h,
    atlas: { width: atlasW, height: atlasH },
    frames, coats: coatFiles,
    /**
     * ★接地影のアトラス（★毛色に依らず 1 枚）。
     * ⚠️ ★**無ければ画面は従来どおり端末で焼きます**（R-27・古い `baked/` でも動くこと）。
     */
    shadow: shadowFile,
  });

  console.log(`  ${set.role.padEnd(15)} ${set.prefix.padEnd(28)} ${String(refNative).padStart(6)}px`
    + ` ${scale.toFixed(3)}  ${String(atlasW).padStart(5)}x${String(atlasH).padStart(4)}`
    + ` ${String(COATS.length).padStart(3)}`);
}

writeFileSync(join(OUT, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`\n★書き出し ${(totalBytes / 1048576).toFixed(1)}MB（★可逆 WebP ${manifest.sets.length * COATS.length} 枚 ＋ ★影 ${manifest.sets.length} 枚 ＋ manifest.json）`);
console.log('⚠️ ★これは原版から作った写しです。★原版は 1 枚も変えていません。');
