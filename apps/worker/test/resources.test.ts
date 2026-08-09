/**
 * ★周ごとの資源記録。**測れなかったことを 0 と混同しない**のが要点です。
 *
 *   最初は `pg_stat_activity` を application_name で絞って接続数を数えていました。
 *   ★プーラが名前を上書きするので `conn=0` が出続けました —
 *     取得失敗ではなく、**正しく実行されて別物を測っていた**状態です。
 *     取得失敗（-1）は検出できていたのに、**成功して誤答する形**は防げていませんでした。
 *   → プロセス側で実際に漏れるもの（FD・ソケット）を数える形に変えました。
 */
import { describe, expect, it } from 'vitest';
import { formatResources, sampleResources } from '../src/resources.js';

describe('★A-1 のリーク検出用の資源記録', () => {
  it('実メモリとヒープを分けて出す（リークが JS 側かネイティブ側か分かる）', () => {
    const s = sampleResources();
    expect(s.rssMb).toBeGreaterThan(0);
    expect(s.heapMb).toBeGreaterThan(0);
    expect(s.rssMb).toBeGreaterThanOrEqual(s.heapMb);
    expect(s.handles).toBeGreaterThan(0);
  });

  it('★測れない環境では -1 を出す（0 と区別できる）', () => {
    const s = sampleResources();
    // Linux では実数、Windows では -1。★どちらでも「0本」にはならない
    expect(s.fds === -1 || s.fds > 0).toBe(true);
    expect(s.sockets === -1 || s.sockets >= 0).toBe(true);
    if (s.fds < 0) expect(formatResources(s)).toContain('fd=?');
  });

  it('★ソケット数は FD 数を超えない（数え方が壊れていたら出る）', () => {
    const s = sampleResources();
    if (s.fds >= 0 && s.sockets >= 0) expect(s.sockets).toBeLessThanOrEqual(s.fds);
  });

  it('ログ1行は短く保つ（毎周出るため）', () => {
    expect(formatResources(sampleResources()).length).toBeLessThan(70);
  });

  it('測定で例外を投げない（A-1 のための計測が A-1 を壊さない）', () => {
    expect(() => sampleResources()).not.toThrow();
  });
});
