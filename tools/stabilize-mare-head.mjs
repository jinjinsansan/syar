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
 * 実行: node tools/stabilize-mare-head.mjs --fam side-v8 [--master 1] [--head "cx,cy,rx,ry"] [--feather 18]
 *   ★書き出しは `apps/web/public/art/horse-jockey-<組>m-poseNN.png` と `.webp`（★上書き・★元は git にある）
 */
import sharp from 'sharp';

const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const fam = arg('--fam', 'side-v8');
const master = Number(arg('--master', '1'));
const [hcx, hcy, hrx, hry] = arg('--head', '0.875,0.33,0.13,0.2').split(',').map(Number);
const feather = Number(arg('--feather', '18'));
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
  const stallion = await rgba(`${ART}/horse-jockey-${fam}-pose${nn(i)}.png`);
  const mare = await rgba(`${ART}/horse-jockey-${fam}m-pose${nn(i)}.png`);
  const t = fitHead(stallionM, stallion, cx, cy, rx, ry);
  /** ★逆写し: そのコマの画素 (x, y) → お手本の点（★回転の逆・ずらしの逆） */
  const c = Math.cos(-t.rot), s = Math.sin(-t.rot);
  const out = Buffer.from(mare.data);
  const ecx = cx + t.dx, ecy = cy + t.dy;
  for (let y = 0; y < mare.h; y += 1) for (let x = 0; x < mare.w; x += 1) {
    /** ★そのコマでの 頭の楕円（★お手本の楕円を 動かしたもの）の内側か */
    const ux = x - ecx, uy = y - ecy;
    const mx = cx + ux * c - uy * s, my = cy + ux * s + uy * c;
    const dn = Math.sqrt(((mx - cx) / rx) ** 2 + ((my - cy) / ry) ** 2);
    const edge = feather / Math.min(rx, ry);
    const a = dn <= 1 - edge ? 1 : dn >= 1 ? 0 : (1 - dn) / edge;
    if (a === 0) continue;
    const p = sample(mareM, mx, my);
    const k = (y * mare.w + x) * 4;
    /** ★透明どうしの混ぜで 縁が黒ずまないよう ★不透明度で重みを付けて混ぜる */
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
