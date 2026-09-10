/**
 * ★**1 頭ぶんを同じ倍率で並べる**（★2026-09-10・★裁定 R4 → ★再提出版）
 *
 * 【★前の版の何が壊れていたか】（★裁定 §2）
 *   ★毎コマ ★**馬の描画矩形の中心**へ枠を合わせ、★毎コマ `box.h` から倍率を作っていました。
 *   → ★**確認したい上下動そのものを、枠が追いかけて相殺**していました。
 *     ★実測: ★検証台 型A の描画枠の中心 Y は 523.5〜533.5px 動くのに、
 *     ★切り出し後は 259.3264px で ★**固定**。
 *
 * 【★この版の決め方】
 *   ★① ★**倍率と枠の大きさは、クリップにつき 1 回だけ**決めます（★各コマで更新しません）。
 *      ★基準はそのクリップの描画高さの中央値です。
 *   ★② ★**縦は走路上の接地点に合わせます**（★馬の画像の上端ではありません）。
 *      ★検証台は台が出した `groundY`、★本編は `__raceDiag` の投影接地点 `y0` です。
 *      → ★カメラの移動は打ち消され、★**馬の浮きは残ります**。
 *   ★③ ★対象の馬・型・接地基準・倍率を画面に書きます。★重なっても対象が分かるよう、
 *      ★描画矩形の枠線も重ねます（★補助表示・★元の画素は動かしません）。
 *   ★④ ★接地点からの上下動が、★切り出し後にも残っていることを `crops.json` に記録します。
 *
 * ★実行:
 *   node --import tsx tools/compare-gait-crops.mjs \
 *     --out out/... --bench tmp/bench-ref:0 --race tmp/gait2-before/side:3 --race tmp/gait2-after/side:3
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';

const argsOf = (k) => process.argv.reduce((acc, v, i) =>
  (process.argv[i - 1] === `--${k}` ? [...acc, v] : acc), []);
const arg0 = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : process.argv[i + 1]; };
const arg = arg0;

/**
 * ★**検証台と本編で、同じ量を測ります**（★2026-09-10）。
 *   ★検証台が出す矩形は ★**原版の画布**（★透明な余白を含む）、
 *   ★本編が出す矩形は ★**不透明範囲の切り出し**です。★そのまま比べると
 *   ★「上下動」が別の量になります（★実測で 10.0px 対 0.85px という食い違いが出ました）。
 * → ★目録の `nativeBounds` で、★検証台の画布を ★**輪郭の矩形**へ直します。
 *   ★読むのは製品と同じ目録です。
 */
const MANIFEST = JSON.parse(readFileSync('apps/web/public/art/baked/manifest.json', 'utf8'));
const benchRole = String(arg0('benchRole', 'side-v6'));
const benchSet = MANIFEST.sets.find((s) => s.role === benchRole);
if (benchSet === undefined) { console.error(`★★目録に ${benchRole} がありません`); process.exit(1); }
const silhouetteOf = (frameIndex) => {
  const t = benchSet.frames[((frameIndex % 8) + 8) % 8];
  return {
    top: t.nativeBounds.y / benchSet.nativeCanvasHeight,
    height: t.nativeBounds.height / benchSet.nativeCanvasHeight,
  };
};


const OUT = String(arg('out', 'out/gait-crops'));
/** ★枠は「そのクリップの描画高さの中央値」の何倍か */
const BOX_H = Number(arg('boxH', 2.0));
const BOX_W = Number(arg('boxW', 2.4));
/** ★接地点を枠の縦のどこに置くか（★下に余白を残して、浮きが上へ出る） */
const GROUND_AT = Number(arg('groundAt', 0.78));
const CELL_H = Number(arg('cellH', 520));
const CELL_W = Math.round((CELL_H * BOX_W) / BOX_H);

const sources = [
  ...argsOf('bench').map((s) => ({ kind: 'bench', dir: s.split(':')[0], id: Number(s.split(':')[1]) })),
  /** ★`パス:馬番[:見出し]`。★見出しは条件名（★4 条件を並べるときに要ります） */
  ...argsOf('race').map((s) => ({
    kind: 'race', dir: s.split(':')[0], id: Number(s.split(':')[1]),
    title: s.split(':')[2],
  })),
];
if (sources.length < 2) { console.error('★★--bench / --race を 2 つ以上指定してください'); process.exit(1); }

