/**
 * ★**プレイヤーの配合の確定**（★PLAN I-2・正典 D-120・2026-09-22）。
 *
 * 【★何をするか】（★裁定 `REVIEW_FIRST_HORSE_BREED_PLACEMENT_VERDICT_20260922.md` §1）
 *   ★利用者の RPC（`request_initial_breeding`・移行 `0061`）は ★**要求を積むだけ**です。
 *   ★ここが ★**毎周（60 秒ごと）**拾い、★`breed()` を呼んで ★命名前の仔（`foal_drafts`）を確定します。
 *   ⚠️ ★NPC の週次配合（`runBreedingCatchUp`）に相乗りさせません — ★相乗りすると誕生まで最大 4 時間 待ちます。
 *
 * 【★1 件の要求は 1 取引】（★同 §1 条件 2）
 *   ★要求をロック → ★母 → 父 の順に親をロック（★NPC の経路と同じ順・条件 3）→ ★ロックの後で判定し直す
 *   → ★`breed()` → ★下書き → ★親のカウンタ → ★種付料の免除を記帳 → ★要求を「完了」。★どこで落ちても何も残りません。
 *
 * 【🔴 ★結果を見てから失敗させない】（★D-120 ①・振り直しを成立させない）
 *   ★「失敗」にするのは ★**`breed()` を呼ぶ前の判定だけ**です。★失敗の行は初回の枠を解放するので
 *   （★部分一意 `status <> 'failed'`）、★仔の中身を見てから失敗にできる経路が在ると ★**引き直しが成立します**。
 *   ★`breed()` より後で落ちたら ★**取引ごと戻し、要求は「待ち」のまま**にします（★次の周にやり直す・★同じ種なので同じ仔）。
 *
 * 【★父母候補の出どころ】（★D-120 ⑥ N-1・裁定 f613878 / 7b16fb4）
 *   ★母は ★NPC の功労馬（引退した産める牝馬）、★父は ★NPC の種牡馬（`isInitialParent`）。★母はレビュー側の暫定決定。
 */
import type pg from 'pg';

import type { BalanceConfig, HorseRecord, MateRejection } from '@star/sim-engine';
import { DEFAULT_BALANCE, breed, canMate } from '@star/sim-engine';
import {
  LIFECYCLE_WEEKS, WEEKS_PER_YEAR, canOwnMore, gameYearOf, npcStudFee, weekIndexAt,
} from '@star/scheduler';

import {
  BREEDING_COLS, birthYearOffset, breedingRecordOf, damHasFoalInYearSql, idAndSeedFromKey,
  loadAncestorLookup, loadNicks,
} from './breeding-runner.js';
import { confirmFoalName, foalNamingContext } from './player-naming.js';

/**
 * ★**仔の id と種の鍵の接頭辞**（★裁定 §3）。
 *   ★NPC の鍵（★「父|母|週」）と ★**同じ文字列になりえない**ようにする区別です。
 */
export const PLAYER_FOAL_KEY_PREFIX = 'player-foal|';

/** ★1 周で拾う要求の上限（★安全柵。★本当の上限は時間の予算 `PLAYER_BREEDING_BUDGET_MS`） */
export const PLAYER_BREEDING_BATCH = 20;

/**
 * 🔴 ★**1 周のうち、初回の配合の確定に使ってよい時間**（★裁定 322d603 §2・2026-09-22）。
 *
 *   ★件数だけで切っていたら、★実測 1 件 2.8〜2.9 秒（★この PC → staging）× 20 件 ＝ ★58 秒で、
 *   ★ワーカーの周（`TICK_MS` 60 秒）を ★それだけで使い切りました。
 *   ★周が延びると ★**次の周のレースの処理（締切・発走・確定）が遅れます**（★脇の処理が本体の時刻を押す）。
 *   → ★NPC の配合の追いつき（`BREEDING_BUDGET_MS`・`b0f364d`）と同じく ★**時間で切ります**。
 *   ★1 件の確定の前に経過を見て、★予算を超えていたら残りは次の周へ回します（★1 件目は必ず通す）。
 *   ⚠️ ★15 秒 ＝ 周の 1/4。★実測 2.9 秒なら 1 周 5〜6 件・★1 時間 約 300 件。★VPS からの所要で見直す
 *   ⚠️ ★較正定数ではありません（★ゲームの結果に効かない。★時間の配分だけ）。
 */
export const PLAYER_BREEDING_BUDGET_MS = 15_000;

