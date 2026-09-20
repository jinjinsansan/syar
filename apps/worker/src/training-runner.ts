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
 *     ★**休養に落とすのは EP 不足（SQLSTATE `EP_SHORT_SQLSTATE`）だけ**です（監査 H-3・2026-09-14）。
 *       それ以外の例外は、その馬のその週を**進めず**に別に数え（`spendErrors`）、馬ごとに警報を出します。
 *       ★失敗した馬は**同じ実行の中では選び直しません**（バッチを選ぶ SQL から除く・照会 Q1・AUDIT_FIX2 BF-1）。
 *         他の馬は上限まで進めます。失敗し続ける馬が 1 頭いても、世界全体の週送りを遅らせないためです。
 *         次の周で再試行します（引き落としは馬×週で冪等なので、二重には引かれない）。
 *
 * 【★週ごとの記録は所有馬だけ】
 *   `horse_week_log` は B-1 の証拠として作りましたが、全馬×182週だと
 *   1万頭で182万行になります（Q-P3-21）。**プレイヤーの馬だけ**記録します。
 *   NPC の馬は誰も履歴を見ません。
 */

import type pg from 'pg';
import { createHash } from 'node:crypto';
import { ABILITY_KEYS, deriveRng, growthTellsOf, type AbilityKey, type Rng } from '@star/sim-engine';
import { weekIndexAt, weeksToProcess } from '@star/scheduler';
import {
  DEFAULT_MENU, DEFAULT_STABLE_GRADE, STABLE_GRADES, advanceWeek, gradeEpCost,
  type HorseTraits, type MenuId, type StableGrade, type TrainingState,
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

/**
 * ★EP 不足を表す SQLSTATE（監査 H-3・2026-09-14）。
 *   `spend_training_ep` が `raise exception ... using errcode` で付けます（`db/migrations/0021`）。
 *   値の一致は `apps/cli/test/rpc-guard.test.ts` が照合します。
 */
export const EP_SHORT_SQLSTATE = 'ST001';

/**
 * ★引き落としの例外を分ける。**SQLSTATE だけで**見分けます。
 *   ⚠️ メッセージの文字列一致にしません — 文言を直した日に黙って外れます（指示書 AF-3 §4-1-3）。
 *   ★以前はどの例外も「EP 不足」とみなしており、`0020` の `assert_setup_complete()` が
 *     ワーカーの呼び出しを毎回「未認証」で弾いても、**持ち馬が全頭休養に落ち、警報は「EP 不足」**と出ていました。
 */
export function classifySpendError(e: unknown): 'ep_short' | 'other' {
  return spendErrorCode(e) === EP_SHORT_SQLSTATE ? 'ep_short' : 'other';
}

function spendErrorCode(e: unknown): string {
  if (typeof e === 'object' && e !== null && 'code' in e) {
    const code = (e as { code: unknown }).code;
    if (typeof code === 'string') return code;
  }
  return '(なし)';
}

function spendErrorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
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
  /**
   * ★EP 不足**以外**の理由で引き落としが失敗し、その週を進めなかった頭数（監査 H-3）。
   *   失敗した馬は同じ実行の中では選び直さず、他の馬は上限まで進めます（AUDIT_FIX2 BF-1）。
   *   次の周で同じ馬を再試行します（引き落としは馬×週で冪等なので、二重には引かれない）。
   */
  readonly spendErrors: number;
  /**
   * ★まだ終わっていない馬がいるか。次のどちらかなら true です（AUDIT_FIX2 BF-1）:
   *   ① 上限（`MAX_WEEKS_PER_RUN` × バッチ数）に当たって途中で終わった
   *   ② EP 不足以外の失敗で、週を進めなかった馬がいる（`spendErrors > 0`）
   */
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
  /** ★厩舎の格（`0024` で追加・既定 `bronze`・D-103） */
  stable_grade: string | null;
  /**
   * ★**前に言ったときの能力**（★`0053`・**GB-1 ④⑤⑥**）。★`null` ＝ まだ基準が無い。
   * ⚠️ ★`growth_told_week` と ★**必ず一緒に動きます**（★`0053` の CHECK）。
   */
  growth_told_stats: Record<string, number> | null;
  growth_told_week: string | number | null;
}

