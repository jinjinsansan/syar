/**
 * ★スプライトの塗り（勝負服・ゼッケン）— **1か所にまとめる**
 *
 * 【なぜ切り出すか】
 *   ここはオーナーの指摘で**5回作り直した処理**です（貼り付け／位置／大きさ／書体／布感）。
 *   ⚠️ **書き写すと必ず片方だけ直ります。** P3 で繰り返した「2か所で別々に持つ」と同じ形です。
 *   → GIF を作る道具も、ブラウザ用に焼き出す道具も、**ここだけを呼びます**。
 *
 * 【この層が知らないこと】
 *   ★描画コマンドも位置モデルも知りません。**画像を作るだけ**です。
 */
import sharp from 'sharp';
import { digitPixels, outlinePixels, textWidth, GLYPH_H } from './pixel-font.mjs';

/** ★枠順ごとの標準ゼッケン色（D-060 で採用） */
export const POST = [
  [214, 40, 40], [245, 245, 245], [20, 70, 180], [250, 215, 40], [20, 140, 70], [25, 25, 25],
  [240, 130, 25], [245, 150, 190], [45, 190, 180], [120, 45, 160], [150, 150, 155], [170, 220, 50],
  [110, 70, 45], [128, 30, 55], [175, 165, 120], [135, 190, 230], [25, 40, 95], [30, 80, 50],
];

/**
 * ★ゼッケンの数字を白にするか黒にするか。
 *
 * ⚠️ **閾値 140 です。128 ではありません。**
 *    切り出したとき、うっかり 128 と書きました。**同じ名前の関数が2か所にあり、
 *    値が違う**状態が一瞬できました（P3 で繰り返した形そのものです）。
 *    ★オーナーが承認したのは **140** の見た目です。
 */
export const isDark = (c) => (c[0] * 299 + c[1] * 587 + c[2] * 114) / 1000 < 140;

/**
 * ★シートからコマを切り出す。
 *
 * 【★2つ間違えていました。どちらも画面に出ていました】
 *
 *   ① **「幅 ÷ 6」で等分割していました。シートは等間隔ではありません。**
 *      実測: コマ幅 302〜355px（`tools/measure-sheet-blobs.mjs`）。
 *      → 1コマ目の頭が2コマ目のセルに入り、画面に**宙に浮いた頭と蹄**が出ていました。
 *      ★区切りは**連結成分**（緑を抜いた塊）で決めます。隙間ではなく繋がりで。
 *
 *   ② **下端で揃えていました**（`position: 'bottom'`）。
 *      実測: 下端は 472〜500 で **28px ばらつきます**（脚の伸び）。上端は **247 で一定**。
 *      → **馬全体が毎コマ上下に跳ねて**いました。これが「走り方が不自然」です。
 *      ★**ゼッケン布の重心**（＝胴体）は 6コマとも y≈349、ばらつき 5px。
 *        **そこを基準にすれば、胴が止まり、脚と首だけが動きます。**
 */