/**
 * 🔴 ★**続けて落ちたら `internal_error` にする回数**（★裁定 322d603 §3）。
 *   ★`breed()` の後で落ちた要求は ★取引を戻して「待ち」のまま次の周にやり直します（★結果を見てから失敗にしない）。
 *   ★しかし ★毎回同じ理由で落ちる要求は ★永久にやり直され、★後ろの要求を止めます。
 *   ★戻した取引では ★下書きも残らないので、★利用者は仔を一度も見ていません（★D-120 ① に反しない）。
 */
export const PLAYER_BREEDING_MAX_ATTEMPTS = 5;

export interface PlayerBreedingBudget {
  readonly budgetMs: number;
  readonly monotonicMs: () => number;
}

/** ★要求の失敗の理由（★画面はこの語を読んで出す・★黙って消さない・D-111 ⑤） */
export type PlayerBreedingFailure =
  | MateRejection
  | 'parent_missing'
  | 'sire_not_candidate'
  | 'dam_not_candidate'
  | 'owner_limit'
  /** ★`PLAYER_BREEDING_MAX_ATTEMPTS` 回 続けて例外で戻した（★利用者は仔を見ていない） */
  | 'internal_error';

export interface PlayerBreedingResult {
  /** ★`foal_requests` が無い（★移行 `0061` の前）ので何もしなかった */
  readonly skipped: boolean;
  readonly done: number;
  readonly failed: number;
  /** ★例外で戻した（★要求は「待ち」のまま・次の周にやり直す） */
  readonly errors: number;
  /** ★続けて落ちたので `internal_error` にした */
  readonly gaveUp: number;
  /** ★予算で止めた（★残りは次の周） */
  readonly stoppedByBudget: boolean;
  /** ★この周の終わりに待っている件数（★溜まりを見る・R-16） */
  readonly backlog: number;
  /** ★待っている最古の要求の年齢 [ms]（★待ちが無ければ null） */
  readonly oldestPendingMs: number | null;
}

/**
 * ★**初回の配合に使える親**（★D-120 ⑥ N-1・裁定 `REVIEW_N1_PARENT_SOURCE_VERDICT_20260922.md` §1・§8）。
 *
 *   ★母: ★**持ち主の居ない NPC の功労馬（`honored`）の牝馬**（★案 B）。★産めるか（6 歳以上・生涯 8 産未満・今年未産）は
 *     ★この後の `canMate` と「その年の仔を 2 つの表で数える」が判定します（★ここで写さない）。
 *     ★NPC の繁殖牝馬（案 A）は使いません — ★候補が年の中で 800 → 19 頭に減り、★登録の時期で候補が変わるため（★§1 (a)）。
 *     ★NPC がその年に使っていない馬なので、★NPC の配合と母を取り合う経路も生まれません（★§1 (b)）。
 *   ★父: ★持ち主の居ない NPC の種牡馬（★§5）。★集中の歯止めは年の上限（§6.7）。
 *   ⚠️ ★役割の名前は変えません（★§4）。★使った事実は `foal_drafts.dam_id` と母の `foal_count` に残ります。
 *   ⚠️ ★**レビュー側の暫定決定**（★§8）。★オーナーが「最初から NPC と同じくらいの母」を選んだら、★この述語を作り直します。
 */
function isInitialParent(row: Record<string, unknown>, role: 'stallion' | 'honored'): boolean {
  return row['owner_id'] === null && row['retirement_role'] === role && row['birth_week'] !== null;
}

/** ★下書きに入れる形（★`horses` の列と同じ名前・★NPC の `insert into horses` と同じ値の作り方） */
export function foalDraftRecord(
  foal: HorseRecord, birthYear: number, birthWeek: number,
): Record<string, unknown> {
  return {
    sex: foal.sex,
    birth_year: birthYear,
    generation: foal.generation,
    sire_id: foal.sireId,
    dam_id: foal.damId,
    sire_line: foal.sireLine,
    dam_sire_line: foal.damSireLine,
    genotype: foal.genotype,
    potential: foal.potential,
    stats: foal.stats,
    unlock_rate: foal.unlockRate,
    surface_aptitude: foal.surfaceAptitude,
    distance_center: foal.distanceCenter,
    distance_range: foal.distanceRange,
    strategy_aptitude: foal.strategyAptitude,
    heavy_aptitude: foal.heavyAptitude,
    growth: foal.growth,
    temper: foal.temper,
    durability: foal.durability,
    frail: foal.frail,
    skill_genes: foal.skillGenes,
    inbreed_coeff: foal.inbreedCoeff,
    nicks_multiplier: foal.nicksMultiplier,
    pedigree_cache: Object.fromEntries(foal.pedigreeCache),
    foal_count: 0,
    g1_wins: 0,
    birth_week: birthWeek,
    // ★NPC の仔と同じ: ★78 週までは週送りを飛ばす（`breeding-runner.ts`・§7.1）
    last_processed_week: birthWeek + LIFECYCLE_WEEKS.trainableFrom,
  };
}

