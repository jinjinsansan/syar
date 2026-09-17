/**
 * ★**TOP の背景・題字・馬**（★2026-09-17・第 3 稿）
 *
 * 【★なぜ 3 度も書き直したか】
 *   ★第 1 稿 … ★近景を「遠近 4 段」に割る作りを固定していた。★段の境目が横線になり廃止。
 *   ★第 2 稿 … ★`/art/uma/` の芝を `150cqw` で流す作りを固定していた。
 *   🔴 ★どちらも ★**私が考えた作り**で、★中継とは別物でした。
 *      ★オーナー指摘「★おそらくデザイナーのハンドオフ通りの芝にしており、
 *      ★**レース演出そのものの芝にしていないから**です」。
 *   → ★第 3 稿は ★**中継の板（`manifest.json`・941px）の割合**をそのまま使います。
 *     ★この検査も「★板の割合から外れていないか」を見る形にします。
 *
 * 【★このテストが言えること／言えないこと】
 *   ★言える  … ★中継の板と ★**同じ素材・同じ割合・同じ速さ**で組んでいること
 *   ★言えない … ★画面が綺麗に見えること。★それは ★**オーナーの目**が決めます
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
/**
 * ★**コメントを空白にしてから見ます。**
 * ⚠️ ★入れ忘れると、★差し替えの理由を書いた自分の註記に検査が当たります（★同型 3 回）。
 */
const strip = (s: string): string => s
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
  .replace(/\/\/[^\n]*/g, ' ');
const read = (rel: string): string => strip(readFileSync(path.join(HERE, '..', rel), 'utf8'));

/** ★中継の板（★これが正本。★検査はここから作ります） */
const MANIFEST = JSON.parse(readFileSync(
  path.join(ROOT, 'apps/web/public/art/parallax/backstretch-side-v1/manifest.json'), 'utf8',
)) as {
  plateHeight: number;
  layers: readonly { name: string; file: string; plateY0: number; plateY1: number; depthOffsetM: number }[];
};

/**
 * ★`PLATE_LAYERS` の表だけを切り出します。
 *
 * 🔴 ★2026-09-17: ★最初 `parts.slice(indexOf('const PLATE_LAYERS'), indexOf('] as const'))`
 *    ★と書きました。★`] as const` は ★**28 行目（`useMotionPaused` の中）に先に在り**、
 *    ★`indexOf` がそちらを拾って ★`slice(9853, 393)` ＝ ★**空文字**になりました。
 *    ★「表が無い」と落ちましたが、★**実装は正しく、検査の切り出しが誤り**でした。
 *    ★今日 5 度目の同型です。→ ★**始点より後ろだけ**を探します。
 */
function plateTable(): string {
  const parts = read('src/components/uma/uma-parts.tsx');
  const from = parts.indexOf('const PLATE_LAYERS');
  if (from < 0) return '';
  const to = parts.indexOf('] as const', from);
  return to < 0 ? parts.slice(from) : parts.slice(from, to);
}

