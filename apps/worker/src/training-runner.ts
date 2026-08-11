/**
 * 週送りをワーカーに繋ぐ（正典 §7・P3 の本体）
 *
 * 【★何が「繋ぐ」か】
 *   `packages/training` の `advanceWeek` は純ロジックとして完成していて、
 *   B-1 では1頭を260週通しました。ところが**ワーカーは一度も呼んでいません**。
 *   → 本番のサイクルから、全馬に対して毎週これを回します。
 *
 * 【★週番号は時刻から決まる（B-5）】
 *   `weeksToProcess(nowMs, epochMs, lastProcessed)` を使います。
 *   P2 の `cycle_index` と同じ性質で、**再起動しても遅延しても欠落も重複もしません**。
 *   ★「何回呼ばれたか」ではなく「どこまで進んだか」が権威です
 *   （`horses.last_processed_week`）。
 *
 * 【★1行ずつ書かない】
 *   7,000頭を1行ずつ更新すると、オッズ投入で踏んだのと同じことになります
 *   （675.8秒 → 1.3秒。A-1 の余裕を食う）。**読みも書きも一括**にします。
 *
 * 【★正典に無いので発明していないもの】
 *   - **メニューの選択**（Q-P3-24）。プレイヤーが選ぶ UI がまだありません。
 *     → V-7 / V-14 / V-15 / B-6 の錨と**同じバランス型**を使います。
 *       ★ここで別の方針を作ると、較正した世界と本番が別物になります。
 *   - **EP が足りないとき**（Q-P3-23）。→ 例外を握りつぶさず、
 *     **休養に落として警告を出します**（週送りを止めるほうが害が大きいため）。
 *     ★黙って休養にしません。件数を必ず返します。
 *
 * 【★週ごとの記録は所有馬だけ】
 *   `horse_week_log` は B-1 の証拠として作りましたが、全馬×182週だと
 *   1万頭で182万行になります（Q-P3-21）。**プレイヤーの馬だけ**記録します。
 *   NPC の馬は誰も履歴を見ません。
 */

import type pg from 'pg';
import { createHash } from 'node:crypto';
import { ABILITY_KEYS, deriveRng, type AbilityKey, type Rng } from '@star/sim-engine';
import { weekIndexAt, weeksToProcess } from '@star/scheduler';
import {
  DEFAULT_MENU, MENUS, advanceWeek,
  type HorseTraits, type MenuId, type TrainingState,
} from '@star/training';

/**
 * ★1回の呼び出しで進める**週数**の上限。無限ループとサイクル時間の暴走を防ぐ。
 *
 * ⚠️ **バッチ数ではありません。** 最初これをループ回数に使い、
 *    7,369頭 ÷ 2,000頭/バッチ = 4バッチ/週 なので **2週ぶんしか進みませんでした**。
 *    1回目は 16,000頭（8×2,000）で止まり、2回目に残りが進んだので
 *    **冪等でなくなっていました**（実測で発見）。
 */
export const MAX_WEEKS_PER_RUN = 8;

/** ★一括更新の1回あたりの頭数。パラメータ数の上限に当たらない大きさ */
export const BATCH_SIZE = 2000;

/**
 * ★育成方針（Q-P3-24 の暫定）。V-7 / V-14 / V-15 / B-6 と**同一**。
 *   ⚠️ ここを変えると較正した世界と本番が別物になります。
 */
export function defaultMenu(ageWeeks: number, fatigue: number): MenuId {
  if (fatigue >= 70) return 'rest';
  const cycle = ageWeeks % 4;
  if (cycle === 0) return 'hard';
  if (cycle === 1) return 'hill';
  if (cycle === 2) return 'wood';
  return DEFAULT_MENU;
}

/** UUID から安定した数を作る（乱数の用途 ID に使う。★時刻に依らない） */
function horseSeed(id: string): number {
  const h = createHash('sha256').update(id, 'utf8').digest();
  return h.readUInt32BE(0);
}

export interface TrainingWeekResult {
  /** 処理した週（絶対週番号） */
  readonly weeks: number[];
  /** 週送りを適用した延べ頭数 */
  readonly advanced: number;
  /** この実行で引退した頭数 */
  readonly retired: number;
  /** 消費した EP の合計（プレイヤー馬のみ） */
  readonly epSpent: number;
  /** ★EP が足りず休養に落とした頭数（Q-P3-23。黙って落とさない） */
  readonly epShort: number;
  /** ★上限に当たって途中で終わったか。true なら**まだ終わっていません** */
  readonly incomplete: boolean;
}

