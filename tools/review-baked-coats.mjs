/**
 * ★**焼いた素材の毛色を、1 枚に並べて見る**（★2026-09-24・オーナー決定 D-1/D-2 の確認用）
 *
 * 【★なぜ要るか】
 *   ★月毛（`palomino`）と白毛（`white`）の値は ★**デフォルメの絵で決めた**ものです。
 *   ★`COAT_TRANSFORMS`（★写真寄りの素材に掛かるほう）での見え方は ★**確かめていません**
 *   （★簿 `COAT-PALOMINO-WHITE-NOT-BAKED` の ①）。
 *   🔴 ★とくに白毛は「明るくするだけ」なので、★**輪郭・馬具・白斑との分かれ目が崩れやすい**
 *      と Codex が指摘しています。
 *
 * 【★何を出すか】
 *   ★役ごとに、★コマ 1 枚を ★**毛色 9 色ぶん**横に並べた画像。
 *   ⚠️ ★**画面に出る大きさで並べます**（★既定 188px 幅 ＝ `/race` の実測）。
 *      ★大きく見せると、★小さいときに読めない絵を「良い」と判断してしまいます。
 *   ★`--zoom 3` で 3 倍も出します（★細部を見るため・★合否は等倍で）。
 *
 * ⚠️ ★DB に触れません。★`out/baked-coats/` に書くだけです。
 *
 * ★実行: node tools/review-baked-coats.mjs [--dir apps/web/public/art/baked] [--frame 0] [--zoom 3]
 */
import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : process.argv[i + 1]; };
const DIR = arg('dir', 'apps/web/public/art/baked');
const FRAME = Number(arg('frame', 0));
const ZOOM = Number(arg('zoom', 3));
/** ★`/race` の実測（★`audit-horse-size.mjs`）。★さらに端末では 67% に縮みます */
const SHOWN_W = 188;
const OUT = 'out/baked-coats';
/** ★調教ステージと同じ地色（★透過のまま見ると白毛が見えません） */
const BG = { r: 9, g: 30, b: 55 };

if (!existsSync(join(DIR, 'manifest.json'))) {
  console.error(`★目録がありません: ${join(DIR, 'manifest.json')}`);
  process.exit(2);
}
const m = JSON.parse(readFileSync(join(DIR, 'manifest.json'), 'utf8'));
mkdirSync(OUT, { recursive: true });
console.log(`=== 焼いた素材の毛色 ${m.coats.length} 色 ／ 役 ${m.sets.length} ===`);
console.log(`  ${DIR}  コマ ${FRAME}  等倍 ${SHOWN_W}px ＋ ${ZOOM} 倍`);

for (const set of m.sets) {
  const tile = set.frames[FRAME];
  if (tile === undefined) { console.log(`  ★${set.role}: コマ ${FRAME} がありません`); continue; }
  for (const zoom of [1, ZOOM]) {
    const w = Math.round(SHOWN_W * zoom);
    const h = Math.round((tile.h / tile.w) * w);
    const cells = [];
    for (const coat of m.coats) {
      const file = set.coats[coat];
      if (file === undefined) { console.log(`  🔴 ${set.role}: ${coat} が目録に無い`); continue; }
      cells.push(await sharp(join(DIR, file))
        .extract({ left: tile.x, top: tile.y, width: tile.w, height: tile.h })
        .resize(w, h, { kernel: 'lanczos3' }).png().toBuffer());
    }
    const sheet = sharp({
      create: { width: w * cells.length, height: h, channels: 4, background: { ...BG, alpha: 1 } },
    }).composite(cells.map((input, i) => ({ input, left: w * i, top: 0 })));
    // 🔴 ★sharp は composite を resize の後に当てます。★ここで大きさを変えないこと
    await sheet.png({ compressionLevel: 9 }).toFile(`${OUT}/${set.role}-x${zoom}.png`);
  }
  console.log(`  ${set.role.padEnd(16)} → ${OUT}/${set.role}-x1.png ／ -x${ZOOM}.png  （${m.coats.join(' ')}）`);
}
console.log('\n⚠️ ★合否は ★**等倍（-x1）**で決めること。★3 倍は原因を探すためだけです。');
