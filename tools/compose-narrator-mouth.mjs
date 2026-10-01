/**
 * ★**実況（写真の版 `tp`）の口パクを作る**（★2026-10-01・オーナー指摘「川崎タカシの実写の口パクが壊れています」）。
 *
 * 【★なぜ作り直したか】
 *   ★09-30 の口を開けた 3 枚は ★口ひげの上に **平たい黒い楕円** を手で貼ったもので、★写真の上では黒い塊に見えた。
 *   ★その手順は道具として残っていなかった（★その場の作業）→ ★今回は道具にする。
 *
 * 【★手順】
 *   ① ★閉じた口の写真（`narrator-tp-closed.webp`）を Codex に渡し、★口だけを開けた写真を作らせる
 *      （`design/art/prompts/narrator-tp-mouth-{open,hot,shout}.txt` → `tools/codex-imagegen.mjs`）
 *   ② ★この道具: ★閉じた写真を土台にし、★口のまわり（楕円・縁をぼかす）だけを 開けた写真から貼る
 *      ★頭は 1 枚しか使わない（★喋るたびに顔が揺れない・`slice-narrator.mjs` と同じ作法）
 *
 * 【★入力・出力】
 *   入力: `out/gen/narrator-tp-fix/closed.png`・`open-normal.png`・`open-hot.png`・`open-shout.png`（★生成は大きいので 300×344 に縮める）
 *   出力: `apps/web/public/art/narrator-tp-{normal,hot,shout}-open.webp`（★既存を置き換える・★閉じた絵は触らない）
 *
 * 実行: node tools/compose-narrator-mouth.mjs
 */
import { existsSync } from 'node:fs';
import sharp from 'sharp';

const SRC = 'out/gen/narrator-tp-fix';
const OUT = 'apps/web/public/art';
const W = 300, H = 344;
/** ★口のまわりの楕円（★300×344 の座標・★2026-10-01 に 閉じた写真と開けた写真の差から測った: 中心 x140 y231・範囲 x119〜156 y216〜263・★名札＝下 60px より上・網 `narrator-frame-fit`） */
const MOUTH = { cx: 142, cy: 226, rx: 46, ry: 40, feather: 14 };

const raw = async (file) => (await sharp(file).resize(W, H, { fit: 'fill', kernel: 'lanczos3' }).removeAlpha().raw().toBuffer());

const base = await raw(`${SRC}/closed.png`);
/** ★開けた写真を使う割合（★楕円の内側 1 → 外側 0・★縁 `feather` px でなめらかに） */
const alphaAt = (x, y) => {
  const d = Math.hypot((x - MOUTH.cx) / MOUTH.rx, (y - MOUTH.cy) / MOUTH.ry);
  const edge = MOUTH.feather / Math.min(MOUTH.rx, MOUTH.ry);
  if (d <= 1 - edge) return 1;
  if (d >= 1) return 0;
  return (1 - d) / edge;
};

for (const [name, file] of [['normal', 'open-normal.png'], ['hot', 'open-hot.png'], ['shout', 'open-shout.png']]) {
  const path = `${SRC}/${file}`;
  if (!existsSync(path)) { console.log(`  ★${path} が無い → ${name} は作らない`); continue; }
  const open = await raw(path);
  const out = Buffer.from(base);
  /** ★楕円の外で 元と違う量（★生成で頭がずれていないかの目安） */
  let outsideDiff = 0, outsideN = 0;
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const i = (y * W + x) * 3;
      const a = alphaAt(x, y);
      if (a === 0) {
        if (y < H - 60) { outsideDiff += Math.abs(open[i] - base[i]) + Math.abs(open[i + 1] - base[i + 1]) + Math.abs(open[i + 2] - base[i + 2]); outsideN += 3; }
        continue;
      }
      for (let c = 0; c < 3; c += 1) out[i + c] = Math.round(base[i + c] * (1 - a) + open[i + c] * a);
    }
  }
  await sharp(out, { raw: { width: W, height: H, channels: 3 } }).webp({ quality: 90 }).toFile(`${OUT}/narrator-tp-${name}-open.webp`);
  console.log(`  ${name}: 口のまわりを貼った → ${OUT}/narrator-tp-${name}-open.webp（★楕円の外の差 平均 ${(outsideDiff / outsideN).toFixed(1)}／255）`);
}
