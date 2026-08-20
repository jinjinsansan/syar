/**
 * ★走行 8 コマ（個別ファイル）の受け入れ判定
 *
 * 【なぜ要るか】
 *   ⚠️ **絵が良く見えることと、動かして走って見えることは別**です。
 *   `verify-gallop-sheet.mjs` は**組み立て済みの1枚**を測りますが、
 *   `horse-jockey-<view>-v<n>-pose01..08.png` のような**個別ファイルのセット**には使えません。
 *
 * 【★実際に踏んだ失敗】
 *   2026-08-20、`winner-rear-v1` の pose06 を生成したところ、
 *   **前のコマとほとんど同じ絵**が返りました（被写体画素の変化 10.5%）。
 *   絵としては破綻がなく、**並べて見るまで気づけません**。
 *   参照セットの同じ区間は 59.8% 変化していたので、**比べて初めて分かりました**。
 *   → **「コマが進んでいること」を数値で要求します。**
 *
 * 【測るもの】
 *   ① 連続性  … 隣接コマの被写体画素がどれだけ変わったか（8→1 の折り返しも見る）
 *   ② 接地点  … 被写体の下端が全コマで揃っているか（ずれると馬が跳ねる）※数値のみ
 *   ③ 寸法    … 被写体の高さが揃っているか（ずれると馬が伸び縮みする）※数値のみ
 *
 * 【★帯を置いたもの／置かなかったもの — 実測してから決め直しました】
 *   最初、私は帯を**実測せずに書き**、コメントには「既存の実測から置いた」と書きました。
 *   ★合格済みのセットに当てたところ、**合格済みのほうが落ちました**:
 *
 *     winner-v2（唯一合格）  接地 4.6%  高さ 6.1%  「キー色」48.6%
 *     side-v7（合格に近い）  接地 9.6%  高さ 9.5%  「キー色」42.2%
 *     winner-rear-v1（新規） 接地 8.3%  高さ 7.9%  「キー色」31.0%
 *
 *   → ①**「キー色の塊」の検査は削除しました。** 数えていたのは**脚の間や腹の下の隙間**で、
 *      抜き残りではありません。**合格済みのほうが数値が悪い**＝この基準に対する識別力がゼロです。
 *   → ②③**接地点と寸法は合否にせず、数値だけ出します。** 合格済み2セットが 4.6〜9.6% に散っており、
 *      **個別ファイルのセットでは、そもそも接地線が制御されていません**
 *      （制御しているのはシート側の `align-gallop-sheet` ＋ `verify-gallop-sheet`）。
 *      ★**この案件が置いていない基準を、道具が勝手に作らないこと。**
 *   → ①**連続性だけを合否にします。** ここには根拠があります —
 *      参照セットの同区間が 59.8% 進んでいるのに、生成物は 10.5% しか進んでいませんでした。
 *      **比較対象のある差**なので、帯を発明していません。
 *
 * 実行:
 *   node tools/verify-pose-set.mjs out/gen/horse-jockey-winner-rear-v1-pose{NN}-chroma.png
 *   node tools/verify-pose-set.mjs apps/web/public/art/horse-jockey-side-v7-pose{NN}.png
 *   （{NN} が 01..08 に置き換わります）
 */
import { existsSync } from 'node:fs';
import { createCanvas, loadImage } from '@napi-rs/canvas';

const pattern = process.argv[2];
if (pattern === undefined || !pattern.includes('{NN}')) {
  console.error('使い方: node tools/verify-pose-set.mjs <パス。{NN} を含めること>');
  process.exit(2);
}
const FRAMES = 8;
/** 隣接コマの変化がこれ未満なら「コマが進んでいない」 */
const MIN_CHANGE_PCT = 20;

const files = [];
for (let i = 1; i <= FRAMES; i += 1) {
  const f = pattern.replace('{NN}', String(i).padStart(2, '0'));
  if (!existsSync(f)) { console.error(`★ありません: ${f}`); process.exit(1); }
  files.push(f);
}

/** キー色（緑）か。透過 PNG では alpha=0 を背景とみなす */
const isBg = (d, i) => d[i + 3] < 16 || (d[i + 1] > 200 && d[i] < 100 && d[i + 2] < 100);

