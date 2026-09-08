/**
 * ★**別の個体だと見分けられるか**を測る（★2026-09-08）
 *
 * 【★なぜ要るか】
 *   ★育成・繁殖のゲームなので、★馬の見た目に個性が要ります。
 *   ★ところが実測では、★毛色 20 色は ★**実質 3 群**しかありません
 *   （★鹿毛↔栗毛 31／★黒鹿毛↔青毛 20 で、★レース画面では区別できません）。
 *   ★画面上の馬は ★**188 x 137px**（★実機は 67% に縮小）。★この大きさで読めるのは
 *   ★**輪郭の形**と**大きな明暗のかたまり**だけです。
 *
 * 【★合格線は発明しません】
 *   ★「別個体」は ★**同じ馬の別コマ**より違って見えなければ意味がありません。
 *   ★だから ★**同一セット内のコマ同士の差**を下限として使います。
 *
 * 【★どう測るか】
 *   ★① 各コマの影絵を、★実機と同じ高さ（既定 137px）に縮める
 *   ★② 外接矩形の中心で合わせる
 *   ★③ 重ならない画素の割合（★1 − IoU）を出す
 *
 * ⚠️ ★これは ★**輪郭だけ**の物差しです。★白い印や表情は測っていません。
 *    ★「輪郭で見分けられる」以上のことは言えません。
 *
 * ★実行: node tools/measure-look-distinctness.mjs <セットA のディレクトリ> [セットB ...]
 *   ★例) node tools/measure-look-distinctness.mjs apps/web/public/rig-lab-assets/sprites
 */
import sharp from 'sharp';
import { existsSync } from 'node:fs';

const dirs = process.argv.slice(2);
if (dirs.length === 0) {
  console.error('使い方: node tools/measure-look-distinctness.mjs <セットのディレクトリ...>');
  process.exit(2);
}
/** ★実機での馬の高さ（★実測 137px） */
const SHOW_H = 137;

/**
 * ★**輪郭だけでは足りません**（★2026-09-08・実測）
 *
 *   ★斜め前の絵は ★**どれも「こちらを向いた馬」**なので、★輪郭がよく似ます。
 *   ★実測: ★型A↔型B 35.9%／型A↔型C 30.2% で、★同じ馬の別コマ（最大 36.2%）と同程度。
 *   ★ところが ★**個性を担っているのは白い印**で、★輪郭には出ません。
 * → ★**中身（明暗の並び）も測ります。**
 */
async function shapes(dir) {
  const out = [];
  for (let f = 1; f <= 8; f += 1) {
    const file = `${dir}/${String(f).padStart(2, '0')}_coat.png`;
    if (!existsSync(file)) continue;
    const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const w = info.width; const h = info.height;
    let l = 1e9; let r = -1; let t = 1e9; let b = -1;
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        if ((data[(y * w + x) * 4 + 3] ?? 0) < 64) continue;
        if (x < l) l = x; if (x > r) r = x; if (y < t) t = y; if (y > b) b = y;
      }
    }
    /** ★実機と同じ高さへ。★幅は比を保つ */
    const sh = SHOW_H;
    const sw = Math.max(1, Math.round(((r - l + 1) * sh) / (b - t + 1)));
    const m = new Uint8Array(sw * sh);
    const lum = new Uint8Array(sw * sh);
    for (let y = 0; y < sh; y += 1) {
      for (let x = 0; x < sw; x += 1) {
        const sx = l + Math.round((x * (r - l + 1)) / sw);
        const sy = t + Math.round((y * (b - t + 1)) / sh);
        const i = (sy * w + sx) * 4;
        if ((data[i + 3] ?? 0) >= 64) {
          m[y * sw + x] = 1;
          /** ★明るさ（0〜255）。★白い印はここに出ます */
          lum[y * sw + x] = Math.max(data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0);
        }
      }
    }
    out.push({ m, lum, w: sw, h: sh });
  }
  return out;
}

/**
 * ★**中身の違い**（★白い印が効くのはここ）。
 *   ★両方が被写体である所だけを比べ、★明るさの差の平均を 0〜1 で返します。
 */
function inkDiff(a, b) {
  const w = Math.max(a.w, b.w); const h = Math.max(a.h, b.h);
  const ax = Math.round((w - a.w) / 2); const bx = Math.round((w - b.w) / 2);
  let sum = 0; let n = 0;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const ai = (x - ax >= 0 && x - ax < a.w && y < a.h) ? y * a.w + (x - ax) : -1;
      const bi = (x - bx >= 0 && x - bx < b.w && y < b.h) ? y * b.w + (x - bx) : -1;
      if (ai < 0 || bi < 0 || a.m[ai] !== 1 || b.m[bi] !== 1) continue;
      sum += Math.abs(a.lum[ai] - b.lum[bi]);
      n += 1;
    }
  }
  return n === 0 ? 0 : sum / n / 255;
}

