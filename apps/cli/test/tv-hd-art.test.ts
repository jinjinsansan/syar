/**
 * ★**拡大したテレビの馬は 縮めない元の解像度**（★2026-10-02・オーナー「拡大で 馬の絵・歩く絵が 薄く引き伸ばされ 色あせている」）。
 *
 * 【★見ている壊れ方】
 *   ① ★拡大したテレビ（★iPhone で 馬の幅 約 1,510 画素）に ★2 倍版（1088）を出して 1.4 倍に引き伸ばす
 *   ② ★絵の名前だけ在って ★ファイルが無い（★404 で 馬が消える）
 *   ③ ★1 コマずつの 8 枚の 見せる順・間隔が ★1 枚の表（u-walk 1.6 秒）とずれる
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = path.resolve(__dirname, '../../..');
const strip = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ').replace(/\/\/[^\n]*/g, ' ');
const TV = strip(readFileSync(path.join(ROOT, 'apps/web/src/components/uma/channel-tv.tsx'), 'utf8'));
const CSS = readFileSync(path.join(ROOT, 'apps/web/src/components/uma/channel-tv.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ');
const PUBLIC = path.join(ROOT, 'apps/web/public');
const files = (sex: 'horse' | 'horse-mare'): string[] => [`/art/uma/${sex}-stand-hd.webp`, ...Array.from({ length: 8 }, (_, i) => `/art/uma/${sex}-walk-hd-0${i + 1}.webp`)];

describe('★拡大したテレビの馬の絵', () => {
  it('🔴 ① ★拡大（hires）では 立ち姿も歩きも hd（★2 倍版を使わない）', () => {
    expect(TV).toContain("useCoatedImage(hires ? horseStandHd(sex) : horseArt(sex, 'stand', false), coatOfHorseId(horseId ?? 'unknown'))");
    expect(TV).toContain('useCoatedImages(hires ? horseWalkFramesHd(sex) : null, coat)');
    expect(TV).toContain("useCoatedImage(hires ? horseStandHd(sex) : horseArt(sex, 'stand', false), coat)");
    /** ★対照: ★テレビで 2 倍版を引く形（★旧）は もう無い */
    expect(TV).not.toContain("horseArt(sex, 'stand', hires)");
    expect(TV).not.toContain("horseArt(sex, 'walk', hires)");
  });

  it('🔴 ② ★hd の絵は 牡馬・牝馬とも 9 枚在り ★幅 1,400 画素以上（★2 倍版 1088 より大きい）', async () => {
    for (const sex of ['horse', 'horse-mare'] as const) {
      for (const f of files(sex)) {
        const p = path.join(PUBLIC, f);
        expect(existsSync(p), `${f} が無い`).toBe(true);
        const m = await sharp(p).metadata();
        expect(m.width ?? 0, `${f} の幅`).toBeGreaterThanOrEqual(1400);
      }
    }
  });

  it('🔴 ③ ★8 枚を 0.2 秒ずつ順に（★1 周 1.6 秒 ＝ u-walk と同じ）', () => {
    expect(CSS).toContain('animation: u-walk-frame 1.6s linear infinite;');
    expect(CSS).toMatch(/@keyframes u-walk-frame \{ 0% \{ visibility: visible; \} 12\.5% \{ visibility: hidden; \} 100% \{ visibility: hidden; \} \}/);
    expect(TV).toContain('animationDelay: `${-0.2 * (8 - i)}s`');
    /** ★番号 i のコマは 1 周のうち [0.2i, 0.2i + 0.2) 秒に見える（★遅れ −0.2(8−i) ≡ 0.2i） */
    for (let i = 0; i < 8; i += 1) expect(((-0.2 * (8 - i)) % 1.6 + 1.6) % 1.6).toBeCloseTo(0.2 * i, 6);
    /** ★止める・動きを減らすでは 隠す */
    expect(CSS).toContain("[data-theme='uma'].u-paused .u-tv-paddock-walk-hd, [data-theme='uma'] .u-paused .u-tv-paddock-walk-hd { display: none; }");
  });
});
