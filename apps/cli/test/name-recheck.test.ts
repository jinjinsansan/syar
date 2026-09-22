/**
 * ★**未検査の馬名を禁止名の判定で分ける**（★`tools/lib/name-recheck.mjs`・PLAN I-3）。
 *   ★本物の NG リストはまだ無いので、★「当たったら書かない」番人を ★ここで発火させる（★発火しない番人は番人ではない・CK-14）。
 */
import { describe, expect, it } from 'vitest';
// @ts-expect-error ★`.mjs` の部品（★`.d.mts` を置いていません）
import { hitMarkOf, isHitMark, needsRecheck, needsRecheckSql, partitionByBlocklist } from '../../../tools/lib/name-recheck.mjs';

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

describe('★前の一覧の組で合格した行を、★新しい組で拾い直す（★裁定 REVIEW_BREED_OWN_MARE_VERDICT_20260922.md §6）', () => {
  const needs = needsRecheck as (m: string | null, v: string) => boolean;
  const part2 = partitionByBlocklist as (
    rows: readonly { id: string; name_key: string | null }[], blocked: (k: string) => boolean,
  ) => { hits: { id: string }[]; clean: { id: string }[] };
  const mark = hitMarkOf as (v: string) => string;
  const A = 'real-horse:aaaaaaaaaaaaaaaa';
  const B = 'real-horse:aaaaaaaaaaaaaaaa+offensive-contains:bbbbbbbbbbbbbbbb';

  it('🔴 ★版 A で合格した行が、★版 B（一覧が増えた）で拾い直され・★当たりになる', () => {
    // ★版 A の一覧（実在馬名だけ）では当たらなかった名前。★版 B で「含む」の一覧が増え、★当たる
    const rows = [
      { id: 'p', name_key: 'アイナニウ', name_checked_with: A },     // ★A で合格 → ★B で当たる
      { id: 'q', name_key: 'カキクケ', name_checked_with: A },       // ★A で合格 → ★B でも合格
      { id: 'r', name_key: 'サシスセ', name_checked_with: B },       // ★B で合格済み → ★拾わない
      { id: 's', name_key: 'タチツテ', name_checked_with: mark(A) }, // ★A で当たり → ★拾わない
      { id: 't', name_key: 'ナヌネノ', name_checked_with: null },    // ★未検査 → ★拾う
    ];
    const picked = rows.filter((r) => needs(r.name_checked_with, B));
    expect(picked.map((r) => r.id)).toEqual(['p', 'q', 't']);
    const r = part2(picked, (k) => k.includes('ナニ'));
    expect(r.hits).toEqual([{ id: 'p' }]);
    expect(r.clean).toEqual([{ id: 'q' }, { id: 't' }]);
  });

  it('★対照: ★版が変わらなければ ★合格の行は拾わない（★毎回全部を検査し直さない）', () => {
    expect(needs(A, A)).toBe(false);
    expect(needs(null, A)).toBe(true);
    expect(needs(mark(A), B)).toBe(false);
  });

  it('★書き込みの競合よけの SQL も ★同じ 3 つの場合分けを持つ（★null・当たりの印・今の版）', () => {
    const sql = needsRecheckSql(3);
    expect(sql).toContain('name_checked_with is null');
    expect(sql).toContain("not like 'hit:%'");
    expect(sql).toContain('<> $3');
  });
});