describe('★TOP の背景（中継の板と同じ組み方）', () => {
  it('★前提: 板の定義が読める（★空振りしていない）', () => {
    expect(MANIFEST.plateHeight).toBe(941);
    expect(MANIFEST.layers.length).toBeGreaterThan(8);
  });

  /**
   * 🔴 ★**割合を守らないと「手前が半透明」に戻ります**（★オーナー指摘・2026-09-17）。
   *    ★`turf-near` は板の **9.6%** しかありません。★それを画面の 64% へ広げると
   *    ★**5 倍以上に引き伸ばす**ことになり、★ぼやけて白っぽくなります。
   */
  it('★★層の割合が中継の板と一致する', () => {
    const table = plateTable();
    expect(table.length, '★PLATE_LAYERS が無い').toBeGreaterThan(50);

    for (const L of MANIFEST.layers) {
      const y = (L.plateY0 / MANIFEST.plateHeight) * 100;
      const h = ((L.plateY1 - L.plateY0) / MANIFEST.plateHeight) * 100;
      const row = new RegExp(`\\{ src: '${L.name}', y: ([\\d.]+), h: ([\\d.]+), dur: ([\\d.]+) \\}`);
      const m = row.exec(table);
      expect(m, `★層 ${L.name} が PLATE_LAYERS に無い`).not.toBeNull();
      expect(Number(m![1]), `★${L.name} の位置が板とずれている`).toBeCloseTo(y, 1);
      expect(Number(m![2]), `★${L.name} の高さが板とずれている`).toBeCloseTo(h, 1);
    }
  });

  /**
   * ★速さは中継の公式から（★`parallax-plate.ts`）:
   *   `pxPerM = packPxPerM × packDepthM / (packDepthM + depthOffsetM)`
   * ★注視点 30m・`turf-near` を 1 とした比で、★`turf-near` の 0.62s を割ります。
   */
  it('★★速さが中継の公式どおり（★当てずっぽうに戻っていない）', () => {
    const table = plateTable();
    const D = 30;
    const near = MANIFEST.layers.find((l) => l.name === 'turf-near');
    expect(near, '★turf-near が板に無い').toBeDefined();
    const base = D / (D + near!.depthOffsetM);
    for (const L of MANIFEST.layers) {
      const want = 0.62 / ((D / (D + L.depthOffsetM)) / base);
      const m = new RegExp(`\\{ src: '${L.name}',[^}]*dur: ([\\d.]+) \\}`).exec(table);
      expect(m, `★層 ${L.name} の速さが無い`).not.toBeNull();
      expect(Number(m![1]), `★${L.name} の速さが公式と違う（★奥ほど遅く）`).toBeCloseTo(want, 1);
    }
  });

  it('★★中継と同じ素材を読んでいる（★写しではなく本体）', () => {
    const parts = read('src/components/uma/uma-parts.tsx');
    expect(parts, '★中継の素材を読んでいない')
      .toContain('/art/parallax/backstretch-side-v1/${L.src}.webp');
    /** ⚠️ ★自分で作った芝の層に戻っていないこと（★二重帳簿・「手前が半透明」の原因） */
    for (const gone of ['150cqw', 'u-turf', 'u-mow', 'nearBands', "/art/uma/turf"]) {
      expect(parts, `★廃止した作りが戻っている: ${gone}`).not.toContain(gone);
    }
  });

  it('★★継ぎ目の出ない流し方（★同じ幅の箱を 2 枚）', () => {
    const parts = read('src/components/uma/uma-parts.tsx');
    expect(parts, '★遠景を流す部品が無い').toMatch(/function ParallaxStrip/);
    const css = read('src/components/uma/uma-theme.css');
    expect(css, '★1 枚目が左へ抜けない').toMatch(/u-pan-a[\s\S]{0,160}translateX\(-100%\)/);
    expect(css, '★2 枚目の始まりが画面の右外でない').toMatch(/u-pan-b[\s\S]{0,160}translateX\(100%\)/);
  });

  /**
   * ★**TOP の馬は「レースに出ている馬」と同じ素材**。
   * 🔴 ★ここまで 3 回外しました（★斜め 1 枚 → 写実 6 コマ → 細身のデフォルメ）。
   */
  it('★★TOP の馬が中継と同じ素材（side-v8 の 8 コマ）', () => {
    const top = read('src/components/uma/uma-top.tsx');
    for (const wrong of ['chibi-horse.png', 'horse-gallop.webp', 'chibi-side.webp']) {
      expect(top, `★外した素材に戻っている: ${wrong}`).not.toContain(wrong);
    }
    expect(top, '★中継の素材を使っていない').toContain('horse-jockey-side-v8-pose0');
    expect(top, '★8 コマになっていない').toMatch(/\[1, 2, 3, 4, 5, 6, 7, 8\]/);
    expect(top, '★止めると 8 枚が重なって濁る').toMatch(/opacity: n === 1 \? 1 : 0/);
  });

  /**
   * ★**題字は札なし・白抜き＋耳と目**（★オーナー指示・デザイナー案 4）。
   * ⚠️ ★目は ★**中継の素材から切り出したもの**で、描き起こしではありません。
   */
  it('★★題字が札なし・白抜き＋耳と目', () => {
    const top = read('src/components/uma/uma-top.tsx');
    expect(top, '★金の札に戻っている').not.toContain('u-gold-plate');
    expect(top, '★白抜きになっていない').toContain('WebkitTextStroke');
    expect(top, '★耳が無い').toContain('clipPath');
    expect(top, '★目が無い').toContain('title-eye.webp');
    /** ★1 枚の素材を反転して 2 つにしている（★左右で別素材を持たない） */
    expect(top, '★右目の反転が無い').toContain('scaleX(-1)');
  });

  it('★★参照している素材が実在する', () => {
    for (let n = 1; n <= 8; n += 1) {
      const p = path.join(ROOT, `apps/web/public/art/horse-jockey-side-v8-pose0${n}.webp`);
      expect(() => readFileSync(p), `★pose0${n}.webp が無い`).not.toThrow();
    }
    for (const L of MANIFEST.layers) {
      const p = path.join(ROOT, `apps/web/public/art/parallax/backstretch-side-v1/${L.name}.webp`);
      expect(() => readFileSync(p), `★${L.name}.webp が無い（★層が欠ける）`).not.toThrow();
    }
    expect(
      () => readFileSync(path.join(ROOT, 'apps/web/public/art/uma/title-eye.webp')),
      '★題字の目が無い',
    ).not.toThrow();
  });
});
