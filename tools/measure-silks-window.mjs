/**
 * ★**勝負服の窓が、★鞍布だけを覆えているかを測る**（★2026-09-13・オーナー評
 *   ★「★騎手の服がまた縦縞模様です」）
 *
 * 【★なぜこの道具が要るか】
 *   ★2026-09-12、★「馬の目が赤色になる」を直すために鞍布の窓の右端を
 *   ★0.95 → 0.40 に詰めました。★そのとき測ったのは ★**1 コマだけ**です。
 *   ★結果、★他のコマでは ★**鞍布が窓の外へはみ出し**、★はみ出した側が元の白のまま残って
 *   ★**縦に割れて**見えます。★同じやり方で 3 度目を作らないために、★全コマ測ります。
 *
 * 【★測り方】
 *   ★① ヘッドレスのブラウザで素材 PNG を復号し、★画素をそのまま Node へ返す
 *   ★② ★**画面と同じ判定**（`@star/render` の `silksPaintable`）で「塗る画素」を決める
 *      ⚠️ ★以前は判定が `page.tsx` に直書きで、★道具は別の式で測っていました（★R-30）。
 *   ★③ 塗る画素を ★**連結成分**に分け、★大きい順に nx／ny の範囲を出す
 *      ★鞍布は大きい塊、★目は小さい塊。★大きさで見分けます。
 *
 * ⚠️ ★合否は出しません。★窓をどこに置くかはこの数字を見て決めます（★R-16）。
 * ⚠️ ★DB に触れません。★素材を読むだけです。
 *
 * ★実行: node tools/measure-silks-window.mjs [--set horse-jockey-diag-front-v4]
 *        [--base http://localhost:3210] [--band 0.28,0.60] [--out out/silks]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { launch } from './lib/cdp.mjs';
import { silksPaintable } from '@star/render';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : process.argv[i + 1]; };
const SET = arg('set', 'horse-jockey-diag-front-v4');
const BASE = arg('base', 'http://localhost:3210');
const OUT = arg('out', 'out/silks');
const [BAND_TOP, BAND_BOTTOM] = String(arg('band', '0.24,0.62')).split(',').map(Number);
/** ★いまの窓（`SILKS_LAYOUT_FRONT.saddlecloth`）。★比べるために置いています */
const NOW = String(arg('now', '0.05,0.40,0.30,0.48')).split(',').map(Number);
/** ★塗る画素に色を置いた絵を残すか（★`--paint`） */
const PAINT = process.argv.includes('--paint');

mkdirSync(OUT, { recursive: true });
const browser = await launch({ width: 900, height: 900 });

/** ★素材 1 枚を復号して、★画素をそのまま返す */
const pixelsOf = async (url) => browser.evaluate(`(async () => {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  await new Promise((ok, ng) => { img.onload = ok; img.onerror = () => ng(new Error('読めません')); img.src = ${JSON.stringify(url)}; });
  const c = document.createElement('canvas');
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  const x = c.getContext('2d');
  x.drawImage(img, 0, 0);
  const d = x.getImageData(0, 0, c.width, c.height).data;
  let s = '';
  const chunk = 0x8000;
  for (let i = 0; i < d.length; i += chunk) s += String.fromCharCode.apply(null, d.subarray(i, i + chunk));
  return JSON.stringify({ w: c.width, h: c.height, data: btoa(s) });
})()`);

