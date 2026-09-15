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
import { silkRoleOf, frameRoleOf, silkPatternOf, silkPatternInk, SILK_PATTERNS } from '../src/bracket.js';

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

  /**
   * ★**8 頭立て（★2026-09-15 からの製品の頭数）は、帽子も上着も 8 頭すべて違う**
   *   ★オーナー指示「騎手の色を全て完全に変えてください」。
   *   ★上着どうしだけでなく ★**上着と 8 枠色（別の馬の帽子）**も離れていること。
   * ⚠️ ★対照: ★12 頭用の並びの先頭 8 色では、上着と帽子が同じ 16 進になる（★最小 0.0）。
   */
  it('★★8 頭立ては上着どうし 40 以上・上着と全枠色（帽子）40 以上／帽子も全頭違う', () => {
    const field = 8;
    const jackets = Array.from({ length: field }, (_, i) => pal[silkRoleOf(i + 1, field)]!);
    const caps = Array.from({ length: field }, (_, i) => pal[frameRoleOf(i + 1, field)]!);
    expect(new Set(caps).size, '★帽子（枠色）が全頭違う').toBe(field);
    expect(minPair(jackets)).toBeGreaterThanOrEqual(40);
    let jacketVsCap = Infinity;
    for (const j of jackets) for (const c of caps) jacketVsCap = Math.min(jacketVsCap, dist(j, c));
    expect(jacketVsCap).toBeGreaterThanOrEqual(40);
    /** ★対照（★この検査が空回りしていないこと） */
    const old = [1, 2, 4, 5, 6, 7, 8, 9].map((n) => pal[`silk-${n}`]!);
    let oldVsCap = Infinity;
    for (const j of old) for (const c of caps) oldVsCap = Math.min(oldVsCap, dist(j, c));
    expect(oldVsCap).toBeLessThan(1);
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

  /**
   * ★**つながった塊は 1 色で塗る**（★2026-09-15・オーナー判断「柄をやめて全部直す」）。
   *   ★窓の境目がヘルメットや上着の途中を通ると、★1 つの塊が四角く色違いに割れました
   *   （★ヘルメット後ろの四角・★上着の下の枠色の帯）。★塊の中で多い方の色に揃えます。
   * ⚠️ ★上の「上着が勝つ」は ★**塊を揃える前の 1 画素ずつの判定**として残っています。
   */
  it('★★塗る画素のつながった塊は、多い方の色 1 色に揃える', () => {
    const page = readFileSync('apps/web/src/app/race/page.tsx', 'utf8');
    expect(page).toContain('const kind = capCount >= bodyCount ? 1 : 2;');
    expect(page).toContain('for (const p of members) region[p] = kind;');
  });

  it('★★柄は無地だけ（★一本輪は真横の絵で縞に見えたのでやめた）', () => {
    expect([...SILK_PATTERNS]).toEqual(['plain']);
    for (let gate = 1; gate <= 18; gate += 1) expect(silkPatternOf(gate)).toBe('plain');
  });
});


/**
 * ★**帽子が同じ 2 頭は、★柄で見分けられる**（★2026-09-12・オーナー指示③）
 *
 *   > ★「③ 勝負服が同じ色があるので見にくい」
 *
 * ★色では直せないことを総当たりで確かめてあります（`silkPatternOf` の註記）:
 *   ★勝負服 18 色のうち ★**8 色が枠色と同じ 16 進**なので、★12 頭立てでは
 *   ★どう選んでも「別の馬の帽子と同じ色の上着」が出ます（★18,564 通り・最小 ΔLab 0.0）。
 * → ★見分けは ★**柄**が担います。★ここを固定します。
 */
