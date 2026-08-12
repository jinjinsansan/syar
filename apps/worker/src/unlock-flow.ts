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

/**
 * ★P1 のゲート（V-4/V-5/V-6）を測ったときの開放率の分布（D-053 の「較正条件」）。
 *
 * ⚠️ **この値を、実測に合わせて動かさないこと。**
 *    ここは「ゲートがどの世界で通ったか」の記録です。動かすと**警告が黙るだけ**で、
 *    ゲートが古い世界の証拠のまま生き続けます（R-23 と同じ構図）。
 *    分布が動いたなら、**測り直してからこの値を更新**します。
 *
 * 出典: `docs/MEASURE_P1GATES_REALPOOL_BOTH.txt` / `REPORT_P3_REALPOOL_20260812.md`
 */
export const UNLOCK_BASELINE = {
  mean: 0.713,
  sd: 0.126,
  p10: 0.553,
  p50: 0.738,
  p90: 0.861,
} as const;

/**
 * ★ずれの許容幅。
 *
 * 【平均 3pt — 導出（Q-P3-44 の裁定）】
 *   3点測定の①→②が、そのまま「開放率 → V-4」の感度です:
 *
 *     ① 開放率 平均 70.0% → V-4 31.29%
 *     ② 開放率 平均 73.8% → V-4 29.20%
 *     ⇒ 感度 ≒ **0.55pt(V-4) / 1pt(開放率の平均)**
 *
 *   本番の基準値 V-4 32.32%・帯 30〜34% に当てると:
 *     上限まで 1.68pt ÷ 0.55 = **開放率の平均が +3.1pt で帯を出る**
 *     下限まで 2.32pt ÷ 0.55 = **                −4.2pt**
 *
 *   → **厳しいほうの +3.1pt を両側に採り、3pt** とします（安全側）。
 *   ★当初 5pt と書いていましたが、**上側 3.1pt で帯を出るので緩すぎました**。
 *     ⚠️ **緩い許容幅は、鳴るべきときに鳴りません。**
 *
 *   ★2点からの外挿なので**線形性は保証されません**。ただし
 *     「5pt は緩すぎる」ことはこの2点だけで言えます。
 *
 * 【四分位 8pt — ★暫定（根拠なし）】
 *   ★**四分位に対する V-4 の感度は測っていません。** この 8pt に導出根拠はありません。
 *     「明らかに分布の形が変わったら気づく」ための暫定値です。
 *     → 掃引は P4 に降ろす裁定（Q-P3-44）。掃引で感度が出たら置き換えること。
 */
export const UNLOCK_DRIFT_TOLERANCE = { mean: 0.03, quantile: 0.08 } as const;

export interface UnlockDrift {
  readonly key: string;
  readonly baseline: number;
  readonly now: number;
  readonly diff: number;
}

/**
 * 記録した分布が、ゲートを測ったときの分布からずれていないかを見る。
 *
 * ★**平均だけを見ません。** 平均が同じでも上下に割れていれば別の世界です
 *   （Q-P3-39 の裁定そのもの）。四分位も同時に見ます。
 */
export function unlockDrift(snap: UnlockSnapshot): UnlockDrift[] {
  const out: UnlockDrift[] = [];
  const check = (key: keyof typeof UNLOCK_BASELINE, now: number, tol: number): void => {
    const baseline = UNLOCK_BASELINE[key];
    const diff = now - baseline;
    if (Math.abs(diff) > tol) out.push({ key, baseline, now, diff });
  };
  check('mean', snap.mean, UNLOCK_DRIFT_TOLERANCE.mean);
  check('p10', snap.p10, UNLOCK_DRIFT_TOLERANCE.quantile);
  check('p50', snap.p50, UNLOCK_DRIFT_TOLERANCE.quantile);
  check('p90', snap.p90, UNLOCK_DRIFT_TOLERANCE.quantile);
  return out;
}
