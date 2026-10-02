/**
 * ★**川崎タカシの立ち絵が 枠に収まっている**（★2026-09-30・オーナー「実況中継の川崎タカシが枠に収まっていません」）。
 *
 * 【★見ている壊れ方】
 *   ★枠は 150×172 で ★下 30px に名札が重なる（`hud-kit.ts` の `drawNarratorFrame`）。★素材 300×344 では ★下 60px。
 *   ★09-29 に「顔だけ」に切り直したとき 顔を大きくしすぎ、★頭の上が切れ ★口（口パクの差分）が y 277〜323 と ★名札の下に入っていた。
 *   → ★口パクの差分（★閉じた絵と開いた絵の違う画素）が ★名札より上にあること、★頭の上が絵の上端で切れていないことを 画素で見る。
 */
import { describe, it, expect } from 'vitest';
import path from 'node:path';
import sharp from 'sharp';
import { ACTIVE_NARRATOR_CASTS } from '@star/render';

const ART = path.resolve(__dirname, '../../web/public/art');
/**
 * ★素材は 300×344 か ★その整数倍（★2026-10-02 ti は 600×688・拡大したテレビで 引き伸ばさない）。
 *   ★`drawNarratorFrame` は 素材の寸法から縮める（★枠幅 150 に合わせる）ので ★倍でも同じ見え方。★名札・口の幅も 倍で見る。
 */
let W = 300, H = 344, K = 1;
/** ★名札が重なる帯（★素材の座標・`drawNarratorFrame` の下 30px × 素材の倍率 2K） */
const plateTop = (): number => H - 60 * K;

async function rgb(file: string): Promise<Buffer> {
  const { data, info } = await sharp(path.join(ART, file)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  K = info.width / 300;
  expect(Number.isInteger(K) && K >= 1, `${file}: 幅 ${info.width} は 300 の整数倍でない`).toBe(true);
  expect([info.width, info.height], file).toEqual([300 * K, 344 * K]);
  W = info.width; H = info.height;
  return data;
}

describe('★実況の立ち絵が 枠に収まる', () => {
  for (const cast of ACTIVE_NARRATOR_CASTS) {
    it(`🔴 ${cast}: 口パクの差分が 名札より上（★口が隠れない）`, async () => {
      const closed = await rgb(`narrator-${cast}-closed.webp`);
      for (const expr of ['normal', 'hot', 'shout']) {
        const open = await rgb(`narrator-${cast}-${expr}-open.webp`);
        /** ★非可逆の圧縮で 1 画素ずつのぶれが散る → ★1 行に 10 画素以上 変わった行だけを「口」と数える（★口の幅は 30px 以上） */
        let lowest = -1;
        for (let y = 0; y < H; y += 1) {
          let changed = 0;
          for (let x = 0; x < W; x += 1) {
            const i = (y * W + x) * 3;
            if (Math.abs(open[i]! - closed[i]!) + Math.abs(open[i + 1]! - closed[i + 1]!) + Math.abs(open[i + 2]! - closed[i + 2]!) > 60) changed += 1;
          }
          if (changed >= 10 * K) lowest = y;
        }
        expect(lowest, `★${cast}-${expr}: 口パクの差分が無い`).toBeGreaterThan(0);
        expect(lowest, `★${cast}-${expr}: 口が 名札（y ${plateTop()}〜）の下に入る`).toBeLessThan(plateTop() - 10 * K);
      }
    });
  }
});
