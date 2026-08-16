/** Remove disconnected neighbour-frame fragments from a fixed-cell alpha sheet. */
import sharp from 'sharp';

const argv = process.argv.slice(2);
const [inFile, outFile] = argv;
const numberArg = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 ? Number(argv[i + 1]) : fallback;
};
const frames = numberArg('--frames', 8);
const rows = numberArg('--rows', 8);
const alphaMin = numberArg('--alpha', 96);
if (!inFile || !outFile) {
  console.error('Usage: npx tsx tools/clean-sprite-sheet-components.mjs <in.png> <out.png> [--frames 8] [--rows 8]');
  process.exit(2);
}

const { data, info } = await sharp(inFile).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
if (info.width % frames !== 0 || info.height % rows !== 0) throw new Error('sheet dimensions are not divisible by frames/rows');
const cellW = info.width / frames, cellH = info.height / rows;
const output = Buffer.from(data);
const reports = [];

for (let row = 0; row < rows; row += 1) for (let frame = 0; frame < frames; frame += 1) {
  const seen = new Uint8Array(cellW * cellH);
  const components = [];
  for (let ly = 0; ly < cellH; ly += 1) for (let lx = 0; lx < cellW; lx += 1) {
    const local = ly * cellW + lx;
    const gx = frame * cellW + lx, gy = row * cellH + ly;
    if (seen[local] || data[(gy * info.width + gx) * 4 + 3] <= alphaMin) continue;
    const stack = [local], pixels = [];
    seen[local] = 1;
    let minX = lx, maxX = lx, minY = ly, maxY = ly;
    while (stack.length) {
      const at = stack.pop();
      const x = at % cellW, y = Math.floor(at / cellW);
      pixels.push(at); minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= cellW || ny >= cellH) continue;
        const ni = ny * cellW + nx;
        const ngx = frame * cellW + nx, ngy = row * cellH + ny;
        if (seen[ni] || data[(ngy * info.width + ngx) * 4 + 3] <= alphaMin) continue;
        seen[ni] = 1; stack.push(ni);
      }
    }
    components.push({ pixels, area: pixels.length, minX, maxX, minY, maxY });
  }
  components.sort((a, b) => b.area - a.area);
  const main = components[0];
  if (!main) throw new Error(`empty cell row=${row} frame=${frame}`);
  let removed = 0;
  for (const component of components.slice(1)) {
    // Antialias fringe can connect at low alpha. Clear the full fragment box plus 2px.
    for (let ly = Math.max(0, component.minY - 2); ly <= Math.min(cellH - 1, component.maxY + 2); ly += 1)
      for (let lx = Math.max(0, component.minX - 2); lx <= Math.min(cellW - 1, component.maxX + 2); lx += 1) {
        const gx = frame * cellW + lx, gy = row * cellH + ly;
        const o = (gy * info.width + gx) * 4;
        if (output[o + 3] > 0) removed += 1;
        output[o] = 0; output[o + 1] = 0; output[o + 2] = 0; output[o + 3] = 0;
      }
  }
  // A sprite must live inside its main strong-alpha bounds; clear leaked neighbour pixels outside.
  const pad = 3;
  for (let ly = 0; ly < cellH; ly += 1) for (let lx = 0; lx < cellW; lx += 1) {
    if (lx >= main.minX - pad && lx <= main.maxX + pad && ly >= main.minY - pad && ly <= main.maxY + pad) continue;
    const gx = frame * cellW + lx, gy = row * cellH + ly;
    const o = (gy * info.width + gx) * 4;
    if (output[o + 3] > 0) removed += 1;
    output[o] = 0; output[o + 1] = 0; output[o + 2] = 0; output[o + 3] = 0;
  }
  reports.push({ row, frame, main: main.area, fragments: Math.max(0, components.length - 1), removed });
}

await sharp(output, { raw: { width: info.width, height: info.height, channels: 4 } })
  .png({ palette: true, colours: 192, compressionLevel: 9 }).toFile(outFile);
console.table(reports.filter((r) => r.removed > 0));
console.log(`Wrote ${outFile}; cell=${cellW}x${cellH}; removed=${reports.reduce((n, r) => n + r.removed, 0)} alpha pixels`);
