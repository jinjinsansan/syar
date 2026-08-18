/** Split an image into N cells without assuming its width is divisible by N. */
import sharp from 'sharp';
import path from 'node:path';
import { readFile } from 'node:fs/promises';

const [input, outputPrefix, countText] = process.argv.slice(2);
const count = Number(countText);
if (input === undefined || outputPrefix === undefined || !Number.isInteger(count) || count < 2) {
  console.error('Usage: node tools/split-horizontal-frames.mjs input.png output-prefix frame-count');
  process.exit(2);
}
const metadata = await sharp(input).metadata();
if (metadata.width === undefined || metadata.height === undefined) throw new Error('Image dimensions are unavailable');
const source = await readFile(input);
for (let i = 0; i < count; i += 1) {
  const left = Math.floor(i * metadata.width / count);
  const right = Math.floor((i + 1) * metadata.width / count);
  const output = `${outputPrefix}${String(i + 1).padStart(2, '0')}.png`;
  await sharp(source).extract({ left, top: 0, width: right - left, height: metadata.height })
    .png({ compressionLevel: 9 }).toFile(output);
  console.log(`${path.basename(output)}: source x=${left}..${right}`);
}
