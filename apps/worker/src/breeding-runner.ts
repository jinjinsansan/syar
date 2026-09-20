/**
 * ★**定常運転の供給**（`POOL-SUPPLY`・正典 §6.7 / §10.5・2026-09-20）。
 *
 * 【🔴 ★なぜ要るか（★実測）】
 *   ★2026-09-20、★本番の世界を作り直し、★ワーカーを配備して時計が動き出しました。
 *   ✔ ★作り直し直後 現役 **2,400 頭** → ★週送り 1 回で **2,379 頭**（★1 週で 15 頭 引退）。
 *   ★製品コードに `insert into horses` が ★**1 件もありません**でした。
 *   → ★★**引退だけが動き、★生まれない。** ★このままでは尽きます。
 *
 * 【★何をするか】
 *   ★毎週、★**その週に割り当てられた繁殖牝馬**（★B-3 と同じ層化）に仔を産ませます。
 *   ★相手の選び方は `@star/breeding`（★プリシードと**同じ手続き**・★§10.5）。
 *
 * 【🔴 ★年の扱い — ★照会を出します（Q-5）】
 *   ⚠️ ★`horses.birth_year` には ★**プリシードの年（0〜50）**が入っています。
 *     ★一方 `birth_week` は ★**ゲームの週**です。★**尺度が違います。**
 *   → ★★**この道具は `birth_week` だけを年の出どころにします**（`gameYearOf`）。
 *   🔴 ★結果として ★**DB に 2 つの尺度の `birth_year` が混ざります**
 *     （★創始世代はプリシードの年、★これから生まれる仔はゲームの年）。
 *     ★**黙って混ぜたくないので照会に出します。**
 *   ✔ ★いま困らない理由: ★年齢判定は `birth_week` からしか引いていません。
 */
import type pg from 'pg';

import type { BalanceConfig, HorseRecord, Stable } from '@star/sim-engine';
import {
  DEFAULT_BALANCE, NPC_STABLES, applyMatingCounters, breed,
} from '@star/sim-engine';
import { buildSireAncestorIndex, pickSire, rankSires } from '@star/breeding';
import {
  LIFECYCLE_WEEKS, gameYearOf, rankByStableKey, strataOffsetWeeks, weekIndexAt,
} from '@star/scheduler';

import { rowToHorse } from './horse-repo.js';

export interface BreedingWeekResult {
  /** ★どの週を処理したか */
  readonly week: number;
  /** ★その週に割り当てられ、かつ相手が見つかった牝馬 */
  readonly eligible: number;
  /** ★実際に生まれた頭数 */
  readonly born: number;
  /** ★相手が見つからなかった牝馬（★黙って規則を曲げない） */
  readonly noSire: number;
  /** ★既に居た（★同じ週を二度 処理した）ぶん */
  readonly alreadyThere: number;
  /** ★年の変わり目で年次カウンタを戻したか */
  readonly yearReset: boolean;
}

/**
 * 🔴 ★**血統をたどるためだけの、★薄い記録**。
 *
 *   ★`calcInbreedCoefficient` は祖先を `lookup` でたどります（★深さ `PEDIGREE_DEPTH`）。
 *   ★祖先ぜんぶを完全な `HorseRecord` で読むと重いので、★**必要な列だけ**読みます。
 *   ⚠️ 🔴 ★**足りない列を既定値で埋めません。** ★`Proxy` で、★**想定外の列を読んだら投げます**。
 *     ★将来 別の列を見るようになったら、★**黙って間違えるのではなく落ちます**。
 */
const PEDIGREE_FIELDS: ReadonlySet<string> = new Set([
  'id', 'sireId', 'damId', 'inbreedCoeff', 'pedigreeCache',
]);

function pedigreeOnlyRecord(row: Record<string, unknown>): HorseRecord {
  const light = {
    id: String(row['id']),
    sireId: (row['sire_id'] as string | null) ?? null,
    damId: (row['dam_id'] as string | null) ?? null,
    inbreedCoeff: Number(row['inbreed_coeff'] ?? 0),
    pedigreeCache: new Map(
      Object.entries((row['pedigree_cache'] as Record<string, number[]>) ?? {}),
    ),
  };
  return new Proxy(light, {
    get(target, prop) {
      if (typeof prop === 'symbol' || PEDIGREE_FIELDS.has(prop)) {
        return (target as Record<string, unknown>)[prop as string];
      }
      throw new Error(
        `breeding-runner: 祖先の記録から ${String(prop)} を読もうとしました。`
          + '★この記録は血統をたどるためだけの薄い写しです（★既定値で埋めません）。'
          + '★必要なら読む列を増やしてください',
      );
    },
  }) as unknown as HorseRecord;
}