describe('勝負服の柄', () => {
  /**
   * ⚠️ ★**見るのは「色と柄のどちらかが違う」です**（★2026-09-12・柄を 2 種に減らしたため）。
   *    ★以前は「柄が必ず違う」まで要求していましたが、★13 頭以上では 1 つの枠に
   *    ★3〜4 頭入るので 2 種では足りません。★そこは ★**上着の色**が全頭違うことで
   *    ★見分けられます（`silkRoleOf` が `silk-1`〜`silk-18` を配る）。
   * ★12 頭立て（★製品の頭数）では ★**同枠は連番**なので、★柄も必ず違います。
   */
  it('★★帽子が同じ色になる 2 頭は、色か柄のどちらかが違う（2〜18 頭）', () => {
    for (let field = 2; field <= 18; field += 1) {
      for (let a = 1; a <= field; a += 1) {
        for (let b = a + 1; b <= field; b += 1) {
          if (frameRoleOf(a, field) !== frameRoleOf(b, field)) continue;
          const sameColour = silkRoleOf(a, field) === silkRoleOf(b, field);
          const samePattern = silkPatternOf(a) === silkPatternOf(b);
          expect(sameColour && samePattern,
            `${field} 頭立ての ${a} 番と ${b} 番: 帽子も上着も柄も同じです`).toBe(false);
          /**
           * ⚠️ ★**「12 頭立てまでは柄が必ず違う」を外しました**（★2026-09-15・オーナー判断「柄をやめて全部直す」・★意図した変更）。
           *    ★柄（一本輪）は真横のデフォルメ馬で 2〜3 本の縞に見えたので、★無地だけにしました。
           *    ★同じ枠の 2 頭は ★**上着の色が必ず違う**ことで見分けます（★下の行と、上の「★帽子は枠色・上着は馬ごと」）。
           */
          expect(silkRoleOf(a, field), `${field} 頭立ての ${a} 番と ${b} 番は同じ枠なので上着の色を分けること`)
            .not.toBe(silkRoleOf(b, field));
        }
      }
    }
  });

  /**
   * ⚠️ ★**縦に走る柄を入れないこと**（★2026-09-12・オーナー指摘 2 回目）。
   *    ★素材の上着は ★**前から 240×90px**で、★その大半が帽子と肩です。★そこへ
   *    ★縦や斜めの帯を引くと ★**肩に乗った板**に見えます（★「縦縞が消えていない」）。
   * ★検定: ★どの柄も ★**横方向（`jx`）では変わらない**こと。
   */
  it('★★柄は横方向では変わらない（★縦の帯を入れない）', () => {
    for (const pattern of SILK_PATTERNS) {
      for (let j = 0; j <= 20; j += 1) {
        const jy = j / 20;
        const first = silkPatternInk(pattern, 0, jy);
        for (let i = 0; i <= 20; i += 1) {
          expect(silkPatternInk(pattern, i / 20, jy),
            `${pattern}: jy=${jy.toFixed(2)} で横に変化しています（★縦の帯）`).toBe(first);
        }
      }
    }
  });

  /**
   * ⚠️ ★**柄が画素を塗り分けていることを確かめます**（★R-22）。
   *    ★`silkPatternInk` が常に偽を返すようになっても上の検査は通ります
   *    （★柄の「名前」しか見ていないため）。★それでは画面は無地のままです。
   */
  it('★★無地以外の柄は、上着の窓の中を実際に塗り分けている', () => {
    for (const pattern of SILK_PATTERNS) {
      let ink = 0; let bare = 0;
      for (let i = 0; i < 20; i += 1) {
        for (let j = 0; j < 20; j += 1) {
          if (silkPatternInk(pattern, i / 19, j / 19)) ink += 1; else bare += 1;
        }
      }
      if (pattern === 'plain') { expect(ink, '無地は塗り分けない').toBe(0); continue; }
      expect(ink, `${pattern}: 差し色の画素がありません`).toBeGreaterThan(20);
      expect(bare, `${pattern}: 上着の地色が残っていません`).toBeGreaterThan(20);
    }
  });

  it('★★窓が潰れている組（幅 0）でも落ちない', () => {
    for (const pattern of SILK_PATTERNS) {
      expect(silkPatternInk(pattern, Number.POSITIVE_INFINITY, 0)).toBe(false);
      expect(silkPatternInk(pattern, Number.NaN, Number.NaN)).toBe(false);
    }
  });
});