export async function loadFrames(sheetPath) {
  const { data, info } = await sharp(sheetPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, C = info.channels;

  /**
   * ★**緑を抜く（クロマキー）。縁を残さないこと。**
   *
   * 【★間違えていました】
   *   以前は `r<120 && g>180 && b<120` という「濃い緑だけ」の条件でした。
   *   ⚠️ 生成画像の輪郭は**中間色でなだらかに**なっているので、
   *      `rgb(150,190,140)` のような**薄い緑が残ります**。
   *      実測 **3137画素**が残り、★**馬の輪郭に緑の線**が出ていました。
   *
   * 【★どう直すか】
   *   ① **緑が他の2色より明確に強い**画素を抜く（濃さによらない）
   *   ② 残った画素の**緑かぶりを落とす**（despill）。
   *      緑が赤・青より強い画素は、緑を `max(r,b)` まで下げます。
   *      ⚠️ ①だけだと、抜けなかった半端な画素が**緑がかったまま**残ります。
   */
  const solid = new Uint8Array(W * H);
  for (let p = 0; p < W * H; p += 1) {
    const o = p * C;
    const r = data[o], g = data[o + 1], b = data[o + 2];
    const isKey = g > r + 40 && g > b + 40;
    solid[p] = (!isKey && data[o + 3] > 128) ? 1 : 0;
    if (solid[p] === 1) {
      // ★despill: 緑かぶりを落とす（輪郭の緑の線を消す）
      const cap = Math.max(r, b);
      if (g > cap) data[o + 1] = cap;
    }
  }

  // ★連結成分で塊を拾う
  const label = new Int32Array(W * H).fill(-1);
  const blobs = [];
  const stack = [];
  for (let p0 = 0; p0 < W * H; p0 += 1) {
    if (!solid[p0] || label[p0] >= 0) continue;
    const id = blobs.length;
    let x0 = W, x1 = -1, y0 = H, y1 = -1, n = 0, wx = 0, wy = 0, wn = 0;
    stack.length = 0; stack.push(p0); label[p0] = id;
    while (stack.length > 0) {
      const q = stack.pop();
      const qy = (q / W) | 0, qx = q % W;
      n += 1;
      if (qx < x0) x0 = qx; if (qx > x1) x1 = qx;
      if (qy < y0) y0 = qy; if (qy > y1) y1 = qy;
      // ★ゼッケン布（明るい無彩色）の重心＝胴体の基準点
      const o = q * C;
      const mx = Math.max(data[o], data[o + 1], data[o + 2]);
      const mn = Math.min(data[o], data[o + 1], data[o + 2]);
      if (mx > 195 && (mx - mn) / mx < 0.12) { wx += qx; wy += qy; wn += 1; }
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = qx + dx, ny = qy + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const nq = ny * W + nx;
        if (solid[nq] && label[nq] < 0) { label[nq] = id; stack.push(nq); }
      }
    }
    blobs.push({ x0, x1, y0, y1, n, ax: wn > 0 ? wx / wn : (x0 + x1) / 2, ay: wn > 0 ? wy / wn : (y0 + y1) / 2 });
  }
  const cells = blobs
    .map((b, i) => ({ ...b, id: i }))
    .filter((b) => b.n >= 2000)
    .sort((a2, b2) => a2.x0 - b2.x0);
  if (cells.length === 0) throw new Error('★シートからコマを1つも見つけられません');

  /**
   * ★**基準点から見た必要な余白**を、全コマぶん取ります。
   *   こうすると窓の大きさが揃い、**基準点が窓の同じ位置に来ます**。
   */
  const padL = Math.ceil(Math.max(...cells.map((c) => c.ax - c.x0)));
  const padR = Math.ceil(Math.max(...cells.map((c) => c.x1 - c.ax)));
  const padT = Math.ceil(Math.max(...cells.map((c) => c.ay - c.y0)));
  const padB = Math.ceil(Math.max(...cells.map((c) => c.y1 - c.ay)));
  const boxW = padL + padR + 1;
  const boxH = padT + padB + 1;

  const out = [];
  for (const c of cells) {
    const left = Math.round(c.ax) - padL;
    const top = Math.round(c.ay) - padT;

    /**
     * ★**自分の塊だけを残します。**
     *
     *   ⚠️ 窓（コマの大きさ）は**隣のコマに重なります**（コマ間の隙間 5〜17px に対し
     *      窓は 350px 以上）。塗り分けずに切り出すと、
     *      ★**隣の馬の尾や蹄が一緒に入り、画面に黒い破片が浮きます。** 実際に浮いていました。
     *   → 連結成分の番号で**自分以外を透明にします**。
     */
    const px = Buffer.alloc(boxW * boxH * 4, 0);
    for (let yy = 0; yy < boxH; yy += 1) {
      const sy2 = top + yy;
      if (sy2 < 0 || sy2 >= H) continue;
      for (let xx = 0; xx < boxW; xx += 1) {
        const sx2 = left + xx;
        if (sx2 < 0 || sx2 >= W) continue;
        const sp = sy2 * W + sx2;
        if (label[sp] !== c.id) continue;      // ★自分の塊だけ
        const so = sp * C;
        const dop = (yy * boxW + xx) * 4;
        px[dop] = data[so];
        px[dop + 1] = data[so + 1];
        px[dop + 2] = data[so + 2];
        px[dop + 3] = 255;
      }
    }
    const boxed = await sharp(px, { raw: { width: boxW, height: boxH, channels: 4 } }).png().toBuffer();

    // ★220×140 に収める。**`trim` しません**（したら基準がずれます）
    out.push(await sharp(boxed).resize(220, 140, {
      fit: 'contain', position: 'center', kernel: 'nearest',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    }).png().toBuffer());
  }
  return out;
}

