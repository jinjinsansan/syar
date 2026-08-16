/**
 * Separate transparent directional frames -> one torso-anchored horizontal strip.
 * The blue racing silk centroid is stable while legs and tail move, so it is the
 * alignment anchor. Each source is scaled to a common silk-area target first.
 *
 * Usage:
 *   npx tsx tools/assemble-directional-frames.mjs <out.png> <frame...> [--silk-width 116]
 */
import sharp from 'sharp';

const argv = process.argv.slice(2);
const flagAt = argv.indexOf('--silk-width');
const silkWidth = flagAt >= 0 ? Number(argv[flagAt + 1]) : 116;
const positional = argv.filter((_, i) => i !== flagAt && i !== flagAt + 1);
const [outFile, ...inFiles] = positional;
if (outFile === undefined || inFiles.length < 2 || !Number.isFinite(silkWidth)) {
  console.error('Usage: npx tsx tools/assemble-directional-frames.mjs <out.png> <frame...> [--silk-width 116]');
  process.exit(2);
}

function isSilk(r, g, b, a) {
  if (a < 200) return false;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  return max > 0 && (max - min) / max >= 0.35 && b === max && b > r + 30;
}

async function measure(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let minX = info.width, maxX = -1, minY = info.height, maxY = -1;
  let silkMinX = info.width, silkMaxX = -1, sx = 0, sy = 0, n = 0;
  for (let y = 0; y < info.height; y += 1) for (let x = 0; x < info.width; x += 1) {
    const o = (y * info.width + x) * 4;
    const r = data[o], g = data[o + 1], b = data[o + 2], a = data[o + 3];
    if (a > 16) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
    if (isSilk(r, g, b, a)) { silkMinX = Math.min(silkMinX, x); silkMaxX = Math.max(silkMaxX, x); sx += x; sy += y; n += 1; }
  }
  if (maxX < 0 || n === 0) throw new Error(`${file}: opaque subject or blue silk not found`);
  const scale = silkWidth / (silkMaxX - silkMinX + 1);
  return { file, minX, maxX, minY, maxY, silkX: sx / n, silkY: sy / n, n, scale };
}

const measured = await Promise.all(inFiles.map(measure));
const frames = measured.map((f) => ({
  ...f,
  left: (f.silkX - f.minX) * f.scale,
  right: (f.maxX - f.silkX) * f.scale,
  up: (f.silkY - f.minY) * f.scale,
  down: (f.maxY - f.silkY) * f.scale,
}));
const margin = 6;
const needL = Math.ceil(Math.max(...frames.map((f) => f.left)));
const needR = Math.ceil(Math.max(...frames.map((f) => f.right)));
const needU = Math.ceil(Math.max(...frames.map((f) => f.up)));
const needD = Math.ceil(Math.max(...frames.map((f) => f.down)));
const cellW = needL + needR + margin * 2;
const cellH = needU + needD + margin * 2;
const anchorX = needL + margin, anchorY = needU + margin;

const composites = [];
for (let i = 0; i < frames.length; i += 1) {
  const f = frames[i];
  const cropW = f.maxX - f.minX + 1, cropH = f.maxY - f.minY + 1;
  const width = Math.max(1, Math.round(cropW * f.scale));
  const height = Math.max(1, Math.round(cropH * f.scale));
  const input = await sharp(f.file).extract({ left: f.minX, top: f.minY, width: cropW, height: cropH })
    .resize({ width, height, fit: 'fill', kernel: 'lanczos3' }).png().toBuffer();
  composites.push({
    input,
    left: i * cellW + anchorX - Math.round((f.silkX - f.minX) * f.scale),
    top: anchorY - Math.round((f.silkY - f.minY) * f.scale),
  });
  console.log(`${i}: ${f.file} scale=${f.scale.toFixed(3)} silkPixels=${f.n}`);
}

await sharp({ create: { width: cellW * frames.length, height: cellH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .composite(composites).png().toFile(outFile);
console.log(`Wrote ${outFile}: ${frames.length} frames, cell ${cellW}x${cellH}, silk anchor ${anchorX},${anchorY}`);
