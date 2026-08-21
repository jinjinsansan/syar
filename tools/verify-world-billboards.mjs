/**
 * ★世界に置く看板（発馬機など）が、**実寸としてありえない大きさ**になっていないか調べる
 *
 * 【なぜ要るか（2026-08-21 の実害）】
 *   発馬機の看板は `widthM: 14.8` で置かれます。**高さは画像の縦横比から決まります。**
 *   ところが素材の中身は 1523×576 で、実寸に直すと **幅 14.8m × 高さ 5.60m** ——
 *   実際の発馬機（およそ 3.4m）の **1.75 倍の高さ**でした。
 *
 *   結果、**馬の頭（2.5m）が扉の板の真ん中に来て**、板の下からはみ出した脚だけが見える状態に。
 *   ★オーナー評「**ゲートに馬や騎手がなく足しかない**」。
 *
 *   ★絵そのものは合格でした。**置き方の数字は誰も見ていませんでした。**
 *   縦横比は絵を差し替えるたびに黙って変わるので、道具で留めます。
 *
 * 【この道具が見るもの】
 *   透明でない画素の外接矩形（＝実際に描かれる範囲）から高さを実寸に直し、
 *   下の期待値と比べます。**画像の寸法ではなく中身の寸法**で測ります
 *   （余白は `source` で切られるため、画像全体で測ると必ず外します）。
 *
 * 実行: node tools/verify-world-billboards.mjs
 */
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { existsSync } from 'node:fs';

/**
 * ★期待値の出どころ
 *   発馬機: 12 房 × 約 1.0m ＋ 両端の枠 ＝ 幅およそ 14m、
 *           番号板を載せた上桁までの高さ およそ 3.4m。
 *   幅は描画側（`worldBillboards` の `widthM`）と必ず同じ値にすること。
 */
const EXPECTED = [
  {
    file: 'apps/web/public/art/starting-gate-front-v1.png',
    label: '発馬機（扉閉）', widthM: 14.8, heightM: 3.4, tolerance: 0.25,
  },
  {
    file: 'apps/web/public/art/starting-gate-front-open-v1.png',
    label: '発馬機（扉開）', widthM: 14.8, heightM: 3.4, tolerance: 0.25,
  },
];

/** ★中身の外接矩形。透明余白は `source` で切られるので、ここでも外す */
async function contentBox(path) {
  const im = await loadImage(path);
  const c = createCanvas(im.width, im.height);
  const x = c.getContext('2d');
  x.drawImage(im, 0, 0);
  const d = x.getImageData(0, 0, im.width, im.height).data;
  let top = im.height, bottom = -1, left = im.width, right = -1;
  for (let y = 0; y < im.height; y += 1) {
    for (let xx = 0; xx < im.width; xx += 1) {
      if (d[(y * im.width + xx) * 4 + 3] <= 32) continue;
      if (y < top) top = y; if (y > bottom) bottom = y;
      if (xx < left) left = xx; if (xx > right) right = xx;
    }
  }
  if (bottom < 0) return undefined;
  return { w: right - left + 1, h: bottom - top + 1, imgW: im.width, imgH: im.height };
}

let failed = 0;
console.log('=== 世界に置く看板の実寸 ===\n');
for (const e of EXPECTED) {
  if (!existsSync(e.file)) {
    console.log(`❌ ${e.label}: ありません — ${e.file}`);
    failed += 1;
    continue;
  }
  const box = await contentBox(e.file);
  if (box === undefined) {
    console.log(`❌ ${e.label}: 中身がありません（全面が透明）`);
    failed += 1;
    continue;
  }
  const actualH = (box.h / box.w) * e.widthM;
  const ratio = actualH / e.heightM;
  const ok = Math.abs(ratio - 1) <= e.tolerance;
  if (!ok) failed += 1;
  console.log(`${ok ? '✅' : '❌'} ${e.label}`);
  console.log(`     中身 ${box.w}x${box.h}px（画像 ${box.imgW}x${box.imgH}）`);
  console.log(`     幅 ${e.widthM}m で置くと 高さ ${actualH.toFixed(2)}m`);
  console.log(`     期待 ${e.heightM}m（許容 ±${(e.tolerance * 100).toFixed(0)}%）… 実際は ${ratio.toFixed(2)} 倍\n`);
}

if (failed > 0) {
  console.log(`★${failed} 件が実寸として合いません。`);
  console.log('  高すぎると、馬の頭が扉の板に隠れて**脚しか見えなくなります**（2026-08-21 の実害）。');
  process.exit(1);
}
console.log('★すべて実寸として妥当です。');
