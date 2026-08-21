/**
 * ★人物立ち絵が**写真ではない**ことを見る
 *
 * 【なぜ要るか（レビュー側裁定 2026-08-21）】
 *   実況ナレーターの立ち絵に、写実的な実在人物ふうの顔写真が仮置きされたまま出ていました。
 *
 *     > 🔴 ナレーターの実在人物写真は即時撤去。弁護士ゲートに回す前に止めます。
 *     > 憲法 §0.1 は実在の競走馬・レース・競馬場を対象としており、
 *     > **実在人物の肖像はそこに書かれていない別の権利**です。
 *     > **書かれていないことは許されていることを意味しません。**
 *
 * 【★指標を作り直しました（2026-08-22）】
 *   初版は「**肌色の面積**」で見ていました。影絵の仮置きには効きましたが、
 *   ★**手描きの立ち絵も肌色を持つ**ので、正式な絵が入った瞬間に必ず落ちます
 *   （実測: 影絵 0.0% ／ 手描き 28.9% ／ 写真 22.2% — **写真と絵を分けられていない**）。
 *
 *   → **色の平坦さ**で見ます。セル塗りの絵は肌が少数の色で塗られ、写真は連続的に散ります。
 *     実測（肌と判定された画素のうち、上位 8 色が占める割合）:
 *       写真（撤去した仮置き）      **14.6%**
 *       手描き（narrator-a 3 表情） **62.6〜69.1%**
 *     ★2 倍以上離れており、40% を境にすれば両者を分けられます。
 *
 *   ⚠️ ★これは**写真らしさの検出**であって、**顔の検出でも権利の判定でもありません。**
 *      通ったことは「セル塗りの絵に見える」ことしか意味しません。
 *      実在の人物をモデルに描いた絵は、この検査を通ります。**そこは人間が見ること。**
 *
 * 実行: node tools/verify-no-real-faces.mjs
 */
import { existsSync } from 'node:fs';
import { createCanvas, loadImage } from '@napi-rs/canvas';

/**
 * ★人物として画面に出る素材の登録簿。
 *   人物立ち絵を増やすときは、**ここに足してから**素材を入れること。
 */
const PORTRAIT_ASSETS = [
  { file: 'apps/web/public/art/narrator-a-normal-closed.png', label: '実況 A 通常・口閉' },
  { file: 'apps/web/public/art/narrator-a-normal-open.png', label: '実況 A 通常・口開' },
  { file: 'apps/web/public/art/narrator-a-hot-closed.png', label: '実況 A 熱・口閉' },
  { file: 'apps/web/public/art/narrator-a-hot-open.png', label: '実況 A 熱・口開' },
  { file: 'apps/web/public/art/narrator-a-shout-closed.png', label: '実況 A 絶叫・口閉' },
  { file: 'apps/web/public/art/narrator-a-shout-open.png', label: '実況 A 絶叫・口開' },
];

/** 肌色らしさ（ごく緩い判定。どの画素を調べるかを決めるだけ） */
function skinLike(r, g, b) {
  if (r <= g || g <= b) return false;
  if (r < 95 || g < 40 || b < 20) return false;
  if (Math.max(r, g, b) - Math.min(r, g, b) < 15) return false;
  return Math.abs(r - g) > 15 && r - b > 25;
}

/** ★肌の画素のうち、いちばん多い 8 色が占める割合（%）。高い＝セル塗り／低い＝写真 */
async function flatnessOfSkin(file) {
  const im = await loadImage(file);
  const c = createCanvas(im.width, im.height);
  const x = c.getContext('2d');
  x.drawImage(im, 0, 0);
  const d = x.getImageData(0, 0, im.width, im.height).data;
  const hist = new Map();
  let n = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 32) continue;
    const r = d[i], g = d[i + 1], b = d[i + 2];
    if (!skinLike(r, g, b)) continue;
    n += 1;
    const k = (r >> 3) * 1024 + (g >> 3) * 32 + (b >> 3);
    hist.set(k, (hist.get(k) ?? 0) + 1);
  }
  if (n < 500) return { skin: n, flat: undefined };   // 肌がほとんど無い（影絵など）
  const top = [...hist.values()].sort((a, b) => b - a).slice(0, 8).reduce((a, b) => a + b, 0);
  return { skin: n, flat: (top / n) * 100 };
}

/** ★境目。写真 14.6% / 手描き 62.6〜69.1% の実測から、その中間に置く */
const FLAT_LIMIT = 40;

/** ★通してはいけないものが通らないことを、この場で確かめる */
function selfCheck() {
  const samples = [
    { name: '肌色', rgb: [231, 180, 148], expect: true },
    { name: '濃い肌色', rgb: [160, 108, 78], expect: true },
    { name: '影絵の紺', rgb: [34, 51, 61], expect: false },
    { name: '芝の緑', rgb: [74, 124, 63], expect: false },
    { name: '灰色', rgb: [150, 150, 150], expect: false },
  ];
  const bad = samples.filter((s) => skinLike(...s.rgb) !== s.expect);
  if (bad.length > 0) {
    console.error('★肌色の判定そのものが壊れています:', bad.map((b) => b.name).join(' / '));
    process.exit(2);
  }
}
selfCheck();

let failed = 0;
console.log('=== 人物立ち絵が写真でないか ===');
console.log('  ★これは写真らしさの検出です。**顔の検出でも権利の判定でもありません。**');
console.log('    実在の人物をモデルに描いた絵は通ります。そこは人間が見ること。\n');
for (const entry of PORTRAIT_ASSETS) {
  if (!existsSync(entry.file)) {
    console.log(`❌ ${entry.label}: ありません — ${entry.file}`);
    failed += 1;
    continue;
  }
  const { skin, flat } = await flatnessOfSkin(entry.file);
  if (flat === undefined) {
    console.log(`✅ ${entry.label}: 肌色の画素がほとんどありません（${skin}）— 影絵など`);
    continue;
  }
  const ok = flat >= FLAT_LIMIT;
  if (!ok) failed += 1;
  console.log(`${ok ? '✅' : '🔴'} ${entry.label}`);
  console.log(`     肌の画素 ${skin.toLocaleString()} / 上位 8 色が占める割合 ${flat.toFixed(1)}%（下限 ${FLAT_LIMIT}%）`);
}

if (failed > 0) {
  console.log('\n★写真の疑いがあります。実在人物の肖像は憲法 §0 に条文が無くても使えません。');
  console.log('  手描きの立ち絵に差し替えてください（2026-08-21 裁定）。');
  process.exit(1);
}
console.log('\n★登録簿の人物立ち絵は、いずれもセル塗りの絵に見えます。');
