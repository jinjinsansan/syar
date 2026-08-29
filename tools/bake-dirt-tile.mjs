/**
 * ★**ダートの地面タイルを焼く**（`world-dirt.png` / `.webp` を新規に作る）
 *
 * 【★裁定 `REVIEW_P4_GAMMA_V6_DIRT_VERDICT_20260828.md` §6-4 の条件 4 つ】
 *   1. ★**承認済みの芝タイルを差し替えない** → `world-turf.*` には触れません。★新規追加のみ
 *   2. ★**ダート素材は新たに承認を取る**（芝の承認は継承しない）→ 焼くだけ。★採用はオーナー判断
 *   3. ★**実在競馬場の写真を模写しない**（憲法 §0.1）→ ★写真を一切読みません。
 *      ★色は `palette.json` の `dirt-0`〜`dirt-3` から、★形は下の手続きだけで作ります
 *   4. ★**登録簿に載せる**（R-24）→ `tools/lib/classification.mjs` に登録済み
 *
 * 【★決定論】
 *   ⚠️ ★`Math.random()` / `Date.now()` を使いません（憲法 4）。
 *      ★種を固定した線形合同法だけで作ります。★何度焼いても同じ絵が出ます。
 *
 * 【★継ぎ目が出ないこと】
 *   ⚠️ ★`world-textured.ts` はタイルを**縦横ともに巻き戻して**貼ります（`wrap()`）。
 *      ★継ぎ目のあるタイルを渡すと、★**走路に等間隔の縞が出ます**。
 *   ★格子の添字を**タイル幅・高さで剰余を取って**巻くので、四辺が必ず一致します。
 *
 * 実行: npx tsx tools/bake-dirt-tile.mjs
 * 出力: apps/web/public/art/parallax/backstretch-side-v1/world-dirt.png / .webp
 */
import { createCanvas } from '@napi-rs/canvas';
import sharp from 'sharp';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const DIR = path.resolve('apps/web/public/art/parallax/backstretch-side-v1');
const MANIFEST = path.join(DIR, 'manifest.json');
const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));

/** ★芝タイルと**同じ寸法・同じ px/m** にすること。違えると流れる速さが芝と変わります */
const W = manifest.world.turf.tileWidth;
const H = manifest.world.turf.tileHeight;
const PX_PER_M = manifest.world.turf.pxPerM;

/** ★色は `palette.json` から引く（同じ量を 2 か所に持たない・D-052） */
const palette = JSON.parse(readFileSync(path.resolve('apps/web/public/art/palette.json'), 'utf8'));
const hex = (k) => {
  const v = palette[k];
  if (typeof v !== 'string') throw new Error(`★palette.json に ${k} がありません`);
  return [parseInt(v.slice(1, 3), 16), parseInt(v.slice(3, 5), 16), parseInt(v.slice(5, 7), 16)];
};
/**
 * ★**基調を 1 段暗い側へ落とす**（2026-08-29・オーナー指摘「★走り方が芝と違って見える」3 回目）
 *
 * 【★前便が測っていなかった量（R-22）】
 *   ★前便は**タイル単体の絶対 sd** を測り、芝 4.24 / ダート 4.08 で「一致」としました。
 *   ⚠️ ★しかし画面に出るのは **タイル ＋ 上塗り（SHADE / TRACK_TINT）** の合成で、
 *      ★**見た目のコントラストは「地面の明るさに対する比」**です（Weber）。
 *   ★実画面の実測（`tools/_groundcontrast.mjs`・seed 42・6 場面）:
 *
 *        地面の明るさ  芝 97 → ★ダート 115
 *        相対コントラスト  芝 13.09% → ★ダート 10.30%（★芝の 79%）
 *        ★正面のカットでは **47〜53%** まで落ちる
 *
 *   → ★**絶対の振れは足りていた。平均が明るすぎた。**
 *
 * 【★なぜ「全体を暗く掛け算」ではないか】
 *   ⚠️ ★RGB を一律 k 倍すると平均も sd も同じだけ縮むので、★**比は 1 ミリも動きません。**
 *      ★しかも上塗り（`TRACK_TINT`）は掛け算の外にある加算項なので、
 *      ★掛け算だけすると ★**比はかえって下がります**（試算 10.4% → 8.5%）。
 *   → ★**幅を保ったまま平均を下げる**。役割を 1 段ずつ暗い側へ送り、
 *      ★明るい側は `dirt-0` に残して**幅はむしろ広げます**（64 → 89）。
 *
 * ⚠️ ★色は `palette.json` の役割名からのみ引きます（裁定 §6-4 条件 3）。
 */