/** 勝負服とゼッケンを塗る（`render-field.mjs` と同じ処理） */
/**
 * ★**番号の大きさは、全コマで1つに揃えます。**
 *
 * ⚠️ 以前はコマごとに独立に決めていました。ゼッケン布の大きさは
 *    **コマごとに 77% もばらつく**（実測: 幅 33〜146px）ので、
 *    ★**走るたびに番号が伸び縮みして見えます。**
 *    オーナーが以前「数字の大きさが揃っていない」と指摘されたのと同じ形が、
 *    今度は**コマ間**で起きていました。
 * → **一番小さい布に収まる大きさ**を選び、全コマで使います。
 */
const scaleCache = new Map();

export async function dressed(frames, frameIdx, gate, commonScale) {
  const color = POST[gate - 1];
  const { data, info } = await sharp(frames[frameIdx]).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  // 勝負服
  for (let i = 0; i < data.length; i += info.channels) {
    if (data[i + 3] < 128) continue;
    const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    const s = mx === 0 ? 0 : d / mx;
    let h = 0;
    if (d !== 0) { if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; h *= 60; if (h < 0) h += 360; }
    if (s >= 0.35 && h >= 200 && h <= 260) {
      const v = mx / 255;
      data[i] = Math.round(color[0] * v); data[i + 1] = Math.round(color[1] * v); data[i + 2] = Math.round(color[2] * v);
    }
  }
  // ゼッケン（白い塊を探して塗る）
  const isCloth = (i, y) => {
    if (data[i + 3] < 128) return false;
    const mx = Math.max(data[i], data[i + 1], data[i + 2]);
    const mn = Math.min(data[i], data[i + 1], data[i + 2]);
    return mx > 195 && (mx === 0 ? 0 : (mx - mn) / mx) < 0.12 && y > 50 && y < 110;
  };
  const W = info.width, H = info.height, seen = new Uint8Array(W * H);
  let best = [];
  for (let p0 = 0; p0 < W * H; p0 += 1) {
    if (seen[p0]) continue;
    if (!isCloth(p0 * info.channels, Math.floor(p0 / W))) { seen[p0] = 1; continue; }
    const st = [p0], blob = []; seen[p0] = 1;
    while (st.length > 0) {
      const q = st.pop(); const qy = Math.floor(q / W), qx = q % W; blob.push([qx, qy]);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = qx + dx, ny = qy + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const n = ny * W + nx; if (seen[n]) continue; seen[n] = 1;
        if (isCloth(n * info.channels, ny)) st.push(n);
      }
    }
    if (blob.length > best.length) best = blob;
  }
  if (best.length >= 100) {
    let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
    for (const [x, y] of best) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
    const on = new Set(best.map(([x, y]) => `${x},${y}`));
    const isEdge = (x, y) => !on.has(`${x - 1},${y}`) || !on.has(`${x + 1},${y}`) || !on.has(`${x},${y - 1}`) || !on.has(`${x},${y + 1}`);
    for (const [x, y] of best) {
      const i = (y * W + x) * info.channels;
      const t = (y - y0) / Math.max(1, ch - 1);
      let k = [1.0, 0.9, 0.8][Math.min(2, Math.floor(t * 3))];
      if (isEdge(x, y)) k *= 0.7;
      const v = Math.max(data[i], data[i + 1], data[i + 2]) / 255;
      data[i] = Math.round(color[0] * v * k); data[i + 1] = Math.round(color[1] * v * k); data[i + 2] = Math.round(color[2] * v * k);
    }
    const num = String(gate);
    let sc = 0, ox = 0, oy = 0;
    for (let c = commonScale ?? 2; c >= 1; c -= 1) {
      const px = x0 + Math.floor((cw - textWidth(num, c)) / 2);
      const py = y0 + Math.floor((ch - GLYPH_H * c) / 2);
      const pix = digitPixels(num, c);
      let out = 0;
      for (const [dx, dy] of pix) if (!on.has(`${px + dx},${py + dy}`)) out += 1;
      // ★共通の大きさを渡されたら、収まらなくても**その大きさで置きます**
      //   （収まりを優先するとコマごとに大きさが変わり、番号が伸び縮みします）
      if (commonScale !== undefined) { sc = c; ox = px; oy = py; break; }
      if (out <= pix.length * 0.2) { sc = c; ox = px; oy = py; break; }
    }
    if (sc > 0) {
      const fg = isDark(color) ? [250, 250, 250] : [15, 15, 15];
      const ol = isDark(color) ? [10, 10, 10] : [245, 245, 245];
      for (const [dx, dy] of outlinePixels(num, sc)) {
        if (!on.has(`${ox + dx},${oy + dy}`)) continue;
        const i = ((oy + dy) * W + ox + dx) * info.channels;
        data[i] = ol[0]; data[i + 1] = ol[1]; data[i + 2] = ol[2];
      }
      for (const [dx, dy] of digitPixels(num, sc)) {
        const i = ((oy + dy) * W + ox + dx) * info.channels;
        data[i] = fg[0]; data[i + 1] = fg[1]; data[i + 2] = fg[2]; data[i + 3] = 255;
      }
    }
  }
  return sharp(data, { raw: { width: W, height: H, channels: info.channels } }).png().toBuffer();
}


