/**
 * Remove a saturated green imagegen background with a soft matte and despill.
 * Usage: node tools/remove-chroma-key.mjs input.png output.png
 */
import sharp from 'sharp';

const [input, output] = process.argv.slice(2);
if (input === undefined || output === undefined) {
  console.error('Usage: node tools/remove-chroma-key.mjs input.png output.png');
  process.exit(2);
}

const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const out = Buffer.alloc(data.length);
for (let i = 0; i < data.length; i += 4) {
  const r = data[i] ?? 0;
  const g = data[i + 1] ?? 0;
  const b = data[i + 2] ?? 0;
  const sourceAlpha = (data[i + 3] ?? 255) / 255;
  // Distance from the green-screen axis. Hair/reins receive a broad soft edge.
  const greenLead = g - Math.max(r, b);
  const saturation = Math.max(r, g, b) - Math.min(r, g, b);
  const keyStrength = Math.max(0, Math.min(1, (greenLead - 18) / 105))
    * Math.max(0, Math.min(1, (saturation - 26) / 120));
  const alpha = sourceAlpha * (1 - keyStrength);
  // Remove reflected green without neutralising legitimate brown/white detail.
  const spill = Math.max(0, g - Math.max(r, b)) * Math.max(0, Math.min(1, keyStrength + 0.18));
  out[i] = r;
  out[i + 1] = Math.max(0, Math.round(g - spill));
  out[i + 2] = b;
  out[i + 3] = Math.round(alpha * 255);
}

/**
 * ★**囲まれた抜け残りも消す**（★2026-09-07）
 *
 * ⚠️ ★上の処理は画素ごとに緑を判定します。★口元・脚の間・手綱の内側など、
 *    ★**囲まれていて緑が濁った所**は判定を外れて残ります。
 *    ★実測: ★1 コマ目 52px に対し 2 コマ目 343px（★塊 249px）。
 *    ★コマごとに出たり出なかったりするので、★**再生するとそこがちらつきます**。
 *
 * ★2026-09-05 に「白がチカチカする」で踏んだのと**同じ形**の欠陥です
 *   （★あちらは焼き込まれた市松模様でした）。
 *
 * 【★どう消すか】
 *   ★残った不透明画素のうち、★**緑に寄っているものだけ**を塊に分け、
 *   ★その塊が ★**小さければ**（＝輪郭沿いの微量ではなく、囲まれた抜け残り）抜きます。
 * ⚠️ ★正規の緑（★緑の勝負服）を消さないため、★**塊の大きさで区別**します。
 *    ★勝負服は大きな面になるので、★閾値より大きく残ります。
 */
{
  const w = info.width; const h = info.height;
  const green = new Uint8Array(w * h);
  for (let i = 0, k = 0; i < out.length; i += 4, k += 1) {
    if ((out[i + 3] ?? 0) < 64) continue;
    const r = out[i] ?? 0; const g = out[i + 1] ?? 0; const b = out[i + 2] ?? 0;
    if (g - Math.max(r, b) > 14) green[k] = 1;
  }
  /** ★塊に分ける */
  const seen = new Uint8Array(w * h);
  const stack = [];
  let cleared = 0;
  /** ★これより大きい緑の面は「正規の色」として残す（★緑の勝負服を消さない） */
  const KEEP_ABOVE = 2000;
  for (let s0 = 0; s0 < w * h; s0 += 1) {
    if (green[s0] === 0 || seen[s0] === 1) continue;
    const cells = [];
    seen[s0] = 1; stack.push(s0);
    while (stack.length > 0) {
      const k = stack.pop();
      cells.push(k);
      const x = k % w; const y = (k - x) / w;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx; const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const nk = ny * w + nx;
        if (green[nk] === 1 && seen[nk] === 0) { seen[nk] = 1; stack.push(nk); }
      }
    }
    if (cells.length > KEEP_ABOVE) continue;
    for (const k of cells) { out[k * 4 + 3] = 0; cleared += 1; }
  }
  if (cleared > 0) console.log(`  ★抜け残りの緑を ${cleared} 画素消しました`);
}

/**
 * ★**緑のにじみを抑える**（★2026-09-07）
 *
 * 【★なぜ要るか】
 *   ★緑の面を抜いても、★輪郭のなめらかな画素には ★**緑が混ざったまま**残ります。
 *   ★実測（★実機に入っていた 8 コマ）: ★不透明画素の ★**3.3〜4.1% が緑がかっており**、
 *   ★その ★**98% が輪郭から 3px 以内**でした（★内側はわずか 128px）。
 *   ★画面では ★**馬の輪郭に緑の縁**として出ます。★「絵が安い」の一因です。
 *
 * 【★なぜ全画素に当てて安全か】
 *   ★この素材に ★**もともと緑の部分はありません**（★毛は茶・勝負服は青・たてがみは黒）。
 *   ★緑が赤と青の平均を超えている画素だけ、★緑をその平均まで下げます。
 *   ★緑を含まない画素は 1 も変わりません。
 *   ⚠️ ★将来「緑の勝負服」を下地に描くなら、★ここは通してはいけません。
 */
{
  let toned = 0;
  for (let k = 0; k < info.width * info.height; k += 1) {
    const i = k * 4;
    if (out[i + 3] === 0) continue;
    const avg = (out[i] + out[i + 2]) / 2;
    if (out[i + 1] <= avg) continue;
    out[i + 1] = Math.round(avg);
    toned += 1;
  }
  if (toned > 0) console.log(`  ★緑のにじみを ${toned} 画素抑えました`);
}

await sharp(out, { raw: { width: info.width, height: info.height, channels: 4 } })
  .png({ compressionLevel: 9 })
  .toFile(output);
console.log(`Wrote ${output} (${info.width}x${info.height})`);
