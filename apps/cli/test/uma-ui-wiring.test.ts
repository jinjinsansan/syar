/**
 * ★**馬物語 UI の配線**（★R-14・2026-09-17・引き渡し資料 §2・§13 の確認リスト）
 *
 * 【★なぜ検査で固定するか】
 *   ★資料 §13 は「実装できたかの確認リスト」を 15 項目挙げています。
 *   ★そのうち ★**機械で確かめられるもの**をここで固定します
 *   （★見た目の良否は確かめられません。★確かめられるものだけを検査にします）。
 *
 * 【★見ている壊れ方】
 *   ① ★**禁止語が増える**（★購入・チャージ・換金・円・課金／★馬券・商品交換）
 *   ② ★**EP と PP を合算した数字**が出る（★憲法 §0.2）
 *   ③ ★**arcade テーマの部品**（`a-*`・`.frame`）を使う（★A-2・テーマが混ざる）
 *   ④ ★**共通ヘッダーが二重**に載る（★A-1・`OWN_HEADER` に入れ忘れる）
 *   ⑤ ★**停止スイッチが無い**画面がある（★資料 §2-9・§5-7）
 *   ⑥ ★EP の副題が ★**オーナー判定 B-3 の文言**でない
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../../..');
const UMA_DIR = path.join(ROOT, 'apps/web/src/components/uma');
const read = (rel: string): string => readFileSync(path.join(ROOT, rel), 'utf8');
/** ★コメントを空白にしてから見る（★註記の語を拾わない） */
const strip = (s: string): string => s
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
  .replace(/\/\/[^\n]*/g, ' ');

/** ★馬物語 UI のファイルすべて（★増えても自動で対象になる） */
const umaFiles = readdirSync(UMA_DIR).filter((f) => f.endsWith('.tsx'));
const umaCode = umaFiles.map((f) => ({ name: f, code: strip(readFileSync(path.join(UMA_DIR, f), 'utf8')) }));

describe('★馬物語 UI の配線（R-14）', () => {
  it('★前提: 部品が実在する（★空振りしていない）', () => {
    expect(umaFiles.length, '★馬物語 UI のファイルが無い').toBeGreaterThan(0);
    expect(umaFiles).toContain('uma-parts.tsx');
    expect(umaFiles).toContain('uma-top.tsx');
  });

  it('① ★禁止語を増やしていない（★購入・チャージ・換金・円・課金／馬券・商品交換）', () => {
    for (const { name, code } of umaCode) {
      for (const bad of ['購入', 'チャージ', '換金', '課金', '馬券', '商品交換']) {
        expect(code, `★${name} に禁止語「${bad}」`).not.toContain(bad);
      }
      /** ★「円」は単語として出さない（★「円形」「楕円」は形の話なので除く） */
      expect(code.replace(/円形|楕円|半円/g, ''), `★${name} に「円」`).not.toContain('円');
    }
  });

  it('② ★EP と PP を合算していない（★憲法 §0.2）', () => {
    for (const { name, code } of umaCode) {
      /** ★足し算・合計の口を作らない */
      expect(code, `★${name} が EP+PP を足している`).not.toMatch(/ep\s*\+\s*pp|pp\s*\+\s*ep/i);
      expect(code, `★${name} に合計の語`).not.toMatch(/合計ポイント|総ポイント|totalPoints/);
    }
    /** ★カプセルは別々の部品（★1 つの部品が両方を受け取る形にしない） */
    const parts = strip(read('apps/web/src/components/uma/uma-parts.tsx'));
    expect(parts).toMatch(/export function EpCapsule/);
    expect(parts).toMatch(/export function PpCapsule/);
    expect(parts, '★1 つの部品が EP と PP を同時に受け取っている').not.toMatch(/function \w+Capsule\([^)]*ep[^)]*pp/i);
  });

  it('③ ★arcade テーマの部品を使っていない（★A-2・テーマを混ぜない）', () => {
    for (const { name, code } of umaCode) {
      expect(code, `★${name} が arcade の class を使っている`).not.toMatch(/className=["'`][^"'`]*\ba-(btn|panel|band|num|chip|lbl)\b/);
      expect(code, `★${name} が .frame を使っている`).not.toMatch(/className=["'`][^"'`]*\bframe\b/);
      /** ★arcade のトークンも引かない（★`--a-` で始まる変数） */
      expect(code, `★${name} が arcade のトークンを引いている`).not.toMatch(/var\(--a-/);
    }
  });

  it('④ ★★共通ヘッダーが二重に載らない（★A-1・`OWN_HEADER` に入れる）', () => {
    const shell = strip(read('apps/web/src/components/story-shell.tsx'));
    /** ★自前の上段バーを持つ画面は、すべて OWN_HEADER 側に入れる */
    for (const route of ['/home', '/howto']) {
      expect(shell, `★${route} が OWN_HEADER に無い（★帯が二重になる）`).toContain(`'${route}'`);
    }
    expect(shell).toMatch(/OWN_HEADER\.includes\(pathname\)/);
  });

  it('⑤ ★停止スイッチが常設されている（★資料 §2-9・§5-7）', () => {
    const parts = strip(read('apps/web/src/components/uma/uma-parts.tsx'));
    expect(parts).toMatch(/export function MotionToggle/);
    expect(parts).toMatch(/export function useMotionPaused/);
    /** ★端末の設定で初期から止まる */
    expect(parts).toContain('prefers-reduced-motion');
    /** ★画面はスイッチを置いている */
    const top = strip(read('apps/web/src/components/uma/uma-top.tsx'));
    expect(top, '★TOP に停止スイッチが無い').toMatch(/MotionToggle/);
  });

  it('⑥ ★EP の副題がオーナー判定 B-3 の文言（★「ゲーム内で使う（無償でのみ受け取れます）」）', () => {
    const parts = read('apps/web/src/components/uma/uma-parts.tsx');
    expect(parts).toContain('ゲーム内で使う（無償でのみ受け取れます）');
  });

  it('★停止しても情報が欠けない（★速度線は 0% から不透明・資料 §5-7 の 4）', () => {
    const css = read('apps/web/src/components/uma/uma-theme.css');
    /** ★`animation-play-state` ではなく `animation:none` で止める（★途中の姿で固まらない） */
    expect(css).toMatch(/animation:\s*none\s*!important/);
    /** ★端末の設定にも従う */
    expect(css).toContain('prefers-reduced-motion');
  });

  it('★既存の「馬券」を画面から消した（★A-4）', () => {
    /**
     * ⚠️ ★**コメントを空白にしてから見ます**（★他の配線検査と同じ作法）。
     *    ★2026-09-17: ★最初これを生の本文で見たところ、
     *    ★**「画面の語を『馬券』から『投票』に統一」と書いた註記そのもの**が当たりました。
     *    ★`entry-freeze.test.ts` で一度踏んだのと同じ形です（★D-108 ③ の家族）。
     */
    const entry = strip(read('apps/web/src/app/entry/page.tsx'));
    expect(entry, '★entry の画面に「馬券」が残っている').not.toContain('馬券');
    expect(entry).toContain('自分の馬が出るレースは投票できません');
  });
});