async function tableExists(client: pg.ClientBase, name: string): Promise<boolean> {
  const r = await client.query<{ t: string | null }>('select to_regclass($1)::text t', [`public.${name}`]);
  return r.rows[0]?.t !== null && r.rows[0]?.t !== undefined;
}

export type PlayerBreedingOutcome = 'done' | 'failed' | 'skipped';

/** ★確定に要る、その周の前提（★周に 1 回 読む） */
export interface PlayerBreedingContext {
  readonly week: number;
  readonly year: number;
  readonly yearOffset: number;
  readonly nicks: Map<string, number>;
  readonly balance: BalanceConfig;
}

export async function playerBreedingContext(
  client: pg.ClientBase, nowMs: number, epochMs: number,
  onAlert: (message: string) => void, balance: BalanceConfig = DEFAULT_BALANCE,
): Promise<PlayerBreedingContext> {
  /** ★生まれる週 ＝ いまの週（★NPC は締まった週を処理するが、★プレイヤーの仔は「いま」生まれる） */
  const week = weekIndexAt(nowMs, epochMs);
  return {
    week,
    year: gameYearOf(week),
    yearOffset: await birthYearOffset(client),
    nicks: await loadNicks(client, onAlert),
    balance,
  };
}

/**
 * ★**要求 1 件を確定する**。
 *
 * 🔴 ★**この関数は `begin` / `commit` / `rollback` をしません**（★呼ぶ側が 1 件ごとに取引を張る）。
 *   ★内側で `commit` すると、★包んだ側の `rollback` が効かなくなります
 *   （★2026-09-21 に staging を 2 度 汚した形・記憶「rollback は自分で commit する関数を戻さない」）。
 *   ★そうしておけば、★staging の実演（`tools/verify-player-breeding-live.mjs`）が ★**全体を包んで必ず戻せます**。
 */
