/**
 * ★**仔の命名の結線**（★PLAN I-3・2026-09-24）
 *
 * 【★見ている壊れ方】
 *   ① 🔴 ★**画面が名前の形を自分で判定する**（★ワーカーと判定が 2 つ）
 *   ② 🔴 ★**ワーカーが理由を増やしたのに、画面が分類していない**（★黙って「もう一度」になる）
 *   ③ 🔴 ★**「使えます」と出してしまう**（★重複・禁止名は送るまで分からない）
 *   ④ ★**「あとから変えられません」と書く**（★第 1 便の回答 §11 で禁じた文言）
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PLAYER_NAME_MIN_CHARS, PLAYER_NAME_MAX_CHARS } from '@star/sim-engine';
import { nameFailureOf, nameShapeOf } from '../../web/src/lib/name-screen.js';

const ROOT = path.resolve(__dirname, '../../..');
const strip = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
const LIB = readFileSync(path.join(ROOT, 'apps/web/src/lib/name-screen.ts'), 'utf8');
const PAGE = readFileSync(path.join(ROOT, 'apps/web/src/app/stable/name/page.tsx'), 'utf8');
const WORKER = readFileSync(path.join(ROOT, 'apps/worker/src/player-naming.ts'), 'utf8');
const ENGINE = readFileSync(path.join(ROOT, 'packages/sim-engine/src/naming.ts'), 'utf8');

describe('★仔の命名の結線', () => {
  it('① 🔴 ★画面は形の判定を持たない（★エンジンの関数を呼ぶ）', () => {
    expect(LIB).toMatch(/checkPlayerHorseName/);
    // ★文字の並びや長さの数を、画面の層に書いていない
    const live = strip(LIB);
    expect(live).not.toMatch(/ァ-ヺ/);
    expect(live).not.toMatch(/length\s*[<>]=?\s*\d/);
    expect(strip(PAGE)).not.toMatch(/ァ-ヺ/);
  });

  it('★形の判定は通る（★カタカナ 2〜9 文字）', () => {
    expect(nameShapeOf('サクラ').ok).toBe(true);
    expect(nameShapeOf('ア').ok).toBe(false);
    expect(nameShapeOf('さくら').ok).toBe(false);
    expect(nameShapeOf('').ok).toBe(false);
    expect(nameShapeOf('カリメイアイウエオ').ok).toBe(false);
  });

  it('★形の理由は、すべて「形が違う」に寄せる', () => {
    for (const r of ['empty', 'invalid_chars', 'length', 'too_short_normalized', 'reserved_prefix']) {
      expect(nameFailureOf(r)).toBe('shape');
    }
  });

  it('★重複・禁止名・その他の写し', () => {
    expect(nameFailureOf('name_taken')).toBe('taken');
    expect(nameFailureOf('name_blocked')).toBe('blocked');
    expect(nameFailureOf('already_named')).toBe('already');
    expect(nameFailureOf('draft_not_found')).toBe('missing');
    expect(nameFailureOf(null)).toBe('temp');
    expect(nameFailureOf('nanika_atarashii')).toBe('temp');
  });

  /**
   * ② 🔴 ★ワーカーの理由（`FoalNameFailure` ＋ `PlayerNameRejection`）を 1 つ残らず分類していること。
   *   ★`temp` に倒れるものが 1 つも無いこと（★命名にはワーカー側の「内部エラー」の語が無い）。
   */
  it('② 🔴 ★ワーカーの理由を 1 つ残らず分類している（★増えたら落ちる）', () => {
    const a = /export type FoalNameFailure =([\s\S]*?);/.exec(WORKER);
    const b = /export type PlayerNameRejection =([\s\S]*?);/.exec(ENGINE);
    expect(a, '★FoalNameFailure の宣言が見つからない').not.toBe(null);
    expect(b, '★PlayerNameRejection の宣言が見つからない').not.toBe(null);
    const reasons = [...new Set([
      ...[...strip(a![1]!).matchAll(/'([a-z_]+)'/g)].map((m) => m[1]!),
      ...[...strip(b![1]!).matchAll(/'([a-z_]+)'/g)].map((m) => m[1]!),
    ])];
    expect(reasons.length).toBeGreaterThan(6);
    const fellBack = reasons.filter((r) => nameFailureOf(r) === 'temp');
    expect(fellBack, '★分類されていない理由がある（★name-screen.ts に足すこと）').toEqual([]);
  });

  it('③ 🔴 ★「使えます」と出さない（★重複は送るまで分からない）', () => {
    const live = strip(PAGE);
    expect(live).not.toMatch(/使えます/);
    expect(live).toMatch(/送ってから分かります/);
  });

  it('④ 🔴 ★「あとから変えられません」と書かない（★第 1 便の回答 §11）', () => {
    const live = strip(PAGE);
    expect(live).not.toMatch(/永久/);
    expect(live).not.toMatch(/あとから変え/);
    expect(live).toMatch(/ご自身では変更できません/);
  });

  it('★文字数の案内は、エンジンの定数から出す（★画面に数を書かない）', () => {
    expect(PAGE).toMatch(/PLAYER_NAME_MIN_CHARS/);
    expect(PAGE).toMatch(/PLAYER_NAME_MAX_CHARS/);
    expect(PLAYER_NAME_MIN_CHARS).toBeLessThan(PLAYER_NAME_MAX_CHARS);
  });
});
