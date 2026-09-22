/**
 * ★**未検査の馬名を禁止名の判定で分ける**（★`tools/lib/name-recheck.mjs`・PLAN I-3）。
 *   ★本物の NG リストはまだ無いので、★「当たったら書かない」番人を ★ここで発火させる（★発火しない番人は番人ではない・CK-14）。
 */
import { describe, expect, it } from 'vitest';
// @ts-expect-error ★`.mjs` の部品（★`.d.mts` を置いていません）
import { hitMarkOf, isHitMark, partitionByBlocklist } from '../../../tools/lib/name-recheck.mjs';

const part = partitionByBlocklist as (
  rows: readonly { id: string; name_key: string | null }[], blocked: (k: string) => boolean,
) => { hits: { id: string }[]; clean: { id: string }[] };

describe('★未検査の馬名を禁止名の判定で分ける', () => {
  it('🔴 ★当たった行は ★書かない側（hits）・★当たらない行は書く側（clean）', () => {
    const r = part([
      { id: 'a', name_key: 'アイ' }, { id: 'b', name_key: 'キンシ' }, { id: 'c', name_key: 'ウエ' },
    ], (k) => k === 'キンシ');
    expect(r.hits).toEqual([{ id: 'b' }]);
    expect(r.clean).toEqual([{ id: 'a' }, { id: 'c' }]);
  });

  it('★対照: ★何も当たらなければ ★全部 書く側', () => {
    const r = part([{ id: 'a', name_key: 'アイ' }], () => false);
    expect(r).toEqual({ hits: [], clean: [{ id: 'a' }] });
  });

  it('★name_key が空の行は ★どちらにも入れない（★判定できないものを検査済みにしない）', () => {
    const r = part([{ id: 'a', name_key: null }], () => false);
    expect(r).toEqual({ hits: [], clean: [] });
  });
});


describe('★当たった行に書く印（★未検査・合格と区別する）', () => {
  const mark = hitMarkOf as (v: string) => string;
  const isHit = isHitMark as (m: string | null) => boolean;

  it('★印は ★未検査（null）とも ★合格（版そのもの）とも違う・★版を含む', () => {
    const v = 'abc123';
    expect(mark(v)).not.toBe(v);
    expect(mark(v)).toContain(v);
    expect(isHit(mark(v))).toBe(true);
  });

  it('★対照: ★合格の印（版）と未検査（null）は ★当たりと読まない', () => {
    expect(isHit('abc123')).toBe(false);
    expect(isHit(null)).toBe(false);
  });

  it('★版が無ければ ★印を作らない（★空の印で「検査済み」にしない）', () => {
    expect(() => mark('')).toThrow();
  });
});