export async function confirmInitialBreeding(
  client: pg.ClientBase,
  requestId: string,
  ctx: PlayerBreedingContext,
): Promise<PlayerBreedingOutcome> {
  {
    const reqRes = await client.query<{ id: string; user_id: string; sire_id: string; dam_id: string; seed_key: string }>(
      "select id, user_id, sire_id, dam_id, seed_key from foal_requests"
        + " where id = $1 and status = 'pending' and kind = 'breed_initial' for update skip locked",
      [requestId],
    );
    const req = reqRes.rows[0];
    if (req === undefined) {
      // ★別の処理が先に取った／既に済んだ
      return 'skipped';
    }

    const fail = async (reason: PlayerBreedingFailure): Promise<PlayerBreedingOutcome> => {
      await client.query(
        "update foal_requests set status = 'failed', failure_reason = $2, processed_at = now() where id = $1",
        [req.id, reason],
      );
      return 'failed';
    };

    // ★ロックは 母 → 父（★NPC の経路が母の印を先に取るのと同じ順・裁定 §1 条件 3）
    const parentSql = `select ${BREEDING_COLS}, owner_id, retirement_role from horses where id = $1 for update`;
    const damRow = (await client.query(parentSql, [req.dam_id])).rows[0] as Record<string, unknown> | undefined;
    const sireRow = (await client.query(parentSql, [req.sire_id])).rows[0] as Record<string, unknown> | undefined;
    if (damRow === undefined || sireRow === undefined) return fail('parent_missing');
    if (!isInitialParent(damRow, 'honored')) return fail('dam_not_candidate');
    if (!isInitialParent(sireRow, 'stallion')) return fail('sire_not_candidate');

    const dam = breedingRecordOf(damRow);
    const sire = breedingRecordOf(sireRow);
    // ★年の出どころは NPC の経路と同じ（★`gameYearOf(週)`・裁定 §3）
    const check = canMate(sire, dam, ctx.balance, ctx.year);
    if (!check.ok) return fail(check.reason ?? 'parent_missing');

    // 🔴 ★印だけに頼らない: ★その年の仔を 2 つの表で数える（★`damHasFoalInYearSql`）
    const inYear = await client.query<{ has: boolean }>(
      `select ${damHasFoalInYearSql('$1', '$2', { horses: true, drafts: true })} as has`,
      [dam.id, ctx.year * WEEKS_PER_YEAR],
    );
    if (inYear.rows[0]?.has === true) return fail('dam_already_bred_this_year');

    // ★所有上限（★D-120 ③）: ★現役 ＋ 命名前の仔。★数え方は `ownership.ts` の 1 か所
    const ownedRes = await client.query<{ n: string }>(
      'select ((select count(*) from horses where owner_id = $1 and retired_at_week is null)'
        + ' + (select count(*) from foal_drafts where user_id = $1 and named_horse_id is null))::text n',
      [req.user_id],
    );
    if (!canOwnMore('active', Number(ownedRes.rows[0]?.n ?? 0))) return fail('owner_limit');

    // ── ★ここから先は「失敗」にしない（★落ちたら取引ごと戻し、要求は待ちのまま）──
    const light = await loadAncestorLookup(client, [sire, dam]);
    const full = new Map<string, HorseRecord>([[sire.id, sire], [dam.id, dam]]);
    const lookup = (id: string): HorseRecord | undefined => full.get(id) ?? light.get(id);
    /**
     * 🔴 ★種は ★`seed_key`（★行を作るときに DB が決めた値・`0063`）から。★要求 ID（クライアントが送る値）から作らない
     *   （★裁定 322d603 §1。★要求 ID から作ると、★クライアントが自分の仔の種を選べる）。
     */
    const { id: foalId, seed } = await idAndSeedFromKey(`${PLAYER_FOAL_KEY_PREFIX}${req.seed_key}`);
    const birthYear = ctx.year + ctx.yearOffset;
    const foal = breed({
      id: foalId,
      sire,
      dam,
      seed,
      generation: Math.max(sire.generation, dam.generation) + 1,
      birthYear,
      lookup,
      balance: ctx.balance,
      nicks: ctx.nicks,
    });

    await client.query(
      'insert into foal_drafts (id, user_id, request_id, sire_id, dam_id, sex, birth_week, record)'
        + ' values ($1, $2, $3, $4, $5, $6, $7, $8)',
      [foalId, req.user_id, req.id, sire.id, dam.id, foal.sex, ctx.week,
        JSON.stringify(foalDraftRecord(foal, birthYear, ctx.week))],
    );
    await client.query(
      'update horses set bred_this_year = true, foal_count = foal_count + 1 where id = $1', [dam.id],
    );
    await client.query(
      'update horses set coverings_this_year = coverings_this_year + 1 where id = $1', [sire.id],
    );

    /**
     * ★**種付料の免除を記帳**（★D-120 ②・黙って 0 にしない）。
     *   ★額は ★確定の時点の NPC 種牡馬の式（`npcStudFee`・§10.5）。★総獲得賞金は `market-flow.ts` と同じ数え方。
     *   ★EP の台帳には ★**増減 0 の `stud_fee` 行**を置き、★要求の行に額を書きます
     *   （★焼却と同じ場所〔`ep_ledger.reason = 'stud_fee'`〕から、★要求 ID で辿れる）。
     */
    const earnRes = await client.query<{ e: string }>(
      'select coalesce(sum(prize_pp), 0)::text e from race_entries'
        + ' where horse_id = $1 and prize_pp is not null',
      [sire.id],
    );
    const waived = npcStudFee(sire.g1Wins, Number(earnRes.rows[0]?.e ?? 0));
    const ledger = await client.query(
      'insert into ep_ledger (user_id, delta, balance_after, reason, ref_id, dedupe_key)'
        + " select id, 0, entry_points, 'stud_fee', $2, $3 from users where id = $1",
      [req.user_id, req.id, `stud_fee_waiver:${req.id}`],
    );
    if (ledger.rowCount !== 1) {
      throw new Error(`player-breeding: ★利用者の行がありません（user=${req.user_id}）`);
    }
    await client.query(
      "update foal_requests set status = 'done', result_id = $2, waived_stud_fee_ep = $3,"
        + ' processed_at = now() where id = $1',
      [req.id, foalId, waived],
    );
    return 'done';
  }
}

/** ★待っている件数と、★最古の要求の年齢（★DB の `now()` で測る・`Date.now()` を使わない） */
async function backlogOf(client: pg.ClientBase): Promise<{ backlog: number; oldestPendingMs: number | null }> {
  const r = (await client.query<{ n: string; age: string | null }>(
    "select count(*)::text n, (extract(epoch from (now() - min(created_at))) * 1000)::bigint::text age"
      + " from foal_requests where status = 'pending' and kind in ('breed_initial', 'name')",
  )).rows[0];
  return {
    backlog: Number(r?.n ?? 0),
    oldestPendingMs: r?.age === null || r?.age === undefined ? null : Number(r.age),
  };
}

