/**
 * ★18頭のレース画面を組む（P-3 の実測用）
 *
 * 【★前回の失敗】
 *   ゼッケンを **SVG の矩形＋ベクタ文字**で上から貼りました。
 *   → 「クオリティが悪すぎる」。**当然で、ドット絵の上に別種のものを貼っていた**からです
 *     （アンチエイリアスのかかった文字・画素の粒度が違う矩形）。
 *
 *   ★**ゼッケンは UI ではなく、馬に付いている物**です。
 *     **絵の一部として、同じ画素の粒度で描き込みます。**
 *
 * 実行: node tools/render-field.mjs
 */
import sharp from 'sharp';
import { digitPixels, outlinePixels, textWidth, GLYPH_H } from './lib/pixel-font.mjs';

const SHEET = 'design/art/assets/horse-gallop-cloth2-sheet.png';
const OUT = 'design/art/assets/field-18-post.png';
const SPRITE_W = 220;
const SPRITE_H = 140;

/** ★枠順ごとの標準ゼッケン色（業界共通の作法。特定の団体の所有物ではない） */
const POST = [
  [214, 40, 40], [245, 245, 245], [20, 70, 180], [250, 215, 40], [20, 140, 70], [25, 25, 25],
  [240, 130, 25], [245, 150, 190], [45, 190, 180], [120, 45, 160], [150, 150, 155], [170, 220, 50],
  [110, 70, 45], [128, 30, 55], [175, 165, 120], [135, 190, 230], [25, 40, 95], [30, 80, 50],
];
/** 明度で文字色を決める（★色だけで意味を運ばない・アートバイブル §4） */
const isDark = (c) => (c[0] * 299 + c[1] * 587 + c[2] * 114) / 1000 < 140;

const hsv = (r, g, b) => {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d !== 0) {
    if (mx === r) h = ((g - b) / d) % 6;
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60; if (h < 0) h += 360;
  }
  return { h, s: mx === 0 ? 0 : d / mx, v: mx / 255 };
};

/** 生成物の勝負服（青）を差し替える。★明るさを保って色相だけ変える（陰影が消えない） */
function recolorSilk(data, info, rgb) {
  for (let i = 0; i < data.length; i += info.channels) {
    if (data[i + 3] < 128) continue;
    const { h, s, v } = hsv(data[i], data[i + 1], data[i + 2]);
    if (s >= 0.35 && h >= 200 && h <= 260) {
      data[i] = Math.round(rgb[0] * v);
      data[i + 1] = Math.round(rgb[1] * v);
      data[i + 2] = Math.round(rgb[2] * v);
    }
  }
}

/**
 * ★ゼッケンを**画素として描き込む**。
 *
 *   位置は馬体の胴（騎手の下）。実際の競馬でゼッケンが付く場所です。
 *   ⚠️ 角丸を使いません（アートバイブル §3「罫線と余白で区切る」）。
 */
/**
 * ★ゼッケンに色と番号を入れる。
 *
 *   ⚠️ **描き足すのではなく、絵に既にある白い布を塗り替えます。**
 *      前回は肩の上に小さな札を**貼り付け**、実写と比べて位置も大きさも縁の出方も
 *      違っていました（「クオリティが悪すぎる」）。
 *   → 布は**生成側で描かせて**（鞍の下・胴の側面・騎手の脚が前を重なる）、
 *     こちらは**その画素を塗るだけ**にします。
 */
