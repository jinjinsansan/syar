/**
 * ★**毛色を塗った馬の絵は 描く用の画布で返す**（★2026-10-03・オーナーの記録「ゲートの場面で 毎コマ 70〜180ms」）。
 *   ★`willReadFrequently` の画布のまま返すと ★GPU で描く画面に 毎コマ絵を送り直す。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const PAGE = readFileSync(path.resolve(__dirname, '../../web/src/app/race/page.tsx'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');

describe('★bakeCoat の返す画布', () => {
  it('🔴 ★willReadFrequently の画布を そのまま返さない', () => {
    expect(PAGE.indexOf('function bakeCoat('), '★切り出せない').toBeGreaterThan(-1);
    expect(PAGE.indexOf('const GATE_BILLBOARD'), '★切り出せない').toBeGreaterThan(-1);
    const body = PAGE.slice(PAGE.indexOf('function bakeCoat('), PAGE.indexOf('const GATE_BILLBOARD'));
    expect(body).toContain("const ctx = canvas.getContext('2d', { willReadFrequently: true });");
    expect(body).toContain("const octx = out.getContext('2d');");
    expect(body).toContain('octx.drawImage(canvas, 0, 0);');
    expect(body).toMatch(/return out;\s*\}/);
    /** ★対照: ★塗った画布を そのまま返す形（旧）は無い */
    expect(body).not.toMatch(/ctx\.putImageData\(data, 0, y\);\s*\}\s*return canvas;/);
  });

  /**
   * ★**スタンドの観客を焼く `bakeCrowd` も同じ**（★2026-10-04・オーナーの端末: ゲートの場面で スタンドだけ 1 コマ 45〜94ms・生垣は 1〜2ms）。
   *   ★`getImageData` した画布を そのまま返すと、★短冊ごとに 画像を GPU へ送り直す。
   */
  it('🔴 ★bakeCrowd も 画素を読んだ画布を そのまま返さない', () => {
    const at = PAGE.indexOf('const bakeCrowd = (image: HTMLImageElement): FrameImage => {');
    expect(at, '★切り出せない').toBeGreaterThan(-1);
    const end = PAGE.indexOf('const parallaxRaw', at);
    expect(end, '★終わりが見つからない').toBeGreaterThan(at);
    const body = PAGE.slice(at, end);
    expect(body).toContain('cx.getImageData(0, 0, canvas.width, canvas.height)');
    expect(body).toContain("const octx = out.getContext('2d');");
    expect(body).toContain('octx.drawImage(canvas, 0, 0);');
    expect(body).toMatch(/return out;\s*\};/);
    /** ★対照: ★読んだ画布を返す形（旧）は 最後の return に無い */
    expect(body).not.toMatch(/return image;\s*\/\/[^\n]*\n\s*\}\s*return canvas;/);
  });

  /**
   * ★**画布のまま描かない**（★2026-10-04・ac66974 の後のオーナーの記録で スタンドは 56〜149ms のまま＝画布を写すだけでは効かなかった）。
   *   ★PNG にして `<img>` で読み直し（`asImage`）、★生垣と同じ道で描く。
   */
  it('🔴 ★スタンドの層は 焼いたあと 画像として読み直す（★画布のまま 帯の短冊に渡さない）', () => {
    expect(PAGE).toContain("parallaxManifest.layers[index]?.name === 'stand' && !CROWD_OFF ? asImage(bakeCrowd(image)) : Promise.resolve(image)));");
    const at = PAGE.indexOf('const asImage = (image: FrameImage): Promise<FrameImage> => {');
    expect(at, '★切り出せない').toBeGreaterThan(-1);
    const end = PAGE.indexOf('const parallaxImages', at);
    expect(end, '★終わりが見つからない').toBeGreaterThan(at);
    const body = PAGE.slice(at, end);
    expect(body).toContain("}, 'image/png');");
    expect(body).toContain('img.decode()');
    /** ★対照: ★画布をそのまま渡す旧い形は無い */
    expect(PAGE).not.toContain("parallaxManifest.layers[index]?.name === 'stand' ? bakeCrowd(image) : image);");
  });
});