/**
 * ★**待っている初回の配合と、★仔の命名を確定する**（★毎周・`main.ts`）。
 *   ★`kind = 'breed_initial'` は `confirmInitialBreeding`、★`kind = 'name'` は `confirmFoalName`（`player-naming.ts`・PLAN I-3）。
 *   ★時間の予算・試行回数・待ちの数えは ★両方で共有します。
 *
 * ⚠️ ★**呼ぶ側は取引を張らないこと**（★要求ごとに自分で `begin` / `commit` します）。
 * ⚠️ ★1 件の例外で残りを止めません（★`onAlert` に出し、★その要求は次の周にやり直す）。
 * 🔴 ★**時間で切ります**（★`budget`・裁定 322d603 §2）。★1 件目は必ず通す（★でないと永久に進まない）。
 * 🔴 ★拾う順は ★**試行回数の少ない順 → 古い順**（★詰まった要求が他を塞がない・§3）。
 */
export async function runPlayerBreeding(
  client: pg.ClientBase,
  nowMs: number,
  epochMs: number,
  onAlert: (message: string) => void,
  budget: PlayerBreedingBudget,
  balance: BalanceConfig = DEFAULT_BALANCE,
  limit: number = PLAYER_BREEDING_BATCH,
): Promise<PlayerBreedingResult> {
  const empty = {
    done: 0, failed: 0, errors: 0, gaveUp: 0, stoppedByBudget: false, backlog: 0, oldestPendingMs: null,
  } as const;
  if (!(await tableExists(client, 'foal_requests'))) return { skipped: true, ...empty };
  const pending = await client.query<{ id: string; kind: string }>(
    "select id, kind from foal_requests where status = 'pending' and kind in ('breed_initial', 'name')"
      + ' order by attempts, created_at, id limit $1',
    [limit],
  );
  if (pending.rows.length === 0) return { skipped: false, ...empty };

  const ctx = await playerBreedingContext(client, nowMs, epochMs, onAlert, balance);
  /** ★命名に要るもの（★禁止名のリストと版・PLAN I-3） */
  const namingCtx = foalNamingContext();

  let done = 0;
  let failed = 0;
  let errors = 0;
  let gaveUp = 0;
  let stoppedByBudget = false;
  const t0 = budget.monotonicMs();
  let tried = 0;
  for (const { id, kind } of pending.rows) {
    if (tried > 0 && budget.monotonicMs() - t0 >= budget.budgetMs) {
      stoppedByBudget = true;
      break;
    }
    tried += 1;
    // ★1 件 ＝ 1 取引（★裁定 55b2fd4 §1 条件 2・どこで落ちても何も残らない）
    await client.query('begin');
    try {
      const o = kind === 'name'
        ? await confirmFoalName(client, id, namingCtx)
        : await confirmInitialBreeding(client, id, ctx);
      await client.query('commit');
      if (o === 'done') done += 1;
      else if (o === 'failed') failed += 1;
    } catch (e) {
      await client.query('rollback');
      errors += 1;
      /**
       * 🔴 ★**戻した後、★別の取引で試行回数を数えます**（★裁定 322d603 §3）。
       *   ★K 回 続けて落ちたら `internal_error`（★利用者は仔を一度も見ていない・D-120 ① に反しない）。
       */
      const bumped = await client.query<{ attempts: number; status: string }>(
        'update foal_requests set attempts = attempts + 1,'
          + " status = case when attempts + 1 >= $2 then 'failed' else status end,"
          + " failure_reason = case when attempts + 1 >= $2 then 'internal_error' else failure_reason end,"
          + ' processed_at = case when attempts + 1 >= $2 then now() else processed_at end'
          + " where id = $1 and status = 'pending' returning attempts, status",
        [id, PLAYER_BREEDING_MAX_ATTEMPTS],
      );
      const b = bumped.rows[0];
      if (b?.status === 'failed') {
        gaveUp += 1;
        onAlert(`🔴 ★初回の配合を ${b.attempts} 回 続けて確定できず、★internal_error にしました`
          + `（要求 ${id}・★利用者の初回の枠は戻ります）: ${(e as Error).message}`);
      } else {
        onAlert(`★初回の配合を確定できませんでした（要求 ${id}・★${b?.attempts ?? '?'} 回目・★次の周にやり直します）: `
          + `${(e as Error).message}`);
      }
    }
  }
  return { skipped: false, done, failed, errors, gaveUp, stoppedByBudget, ...(await backlogOf(client)) };
}