const loaded = sources.map((s) => {
  const j = JSON.parse(readFileSync(`${s.dir}/frames.json`, 'utf8'));
  return { ...s, frames: j.frames };
});

/**
 * ★1 コマぶんの「馬の描画矩形」と「走路上の接地点」。
 * ⚠️ ★どちらも ★**画面自身が出した値**です（★道具が置き方の式を書き写しません・★R-30）。
 */
const readOf = (src, frame) => {
  if (src.kind === 'bench') {
    const h = (frame.horses ?? []).find((x) => x.lane === src.id);
    if (h === undefined) return null;
    /** ★画布の矩形を ★**輪郭の矩形**へ（★本編と同じ量にするため） */
    const sil = silhouetteOf(h.frame);
    return {
      box: { x: h.x, y: h.y + sil.top * h.h, w: h.w, h: sil.height * h.h },
      groundX: h.x + h.w / 2, groundY: h.groundY,
      tag: `検証台 lane${h.lane} 型${String(h.type).toUpperCase()}`,
    };
  }
  const box = (frame.marks?.boxes ?? []).find((x) => x.gate === src.id);
  const horse = (frame.marks?.horses ?? []).find((x) => x.gate === src.id);
  if (box === undefined || horse === undefined) return null;
  return {
    box: { x: box.x, y: box.y, w: box.w, h: box.h },
    /** ★走路上の投影接地点（★本編の描画が使っているのと同じ点） */
    groundX: horse.x0, groundY: horse.y0,
    tag: src.title === undefined ? `本編 ${src.id}番` : `${src.title}（${src.id}番）`,
  };
};

/** ★倍率と枠は ★クリップにつき 1 回（★中央値） */
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const clips = loaded.map((src) => {
  const reads = src.frames.map((f) => readOf(src, f)).filter((r) => r !== null);
  if (reads.length === 0) { console.error(`★★${src.dir} に対象 ${src.id} がいません`); process.exit(1); }
  const refH = median(reads.map((r) => r.box.h));
  /**
   * ⚠️ ★**倍率は実際の縮小と同じ式にします**（★2026-09-10・★裁定 §5）。
   *    ★以前は `CELL_H / (refH × BOX_H)` と書いていましたが、★実際の `resize` は
   *    ★**丸めた枠の高さ**に対して掛かります。★わずかにずれた値を
   *    ★「切り出し後の実測」と呼んでいました。
   */
  const cropH = Math.round(refH * BOX_H);
  return {
    ...src, reads, refH, cropH,
    cropW: Math.round(refH * BOX_W),
    scale: CELL_H / cropH,
    tag: reads[0].tag,
  };
});

const n = Math.min(...clips.map((c) => c.reads.length));
mkdirSync(`${OUT}/rows`, { recursive: true });

const label = (c) => Buffer.from(`<svg width="${CELL_W}" height="46" xmlns="http://www.w3.org/2000/svg">
<rect x="0" y="0" width="${CELL_W}" height="46" fill="#0d1116" fill-opacity="0.72"/>
<text x="10" y="19" font-family="sans-serif" font-size="15" fill="#eef2f6">${c.tag}</text>
<text x="10" y="38" font-family="sans-serif" font-size="12" fill="#9fb4c6">正規化倍率 ${c.scale.toFixed(4)} ／ 枠 ${c.cropW}x${c.cropH}px ／ 縦は走路上の接地点</text>
</svg>`);