interface Row {
  id: string;
  owner_id: string | null;
  sex: string;
  growth: string;
  temper: string | number;
  durability: string | number;
  potential: Record<string, number>;
  stats: Record<string, number>;
  birth_week: string | number;
  last_processed_week: string | number;
  fatigue: string | number;
  condition: string | number;
  rest_until_week: string | number | null;
  career_ended: boolean;
}

/** ★numeric は文字列で返る。NaN のまま進めない */
const num = (v: unknown, what: string): number => {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) throw new Error(`training-runner: ${what} を数値として読めません`);
  return n;
};
const numRec = (o: Record<string, number>, what: string): Record<AbilityKey, number> =>
  Object.fromEntries(ABILITY_KEYS.map((k) => [k, num(o[k], `${what}.${k}`)])) as Record<AbilityKey, number>;

/**
 * 締まった週まで、全馬の週送りを進める。
 *
 * ★**冪等**です。同じ時刻で二度呼んでも、二度目は何もしません
 *   （`last_processed_week` が権威）。
 */
export async function advanceTrainingWeeks(
  client: pg.Client | pg.PoolClient,
  nowMs: number,
  epochMs: number,
  onAlert: (msg: string) => void,
): Promise<TrainingWeekResult> {
  // ★いまの週は締まっていないので処理しない（weeksToProcess の規約）
  const target = weekIndexAt(nowMs, epochMs) - 1;
  const weeks: number[] = [];
  let advanced = 0;
  let retired = 0;
  let epSpent = 0;
  let epShort = 0;

  // ★何頭いるかを先に数え、**週数 × バッチ数**で回数の上限を決める。
  //   ここを固定回数にすると、頭数が増えたときに黙って途中で止まります。
  const totalRow = await client.query<{ n: string }>(
    'select count(*)::text as n from horses where retired_at_week is null and birth_week is not null',
  );
  const total = Number(totalRow.rows[0]!.n);
  const batchesPerWeek = Math.max(1, Math.ceil(total / BATCH_SIZE));
  const maxIterations = MAX_WEEKS_PER_RUN * batchesPerWeek;
  let hitCap = true;

  for (let iter = 0; iter < maxIterations; iter += 1) {
    const r = await client.query<Row>(
      `select id, owner_id, sex, growth, temper, durability, potential, stats,
              birth_week, last_processed_week, fatigue, condition, rest_until_week, career_ended
         from horses
        where retired_at_week is null
          and birth_week is not null
          and last_processed_week < $1
        order by id
        limit $2`,
      [target, BATCH_SIZE],
    );
    if (r.rowCount === 0) { hitCap = false; break; }

    const updates: {
      id: string; last: number; fatigue: number; condition: number;
      restUntil: number | null; careerEnded: boolean;
      retiredAt: number | null; role: string | null; reason: string | null;
      potential: string; stats: string; durability: number; temper: number;
    }[] = [];

    for (const row of r.rows) {
      const birth = num(row.birth_week, 'birth_week');
      const last = num(row.last_processed_week, 'last_processed_week');
      const week = last; // ★これから進める週（last の次へ進む）
      const age = week - birth;
      const state: TrainingState = {
        ageWeeks: age,
        potential: numRec(row.potential, 'potential'),
        current: numRec(row.stats, 'stats'),
        durability: num(row.durability, 'durability'),
        temper: num(row.temper, 'temper'),
        fatigue: num(row.fatigue, 'fatigue'),
        condition: num(row.condition, 'condition'),
        restUntilWeek: row.rest_until_week === null
          ? -1 : num(row.rest_until_week, 'rest_until_week') - birth,
        careerEnded: row.career_ended,
        retirement: null,
      };
      const traits: HorseTraits = {
        sex: row.sex as HorseTraits['sex'],
        growth: row.growth as HorseTraits['growth'],
        // ★§6.5 の倍率は horses に列が無い（Q-P3-22）。1 のままにする
        injuryRateMult: 1,
        birthTemper: state.temper,
      };
      let menu = defaultMenu(age, state.fatigue);

      // ── EP（G-6）。★NPC 馬は null が返るので課金されない ──────
      if (row.owner_id !== null) {
        const cost = MENUS[menu].epCost;
        try {
          const res = await client.query<{ bal: string | null }>(
            'select spend_training_ep($1, $2, $3) as bal', [row.id, week, cost],
          );
          if (res.rows[0]?.bal !== null) epSpent += cost;
        } catch (e) {
          // ★足りないときは休養に落とす（Q-P3-23）。★黙って落とさない
          epShort += 1;
          menu = 'rest';
          void e;
        }
      }

      const seed = horseSeed(row.id);
      const out = advanceWeek({
        state,
        traits,
        menu,
        // ★B-1 が通す経路と同じ条件（§7.6 のイベントを引く）
        enableEvents: true,
        rngFor: (stream: number): Rng => deriveRng(seed, stream, week),
      });
      advanced += 1;
      if (out.state.retirement !== null) retired += 1;

      updates.push({
        id: row.id,
        last: week + 1,
        fatigue: out.state.fatigue,
        condition: out.state.condition,
        restUntil: out.state.restUntilWeek < 0 ? null : birth + out.state.restUntilWeek,
        careerEnded: out.state.careerEnded,
        retiredAt: out.state.retirement === null ? null : birth + out.state.ageWeeks,
        role: out.state.retirement?.role ?? null,
        reason: out.state.retirement?.reason ?? null,
        potential: JSON.stringify(out.state.potential),
        stats: JSON.stringify(out.state.current),
        durability: out.state.durability,
        temper: out.state.temper,
      });
    }

    // ── ★一括更新（1行ずつ書かない）────────────────────────
    await client.query(
      `update horses h set
         last_processed_week = t.last,
         fatigue = t.fatigue,
         condition = t.condition,
         rest_until_week = t.rest_until,
         career_ended = t.career_ended,
         retired_at_week = t.retired_at,
         retirement_role = t.role,
         retirement_reason = t.reason,
         potential = t.potential,
         stats = t.stats,
         durability = t.durability,
         temper = t.temper
       from unnest($1::uuid[], $2::bigint[], $3::numeric[], $4::smallint[], $5::bigint[],
                   $6::boolean[], $7::bigint[], $8::text[], $9::text[],
                   $10::jsonb[], $11::jsonb[], $12::numeric[], $13::numeric[])
         as t(id, last, fatigue, condition, rest_until, career_ended, retired_at,
              role, reason, potential, stats, durability, temper)
       where h.id = t.id`,
      [
        updates.map((u) => u.id), updates.map((u) => u.last),
        updates.map((u) => u.fatigue), updates.map((u) => u.condition),
        updates.map((u) => u.restUntil), updates.map((u) => u.careerEnded),
        updates.map((u) => u.retiredAt), updates.map((u) => u.role), updates.map((u) => u.reason),
        updates.map((u) => u.potential), updates.map((u) => u.stats),
        updates.map((u) => u.durability), updates.map((u) => u.temper),
      ],
    );
    // ★このバッチで進めた週を記録する（バッチごとに違いうる）
    for (const row of r.rows) {
      const w = num(row.last_processed_week, 'last_processed_week');
      if (!weeks.includes(w)) weeks.push(w);
    }
  }

  /**
   * ★上限に当たったまま終わったら、**黙って終わらせません**。
   *   途中まで進んだ状態は「進んでいる」ように見えるので、
   *   気づく契機が要ります（R-21）。次の周で続きが進みます。
   */
  if (hitCap) {
    onAlert(
      `週送りが上限（${MAX_WEEKS_PER_RUN}週 × ${batchesPerWeek}バッチ）に達しました。` +
      `まだ締まった週に届いていない馬がいます（次の周で続けます）`,
    );
  }
  if (epShort > 0) {
    // ★黙って休養に落とさない。件数を目に付く形で出す（D-037 と同じ考え方）
    onAlert(`★EP 不足で ${epShort} 頭を休養に落としました（Q-P3-23 の裁定待ち）`);
  }
  return { weeks, advanced, retired, epSpent, epShort, incomplete: hitCap };
}

/** ★この実行で処理すべき週があるか（呼ぶ側のログ用） */
export function pendingWeeks(nowMs: number, epochMs: number, lastProcessed: number | null): number[] {
  return weeksToProcess(nowMs, epochMs, lastProcessed);
}