const LIGHT = hex('dirt-0');   // #b09472 乾いた砂（★明るい側は据え置き＝幅を広げる）
const BASE = hex('dirt-2');    // #6d5236 基調（★`dirt-1` から 1 段下げた＝平均を落とす）
const DARK = hex('dirt-3');    // #4f3a25 湿った砂・轍（★`dirt-2` から 1 段下げた）
const DEEP = hex('dirt-3');    // #4f3a25 影・轍

/** ★種を固定した線形合同法（`Math.random()` を使わないため・憲法 4） */
function lcg(seed) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

/**
 * ★**巻いて繋がる値ノイズ**。
 *   格子を `gx × gy` で張り、添字を剰余で巻くので、★タイルの四辺が必ず一致します。
 */
function wrappedNoise(gx, gy, rnd) {
  const grid = Array.from({ length: gy }, () => Array.from({ length: gx }, () => rnd()));
  const smooth = (t) => t * t * (3 - 2 * t);
  return (u, v) => {
    const x = u * gx, y = v * gy;
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const fx = smooth(x - x0), fy = smooth(y - y0);
    const a = grid[y0 % gy][x0 % gx], b = grid[y0 % gy][(x0 + 1) % gx];
    const c = grid[(y0 + 1) % gy][x0 % gx], d = grid[(y0 + 1) % gy][(x0 + 1) % gx];
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
  };
}

const rnd = lcg(20260828);
/**
 * ★**層の張り方**。
 *
 * ⚠️ ★ここは 1 枚目で**進行方向に平坦すぎ**ました。
 *    実測: ★**行方向のばらつき sd 1.68**（芝は 4.24）。
 *    ★見た目の速さは**画面上の地面の流れ**で決まるので、
 *    ★地面が平坦だと**脚だけ動いて進んでいないように見えます**
 *    （オーナー評「走り方がぎこちない」・2026-08-29）。
 * ★`gy`（進行方向の格子数）を増やし、★低い層の重みを上げます。
 */
const n1 = wrappedNoise(10, 5, rnd);
const n2 = wrappedNoise(34, 14, rnd);
const n3 = wrappedNoise(150, 40, rnd);
/**
 * ★**ハロー目（整地の筋）は不規則にする。**
 *   ⚠️ ★ 1 枚目は `sin` で**0.385m ごとの規則的な縞**にしました。
 *      ★ 16m/s だと**毎秒 41 本**流れ、★模様ではなく**ちらつき**になります。
 *   ★周期を長く（約 0.8〜2.3m）し、★位置を揺らして規則性を消します。
 */
const harrowJitter = wrappedNoise(6, 3, rnd);

const canvas = createCanvas(W, H);
const ctx = canvas.getContext('2d');
const img = ctx.createImageData(W, H);
const mix = (a, b, t) => a + (b - a) * t;

