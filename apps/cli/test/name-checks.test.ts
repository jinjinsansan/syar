/**
 * ★**禁止名の一覧が複数ある形**（`loadNameChecks`・提案 `PROPOSAL_PLAYER_NAME_MODERATION_20260922.md` §4）。
 *
 * 【★見ている壊れ方】
 *   ① ★不快な語の一覧が無いのに ★投げる（★まだ用意されていない一覧で世界が止まる）
 *   ② ★実在馬名の一覧が無いのに ★黙って通す（★憲法 §0.1 の担保が外れる）
 *   ③ ★「含む」の一覧が ★部分を見ていない（★埋め込まれた語を通す）
 *   ④ ★版が ★読めた一覧の組を表していない（★一覧が増えても再検査が拾い直せない）
 */
import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { normalizeName } from '@star/sim-engine';
import { hashNormalizedName, loadNameChecks, type NameListKind } from '../src/name-blocklist.js';

const dir = mkdtempSync(path.join(tmpdir(), 'name-checks-'));
const file = (name: string, words: readonly string[]): string => {
  const p = path.join(dir, name);
  writeFileSync(p, `${words.map((w) => hashNormalizedName(normalizeName(w))).join('\n')}\n`, 'utf8');
  return p;
};
const missing = (name: string): string => path.join(dir, `missing-${name}`);
const paths = (o: Partial<Record<NameListKind, string>>): Record<NameListKind, string> => ({
  'real-horse': o['real-horse'] ?? missing('real'),
  'offensive-exact': o['offensive-exact'] ?? missing('exact'),
  'offensive-contains': o['offensive-contains'] ?? missing('contains'),
});

describe('★禁止名の一覧が複数ある形（loadNameChecks）', () => {
  it('① ★一覧が 1 つも無ければ ★版は null・★何も当たらない（★strict を外したとき）', () => {
    const r = loadNameChecks(paths({}), false);
    expect(r.version).toBeNull();
    expect(r.kinds).toEqual([]);
    expect(r.blocked(normalizeName('アイウエ'))).toBe(false);
  });

  it('② 🔴 ★実在馬名の一覧が無ければ ★既定で投げる（★不快な語の一覧が在っても）', () => {
    expect(() => loadNameChecks(paths({ 'offensive-exact': file('ex1', ['アイウ']) }))).toThrow();
  });

  it('★不快な語の一覧は ★無くても投げない（★実在馬名の一覧だけで動く）', () => {
    const r = loadNameChecks(paths({ 'real-horse': file('real1', ['カキクケ']) }));
    expect(r.kinds).toEqual(['real-horse']);
    expect(r.blocked(normalizeName('カキクケ'))).toBe(true);
    expect(r.blocked(normalizeName('サシスセ'))).toBe(false);
  });

  it('★完全一致の一覧は ★名前そのものだけに当たる', () => {
    const r = loadNameChecks(paths({ 'real-horse': file('real2', ['カキクケ']), 'offensive-exact': file('ex2', ['タチツ']) }));
    expect(r.blocked(normalizeName('タチツ'))).toBe(true);
    expect(r.blocked(normalizeName('タチツテ')), '★完全一致の一覧が部分にも当たった').toBe(false);
  });

  it('③ 🔴 ★「含む」の一覧は ★名前の中の部分にも当たる（★先頭・途中・末尾）', () => {
    const r = loadNameChecks(paths({ 'real-horse': file('real3', ['カキクケ']), 'offensive-contains': file('in3', ['ナニ']) }));
    for (const name of ['ナニヌネ', 'アナニウ', 'アイナニ', 'ナニ']) {
      expect(r.blocked(normalizeName(name)), `★${name} に当たらない`).toBe(true);
    }
    // ★対照: ★含まない名前には当たらない
    expect(r.blocked(normalizeName('ナヌニネ'))).toBe(false);
  });

  it('④ ★版は ★読めた一覧だけを決まった順に並べる（★一覧が増えると版が変わる）', () => {
    const real = file('real4', ['カキクケ']);
    const one = loadNameChecks(paths({ 'real-horse': real }));
    const two = loadNameChecks(paths({ 'real-horse': real, 'offensive-contains': file('in4', ['ナニ']) }));
    expect(one.version).toMatch(/^real-horse:[0-9a-f]{16}$/);
    expect(two.version).toMatch(/^real-horse:[0-9a-f]{16}\+offensive-contains:[0-9a-f]{16}$/);
    expect(two.version).not.toBe(one.version);
    // ★同じ一覧の組なら ★同じ版
    expect(loadNameChecks(paths({ 'real-horse': real })).version).toBe(one.version);
  });
});
