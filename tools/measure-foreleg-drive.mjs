/**
 * ★「前足が地面を蹴っているか」を測る（★2026-09-07・オーナー評「前足が地面を蹴っていないようです」）
 *
 * 【★なぜ道具にするか】
 *   ★「蹴っていないように見える」は目の言葉です。★そのままでは直したか判定できません。
 *   ★ギャロップで前肢が地面を蹴るとき、★**蹄は接地したまま、胴体に対して後ろへ流れます**
 *   （★胴が蹄を追い越す）。★逆に、★前へ出す動きしか描かれていないと「蹴っていない」に見えます。
 *
 * 【★測る 2 つ】
 *   ★① 接地コマ数 …… 前蹄が地面線に届いているコマがいくつあるか（★0 なら蹴りようがない）
 *   ★② 後方への流れ … 接地している間に、★前蹄が胴の前端に対して何 % 後ろへ動くか
 *
 * ⚠️ ★合否の線は発明しません。★合格素材 side-v7 を同じ道具で測った値を横に出します。
 *
 * ★実行: node tools/measure-foreleg-drive.mjs '<{NN} を含むパス>' [コマ数]
 */
import sharp from 'sharp';
import { existsSync } from 'node:fs';

const pattern = process.argv[2];
const FRAMES = Number(process.argv[3] ?? 8);
if (pattern === undefined || !pattern.includes('{NN}')) {
  console.error("使い方: node tools/measure-foreleg-drive.mjs '<{NN} を含むパス>' [コマ数]");
  process.exit(2);
}

/** ★被写体（緑背景と透明を除く）の面と外接矩形 */
async function subject(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const m = new Uint8Array(w * h);
  let l = 1e9; let r = -1; let t = 1e9; let b = -1;
  for (let k = 0; k < w * h; k += 1) {
    const i = k * 4;
    if ((data[i + 3] ?? 0) < 128) continue;
    const R = data[i] ?? 0; const G = data[i + 1] ?? 0; const B = data[i + 2] ?? 0;
    if (G > 110 && G - R > 50 && G - B > 50) continue;   // ★クロマキー緑
    m[k] = 1;
    const x = k % w; const y = (k - x) / w;
    if (x < l) l = x; if (x > r) r = x; if (y < t) t = y; if (y > b) b = y;
  }
  return { m, w, h, l, r, t, b };
}

const rows = [];
for (let f = 1; f <= FRAMES; f += 1) {
  const file = pattern.replace('{NN}', String(f).padStart(2, '0'));
  if (!existsSync(file)) continue;
  const s = await subject(file);
  const bw = s.r - s.l + 1; const bh = s.b - s.t + 1;
  /**
   * ★前肢の帯。★馬は右を向いています。
   * ★x は胴の中央より前（右）側、★y は胴の下（脚だけ）に限ります。
   * ★頭が下がっても混ざらないよう、★下 45% だけを見ます。
   */
  const x0 = s.l + Math.round(bw * 0.50);
  const y0 = s.t + Math.round(bh * 0.55);
  let hoofY = -1; let hoofX = 0; let n = 0;
  for (let y = s.b; y >= y0; y -= 1) {
    for (let x = x0; x <= s.r; x += 1) if (s.m[y * s.w + x] === 1) { if (hoofY < 0) hoofY = y; if (y >= hoofY - 6) { hoofX += x; n += 1; } }
    if (hoofY >= 0 && y < hoofY - 6) break;
  }
  rows.push({ f, hoofYRel: (s.b - hoofY) / bh, hoofXRel: (hoofX / Math.max(n, 1) - s.l) / bw });
}
if (rows.length === 0) { console.error('★ファイルがありません'); process.exit(2); }

/** ★接地＝いちばん低い蹄から 4% 以内 */
const CONTACT = 0.04;
const grounded = rows.filter((r) => r.hoofYRel <= CONTACT);
const xs = grounded.map((r) => r.hoofXRel);
const sweep = grounded.length >= 2 ? Math.max(...xs) - Math.min(...xs) : 0;

console.log('# ★前肢が地面を蹴っているか');
console.log('  コマ  前蹄の浮き   前蹄の前後位置（0=尻 1=鼻）  接地');
for (const r of rows) {
  console.log(`  ${String(r.f).padStart(3)}  ${(r.hoofYRel * 100).toFixed(1).padStart(7)}%  ${(r.hoofXRel * 100).toFixed(1).padStart(22)}%  ${r.hoofYRel <= CONTACT ? '★接地' : ''}`);
}
console.log();
console.log(`  ★接地しているコマ  ${grounded.length} / ${rows.length}`);
console.log(`  ★接地中の後方への流れ  ${(sweep * 100).toFixed(1)}%（★体長比）`);
console.log('  ★合格素材 side-v7 を同じ道具で測った値と比べてください');