/** ★`npc_stable_id`（数字）から厩舎を引く。★`seed-world` が数字にしたものを戻します */
function stableOfNumericId(n: number | null): Stable {
  if (n !== null) {
    for (const s of NPC_STABLES) {
      if (Number(String(s.id).replace(/\D/g, '')) === n) return s;
    }
  }
  return NPC_STABLES[0] as Stable;
}

/** ★厩舎 id（`S-07` など）を DB の数字に戻す */
function numericStableId(stable: Stable): number {
  return Number(String(stable.id).replace(/\D/g, ''));
}

/**
 * ★**仔の id と種を、★親と週から決める**（★憲法 §1-4・`randomUUID()` を使いません）。
 *   ★同じ親・同じ週なら ★**必ず同じ id**。★再実行しても増えません。
 */
async function foalIdAndSeed(
  sireId: string, damId: string, week: number,
): Promise<{ id: string; seed: number }> {
  const { createHash } = await import('node:crypto');
  const h = createHash('sha256').update(`${sireId}|${damId}|${week}`, 'utf8').digest('hex');
  // ★UUID の形に整えるだけです（★乱数ではありません）
  const variant = ((parseInt(h.slice(16, 17), 16) & 0x3) | 0x8).toString(16);
  const id = [
    h.slice(0, 8), h.slice(8, 12), `4${h.slice(13, 16)}`,
    `${variant}${h.slice(17, 20)}`, h.slice(20, 32),
  ].join('-');
  /** ★種も同じハッシュから。★`Math.random()` も `Date.now()` も呼びません */
  const seed = parseInt(h.slice(32, 40), 16) >>> 0;
  return { id, seed };
}

const COLS = 'id, sex, generation, birth_year, birth_week, sire_id, dam_id, sire_line,'
  + ' dam_sire_line, genotype, potential, stats, unlock_rate, surface_aptitude,'
  + ' distance_center, distance_range, strategy_aptitude, heavy_aptitude, growth, temper,'
  + ' durability, frail, skill_genes, inbreed_coeff, nicks_multiplier, pedigree_cache,'
  + ' foal_count, g1_wins, bred_this_year, coverings_this_year, npc_stable_id';

/**
 * ★その週の配合を 1 回 走らせる。
 *
 * ⚠️ ★**呼ぶ側が取引を張ってください**（★途中で落ちたら全部 戻すため）。
 */