function paintCloth(data, info, num, color, fixedScale) {
  // ★白い布の画素を探す（明るく彩度が低い・胴の高さ）
  const isCloth = (i, y) => {
    if (data[i + 3] < 128) return false;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    const s = mx === 0 ? 0 : (mx - mn) / mx;
    return mx > 195 && s < 0.12 && y > 50 && y < 110;
  };
  /**
   * ★**いちばん大きな「ひと繋がりの塊」だけ**を布とみなします。
   *
   *   明るさだけで拾うと**騎手の白いズボンも布として数え**、
   *   囲む四角が横に広がって**番号が布からはみ出て切れました**（実際にそうなりました）。
   *   → 連結成分に分け、**最大のものだけ**を採ります。
   */
  const W = info.width, H = info.height;
  const seen = new Uint8Array(W * H);
  let best = [];
  for (let p0 = 0; p0 < W * H; p0 += 1) {
    if (seen[p0]) continue;
    const y0c = Math.floor(p0 / W);
    if (!isCloth(p0 * info.channels, y0c)) { seen[p0] = 1; continue; }
    const stack = [p0];
    const blob = [];
    seen[p0] = 1;
    while (stack.length > 0) {
      const q = stack.pop();
      const qy = Math.floor(q / W), qx = q % W;
      blob.push([qx, qy]);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = qx + dx, ny = qy + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const n = ny * W + nx;
        if (seen[n]) continue;
        seen[n] = 1;
        if (isCloth(n * info.channels, ny)) stack.push(n);
      }
    }
    if (blob.length > best.length) best = blob;
  }
  const cells = best;
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (const [x, y] of cells) {
    if (x < x0) x0 = x; if (x > x1) x1 = x;
    if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  const cw2 = x1 - x0 + 1;
  const ch2 = y1 - y0 + 1;

  /**
   * ★布として塗る。
   *
   *   ⚠️ **べた塗りにすると「布感がない」**と言われます（実際に言われました）。
   *      実際のゼッケンは:
   *        ・**下にいくほど暗い**（垂れて陰になる）
   *        ・**縁に縫い目**がある
   *      この2つだけで、板ではなく布に見えます。
   */
  const onClothSet = new Set(cells.map(([x, y]) => `${x},${y}`));
  const isEdge = (x, y) => !onClothSet.has(`${x - 1},${y}`) || !onClothSet.has(`${x + 1},${y}`)
    || !onClothSet.has(`${x},${y - 1}`) || !onClothSet.has(`${x},${y + 1}`);
  const clothTop = y0, clothH = Math.max(1, y1 - y0);

  /**
   * ★**なめらかな階調をやめます。**
   *
   *   前は `1 - 0.22 * (y/h)` という連続した明るさにしていました。
   *   → 中間色が無数にでき、**「固いプラスチックみたい」**になりました。実際そう見えます。
   *
   *   ★ドット絵の布は **2〜3段の階調**で表します。段が見えることが「布」の記号です。
   *     加えて、実際の布は:
   *       ・**裾が真っ直ぐでない**（垂れて揺れる）
   *       ・**鞍の下に折れの影**ができる
   *     この2つを入れます。
   */
  /**
   * ★**布に見えない最大の理由は、輪郭が完全な長方形**だったことです。
   *   段の階調を入れても、四角い板は板のままでした（「プラスチックみたい」）。
   *
   *   実際の布は:
   *     ① **裾が波打つ**（垂れて揺れる。真っ直ぐな下端は存在しない）
   *     ② **縦に折り目**が入る（走ると胴に沿って寄る）
   *     ③ **後ろの角が風で浮く**
   *     ④ 折り目の山に**明るい面**、谷に**暗い面**ができる
   *
   *   ★①〜③は「輪郭」、④は「陰影」です。**輪郭を崩すほうが効きます。**
   *
   * ⚠️ 乱数を使いません（決定論・正典 §0）。**位置から決まる波**にします。
   */
  /**
   * ★布に見せる。
   *
   * 【★1度目の失敗】
   *   裾を波打たせたら**ギザギザの歯**になり、「破れた布」に見えました。
   *   振れ幅が 3〜4画素、周期も細かすぎたためです。
   *   → **振れは最大2画素・周期はゆるく**。裾は「揺れる」のであって「欠ける」のではありません。
   *
   * 【布に見える要素】
   *   ① **縁取り**（トリム）— 実際のゼッケンは縁に別色の帯がある。★これがいちばん効く
   *   ② **段の階調**（連続にしない）
   *   ③ **折り目**は 2〜3画素幅の帯。1画素の線は「傷」に見える
   *   ④ 裾のゆるい揺れ（最大2画素）
   *
   * ⚠️ 乱数を使いません（決定論）。**位置から決まる波**にします。
   */
  const BANDS = 3;
  const hemDrop = (x) => {
    const w = Math.sin((x - x0) * 0.22) + 0.5 * Math.sin((x - x0) * 0.11 + 2.1);
    return Math.round(Math.max(0, w) * 1.2);   // ★最大2画素
  };

  const removed = new Set();
  for (let x = x0; x <= x1; x += 1) {
    const cutFrom = y1 - hemDrop(x) + 1;
    for (let y = cutFrom; y <= y1; y += 1) {
      const key = `${x},${y}`;
      if (!onClothSet.has(key)) continue;
      removed.add(key);
      data[(y * info.width + x) * info.channels + 3] = 0;
    }
  }
  const alive = (x, y) => onClothSet.has(`${x},${y}`) && !removed.has(`${x},${y}`);
  const isTrim = (x, y) => !alive(x - 1, y) || !alive(x + 1, y) || !alive(x, y - 1) || !alive(x, y + 1)
    || !alive(x - 2, y) || !alive(x + 2, y) || !alive(x, y + 2);

  /** ★折り目は帯（2画素幅）。1画素だと傷に見える */
  const folds = [0.34, 0.62].map((r) => x0 + Math.round(cw2 * r));

  for (const [x, y] of cells) {
    if (removed.has(`${x},${y}`)) continue;
    const i = (y * info.width + x) * info.channels;
    const t = (y - clothTop) / clothH;
    let k = [1.0, 0.9, 0.8][Math.min(BANDS - 1, Math.floor(t * BANDS))];

    for (const fx of folds) {
      const d = x - fx;
      if (d >= 0 && d <= 1) k *= 0.82;            // 谷（2画素）
      else if (d >= -2 && d <= -1) k *= 1.08;     // 山（2画素）
    }
    // ★① 縁取り。実際のゼッケンは縁に帯がある — これがいちばん「布」に効く
    if (isTrim(x, y)) k *= 0.62;

    const v = Math.max(data[i], data[i + 1], data[i + 2]) / 255;
    const put = (c) => Math.max(0, Math.min(255, Math.round(c * v * k)));
    data[i] = put(color[0]); data[i + 1] = put(color[1]); data[i + 2] = put(color[2]);
  }

  /**
   * ★番号は布いっぱいに（実写のゼッケンは数字が大きい）。
   *   ★ただし**2桁が入らない布なら、布のほうを広げるべき**です。
   *     ここで小さくしすぎると読めなくなり、P-3（自馬を見つけられるか）が成立しません。
   */
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
  const onCloth = new Set(cells.map(([x, y]) => `${x},${y}`));

  /**
   * ★**計算式ではなく、実際に置いてみて収まる倍率を選びます。**
   *
   *   布は長方形ではなく**角が落ちて傾いています**。外接矩形から倍率を計算すると、
   *   数字の角が布から出ます（実測で 43/180 画素はみ出しました）。
   *   → 大きいほうから試して、**はみ出しが2割以下**になる最初の倍率を採ります。
   */
  /**
   * ★**布いっぱいに描かない。** 「数字が大きすぎる」と指摘されました。
   *   実際のゼッケンは**上下左右に余白**があり、数字は布の高さの6割ほどです。
   */
  const TARGET = 0.62;
  let scale = 0, ox = 0, oy = 0;
  /**
   * ★**倍率は全馬で共通**にします。
   *   フレームごとに布の大きさが違うため、馬ごとに倍率を決めていたところ
   *   **「2・5・8・11 だけ数字がでかい」**となりました（実際そうなっていました）。
   *   → 呼び出し側が決めた倍率を使い、置けるかだけを確かめます。
   */
  const cands = fixedScale !== undefined
    ? [fixedScale]
    : (() => { const a = []; for (let sc = Math.max(1, Math.round((ch * TARGET) / GLYPH_H)); sc >= 1; sc -= 1) a.push(sc); return a; })();
  for (const sc of cands) {
    const tw = textWidth(num, sc), th = GLYPH_H * sc;
    const px = x0 + Math.floor((cw - tw) / 2);
    const py = y0 + Math.floor((ch - th) / 2);
    const pix = digitPixels(num, sc);
    let out = 0;
    for (const [dx, dy] of pix) if (!onCloth.has(`${px + dx},${py + dy}`)) out += 1;
    if (out <= pix.length * 0.2) { scale = sc; ox = px; oy = py; break; }
  }
  // ★どの倍率でも収まらないなら、布が小さすぎます。黙って小さく描かない
  if (scale === 0) {
    throw new Error(`番号 ${num} を置ける倍率がありません。布 ${cw}×${ch} — 布を大きくする必要があります`);
  }

  const fg = isDark(color) ? [250, 250, 250] : [15, 15, 15];
  const ol = isDark(color) ? [10, 10, 10] : [245, 245, 245];
  /**
   * ★**縁取りを先に置く。** 布には陰影があるので、縁が無いと数字が浮いて
   *   「後から描いた」ように見えます（実際にそう見えていました）。
   */
  for (const [dx, dy] of outlinePixels(num, scale)) {
    const x = ox + dx, y = oy + dy;
    if (x < 0 || y < 0 || x >= info.width || y >= info.height) continue;
    if (!onCloth.has(`${x},${y}`)) continue;   // ★布の外にはみ出さない
    const i = (y * info.width + x) * info.channels;
    data[i] = ol[0]; data[i + 1] = ol[1]; data[i + 2] = ol[2]; data[i + 3] = 255;
  }
  for (const [dx, dy] of digitPixels(num, scale)) {
    const x = ox + dx, y = oy + dy;
    if (x < 0 || y < 0 || x >= info.width || y >= info.height) continue;
    const i = (y * info.width + x) * info.channels;
    data[i] = fg[0]; data[i + 1] = fg[1]; data[i + 2] = fg[2]; data[i + 3] = 255;
  }
}

