/**
 * ★駆歩シートの受け入れ判定（第3便・`near` / `far` 共通）
 *
 * 【なぜ要るか】
 *   ⚠️ ★**絵が良く見えることと、動かして走って見えることは別**です。
 *      この案件で実際に踏んだ順に:
 *        ・接地点で揃えたら**尾が隣のセルに写り込んだ**
 *        ・接地線がずれていて**馬が跳ねた**
 *        ・宙に浮くコマが無く**行進に見えた**
 *   → ★**受け入れ条件は全部数値**にして、機械で測ります。
 *
 * 【★合否は出しますが、帯はこちらで作っていません】
 *   数値はシート契約（`design/art/handoff2/sprites/contract.md`）のものです。
 *
 * 実行: npx tsx tools/verify-gallop-sheet.mjs <png> [--frames 8] [--ground 252] [--centre 180]
 */
import sharp from 'sharp';

const argv = process.argv.slice(2);
const file = argv[0];
if (file === undefined) {
  console.error('使い方: npx tsx tools/verify-gallop-sheet.mjs <png> [--frames 8]');
  process.exit(2);
}
const num = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? Number(argv[i + 1]) : d; };
const FRAMES = num('--frames', 8);
/** ★契約の値。渡さなければ「実測から推定」します（自動生成の絵は寸法が外れるため） */
const GROUND = argv.includes('--ground') ? num('--ground', 252) : null;
const CENTRE = argv.includes('--centre') ? num('--centre', 180) : null;

const img = sharp(file);
const meta = await img.metadata();
const { data, info } = await img.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const cw = info.width / FRAMES;

console.log('# ★駆歩シートの受け入れ判定');
console.log(`  ${file}`);
console.log(`  ${info.width} × ${info.height}　1コマ ${cw.toFixed(1)} × ${info.height}　${FRAMES}コマ\n`);
if (!Number.isInteger(cw)) {
  console.log(`⚠️ ★横幅が ${FRAMES} で割り切れません（${info.width} ÷ ${FRAMES} = ${cw.toFixed(2)}）`);
  console.log('   → コマの切り出しが 1px ずつずれます。**必ず割り切れる寸法**にしてください\n');
}

const A = (x, y) => data[(y * info.width + x) * 4 + 3];

/** 1コマの外接矩形と、脚先の広がり（下 28% の帯の幅） */
function measure(k) {
  const x0 = Math.round(k * cw), x1 = Math.round((k + 1) * cw);
  let minX = 1e9, maxX = -1, minY = 1e9, maxY = -1, n = 0, sumX = 0;
  let silkSumX = 0, silkSumY = 0, silkN = 0;
  for (let y = 0; y < info.height; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const o = (y * info.width + x) * 4;
      const r = data[o], g = data[o + 1], b = data[o + 2], a = data[o + 3];
      if (a > 16) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
        n += 1; sumX += x;
      }
      // ★勝負服（青。契約の色域）＝ 胴の基準点
      if (a > 200) {
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
        if (mx > 0 && (mx - mn) / mx >= 0.35 && b === mx && b > r + 30) {
          silkSumX += x; silkSumY += y; silkN += 1;
        }
      }
    }
  }
  if (n === 0) return null;
  // ★脚先の広がり: 外接矩形の下 28% の帯だけを見る
  const bandTop = Math.round(maxY - (maxY - minY) * 0.28);
  let lminX = 1e9, lmaxX = -1;
  for (let y = bandTop; y <= maxY; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      if (A(x, y) > 16) { if (x < lminX) lminX = x; if (x > lmaxX) lmaxX = x; }
    }
  }
  return {
    k, x0,
    left: minX - x0, right: maxX - x0, top: minY, bottom: maxY,
    width: maxX - minX + 1, height: maxY - minY + 1,
    /**
     * ⚠️ ★**全体の重心を基準にしていました。間違いです。**
     *    尾は後方に流れるので、コマごとに重心が動きます。
     *    ★**動いてよい**もので、それを「ずれ」と数えていました。
     * → 基準は**勝負服（青）の重心**です（整列もそれで揃えています）。
     */
    centreX: sumX / n - x0,
    silkX: silkN > 0 ? silkSumX / silkN - x0 : null,
    silkY: silkN > 0 ? silkSumY / silkN : null,
    legSpread: lmaxX - lminX + 1,
    pixels: n,
  };
}

const f = [];
for (let k = 0; k < FRAMES; k += 1) {
  const m = measure(k);
  if (m === null) { console.log(`★コマ ${k} が空です`); process.exit(1); }
  f.push(m);
}

/**
 * ★**接地線**は「最も下にある画素」の最頻値ではなく、
 *   **接地しているコマの下端**で決めます（宙に浮くコマは除く）。
 *   ⚠️ 渡されなければ、**下端の最大値**を接地線とみなします。
 */
const bottoms = f.map((m) => m.bottom);
const ground = GROUND ?? Math.max(...bottoms);
const centre = CENTRE ?? (f.reduce((s, m) => s + m.centreX, 0) / f.length);

