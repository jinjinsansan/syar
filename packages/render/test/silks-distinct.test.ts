/**
 * ★**勝負服は同じレースで絶対に被らない**（2026-08-28・オーナー要望）
 *
 *   > 騎手の服の色を同じ色は毎レース絶対に被らないようにしたいです
 *
 * ★いまは構造上そうなっていますが、★**固定しないと将来崩れます。**
 *   実際、2026-08-27 に「色は枠」という仕様で**同じ枠の 2 頭が完全に同じ**でした。
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { silkRoleOf, frameRoleOf } from '../src/bracket.js';

const pal = JSON.parse(readFileSync('apps/web/public/art/palette.json', 'utf8')) as Record<string, string>;

/** ★sRGB → CIE Lab（`tools/pick-silk-palette.mjs` と同じ式） */
function toLab(hex: string): readonly [number, number, number] {
  const [r, g, b] = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));
  const f = (v: number): number => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const [R, G, B] = [f(r!), f(g!), f(b!)];
  const X = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
  const Y = R * 0.2126 + G * 0.7152 + B * 0.0722;
  const Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const k = (t: number): number => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const [fx, fy, fz] = [k(X), k(Y), k(Z)];
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}
const dist = (a: string, b: string): number => {
  const [l1, a1, b1] = toLab(a); const [l2, a2, b2] = toLab(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
};
const minPair = (hexes: readonly string[]): number => {
  let m = Infinity;
  for (let i = 0; i < hexes.length; i += 1) {
    for (let j = i + 1; j < hexes.length; j += 1) m = Math.min(m, dist(hexes[i]!, hexes[j]!));
  }
  return m;
};

describe('勝負服の色', () => {
  it('★★同じレースで 2 頭が同じ色になることが無い（2〜18 頭）', () => {
    for (let field = 2; field <= 18; field += 1) {
      const roles = Array.from({ length: field }, (_, i) => silkRoleOf(i + 1, field));
      expect(new Set(roles).size, `${field} 頭立てで役割名が重複`).toBe(field);
      const hexes = roles.map((r) => pal[r]);
      for (const [i, hex] of hexes.entries()) {
        expect(hex, `${roles[i]} が palette.json に無い`).toBeDefined();
      }
      expect(new Set(hexes).size, `${field} 頭立てで色が重複`).toBe(field);
    }
  });

  it('★12 頭立ては「いちばん近い 2 色」が 30 以上（道具の目安）', () => {
    /**
     * ★`tools/pick-silk-palette.mjs` の目安は 30。
     *   ★18 色を馬番順にそのまま配ると 27.6 で下回るので、★離れた 12 色を選んでいます。
     */
    const hexes = Array.from({ length: 12 }, (_, i) => pal[silkRoleOf(i + 1, 12)]!);
    expect(minPair(hexes)).toBeGreaterThanOrEqual(30);
  });

  it('★13 頭以上は 25 以上（★目安 30 は満たせていない・要選び直し）', () => {
    /**
     * ⚠️ ★18 色をそのまま使うので **27.5** です。★目安 30 を下回ります。
     *    ★その頭数を出すなら色の選び直しが要る、という**既知の不足**をここに残します
     *    （下限を 25 にして「気づかないうちにさらに悪化する」ことだけ止めます）。
     */
    const hexes = Array.from({ length: 18 }, (_, i) => pal[silkRoleOf(i + 1, 18)]!);
    expect(minPair(hexes)).toBeGreaterThanOrEqual(25);
    expect(minPair(hexes), '★30 を満たしたら、この検査と注記を更新すること').toBeLessThan(30);
  });

  it('★帽子は枠色・上着は馬ごと（同じ枠でも上着は違う）', () => {
    const field = 12;
    for (let a = 1; a <= field; a += 1) {
      for (let b = a + 1; b <= field; b += 1) {
        if (frameRoleOf(a, field) !== frameRoleOf(b, field)) continue;
        /** ★同じ枠＝帽子は同じ。★それでも上着は必ず違うこと */
        expect(silkRoleOf(a, field), `馬番 ${a} と ${b} は同じ枠なのに上着も同じ`)
          .not.toBe(silkRoleOf(b, field));
      }
    }
  });

  it('★上着の塗りは、兜と重なった帯でも「上着」が勝つ', async () => {
    /**
     * ⚠️ ★兜と上着の窓は**重なります**（`SILKS_LAYOUT_CROUCH` は兜 ny≤0.23 /
     *    上着 ny 0.08〜0.39）。★`helmet || saddlecloth` と書いた結果、
     *    ★**重なった帯が全部帽子の色（＝枠色）**で塗られ、
     *    ★実画面で「7番と8番が同じ緑・11番と12番が同じピンク」になっていました。
     *    ★横から見た伏せた騎手は、★服のいちばん広い部分がその帯です。
     */
    const page = readFileSync('apps/web/src/app/race/page.tsx', 'utf8');
    /**
     * ⚠️ ★**この判定は 2 行に分かれました**（2026-09-02・下敷きを詰めた便）。
     *    ★塗る所を先に 1 度だけ決め（`region`）、★12 頭はそれを読むだけになったので、
     *    ★式そのものは `region` を作る行に移りました。★**中身は 1 文字も変えていません。**
     *    ★どちらの行も見ます（★片方だけ残っても気づけるように）。
     */
    expect(page).toContain('region[mask] = (saddlecloth || (helmet && !jacket)) ? 1 : 2;');
    expect(page).toContain('const useCap = kind === 1;');
  });
});
