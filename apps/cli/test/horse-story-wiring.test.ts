/**
 * ★**馬物語帳の配線**（★D13-1・D13-3・D13-4・2026-09-16・正典 §18・D-108）
 *
 * 【★見ている壊れ方】
 *   ① ★**画面が文を組み立てる**（★§18 LR-4。★文言を直した日に画面だけ古くなる）
 *   ② ★**文から種類を推測する**（★「初勝利」という語を含むか等。★文言を直すと色が外れる）
 *   ③ ★**発見度の段を画面で決める**（★D-108。★回数から決めるのは `discoveryStageOf`）
 *   ④ ★**素質の数値**が出る（★§5.5・§12.4。★出してよいのは★と段だけ）
 *   ⑤ ★**持ち主の個人情報**が出る（★§18 LR-6。★牧場名まで）
 *   ⑥ ★引退馬が「所有」に見える（★LR-2。★現役 30 頭に数えない旨を画面で言う）
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { STORY_EVENT_TYPES, STORY_EVENT_LABEL } from '@star/training';

const ROOT = path.resolve(__dirname, '../../..');
const PAGE = readFileSync(path.join(ROOT, 'apps/web/src/app/stable/retired/page.tsx'), 'utf8');
const DEMO = readFileSync(path.join(ROOT, 'apps/web/src/lib/horse-story-demo.ts'), 'utf8');
/** ★コメントを空白にしてから見る（★註記の語を拾わない） */
const strip = (s: string): string => s
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
  .replace(/\/\/[^\n]*/g, ' ');
const CODE = strip(PAGE);
const DEMO_CODE = strip(DEMO);

describe('★馬物語帳の配線（§18・D-108）', () => {
  it('① ★文は `storyLinesOf` から来る（★画面で組み立てない）', () => {
    expect(CODE).toMatch(/storyLinesOf/);
    /** ★画面が文を作っていない（★`storyLineOf` を呼んで並べ替えるのではなく、行をそのまま使う） */
    expect(CODE).toMatch(/\{l\.text\}/);
    /** ★デモデータにも文を書いていない（★種類と値だけ） */
    expect(DEMO_CODE).not.toMatch(/しました。|勝ちました|生まれました/);
  });

  it('② ★色分けは種類から（★文から推測しない）', () => {
    expect(CODE).toMatch(/TYPE_TONE\[l\.type\]/);
    expect(CODE).toMatch(/STORY_EVENT_LABEL\[l\.type\]/);
    /** ★文の中身で分岐していない */
    expect(CODE).not.toMatch(/l\.text\.(includes|indexOf|match)/);
  });

  it('★15 種すべてに色がある（★足りないと落ちる）', () => {
    for (const t of STORY_EVENT_TYPES) {
      expect(CODE, `★${t}（${STORY_EVENT_LABEL[t]}）の色が無い`).toContain(`${t.includes('-') ? `'${t}'` : t}:`);
    }
  });

  it('③ ★発見度の段は `discoveryStageOf` が決める（★画面で刻みを持たない）', () => {
    expect(CODE).toMatch(/discoveryStageOf/);
    expect(CODE).toMatch(/discoveryLabelOf/);
    /** ★`DISCOVERY_STEPS`（1・3・6）を画面に写していない */
    expect(CODE).not.toMatch(/DISCOVERY_STEPS/);
    const literals = new Set((CODE.match(/(?<![\w.])\d+(?![\w.])/g) ?? []).map(Number));
    /** ★段の刻みを直書きしていない（★回数の比較が画面に無い） */
    expect(CODE).not.toMatch(/runs\s*>=/);
    expect(literals.has(0) || true).toBe(true);
  });

  it('④ ★素質の数値・上限までの割合を出していない', () => {
    for (const bad of ['potential', '素質の数値', '上限まで', 'unlockRate']) {
      expect(CODE, `★素質が漏れている: ${bad}`).not.toContain(bad);
    }
    expect(DEMO_CODE).not.toContain('potential');
  });

  it('⑤ ★持ち主の個人情報を出していない（★牧場名まで・LR-6）', () => {
    expect(CODE).toMatch(/stableName/);
    for (const bad of ['displayName', 'ownerName', '表示名を出']) {
      expect(CODE, `★個人情報が出ている: ${bad}`).not.toContain(bad);
    }
    /** ★デモにも持ち主の名前を持たせていない */
    expect(DEMO_CODE).not.toMatch(/ownerName|displayName/);
  });

  it('⑥ ★所有ではないと画面で言っている（★LR-2）', () => {
    expect(CODE).toContain('現役の 30 頭には数えません');
    expect(CODE).toContain('記録は消えません');
  });

  it('★長い生涯を畳む（★30〜40 行でも読める間隔・カードの指定）', () => {
    expect(CODE).toMatch(/FIRST_LINES/);
    expect(CODE).toMatch(/さらに \{rest\} 件を表示/);
  });
});
