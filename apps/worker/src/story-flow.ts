/**
 * ★**生涯の記録を書く**（★ゲーム本体 (a) 第 5 便-4・2026-09-16・正典 **§18**・移行 `0024`）
 *
 * 【★この層の仕事】
 *   ★確定したレースから ★**出来事の種類と値**を残します。★文は保存しません
 *   （★文は `@star/training` の `storyLineOf` が組み立てる・`0024` の註記）。
 *
 * 【★§18 の約束をどう守るか】
 *   LR-4 ★**文章は定型**（★ここは種類と値だけ書く）／LR-5 ★**着順にも経済にも効かない**
 *   LR-6 ★**持ち主の個人情報を書かない**（★書くのは馬・レース・騎手名・週だけ）
 *   LR-7 ★**レースが終わった後に書く**（★D-098 の家族。★確定の中の、着順が確定した後で呼ぶ）
 *
 * 【★冪等】★同じレースを二度確定しても行は増えません（★`horse_story_event` の
 *   `(horse_id, event_type, race_id)` で既存を見てから足します）。
 * ⚠️ ★**乱数も時刻も読みません**（★憲法 4）。★週は呼ぶ側が渡します。
 */

import type pg from 'pg';
import { JOCKEY_BOND_MAX } from '@star/scheduler';
import { raceStoryEvents, type RaceGrade, type StoryEvent } from '@star/training';

/** ★確定した 1 頭ぶん（★呼ぶ側が凍結と着順から作る） */
export interface SettledRunner {
  readonly horseId: string;
  readonly finishPosition: number;
  /** ★出走登録で凍結した騎手の名前（★名簿を引き直さない・D-105 ④） */
  readonly jockeyName?: string | undefined;
  /** ★凍結した騎手の id（★同じ騎手での騎乗回数を数えるため） */
  readonly jockeyId?: string | undefined;
}

export interface StoryWriteInput {
  readonly raceId: string;
  readonly raceName: string;
  readonly grade: RaceGrade | null;
  /** ★ゲーム内の週（★実時刻ではない・憲法 4） */
  readonly week: number;
  readonly runners: readonly SettledRunner[];
}

/** ★その馬の、このレースより**前**の戦績（★DB から数える） */
interface PriorRecord {
  runs: number;
  wins: number;
  ridesWithJockey: number;
}

/**
 * ★このレースより前の戦績を数える（★同じレースは含めない）。
 *
 * ⚠️ ★**`finish_pos is not null` の行だけ**を数えます（★まだ走っていない登録を戦績にしない）。
 * ⚠️ ★同じ騎手の回数は ★**凍結（`jockey_frozen`）の id** で数えます（★名簿を引き直さない）。
 */
async function priorRecords(
  client: pg.Client | pg.PoolClient,
  raceId: string,
  runners: readonly SettledRunner[],
): Promise<Map<string, PriorRecord>> {
  const out = new Map<string, PriorRecord>();
  for (const r of runners) out.set(r.horseId, { runs: 0, wins: 0, ridesWithJockey: 0 });
  if (runners.length === 0) return out;

  const rows = await client.query<{ horse_id: string; runs: string; wins: string; rides: string }>(
    `select e.horse_id,
            count(*)::text as runs,
            count(*) filter (where e.finish_pos = 1)::text as wins,
            count(*) filter (where e.jockey_frozen ->> 'jockeyId' = j.jockey_id)::text as rides
       from race_entries e
       join unnest($1::uuid[], $2::text[]) as j(horse_id, jockey_id)
         on j.horse_id = e.horse_id
      where e.finish_pos is not null
        and e.race_id <> $3
      group by e.horse_id`,
    [
      runners.map((r) => r.horseId),
      runners.map((r) => r.jockeyId ?? ''),
      raceId,
    ],
  );
  for (const row of rows.rows) {
    out.set(row.horse_id, {
      runs: Number(row.runs),
      wins: Number(row.wins),
      ridesWithJockey: Number(row.rides),
    });
  }
  return out;
}

export interface StoryWriteResult {
  /** ★書いた行の数（★既にあったぶんは数えない） */
  readonly written: number;
  /** ★出来事を残した頭数 */
  readonly horses: number;
}

/**
 * ★確定したレースの出来事を残す。
 *
 * ⚠️ ★**確定と同じトランザクションの中から呼びます**（★着順を書いた後）。
 *    ★別のトランザクションにすると「着順はあるのに物語が無い」状態が残ります。
 * ⚠️ ★**ここで例外を投げると確定が巻き戻ります。** ★記録は着順より軽い責務なので、
 *    ★呼ぶ側は ★**確定を止めない**形で呼ぶこと（★`pg-store.ts` の註記）。
 */
export async function writeRaceStory(
  client: pg.Client | pg.PoolClient,
  input: StoryWriteInput,
): Promise<StoryWriteResult> {
  const prior = await priorRecords(client, input.raceId, input.runners);
  const rows: { horseId: string; event: StoryEvent }[] = [];
  for (const r of input.runners) {
    const p = prior.get(r.horseId) ?? { runs: 0, wins: 0, ridesWithJockey: 0 };
    const events = raceStoryEvents({
      finishPosition: r.finishPosition,
      grade: input.grade,
      runsBefore: p.runs,
      winsBefore: p.wins,
      ridesWithJockeyBefore: p.ridesWithJockey,
      /** ★親密度の上限は名簿の側の値（★ここで別の数を持たない・二重帳簿にしない） */
      bondMaxRides: JOCKEY_BOND_MAX,
      week: input.week,
      raceName: input.raceName,
      ...(r.jockeyName === undefined ? {} : { jockeyName: r.jockeyName }),
    });
    for (const event of events) rows.push({ horseId: r.horseId, event });
  }
  if (rows.length === 0) return { written: 0, horses: 0 };

  /**
   * ★**冪等**: 同じ馬・同じ種類・同じレースの行が既にあれば足しません。
   * ⚠️ ★`0024` に一意制約は無いので、★ここで `not exists` を見ます
   *    （★制約を足す移行は別の便。★足すときは既存の重複を先に掃除することになります）。
   */
  const res = await client.query<{ n: string }>(
    `with incoming as (
       select * from unnest($1::uuid[], $2::text[], $3::bigint[], $4::jsonb[])
              as t(horse_id, event_type, game_week, detail)
     ), inserted as (
       insert into horse_story_event (horse_id, event_type, game_week, race_id, detail)
       select i.horse_id, i.event_type, i.game_week, $5::uuid, i.detail
         from incoming i
        where not exists (
          select 1 from horse_story_event e
           where e.horse_id = i.horse_id and e.event_type = i.event_type and e.race_id = $5::uuid
        )
       returning 1
     )
     select count(*)::text as n from inserted`,
    [
      rows.map((r) => r.horseId),
      rows.map((r) => r.event.type),
      rows.map((r) => r.event.week),
      rows.map((r) => JSON.stringify({
        ...(r.event.finishPosition === undefined ? {} : { finishPosition: r.event.finishPosition }),
        ...(r.event.raceName === undefined ? {} : { raceName: r.event.raceName }),
        ...(r.event.jockeyName === undefined ? {} : { jockeyName: r.event.jockeyName }),
      })),
      input.raceId,
    ],
  );
  return { written: Number(res.rows[0]!.n), horses: new Set(rows.map((r) => r.horseId)).size };
}
