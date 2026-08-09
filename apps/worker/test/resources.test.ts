/**
 * ★周ごとの資源記録。**測れなかったことを 0 と混同しない**のが要点です。
 */
import { describe, expect, it } from 'vitest';
import { APPLICATION_NAME, formatResources, sampleResources } from '../src/resources.js';

/** 最小限の偽クライアント */
const fake = (impl: () => Promise<{ rows: { n: number }[] }>) =>
  ({ query: impl } as unknown as Parameters<typeof sampleResources>[0]);

describe('★A-1 のリーク検出用の資源記録', () => {
  it('★自分の接続だけを数える（application_name で絞る）', async () => {
    let seen: unknown[] = [];
    await sampleResources(
      fake(async (...args: unknown[]) => {
        seen = args;
        return { rows: [{ n: 3 }] };
      }) ,
    );
    // ★他の接続（Web・検証スクリプト）を数えると、他人の増減を自分のリークと読む
    expect(String(seen[0])).toContain('application_name');
    expect(seen[1]).toEqual([APPLICATION_NAME]);
  });

  it('実メモリとヒープを分けて出す（リークが JS 側かネイティブ側か分かる）', async () => {
    const s = await sampleResources(fake(async () => ({ rows: [{ n: 1 }] })));
    expect(s.rssMb).toBeGreaterThan(0);
    expect(s.heapMb).toBeGreaterThan(0);
    expect(s.rssMb).toBeGreaterThanOrEqual(s.heapMb);
    expect(s.handles).toBeGreaterThan(0);
  });

  it('★接続数が取れなかったら -1（0本と区別できる）', async () => {
    const s = await sampleResources(
      fake(async () => {
        throw new Error('接続断');
      }),
    );
    expect(s.dbConnections).toBe(-1);
    expect(formatResources(s)).toContain('conn=?');
    // ★観測の失敗で周を落とさない。A-1 のための計測が A-1 を壊すのは本末転倒
    expect(s.rssMb).toBeGreaterThan(0);
  });

  it('ログ1行は短く保つ（毎周出るため）', async () => {
    const s = await sampleResources(fake(async () => ({ rows: [{ n: 1 }] })));
    expect(formatResources(s).length).toBeLessThan(60);
  });
});