for (let y = 0; y < H; y += 1) {
  for (let x = 0; x < W; x += 1) {
    const u = x / W, v = y / H;
    /** ★3 層を重ねて 0〜1 に。★細かい層ほど弱く */
    let t = n1(u, v) * 0.52 + n2(u, v) * 0.33 + n3(u, v) * 0.15;
    /**
     * ★**整地の筋**。★位置を揺らして規則性を消します。
     *   ★周期はタイル高さの 1〜3 本（約 0.8〜2.3m）。★振幅も上げました。
     */
    t += Math.sin((v + harrowJitter(u, v) * 0.5) * Math.PI * 2 * 2) * 0.07;
    /**
     * ★**進行方向の大きな濃淡**（湿っている帯と乾いている帯）。
     *   ★これが**流れを読ませる主力**です。芝の行方向 sd 4.24 に寄せます。
     */
    t += (n1(u * 0.25 + 0.37, v) - 0.5) * 0.34;
    t = Math.max(0, Math.min(1, t));

    /** ★暗い側 → 基調 → 明るい側 の 3 点補間 */
    let r; let g; let b;
    if (t < 0.5) {
      const k = t / 0.5;
      r = mix(DARK[0], BASE[0], k); g = mix(DARK[1], BASE[1], k); b = mix(DARK[2], BASE[2], k);
    } else {
      const k = (t - 0.5) / 0.5;
      r = mix(BASE[0], LIGHT[0], k); g = mix(BASE[1], LIGHT[1], k); b = mix(BASE[2], LIGHT[2], k);
    }

    /**
     * ★**砂粒**。★1 画素ごとの散らばりで、のっぺりを消します。
     *   ⚠️ ★これは巻きに関係しません（画素ごとに独立）。継ぎ目には出ません。
     */
    const grain = (rnd() - 0.5) * 18;
    r += grain; g += grain * 0.95; b += grain * 0.85;

    /** ★ごく稀に深い影（小石・轍の跡）。★1% 未満 */
    if (rnd() < 0.006) { r = mix(r, DEEP[0], 0.55); g = mix(g, DEEP[1], 0.55); b = mix(b, DEEP[2], 0.55); }

    const i = (y * W + x) * 4;
    img.data[i] = Math.max(0, Math.min(255, Math.round(r)));
    img.data[i + 1] = Math.max(0, Math.min(255, Math.round(g)));
    img.data[i + 2] = Math.max(0, Math.min(255, Math.round(b)));
    img.data[i + 3] = 255;
  }
}
ctx.putImageData(img, 0, 0);

const png = canvas.toBuffer('image/png');
writeFileSync(path.join(DIR, 'world-dirt.png'), png);
await sharp(png).webp({ quality: 92 }).toFile(path.join(DIR, 'world-dirt.webp'));

/** ★`manifest.json` に登録する（★`turf` は触らない） */
manifest.world.dirt = { file: 'world-dirt.png', tileWidth: W, tileHeight: H, pxPerM: PX_PER_M };
writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

/** ★継ぎ目が本当に無いか、自分で測って出す（R-3: 測らずに「継ぎ目なし」と言わない） */
const at = (x, y) => { const i = (y * W + x) * 4; return [img.data[i], img.data[i + 1], img.data[i + 2]]; };
const diff = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
let hSeam = 0; let hInner = 0;
for (let y = 0; y < H; y += 1) { hSeam += diff(at(W - 1, y), at(0, y)); hInner += diff(at(W - 2, y), at(W - 1, y)); }
let vSeam = 0; let vInner = 0;
for (let x = 0; x < W; x += 1) { vSeam += diff(at(x, H - 1), at(x, 0)); vInner += diff(at(x, H - 2), at(x, H - 1)); }
console.log(`★焼きました  ${W}×${H}px  ${PX_PER_M}px/m（＝${(W / PX_PER_M).toFixed(2)}m × ${(H / PX_PER_M).toFixed(2)}m）`);
console.log('★継ぎ目の検査（隣り合う画素の差の平均・小さいほど繋がっている）');
console.log(`   左右のつなぎ目 ${(hSeam / H).toFixed(1)}  ／ タイル内部のふつうの隣同士 ${(hInner / H).toFixed(1)}`);
console.log(`   上下のつなぎ目 ${(vSeam / W).toFixed(1)}  ／ タイル内部のふつうの隣同士 ${(vInner / W).toFixed(1)}`);
console.log('   ★つなぎ目が内部と同じ程度なら、貼っても縞は出ません。');
