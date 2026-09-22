/**
 * N-1: 馬名生成と NPC 厩舎（正典 §10.5 / 憲法 §0.1）
 *
 * ★憲法に関わるテストは、通ることより**破れたときに落ちること**が要点。
 *   「実在馬名がゼロ」は `rg -uu` の検閲で見る（報告書に記載）が、
 *   ここでは**そもそも実在馬名が入り込む経路（NG 判定の無効化）**を塞ぐ。
 */

import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  checkPlayerHorseName,
  ALLOW_ALL_NAMES,
  DEFAULT_NAME_SHAPE,
  DISTANCE_BIAS_CENTER,
  NAME_MAX_ATTEMPTS,
  NAME_SYLLABLES,
  NAME_TAILS,
  NPC_STABLES,
  Rng,
  composeName,
  generateHorseName,
  normalizeName,
  type NameShape,
} from '../src/index.js';

describe('§10.5 馬名の音節結合生成', () => {
  it('同じシードから同じ名前が出る（決定論・憲法 §1-4）', () => {
    const a = Array.from({ length: 50 }, () => composeName(new Rng(42), DEFAULT_NAME_SHAPE));
    const rngA = new Rng(42);
    const rngB = new Rng(42);
    const seqA = Array.from({ length: 50 }, () => composeName(rngA, DEFAULT_NAME_SHAPE));
    const seqB = Array.from({ length: 50 }, () => composeName(rngB, DEFAULT_NAME_SHAPE));
    expect(seqA).toEqual(seqB);
    // シードが同じでも Rng を作り直せば毎回同じ1件目が出る（＝取り違えの検出）
    expect(new Set(a).size).toBe(1);
  });

  it('冠名が先頭に付く', () => {
    const shape: NameShape = { prefix: 'ヴェルナ', minSyllables: 2, maxSyllables: 3 };
    const rng = new Rng(7);
    for (let i = 0; i < 100; i += 1) {
      expect(composeName(rng, shape).startsWith('ヴェルナ')).toBe(true);
    }
  });

  it('★語尾音が付く割合が 35〜55%（NAME_TAIL_RATE の振る舞い）', () => {
    // 較正定数そのものを閾値に使わない（D-018 の教訓・自己検出の回避）。リテラルで押さえる。
    const rng = new Rng(2026);
    const shape: NameShape = { prefix: '', minSyllables: 3, maxSyllables: 3 };
    let tailed = 0;
    const N = 4000;
    for (let i = 0; i < N; i += 1) {
      const name = composeName(rng, shape);
      const last = name.slice(-1);
      // 3音節ちょうどなので、語尾音が付いた分だけ文字数が伸びる
      if (NAME_TAILS.includes(last) && name.length > 3) tailed += 1;
    }
    const rate = tailed / N;
    expect(rate).toBeGreaterThan(0.35);
    expect(rate).toBeLessThan(0.55);
  });

  it('★名前空間が十分に広い（3音節で 5万通り以上）', () => {
    // 狭いと 2,500頭 × 50世代 のプリシードで重複が頻発し、生成が例外で止まる
    expect(NAME_SYLLABLES.length ** 3).toBeGreaterThan(50_000);
  });

  it('語頭は音節表の文字（長音・撥音が語頭に立たない）', () => {
    const rng = new Rng(31337);
    for (let i = 0; i < 500; i += 1) {
      const name = composeName(rng, DEFAULT_NAME_SHAPE);
      expect(name.startsWith('ー')).toBe(false);
      expect(name.startsWith('ン')).toBe(false);
    }
  });
});

describe('§0.1 NG 判定と重複回避', () => {
  it('正規化は長音・中黒・空白を落として大文字に揃える', () => {
    expect(normalizeName('ヴェル・ナート')).toBe(normalizeName('ヴェルナト'));
    expect(normalizeName(' abc ')).toBe('ABC');
  });

  it('★NG 判定に当たった名前は返らない（憲法 §0.1 の実効性）', () => {
    const rng = new Rng(11);
    const taken = new Set<string>();
    // 「ア」で始まる名前をすべて禁止する。返り値に1件でも混ざれば憲法違反の経路が空いている
    const blocked = (n: string): boolean => n.startsWith('ア');
    for (let i = 0; i < 300; i += 1) {
      const { name } = generateHorseName(rng, DEFAULT_NAME_SHAPE, taken, blocked);
      expect(normalizeName(name).startsWith('ア')).toBe(false);
    }
  });

  it('★重複を返さない（正規化後で一意）', () => {
    const rng = new Rng(5);
    const taken = new Set<string>();
    const names: string[] = [];
    for (let i = 0; i < 2000; i += 1) {
      names.push(generateHorseName(rng, DEFAULT_NAME_SHAPE, taken, ALLOW_ALL_NAMES).name);
    }
    expect(new Set(names.map(normalizeName)).size).toBe(names.length);
  });

  it('★引き直しの上限に達したら例外を投げる（黙って重複を通さない）', () => {
    const rng = new Rng(9);
    const taken = new Set<string>();
    const blockAll = (): boolean => true;
    expect(() => generateHorseName(rng, DEFAULT_NAME_SHAPE, taken, blockAll)).toThrow(
      new RegExp(String(NAME_MAX_ATTEMPTS)),
    );
  });
});