console.log('  コマ  外接矩形      重心x     下端    接地線との差   脚先の広がり');
for (const m of f) {
  const d = ground - m.bottom;
  console.log(
    `  ${String(m.k).padStart(3)}  ${String(m.width).padStart(4)}×${String(m.height).padStart(3)}`
    + `   ${m.centreX.toFixed(1).padStart(6)}`
    + `   ${String(m.bottom).padStart(4)}`
    + `   ${(d === 0 ? '接地' : `${d > 0 ? '+' : ''}${d}px 上`).padStart(10)}`
    + `   ${String(m.legSpread).padStart(5)}px`,
  );
}

console.log('');
const fails = [];
const warns = [];

/**
 * ★**基準点（勝負服の重心）のずれ** — これが整列の保証そのものです。
 *   ⚠️ 全体の重心ではありません（尾が振れるので、動いてよいものです）。
 */
const silks = f.filter((m) => m.silkX !== null);
if (silks.length !== f.length) {
  fails.push(`★勝負服（青）が見つからないコマがあります（${f.length - silks.length}個）→ 基準点が取れません`);
} else {
  const mx = silks.reduce((s2, m) => s2 + m.silkX, 0) / silks.length;
  const my = silks.reduce((s2, m) => s2 + m.silkY, 0) / silks.length;
  const dx = Math.max(...silks.map((m) => Math.abs(m.silkX - mx)));
  const dy = Math.max(...silks.map((m) => Math.abs(m.silkY - my)));
  console.log(`  ① ★基準点（勝負服）のずれ  x 最大 ${dx.toFixed(1)}px / y 最大 ${dy.toFixed(1)}px`);
  if (dx > 1.5 || dy > 1.5) {
    fails.push(`① 基準点が x ${dx.toFixed(1)}px / y ${dy.toFixed(1)}px ずれています → ★胴が揺れます`);
  }
}

/**
 * ★**宙に浮くコマ**。中央値より明らかに上にあるコマを1つ持つこと。
 *   ⚠️ 「最も下のコマ」を接地線にすると、**自然な上下動が全部「浮き」に見えます**。
 *      一度そう数えて、★**8コマ中7コマが浮いている**という無意味な結果を出しました。
 */
const sortedB = [...bottoms].sort((p, q) => p - q);
const med = sortedB[Math.floor(sortedB.length / 2)];
const floats = f.filter((m) => med - m.bottom >= 15).map((m) => m.k);
const bob = Math.max(...f.filter((m) => !floats.includes(m.k)).map((m) => m.bottom))
          - Math.min(...f.filter((m) => !floats.includes(m.k)).map((m) => m.bottom));
console.log(`  ② 宙に浮くコマ            ${floats.length === 0 ? '★無し' : `コマ ${floats.join(',')}`}`);
console.log(`  ③ 接地コマの上下動        ${bob}px（★これは自然な動きです）`);
if (floats.length === 0) {
  fails.push('② ★宙に浮くコマがありません → **行進に見えます**（駆歩は1完歩に1回浮きます）');
} else if (floats.length > 2) {
  warns.push(`② 宙に浮くコマが ${floats.length} 個あります（普通は1個）`);
}

// ★収縮の深さ
const minLeg = f.reduce((p, q) => (q.legSpread < p.legSpread ? q : p));
const maxLeg = f.reduce((p, q) => (q.legSpread > p.legSpread ? q : p));
const legRatio = minLeg.legSpread / maxLeg.legSpread;
console.log(`  ④ 脚先の広がり            最小 コマ${minLeg.k} (${minLeg.legSpread}px) / 最大 コマ${maxLeg.k} (${maxLeg.legSpread}px)`);
console.log(`     ★収縮の深さ            ${(legRatio * 100).toFixed(0)}%（小さいほど畳めている）`);
if (legRatio > 0.75) {
  fails.push(`④ ★脚が畳めていません（最小が最大の ${(legRatio * 100).toFixed(0)}%）→ **走りに見えません**`);
}

// ★半透明の縁
let semi = 0;
for (let i = 3; i < data.length; i += 4) if (data[i] > 16 && data[i] < 240) semi += 1;
const semiPix = semi;
let solid = 0;
for (let i = 3; i < data.length; i += 4) if (data[i] >= 240) solid += 1;
console.log(`  ⑤ 半透明の画素            ${semiPix.toLocaleString()}（不透明の ${(semiPix / Math.max(1, solid) * 100).toFixed(1)}%）`);
if (semiPix / Math.max(1, solid) > 0.25) {
  warns.push(`⑤ 半透明が不透明の ${(semiPix / Math.max(1, solid) * 100).toFixed(0)}% あります → 輪郭のアンチエイリアス。ドット絵としては多めです`);
}

// ★余白
console.log(`  ⑥ 上下の余白              上 ${Math.min(...f.map((m) => m.top))}px / 下 ${info.height - 1 - Math.max(...bottoms)}px`);

console.log('');
for (const w of warns) console.log(`⚠️ ${w}`);
if (fails.length > 0) {
  console.log('\n★★FAIL');
  for (const x of fails) console.log(`  ${x}`);
  process.exit(1);
}
console.log('★PASS — 動かして走って見える条件は満たしています');
