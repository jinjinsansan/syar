/**
 * ★**生涯の記録の行数を毎日残す**（★正典 §18 **LR-10**・移行 `0029`・2026-09-16）
 *
 * 【★この層の仕事】
 *   ★数えて `story_daily` に 1 行書くだけです。★**判定しません**。
 *
 * 【★閾値を置かない】（★裁定 `REVIEW_STORY_GROWTH_VERDICT_20260916.md`）
 *   ★1 年 43 万行・0.06 GiB なら ★**容量は論点ではありません**。
 *   ★見るのは「★**急に増えた／急に止まった**」という変化です。
 *   ⚠️ ★閾値を置くと「★**通るだけの検査**」になります（R-16）。★線を引かず、★**前日との差を出す**だけにします。
 *
 * 【★「止まった」を捕まえるのが目的】
 *   ⚠️ ★2026-09-16 に ★**15 種のうち 2 種しか書かれていない**ことが、★測って初めて分かりました。
 *      ★`tools/settle-races.mjs` が `epochMs` を渡さず、★**確定しても物語が 1 行も書かれない**期間もありました
 *      （★§18 LR-9 の実例）。★どちらも「増えすぎ」ではなく ★**「増えていない」**側の壊れ方です。
 *   → ★だから ★**差が 0 のときこそ目に付く形で出します**。
 *
 * 【★冪等】★同じ日を何度集計しても同じ行になります（`on conflict do update`・`daily-flow.ts` と同じ性質）。
 * ⚠️ ★乱数も時刻も読みません（★日付は呼ぶ側が渡します・憲法 4）。
 */

import type pg from 'pg';

export interface StoryDaySnapshot {
  /** ★その時点の総行数 */
  readonly rows: number;
  /** ★出来事を持つ馬の数 */
  readonly horses: number;
  /** ★種類ごとの行数（★0 の種類は**入っていません** — 呼ぶ側が既知の一覧と突き合わせます） */
  readonly byType: Readonly<Record<string, number>>;
  /**
   * ★**前日からの増分**（★前日の行が無ければ `null`）。
   * ⚠️ ★`0` は「★**1 行も増えなかった**」という意味を持ちます（★`null` と混ぜないこと）。
   */
  readonly deltaRows: number | null;
}

/**
 * ★その日の行数を数えて `story_daily` に残す。
 *
 * ★`date` … サーバーの日付（★`current_date::text`。★ワーカーの時計は使わない）
 */
export async function recordStoryRows(
  client: pg.Client | pg.PoolClient,
  date: string,
): Promise<StoryDaySnapshot> {
  const totals = (await client.query<{ rows: string; horses: string }>(
    `select count(*)::text as rows, count(distinct horse_id)::text as horses from horse_story_event`,
  )).rows[0]!;

  const byTypeRows = (await client.query<{ event_type: string; n: string }>(
    `select event_type, count(*)::text as n from horse_story_event group by event_type`,
  )).rows;
  const byType: Record<string, number> = {};
  for (const r of byTypeRows) byType[r.event_type] = Number(r.n);

  /**
   * ★**前日の行**（★増分を出すため）。
   * ⚠️ ★「昨日」ではなく ★**その日より前の最も新しい行**を見ます
   *    — ★ワーカーが 1 日止まっていても、★増分が読めるようにするためです。
   */
  const prev = (await client.query<{ rows: string }>(
    `select rows::text from story_daily where date < $1::date order by date desc limit 1`,
    [date],
  )).rows[0];

  const rows = Number(totals.rows);
  const snap: StoryDaySnapshot = {
    rows,
    horses: Number(totals.horses),
    byType,
    deltaRows: prev === undefined ? null : rows - Number(prev.rows),
  };

  await client.query(
    `insert into story_daily (date, rows, horses, by_type)
     values ($1, $2, $3, $4::jsonb)
     on conflict (date) do update set
       rows = excluded.rows, horses = excluded.horses, by_type = excluded.by_type`,
    [date, snap.rows, snap.horses, JSON.stringify(snap.byType)],
  );

  return snap;
}

/**
 * ★**ログに出す 1 行**（★判定はしません。★読む人が変化に気づける形にするだけ）。
 *
 * ⚠️ ★**増分が 0 のときは、それが分かる語を出します**（★`+0` を黙って流さない）。
 * ⚠️ ★**書かれていない種類の数**も出します（★`known` に渡された一覧のうち、行が 1 つも無いもの）。
 */
export function formatStoryDay(snap: StoryDaySnapshot, known: readonly string[]): string {
  const silent = known.filter((t) => (snap.byType[t] ?? 0) === 0);
  const delta = snap.deltaRows === null
    ? '前日の記録なし'
    : snap.deltaRows === 0
      ? '★前日から増えていません'
      : `前日比 +${snap.deltaRows}`;
  return `物語 ${snap.rows} 行 / ${snap.horses} 頭（${delta}）`
    + `${silent.length > 0 ? ` ★行が 1 つも無い種類 ${silent.length}/${known.length}: ${silent.join(',')}` : ''}`;
}
