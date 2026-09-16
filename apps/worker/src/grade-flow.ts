/**
 * ★**厩舎の格の値段を書く**（★(a) 第 5 便-5・2026-09-16・正典 **D-103 ④**・移行 `0027`）
 *
 * 【★なぜワーカーが書くか】（★`0025`・`0026` と同じ理由）
 *   ★値段は `@star/training` の `GRADE_UNLOCK_EP` が持ちます。★同じ数を SQL にも書くと、
 *   ★**画面と DB で値段が食い違う日**が来ます（★D-052・二重帳簿）。
 *   → ★**サーバー（ここ）が値段の行を書き**、★RPC（`unlock_stable_grade`）は**その行の値で**払わせます。
 *   ⚠️ ★利用者は値段を申告できません（★憲法 3・`0027` が `revoke insert` 済み）。
 *
 * 【★冪等】★値が同じなら書きません（★`updated_at` を無駄に動かさない）。
 * ⚠️ ★乱数も時刻も読みません（★憲法 4。★`updated_at` は DB の `now()`）。
 */

import type pg from 'pg';
import { GRADE_UNLOCK_EP } from '@star/training';

export interface GradePriceSyncResult {
  /** ★実際に書いた行の数（★値が同じなら 0） */
  readonly written: number;
}

/**
 * ★値段の表を `GRADE_UNLOCK_EP` に合わせる（★冪等）。
 *
 * ⚠️ ★**数をここに書きません。** ★`GRADE_UNLOCK_EP` から読みます
 *    （★この関数に数字が現れたら、それは二重帳簿です）。
 */
export async function syncStableGradePrices(
  client: pg.Client | pg.PoolClient,
): Promise<GradePriceSyncResult> {
  const grades = Object.keys(GRADE_UNLOCK_EP) as (keyof typeof GRADE_UNLOCK_EP)[];
  const res = await client.query<{ grade: string }>(
    `insert into stable_grade_price (grade, price_ep)
     select * from unnest($1::text[], $2::int[])
     on conflict (grade) do update
        set price_ep = excluded.price_ep, updated_at = now()
      where stable_grade_price.price_ep <> excluded.price_ep
     returning grade`,
    [grades, grades.map((g) => GRADE_UNLOCK_EP[g])],
  );
  return { written: res.rowCount ?? 0 };
}
