/**
 * ★実在人物の顔写真が素材に混ざっていないかを見る
 *
 * 【なぜ要るか（2026-08-21 の裁定）】
 *   実況ナレーターの立ち絵に、**写実的な実在人物ふうの顔写真**が仮置きされたまま
 *   開発サーバーに出ていました。レビュー側裁定:
 *
 *     > 🔴 ナレーターの実在人物写真は即時撤去。弁護士ゲートに回す前に止めます。
 *     > 憲法 §0.1 は実在の競走馬・レース・競馬場を対象としており、
 *     > **実在人物の肖像はそこに書かれていない別の権利**です。
 *     > **書かれていないことは許されていることを意味しません。**
 *     > 「仮置きだから」は効きません — スクリーンショットは外に出ます。
 *
 *   ★憲法 §0 に条文が無いからと素通ししたのが私の誤りです。この検査で留めます。
 *
 * 【何を見るか】
 *   ⚠️ 「顔かどうか」を機械で当てることはできません。**当てようとしません。**
 *   代わりに、**人物立ち絵として使われる素材を登録簿で管理**し、
 *   「肌色に見える画素が一定以上あるか」だけを見ます。
 *   影絵・イラストなら肌色の面積はほぼ 0、写真なら大きく出ます。
 *
 *   ★これは**写真の検出器であって顔の検出器ではありません。** 通ったことは
 *     「人物写真ではない」ことしか意味せず、権利の判断にはなりません。
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
  { file: 'apps/web/public/art/race-narrator-v1.png', label: '実況ナレーター立ち絵' },
];

/** 肌色らしさ（ごく緩い判定。写真か否かを分けるだけの用途） */
function skinLike(r, g, b) {
  if (r <= g || g <= b) return false;              // 肌は R>G>B に寄る
  if (r < 95 || g < 40 || b < 20) return false;
  if (Math.max(r, g, b) - Math.min(r, g, b) < 15) return false;  // 無彩色は除く
  return Math.abs(r - g) > 15 && r - b > 25;
}

/** ★通してはいけないものが通らないことを、この場で確かめる */
function selfCheck() {
  const samples = [
    { name: '肌色（写真の顔にある色）', rgb: [231, 180, 148], expect: true },
    { name: '濃い肌色', rgb: [160, 108, 78], expect: true },
    { name: '影絵の紺', rgb: [34, 51, 61], expect: false },
    { name: '芝の緑', rgb: [74, 124, 63], expect: false },
    { name: '灰色', rgb: [150, 150, 150], expect: false },
    { name: '馬の鹿毛', rgb: [140, 74, 34], expect: true },
  ];
  const bad = samples.filter((s) => skinLike(...s.rgb) !== s.expect);
  if (bad.length > 0) {
    console.error('★判定そのものが壊れています:', bad.map((b) => b.name).join(' / '));
    process.exit(2);
  }
}
selfCheck();

/** 肌色が中身の何割を占めるか。★閾値は写真と影絵を分ける位置に置く */
const SKIN_RATIO_LIMIT = 0.08;

let failed = 0;
console.log('=== 人物立ち絵に写真が混ざっていないか ===');
console.log('  （★これは写真の検出であって顔の検出ではありません。通っても権利の保証にはなりません）\n');
for (const entry of PORTRAIT_ASSETS) {
  if (!existsSync(entry.file)) {
    console.log(`❌ ${entry.label}: ありません — ${entry.file}`);
    failed += 1;
    continue;
  }
  const im = await loadImage(entry.file);
  const c = createCanvas(im.width, im.height);
  const x = c.getContext('2d');
  x.drawImage(im, 0, 0);
  const d = x.getImageData(0, 0, im.width, im.height).data;
  let skin = 0, solid = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 32) continue;
    solid += 1;
    if (skinLike(d[i], d[i + 1], d[i + 2])) skin += 1;
  }
  const ratio = solid === 0 ? 0 : skin / solid;
  const ok = ratio <= SKIN_RATIO_LIMIT;
  if (!ok) failed += 1;
  console.log(`${ok ? '✅' : '🔴'} ${entry.label}`);
  console.log(`     肌色の割合 ${(ratio * 100).toFixed(1)}%（上限 ${(SKIN_RATIO_LIMIT * 100).toFixed(0)}%）\n`);
}

if (failed > 0) {
  console.log('★人物写真の疑いがあります。実在人物の肖像は憲法 §0 に条文が無くても使えません。');
  console.log('  影絵か描き起こしに差し替えてください（2026-08-21 裁定）。');
  process.exit(1);
}
console.log('★登録簿の人物立ち絵に写真は見つかりませんでした。');