export async function runBreedingWeek(
  client: pg.ClientBase,
  nowMs: number,
  epochMs: number,
  onAlert: (message: string) => void,
  balance: BalanceConfig = DEFAULT_BALANCE,
): Promise<BreedingWeekResult> {
  /** ★「締まった週」。★いまの週はまだ締まっていないので使いません */
  const week = weekIndexAt(nowMs, epochMs) - 1;
  const year = gameYearOf(week);

  /**
   * 🔴 ★**`bred_this_year` / `coverings_this_year` は、★誰も書いていませんでした**
   *   （★`tools/diag-write-never.mjs` が「読む側だけ在る列」として検出・**DB-1**）。
   *   → ★書かないと ★**2 年目から `canMate` の判定が壊れます**
   *     （★全牝馬が「今年まだ配合していない」ままで、★年に何度でも産めます）。
   */
  const yearReset = gameYearOf(week - 1) !== year;
  if (yearReset) {
    await client.query(
      'update horses set bred_this_year = false, coverings_this_year = 0'
        + ' where bred_this_year or coverings_this_year <> 0',
    );
  }

  const mareRows = await client.query<{ id: string }>(
    "select id from horses where retirement_role = 'broodmare' order by id",
  );
  const mareIds = mareRows.rows.map((r) => r.id);
  if (mareIds.length === 0) {
    onAlert('★繁殖牝馬が 1 頭も居ません（★世界がまだ出来ていないか、★役割が付いていない）');
    return { week, eligible: 0, born: 0, noSire: 0, alreadyThere: 0, yearReset };
  }
  /** ★B-3 と同じ層化。★初期投入と定常運転が**同じ規則で散る** */
  const ranks = rankByStableKey(mareIds);
  const dueIds: string[] = [];
  for (const [id, rank] of ranks) {
    if (strataOffsetWeeks(rank, mareIds.length) === ((week % 52) + 52) % 52) dueIds.push(id);
  }
  if (dueIds.length === 0) {
    return { week, eligible: 0, born: 0, noSire: 0, alreadyThere: 0, yearReset };
  }

  /**
   * 🔴 ★**年次カウンタの列が読めていることを、★ここで確かめます**（★G-3）。
   *   ★`rowToHorse` は列が無ければ `0` / `false` に落とします（★他の呼び出し元のため）。
   *   → ★★**配合でそれを使うと、★判定が素通りします。** ★だから選んだことを確かめます。
   */
  const assertBreedingColumns = (row: Record<string, unknown>): void => {
    for (const k of ['bred_this_year', 'coverings_this_year', 'foal_count', 'birth_week']) {
      if (row[k] === undefined) {
        throw new Error(
          `breeding-runner: ${k} を選んでいません。`
            + '★この列が無いまま配合すると、★年 1 回・種付上限の判定が素通りします（G-3）',
        );
      }
    }
  };
  /** ★年齢は ★**`birth_week` から**引きます（★上の註記・Q-5） */
  const withGameYear = (row: Record<string, unknown>): HorseRecord => {
    assertBreedingColumns(row);
    return { ...rowToHorse(row), birthYear: gameYearOf(Number(row['birth_week'])) };
  };

  const mareResult = await client.query(
    `select ${COLS} from horses where id = any($1::uuid[]) and birth_week is not null`,
    [dueIds],
  );
  const mares = mareResult.rows.map((r) => ({
    record: withGameYear(r as Record<string, unknown>),
    stable: stableOfNumericId(r['npc_stable_id'] === null ? null : Number(r['npc_stable_id'])),
  }));

  const stallionResult = await client.query(
    `select ${COLS} from horses where retirement_role = 'stallion' and birth_week is not null`,
  );
  const stallions = stallionResult.rows.map((r) => withGameYear(r as Record<string, unknown>));
  const stallionStableOf = new Map<string, number | null>(
    stallionResult.rows.map((r) => [
      String(r['id']), r['npc_stable_id'] === null ? null : Number(r['npc_stable_id']),
    ]),
  );

  // ★祖先（★血統をたどるためだけの薄い写し）
  const ancestorIds = new Set<string>();
  for (const m of mares) for (const a of m.record.pedigreeCache.keys()) ancestorIds.add(a);
  for (const s of stallions) for (const a of s.pedigreeCache.keys()) ancestorIds.add(a);
  const light = new Map<string, HorseRecord>();
  if (ancestorIds.size > 0) {
    const rows = await client.query(
      'select id, sire_id, dam_id, inbreed_coeff, pedigree_cache from horses'
        + ' where id = any($1::uuid[])',
      [[...ancestorIds]],
    );
    for (const r of rows.rows) {
      light.set(String(r['id']), pedigreeOnlyRecord(r as Record<string, unknown>));
    }
  }
  const full = new Map<string, HorseRecord>();
  for (const m of mares) full.set(m.record.id, m.record);
  for (const s of stallions) full.set(s.id, s);
  const lookup = (id: string): HorseRecord | undefined => full.get(id) ?? light.get(id);

  const ancestorIndex = buildSireAncestorIndex(stallions);
  const turnOf = new Map<string, number>();
  let born = 0;
  let noSire = 0;
  let alreadyThere = 0;
  let eligible = 0;

  for (const { record: mare, stable } of mares) {
    const ranked = rankSires({
      mare,
      stable,
      stallions,
      isHome: (sid) => stallionStableOf.get(sid) === numericStableId(stable),
      lookup,
      balance,
      year,
      ancestorIndex,
    });
    if (ranked.length === 0) { noSire += 1; continue; }
    eligible += 1;
    const turn = turnOf.get(stable.id) ?? 0;
    turnOf.set(stable.id, turn + 1);
    const sireId = pickSire(ranked, turn);
    if (sireId === null) { noSire += 1; continue; }
    const sire = full.get(sireId);
    if (sire === undefined) { noSire += 1; continue; }

    const { id: foalId, seed } = await foalIdAndSeed(sireId, mare.id, week);
    const foal = breed({
      id: foalId,
      sire,
      dam: mare,
      seed,
      generation: Math.max(sire.generation, mare.generation) + 1,
      birthYear: year,
      lookup,
      balance,
      nicks: new Map(),
    });

    const ins = await client.query(
      `insert into horses (id, npc_stable_id, name, sex, birth_year, generation,
         sire_id, dam_id, sire_line, dam_sire_line, genotype, potential, stats, unlock_rate,
         surface_aptitude, distance_center, distance_range, strategy_aptitude, heavy_aptitude,
         growth, temper, durability, frail, skill_genes, inbreed_coeff, nicks_multiplier,
         pedigree_cache, foal_count, g1_wins, birth_week, last_processed_week)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,
               $23,$24,$25,$26,$27,0,0,$28,$29)
       on conflict (dam_id, birth_week) do nothing`,
      [
        foalId, numericStableId(stable), `${stable.prefix}${foalId.slice(0, 6)}`,
        foal.sex, year, foal.generation,
        sireId, mare.id, foal.sireLine, foal.damSireLine,
        JSON.stringify(foal.genotype), JSON.stringify(foal.potential), JSON.stringify(foal.stats),
        foal.unlockRate, JSON.stringify(foal.surfaceAptitude), foal.distanceCenter,
        foal.distanceRange, JSON.stringify(foal.strategyAptitude), foal.heavyAptitude,
        foal.growth, foal.temper, foal.durability, foal.frail,
        JSON.stringify(foal.skillGenes), foal.inbreedCoeff, foal.nicksMultiplier,
        JSON.stringify(Object.fromEntries(foal.pedigreeCache)),
        week, week + LIFECYCLE_WEEKS.trainableFrom,
      ],
    );
    if (ins.rowCount === 0) { alreadyThere += 1; continue; }
    born += 1;

    // ★年次カウンタ（★G-3。★記録側の規則は `applyMatingCounters` が持っています）
    applyMatingCounters(sire, mare);
    await client.query(
      'update horses set coverings_this_year = coverings_this_year + 1 where id = $1', [sireId],
    );
    await client.query(
      'update horses set bred_this_year = true, foal_count = foal_count + 1 where id = $1',
      [mare.id],
    );
  }

  /**
   * 🔴 ★**止まったら投げます**（★`PROD-NEVER-AGED` と同じ形・fail-closed）。
   *   ⚠️ ★`onAlert` では済ませません — ★3 日・6,066 レースが「警報は読まれない」を証明しました。
   *
   * 【🔴 ★条件を書き直しました（★2026-09-20・★検査を書いていて気づきました）】
   *   ⚠️ ★最初は `eligible > 0 && born === 0 && alreadyThere === 0` と書きました。
   *     ★★**これは原理的に発火しません。**
   *     ★`eligible` は「相手が見つかった牝馬」なので、★その後 `insert` が 0 行なら
   *     ★必ず `alreadyThere` が増えます。★→ ★**条件が同時に成り立ちません。**
   *   → ★★**発火しない番人は、★番人ではありません**（★`CK-14` の族）。
   *   ✅ ★正しい条件: ★**その週に割り当てられた牝馬が居るのに、★1 頭も生まれず、
   *     ★既に居たのでもない**（★＝ 全頭 相手が見つからなかった）。
   *   ⚠️ ★割り当てが 0 頭の週は投げません（★その週は誰の番でもない、が正常）。
   */
  if (mares.length > 0 && born === 0 && alreadyThere === 0) {
    throw new Error(
      'breeding-runner: ★供給が止まっています（POOL-SUPPLY）。'
        + `★週 ${week} / 割り当て ${mares.length} 頭 / 相手あり ${eligible} 頭`
        + ` / 相手なし ${noSire} 頭 / 生まれた 0 頭`,
    );
  }
  return { week, eligible, born, noSire, alreadyThere, yearReset };
}
