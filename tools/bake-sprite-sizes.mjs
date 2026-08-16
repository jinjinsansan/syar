/**
 * ★カットごとの元スプライトを焼く（シート契約 §5・裁定 2026-08-16）
 *
 * 【★なぜ要るか — 絵を見て分かりました】
 *   斜め俯瞰で位置を 15px/m に縮めたのに、★**スプライトは 220px のまま**でした。
 *   → 1280 幅で馬が 17%。**引き（参考 2.7%）どころか、寄り（14.2%）より大きい**。
 *   ★**位置の縮尺と馬の大きさは、別々に決まってしまいます。** だから契約で縛ります。
 *
 * 【★焼き方】
 *   ⚠️ **焼いた 220×140 から縮めません。** 半端な比で縮めると画素の格子が合いません
 *      （D-058 が禁じている形）。★**毎回、生アート（1コマ 362px）から焼きます。**
 *
 *   ⚠️ ★**セルは「最大のコマが収まる縮尺」で決めません。**
 *      一度それをやって、接地点で揃えたときに**尾が隣のセルに写り込みました**
 *      （走路に尾が1本だけ浮いて見えました）。
 *   → ★**接地点を基準に、全コマ分の必要量から決めます。**
 *
 * 実行: npx tsx tools/bake-sprite-sizes.mjs
 */
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const RAW = 'design/art/assets/horse-gallop-sheet.png';
const FRAMES = 6;
const OUT_DIR = path.resolve('design/art/assets/cuts');

/** ★契約 §5。**馬の幅**（セル寸法ではありません） */
/**
 * ⚠️ ★**2D の参考映像を測って、値が変わりました**（2026-08-16）。
 *
 *   前は 3D の参考から far 64 / mid 96 / near 180 としていました。
 *   ★**3D の数字はピクセルアートに移せませんでした**（引き 2.7% は読める最小を下回る）。
 *
 *   ★2D の実測（画の範囲 296×186 を機械で決めてから測定）:
 *     引き  馬の幅 = 画面幅の **9〜11%**  → 1280 幅で **119px**
 *     寄り  馬の幅 = 画面幅の **24%**    → 1280 幅で **307px**
 *
 *   ★**こちらの馬は、両方のカットで小さすぎました**（5.0% と 14.1%）。
 *
 * ★2枚で足ります: far 120px（1×/2× → 120/240）＋ near 300px。
 *   ⚠️ 参考の画角の幅は **2.4倍**なので、3枚は要りません（前は 5倍と見積もっていました）。
 */
const SIZES = [
  { name: 'far', horseW: 120 },
  { name: 'near', horseW: 300 },
];

/** 透明でない範囲を測る */
function boundsOf(data, info, x0, x1) {
  let minX = 1e9, maxX = -1, minY = 1e9, maxY = -1;
  for (let y = 0; y < info.height; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      if (data[(y * info.width + x) * 4 + 3] > 16) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return { minX, maxX, minY, maxY };
}

const img = sharp(RAW);
const { data, info } = await img.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const cw = Math.round(info.width / FRAMES);

/**
 * ★**接地点**を「その コマの最下端」とします。
 *   ⚠️ 宙に浮くコマでは最下端が地面より上なので、**全コマの最下端の最大値**を地面にします。
 */
const per = [];
for (let k = 0; k < FRAMES; k += 1) {
  per.push(boundsOf(data, info, k * cw, (k + 1) * cw));
}
const groundY = Math.max(...per.map((b) => b.maxY));
/** ★接地点の左右は「胴の中心」ではなく、**全コマの外接**から決めます */
const anchorX = Math.round(per.reduce((s, b, k) => s + (b.minX + b.maxX) / 2 - k * cw, 0) / FRAMES);

// ★接地点から見た必要量（全コマの最大）
const needL = Math.max(...per.map((b, k) => anchorX + k * cw - b.minX));
const needR = Math.max(...per.map((b, k) => b.maxX - (anchorX + k * cw)));
const needUp = Math.max(...per.map((b) => groundY - b.minY));
const needDown = Math.max(...per.map((b) => b.maxY - groundY));   // ★0 のはず（地面が最下端）

console.log('# ★カットごとの元スプライトを焼く');
console.log(`  生アート: ${RAW}  ${info.width}x${info.height}  1コマ ${cw}x${info.height}`);
console.log(`  ★接地点から必要な量: 左 ${needL}px / 右 ${needR}px / 上 ${needUp}px / 下 ${needDown}px`);
console.log(`  ★生アートでの馬の幅（最大）: ${needL + needR}px\n`);

mkdirSync(OUT_DIR, { recursive: true });
console.log('  名前    セル寸法    馬の幅   縮尺     接地線（セル下端から）');
for (const s of SIZES) {
  // ★「馬の幅」から縮尺を決める（★セルからではない）
  const scale = s.horseW / (needL + needR);
  const MARGIN = 2;
  const cellW = Math.ceil((needL + needR) * scale) + MARGIN * 2;
  const cellH = Math.ceil((needUp + needDown) * scale) + MARGIN * 2;
  const outW = cellW * FRAMES;
  // ★透明で埋めてから、コマごとに接地点を合わせて貼る
  const composites = [];
  for (let k = 0; k < FRAMES; k += 1) {
    /**
     * ★**先に「要る範囲」を切ってから縮めます。**
     *   ⚠️ 生アートのまま縮めると、コマの高さ（724px）ぶんが残って
     *      セルに入らず落ちます（実際に落ちました）。
     *   ★切り出す範囲は**接地点から**決めます（全コマ共通なので、接地点が揃います）。
     */
    const buf = await sharp(RAW)
      .extract({
        left: anchorX + k * cw - needL,
        top: groundY - needUp,
        width: needL + needR,
        height: needUp + needDown + 1,
      })
      .resize({
        width: s.horseW,
        height: Math.max(1, Math.round((needUp + needDown + 1) * scale)),
        kernel: 'nearest',          // ★ピクセルアートなので補間しない
      })
      .png().toBuffer();
    composites.push({ input: buf, left: k * cellW + MARGIN, top: MARGIN });
  }
  const out = path.join(OUT_DIR, `horse-gallop-${s.name}.png`);
  await sharp({
    create: { width: outW, height: cellH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  }).composite(composites).png().toFile(out);

  // ★焼いたものを測り直す（★「焼けた」ではなく「測って合っている」で言う）
  const chk = sharp(out);
  const r = await chk.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const b0 = boundsOf(r.data, r.info, 0, cellW);
  console.log(`  ${s.name.padEnd(6)} ${String(cellW).padStart(4)}x${String(cellH).padStart(3)}`
    + `   ${String(b0.maxX - b0.minX + 1).padStart(4)}px`
    + `  ${scale.toFixed(3)}   ${cellH - 1 - b0.maxY}px`);
}
console.log(`\n★${OUT_DIR}`);
console.log('⚠️ ★これは**仮**です。1頭目の絵が来たら、同じ手順で焼き直します（契約 §5）。');
