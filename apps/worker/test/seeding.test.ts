/**
 * §8.6 の配線。★「予測できない」と「同じサイクルからは同じ」の両立を測る。
 */
import { createHash, createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { seedCommitFor, serverSeedFor } from '../src/seeding.js';

const hash = {
  sha256: (m: string) => createHash('sha256').update(m, 'utf8').digest('hex'),
  hmacSha256: (k: string, m: string) => createHmac('sha256', k).update(m, 'utf8').digest('hex'),
};

describe('★§8.6 server_seed の導出', () => {
  it('★同じサイクルからは必ず同じ値（再起動しても commit と食い違わない）', () => {
    expect(serverSeedFor('S', 42, hash)).toBe(serverSeedFor('S', 42, hash));
    expect(seedCommitFor('S', 42, hash)).toBe(seedCommitFor('S', 42, hash));
  });

  it('★サイクルが違えば違う値', () => {
    expect(serverSeedFor('S', 42, hash)).not.toBe(serverSeedFor('S', 43, hash));
  });

  it('★秘密が違えば違う値（秘密を知らないと予測できない）', () => {
    expect(serverSeedFor('A', 42, hash)).not.toBe(serverSeedFor('B', 42, hash));
  });

  it('seed_commit は SHA-256 の16進64桁', () => {
    expect(seedCommitFor('S', 1, hash)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('★commit から server_seed を復元できない（一方向）', () => {
    const seed = serverSeedFor('S', 7, hash);
    const commit = seedCommitFor('S', 7, hash);
    expect(commit).not.toBe(seed);
    // commit は seed の SHA-256 なので、seed を知っていれば検証できる
    expect(hash.sha256(seed)).toBe(commit);
  });

  it('秘密が空なら例外（黙って弱い値を使わない）', () => {
    expect(() => serverSeedFor('', 1, hash)).toThrow(/secret/);
  });
});