describe('§10.5 NPC 厩舎の個性', () => {
  it('40厩舎ある', () => {
    expect(NPC_STABLES.length).toBe(40);
  });

  it('★id と冠名が一意（冠名が被るとプレイヤーが血統を見分けられない）', () => {
    expect(new Set(NPC_STABLES.map((s) => s.id)).size).toBe(40);
    expect(new Set(NPC_STABLES.map((s) => s.prefix)).size).toBe(40);
  });

  it('★距離4種・馬場3種・成長3種がすべて現れる（一系統に潰れない設計）', () => {
    expect(new Set(NPC_STABLES.map((s) => s.distance)).size).toBe(4);
    expect(new Set(NPC_STABLES.map((s) => s.surface)).size).toBe(3);
    expect(new Set(NPC_STABLES.map((s) => s.growth)).size).toBe(3);
    // 道悪巧者・バランス型がどちらも一定数いる
    expect(NPC_STABLES.filter((s) => s.heavy).length).toBeGreaterThanOrEqual(8);
    expect(NPC_STABLES.filter((s) => s.emphasis === null).length).toBeGreaterThanOrEqual(4);
  });

  it('★どの距離方針にも複数の厩舎がいる（配合相手が1つしかない状態を避ける）', () => {
    for (const d of Object.keys(DISTANCE_BIAS_CENTER)) {
      const n = NPC_STABLES.filter((s) => s.distance === d).length;
      expect(n).toBeGreaterThanOrEqual(8);
    }
  });

  it('★狙う距離中心が §8.2 の距離帯にまたがる', () => {
    const centers = Object.values(DISTANCE_BIAS_CENTER);
    expect(Math.min(...centers)).toBeLessThanOrEqual(1400);
    expect(Math.max(...centers)).toBeGreaterThanOrEqual(2800);
  });
});

describe('★利用者が付ける馬名の形（★D-120「命名の規則（暫定）」・裁定 REVIEW_I3_NAMING_VERDICT_20260922.md §4）', () => {
  const ok = (s: string) => checkPlayerHorseName(s);
  it('★カタカナ・長音・中黒で 2〜9 文字は通る（★上限ちょうど・下限ちょうど）', () => {
    expect(ok('アイ')).toMatchObject({ ok: true, display: 'アイ' });
    expect(ok('アイウエオカキクケ')).toMatchObject({ ok: true });
    expect(ok('ホシノ・ヒカリ')).toMatchObject({ ok: true, nameKey: 'ホシノヒカリ' });
  });
  it('★対照: ★1 文字・10 文字は落ちる', () => {
    expect(ok('ア')).toEqual({ ok: false, reason: 'length' });
    expect(ok('アイウエオカキクケコ')).toEqual({ ok: false, reason: 'length' });
  });
  it('★半角カナは NFKC で全角にして通す（★保存は全角）', () => {
    const r = ok('ｱｲｳｰ');
    expect(r).toMatchObject({ ok: true, display: 'アイウー' });
  });
  it('★カタカナ以外（英字・漢字・ひらがな・数字・絵文字）は落ちる', () => {
    for (const s of ['Star', '星光', 'ほし', 'アイ1', 'アイ🐎']) {
      expect(ok(s), s).toEqual({ ok: false, reason: 'invalid_chars' });
    }
  });
  it('🔴 ★正規化の後で 2 文字未満になる名前は落ちる（★記号だけで重複の判定をすり抜けない）', () => {
    expect(ok('ーー')).toEqual({ ok: false, reason: 'too_short_normalized' });
    expect(ok('・ア')).toEqual({ ok: false, reason: 'too_short_normalized' });
  });
  it('★空は落ちる', () => {
    expect(ok('  ')).toEqual({ ok: false, reason: 'empty' });
  });
});

describe('🔴 ★sim-engine は Node に依存しない（★裁定 REVIEW_I3_NAMING_VERDICT_20260922.md §2）', () => {
  it('★src に `node:` の読み込みが無い（★画面・アプリからも読む包みなので）', () => {
    const dir = new URL('../src/', import.meta.url);
    const offenders = readdirSync(dir).filter((f) => f.endsWith('.ts'))
      .filter((f) => /from\s+['"]node:|require\(\s*['"]node:/.test(readFileSync(new URL(f, dir), 'utf8')));
    expect(offenders).toEqual([]);
    // ★対照: ★命名の本体（naming.ts）が走査の中に入っている
    expect(readdirSync(dir)).toContain('naming.ts');
  });
});
