/**
 * K-2 Provably Fair の回帰テスト（正典 §8.6・§8.8）
 *
 * ★ハッシュはテスト内でも**注入**する。Node 実装を使うと race-engine のテストが
 *   Node に依存し、「依存ゼロ」の主張がテスト側から崩れる。
 *   ここでは決定的なダミーではなく **RFC 準拠の既知ベクタで検証した実装**を注入する
 *   （`apps/cli/test/node-hash.test.ts` が Node 実装を既知ベクタで固定している）。
 */

import { describe, expect, it } from 'vitest';
import {
  RNG_STREAM,
  auditFailures,
  clientEntropy,
  commitServerSeed,
  deriveFinalSeed,
  finalSeedToRngSeed,
  verifyReveal,
  type HashProvider,
  type RaceAuditRecord,
} from '../src/index.js';
import { pureHashProvider } from './pure-hash.js';

const H: HashProvider = pureHashProvider;

describe('§8.6 Provably Fair の手順', () => {
  it('seed_commit は SHA-256 形式（16進小文字64桁）を強制する', () => {
    const commit = commitServerSeed('server-seed-abc', H);
    expect(commit).toMatch(/^[0-9a-f]{64}$/);
    expect(() => commitServerSeed('', H)).toThrow(/server_seed が空/);
  });

  it('seed_reveal の検証が通る／改竄すると通らない（§8.6 の中心的な主張）', () => {
    const serverSeed = 'server-seed-abc';
    const commit = commitServerSeed(serverSeed, H);
    expect(verifyReveal(serverSeed, commit, H)).toBe(true);
    // 1文字でも違えば false
    expect(verifyReveal('server-seed-abd', commit, H)).toBe(false);
    expect(verifyReveal(serverSeed, commit.replace(/.$/, '0'), H)).toBe(false);
  });

  it('形式不正の入力を true に倒さない（R-3・判定不能は不合格へ）', () => {
    expect(verifyReveal('', 'x', H)).toBe(false);
    expect(verifyReveal('seed', 'not-a-hash', H)).toBe(false);
    expect(verifyReveal('seed', '', H)).toBe(false);
  });

  it('client_entropy は出走馬IDの集合で決まり、順序に依存しない', () => {
    const a = clientEntropy(['H3', 'H1', 'H2'], H);
    const b = clientEntropy(['H1', 'H2', 'H3'], H);
    expect(a).toBe(b);
    // 顔ぶれが変われば変わる
    expect(clientEntropy(['H1', 'H2', 'H4'], H)).not.toBe(a);
  });

  it('client_entropy は0頭・重複IDを拒否する', () => {
    expect(() => clientEntropy([], H)).toThrow(/0頭/);
    expect(() => clientEntropy(['H1', 'H1'], H)).toThrow(/重複/);
  });

  it('final_seed は server_seed・race_id・entropy のすべてに依存する', () => {
    const seed = 'S';
    const e1 = clientEntropy(['H1', 'H2'], H);
    const e2 = clientEntropy(['H1', 'H3'], H);
    const base = deriveFinalSeed(seed, 'R1', e1, H);
    expect(deriveFinalSeed('S2', 'R1', e1, H)).not.toBe(base);
    expect(deriveFinalSeed(seed, 'R2', e1, H)).not.toBe(base);
    expect(deriveFinalSeed(seed, 'R1', e2, H)).not.toBe(base);
    // 同じ入力なら同じ（再現性）
    expect(deriveFinalSeed(seed, 'R1', e1, H)).toBe(base);
  });

  it('race_id が空・entropy が不正形式なら例外', () => {
    const e = clientEntropy(['H1'], H);
    expect(() => deriveFinalSeed('S', '', e, H)).toThrow(/race_id が空/);
    expect(() => deriveFinalSeed('S', 'R1', 'short', H)).toThrow(/16進小文字64桁/);
  });

  it('final_seed → RNG シードは 256bit 全体を使う（一部だけ効く実装を弾く）', () => {
    const a = 'a'.repeat(64);
    // 末尾8桁だけ違うシードでも RNG シードが変わること
    const b = `${'a'.repeat(56)}bbbbbbbb`;
    expect(finalSeedToRngSeed(a)).not.toBe(finalSeedToRngSeed(b));
    // 先頭8桁だけ違う場合も変わること
    const c = `bbbbbbbb${'a'.repeat(56)}`;
    expect(finalSeedToRngSeed(a)).not.toBe(finalSeedToRngSeed(c));
    // 決定的
    expect(finalSeedToRngSeed(a)).toBe(finalSeedToRngSeed(a));
    // 32bit 符号なし整数
    const s = finalSeedToRngSeed('0123456789abcdef'.repeat(4));
    expect(Number.isInteger(s)).toBe(true);
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(0xffffffff);
  });
});