const meta = await sharp(SHEET).metadata();
const cellW = Math.floor(meta.width / 6);
const frames = [];
for (let f = 0; f < 6; f += 1) {
  const raw = await sharp(SHEET).extract({ left: f * cellW, top: 0, width: cellW, height: meta.height })
    .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  /**
   * ★クロマキーの緑を抜く。
   *   生成側が透明背景ではなく**緑地**で返すことがあります
   *   （ツールの共通方針が「不可なら単色クロマキー」と定めているため）。
   */
  const rd = raw.data;
  for (let i = 0; i < rd.length; i += raw.info.channels) {
    if (rd[i] < 120 && rd[i + 1] > 180 && rd[i + 2] < 120) rd[i + 3] = 0;
  }
  const cut = await sharp(rd, { raw: { width: raw.info.width, height: raw.info.height, channels: raw.info.channels } })
    .png().toBuffer();
  const tr = await sharp(cut).trim().png().toBuffer();
  frames.push(await sharp(tr)
    .resize(SPRITE_W, SPRITE_H, { fit: 'contain', position: 'bottom', kernel: 'nearest', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png().toBuffer());
}

const SW = 1280, SH = 720;
const tiles = [
  { input: { create: { width: SW, height: 230, channels: 3, background: { r: 120, g: 135, b: 150 } } }, left: 0, top: 0 },
  { input: { create: { width: SW, height: 100, channels: 3, background: { r: 70, g: 62, b: 58 } } }, left: 0, top: 230 },
  { input: { create: { width: SW, height: 20, channels: 3, background: { r: 190, g: 185, b: 175 } } }, left: 0, top: 330 },
  { input: { create: { width: SW, height: 370, channels: 3, background: { r: 58, g: 78, b: 48 } } }, left: 0, top: 350 },
];

/**
 * ★**全馬で同じ倍率**にするため、先に全フレームの布の高さを測ります。
 *   いちばん小さい布に合わせれば、どの馬でも同じ大きさで収まります。
 */
let minClothH = Infinity;
for (const f of frames) {
  const { data, info } = await sharp(f).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let top = Infinity, bot = -1;
  for (let p = 0; p < info.width * info.height; p += 1) {
    const y = Math.floor(p / info.width);
    const i = p * info.channels;
    if (data[i + 3] < 128) continue;
    const mx = Math.max(data[i], data[i + 1], data[i + 2]);
    const mn = Math.min(data[i], data[i + 1], data[i + 2]);
    if (!(mx > 195 && (mx === 0 ? 0 : (mx - mn) / mx) < 0.12 && y > 50 && y < 110)) continue;
    if (y < top) top = y; if (y > bot) bot = y;
  }
  if (bot > top) minClothH = Math.min(minClothH, bot - top + 1);
}
/**
 * ★共通倍率は「布の高さから計算」ではなく、**全馬で実際に置ける最大**にします。
 *   高さから計算したら ×3 になり、番号 14 が布に入りませんでした
 *   （布は長方形ではないので、高さだけでは決まりません）。
 */
let COMMON_SCALE = 0;
for (let sc = Math.max(1, Math.round((minClothH * 0.62) / GLYPH_H)); sc >= 1; sc -= 1) {
  let ok = true;
  for (let i = 0; i < 18 && ok; i += 1) {
    const { data, info } = await sharp(frames[(i * 2) % 6]).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    try { paintCloth(data, info, String(i + 1), POST[i], sc); } catch { ok = false; }
  }
  if (ok) { COMMON_SCALE = sc; break; }
}
if (COMMON_SCALE === 0) throw new Error('★どの倍率でも全馬に置けません。布を大きくしてください');
console.log(`  ★全馬共通の倍率: ×${COMMON_SCALE}（★18頭すべてで実際に置けることを確かめた）`);

for (let i = 0; i < 18; i += 1) {
  const { data, info } = await sharp(frames[(i * 2) % 6]).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  recolorSilk(data, info, POST[i]);
  paintCloth(data, info, String(i + 1), POST[i], COMMON_SCALE);
  const img = await sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } }).png().toBuffer();
  const lane = i % 3, col = Math.floor(i / 3);
  tiles.push({ input: img, left: Math.round(15 + col * 200 + lane * 30), top: 355 + lane * 105 });
}

await sharp({ create: { width: SW, height: SH, channels: 3, background: { r: 58, g: 78, b: 48 } } })
  .composite(tiles).png().toFile(OUT);
console.log(`  ${OUT}: 18頭（★ゼッケンを画素として描き込み）`);
