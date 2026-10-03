/**
 * ★**牝馬の顔を 8 コマで同じにする**（★2026-10-03・オーナー「牝馬の顔が揺れながら走る・違和感がある揺れ方」）。
 *
 * 【なぜ】
 *   ★牝馬のコマは Codex に 1 コマずつ描かせた（`gen-race-mare.mjs`）ので、★目の大きさ・眉・耳・鼻先が コマごとに少しずつ違い、
 *   ★走ると 顔だけが別の揺れ方をした。★牡馬の元のコマは 8 コマで同じ顔（★1 枚のシートから切った）。
 *
 * 【やること】
 *   ★お手本の 1 コマ（`--master`）の 牝馬の顔を、★**牡馬の元のコマで 頭がどう動いているか**（★位置と傾き）に合わせて 各コマへ貼る。
 *   ★頭の動きは ★牡馬の元のコマどうしの 頭の領域を合わせて測る（★お手本のコマ → そのコマ・±40px・±8°）。
 *   ★貼る範囲は 頭（`--head` の楕円）を ★縁 `--feather` px でなめらかに混ぜる。★首から後ろ・騎手は そのコマのまま。
 *
 * 【★2026-10-03 やり直し（★オーナー「鼻のパーツが切れたりするように絵が破綻」）】
 *   ⚠️ ★最初の版は ★頭を楕円で切り抜いて貼った。★楕円の右端が鼻先にかかり、★頭がずれるコマで鼻先が楕円の外に出て
 *      ★貼った鼻と元の鼻が混ざった（★歩き 8 コマ中 5 コマ）。
 *   → ★貼る範囲は ★**首の切れ目の線より前 全部**（`--cut`・★頭・鼻・顎・まわりの背景まで丸ごと お手本で置き換える）。
 *     ★元の顔は 1 画素も残らない。★混ぜるのは 首の切れ目の線の近く（`--feather`）だけ。
 *
 * 実行: node tools/stabilize-mare-head.mjs --fam side-v8 [--master 1] --head "cx,cy,rx,ry" --cut "x1,y1,x2,y2" --ybounds "y0,y1" [--feather 14] [--frames "3,4,5"]
 *   ★`--head` は 頭の動きを測る範囲（楕円）。★`--cut` は 首の切れ目（★画布の割合の 2 点・★右＝頭の側を置き換える）。
 *   ★書き出しは `apps/web/public/art/horse-jockey-<組>m-poseNN.png` と `.webp`（★上書き・★元は git にある）
 */
import sharp from 'sharp';

const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const fam = arg('--fam', 'side-v8');
const master = Number(arg('--master', '1'));
const [hcx, hcy, hrx, hry] = arg('--head', '0.875,0.33,0.13,0.2').split(',').map(Number);
const feather = Number(arg('--feather', '14'));
const cutArg = arg('--cut', null);
if (cutArg === null) throw new Error('★--cut が要ります（★首の切れ目・楕円で切ると鼻先が切れる）');
const [c1x, c1y, c2x, c2y] = cutArg.split(',').map(Number);
const [yb0, yb1] = arg('--ybounds', '0,1').split(',').map(Number);
/**
 * ★`--floor "x1,y1,x2,y2"`（★任意）: ★この線より下は置き換えない（★顎の下に沿わせる）。
 *   ★走りは 前脚が頭の下まで伸びるので、★`--cut` の右を全部置き換えると ★前脚の欠片が混ざった（★2026-10-03 撮って確認）。
 */
/**
 * ★`--frames "3,4,5"`（★任意）: ★置き換えるコマ（★既定は 8 コマ全部）。
 *   ★斜め前は ★牡馬の元のコマでも 1・2 コマが横向き・3〜8 コマが正面で ★頭の向きそのものが変わる（★2026-10-03 撮って確認）。
 *   ★向きの違うコマに お手本の顔を貼ると 向きが壊れるので、★同じ向きのコマだけを 1 組にする。
 */
const onlyFrames = arg('--frames', null)?.split(',').map(Number) ?? null;
const floorArg = arg('--floor', null);
const floor = floorArg === null ? null : floorArg.split(',').map(Number);
const nn = (i) => String(i).padStart(2, '0');
const ART = 'apps/web/public/art';

