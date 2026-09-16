/**
 * ★**持ち馬 30 頭と厩舎の格の配線**（★D12-6・2026-09-16・正典 **D-103**・**D-104**）
 *
 * 【★見ている壊れ方】
 *   ① ★**倍率・値段を画面に直書き**する（★D-052。★正典を直した日に画面だけ古くなる）
 *   ② ★**上限 30 を画面に直書き**する（★D-104・§6.7。★`OWNERSHIP_LIMITS` から引く）
 *   ③ ★**「強くなる」と読める語**を使う（★買えるのは時間であって強さではない）
 *   ④ ★**伸びと費用のバーの長さが違う**（★「同じ倍率」を目で断言する作りが壊れる）
 *   ⑤ ★**いまの格に値段が出る**（★買う対象ではない）
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  STABLE_GRADES, STABLE_GRADE_MULT, STABLE_GRADE_LABEL, GRADE_UNLOCK_EP, gainPerEpRatio,
} from '@star/training';
import { OWNERSHIP_LIMITS } from '@star/scheduler';

const ROOT = path.resolve(__dirname, '../../..');
const PANEL = readFileSync(path.join(ROOT, 'apps/web/src/components/stable-grade-panel.tsx'), 'utf8');
const strip = (s: string): string => s
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
  .replace(/\/\/[^\n]*/g, ' ');
const CODE = strip(PANEL);
/** ★画面に書かれた数値リテラル（★部分一致で誤検出しないよう、値として拾う） */
const literals = new Set((CODE.match(/(?<![\w.])\d+(?:\.\d+)?(?![\w.])/g) ?? []).map(Number));

describe('★厩舎の格の配線（D-103・D12-6）', () => {
  it('① ★倍率と値段を画面に書いていない（★`@star/training` から引く）', () => {
    for (const m of Object.values(STABLE_GRADE_MULT)) {
      /** ★1.0 は幅の計算などで出うるので、★1 以外の倍率だけを見る */
      if (m === 1) continue;
      expect(literals, `★倍率が画面に写っている: ${m}`).not.toContain(m);
    }
    for (const p of Object.values(GRADE_UNLOCK_EP)) {
      expect(literals, `★値段が画面に写っている: ${p}`).not.toContain(p);
    }
    expect(CODE).toMatch(/gradeGainMult/);
    expect(CODE).toMatch(/unlockPriceEP/);
    expect(CODE).toMatch(/STABLE_GRADE_LABEL/);
  });

  it('② ★上限 30 を画面に直書きしていない', () => {
    expect(literals, '★所有上限が画面に写っている').not.toContain(OWNERSHIP_LIMITS.active);
  });

  it('③ ★「強くなる」と読める語を使っていない', () => {
    for (const bad of ['強くなる', '強化', 'パワーアップ', '強さが上がる']) {
      expect(CODE, `★誤読を招く語がある: ${bad}`).not.toContain(bad);
    }
    /** ★正しい言い方が入っている */
    expect(CODE).toContain('速く仕上がる');
    expect(CODE).toContain('同じ倍率');
  });

  it('④ ★伸びと費用は同じ長さで描く（★1 つの幅を 2 本に使う）', () => {
    /** ★2 本のバーを同じ `w` で描いている（★別々の値を持たない） */
    expect(CODE).toMatch(/\['伸び', '費用'\]/);
    expect(CODE).toMatch(/width: `\$\{w\}%`/);
    /** ★EP あたりの伸びはどの格でも 1.0（★これが崩れたら「お金で強さを買う」形） */
    for (const g of STABLE_GRADES) expect(gainPerEpRatio(g), g).toBe(1.0);
  });

  it('⑤ ★いまの格には値段を出さない', () => {
    expect(CODE).toMatch(/isNow \?/);
    expect(CODE).toContain('現在の格');
  });

  it('★1 回に 1 段・天井は変わらない、を画面で言っている', () => {
    expect(CODE).toContain('1 回に 1 段だけ');
    expect(CODE).toContain('素質の天井（★）は変わりません');
    expect(CODE).toContain('これ以上は上げられません');
  });
});

/**
 * ★**一覧の側**（`/stable`）も同じ線で見る。
 * ⚠️ ★部品だけを見ていると、★**一覧に 30 や倍率を直書き**されたときに気づけません
 *    （★2026-09-16: 検査を書いた時点では部品しか見ていませんでした）。
 */
describe('★持ち馬の一覧の配線（D-104・D12-6）', () => {
  const LIST = strip(readFileSync(path.join(ROOT, 'apps/web/src/app/stable/page.tsx'), 'utf8'));
  const listLiterals = new Set((LIST.match(/(?<![\w.])\d+(?:\.\d+)?(?![\w.])/g) ?? []).map(Number));

  it('② ★上限 30 を一覧に直書きしていない（★`OWNERSHIP_LIMITS` から引く）', () => {
    expect(LIST).toMatch(/OWNERSHIP_LIMITS\.active/);
    expect(listLiterals, '★所有上限が一覧に写っている').not.toContain(OWNERSHIP_LIMITS.active);
  });

  it('① ★格の名前と倍率を一覧に持っていない', () => {
    expect(LIST).toMatch(/STABLE_GRADE_LABEL\[h\.stableGrade\]/);
    for (const label of Object.values(STABLE_GRADE_LABEL)) {
      expect(LIST, `★格の名前が一覧に写っている: ${label}`).not.toContain(label);
    }
    for (const m of Object.values(STABLE_GRADE_MULT)) {
      if (m === 1) continue;
      expect(listLiterals, `★倍率が一覧に写っている: ${m}`).not.toContain(m);
    }
  });

  it('★残り枠を出している（★数字だけでなく「残り N 頭」）', () => {
    expect(LIST).toContain('残り');
  });
});
