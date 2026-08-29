/**
 * ★**横からの画のダート版を焼く**（`turf-far/mid/near` → `dirt-far/mid/near`）
 *
 * 【★なぜ「描き直し」ではなく「置き換え」なのか】
 *   ★側面の板は**焼き込み済み**で、ラチの位置・遠近の帯・光の当たり方がすべて絵に入っています。
 *   ★ゼロから描くと、★**同じ場所にラチが来ない**＝馬の足元と地面がずれます。
 *   → ★**芝の板の「形と陰影」を残したまま、色だけを砂へ移します。**
 *
 * 【★やること（1 画素ごと）】
 *   1. ★透明度（α）はそのまま。★板の形は 1 画素も動かしません
 *   2. ★明るさ（輝度）を取り出し、★`palette.json` の `dirt-2` → `dirt-1` → `dirt-0` の
 *      3 点に載せ替える。★**陰影は残り、色だけが砂になります**
 *   3. ★細かい砂粒を足す（芝の葉の筋が残って「茶色い芝」に見えるのを消すため）
 *
 * 【★裁定 `REVIEW_P4_GAMMA_V6_DIRT_VERDICT_20260828.md` §6-4 の条件 4 つ】
 *   1. ★**承認済みの芝の板を差し替えない** → 読むだけ。★書くのは `dirt-*.png` の新規
 *   2. ★**ダート素材は新たに承認を取る**（芝の承認は継承しない）
 *   3. ★**実在競馬場の写真を模写しない** → ★**我々の承認済み素材だけ**を入力にします
 *   4. ★**登録簿に載せる**（R-24）→ 登録済み
 *
 * ⚠️ ★`Math.random()` / `Date.now()` を使いません（憲法 4）。種を固定した線形合同法だけです。
 *
 * 実行: npx tsx tools/bake-dirt-plates.mjs
 * 出力: apps/web/public/art/parallax/backstretch-side-v1/dirt-{far,mid,near}.png
 */
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const DIR = path.resolve('apps/web/public/art/parallax/backstretch-side-v1');
const MANIFEST = path.join(DIR, 'manifest.json');
const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));

const palette = JSON.parse(readFileSync(path.resolve('apps/web/public/art/palette.json'), 'utf8'));
const hex = (k) => {
  const v = palette[k];
  if (typeof v !== 'string') throw new Error(`★palette.json に ${k} がありません`);
  return [parseInt(v.slice(1, 3), 16), parseInt(v.slice(3, 5), 16), parseInt(v.slice(5, 7), 16)];
};
/**
 * ★**輝度の幅を芝の板に合わせる**（2026-08-29）。
 *
 * ⚠️ ★ 1 枚目は `dirt-2`〜`dirt-0`（輝度 87〜153）に載せ、さらに 0.78 倍に圧縮しました。
 *    実測: ★**列方向（進行方向）の sd が 1.88**。芝の板は **3.31**。★半分でした。
 *    ★見た目の速さは地面の流れで決まるので、★**走りがぎこちなく見えました**
 *    （オーナー評・2026-08-29。地面タイルを直したあとも残っていた）。
 * ★暗い側を `dirt-3` まで下げ、明るい側を上げて、圧縮もやめます。
 */
/**
 * ★**基調を 1 段暗い側へ落とす**（2026-08-29・タイルと同じ手当て）
 *
 *   ★上の註記は「**幅**が足りない」ことへの手当てでした（sd 1.88 → 3.96）。★幅は足りました。
 *   ⚠️ ★足りていなかったのは ★**平均の明るさ**のほうです。
 *      ★実画面の実測（`tools/_groundcontrast.mjs`・20s `side-drive`＝板のカット）:
 *        ★明るさ 芝 103 → ダート 118 ／ 相対コントラスト 17.67% → **14.56%**（芝の 82%）
 *
 * ⚠️ ★`LIGHT` は 16 進が直書きされていました（`[0xd2, 0xb8, 0x96]`）。
 *    ★`palette.json` から役割名で引く規則（裁定 §6-4 条件 3）の例外になっていたので、
 *    ★併せて役割名に戻します。
 */
