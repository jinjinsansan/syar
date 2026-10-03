/**
 * ★**騎手の服の型（マスク）**（★2026-10-03・3 者会議の結論 B・`tools/build-silks-masks.ts`）。
 *
 * 【★見ている壊れ方】
 *   ① ★絵（Codex の描き直し）だけ替わり ★型が古いまま → ★塗る所がずれる（★レビュー側の条件: 型と素材の組を検査で縛る）
 *   ② ★画面が型を使わず ★実行時の判定（閾値・窓・塊）に戻る
 *   ③ ★型が欠ける・部位が 1 つも無いコマ
 */
import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = path.resolve(__dirname, '../../..');
const ART = path.join(ROOT, 'apps/web/public/art');
const MANIFEST = JSON.parse(readFileSync(path.join(ART, 'silks-mask/manifest.json'), 'utf8')) as Record<string, { file: string; sha1: string; counts: number[] }[]>;
const PAGE = readFileSync(path.join(ROOT, 'apps/web/src/app/race/page.tsx'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');

describe('★騎手の服の型', () => {
  it('🔴 ① ★型は いまの絵から作ったもの（★絵の SHA-1 が 型を作ったときと同じ）', () => {
    const stale: string[] = [];
    for (const [prefix, frames] of Object.entries(MANIFEST)) {
      for (const f of frames) {
        const src = path.join(ART, f.file);
        if (!existsSync(src)) { stale.push(`${f.file}: 絵が無い`); continue; }
        if (createHash('sha1').update(readFileSync(src)).digest('hex') !== f.sha1) stale.push(`${prefix} ${f.file}: 絵が替わった → npx tsx tools/build-silks-masks.ts ${prefix}`);
      }
    }
    expect(stale, '★型が古い').toEqual([]);
  });

  it('🔴 ③ ★本番の 12 組 × 8 コマが揃い ★どのコマも 3 部位がある・★型と絵の大きさが同じ', async () => {
    const prefixes = ['side-v8', 'side-v8b', 'side-v8m', 'diag-front-v4', 'diag-front-v4b', 'diag-front-v4m', 'diag-rear-v5', 'diag-rear-v5m', 'high-diag-v4', 'high-diag-v4m', 'side-walk-v1', 'side-walk-v1m'].map((p) => `horse-jockey-${p}`);
    for (const prefix of prefixes) {
      expect(MANIFEST[prefix]?.length, prefix).toBe(8);
      for (const f of MANIFEST[prefix]!) {
        expect(f.counts.every((n) => n > 0), `${f.file} に 部位の無いコマ ${f.counts.join('/')}`).toBe(true);
      }
      const [a, b] = await Promise.all([sharp(path.join(ART, `${prefix}-pose01.png`)).metadata(), sharp(path.join(ART, `silks-mask/${prefix}-pose01.png`)).metadata()]);
      expect([b.width, b.height], prefix).toEqual([a.width, a.height]);
    }
  });

  it('🔴 ② ★画面は 型があれば 型で塗る（★原版の経路も 焼いた経路も）・★実行時の判定は 型が無いときだけ', () => {
    expect(PAGE).toContain('if (mk < 0 && !silksPaintable(r, g, b, a, helmet, !(saddlecloth && !jacket && !helmet))) continue;');
    expect(PAGE).toContain("(() => { const m = silksMaskOfImage.get(image); return m === undefined ? undefined : silksMaskAt(m); })()));");
    expect(PAGE).toContain("RACE_TURN === 'right', canvasRectOf(i), maskOf(i)));");
    expect(PAGE).toContain('await Promise.all(manifest.sets.map((set) => loadSilksMasks(set.prefix, ASSET_VERSION)));');
    /** ★型のときは 不透明度を落とさない（★0.94 倍で白が透けて色あせた） */
    expect(PAGE).toContain('alphaOf[mask] = mk > 0 ? a : Math.round(a * 0.94);');
  });
});
