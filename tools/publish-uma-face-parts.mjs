/**
 * ★**調教の表情を「部品」で作る**（★2026-09-24・オーナー決定 D-4・`DECISIONS_HORSE_LOOK_20260924.md`）
 *
 * 【★なぜ「部品」か】
 *   ★平常の頭部を入力に「★耳・まぶた・口角だけ動かす」画像編集を **2 回**試し、
 *   ★**2 回とも頭の形・鼻先・線が引き直されて別キャラ**になりました（★Codex 自身も失敗と報告）。
 *   ★これはオーナーに **3 回**差し戻された失敗と同じ形です。
 *   → ★頭部（`uma/horse-face.webp`）は **1 枚のまま固定**し、
 *     ★まぶた／眉だけを描いた ★**透過のレイヤー**を重ねます。
 *
 * 【🔴 ★生成物は「位置」を持って帰ってきません】
 *   ★画像の道具は ★**正方形の画布**（★実測 1254×1254）で返し、★描く位置も毎回ちがいます。
 *   ★「同じ画布なら自動で重なる」は ★**成り立ちませんでした**（★実測で確認）。
 *   → ★この道具が ★**頭部の絵から目の位置を測って**、★部品をそこへ合わせます。
 *     ★出すのは ★**頭部と同じ画布の透過レイヤー**なので、★画面は `inset: 0` で重ねるだけです
 *     （★画面に座標を持たせない ＝ ★頭部を切り直しても画面を直さなくてよい）。
 *
 * 【★目の測り方】
 *   ★白目（★明るくて彩度の低い画素）のいちばん明るい点から、★**毛色でない画素**を通って塗り広げます。
 *   ★白目・瞳・黒い輪郭・眉がひと塊になり、★その外接が「目」です（★実測 52×52 @(113,100)）。
 *   ⚠️ ★白目の外接だけでは ★**足りません**（★明るい部分しか拾わず、★1/4 の大きさになりました）。
 *
 * 【🔴 ★受け入れ条件】
 *   ★① ★元の部品の ★**不透明が画布の `MAX_INK` 以下**（★頭を描いてきたら落とす）
 *   ★② ★元の部品の ★**中身が 1 つの塊に収まる**（★縦横比が `MAX_ASPECT` 以内 ＝ 絵全体ではない）
 *   ★③ ★置いた後のレイヤーが ★**目の外接から `MAX_STRAY` 以上はみ出さない**
 *   ⚠️ ★1 つでも外れたら ★**1 枚も置きません**（★片方だけ入ると、★表情が 2 段になります）
 *
 * ⚠️ ★DB に触れません（★画像を読み書きするだけ）。
 * 🔴 ⚠️ ★**sharp は `composite` を `resize` の「後」に当てます**（★鎖に書いた順ではない）。
 *    ★`sharp(a).composite(b).resize(3)` と書くと、★b は ★**3 倍にした絵の上に原寸で**乗ります。
 *    ★この道具で 1 度そうなり、★「部品がたてがみの上に出る」と読み違えました。
 *    → ★**重ねる sharp() と 大きさを変える sharp() を分ける**こと。
 *
 * ★実行: node tools/publish-uma-face-parts.mjs
 */
import { existsSync } from 'node:fs';
import sharp from 'sharp';

const GEN = 'out/gen';
const OUT = 'apps/web/public/art/uma';
const HEAD = `${OUT}/horse-face.png`;

/** ★元の部品の不透明の上限（★画布に対する割合）。★頭部そのものは 45% 前後あります */
const MAX_INK = 0.1;
/** ★元の部品の中身の縦横比の上限（★1 つの塊であること） */
const MAX_ASPECT = 4;
/** ★置いた後、目の外接からはみ出してよい量（★目の幅に対する割合） */
const MAX_STRAY = 0.35;

/**
 * ★部品ごとの置き方。
 *   `wf`    … 幅を「目の幅」の何倍にするか
 *   `cover` … 部品の ★**下端**を、目の上端から下へ「目の高さ」の何割の所に置くか
 * ⚠️ ★この 2 つは ★**見比べて決めた値**です（★`out/place-lid.mjs` で 6 通り出した）。
 *    ★変えたら必ず見ること。★数式で出せる値ではありません。
 */
const PARTS = [
  {
    src: `${GEN}/uma-face-part-lid.png`,
    out: `${OUT}/horse-face-part-tired`,
    label: '疲れ（半分閉じたまぶた）',
    wf: 1.08,
    cover: 0.90,
  },
  {
    src: `${GEN}/uma-face-part-bright.png`,
    out: `${OUT}/horse-face-part-happy`,
    label: '上機嫌（怒り眉を消して、上げた眉を描く）',
    wf: 1.08,
    cover: 0.80,
  },
];

