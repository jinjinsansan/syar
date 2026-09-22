/**
 * ★**馬名の正規化キーの下見**（★PLAN I-3 段 2・`tools/lib/name-key-survey.mjs`）。
 *
 *   ★staging では重なりが 0 件で、★「重なりがあれば書かずに止まる」番人が ★一度も発火していなかった。
 *   → ★ここで ★重なり・空の名前を作り、★**止まることを確かめる**（★発火しない番人は番人ではない・CK-14）。
 */
import { describe, expect, it } from 'vitest';
import { normalizeName } from '@star/sim-engine';
// @ts-expect-error ★`.mjs` の部品（★`.d.mts` を置いていません）
import { blocksBackfill, surveyNameKeys } from '../../../tools/lib/name-key-survey.mjs';

type Row = { id: string; name: string; name_key: string | null };
const survey = surveyNameKeys as (rows: readonly Row[], n: (s: string) => string) => {
  total: number; empty: number; nullKey: number; wrongKey: number; collisions: number; toWrite: [string, string][];
};
const blocks = blocksBackfill as (s: ReturnType<typeof survey>) => boolean;

describe('★馬名の正規化キーの下見', () => {
  it('🔴 ★正規化で重なる名前（★長音・中黒の有無だけ違う）があれば ★書かずに止まる', () => {
    const s = survey([
      { id: 'a', name: 'ホシノヒカリ', name_key: null },
      { id: 'b', name: 'ホシノ・ヒカリ', name_key: null },
    ], normalizeName);
    expect(s.collisions).toBe(1);
    expect(blocks(s), '🔴 ★重なりがあるのに書こうとした（★段 3 の unique が落ちる）').toBe(true);
  });

  it('🔴 ★正規化で空になる名前があれば ★書かずに止まる', () => {
    const s = survey([{ id: 'a', name: 'ー・', name_key: null }], normalizeName);
    expect(s.empty).toBe(1);
    expect(blocks(s)).toBe(true);
  });

  it('★対照: ★重なりも空も無ければ書いてよい。★空と食い違いだけを書く', () => {
    const s = survey([
      { id: 'a', name: 'アイ', name_key: null },
      { id: 'b', name: 'ウエ', name_key: 'ウエ' },
      { id: 'c', name: 'オカ', name_key: 'ちがう' },
    ], normalizeName);
    expect(blocks(s)).toBe(false);
    expect(s).toMatchObject({ total: 3, nullKey: 1, wrongKey: 1, collisions: 0, empty: 0 });
    expect(s.toWrite).toEqual([['a', 'アイ'], ['c', 'オカ']]);
  });

  it('★2 回目（★全部 埋まっている）は ★書く行 0', () => {
    const s = survey([{ id: 'a', name: 'アイ', name_key: 'アイ' }], normalizeName);
    expect(s.toWrite).toEqual([]);
  });
});