const LIGHT = hex('dirt-0');        // ★乾いた砂（★直書きの #d2b896 から役割名へ戻した）
const BASE = hex('dirt-2');         // ★基調（★`dirt-1` から 1 段下げた＝平均を落とす）
const DARK = hex('dirt-3');         // ★湿った砂・轍

/** ★種を固定した線形合同法（憲法 4） */
let seed = 20260828 >>> 0;
const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };

const mix = (a, b, t) => a + (b - a) * t;
const PAIRS = [['turf-far', 'dirt-far'], ['turf-mid', 'dirt-mid'], ['turf-near', 'dirt-near']];

for (const [src, dst] of PAIRS) {
  const img = await loadImage(path.join(DIR, `${src}.png`));
  const W = img.width; const H = img.height;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, W, H);

  /**
   * ★**輝度の範囲を先に測ってから載せ替える。**
   *   ⚠️ ★決め打ちの範囲で正規化すると、★**板ごとに明るさが揃わず、遠近で色が飛びます**。
   */
  let lo = 255; let hi = 0;
  for (let i = 0; i < data.data.length; i += 4) {
    if (data.data[i + 3] < 8) continue;
    const l = 0.299 * data.data[i] + 0.587 * data.data[i + 1] + 0.114 * data.data[i + 2];
    if (l < lo) lo = l;
    if (l > hi) hi = l;
  }
  const span = Math.max(1, hi - lo);

  for (let i = 0; i < data.data.length; i += 4) {
    if (data.data[i + 3] < 8) continue;   // ★透明はそのまま（板の形を動かさない）
    const l = 0.299 * data.data[i] + 0.587 * data.data[i + 1] + 0.114 * data.data[i + 2];
    /**
     * ★ 0〜1 に正規化する。
     *   ⚠️ ★ここで**圧縮しない**こと（上の註記）。
     *      ★圧縮すると**地面の流れが読めなくなり**、走りがぎこちなく見えます。
     */
    const t = Math.min(1, Math.max(0, (l - lo) / span));
    let r; let g; let b;
    if (t < 0.5) {
      const k = t / 0.5;
      r = mix(DARK[0], BASE[0], k); g = mix(DARK[1], BASE[1], k); b = mix(DARK[2], BASE[2], k);
    } else {
      const k = (t - 0.5) / 0.5;
      r = mix(BASE[0], LIGHT[0], k); g = mix(BASE[1], LIGHT[1], k); b = mix(BASE[2], LIGHT[2], k);
    }
    /** ★砂粒。★これが無いと芝の葉の筋が残って「茶色い芝」に見えます */
    const grain = (rnd() - 0.5) * 16;
    data.data[i] = Math.max(0, Math.min(255, Math.round(r + grain)));
    data.data[i + 1] = Math.max(0, Math.min(255, Math.round(g + grain * 0.95)));
    data.data[i + 2] = Math.max(0, Math.min(255, Math.round(b + grain * 0.85)));
  }
  ctx.putImageData(data, 0, 0);
  writeFileSync(path.join(DIR, `${dst}.png`), canvas.toBuffer('image/png'));
  console.log(`★${src}.png → ${dst}.png  ${W}×${H}px  （元の輝度 ${lo.toFixed(0)}〜${hi.toFixed(0)}）`);
}

/**
 * ★`manifest.json` に**差し替え表**として載せる。
 *   ★層そのものは増やしません。★ダート戦のときに `file` を読み替えるだけです。
 *   ⚠️ ★層を増やすと**芝でも 1 枚余分に読む**ことになります。
 */
manifest.dirtLayers = Object.fromEntries(PAIRS.map(([src, dst]) => [src, `${dst}.png`]));
writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.log('★manifest.json に dirtLayers を追加しました（芝の層は触っていません）');
