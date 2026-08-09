/**
 * ★周ごとの資源記録（A-1 のリーク検出）
 *
 * 【なぜ要るか】
 *   1回目の A-1 で、そちらは「**最長無停止区間と、その両端のメモリ／接続数**」を
 *   求めました。私は**記録していなかったので、後から取得できませんでした**。
 *   ★リークは「あとで見よう」では測れません。**起きている最中にしか記録できない**ので、
 *     周ごとに残します。1周60秒なので、24時間で1,440行です。
 *
 * 【★DB の接続数は、この構成では測れません（実測して分かりました）】
 *   最初 `pg_stat_activity` を `application_name='star-worker'` で絞って数えました。
 *   **`conn=0` が出続けました。** 接続が0本のはずはないので調べたところ:
 *
 *     select current_setting('application_name')  →  "Supavisor"
 *
 *   ★**Supabase のプーラが application_name を上書き**しており、こちらで付けた名前は
 *     Postgres に届いていませんでした。しかも `pg_stat_activity` に見えるのは
 *     **プーラ側の接続**で、ワーカーの接続と1対1になりません。
 *
 *   ★これは「測れなかった」ではなく**「正しく実行されて別物を測っていた」**状態です。
 *     取得失敗（-1）は検出できる作りにしていましたが、**成功して誤答する形**は
 *     防げていませんでした。**「対照が通る」は「正しい理由で通った」ではありません。**
 *
 *   → 数えるのをやめ、**プロセス側で実際に漏れるもの**を数えます:
 *       開いているファイル記述子（Linux の /proc/self/fd）と、そのうちのソケット数。
 *     接続が漏れればソケットが増えるので、**同じ現象をこちら側から見ています**。
 */

import { readdirSync, readlinkSync } from 'node:fs';

/**
 * 接続に付ける名前。★プーラに上書きされるので**数えるのには使えません**。
 * それでもプーラを外した構成に移ったときのために残します（害はありません）。
 */
export const APPLICATION_NAME = 'star-worker';

export interface ResourceSample {
  /** 常駐セット（MB）。★プロセス全体の実メモリ */
  readonly rssMb: number;
  /** V8 ヒープ使用量（MB）。rss と分けると、リークが JS 側かネイティブ側かが分かる */
  readonly heapMb: number;
  /** 開いているファイル記述子の数。★取れなければ -1（0 と区別する） */
  readonly fds: number;
  /** うちソケットの数。★DB 接続が漏れればここが増える。取れなければ -1 */
  readonly sockets: number;
  /** イベントループに残っているハンドルの数（増え続けたら解放漏れ） */
  readonly handles: number;
}

/**
 * 開いている記述子とソケットを数える（Linux）。
 * ★Linux 以外や読めない環境では **-1** を返します。**0 と混同させません。**
 */
function countFds(): { fds: number; sockets: number } {
  try {
    const dir = '/proc/self/fd';
    const names = readdirSync(dir);
    let sockets = 0;
    for (const n of names) {
      try {
        if (readlinkSync(`${dir}/${n}`).startsWith('socket:')) sockets += 1;
      } catch {
        // 読んでいる間に閉じた記述子。数えないだけでよい
      }
    }
    return { fds: names.length, sockets };
  } catch {
    return { fds: -1, sockets: -1 };
  }
}

/**
 * いまの資源使用量を測る。
 *
 * ★測定は**処理ではありません**。ここで例外を投げると、
 *   A-1 のための計測が A-1（止まらないこと）を壊します。
 *   測れないものは -1 にして、**「測れなかった」と「0だった」を区別**します。
 */
export function sampleResources(): ResourceSample {
  const mem = process.memoryUsage();
  const { fds, sockets } = countFds();
  return {
    rssMb: Math.round(mem.rss / 1024 / 1024),
    heapMb: Math.round(mem.heapUsed / 1024 / 1024),
    fds,
    sockets,
    handles: process.getActiveResourcesInfo().length,
  };
}

/** ログ1行ぶんの文字列。★毎周出るので短くする */
export function formatResources(s: ResourceSample): string {
  const v = (n: number): string => (n < 0 ? '?' : String(n));
  return `mem=${s.rssMb}MB heap=${s.heapMb}MB fd=${v(s.fds)} sock=${v(s.sockets)} handles=${s.handles}`;
}