try {
  await browser.goto(`${BASE}/race?dev=1`, 'true', { timeoutMs: 60000, settleMs: 300 });
  console.log(`★${SET} ／ 判定は画面と同じ \`silksPaintable\``);
  console.log(`★いまの鞍布の窓: nx ${NOW[0]}〜${NOW[1]} ／ ny ${NOW[2]}〜${NOW[3]}`);
  console.log('');

  const rows = [];
  for (let pose = 1; pose <= 8; pose += 1) {
    const name = `${SET}-pose${String(pose).padStart(2, '0')}.png`;
    let info;
    try { info = JSON.parse(await pixelsOf(`${BASE}/art/${name}`)); }
    catch { console.log(`  pose${pose}: ★素材が読めません（${name}）`); continue; }
    const { w, h } = info;
    const px = Buffer.from(info.data, 'base64');

    /** ★塗る画素の印（★帯の中だけ見る。★兜ではないので `helmet=false`） */
    const paint = new Uint8Array(w * h);
    for (let y = Math.floor(h * BAND_TOP); y < Math.ceil(h * BAND_BOTTOM); y += 1) {
      for (let x = 0; x < w; x += 1) {
        const i = (y * w + x) * 4;
        if (silksPaintable(px[i], px[i + 1], px[i + 2], px[i + 3], false)) paint[y * w + x] = 1;
      }
    }
    /** ★連結成分（★4 近傍）。★大きい塊が鞍布、★小さい塊が目や飾り */
    const seen = new Uint8Array(w * h);
    const blobs = [];
    const stack = new Int32Array(w * h);
    for (let p = 0; p < w * h; p += 1) {
      if (paint[p] === 0 || seen[p] === 1) continue;
      let top = 0; stack[top++] = p; seen[p] = 1;
      let n = 0, x0 = w, x1 = -1, y0 = h, y1 = -1;
      while (top > 0) {
        const q = stack[--top];
        const qx = q % w, qy = (q - qx) / w;
        n += 1;
        if (qx < x0) x0 = qx; if (qx > x1) x1 = qx;
        if (qy < y0) y0 = qy; if (qy > y1) y1 = qy;
        for (const nb of [q - 1, q + 1, q - w, q + w]) {
          if (nb < 0 || nb >= w * h) continue;
          if (Math.abs((nb % w) - qx) > 1) continue;
          if (paint[nb] === 1 && seen[nb] === 0) { seen[nb] = 1; stack[top++] = nb; }
        }
      }
      blobs.push({ n, nx0: x0 / w, nx1: x1 / w, ny0: y0 / h, ny1: y1 / h });
    }
    blobs.sort((a, b) => b.n - a.n);
    rows.push({ pose, w, h, blobs });

    /**
     * ★**塗る画素に色を置いた絵を残します**（★2026-09-13）。
     * ⚠️ ★数字だけでは ★**鞍布か騎手のズボンか**が決められません。★窓を動かす前に、
     *    ★目で見て「どの塊が鞍布か」を確かめます（★前回はここを飛ばして詰めました）。
     */
    if (PAINT) {
      const marks = blobs.slice(0, 5).map((b, i) => ({
        i, x0: Math.round(b.nx0 * w), x1: Math.round(b.nx1 * w),
        y0: Math.round(b.ny0 * h), y1: Math.round(b.ny1 * h), n: b.n,
      }));
      const png = await browser.evaluate(`(async () => {
        const img = new Image();
        await new Promise((ok, ng) => { img.onload = ok; img.onerror = ng; img.src = ${JSON.stringify(`${BASE}/art/${name}`)}; });
        const c = document.createElement('canvas');
        c.width = img.naturalWidth; c.height = img.naturalHeight;
        const x = c.getContext('2d');
        x.drawImage(img, 0, 0);
        const colors = ['#ff00ff', '#00e5ff', '#ffe500', '#00ff66', '#ff6a00'];
        x.lineWidth = 2; x.font = '13px monospace';
        for (const m of ${JSON.stringify(marks)}) {
          x.strokeStyle = colors[m.i]; x.fillStyle = colors[m.i];
          x.strokeRect(m.x0, m.y0, m.x1 - m.x0, m.y1 - m.y0);
          x.fillText(String(m.n), m.x0, Math.max(12, m.y0 - 3));
        }
        /** ★いまの窓を白い破線で重ねる */
        x.setLineDash([5, 4]); x.strokeStyle = '#ffffff';
        x.strokeRect(${NOW[0]} * c.width, ${NOW[2]} * c.height,
          (${NOW[1]} - ${NOW[0]}) * c.width, (${NOW[3]} - ${NOW[2]}) * c.height);
        return c.toDataURL('image/png').slice('data:image/png;base64,'.length);
      })()`);
      writeFileSync(`${OUT}/${SET}-pose${String(pose).padStart(2, '0')}.png`, Buffer.from(png, 'base64'));
    }

    console.log(`  pose${pose}（${w}×${h}）`);
    for (const b of blobs.slice(0, 4)) {
      const inNow = b.nx0 >= NOW[0] && b.nx1 <= NOW[1] && b.ny0 >= NOW[2] && b.ny1 <= NOW[3];
      const cutNow = !inNow && b.nx0 < NOW[1] && b.nx1 > NOW[0] && b.ny0 < NOW[3] && b.ny1 > NOW[2];
      console.log(`    ${String(b.n).padStart(5)} 画素  nx ${b.nx0.toFixed(2)}〜${b.nx1.toFixed(2)}`
        + `  ny ${b.ny0.toFixed(2)}〜${b.ny1.toFixed(2)}`
        + `  ${inNow ? '★窓の中' : cutNow ? '⚠️ ★窓が途中で切っている' : '（窓の外）'}`);
    }
  }

  /** ★全コマをまとめて、★「大きい塊（＝鞍布）」が収まる窓を出す */
  const big = rows.flatMap((r) => r.blobs.filter((b) => b.n >= 200));
  const small = rows.flatMap((r) => r.blobs.filter((b) => b.n < 200 && b.n >= 12));
  console.log('');
  if (big.length > 0) {
    console.log(`★大きい塊（200 画素以上・${big.length} 個）が全部収まる窓`);
    console.log(`  nx ${Math.min(...big.map((b) => b.nx0)).toFixed(2)}〜${Math.max(...big.map((b) => b.nx1)).toFixed(2)}`
      + `  ny ${Math.min(...big.map((b) => b.ny0)).toFixed(2)}〜${Math.max(...big.map((b) => b.ny1)).toFixed(2)}`);
  }
  if (small.length > 0) {
    console.log(`★小さい塊（12〜199 画素・${small.length} 個 ＝ 目や飾りの疑い）の広がり`);
    console.log(`  nx ${Math.min(...small.map((b) => b.nx0)).toFixed(2)}〜${Math.max(...small.map((b) => b.nx1)).toFixed(2)}`
      + `  ny ${Math.min(...small.map((b) => b.ny0)).toFixed(2)}〜${Math.max(...small.map((b) => b.ny1)).toFixed(2)}`);
  }
  writeFileSync(`${OUT}/${SET}.json`, JSON.stringify(rows, null, 2), 'utf8');
  console.log('');
  console.log(`★書き出しました: ${OUT}/${SET}.json`);
  console.log('★この道具は合否を出しません（★窓をどこに置くかはこの数字を見て決めます・R-16）。');
} finally {
  await browser.close();
}