describe('§8.8 介入込みの監査記録', () => {
  function validRecord(): RaceAuditRecord {
    const serverSeed = 'server-seed-xyz';
    const entrantIds = ['H1', 'H2', 'H3'];
    const entropy = clientEntropy(entrantIds, H);
    return {
      raceId: 'R-0001',
      seedCommit: commitServerSeed(serverSeed, H),
      seedReveal: serverSeed,
      clientEntropy: entropy,
      finalSeed: deriveFinalSeed(serverSeed, 'R-0001', entropy, H),
      entrantIds,
      interventions: [{ horseId: 'H2', phase: 'spurt', serverMs: 61000, clientMs: 60900 }],
    };
  }

  it('正しい記録は不合格理由ゼロ', () => {
    expect(auditFailures(validRecord(), H)).toEqual([]);
  });

  it('seed_reveal 未公開を検出する', () => {
    const r = { ...validRecord(), seedReveal: null };
    expect(auditFailures(r, H)).toEqual(['seed_reveal が未公開（レース後に公開されていない）']);
  });

  it('server_seed の事後差し替えを検出する（§8.6 の禁止事項）', () => {
    const r = { ...validRecord(), seedReveal: 'tampered-seed' };
    const failures = auditFailures(r, H);
    expect(failures.some((f) => f.includes('seed_commit と一致しない'))).toBe(true);
  });

  it('final_seed の差し替えを検出する', () => {
    const r = { ...validRecord(), finalSeed: 'f'.repeat(64) };
    const failures = auditFailures(r, H);
    expect(failures.some((f) => f.includes('final_seed'))).toBe(true);
  });

  it('出走馬の入れ替えを検出する（client_entropy の再計算が合わなくなる）', () => {
    const base = validRecord();
    const r = { ...base, entrantIds: ['H1', 'H2', 'H9'] };
    const failures = auditFailures(r, H);
    expect(failures.some((f) => f.includes('client_entropy'))).toBe(true);
  });

  it('出走していない馬の介入ログを検出する', () => {
    const base = validRecord();
    const r: RaceAuditRecord = {
      ...base,
      interventions: [{ horseId: 'H9', phase: 'start', serverMs: 100, clientMs: 90 }],
    };
    const failures = auditFailures(r, H);
    expect(failures.some((f) => f.includes('H9'))).toBe(true);
  });

  it('不合格理由は「真偽」でなく理由の配列で返る（何を見たか報告できる形・R-9）', () => {
    const r = { ...validRecord(), seedReveal: 'tampered', finalSeed: '0'.repeat(64) };
    const failures = auditFailures(r, H);
    expect(Array.isArray(failures)).toBe(true);
    expect(failures.length).toBeGreaterThanOrEqual(2);
  });
});

describe('乱数サブストリームの分離（K-2 の追加要求）', () => {
  it('用途IDが互いに異なる（同じ値だと系列が重なる）', () => {
    const values = Object.values(RNG_STREAM);
    expect(new Set(values).size).toBe(values.length);
  });
});
