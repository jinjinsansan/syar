/**
 * ★**TOP の背景（芝・遠景・馬）**（★2026-09-17・第 2 稿）
 *
 * 【★なぜ書き直したか】
 *   🔴 ★第 1 稿は「★近景の芝を **遠近 4 段** に割る」ことを固定していました。
 *      ★その作りは ★**失敗でした**。★段ごとに明るさを 3.5% ずつ階段状にし、
 *      ★段の頭に白い線まで足したので、★境目が ★**明るい横線**として出ました。
 *      ★私は報告に「★境目が遠近の線として読める」と書きましたが、★**読めていません**
 *      （★オーナー指摘「★芝の動きも雑なまま」「★PC 表示では隙間から芝の雑が見える」）。
 *      ⚠️ ★**機械の診断は 0 点になったのに、苦情の言葉は消えていませんでした。**
 *   → ★段そのものをやめ、★**1 枚＋縦のぼかし**にしました。★この検査もそれに合わせます。
 *
 * 【★このテストが言えること／言えないこと】
 *   ★言える  … ★線を生む作り（段・縦の繰り返し・境目の影）に ★**戻っていない**こと
 *   ★言えない … ★画面が綺麗に見えること。★それは ★**オーナーの目**が決めます
 *              （★見た目の合否をこちらで宣言しない）
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
/**
 * ★**コメントを空白にしてから見ます。**
 * ⚠️ ★入れ忘れると、★**差し替えの理由を書いた自分の註記**に検査が当たります
 *    （★2026-09-17 に `chibi-horse.png` で 1 度踏みました。★同型 3 回目でした）。
 */
const strip = (s: string): string => s
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
  .replace(/\/\/[^\n]*/g, ' ');
const read = (rel: string): string => strip(readFileSync(path.join(HERE, '..', rel), 'utf8'));

