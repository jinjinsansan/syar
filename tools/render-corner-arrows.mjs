/**
 * ★**診断映像に、走路の接線方向の矢印を重ねる**（★2026-09-09・レビュー側の指示②）
 *
 * 【★何を出すか】
 *   ★各馬の足元から ★**その馬が本来向くべき向き**（走路の接線）を矢印で描きます。
 *   ★馬番・使用素材・カメラに対する角度も出します。
 *   ★矢印なしの版（`plain`）と並べて見るためのものです。
 *
 * ⚠️ ★これは ★**診断専用**です。★本番の絵には 1 画素も影響しません。
 *
 * ★実行: node tools/render-corner-arrows.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas';

const DIR = 'tmp/race-diagnostic';
if (!existsSync(`${DIR}/frames.json`)) {
  console.error('★先に npx tsx tools/capture-race-diagnostic.mjs を実行してください');
  process.exit(2);
}
for (const f of ['C:/Windows/Fonts/meiryo.ttc', 'C:/Windows/Fonts/YuGothM.ttc']) {
  if (existsSync(f)) { try { GlobalFonts.registerFromPath(f, 'JP'); break; } catch { /* 無視 */ } }
}
const meta = JSON.parse(readFileSync(`${DIR}/frames.json`, 'utf8'));
mkdirSync(`${DIR}/arrows`, { recursive: true });

let withMarks = 0;
for (const fr of meta.frames) {
  const src = `${DIR}/plain/f${String(fr.index).padStart(4, '0')}.jpg`;
  if (!existsSync(src)) continue;
  const img = await loadImage(src);
  const c = createCanvas(img.width, img.height);
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  const d = fr.marks;
  if (d !== null && d !== undefined) {
    withMarks += 1;
    /** ★画面は 1280x720 で描かれ、★JPEG も同じ寸法です */
    for (const h of d.horses) {
      const dx = h.x1 - h.x0; const dy = h.y1 - h.y0;
      const len = Math.hypot(dx, dy) || 1;
      /** ★見やすい長さに正規化します（★向きだけが問題なので） */
      const L = 90;
      const ex = h.x0 + (dx / len) * L; const ey = h.y0 + (dy / len) * L;
      g.strokeStyle = '#ff2fd0'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(h.x0, h.y0); g.lineTo(ex, ey); g.stroke();
      /** ★矢じり */
      const a = Math.atan2(ey - h.y0, ex - h.x0);
      g.beginPath(); g.moveTo(ex, ey);
      g.lineTo(ex - 14 * Math.cos(a - 0.4), ey - 14 * Math.sin(a - 0.4));
      g.lineTo(ex - 14 * Math.cos(a + 0.4), ey - 14 * Math.sin(a + 0.4));
      g.closePath(); g.fillStyle = '#ff2fd0'; g.fill();
      g.fillStyle = '#fff'; g.font = 'bold 15px JP, sans-serif';
      g.fillText(`${h.gate} / ${h.ownViewDeg.toFixed(0)}°`, h.x0 + 4, h.y0 - 6);
    }
    g.fillStyle = 'rgba(10,14,18,.82)'; g.fillRect(0, img.height - 60, img.width, 60);
    g.fillStyle = '#ffd479'; g.font = 'bold 17px JP, sans-serif';
    g.fillText(`★${fr.displaySec.toFixed(1)}s  ${d.shot}  素材 ${d.asset}`
      + `  カット角 ${d.shotViewDeg.toFixed(0)}°  反転 ${d.flip ? 'あり' : 'なし'}`
      + `  ★矢印 = その馬が本来向くべき向き`, 14, img.height - 22);
  }
  writeFileSync(`${DIR}/arrows/f${String(fr.index).padStart(4, '0')}.jpg`, c.toBuffer('image/jpeg', 0.92));
}
console.log(`★矢印つき ${meta.frames.length} コマ（★診断の控えがあったのは ${withMarks} コマ）→ ${DIR}/arrows`);