const motion = clips.map(() => []);
let made = 0;
for (let i = 0; i < n; i += 1) {
  const cells = [];
  for (let k = 0; k < clips.length; k += 1) {
    const c = clips[k];
    const r = c.reads[i];
    /** ★枠は接地点を基準に置く（★馬の矩形には追従しない＝上下動が残る） */
    const cx = Math.round(r.groundX - c.cropW / 2);
    const cy = Math.round(r.groundY - c.cropH * GROUND_AT);
    const file = `${c.dir}/plain/f${String(i).padStart(4, '0')}.jpg`;
    const img = sharp(file);
    const meta = await img.metadata();
    const left = Math.max(0, cx); const top = Math.max(0, cy);
    const right = Math.min(meta.width, cx + c.cropW); const bottom = Math.min(meta.height, cy + c.cropH);
    if (right <= left || bottom <= top) { cells.length = 0; break; }
    const piece = await img.extract({ left, top, width: right - left, height: bottom - top }).toBuffer();
    /** ⚠️ ★画面の外は黒で足します（★切り詰めると倍率が変わります） */
    const padded = await sharp({
      create: { width: c.cropW, height: c.cropH, channels: 3, background: { r: 0, g: 0, b: 0 } },
    }).composite([{ input: piece, left: left - cx, top: top - cy }]).png().toBuffer();
    /**
     * ★補助表示: ★対象の描画矩形の枠線と、★接地点の横線。
     * ⚠️ ★元の画素は動かしていません。★重なった馬の中から対象を見分けるためです。
     */
    const bx = Math.round((r.box.x - cx) * c.scale);
    const by = Math.round((r.box.y - cy) * c.scale);
    const bw = Math.round(r.box.w * c.scale);
    const bh = Math.round(r.box.h * c.scale);
    const gy = Math.round((r.groundY - cy) * c.scale);
    const overlay = Buffer.from(`<svg width="${CELL_W}" height="${CELL_H}" xmlns="http://www.w3.org/2000/svg">
<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" fill="none" stroke="#ffd34d" stroke-opacity="0.85" stroke-width="2"/>
<line x1="0" y1="${gy}" x2="${CELL_W}" y2="${gy}" stroke="#4dd2ff" stroke-opacity="0.8" stroke-width="2"/>
</svg>`);
    const cell = await sharp(padded).resize(CELL_W, CELL_H, { fit: 'fill' })
      .composite([{ input: overlay, left: 0, top: 0 }, { input: label(c), left: 0, top: 0 }])
      .toBuffer();
    cells.push(cell);
    /** ★接地点から馬の上端までの距離（★切り出し後の px）＝ ★残っているべき上下動 */
    motion[k].push((r.groundY - r.box.y) * c.scale);
  }
  if (cells.length !== clips.length) continue;
  await sharp({
    create: { width: CELL_W * cells.length, height: CELL_H, channels: 3, background: { r: 12, g: 16, b: 20 } },
  }).composite(cells.map((b, k) => ({ input: b, left: CELL_W * k, top: 0 })))
    .jpeg({ quality: 92 }).toFile(`${OUT}/rows/r${String(made).padStart(4, '0')}.jpg`);
  made += 1;
}

const spread = (a) => Math.max(...a) - Math.min(...a);
const report = clips.map((c, k) => ({
  dir: c.dir, id: c.id, tag: c.tag, refH: c.refH, scale: Number(c.scale.toFixed(5)),
  cropW: c.cropW, cropH: c.cropH,
  /** ★元画面での上下動（★接地点から馬の上端まで・px） */
  sourceSpreadPx: Number(spread(c.reads.slice(0, n).map((r) => r.groundY - r.box.y)).toFixed(3)),
  /** ★切り出し後に残っている上下動（px） */
  cropSpreadPx: Number(spread(motion[k]).toFixed(3)),
}));
writeFileSync(`${OUT}/crops.json`, `${JSON.stringify({
  boxH: BOX_H, boxW: BOX_W, groundAt: GROUND_AT, cellH: CELL_H, cellW: CELL_W, made,
  note: '★倍率と枠はクリップにつき 1 回（★条件間は「描画高さの中央値を揃える正規化」であって、'
    + '★同じ倍率ではありません）。★縦は走路上の接地点に合わせるので、★馬の浮きは残ります',
  clips: report,
}, null, 1)}\n`);

console.log(`★${made} 枚 → ${OUT}/rows`);
for (const r of report) {
  console.log(`  ${r.tag.padEnd(22)} 基準高 ${String(r.refH).padStart(6)}px 倍率 ${r.scale.toFixed(3)}`
    + ` ／ 上下動 元 ${r.sourceSpreadPx.toFixed(2)}px → 切り出し後 ${r.cropSpreadPx.toFixed(2)}px`);
}
