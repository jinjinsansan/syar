/**
 * ★前肢を **1 本ずつ** 追って、蹄の軌跡を出す（★2026-09-07）
 *
 * 【⚠️ ★なぜ作り直したか】
 *   ★`measure-foreleg-drive.mjs` は「前半分でいちばん低い蹄」を 1 つだけ拾いました。
 *   ★ギャロップでは前肢が 2 本あり、★低い方はコマごとに入れ替わります。
 *   → ★**別々の脚を同じ脚として並べ**、★「蹄が前へ動いた」と誤った報告をしました。
 *     ★開発側はそれを原因として書き、★撤回しました。
 *   ★交絡（★どの脚を見ているか）を潰さずに「印」と呼んではいけません。
 *
 * 【★どう追うか】
 *   ★① 各コマで、胴の下にある**蹄の塊を全部**取る（★連結成分）
 *   ★② 塊を x で並べ、★前肢の帯にある塊だけ残す
 *   ★③ ★**前のコマの蹄といちばん近いものを同じ脚**として繋ぐ（★最近傍で対応付け）
 *   ★④ 脚ごとに「接地しているか」「胴に対して前後どこか」を出す
 *
 * ⚠️ ★これは silhouette からの推定です。★塊が重なると対応付けを誤ります。
 *    ★重なった数を必ず出すので、★多いときはこの数字を根拠にしないこと。
 *
 * ★実行: node tools/measure-hoof-tracks.mjs '<{NN} を含むパス>' [コマ数]
 */
import sharp from 'sharp';
import { existsSync } from 'node:fs';

const pattern = process.argv[2];
const FRAMES = Number(process.argv[3] ?? 8);
if (pattern === undefined || !pattern.includes('{NN}')) {
  console.error("使い方: node tools/measure-hoof-tracks.mjs '<{NN} を含むパス>' [コマ数]");
  process.exit(2);
}

async function frameData(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const m = new Uint8Array(w * h);
  let l = 1e9; let r = -1; let t = 1e9; let b = -1;
  for (let k = 0; k < w * h; k += 1) {
    const i = k * 4;
    if ((data[i + 3] ?? 0) < 128) continue;
    const R = data[i] ?? 0; const G = data[i + 1] ?? 0; const B = data[i + 2] ?? 0;
    if (G > 110 && G - R > 50 && G - B > 50) continue;
    m[k] = 1;
    const x = k % w; const y = (k - x) / w;
    if (x < l) l = x; if (x > r) r = x; if (y < t) t = y; if (y > b) b = y;
  }
  return { m, w, h, l, r, t, b };
}

/** ★脚の帯（胴より下）で連結成分を取り、★各塊の最下点を「蹄」とする */
function hooves(s) {
  const bw = s.r - s.l + 1; const bh = s.b - s.t + 1;
  const yCut = s.t + Math.round(bh * 0.62);        // ★胴より下だけ
  const seen = new Uint8Array(s.w * s.h);
  const out = [];
  for (let y = yCut; y <= s.b; y += 1) {
    for (let x = s.l; x <= s.r; x += 1) {
      const k0 = y * s.w + x;
      if (s.m[k0] !== 1 || seen[k0] === 1) continue;
      const st = [k0]; seen[k0] = 1;
      let n = 0; let low = -1; let lowSx = 0; let lowN = 0;
      while (st.length > 0) {
        const k = st.pop();
        const px = k % s.w; const py = (k - px) / s.w;
        n += 1;
        if (py > low) { low = py; lowSx = px; lowN = 1; } else if (py === low) { lowSx += px; lowN += 1; }
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = px + dx; const ny = py + dy;
          if (nx < s.l || nx > s.r || ny < yCut || ny > s.b) continue;
          const nk = ny * s.w + nx;
          if (s.m[nk] === 1 && seen[nk] === 0) { seen[nk] = 1; st.push(nk); }
        }
      }
      if (n < bw * bh * 0.0008) continue;           // ★小さすぎる塊は捨てる
      out.push({ x: (lowSx / lowN - s.l) / bw, y: (s.b - low) / bh, n });
    }
  }
  return out.sort((a, b2) => a.x - b2.x);
}

const per = [];
for (let f = 1; f <= FRAMES; f += 1) {
  const file = pattern.replace('{NN}', String(f).padStart(2, '0'));
  if (!existsSync(file)) continue;
  const s = await frameData(file);
  per.push({ f, hv: hooves(s) });
}
if (per.length === 0) { console.error('★ファイルがありません'); process.exit(2); }

console.log('# ★蹄の塊（★x=0 尻 / 1 鼻・★y=接地面からの浮き・体高比）');
let merged = 0;
for (const p of per) {
  const txt = p.hv.map((v) => `x${(v.x * 100).toFixed(0).padStart(3)} 浮${(v.y * 100).toFixed(1).padStart(5)}%`).join(' | ');
  if (p.hv.length < 3) merged += 1;
  console.log(`  コマ${String(p.f).padStart(2)}  塊${p.hv.length}  ${txt}`);
}
console.log();
console.log(`  ⚠️ ★塊が 3 個未満のコマ ${merged} / ${per.length}（★脚が重なって分離できていません）`);
if (merged > per.length / 3) {
  console.log('  ★★この素材では脚を 1 本ずつ追えません。★この数字を原因の根拠にしないこと');
}
