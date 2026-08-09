/**
 * ★周ごとの資源記録（A-1 のリーク検出）
 *
 * 【なぜ要るか】
 *   1回目の A-1 で、そちらは「**最長無停止区間と、その両端のメモリ／接続数**」を
 *   求めました。私は**記録していなかったので、後から取得できませんでした**。
 *   随時測った値（95 → 100 → 62 → 69 → 67MB）に増加傾向は見えませんでしたが、
 *   **求められた形の測定ではありません**でした。
 *
 *   ★リークは「あとで見よう」では測れません。**起きている最中にしか記録できない**ので、
 *     周ごとに残します。1周60秒なので、24時間で1,440行です。
 *
 * 【★接続数は「自分の接続」だけを数える】
 *   `pg_stat_activity` は**同じ DB への他の接続も見えます**（Web からの読み取り、
 *   検証スクリプト、私が手で繋いだセッション）。全部数えると、
 *   **他人の増減を自分のリークと読み違えます**（R-16 と同じ形）。
 *   → 接続に `application_name` を付け、**それで絞って数えます**。
 */

import type pg from 'pg';

/** ★ワーカーの接続に付ける名前。これで自分の接続だけを数える */
export const APPLICATION_NAME = 'star-worker';

export interface ResourceSample {
  /** 常駐セット（MB）。★プロセス全体の実メモリ */
  readonly rssMb: number;
  /** V8 ヒープ使用量（MB）。rss と分けると、リークが JS 側かネイティブ側かが分かる */
  readonly heapMb: number;
  /** ★自分の名前が付いた DB 接続の本数 */
  readonly dbConnections: number;
  /** イベントループに残っているハンドルの種類数（増え続けたら解放漏れ） */
  readonly handles: number;
}

/**
 * いまの資源使用量を測る。
 *
 * ★接続数の取得に失敗しても**例外にしません**。
 *   これは観測であって処理ではないので、観測の失敗で周を落とすと本末転倒です
 *   （A-1 の「止まらない」を、A-1 のための計測が壊すことになります）。
 *   取れなければ -1 を返し、**「測れなかった」と「0本だった」を区別できるようにします。**
 */
export async function sampleResources(client: pg.Client | pg.PoolClient): Promise<ResourceSample> {
  const mem = process.memoryUsage();
  let dbConnections = -1;
  try {
    const r = await client.query<{ n: number }>(
      `select count(*)::int as n from pg_stat_activity where application_name = $1`,
      [APPLICATION_NAME],
    );
    dbConnections = r.rows[0]?.n ?? -1;
  } catch {
    // ★握りつぶすが、値で分かるようにする（-1）
  }
  return {
    rssMb: Math.round(mem.rss / 1024 / 1024),
    heapMb: Math.round(mem.heapUsed / 1024 / 1024),
    dbConnections,
    handles: process.getActiveResourcesInfo().length,
  };
}

/** ログ1行ぶんの文字列。★毎周出るので短くする */
export function formatResources(s: ResourceSample): string {
  const conn = s.dbConnections < 0 ? '?' : String(s.dbConnections);
  return `mem=${s.rssMb}MB heap=${s.heapMb}MB conn=${conn} handles=${s.handles}`;
}