async function measure(path) {
  const im = await loadImage(path);
  const c = createCanvas(im.width, im.height);
  const x = c.getContext('2d');
  x.drawImage(im, 0, 0);
  const d = x.getImageData(0, 0, im.width, im.height).data;
  let top = im.height, bottom = -1, left = im.width, right = -1, subject = 0;
  for (let y = 0; y < im.height; y += 1) {
    for (let xx = 0; xx < im.width; xx += 1) {
      const i = (y * im.width + xx) * 4;
      if (isBg(d, i)) continue;
      subject += 1;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
      if (xx < left) left = xx;
      if (xx > right) right = xx;
    }
  }
  return { path, d, w: im.width, h: im.height, top, bottom, left, right, subject };
}

function changePct(a, b) {
  if (a.w !== b.w || a.h !== b.h) return null;
  let changed = 0, counted = 0;
  for (let i = 0; i < a.d.length; i += 4) {
    if (isBg(a.d, i) && isBg(b.d, i)) continue;   // 背景同士は数えない
    counted += 1;
    const dd = Math.abs(a.d[i] - b.d[i]) + Math.abs(a.d[i + 1] - b.d[i + 1]) + Math.abs(a.d[i + 2] - b.d[i + 2]);
    if (dd > 60) changed += 1;
  }
  return counted === 0 ? 0 : (100 * changed) / counted;
}

const m = [];
for (const f of files) m.push(await measure(f));

const results = [];
const check = (label, ok, detail) => {
  results.push({ label, ok });
  console.log(`  ${ok ? '✅' : '🔴'} ${label}${detail ? ` — ${detail}` : ''}`);
};

console.log(`=== 走行セットの受け入れ判定（${FRAMES} コマ） ===\n`);
console.log('  コマ  被写体高  下端(接地)  中心X   被写体画素');
for (let i = 0; i < m.length; i += 1) {
  const s = m[i];
  console.log(`   ${String(i + 1).padStart(2, '0')}   ${String(s.bottom - s.top).padStart(6)}   ${String(s.bottom).padStart(6)}    ${String(Math.round((s.left + s.right) / 2)).padStart(5)}   ${s.subject.toLocaleString().padStart(9)}`);
}

console.log('\n① 連続性（隣接コマの変化）');
const changes = [];
for (let i = 0; i < FRAMES; i += 1) {
  const a = m[i], b = m[(i + 1) % FRAMES];
  const pct = changePct(a, b);
  changes.push(pct);
  const tag = `${String(i + 1).padStart(2, '0')}→${String(((i + 1) % FRAMES) + 1).padStart(2, '0')}`;
  console.log(`     ${tag}: ${pct === null ? '★寸法が違う' : `${pct.toFixed(1)}%`}`);
}
const stuck = changes.map((p, i) => ({ p, i })).filter((x) => x.p !== null && x.p < MIN_CHANGE_PCT);
check(
  `★どのコマも前から進んでいる（各遷移 ${MIN_CHANGE_PCT}% 以上）`,
  stuck.length === 0,
  stuck.length === 0 ? '' : `★進んでいない: ${stuck.map((x) => `${x.i + 1}→${((x.i + 1) % FRAMES) + 1} (${x.p.toFixed(1)}%)`).join(', ')}`,
);

// ★合否にしない（冒頭の注記）。合格済みセットの実測を併記して、読む人が判断できるようにする
console.log('\n②③ 接地点と寸法（★合否にしない。数値のみ）');
const heights = m.map((s) => s.bottom - s.top);
const meanH = heights.reduce((a, b) => a + b, 0) / heights.length;
const bottoms = m.map((s) => s.bottom);
const groundSpread = Math.max(...bottoms) - Math.min(...bottoms);
const sizeSpread = Math.max(...heights) - Math.min(...heights);
console.log(`     接地点のばらつき: ${groundSpread}px / 被写体高 平均 ${Math.round(meanH)}px = ${((100 * groundSpread) / meanH).toFixed(1)}%`);
console.log(`     被写体高のばらつき: ${sizeSpread}px = ${((100 * sizeSpread) / meanH).toFixed(1)}%`);
console.log('       （参考・合格済み: winner-v2 接地 4.6%/高さ 6.1% ／ side-v7 接地 9.6%/高さ 9.5%）');

const ng = results.filter((r) => !r.ok);
console.log(`\n=== ${ng.length === 0 ? '合格' : `🔴 ${ng.length} 件 不合格`}（${results.length} 件中） ===`);
process.exit(ng.length === 0 ? 0 : 1);