describe('★TOP の背景', () => {
  it('★★近景の芝が「線を生む作り」に戻っていない（★苦情の再発を止める）', () => {
    const parts = read('src/components/uma/uma-parts.tsx');
    const near = parts.slice(parts.indexOf("turf-near.webp"));

    /** ★① ★**縦にも繰り返さない**（★90px ごとのタイルの継ぎ目が等間隔に並びます） */
    expect(near, '★近景が縦にも繰り返している（★等間隔の横筋が戻る）')
      .not.toMatch(/turf-near\.webp'\) repeat /);
    expect(near, '★近景が横方向の繰り返しになっていない').toMatch(/turf-near\.webp'\) repeat-x/);

    /** ★② ★**1 タイル＝`150cqw` ちょうど**流す（★輪に戻るときの跳ねが出ません） */
    expect(near, '★タイル幅が `150cqw` でない（★流れの継ぎ目が跳ねる）').toContain("'150cqw 100%'");
    const css = read('src/components/uma/uma-theme.css');
    expect(css, '★流れがタイル 1 枚ぶんちょうどでない').toMatch(/u-turf\s*\{\s*to\s*\{\s*background-position-x:\s*-150cqw/);

    /** ★③ ★**段に割らない**（★段の数だけ境目ができます） */
    expect(parts, '★近景をまた段に割っている（★境目が横線になる）').not.toMatch(/nearBands|NEAR_BANDS/);
    /** ★④ ★**境目に影を置かない**（★私が足した白線がそのまま見えていました） */
    expect(near, '★境目に影を置いている（★白い線が出る）').not.toMatch(/inset 0 1px 0 rgba\(255,255,255/);
  });

  /**
   * ★**遠景も動く**（★オーナー指示「★芝を動かすなら背景の観客席も動かないといけない」）。
   * ⚠️ ★観客席は ★**完全に静止**していました。★地面だけが流れるので、
   *    ★貼り紙の前で馬が足踏みして見えていました。
   */
  it('★★観客席・柵が止まっていない（★地面だけ流れない）', () => {
    const parts = read('src/components/uma/uma-parts.tsx');
    expect(parts, '★遠景を流す部品が無い').toMatch(/function ParallaxStrip/);
    /**
     * 🔴 ★**`world-panorama.webp` はもう使いません**（★2026-09-17・第 2 稿）。
     *    ★1 枚だと木立も観客席も生垣も ★**同じ速さ**で、★遠近が付きませんでした。
     *    ★中継（`parallax/backstretch-side-v1/manifest.json`）と同じく
     *    ★`trees` / `stand` / `hedge` の ★**3 層**に分けました。
     *
     * ⚠️ ★この検査は ★**2 度、実装に合っていませんでした**。
     *    ★① ★古い 1 枚の作り（`world-panorama`）を名指しで固定していた
     *    ★② ★`trees.webp` という ★**連続した文字列を探していた**。★実装は
     *       ★`src={\`/art/uma/${L.src}.webp\`}` と ★**組み立てて**いるので、
     *       ★ソースにその綴りは存在しません。★**実装は正しく、検査が当たっていませんでした。**
     *    ★`OWN_HEADER` の件に続いて ★**同じ形の失敗が今日 4 度目**です。
     * → ★**実装の書き方に合わせて見ます**（★名前の並びと、組み立ての式）。
     */
    expect(parts, '★遠景を組み立てで流していない').toContain('/art/uma/${L.src}.webp');
    for (const name of ['trees', 'stand', 'hedge']) {
      expect(parts, `★遠景の層 ${name} が無い（★1 枚に戻ると遠近が消える）`)
        .toContain(`{ src: '${name}',`);
    }
    for (const src of ['inner-rail.webp', 'front-rail.webp', 'turf-far.webp']) {
      expect(parts, `★${src} が流れていない（★貼り付いて見える）`)
        .toMatch(new RegExp(`ParallaxStrip[\\s\\S]{0,200}${src.replace('.', '\\.')}`));
    }
    /** ★もう使わない 1 枚に戻っていないこと */
    expect(parts, '★遠景が 1 枚（world-panorama）に戻っている').not.toContain('world-panorama');
    /**
     * ★継ぎ目を出さない作り（★同じ幅の箱を 2 枚・★片方は +100% から）。
     * ⚠️ ★`background-position` を動かす作りでは、★タイル幅が分からないので **必ず跳ねます**。
     */
    const css = read('src/components/uma/uma-theme.css');
    expect(css, '★遠景の流れが 2 枚組でない（★輪に戻るとき跳ねる）')
      .toMatch(/u-pan-a[\s\S]{0,160}translateX\(-100%\)/);
    expect(css, '★2 枚目の始まりが画面の右外でない')
      .toMatch(/u-pan-b[\s\S]{0,160}translateX\(100%\)/);
  });

  /**
   * ★**TOP の馬はデフォルメ・真横**（★オーナー指摘「★馬が違います」→ ⓐ を採用）。
   * ⚠️ ★脚は動きません。★元絵は「★8 コマの frame 01」で、★**残り 7 コマが未作成**です。
   */
  /**
   * ★**TOP の馬は「レースに出ている馬」と同じ素材**（★2026-09-17・オーナー指摘
   *   ★「★既にレース演出で使っている素材がありますよね？ ★それを使えばいいだけでは？？」）。
   *
   * 🔴 ★ここまで 3 回外しました（★斜め 1 枚 → 写実 6 コマ → 細身のデフォルメ）。
   *    ★どれも ★**`/race` が何を読んでいるかを調べる前に選んだ**ためです。
   */
  it('★★TOP の馬が中継と同じ素材（side-v8 の 8 コマ）', () => {
    const top = read('src/components/uma/uma-top.tsx');
    for (const wrong of ['chibi-horse.png', 'horse-gallop.webp', 'chibi-side.webp']) {
      expect(top, `★外した素材に戻っている: ${wrong}`).not.toContain(wrong);
    }
    expect(top, '★中継の素材を使っていない').toContain('horse-jockey-side-v8-pose0');
    /** ★8 コマ全部を重ねている（★1 枚だけだと脚が止まります） */
    expect(top, '★8 コマになっていない').toMatch(/\[1, 2, 3, 4, 5, 6, 7, 8\]/);
    /** ⚠️ ★止めたとき 8 枚が重なって濁らないよう、★1 枚目以外は素の値を透明に */
    expect(top, '★止めると 8 枚が重なって濁る').toMatch(/opacity: n === 1 \? 1 : 0/);
    const css = read('src/components/uma/uma-theme.css');
    expect(css, '★コマの切り替えが瞬時でない（★2 コマが溶けて濁る）')
      .toMatch(/u-frame[\s\S]{0,120}12\.49%[\s\S]{0,60}opacity: 1/);
  });

  /** ★素材が実在する（★参照だけ直して置き忘れる、を防ぐ） */
  it('★★参照している素材が実在する', () => {
    const ROOT = path.resolve(HERE, '../../..');
    /**
     * ⚠️ ★ここは ★**もう使わない `world-panorama.webp`** を見ていました（★2026-09-17）。
     *    ★通ってはいましたが ★**空振り**です（★在っても使っていないので、画面は守れません）。
     *    → ★**いま実際に使う 7 枚**に差し替えます。
     */
    for (const f of ['trees.webp', 'stand.webp', 'hedge.webp', 'inner-rail.webp', 'front-rail.webp', 'turf-far.webp', 'turf-near.webp']) {
      const p = path.join(ROOT, 'apps/web/public/art/uma', f);
      expect(() => readFileSync(p), `★${f} が置かれていない（★画面が欠ける）`).not.toThrow();
    }
    /** ★中継の 8 コマ（★webp。★png のままだと 1 枚 460KB で TOP が重くなります） */
    for (let n = 1; n <= 8; n += 1) {
      const p = path.join(ROOT, `apps/web/public/art/horse-jockey-side-v8-pose0${n}.webp`);
      expect(() => readFileSync(p), `★pose0${n}.webp が無い（★tools/build-art-webp.mjs）`).not.toThrow();
    }
  });
});
