/**
 * 🔴 ★**育成の馬の歩き（スプライト表）が、★コマの境目で止まること**（★2026-09-24）
 *
 * ============================================================================
 * 【★何が起きたか】
 *   ★`/train` の歩きは ★**8 コマを横に並べた 1 枚**を `background-position` で送ります。
 *   ★最初こう書きました: `animation: u-walk .8s steps(8) infinite`。
 *   ★**実ブラウザで測ったら、★8 コマ中 7 コマで 2 コマが半分ずつ映っていました。**
 *
 *   ★`steps(8)`（既定の `jump-end`）が止まるのは ★**0/8, 1/8 … 7/8**。
 *   ★コマの境目は ★**0/7, 1/7 … 7/7** です（★`background-position-x` は百分率だと
 *   ★「はみ出し量に対する割合」なので、★N コマなら k/(N-1)）。
 *   → ★`steps(8, jump-none)` は ★**両端を含む 8 点**で止まり、★境目と一致します。
 *
 *   ★実測（`node tools/measure-walk-sprite-steps.mjs`・画素の平均差 0〜255）:
 *     ★k/7 の位置 … 1.01〜1.04（★webp の非可逆ぶん）
 *     ★k/8 の位置 … 1.01 / 25.75 / 32.44 / 33.94 / 35.26 / 33.51 / 31.74 / 24.94
 *
 * 【🔴 ★なぜ機械で見張るか】
 *   ★**目で見ると「なんとなく歩いている」ように見えます。** ★半コマずれても脚は動くからです。
 *   ★オーナーからは「★足が変」「★ちらつく」としか言えず、★原因に辿り着けません。
 *   → ★**3 つの数（コマ数・`800%`・`jump-none`）が食い違ったら落とします。**
 *
 * ⚠️ ★この検査は ★**原文と PNG の寸法**を読みます（★ブラウザを開きません）。
 *    ★「合っていること」は上の実測が示しました。★ここが見るのは ★**ずれていないこと**です。
 * ============================================================================
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../../..');
/**
 * ★歩きの表の送り方は ★2026-09-28 から ★共通の部品 `OwnHorseFigure`（`uma-parts.tsx`）にあります
 *   （★`/train`・`/home`・`/mypage` が同じ馬の姿を使う・オーナー指示・レビュー側の裁定）。★育成の画面は それを使うだけ。
 */
const PAGE = readFileSync(path.join(ROOT, 'apps/web/src/components/uma/uma-parts.tsx'), 'utf8')
  + readFileSync(path.join(ROOT, 'apps/web/src/app/train/page.tsx'), 'utf8');
const CSS = readFileSync(path.join(ROOT, 'apps/web/src/components/uma/uma-theme.css'), 'utf8');
const ART = path.join(ROOT, 'apps/web/public/art/uma');

