/**
 * 憲法 §0.1: 実在競走馬名 NG リスト（ハッシュ運用）
 *
 * ★このテストは**実在馬名を一切書かずに**機能を確かめる。
 *   テストデータに実在馬名を入れた時点で §0.1 違反になるので、
 *   無機質な文字列（HORSE_001 等）とダミー語で確かめる。
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { normalizeName } from '@star/sim-engine';
import { afterAll, describe, expect, it } from 'vitest';
import { buildBlocklist, hashName, loadNameBlocklist } from '../src/name-blocklist.js';

const dir = mkdtempSync(join(tmpdir(), 'star-ng-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const plain = join(dir, 'ng.txt');
const hashed = join(dir, 'ng.hash');
writeFileSync(plain, ['# コメント行は無視される', 'ダミーメイ', 'テストウマ・ニゴウ', '', 'ダミーメイ'].join('\n'));

describe('§0.1 NG リストのハッシュ運用', () => {
  it('平文からハッシュ集合を作れる（重複は畳まれる）', () => {
    expect(buildBlocklist(plain, hashed)).toBe(2);
  });

  it('★ハッシュファイルに元の名前が平文で残らない（これが目的そのもの）', () => {
    buildBlocklist(plain, hashed);
    const raw = require('node:fs').readFileSync(hashed, 'utf8') as string;
    expect(raw).not.toContain('ダミーメイ');
    expect(raw).not.toContain('テストウマ');
    expect(raw).toMatch(/^[0-9a-f\n]+$/);
  });

  it('★載っている名前を弾き、載っていない名前は通す', () => {
    buildBlocklist(plain, hashed);
    const { blocklist, size } = loadNameBlocklist(hashed);
    expect(size).toBe(2);
    expect(blocklist(normalizeName('ダミーメイ'))).toBe(true);
    // 中点・長音の有無でくぐり抜けられない（正規化してから突合する）
    expect(blocklist(normalizeName('テストウマニゴウ'))).toBe(true);
    expect(blocklist(normalizeName('ヴェルナカクマ'))).toBe(false);
  });

  it('★リストが無いときは黙って素通しにせず例外を投げる', () => {
    // 「無ければ何も弾かない」だと、憲法の担保が静かに外れる
    expect(() => loadNameBlocklist(join(dir, 'missing.hash'))).toThrow(/§0\.1/);
    expect(loadNameBlocklist(join(dir, 'missing.hash'), false).size).toBe(0);
  });

  it('ハッシュは正規化後の名前に対して安定（同じリストから同じ結果が出る）', () => {
    expect(hashName('テストウマ・ニゴウ')).toBe(hashName('テストウマニゴウ'));
  });
});