/**
 * ★**全コマ共通の番号の大きさ**を決める。
 *   いちばん小さい布に収まる大きさを選びます（大きいほうに合わせると溢れます）。
 */
export async function commonDigitScale(frames, gate) {
  const key = `${frames.length}-${gate}`;
  const hit = scaleCache.get(key);
  if (hit !== undefined) return hit;
  let best = 2;
  for (let i = 0; i < frames.length; i += 1) {
    const { data, info } = await sharp(frames[i]).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const W = info.width, H = info.height, C = info.channels;
    // ★布の連結成分（`dressed` と同じ条件）
    const isCloth = (o, y) => {
      if (data[o + 3] < 128) return false;
      const mx = Math.max(data[o], data[o + 1], data[o + 2]);
      const mn = Math.min(data[o], data[o + 1], data[o + 2]);
      return mx > 195 && (mx === 0 ? 0 : (mx - mn) / mx) < 0.12 && y > 50 && y < 110;
    };
    const seen = new Uint8Array(W * H);
    let blob = 0, bw = 0, bh = 0;
    for (let p0 = 0; p0 < W * H; p0 += 1) {
      if (seen[p0]) continue;
      if (!isCloth(p0 * C, Math.floor(p0 / W))) { seen[p0] = 1; continue; }
      const st = [p0]; seen[p0] = 1;
      let n = 0, x0 = W, x1 = -1, y0 = H, y1 = -1;
      while (st.length > 0) {
        const q = st.pop(); const qy = Math.floor(q / W), qx = q % W;
        n += 1;
        if (qx < x0) x0 = qx; if (qx > x1) x1 = qx;
        if (qy < y0) y0 = qy; if (qy > y1) y1 = qy;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = qx + dx, ny = qy + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const nq = ny * W + nx; if (seen[nq]) continue; seen[nq] = 1;
          if (isCloth(nq * C, ny)) st.push(nq);
        }
      }
      if (n > blob) { blob = n; bw = x1 - x0 + 1; bh = y1 - y0 + 1; }
    }
    const num = String(gate);
    // ★この布に収まる最大の大きさ
    let fits = 1;
    for (let c = 2; c >= 1; c -= 1) {
      if (textWidth(num, c) <= bw - 2 && GLYPH_H * c <= bh - 2) { fits = c; break; }
    }
    if (fits < best) best = fits;
  }
  scaleCache.set(key, best);
  return best;
}
