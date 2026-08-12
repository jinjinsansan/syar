/**
 * 開放率の分布を毎日記録する（レビュー側裁定 2026-08-12）
 *
 * 【なぜ要るか】
 *   > ★開放率は「**動き続ける入力**」です。今日 71.3% でも来月は違います。
 *   > つまり **P1 のゲート（V-4/V-5/V-6）は、動く入力の上に立っています**。
 *   > → 分布を継続的に記録し、**測定時からずれたらゲートを測り直す**運用に。
 *
 *   ★「一度通れば終わり」ではないゲートの最初の例です。
 *
 * 【★平均だけ残さない】
 *   Q-P3-39 の裁定は「平均の近さで判定しない」でした。
 *   **平均が同じでも上下に割れていれば別の世界**なので、四分位も残します。
 *   併せて週齢の平均も残します（開放率が動く理由の大半は「馬が何歳か」なので）。
 *
 * 【★冪等】
 *   同じ日を何度集計しても同じ行になります（`daily-flow.ts` と同じ性質）。
 */

import type pg from 'pg';

export interface UnlockSnapshot {
  readonly horses: number;
  readonly mean: number;
  readonly sd: number;
  readonly p10: number;
  readonly p50: number;
  readonly p90: number;
  readonly ageMean: number;
}

/**
 * その日の開放率の分布を測って `unlock_daily` に保存する。
 *
 * ★対象は**出走しうる馬**（引退していない・誕生週がある）。
 *   引退馬を混ぜると「引退が増えたから平均が動いた」が見えなくなります。
 */
export async function recordUnlockDistribution(
  client: pg.Client | pg.PoolClient,
  date: string,
): Promise<UnlockSnapshot | null> {
  const r = await client.query<{
    horses: string; mean: string | null; sd: string | null;
    p10: string | null; p50: string | null; p90: string | null; age_mean: string | null;
  }>(
    `select count(*)::text as horses,
            avg(u)::text as mean,
            stddev_samp(u)::text as sd,
            percentile_cont(0.1) within group (order by u)::text as p10,
            percentile_cont(0.5) within group (order by u)::text as p50,
            percentile_cont(0.9) within group (order by u)::text as p90,
            avg(age)::text as age_mean
       from (
         select (select sum((value)::numeric) from jsonb_each_text(stats))
              / nullif((select sum((value)::numeric) from jsonb_each_text(potential)), 0) as u,
              (last_processed_week - birth_week)::numeric as age
           from horses
          where retired_at_week is null and birth_week is not null
       ) t
      where u is not null`,
  );
  const row = r.rows[0];
  const horses = Number(row?.horses ?? 0);
  // ★対象が0頭なら**書きません**。0 を書くと「開放率が 0 になった」と読めます
  if (row === undefined || horses === 0 || row.mean === null) return null;

  const snap: UnlockSnapshot = {
    horses,
    mean: Number(row.mean),
    // ★1頭だと stddev_samp が null。0 で埋めず、そのまま 0 として扱うと嘘になるので
    //   1頭の日は sd を 0 とし、頭数を併記して読む側が判断できるようにする
    sd: row.sd === null ? 0 : Number(row.sd),
    p10: Number(row.p10),
    p50: Number(row.p50),
    p90: Number(row.p90),
    ageMean: Number(row.age_mean),
  };

  await client.query(
    `insert into unlock_daily (date, horses, mean, sd, p10, p50, p90, age_mean)
     values ($1,$2,$3,$4,$5,$6,$7,$8)
     on conflict (date) do update set
       horses = excluded.horses, mean = excluded.mean, sd = excluded.sd,
       p10 = excluded.p10, p50 = excluded.p50, p90 = excluded.p90,
       age_mean = excluded.age_mean`,
    [date, snap.horses, snap.mean, snap.sd, snap.p10, snap.p50, snap.p90, snap.ageMean],
  );
  return snap;
}