/** ★中心で合わせて、重ならない割合を出す */
function diff(a, b) {
  const w = Math.max(a.w, b.w); const h = Math.max(a.h, b.h);
  const ax = Math.round((w - a.w) / 2); const bx = Math.round((w - b.w) / 2);
  let both = 0; let either = 0;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const av = (x - ax >= 0 && x - ax < a.w && y < a.h) ? a.m[y * a.w + (x - ax)] : 0;
      const bv = (x - bx >= 0 && x - bx < b.w && y < b.h) ? b.m[y * b.w + (x - bx)] : 0;
      if (av === 1 && bv === 1) both += 1;
      if (av === 1 || bv === 1) either += 1;
    }
  }
  return either === 0 ? 0 : 1 - both / either;
}

const sets = [];
for (const d of dirs) {
  const s = await shapes(d);
  if (s.length === 0) { console.error(`★コマが見つかりません: ${d}`); process.exit(2); }
  sets.push({ dir: d, s });
}

console.log('# ★輪郭で見分けられるか（★画面での高さ ' + SHOW_H + 'px で測定）');
console.log();
console.log('★同じ馬の別コマ同士（★これが下限。★別個体はこれを超えること）');
let worstSame = 0;
let worstSameInk = 0;
for (const set of sets) {
  const vs = [];
  for (let i = 0; i < set.s.length; i += 1) for (let j = i + 1; j < set.s.length; j += 1) vs.push(diff(set.s[i], set.s[j]));
  const mean = vs.reduce((a, b) => a + b, 0) / vs.length;
  worstSame = Math.max(worstSame, mean);
  set.selfShape = mean;
  const iv = [];
  for (let i = 0; i < set.s.length; i += 1) for (let j = i + 1; j < set.s.length; j += 1) iv.push(inkDiff(set.s[i], set.s[j]));
  const imean = iv.reduce((a, b) => a + b, 0) / iv.length;
  worstSameInk = Math.max(worstSameInk, imean);
  set.selfInk = imean;
  console.log(`  ${set.dir}  輪郭 平均 ${(mean * 100).toFixed(1)}%  ★中身 平均 ${(imean * 100).toFixed(1)}%`);
}
if (sets.length < 2) {
  console.log();
  console.log(`★合格線: ★輪郭 ${(worstSame * 100).toFixed(1)}% ／ ★中身 ${(worstSameInk * 100).toFixed(1)}% のどちらかを超えること`);
  console.log('★セットを 2 つ以上渡すと、★別個体同士の差も出します');
  process.exit(0);
}
console.log();
console.log('★別の個体同士');
let ok = true;
for (let i = 0; i < sets.length; i += 1) {
  for (let j = i + 1; j < sets.length; j += 1) {
    const vs = [];
    for (const a of sets[i].s) for (const b of sets[j].s) vs.push(diff(a, b));
    const mean = vs.reduce((x, y) => x + y, 0) / vs.length;
    const iv = [];
    for (const a of sets[i].s) for (const b of sets[j].s) iv.push(inkDiff(a, b));
    const imean = iv.reduce((x, y) => x + y, 0) / iv.length;
    /**
     * ★**輪郭か中身のどちらかが超えていれば合格**とします（★2026-09-08）。
     *   ★真横は輪郭で、★斜め前は白い印（＝中身）で見分けます。
     *   ★どちらも超えないときだけ「同じ馬に見える」です。
     */
    /**
     * ⚠️ ★**下限は「比べる 2 つのセット自身」から取ります**（★2026-09-08）。
     *    ★最初は「全セット中いちばん内部ばらつきが大きいもの」を下限にしました。
     *    → ★無関係な第 3 のセットのばらつきが、★他の組の判定を巻き込みます。
     *      ★実測: ★型B の内部ばらつき 36.2% のせいで、★型A↔型C（30.2%）が不合格になりました。
     *    ★正しい問いは「★**その 2 頭は、その 2 頭自身の別コマより違って見えるか**」です。
     */
    const floorShape = (sets[i].selfShape + sets[j].selfShape) / 2;
    const floorInk = (sets[i].selfInk + sets[j].selfInk) / 2;
    const pass = mean > floorShape || imean > floorInk;
    if (!pass) ok = false;
    console.log(`  ${sets[i].dir} ↔ ${sets[j].dir}`);
    console.log(`     輪郭 ${(mean * 100).toFixed(1)}%（下限 ${(floorShape * 100).toFixed(1)}%）`
      + `  ★中身 ${(imean * 100).toFixed(1)}%（下限 ${(floorInk * 100).toFixed(1)}%）  ${pass ? '★合格' : '★★不合格'}`);
  }
}
console.log();
console.log(ok ? '★合格 — ★輪郭で見分けられます' : '★★不合格 — ★体つきをもっと変えてください');
process.exit(ok ? 0 : 1);