async function rgba(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height };
}
/** ★画素を 双一次で読む（★外は透明） */
function sample(img, x, y) {
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  const out = [0, 0, 0, 0];
  for (const [dx, dy, wgt] of [[0, 0, (1 - fx) * (1 - fy)], [1, 0, fx * (1 - fy)], [0, 1, (1 - fx) * fy], [1, 1, fx * fy]]) {
    const xx = x0 + dx, yy = y0 + dy;
    if (xx < 0 || yy < 0 || xx >= img.w || yy >= img.h) continue;
    const i = (yy * img.w + xx) * 4;
    for (let c = 0; c < 4; c += 1) out[c] += img.data[i + c] * wgt;
  }
  return out;
}
/** ★お手本のコマの点 p を そのコマへ写す（★頭の中心まわりに 回して ずらす） */
const mapPoint = (t, cx, cy, x, y) => {
  const c = Math.cos(t.rot), s = Math.sin(t.rot);
  return [cx + (x - cx) * c - (y - cy) * s + t.dx, cy + (x - cx) * s + (y - cy) * c + t.dy];
};
/** ★頭の領域で お手本 → そのコマ の動き（★牡馬どうし・輝度の差の最小） */
function fitHead(a, b, cx, cy, rx, ry) {
  const pts = [];
  for (let y = cy - ry; y <= cy + ry; y += 3) for (let x = cx - rx; x <= cx + rx; x += 3) {
    if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 > 1) continue;
    const i = (Math.round(y) * a.w + Math.round(x)) * 4;
    if (a.data[i + 3] < 128) continue;
    pts.push([x, y, a.data[i] * 0.3 + a.data[i + 1] * 0.59 + a.data[i + 2] * 0.11]);
  }
  const cost = (t) => {
    let e = 0;
    for (const [x, y, l] of pts) {
      const [u, v] = mapPoint(t, cx, cy, x, y);
      const p = sample(b, u, v);
      e += p[3] < 128 ? 255 : Math.abs(l - (p[0] * 0.3 + p[1] * 0.59 + p[2] * 0.11));
    }
    return e / pts.length;
  };
  let best = { dx: 0, dy: 0, rot: 0 }; let be = cost(best);
  for (const [step, span, rstep, rspan] of [[4, 40, 2, 8], [1, 4, 0.5, 2], [0.5, 1, 0.25, 0.5]]) {
    const base = best;
    for (let r = -rspan; r <= rspan + 1e-9; r += rstep) for (let dy = -span; dy <= span; dy += step) for (let dx = -span; dx <= span; dx += step) {
      const t = { dx: base.dx + dx, dy: base.dy + dy, rot: base.rot + (r * Math.PI) / 180 };
      const e = cost(t);
      if (e < be) { be = e; best = t; }
    }
  }
  return { ...best, err: be };
}

const stallionM = await rgba(`${ART}/horse-jockey-${fam}-pose${nn(master)}.png`);
const mareM = await rgba(`${ART}/horse-jockey-${fam}m-pose${nn(master)}.png`);
const cx = hcx * stallionM.w, cy = hcy * stallionM.h, rx = hrx * stallionM.w, ry = hry * stallionM.h;
for (let i = 1; i <= 8; i += 1) {
  if (i === master) { console.log(`コマ ${i}: お手本（そのまま）`); continue; }
  if (onlyFrames !== null && !onlyFrames.includes(i)) { console.log(`コマ ${i}: 対象外（そのまま）`); continue; }
  const stallion = await rgba(`${ART}/horse-jockey-${fam}-pose${nn(i)}.png`);
  const mare = await rgba(`${ART}/horse-jockey-${fam}m-pose${nn(i)}.png`);
  const t = fitHead(stallionM, stallion, cx, cy, rx, ry);
  /** ★逆写し: そのコマの画素 (x, y) → お手本の点（★回転の逆・ずらしの逆） */
  const c = Math.cos(-t.rot), s = Math.sin(-t.rot);
  const out = Buffer.from(mare.data);
  const ecx = cx + t.dx, ecy = cy + t.dy;
  /** ★首の切れ目の線（★お手本の座標・★画素）と ★頭の側の向き（★右） */
  const ax = c1x * mare.w, ay = c1y * mare.h, bx = c2x * mare.w, by = c2y * mare.h;
  let nxv = by - ay, nyv = -(bx - ax);
  const nl = Math.hypot(nxv, nyv); nxv /= nl; nyv /= nl;
  if (nxv < 0) { nxv = -nxv; nyv = -nyv; }
  for (let y = 0; y < mare.h; y += 1) for (let x = 0; x < mare.w; x += 1) {
    /** ★そのコマの画素 → お手本の点（★頭の動きの逆） */
    const ux = x - ecx, uy = y - ecy;
    const mx = cx + ux * c - uy * s, my = cy + ux * s + uy * c;
    if (my < yb0 * mare.h || my > yb1 * mare.h) continue;
    if (floor !== null) {
      const fx1 = floor[0] * mare.w, fy1 = floor[1] * mare.h, fx2 = floor[2] * mare.w, fy2 = floor[3] * mare.h;
      const fyAt = fy1 + ((mx - fx1) / (fx2 - fx1)) * (fy2 - fy1);
      if (my > fyAt) continue;
    }
    /** ★首の切れ目の線から 頭の側へ どれだけ入っているか（px） */
    const dist = (mx - ax) * nxv + (my - ay) * nyv;
    if (dist <= -feather) continue;
    const a = dist >= feather ? 1 : (dist + feather) / (2 * feather);
    const p = sample(mareM, mx, my);
    const k = (y * mare.w + x) * 4;
    const aSrc = (p[3] / 255) * a, aDst = (mare.data[k + 3] / 255) * (1 - a);
    const aOut = aSrc + aDst;
    for (let ch = 0; ch < 3; ch += 1) out[k + ch] = aOut === 0 ? 0 : Math.round((p[ch] * aSrc + mare.data[k + ch] * aDst) / aOut);
    out[k + 3] = Math.round(aOut * 255);
  }
  const png = `${ART}/horse-jockey-${fam}m-pose${nn(i)}.png`;
  await sharp(out, { raw: { width: mare.w, height: mare.h, channels: 4 } }).png({ compressionLevel: 9 }).toFile(png);
  await sharp(png).webp({ quality: 88, alphaQuality: 95, effort: 5 }).toFile(png.replace(/\.png$/, '.webp'));
  console.log(`コマ ${i}: 頭の動き dx ${t.dx.toFixed(1)} dy ${t.dy.toFixed(1)} 傾き ${((t.rot * 180) / Math.PI).toFixed(2)}°（合わせの差 ${t.err.toFixed(1)}）`);
}
