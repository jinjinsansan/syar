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

await sharp(out, { raw: { width: info.width, height: info.height, channels: 4 } })
  .png({ compressionLevel: 9 })
  .toFile(output);
console.log(`Wrote ${output} (${info.width}x${info.height})`);