/** ★頭部の絵から目の外接を測る（★白目から、毛色でない画素を通って塗り広げる） */
async function measureEye(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const at = (x, y) => (y * w + x) * 4;
  const isCoat = (x, y) => {
    const i = at(x, y);
    const r = data[i] ?? 0, g = data[i + 1] ?? 0, b = data[i + 2] ?? 0;
    return r > 120 && r - b > 45 && g > b;
  };
  const opaque = (x, y) => (data[at(x, y) + 3] ?? 0) >= 200;

  let seed = null, best = -1;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (!opaque(x, y)) continue;
      const i = at(x, y);
      const r = data[i] ?? 0, g = data[i + 1] ?? 0, b = data[i + 2] ?? 0;
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      if (mx < 195 || (mx - mn) / mx > 0.14) continue;
      if (mx > best) { best = mx; seed = [x, y]; }
    }
  }
  if (seed === null) throw new Error('★白目が見つかりません（★頭部の絵が変わっていませんか）');

  const seen = new Uint8Array(w * h);
  const stack = [seed];
  let l = w, t = h, r = -1, b = -1, n = 0;
  while (stack.length > 0) {
    const [x, y] = stack.pop();
    if (x < 0 || y < 0 || x >= w || y >= h) continue;
    const k = y * w + x;
    if (seen[k] === 1) continue;
    seen[k] = 1;
    if (!opaque(x, y) || isCoat(x, y)) continue;
    n += 1;
    if (x < l) l = x; if (x > r) r = x; if (y < t) t = y; if (y > b) b = y;
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  return { l, t, r, b, w: r - l, h: b - t, pixels: n, canvas: { w, h } };
}

const eye = await measureEye(HEAD);
console.log('=== 表情の部品 ===');
console.log(`  頭部の画布: ${eye.canvas.w}x${eye.canvas.h}`);
console.log(`  目の外接:   ${eye.w}x${eye.h} @(${eye.l},${eye.t})  （${eye.pixels} 画素）`);

const made = [];
let ok = true;
for (const p of PARTS) {
  if (!existsSync(p.src)) {
    console.error(`  🔴 ${p.label}: ★ありません（${p.src}）`);
    ok = false;
    continue;
  }
  const meta = await sharp(p.src).metadata();
  const { data, info } = await sharp(p.src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let ink = 0;
  for (let i = 3; i < data.length; i += 4) if ((data[i] ?? 0) >= 24) ink += 1;
  const inkRatio = ink / (info.width * info.height);

  const trimmed = await sharp(p.src).trim({ threshold: 1 }).png().toBuffer();
  const tm = await sharp(trimmed).metadata();
  const aspect = Math.max(tm.width / tm.height, tm.height / tm.width);

  // ★目に合わせて縮め、頭部と同じ画布の上に置く
  const pw = Math.round(eye.w * p.wf);
  const ph = Math.round((tm.height / tm.width) * pw);
  const left = Math.round(eye.l + eye.w / 2 - pw / 2);
  const top = Math.round(eye.t + eye.h * p.cover - ph);
  const scaled = await sharp(trimmed).resize(pw, ph, { kernel: 'lanczos3' }).png().toBuffer();
  const layer = await sharp({
    create: { width: eye.canvas.w, height: eye.canvas.h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  }).composite([{ input: scaled, left, top }]).png().toBuffer();

  const stray = Math.max(
    (eye.l - left) / eye.w, (left + pw - eye.r) / eye.w,
    (eye.t - top) / eye.w, (top + ph - eye.b) / eye.w,
  );

  const pass = inkRatio > 0 && inkRatio <= MAX_INK && aspect <= MAX_ASPECT && stray <= MAX_STRAY;
  console.log(`  ${pass ? '✅' : '🔴'} ${p.label}`);
  console.log(`       元: ${meta.width}x${meta.height}  不透明 ${(inkRatio * 100).toFixed(1)}%（上限 ${MAX_INK * 100}%）  中身 ${tm.width}x${tm.height} 比 ${aspect.toFixed(2)}（上限 ${MAX_ASPECT}）`);
  console.log(`       置いた所: ${pw}x${ph} @(${left},${top})  目からのはみ出し ${(stray * 100).toFixed(0)}%（上限 ${MAX_STRAY * 100}%）`);
  if (!pass) { ok = false; continue; }
  made.push({ ...p, layer });
}

if (!ok) {
  console.error('\n🔴 ★不合格。★**1 枚も置きませんでした**（★片方だけ入ると表情が 2 段になります）。');
  console.error('★焼き直すか、★プロンプト（`design/art/prompts/uma-face-part-*.txt`）を直してください。');
  process.exit(1);
}

for (const p of made) {
  await sharp(p.layer).png({ compressionLevel: 9 }).toFile(`${p.out}.png`);
  await sharp(p.layer).webp({ quality: 92 }).toFile(`${p.out}.webp`);
  console.log(`  → ${p.out}.webp`);
}
console.log('\n✅ ★置きました。★画面は `inset: 0` で重ねるだけです（★座標を持たせないこと）。');