/**
 * ★DB の文字列 → 格（★**知らない語**は黙って既定にしません）。
 * ⚠️ ★`0024` の CHECK が閉じていますが、★読む側でも閉じておきます
 *    （★列の CHECK を外した日に、黙って強い格として扱われないため）。
 * ⚠️ ★**値が無い（null・undefined）ときは警報を出しません** — ★`0024` より前の行や、
 *    ★この列を読まない経路があるためです。★既定の `bronze` は倍率 1.0 で、
 *    ★格を入れる前と 1 ビット同じなので、★黙って強くなることはありません。
 *    ★（2026-09-16: ★`undefined` を「知らない語」と見なして**毎頭に警報を出し**、
 *      ★`training-runner-skip` の「警報は 1 回だけ」が落ちました。）
 */
export function stableGradeOf(
  v: string | null | undefined,
  onAlert: (msg: string) => void,
  horseId: string,
): StableGrade {
  if (v === null || v === undefined) return DEFAULT_STABLE_GRADE;
  if ((STABLE_GRADES as readonly string[]).includes(v)) return v as StableGrade;
  onAlert(`★厩舎の格が名簿にありません: 馬 ${horseId} の ${v}（既定の ${DEFAULT_STABLE_GRADE} で進めます）`);
  return DEFAULT_STABLE_GRADE;
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
  /** ★EP 不足以外の失敗で、その週を進めなかった頭数（監査 H-3） */
  let spendErrors = 0;
  /**
   * ★EP 不足以外の失敗が出た馬の ID（AUDIT_FIX2 BF-1）。**この実行の中では、以後のバッチで選び直さない。**
   *   選ぶ SQL は `order by id limit` なので、除かなければ失敗し続ける馬が毎回同じバッチに選ばれ、枠を食い続ける。
   */
  const failedIds: string[] = [];

  // ★何頭いるかを先に数え、**週数 × バッチ数**で回数の上限を決める。
  //   ここを固定回数にすると、頭数が増えたときに黙って途中で止まります。
  const totalRow = await client.query<{ n: string }>(
    'select count(*)::text as n from horses where retired_at_week is null and birth_week is not null',
  );
  const total = Number(totalRow.rows[0]!.n);

  /**
   * 🔴 ★**`birth_week` が無い馬は、★ここで黙って落ちます**（★2026-09-20・`PROD-NEVER-AGED`）。
   *
   * 【★何が起きたか】
   *   ✔ ★本番（2026-09-19 実測）: ★現役 **7,355 頭**・★`birth_week` 有り **0 頭**。
   *     → ★上の `total` が **0**。→ ★下の `select` が 0 行。→ ★`hitCap = false` で **break**。
   *     → ★★**育成は「走っているが何もしていない」。★例外も出ない。★記録も残らない。**
   *   ★3 日で 6,066 レースが走り、★**誰も気づきませんでした**（★**R-16**: ★機構が止まって全部 緑）。
   *
   * 【★なぜ投げるのか】
   *   ★`onAlert` で済ませません。★**警報は読まれないことがあります**。
   *   ★**現役馬が居るのに 1 頭も育てられない**のは、★世界が壊れている状態です。
   *   → ★★**fail-closed**（★R-27: ★既定は狭い側へ）。
   *
   * ⚠️ ★**現役が 0 頭なら投げません** — ★それは「まだ世界が無い」だけで、★壊れてはいません。
   */
  const activeRow = await client.query<{ n: string }>(
    'select count(*)::text as n from horses where retired_at_week is null',
  );
  const active = Number(activeRow.rows[0]!.n);
  if (active > 0 && total === 0) {
    throw new Error(
      `advanceTrainingWeeks: ★現役 ${active} 頭 のうち、★birth_week を持つ馬が 0 頭です。`
        + '★このままでは育成が 1 頭も進まず、★例外も出ずに静かに終わります（PROD-NEVER-AGED）。'
        + '★世界を作る経路が birth_week を書いていないか、★age-horses 相当が流れていません。',
    );
  }
  if (total < active) {
    // ⚠️ ★一部だけ欠けている場合。★投げませんが、★**黙らせません**（★数を出す）。
    onAlert(
      `★birth_week が無い現役馬が ${active - total} 頭 います（現役 ${active} 頭 中）。`
        + '★その馬は育成から静かに外れています（PROD-NEVER-AGED）。',
    );
  }
  const batchesPerWeek = Math.max(1, Math.ceil(total / BATCH_SIZE));
  const maxIterations = MAX_WEEKS_PER_RUN * batchesPerWeek;
  let hitCap = true;

  for (let iter = 0; iter < maxIterations; iter += 1) {
    const r = await client.query<Row>(
      `select id, owner_id, sex, growth, temper, durability, potential, stats,
              birth_week, last_processed_week, fatigue, condition, rest_until_week, career_ended,
              stable_grade,
              growth_told_stats, growth_told_week
         from horses
        where retired_at_week is null
          and birth_week is not null
          and last_processed_week < $1
          and not (id = any($3::uuid[]))
        order by id
        limit $2`,
      [target, BATCH_SIZE, failedIds],
    );
    if (r.rowCount === 0) { hitCap = false; break; }

    const updates: {
      id: string; last: number; fatigue: number; condition: number;
      restUntil: number | null; careerEnded: boolean;
      retiredAt: number | null; role: string | null; reason: string | null;
      potential: string; stats: string; durability: number; temper: number;
      /**
       * ★**「前に言ったときの能力」**（★**GB-1 ④⑤⑥**・移行 `0053`）。
       * 🔴 ★**言った週にだけ**新しい値を入れます。★言わなかった週は ★**今の値をそのまま戻します**
       *    （★更新しないのと同じ。★毎週 動かすと累積が週次になります・GB-1 ⑤）。
       */
      toldStats: string | null; toldWeek: number | null;
    }[] = [];
    /** ★この周で「前より○○できるようになった」と言えた馬（★通報のため） */
    const told: { id: string; keys: string[] }[] = [];
    /** ★EP 不足以外の失敗で、このバッチで週を進めなかった馬（監査 H-3） */
    const skipped = new Set<string>();

    /**
     * 🔴 ★**利用者が選んだ献立を読みます**（★2026-09-20・`TRAINING-INSTRUCTION-NOT-READ`）。
     *
     *   ⚠️ ★これまで ★**誰も読んでいませんでした。** ★画面で選べるのに、★ワーカーは
     *     ★`defaultMenu` で自分で決めていました（★選んだ意味がありませんでした）。
     *   ★指示が無い週は ★**既定の献立で調教します**（★裁定 (a)）。
     *     ★理由: ★世界は時計で動きます。★他の馬は進みます。★**待てません。**
     *   ⚠️ ★**まとめて 1 回で読みます**（★1 頭ずつ引くと往復が頭数ぶん増えます）。
     */
    const orderOf = new Map<string, string>();
    {
      const ids = r.rows.map((x) => String(x.id));
      const weeks = r.rows.map((x) => Number(x.last_processed_week));
      const o = await client.query<{ horse_id: string; menu: string }>(
        'select horse_id, menu from training_orders'
          + ' where (horse_id, week) in (select * from unnest($1::uuid[], $2::bigint[]))',
        [ids, weeks],
      );
      for (const x of o.rows) orderOf.set(String(x.horse_id), String(x.menu));
    }

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
      /**
       * 🔴 ★**利用者の指示が在ればそれを使い、★無ければ既定**（★裁定 (a)）。
       *   ⚠️ ★指示が在っても ★**下の疲労の分岐で `rest` に落ちることがあります** —
       *     ★それは規則（★§7.4）であって、★指示を無視しているのではありません。
       */
      const ordered = orderOf.get(String(row.id)) ?? null;
      let menu = (ordered ?? defaultMenu(age, state.fatigue)) as ReturnType<typeof defaultMenu>;
      /**
       * ★厩舎の格（★D-103・`0024` の列）。★既定 `bronze` は倍率 1.0 で、★格を入れる前と 1 ビット同じ。
       * ⚠️ ★**伸びと費用に同じ倍率**が掛かります（★EP あたりの伸びはどの格でも同じ）。
       */
      const grade = stableGradeOf(row.stable_grade, onAlert, row.id);

      // ── EP（G-6）。★NPC 馬は null が返るので課金されない ──────
      if (row.owner_id !== null) {
        const cost = gradeEpCost(menu, grade);
        try {
          const res = await client.query<{ bal: string | null }>(
            'select spend_training_ep($1, $2, $3) as bal', [row.id, week, cost],
          );
          if (res.rows[0]?.bal !== null) epSpent += cost;
        } catch (e) {
          if (classifySpendError(e) === 'ep_short') {
            // ★足りないときは休養に落とす（Q-P3-23）。★黙って落とさない
            epShort += 1;
            menu = 'rest';
          } else {
            /**
             * ★EP 不足以外を休養に落とさない（監査 H-3・2026-09-14）。
             *   その馬のその週は**進めない**（状態を書かない）。次の周で再試行する。
             *   ★この実行の中では選び直さない（`failedIds` で以後のバッチから除く・照会 Q1・AUDIT_FIX2 BF-1）。
             */
            spendErrors += 1;
            skipped.add(row.id);
            failedIds.push(row.id);
            onAlert(
              `★調教の EP 引き落としが EP 不足以外の理由で失敗しました: 馬 ${row.id} 週 ${week}` +
                `（SQLSTATE ${spendErrorCode(e)} / ${spendErrorMessage(e)}）。この馬のこの週は進めていません`,
            );
            continue;
          }
        }
      }

      const seed = horseSeed(row.id);
      const out = advanceWeek({
        state,
        traits,
        menu,
        grade,
        // ★B-1 が通す経路と同じ条件（§7.6 のイベントを引く）
        enableEvents: true,
        rngFor: (stream: number): Rng => deriveRng(seed, stream, week),
      });
      advanced += 1;
      if (out.state.retirement !== null) retired += 1;

      /**
       * ★**「前より○○できるようになった」**（★**GB-1 ④**・2026-09-19・オーナー決定）。
       *
       * 【★GB-1 ⑥ — ★初回の基準】★**持ち主のものになった時点の `stats`**。
       *   ★`growth_told_stats` が `null` の馬には ★**この週を進める前の値**を入れます。
       *   ✔ ★成長は週送りでしか起きないので、★その値は ★**取得した瞬間の値そのもの**です。
       *   🔴 ★`buy_horse` など **3 つの RPC には書きません**（★写しが 3 つできる・D-052）。
       *
       * 【🔴 ★GB-1 ⑤ — ★言ったときにだけ書く】
       *   ★言わなかった週は ★**基準を動かしません**。★動かすと ★**累積が週次と同じもの**になります
       *   （✔ `growth-tell-frequency.test.ts`: ★毎週 +5 の馬は 週次 0 回 ／ 累積 10 回）。
       *
       * ⚠️ ★**NPC には言いません**（★持ち主がいないので「前より」の起点がありません）。
       * ⚠️ ★**着順にも経済にも入りません**（§18 LR-5）。★失敗しても週送りは止めません。
       */
      let toldStats: string | null = null;
      let toldWeek: number | null = null;
      /** ★自馬だけ（★切り出しの目印。★上の EP の枝と同じ条件だが、★別の話です） */
      const isOwned = row.owner_id !== null;
      if (isOwned) {
        const base = row.growth_told_stats === null || row.growth_told_stats === undefined
          /** ★GB-1 ⑥: ★**この週を進める前の値**＝取得した瞬間の値 */
          ? (state.current as Record<AbilityKey, number>)
          : numRec(row.growth_told_stats, 'growth_told_stats');
        const keys = growthTellsOf(base, out.state.current as Record<AbilityKey, number>);
        if (row.growth_told_stats === null || row.growth_told_stats === undefined) {
          /** ★初回は ★**基準を置くだけ**。★この週は言いません（★取得した瞬間との差はまだ 0） */
          toldStats = JSON.stringify(base);
          toldWeek = week;
        } else if (keys.length > 0) {
          toldStats = JSON.stringify(out.state.current);
          toldWeek = week + 1;
          told.push({ id: row.id, keys });
        } else {
          /** 🔴 ★言わなかった週は ★**そのまま戻す**（★GB-1 ⑤） */
          toldStats = JSON.stringify(numRec(row.growth_told_stats, 'growth_told_stats'));
          toldWeek = num(row.growth_told_week, 'growth_told_week');
        }
      }

      updates.push({
        id: row.id,
        last: week + 1,
        toldStats,
        toldWeek,
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
         temper = t.temper,
         growth_told_stats = t.told_stats,
         growth_told_week = t.told_week
       from unnest($1::uuid[], $2::bigint[], $3::numeric[], $4::smallint[], $5::bigint[],
                   $6::boolean[], $7::bigint[], $8::text[], $9::text[],
                   $10::jsonb[], $11::jsonb[], $12::numeric[], $13::numeric[],
                   $14::jsonb[], $15::bigint[])
         as t(id, last, fatigue, condition, rest_until, career_ended, retired_at,
              role, reason, potential, stats, durability, temper, told_stats, told_week)
       where h.id = t.id`,
      [
        updates.map((u) => u.id), updates.map((u) => u.last),
        updates.map((u) => u.fatigue), updates.map((u) => u.condition),
        updates.map((u) => u.restUntil), updates.map((u) => u.careerEnded),
        updates.map((u) => u.retiredAt), updates.map((u) => u.role), updates.map((u) => u.reason),
        updates.map((u) => u.potential), updates.map((u) => u.stats),
        updates.map((u) => u.durability), updates.map((u) => u.temper),
        updates.map((u) => u.toldStats), updates.map((u) => u.toldWeek),
      ],
    );
    /**
     * ★**黙って落とさない**（★D-116・§18 LR-5）。★言えた馬を数で残します。
     * ⚠️ ★**能力の名前は出しません**（★標準出力にも符号列を作らない・D-114 ②）。
     *    ★出すのは ★**頭数だけ**です。
     */
    if (told.length > 0) {
      console.log(`[worker] ★「前より○○できるようになった」を ${told.length} 頭に（★GB-1 ④）`);
    }
    // ★このバッチで進めた週を記録する（バッチごとに違いうる）
    for (const row of r.rows) {
      if (skipped.has(row.id)) continue; // ★進めなかった馬の週は「処理した週」に数えない
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
  if (spendErrors > 0) {
    // ★周の終わりに件数の要約を 1 行（馬ごとの警報は上で出している・AUDIT_FIX2 BF-1）
    onAlert(
      `★EP 不足以外の失敗で ${spendErrors} 頭の週を進めませんでした` +
      `（この実行では選び直さず、他の馬は進めました。次の周で再試行します・監査 H-3）`,
    );
  }
  if (epShort > 0) {
    // ★黙って休養に落とさない。件数を目に付く形で出す（D-037 と同じ考え方）
    onAlert(`★EP 不足で ${epShort} 頭を休養に落としました（Q-P3-23 の裁定待ち）`);
  }
  // ★incomplete: 上限に当たった、または失敗で週を進めなかった馬がいる（`TrainingWeekResult` の註記・AUDIT_FIX2 BF-1）
  return { weeks, advanced, retired, epSpent, epShort, spendErrors, incomplete: hitCap || spendErrors > 0 };
}

/** ★この実行で処理すべき週があるか（呼ぶ側のログ用） */
export function pendingWeeks(nowMs: number, epochMs: number, lastProcessed: number | null): number[] {
  return weeksToProcess(nowMs, epochMs, lastProcessed);
}
