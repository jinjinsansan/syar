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
 * 【⚠️ ★この便で決まっていないもの】
 *   ★父母候補の出どころ（★D-120 ⑥ N-1）。★いまは ★**NPC の種牡馬・繁殖牝馬（持ち主が居ない馬）だけ**を
 *   ★通します（`isInitialParent`）。★N-1 の裁定で置き換えます。
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

/**
 * ★**仔の id と種の鍵の接頭辞**（★裁定 §3）。
 *   ★NPC の鍵（★「父|母|週」）と ★**同じ文字列になりえない**ようにする区別です。
 */
export const PLAYER_FOAL_KEY_PREFIX = 'player-foal|';

/** ★1 周で拾う要求の上限（★60 秒の周に収める。★残りは次の周） */
export const PLAYER_BREEDING_BATCH = 20;

/** ★要求の失敗の理由（★画面はこの語を読んで出す・★黙って消さない・D-111 ⑤） */
export type PlayerBreedingFailure =
  | MateRejection
  | 'parent_missing'
  | 'sire_not_candidate'
  | 'dam_not_candidate'
  | 'owner_limit';

export interface PlayerBreedingResult {
  /** ★`foal_requests` が無い（★移行 `0061` の前）ので何もしなかった */
  readonly skipped: boolean;
  readonly done: number;
  readonly failed: number;
  /** ★例外で戻した（★要求は「待ち」のまま・次の周にやり直す） */
  readonly errors: number;
}

/**
 * ⚠️ ★**暫定**（★N-1 の裁定待ち）: ★初回の配合に使える親は、★持ち主の居ない NPC の繁殖馬だけ。
 */
function isInitialParent(row: Record<string, unknown>, role: 'stallion' | 'broodmare'): boolean {
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

type Outcome = 'done' | 'failed' | 'skipped';

async function processOne(
  client: pg.ClientBase,
  requestId: string,
  ctx: {
    readonly week: number;
    readonly year: number;
    readonly yearOffset: number;
    readonly nicks: Map<string, number>;
    readonly balance: BalanceConfig;
  },
): Promise<Outcome> {
  await client.query('begin');
  try {
    const reqRes = await client.query<{ id: string; user_id: string; sire_id: string; dam_id: string }>(
      "select id, user_id, sire_id, dam_id from foal_requests"
        + " where id = $1 and status = 'pending' and kind = 'breed_initial' for update skip locked",
      [requestId],
    );
    const req = reqRes.rows[0];
    if (req === undefined) {
      // ★別の処理が先に取った／既に済んだ
      await client.query('commit');
      return 'skipped';
    }

    const fail = async (reason: PlayerBreedingFailure): Promise<Outcome> => {
      await client.query(
        "update foal_requests set status = 'failed', failure_reason = $2, processed_at = now() where id = $1",
        [req.id, reason],
      );
      await client.query('commit');
      return 'failed';
    };

    // ★ロックは 母 → 父（★NPC の経路が母の印を先に取るのと同じ順・裁定 §1 条件 3）
    const parentSql = `select ${BREEDING_COLS}, owner_id, retirement_role from horses where id = $1 for update`;
    const damRow = (await client.query(parentSql, [req.dam_id])).rows[0] as Record<string, unknown> | undefined;
    const sireRow = (await client.query(parentSql, [req.sire_id])).rows[0] as Record<string, unknown> | undefined;
    if (damRow === undefined || sireRow === undefined) return fail('parent_missing');
    if (!isInitialParent(damRow, 'broodmare')) return fail('dam_not_candidate');
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
    const { id: foalId, seed } = await idAndSeedFromKey(`${PLAYER_FOAL_KEY_PREFIX}${req.id}`);
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
    await client.query('commit');
    return 'done';
  } catch (e) {
    await client.query('rollback');
    throw e;
  }
}

/**
 * ★**待っている初回の配合を、★古い順に確定する**（★毎周・`main.ts`）。
 *
 * ⚠️ ★**呼ぶ側は取引を張らないこと**（★要求ごとに自分で `begin` / `commit` します）。
 * ⚠️ ★1 件の例外で残りを止めません（★`onAlert` に出し、★その要求は次の周にやり直す）。
 */
export async function runPlayerBreeding(
  client: pg.ClientBase,
  nowMs: number,
  epochMs: number,
  onAlert: (message: string) => void,
  balance: BalanceConfig = DEFAULT_BALANCE,
  limit: number = PLAYER_BREEDING_BATCH,
): Promise<PlayerBreedingResult> {
  if (!(await tableExists(client, 'foal_requests'))) {
    return { skipped: true, done: 0, failed: 0, errors: 0 };
  }
  const pending = await client.query<{ id: string }>(
    "select id from foal_requests where status = 'pending' and kind = 'breed_initial'"
      + ' order by created_at, id limit $1',
    [limit],
  );
  if (pending.rows.length === 0) return { skipped: false, done: 0, failed: 0, errors: 0 };

  /** ★生まれる週 ＝ いまの週（★NPC は締まった週を処理するが、★プレイヤーの仔は「いま」生まれる） */
  const week = weekIndexAt(nowMs, epochMs);
  const ctx = {
    week,
    year: gameYearOf(week),
    yearOffset: await birthYearOffset(client),
    nicks: await loadNicks(client, onAlert),
    balance,
  };

  let done = 0;
  let failed = 0;
  let errors = 0;
  for (const { id } of pending.rows) {
    try {
      const o = await processOne(client, id, ctx);
      if (o === 'done') done += 1;
      else if (o === 'failed') failed += 1;
    } catch (e) {
      errors += 1;
      onAlert(`★初回の配合を確定できませんでした（要求 ${id}・★次の周にやり直します）: ${(e as Error).message}`);
    }
  }
  return { skipped: false, done, failed, errors };
}