/** ★PNG の IHDR から寸法を読む（★依存を増やさない・★先頭 24 バイトで足りる） */
function pngSize(file: string): { readonly w: number; readonly h: number } {
  const b = readFileSync(file);
  expect(b.subarray(1, 4).toString('ascii'), `★${file} が PNG ではない`).toBe('PNG');
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

const sheet = pngSize(path.join(ART, 'horse-walk-sheet.png'));
const frame = pngSize(path.join(ART, 'horse-walk-01.png'));
/** ★素材が持っているコマ数（★画面にもテストにも書き写さない） */
const FRAMES = sheet.w / frame.w;

describe('🔴 ★育成の歩き（スプライト表）', () => {
  it('★素材そのものが整っている（★コマ数が整数・★高さが同じ）', () => {
    expect(Number.isInteger(FRAMES), `★表 ${sheet.w}px ÷ コマ ${frame.w}px = ${FRAMES}（★割り切れない）`).toBe(true);
    expect(FRAMES, '★コマ数が 2 未満').toBeGreaterThan(1);
    expect(sheet.h, '★表とコマで高さが違う').toBe(frame.h);
  });

  it('🔴 ★`background-size` の横幅が ★コマ数 × 100% になっている', () => {
    /** ★2026-10-01: ★表は 毛色を焼いた URL（`useCoatedImage('/art/uma/horse-walk-sheet.webp', …)`）で渡し、★背景は `url('${sheet}') … / N% 100%` */
    /** ★2026-10-02: ★絵の名前は `horseArt`（★性別 × 1 倍／2 倍・牝馬は horse-mare-*）。★名前の決まりは own-horse-figure ④ */
    expect(PAGE).toContain("horseArt(sex, 'walk', hires), coat)");
    /** ★PC の 2 倍の表（★2026-10-01）も ★同じコマ数（★幅 ÷ 高さが 1 倍の表と同じ ＝ 横 8 コマ） */
    const webpSize = (file: string): { readonly w: number; readonly h: number } => {
      const b = readFileSync(file);
      expect(b.toString('ascii', 12, 16), `★${file} が VP8X でない`).toBe('VP8X');
      return { w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3) };
    };
    const x1 = webpSize(path.join(ART, 'horse-walk-sheet.webp'));
    const x2 = webpSize(path.join(ART, 'horse-walk-sheet-2x.webp'));
    expect(x2.w, '★2 倍の表の幅').toBe(x1.w * 2);
    expect(x2.h, '★2 倍の表の高さ').toBe(x1.h * 2);
    /** ★牝馬の表も ★同じコマ数（★幅 ÷ 高さ が 牡馬の表と 1% 以内・★同じ 800% 100% で送る） */
    for (const [a, b] of [['horse-mare-walk-sheet.webp', x1], ['horse-mare-walk-sheet-2x.webp', x2]] as const) {
      const s = webpSize(path.join(ART, a));
      expect(Math.abs(s.w / s.h - b.w / b.h) / (b.w / b.h), `★${a} のコマ数が 牡馬と違う`).toBeLessThan(0.01);
    }
    const m = PAGE.match(/url\('\$\{sheet\}'\) no-repeat 0 0 \/\s*(\d+)%\s*100%/);
    expect(m, '🔴 ★歩きの表に `/ <幅>% 100%` が付いていない').not.toBeNull();
    expect(Number(m![1]), `🔴 ★${FRAMES} コマなら ${FRAMES * 100}% です`).toBe(FRAMES * 100);
  });

  it('🔴 ★送りが `steps(<コマ数>, jump-none)` になっている（★既定の steps だと半コマずれる）', () => {
    const m = PAGE.match(/u-walk[^'"`;]*steps\(\s*(\d+)\s*(?:,\s*([a-z-]+)\s*)?\)/);
    expect(m, '🔴 ★`u-walk` に `steps(...)` が無い').not.toBeNull();
    expect(Number(m![1]), `🔴 ★${FRAMES} コマなのに steps(${m![1]})`).toBe(FRAMES);
    expect(
      m![2],
      '🔴 ★`jump-none` がありません。★既定（jump-end）は 0/8〜7/8 で止まり、★コマの境目 0/7〜7/7 と合いません'
        + '（★実測: 差 25〜35／合っていれば 1.0）',
    ).toBe('jump-none');
  });

  it('🔴 ★`@keyframes u-walk` は 0% から 100% まで送る（★`jump-none` と対）', () => {
    const kf = CSS.match(/@keyframes u-walk\s*\{([^}]*\}[^}]*)\}/);
    expect(kf, '🔴 ★`@keyframes u-walk` が無い').not.toBeNull();
    expect(kf![1], '🔴 ★始点が 0% でない').toMatch(/from\s*\{[^}]*background-position-x:\s*0%/);
    expect(kf![1], '🔴 ★終点が 100% でない').toMatch(/to\s*\{[^}]*background-position-x:\s*100%/);
  });

  it('★停止スイッチが効く形で書いてある（★JS のタイマーで送らない）', () => {
    expect(PAGE, '🔴 ★`setInterval` でコマを送っています（★`.u-paused` が効きません）')
      .not.toContain('setInterval');
  });
});
