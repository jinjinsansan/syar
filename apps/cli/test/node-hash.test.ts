/**
 * K-2: ハッシュ実装の同値性（正典 §8.6）
 *
 * ★このテストが担っていること:
 *   `race-engine` のテストは依存ゼロを保つため**純 TS 実装の SHA-256** を注入している。
 *   もしその実装が本物の SHA-256 でなければ、Provably Fair のテストはすべて緑のまま
 *   **主張だけが偽**になる（M-1 のクラス）。ここで
 *     (a) 既知ベクタ（FIPS 180-4 / RFC 4231）と一致すること
 *     (b) Node の `crypto` と全一致すること
 *   の2点を固定し、注入されたハッシュが本物であることを担保する。
 */

import { describe, expect, it } from 'vitest';
import { hmacSha256Hex, sha256Hex } from '../../../packages/race-engine/test/pure-hash.js';
import { nodeHash } from '../src/node-hash.js';

describe('SHA-256 / HMAC-SHA256 の実装（K-2）', () => {
  it('既知ベクタと一致する（FIPS 180-4）', () => {
    expect(sha256Hex('')).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    expect(sha256Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')).toBe(
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    );
  });

  it('HMAC の既知ベクタと一致する（RFC 4231 Test Case 2）', () => {
    expect(hmacSha256Hex('Jefe', 'what do ya want for nothing?')).toBe(
      '5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843',
    );
  });

  it('Node の crypto と全一致する（純TS実装が本物であることの担保）', () => {
    const messages = [
      '',
      'a',
      'STAR',
      'race-id-0001',
      'x'.repeat(55), // パディング境界の直前
      'x'.repeat(56), // 長さフィールドが次ブロックへ押し出される境界
      'x'.repeat(57),
      'x'.repeat(63),
      'x'.repeat(64), // ブロック境界ちょうど
      'x'.repeat(65),
      'x'.repeat(1000),
      '日本語のマルチバイト文字列',
    ];
    for (const m of messages) {
      expect(sha256Hex(m), `sha256(${m.length}文字)`).toBe(nodeHash.sha256(m));
    }
    const keys = ['', 'k', 'y'.repeat(63), 'y'.repeat(64), 'y'.repeat(65), 'y'.repeat(200)];
    for (const k of keys) {
      for (const m of ['', 'msg', 'z'.repeat(100)]) {
        expect(hmacSha256Hex(k, m), `hmac(key=${k.length}, msg=${m.length})`).toBe(
          nodeHash.hmacSha256(k, m),
        );
      }
    }
  });

  it('Node 実装も16進小文字64桁を返す', () => {
    expect(nodeHash.sha256('x')).toMatch(/^[0-9a-f]{64}$/);
    expect(nodeHash.hmacSha256('k', 'x')).toMatch(/^[0-9a-f]{64}$/);
  });
});
