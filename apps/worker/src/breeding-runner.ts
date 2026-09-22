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
 * 【✅ ★年の扱い — ★Q-5 は解けました（★2026-09-20・★本番を数えました）】
 *   ⚠️ ★`horses.birth_year` は ★**プリシードの年**、★`birth_week` は ★**ゲームの週**。★尺度が違います。
 *   ✔ ★**実測**（★本番 7,370 頭・読むだけ）:
 *     ★`birth_year - floor(birth_week/52)` … ★**最小 46 / 最大 46 / 平均 46.00**
 *     → ★★**ずれではなく、★全馬で同じ定数差**でした。★**変換できます。**
 *   ✅ ★だから ★**年齢は `birth_week` から引き**（★ここの `withGameYear`）、
 *     ★**保存する `birth_year` は、★既存の行と同じ尺度に合わせます**（★下の `yearOffset`）。
 *   🔴 ★差が定数でなければ ★**投げます**（★世界が既に混ざっている＝直してから動かす）。 */
import type pg from 'pg';

import type { BalanceConfig, HorseRecord, NameBlocklist, Stable } from '@star/sim-engine';
import {
  DEFAULT_BALANCE, DEFAULT_NAME_SHAPE, NPC_STABLES, Rng, applyMatingCounters, breed,
  generateHorseName, normalizeName,
} from '@star/sim-engine';
import { loadNameBlocklist } from '../../cli/src/name-blocklist.js';
import { buildSireAncestorIndex, pickSire, rankSires } from '@star/breeding';
import {
  LIFECYCLE_WEEKS, WEEKS_PER_YEAR, WEEK_MS, gameYearOf, requiredBroodmares, weekIndexAt,
} from '@star/scheduler';

import { rowToHorse } from './horse-repo.js';
import { isNameKeyConflict } from './player-naming.js';

/**
 * ★**NPC の仔の名前が一意違反で週を戻した回数**（★起動から・★メモリ上・再起動で 0）。
 *   ★警報の文に「何回目か」を出すため（★裁定 `REVIEW_I3_NAMING_VERDICT_20260922.md` §9）。
 */
let nameKeyConflictWeeks = 0;

/**
 * ★**誰を繁殖牝馬に上げるか**（★2026-09-20・裁定 ③ は ★**測ってから**決めます）。
 *   ⚠️ ★`top` / `weighted` は ★**系統を集中させるはず**です（★D-025 / D-026）。
 *     ★`tools/verify-pool-supply.mjs` が 3 通りを回して、★有効系統数を並べます。
 *   ⚠️ 🔴 ★**「成績」の代わりに素質の合計を使っています** — ★`horses` に戦績は
 *     ★`g1_wins` しか無く、★NPC はほぼ 0 だからです（★測る意味が出ません）。
 *     ★★**集中の強さを測るには、★いちばん効く軸で測るのが正しい**と判断しました。
 */
export type PromotionPolicy = 'random' | 'weighted' | 'top';

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
  /** ★名前を決められず見送った頭数（★予備の名前も使えなかった・PLAN I-3）。★1 以上なら週ごと投げる */
  readonly nameGaveUp: number;
  /** ★音節表から名前が決まらず、★予備の名前（接頭辞 ＋ ID の 6 文字）で産ませた頭数（★音節表を広げる合図） */
  readonly nameFallback: number;
  /** ★年の変わり目で年次カウンタを戻したか */
  readonly yearReset: boolean;
  /** ★生涯上限に達して繁殖から降ろした頭数 */
  readonly retiredFromBreeding: number;
  /** ★繁殖に上げた頭数 */
  readonly promoted: number;
}

/**
 * 🔴 ★**血統をたどるためだけの、★薄い記録**。
 *
 *   ★`calcInbreedCoefficient` は祖先を `lookup` でたどります（★深さ `PEDIGREE_DEPTH`）。
 *   ★祖先ぜんぶを完全な `HorseRecord` で読むと重いので、★**必要な列だけ**読みます。
 *   ⚠️ 🔴 ★**足りない列を既定値で埋めません。** ★`Proxy` で、★**想定外の列を読んだら投げます**。
 *     ★将来 別の列を見るようになったら、★**黙って間違えるのではなく落ちます**。
 */
/**
 * 🔴 ★**`genotype` も要ります**（★2026-09-20・★番人が教えてくれました）。
 *   ✔ ★現物: `packages/sim-engine/src/genetics.ts:212-217` — ★**§6.3 大物覚醒**は
 *     ★**5 代以内の祖先の `genotype`** を見て、★いちばん高いアレルを探します。
 *   → ★★「血統をたどるだけ」ではありませんでした。★**祖先の遺伝子まで読みます。**
 *   ⚠️ ★`Proxy` を置いていなければ、★`undefined.gt` で落ちるか、★**黙って 0 扱い**でした。
 *     ★★大物覚醒が静かに効かなくなります（★誰も気づきません）。
 */
const PEDIGREE_FIELDS: ReadonlySet<string> = new Set([
  'id', 'sireId', 'damId', 'inbreedCoeff', 'pedigreeCache', 'genotype',
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
    // 🔴 ★§6.3 大物覚醒が祖先の遺伝子を見ます（★上の註記）
    genotype: row['genotype'],
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
  return idAndSeedFromKey(`${sireId}|${damId}|${week}`);
}

/**
 * ★**鍵の文字列から、仔の id と種を決める**（★NPC の配合・プレイヤーの配合で共通）。
 *   ★鍵の作り方だけが経路ごとに違います（★NPC は「父・母・週」、★プレイヤーは要求 ID・裁定 §3）。
 */
export async function idAndSeedFromKey(key: string): Promise<{ id: string; seed: number }> {
  const { createHash } = await import('node:crypto');
  const h = createHash('sha256').update(key, 'utf8').digest('hex');
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

/** ★配合に要る列（★プレイヤーの配合も同じ列で親を読む） */
export const BREEDING_COLS = COLS;

/**
 * 🔴 ★**年次カウンタの列が読めていることを確かめてから、★年齢を `birth_week` から引く**（★G-3・Q-5）。
 *   ★`rowToHorse` は列が無ければ `0` / `false` に落とします（★他の呼び出し元のため）。
 *   → ★★**配合でそれを使うと、★判定が素通りします。** ★だから選んだことを確かめます。
 */
export function breedingRecordOf(row: Record<string, unknown>): HorseRecord {
  for (const k of ['bred_this_year', 'coverings_this_year', 'foal_count', 'birth_week']) {
    if (row[k] === undefined) {
      throw new Error(
        `breeding-runner: ${k} を選んでいません。`
          + '★この列が無いまま配合すると、★年 1 回・種付上限の判定が素通りします（G-3）',
      );
    }
  }
  return { ...rowToHorse(row), birthYear: gameYearOf(Number(row['birth_week'])) };
}

/**
 * 🔴 ★**保存する `birth_year` の尺度を、★世界から測ります**（★Q-5）。
 *   ★既存の行は ★`gameYearOf(birth_week) + 46` になっていました（★本番の実測）。
 *   ★**46 を書きません** — ★世界ごとに違いうるので、★**その場で数えます**。
 *   🔴 ★定数でなければ投げます（★min ≠ max ＝ ★既に混ざっている）。
 *   ★世界が空なら 0。
 */
export async function birthYearOffset(client: pg.ClientBase): Promise<number> {
  const offRow = (await client.query<{ mn: string | null; mx: string | null }>(
    'select min(birth_year - floor(birth_week/52.0))::int mn,'
      + ' max(birth_year - floor(birth_week/52.0))::int mx'
      + ' from horses where birth_week is not null',
  )).rows[0];
  const mn = offRow?.mn === null || offRow?.mn === undefined ? null : Number(offRow.mn);
  const mx = offRow?.mx === null || offRow?.mx === undefined ? null : Number(offRow.mx);
  if (mn !== null && mx !== null && mn !== mx) {
    throw new Error(
      `breeding-runner: ★birth_year の尺度が既に混ざっています（★差 ${mn}〜${mx}）。`
        + '★どちらに揃えるかを決めてから動かしてください（★Q-5）',
    );
  }
  return mn ?? 0;
}

/**
 * ★**祖先の薄い写し**を読む（★血統をたどるためだけ・`pedigreeOnlyRecord`）。
 *
 * 🔴 ★**DB の id でない鍵が来たら、★理由を添えて投げます**（★2026-09-21）。
 *   ✔ ★本番で起きたこと: ★`pedigree_cache` の鍵が ★**プリシードの id**（`NPC-F00195`）で、
 *     ★それを `uuid[]` として渡し ★**週送りごと落としました**
 *     （★`invalid input syntax for type uuid`・★配備を戻して復旧）。
 *   ★プレイヤーの配合も ★**この関門を通ります**（★裁定 §4・NPC 経路にだけ在る状態にしない）。
 *
 * 【★なぜ「先に形を見る」をやめたか】（★2026-09-21・★ 3 度目の直し）
 *   ⚠️ ★第 1 版: ★**「鍵は uuid であるべき」** → 🔴 ★`verify-pool-supply` の
 *     ★メモリ上の世界（★id が `NPC-24-019835`）を ★**壊れていないのに落としました**。
 *   ⚠️ ★第 2 版: ★**「鍵と馬の id は同じ家族」** → 🔴 ★その世界は ★**途中から混在します**
 *     （★先祖はプリシード id、★新しい仔は uuid）。★また落ちました。
 *   → ★★**形では判定できません。★正しい世界でも形は混ざります。**
 *
 * 【✅ ★本当の失敗は 1 つだけ】
 *   ★**DB が `::uuid[]` へのキャストを拒む**（★`invalid input syntax for type uuid`）。
 *   ★そのエラーは ★**原因が読めません**（★本番の週送りがこれで毎周 落ちました）。
 *   → ★**拒まれてから、★説明を添えて投げ直します。**
 *   ★★**偽陽性が原理的に出ません**（★DB が実際に拒んだときだけ）。
 */
export async function loadAncestorLookup(
  client: pg.ClientBase, records: readonly HorseRecord[],
): Promise<Map<string, HorseRecord>> {
  const ancestorIds = new Set<string>();
  for (const r of records) for (const a of r.pedigreeCache.keys()) ancestorIds.add(a);
  const light = new Map<string, HorseRecord>();
  if (ancestorIds.size === 0) return light;
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  let rows;
  try {
    rows = await client.query(
      'select id, sire_id, dam_id, inbreed_coeff, pedigree_cache, genotype from horses'
        + ' where id = any($1::uuid[])',
      [[...ancestorIds]],
    );
  } catch (e) {
    const bad = [...ancestorIds].filter((x) => !UUID_RE.test(x));
    if (bad.length > 0) {
      throw new Error(
        `breeding-runner: ★血統の鍵を DB が受け付けません（例 ${bad[0]}・${bad.length} 件）。`
          + '★`pedigree_cache` にプリシードの id が残っています。'
          + '★直し方: `npx tsx tools/repair-pedigree-cache.mjs --env <接続先>`'
          + `（★PEDIGREE-CACHE-IDS-NOT-DB-IDS）。★元のエラー: ${(e as Error).message}`,
      );
    }
    throw e;
  }
  for (const r of rows.rows) {
    light.set(String(r['id']), pedigreeOnlyRecord(r as Record<string, unknown>));
  }
  return light;
}

/**
 * ★**配合の相性表**（★§6.6・`0054` の `nicks`）。
 *   ⚠️ ★空でも `getNicksMultiplier` は 1 を返すので動きますが、★**世界の過去と食い違います**
 *     （★プリシードは表が在る前提で 50 世代 配合しています）。
 *   → ★`seed-world` が ★**プリシードと同じ表**を転記します。★ここはそれを読むだけです。
 */
export async function loadNicks(
  client: pg.ClientBase, onAlert: (message: string) => void,
): Promise<Map<string, number>> {
  const nicksRows = await client.query<{ sire_line: string; dam_sire_line: string; multiplier: string }>(
    'select sire_line, dam_sire_line, multiplier from nicks',
  );
  const nicks = new Map<string, number>(
    nicksRows.rows.map((r) => [`${r.sire_line}|${r.dam_sire_line}`, Number(r.multiplier)]),
  );
  if (nicks.size === 0) {
    onAlert('★相性表（nicks）が空です。★全組み合わせ 1.00 で配合します（★§6.6 の帯の下端）');
  }
  return nicks;
}

/**
 * 🔴 ★**その母が、その年にもう仔を持っているか**（★`horses` と ★`foal_drafts` の両方を数える）。
 *
 *   ★`bred_this_year` の印だけでは足りません（★2026-09-22・プレイヤーの配合を足すときに見つけました）:
 *   ★NPC の配合は ★**年の変わり目の週を処理するときに全馬の印を戻します**。
 *   ★プレイヤーがその週に配合した母の印も戻るので、★**同じ年にもう一度 産めてしまいます**。
 *   ★`unique (dam_id, birth_week)` は表ごとにしか効かず、★2 つの表をまたげません。
 *   → ★★**印ではなく、★その年の仔を数えます**（★両方の経路がこの条件を使う）。
 *   ★SQL の断片（`$damParam` と `$yearStartParam` を受ける）。★年の幅は 52 週（`WEEKS_PER_YEAR`）。
 *
 * 🔴 ★`withDrafts` は ★**`foal_drafts` が在るときだけ true** にします（★`hasFoalDrafts`）。
 *   ★移行 `0061` より前の DB（★いまの本番）で NPC の配合が ★**表が無いと言って落ちない**ためです
 *   （★0060 の前に配備して週送りを落とした形を繰り返さない）。
 *   ★表が無ければ下書きの仔も在りえないので、★判定の結果は同じです。
 */
export function damHasFoalInYearSql(
  damParam: string, yearStartParam: string,
  sources: { readonly horses: boolean; readonly drafts: boolean },
): string {
  const parts: string[] = [];
  /**
   * ⚠️ ★NPC の経路は ★`horses: false` で呼びます — ★いま入れたばかりの自分の仔を数えてしまうからです。
   *   ★NPC 同士の二重は、★従来どおり `unique (dam_id, birth_week)` と `bred_this_year` が止めます。
   */
  if (sources.horses) {
    parts.push(`exists (select 1 from horses f where f.dam_id = ${damParam}`
      + ` and f.birth_week >= ${yearStartParam} and f.birth_week < ${yearStartParam} + ${WEEKS_PER_YEAR})`);
  }
  if (sources.drafts) {
    parts.push(`exists (select 1 from foal_drafts d where d.dam_id = ${damParam}`
      + ` and d.birth_week >= ${yearStartParam} and d.birth_week < ${yearStartParam} + ${WEEKS_PER_YEAR})`);
  }
  return parts.length === 0 ? '(false)' : `(${parts.join(' or ')})`;
}

/**
 * ★**仔の名付けに要るもの**（★PLAN I-3・裁定 `REVIEW_I3_NAMING_VERDICT_20260922.md` §1・§3 段 0）。
 *
 *   ★`taken` … ★**全頭の名前を正規化した集合**（★世界の生成 `preseed.ts` と同じく、★使用済みの名前を避ける）。
 *     ★`name_key` がまだ埋まっていない行もあるので、★列ではなく ★`name` から `normalizeName` で作る。
 *   ★`blocked` / `version` … ★禁止名（実在馬名）の判定と、★その版。★ハッシュ表が無ければ素通しで ★`version = null`
 *     （★「検査していない」を行に残す・裁定 `ff7028c` §4）。
 *   ★`writeKey` … ★`horses.name_key`（★移行 `0064`）が在るか。★無い DB（★いまの本番）では列を書かない。
 */
export interface FoalNaming {
  readonly taken: Set<string>;
  readonly blocked: NameBlocklist;
  readonly version: string | null;
  readonly writeKey: boolean;
}

export async function loadFoalNaming(client: pg.ClientBase): Promise<FoalNaming> {
  const col = await client.query<{ n: string }>(
    "select count(*)::text n from information_schema.columns"
      + " where table_schema = 'public' and table_name = 'horses' and column_name = 'name_key'",
  );
  const names = await client.query<{ name: string }>('select name from horses');
  const ng = loadNameBlocklist(undefined, false);
  return {
    taken: new Set(names.rows.map((r) => normalizeName(r.name))),
    blocked: ng.blocklist,
    version: ng.version,
    writeKey: Number(col.rows[0]?.n ?? 0) > 0,
  };
}

/** ★`foal_drafts`（★移行 `0061`）が在るか */
export async function hasFoalDrafts(client: pg.ClientBase): Promise<boolean> {
  const r = await client.query<{ t: string | null }>("select to_regclass('public.foal_drafts')::text t");
  return r.rows[0]?.t !== null && r.rows[0]?.t !== undefined;
}

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
  /**
   * ✅ ★**`top` に確定**（★2026-09-21・レビュー側の裁定・★3 通りを 12 年 測った結果）。
   *   ★random 6.27 ／ weighted 6.16 ／ **top 6.26** — ★**3 通りとも有効系統数 5 以上**。
   *   ★裁定は「5 以上のうち★成績がいちばん効くもの」→ ★`top`。
   *   ⚠️ 🔴 ★**測る前の予想は外れました**: ★私は「top がいちばん系統が集中するはず」と
   *     ★書いていましたが、★`weighted` より**高く**出ました。★理由は測っていません。
   */
  policy: PromotionPolicy = 'top',
  /**
   * 🔴 ★**既定を置きません**（★2026-09-20・★私は一度 `= 12` と書いていました）。
   *   ★この数から ★**繁殖牝馬の頭数**が決まります（`requiredBroodmares`）。
   *   ✔ ★実測でそれが出ました: ★`12` だと繁殖牝馬 **624 頭**・現役は **1,872 頭**へ収束。
   *     ★★世界は「私が書いた 12」に向かって縮んでいました。
   *   ✅ ★正しい出どころは ★**`FIELD_SIZE`**（`apps/cli/src/race-field.ts`・★8〜18）。
   *     ★呼ぶ側が ★**そこから渡します**（★`main.ts`）。★ここで決めません。
   */
  meanFieldSize: number,
  /**
   * 🔴 ★**繁殖牝馬の目標頭数**（★2026-09-21・★正典に反していたので直しました）。
   *
   *   ⚠️ ★私は `requiredBroodmares(meanFieldSize)` を ★**目標**に使っていました（★676 頭）。
   *   🔴 ★しかし正典 §10.5 は ★**現役 2,500 / 種牡馬 200 / 繁殖牝馬 800** と ★**宣言**しています
   *     （★コードでは `DEFAULT_PRESEED_OPTIONS.mares`）。
   *   → ★★**`requiredBroodmares` は「下限」であって「目標」ではありません。**
   *     ★私の実装は、★世界を ★**正典の 800 から 676 へ縮めていました**
   *     （★実測: 現役も 2,400 → 2,028 へ）。
   *   ✅ ★目標は ★**宣言された数**から。★下限は ★**下回っていないかの確認**に使います。
   */
  broodmareTarget: number,
  /**
   * ★**名付けに要るものを外から渡す口**（★検査用。★省けば DB と NG リストから読む＝`loadFoalNaming`）。
   *   ★名前が決まらない場面（★音節表が尽きかけた）を ★検査で作るために置きました（★裁定 f117984 §5）。
   */
  namingOverride?: FoalNaming,
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
  /** ★保存する年 ＝ ゲームの年 ＋ 既存の行と同じずれ（★`birthYearOffset`・Q-5） */
  const yearOffset = await birthYearOffset(client);

  /**
   * 🔴 ★**尽きた牝馬を、★繁殖から降ろします**（★2026-09-20・裁定 ①）。
   *
   *   ✔ ★**測って見つけました**: ★6 年 回すと ★**週 312 で供給が止まりました**
   *     （★`canMate` の `dam.foalCount >= MARE_LIFETIME_FOALS`）。
   *   ✔ ★本番の実測: ★繁殖牝馬 800 頭の `foal_count` は 0〜7 に分布し、
   *     ★残りは Σ(8 − foal_count) ＝ **4,579 頭ぶん** ＝ ★**約 5.7 年で枯渇**。
   *   🔴 ★そして ★**尽きた牝馬は繁殖牝馬のまま枠を占め続けていました。**
   *     ★★役割の名前が実態と食い違ったまま枠を持つ ＝ ★**「引退済みなのに現役」4,970 頭と同じ形**。
   *   ✅ ★降ろした事実を残します（★`retirement_reason`）。★後から「なぜ功労馬か」が読めます。
   */
  /**
   * 🔴 ★**入れ替えは年の変わり目だけ**にします（★2026-09-20・★10 年 回して分かりました）。
   *
   * 【★毎週 入れ替えていたら、★供給が 5% 足りませんでした】
   *   ✔ ★実測（★10 年・立ち上がり 5 年を捨てて 5 年 測定）:
   *     ★出走年齢に達した **748/年** 対 ★引退 **785/年** → ★**−37/年（−4.7%）**。
   *     ★現役が 2,400 → **2,214** へ。★傾き −1.23 頭/週。
   *   🔴 ★原因: ★**年の途中で上げた牝馬は、★その年の「自分の番」が既に過ぎています。**
   *     ★→ ★その年は産めません。★枠は埋まっているのに、★産駒は出ません。
   *   ✅ ★**年の変わり目にまとめて入れ替えれば、★全頭が丸 1 年 在籍します。**
   * ⚠️ ★尽きた牝馬は年内も役割のまま残りますが、★`canMate` が弾くので産みません。
   *   → ★だから ★**枠の数え方は「まだ産める牝馬」**にします（★下の `have`）。
   */
  const atYearStart = gameYearOf(week - 1) !== year;
  const demoted = atYearStart ? await client.query(
    "update horses set retirement_role = 'honored',"
      + " retirement_reason = 'mare_lifetime_foals'"
      + " where retirement_role = 'broodmare' and foal_count >= $1",
    [balance.MARE_LIFETIME_FOALS],
  ) : { rowCount: 0 };
  const retiredFromBreeding = demoted.rowCount ?? 0;

  /**
   * 🔴 ★**空いた枠を埋めます**（★裁定 ②: ★数は導出する。★書かない）。
   *   ★`requiredBroodmares` ＝ 現役の必要数 ÷ 現役年数（★1 頭 年 1 産なので、これが同時必要数）。
   *   ★上げる相手は ★**引退した牝馬で、★まだ産める馬**（★功労馬から戻します）。
   *   ⚠️ ★誰を上げるかは `policy`。★**決め打ちせず、★測ってから決めます**（★裁定 ③）。
   */
  const target = broodmareTarget;
  /**
   * 🔴 ★**下限を下回っていたら警報**（★目標が小さすぎる ＝ 出走表が埋まらなくなる）。
   *   ⚠️ ★`requiredBroodmares` は ★**要る最小**です。★目標がそれを下回るなら、
   *     ★**宣言のほうが間違っている**可能性があります。★黙って進めません。
   */
  const floor = requiredBroodmares(meanFieldSize);
  if (target < floor) {
    onAlert(`★繁殖牝馬の目標 ${target} が、★要る最小 ${floor} を下回っています`
      + `（★平均出走頭数 ${meanFieldSize}）`);
  }
  const haveRow = await client.query<{ n: string }>(
    "select count(*)::text n from horses where retirement_role = 'broodmare' and owner_id is null"
      + ' and foal_count < $1',
    [balance.MARE_LIFETIME_FOALS],
  );
  const have = Number(haveRow.rows[0]?.n ?? 0);
  let promoted = 0;
  if (atYearStart && have < target) {
    const want = target - have;
    /**
     * ⚠️ ★**素質の合計**を「成績」の代わりに使います（★上の `PromotionPolicy` の註記）。
     *   ★`random` は ★**週から決まる並び**（★`Math.random()` を呼ばない・憲法 §1-4）。
     */
    const order = policy === 'random'
      ? "order by md5(id::text || $3::text)"
      : policy === 'top'
        ? "order by ability desc, id"
        : "order by md5(id::text || $3::text)::text, ability desc";
    const cand = await client.query<{ id: string }>(
      'select id, (select sum((value)::numeric) from jsonb_each_text(potential)) ability'
        + " from horses where retirement_role = 'honored' and sex = 'female' and owner_id is null"
        + ' and foal_count < $1 and retirement_reason <> $4'
        /**
         * 🔴 ★**産める年齢の馬だけ上げます**（★2026-09-20・★測って見つけました）。
         *   ✔ ★引退は ★**5 歳**（★`LIFECYCLE_WEEKS.retireAt` ＝ 260 週）。
         *   ✔ ★繁殖できるのは ★**6 歳から**（★`MIN_BREEDING_AGE_YEARS`）。
         *   → ★★**引退した直後の牝馬は、★1 年間 産めません。**
         *   ⚠️ ★上げてしまうと、★その枠は ★**1 年 空回り**します
         *     （★実測: ★週 310 で「相手あり 0 / 相手なし 15」— ★`canMate` が全部 弾いた）。
         */
        + ' and (($5::bigint - birth_week) / 52) >= $6'
        + ` ${order} limit $2`,
      [
        balance.MARE_LIFETIME_FOALS, want, String(week), 'mare_lifetime_foals',
        week, balance.MIN_BREEDING_AGE_YEARS,
      ],
    );
    if (cand.rowCount !== null && cand.rowCount > 0) {
      const up = await client.query(
        "update horses set retirement_role = 'broodmare' where id = any($1::uuid[])",
        [cand.rows.map((r) => r.id)],
      );
      promoted = up.rowCount ?? 0;
    }
    if (promoted < want) {
      onAlert(`★繁殖牝馬が足りません（要 ${target} / 在 ${have} / 上げられた ${promoted}）`);
    }
  }

  const yearReset = atYearStart;
  if (yearReset) {
    await client.query(
      'update horses set bred_this_year = false, coverings_this_year = 0'
        + ' where bred_this_year or coverings_this_year <> 0',
    );
  }

  /**
   * 🔴 ★**持ち主のいる馬は NPC の配合に使いません**（★裁定 `REVIEW_I1_RETIREMENT_ROLE_VERDICT_20260922.md` §2・Q-4）。
   *   ★母・種牡馬・補充・枠の数え方の 4 か所に `owner_id is null` を置きます。★どれか 1 つでも欠けると、
   *   ★**持ち主の馬の仔が、持ち主の居ない NPC 馬として生まれます**（照会 I-1 の F-4〜F-7）。
   *   ⚠️ ★持ち主の繁殖馬の配合は ★プレイヤーの配合（`player-breeding.ts`）の側で作ります。
   */
  const mareRows = await client.query<{ id: string }>(
    "select id from horses where retirement_role = 'broodmare' and owner_id is null order by id",
  );
  const mareIds = mareRows.rows.map((r) => r.id);
  if (mareIds.length === 0) {
    onAlert('★繁殖牝馬が 1 頭も居ません（★世界がまだ出来ていないか、★役割が付いていない）');
    return {
      week, eligible: 0, born: 0, noSire: 0, alreadyThere: 0, nameGaveUp: 0, nameFallback: 0, yearReset,
      retiredFromBreeding, promoted,
    };
  }
  /**
   * 🔴 ★**配合する週は、★馬ごとに固定します**（★2026-09-20・★測って直しました）。
   *
   * 【★最初は B-3 と同じ「順位」で配っていました。★それが壊れました】
   *   ★`strataOffsetWeeks(rank, size)` は ★**集合の中の順位**から週を決めます。
   *   ⚠️ ★繁殖牝馬は ★**毎週 入れ替わります**（★尽きた馬を降ろし、★新しい馬を上げる）。
   *   → ★★**集合が変わると順位が変わり、★同じ馬の「番」が毎週 動きます。**
   *   ✔ ★実測: ★週 310 で ★**15 頭 全部が「相手なし」**（★今年もう産んだ馬が、★また番に来た）。
   *   ✅ ★**馬の id から決めます。** ★集合が変わっても ★**その馬の番は動きません**。
   *   ⚠️ ★毎週きっかり 1/52 ではなくなります（★平均 15.4・散らばりあり）が、
   *     ★**年あたりの総数は変わりません**。★`verify-pool-supply` が釣り合いを見ます。
   */
  const dueIds: string[] = [];
  {
    const { createHash } = await import('node:crypto');
    const target = ((week % 52) + 52) % 52;
    for (const id of mareIds) {
      const h = createHash('sha256').update(`mare-week|${id}`, 'utf8').digest('hex');
      if (parseInt(h.slice(0, 8), 16) % 52 === target) dueIds.push(id);
    }
  }
  if (dueIds.length === 0) {
    return {
      week, eligible: 0, born: 0, noSire: 0, alreadyThere: 0, nameGaveUp: 0, nameFallback: 0, yearReset,
      retiredFromBreeding, promoted,
    };
  }

  /** ★年齢は ★**`birth_week` から**引きます（★`breedingRecordOf`・G-3・Q-5） */
  const withGameYear = breedingRecordOf;

  const mareResult = await client.query(
    `select ${COLS} from horses where id = any($1::uuid[]) and birth_week is not null`,
    [dueIds],
  );
  const mares = mareResult.rows.map((r) => ({
    record: withGameYear(r as Record<string, unknown>),
    stable: stableOfNumericId(r['npc_stable_id'] === null ? null : Number(r['npc_stable_id'])),
  }));

  const stallionResult = await client.query(
    `select ${COLS} from horses where retirement_role = 'stallion' and owner_id is null`
      + ' and birth_week is not null',
  );
  const stallions = stallionResult.rows.map((r) => withGameYear(r as Record<string, unknown>));
  const stallionStableOf = new Map<string, number | null>(
    stallionResult.rows.map((r) => [
      String(r['id']), r['npc_stable_id'] === null ? null : Number(r['npc_stable_id']),
    ]),
  );

  // ★祖先（★血統をたどるためだけの薄い写し・★鍵の関門は `loadAncestorLookup`）
  const light = await loadAncestorLookup(client, [...mares.map((m) => m.record), ...stallions]);
  const full = new Map<string, HorseRecord>();
  for (const m of mares) full.set(m.record.id, m.record);
  for (const s of stallions) full.set(s.id, s);
  const lookup = (id: string): HorseRecord | undefined => full.get(id) ?? light.get(id);

  const nicks = await loadNicks(client, onAlert);
  /** ★下書きの表（★`0061`）が在れば、★プレイヤーの配合と母を取り合わない判定に使う */
  const withDrafts = await hasFoalDrafts(client);
  /** ★仔の名付け（★PLAN I-3 段 0・★使用済みの名前・禁止名・`name_key` の列が在るか） */
  const naming = namingOverride ?? await loadFoalNaming(client);
  let nameGaveUp = 0;
  let nameFallback = 0;

  const ancestorIndex = buildSireAncestorIndex(stallions);
  const turnOf = new Map<string, number>();
  let eligible = 0;
  let born = 0;
  let noSire = 0;
  let alreadyThere = 0;

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
      birthYear: year + yearOffset,
      lookup,
      balance,
      nicks,
    });

    /**
     * ★**名前を付ける**（★PLAN I-3・裁定 `REVIEW_I3_NAMING_VERDICT_20260922.md` §1）。
     *   ★旧: `${stable.prefix}${foalId.slice(0, 6)}` — ★重複も禁止名も検査していなかった。
     *   ★新: ★世界の生成（`preseed.ts`）と同じ `generateHorseName`（★使用済みの名前・禁止名を避ける）。
     *   🔴 ★**名前の乱数は、★遺伝の乱数と別の流れ**（★鍵に `|name` を足す・★1 本の `Rng` を共有しない）。
     *     ★`breed()` の出力（名前以外の全形質）は ★名付けの前と 1 ビットも変わらない（★検査で釘付け）。
     *   🔴 ★上限回数まで引いても決まらなければ投げる関数です（★裁定 f117984 §5）:
     *     ★**見送らず、★旧来の形（接頭辞 ＋ ID の先頭 6 文字）を予備の名前として試します**。
     *     ★見送ると ★**その母はその年の仔を失います**（★NPC は各母を年 1 回、番の週にしか配合しない）。
     *     ★予備も重なった／禁止名に当たったときだけ見送り、★週の終わりで ★**止める側に倒します**（★下の判定）。
     *     ★予備を使った回数は ★`nameFallback` で数えます（★音節表を広げる合図）。
     */
    let foalName: string;
    try {
      const { seed: nameSeed } = await idAndSeedFromKey(`${sireId}|${mare.id}|${week}|name`);
      foalName = generateHorseName(
        new Rng(nameSeed), { ...DEFAULT_NAME_SHAPE, prefix: stable.prefix }, naming.taken, naming.blocked,
      ).name;
    } catch (e) {
      const spare = `${stable.prefix}${foalId.slice(0, 6)}`;
      const spareKey = normalizeName(spare);
      if (naming.taken.has(spareKey) || naming.blocked(spareKey)) {
        nameGaveUp += 1;
        onAlert(`🔴 ★仔の名前を決められず、★予備の名前も使えませんでした（★母 ${mare.id}・週 ${week}）: ${(e as Error).message}`);
        continue;
      }
      naming.taken.add(spareKey);
      foalName = spare;
      nameFallback += 1;
      onAlert(`★仔の名前が音節表から決まらず、★予備の名前 ${spare} で産ませました（★母 ${mare.id}・週 ${week}・★音節表を広げる合図）`);
    }
    /** ★`name_key` / `name_checked_with`（★移行 `0064`）は ★列が在るときだけ書く */
    const keyCols = naming.writeKey ? ', name_key, name_checked_with' : '';
    const keyVals = naming.writeKey ? ', $30, $31' : '';
    const keyParams = naming.writeKey ? [normalizeName(foalName), naming.version] : [];
    const ins = await client.query(
      `insert into horses (id, npc_stable_id, name, sex, birth_year, generation,
         sire_id, dam_id, sire_line, dam_sire_line, genotype, potential, stats, unlock_rate,
         surface_aptitude, distance_center, distance_range, strategy_aptitude, heavy_aptitude,
         growth, temper, durability, frail, skill_genes, inbreed_coeff, nicks_multiplier,
         pedigree_cache, foal_count, g1_wins, birth_week, last_processed_week${keyCols})
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,
               $23,$24,$25,$26,$27,0,0,$28,$29${keyVals})
       on conflict (dam_id, birth_week) do nothing`,
      [
        foalId, numericStableId(stable), foalName,
        foal.sex, year + yearOffset, foal.generation,
        sireId, mare.id, foal.sireLine, foal.damSireLine,
        JSON.stringify(foal.genotype), JSON.stringify(foal.potential), JSON.stringify(foal.stats),
        foal.unlockRate, JSON.stringify(foal.surfaceAptitude), foal.distanceCenter,
        foal.distanceRange, JSON.stringify(foal.strategyAptitude), foal.heavyAptitude,
        foal.growth, foal.temper, foal.durability, foal.frail,
        JSON.stringify(foal.skillGenes), foal.inbreedCoeff, foal.nicksMultiplier,
        JSON.stringify(Object.fromEntries(foal.pedigreeCache)),
        week, week + LIFECYCLE_WEEKS.trainableFrom,
        ...keyParams,
      ],
    );
    if (ins.rowCount === 0) { alreadyThere += 1; continue; }

    /**
     * 🔴 ★**母の印は「まだ取られていなければ」取ります**（★2026-09-22・プレイヤーの配合と共存するため）。
     *   ★この関数は母の行をロックせずに読みます（★呼ぶ側が取引を張らない配備）。
     *   ★読んだ後にプレイヤーの配合が同じ母で確定していたら、★**ここで 0 行になります**。
     *   → ★いま入れた仔を消して、★「既に居た」と数えます（★母は年 1 回・§6.7）。
     *   ⚠️ ★母 → 父 の順に書きます（★プレイヤーの配合もロックを 母 → 父 で取る・裁定 §1 条件 3）。
     */
    const claim = await client.query(
      'update horses set bred_this_year = true, foal_count = foal_count + 1'
        + ` where id = $1 and not bred_this_year and not ${damHasFoalInYearSql('$1', '$2', { horses: false, drafts: withDrafts })}`,
      [mare.id, year * WEEKS_PER_YEAR],
    );
    if (claim.rowCount === 0) {
      await client.query('delete from horses where id = $1', [foalId]);
      alreadyThere += 1;
      continue;
    }
    born += 1;

    // ★年次カウンタ（★G-3。★記録側の規則は `applyMatingCounters` が持っています）
    applyMatingCounters(sire, mare);
    await client.query(
      'update horses set coverings_this_year = coverings_this_year + 1 where id = $1', [sireId],
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
  /**
   * 🔴 ★**名前が決まらず見送った仔が居たら投げます**（★裁定 f117984 §5 ③・★同じ「止まったら投げる」の場所）。
   *   ★見送った母は ★その年の仔を失います。★警報だけでは読まれません（★上の註記の 3 日・6,066 レース）。
   *   ★週の取引ごと戻り（★`runBreedingCatchUp` が週ごとに張る）、★印が進まないので ★遅れの見張りが鳴ります。
   *   ⚠️ ★予備の名前がある限り、★ここに来るのは ★予備まで重なったときだけです。
   *   ⚠️ ★下の「供給が止まっています」より ★**先に**判定します（★全頭を見送ると両方が成り立ち、
   *     ★後ろだけが投げると ★原因が名前だと読めない・★検査で見つけた）。
   */
  if (nameGaveUp > 0) {
    throw new Error(
      `breeding-runner: ★仔の名前が決まらず ${nameGaveUp} 頭を見送りました（★週 ${week}・★予備の名前も使えず）。`
        + '★音節表（`NAME_SYLLABLES`）か音節数の上限を広げてください',
    );
  }
  if (mares.length > 0 && born === 0 && alreadyThere === 0) {
    throw new Error(
      'breeding-runner: ★供給が止まっています（POOL-SUPPLY）。'
        + `★週 ${week} / 割り当て ${mares.length} 頭 / 相手あり ${eligible} 頭`
        + ` / 相手なし ${noSire} 頭 / 生まれた 0 頭`,
    );
  }
  return {
    week, eligible, born, noSire, alreadyThere, nameGaveUp, nameFallback, yearReset, retiredFromBreeding, promoted,
  };
}

/**
 * 🔴 ★**遅れた週に、★予算の範囲で追いつく**（★簿 `BREEDING-ONLY-ONE-WEEK-PER-CYCLE`・2026-09-21）
 *
 * ============================================================================
 * 【🔴 ★何が壊れていたか】
 *   ★`main.ts` は ★`advanceTrainingWeeks` で ★**N 週 進め**、
 *   ★`runBreedingWeek` は ★**1 週だけ**配合していました。
 *   → ★★**歳は N 週ぶん取るのに、★仔は 1 週ぶんしか生まれません。**
 *   ✔ ★実際に起きています: ★2026-08-20〜09-02 の ★13 日 停止 ＝ 78 週。
 *     ★あのとき復旧していたら ★**77 週ぶんの仔が飛んでいました**。
 *
 * 【★なぜ「1 周に N 週」と決めないか（★レビュー側の裁定・2026-09-21）】
 *   ★1 週の費用は一定ではありません（★実測: 20 頭 19.2s ／ 13 頭 13.5s）。
 *   ★そして ★**VPS からの往復は測れていません**。★費用は環境で変わります。
 *   → ★★**時間で切ります**（`BREEDING_BUDGET_MS`）。★超えたら止め、★次の周へ持ち越す。
 *
 * 【★追いつけることは、★数で言えます】
 *   ★実時間では ★**`CYCLES_PER_WEEK` 周で 1 週**しか進みません。
 *   → ★1 周に 2 週 進めば必ず追いつきます。★予算はそれを満たす前提で置いています。
 *   🔴 ★**満たしているかは、★予算ではなく「遅れが縮んでいるか」で判定します**
 *     （★`main.ts` が ★N 周 続けて縮まなければ投げます）。
 *
 * 【⚠️ ★`startedFresh`（★印が無いとき）】
 *   🔴 ★`last_bred_week` が `null` ＝ ★**一度も配合していない**（★本番はいまこれ）。
 *   ★ここで 0 週目に遡ると ★**数百週ぶんが一度に生まれます**。
 *   → ★★**いまの週だけ**を配合して、★そこから印を始めます。
 *
 * 【★時計を注入します（★憲法 4）】
 *   ★`Date.now()` を呼びません。★経過は `budget.monotonicMs()` から取ります。
 *   → ★検査で ★**偽の時計**を渡して、★予算切れの枝を回せます。
 *
 * 【🔴 ★対照を 1 つ 埋めてあります】
 *   ★`runBreedingWeek` には ★**週ではなく `nowMs`** を渡す作りなので、
 *   ★ここで ★`epochMs + (w + 1) * WEEK_MS` を組み立てています。
 *   → ★★**組み立てがずれたら、★静かに別の週を配合します。**
 *     ★だから ★**返ってきた `r.week` が頼んだ `w` と同じか**を毎回 確かめ、★違えば投げます。
 * ============================================================================
 */
export interface BreedingCatchUpResult {
  readonly weeks: readonly number[];
  readonly target: number;
  readonly remaining: number;
  /** ★その週に割り当てられ、かつ相手が見つかった牡馬の合計 */
  readonly eligible: number;
  readonly born: number;
  readonly noSire: number;
  readonly alreadyThere: number;
  readonly yearResets: number;
  readonly stoppedByBudget: boolean;
  readonly startedFresh: boolean;
}

export interface BreedingBudget {
  readonly budgetMs: number;
  readonly monotonicMs: () => number;
}

export async function runBreedingCatchUp(
  client: pg.ClientBase,
  nowMs: number,
  epochMs: number,
  onAlert: (message: string) => void,
  balance: BalanceConfig | undefined,
  policy: PromotionPolicy,
  meanFieldSize: number,
  broodmareTarget: number,
  budget: BreedingBudget,
): Promise<BreedingCatchUpResult> {
  const target = weekIndexAt(nowMs, epochMs) - 1;
  const row = (await client.query<{ last_bred_week: string | null }>(
    'select last_bred_week from world_state where id = true',
  )).rows[0];
  if (row === undefined) {
    throw new Error('breeding-runner: world_state の行がありません（★週を書く側が先に走る前提です）');
  }
  const last = row.last_bred_week === null ? null : Number(row.last_bred_week);
  const startedFresh = last === null;
  const from = startedFresh ? target : last + 1;

  const weeks: number[] = [];
  let eligible = 0;
  let born = 0;
  let noSire = 0;
  let alreadyThere = 0;
  let yearResets = 0;
  let stoppedByBudget = false;

  const t0 = budget.monotonicMs();
  for (let w = from; w <= target; w += 1) {
    if (weeks.length > 0 && budget.monotonicMs() - t0 >= budget.budgetMs) {
      stoppedByBudget = true;
      break;
    }
    /**
     * 🔴 ★**1 週 ＝ 1 取引**（★2026-09-22・裁定 322d603 §4）。
     *   ★`runBreedingWeek` の「仔を入れる → 母の印を取る → 取れなければ消す」が ★取引の外だと、
     *   ★間でワーカーが落ちたとき ★仔だけ残って母の印が立たない（★生涯 8 産の上限が 1 つ緩む）／
     *   ★プレイヤーの下書きと NPC の仔が同じ母・同じ年に残る、の 2 つの窓がありました。
     *   ⚠️ ★`runBreedingWeek` 自身は取引に触りません（★`verify-breeding-live.mjs` が外から包んで必ず戻すため）。
     *   ⚠️ ★週の印（`last_bred_week`）は ★従来どおりループの後に 1 回だけ書きます（★検査 ③）。
     *     ★週の取引が確定した後・印を書く前に落ちても、★次の周が同じ週をやり直して `on conflict` で増えません。
     */
    await client.query('begin');
    let r: BreedingWeekResult;
    try {
      r = await runBreedingWeek(
        client, epochMs + (w + 1) * WEEK_MS, epochMs,
        onAlert, balance, policy, meanFieldSize, broodmareTarget,
      );
      await client.query('commit');
    } catch (e) {
      await client.query('rollback');
      /**
       * ★**馬名の一意違反で週を戻した**（★移行 `0066`・裁定 `REVIEW_I3_NAMING_VERDICT_20260922.md` §9）。
       *   ★次の周に使用済みの名前（`loadFoalNaming` の `taken`）を DB から読み直すので、★衝突した名前を避けて引き直す。
       *   ★セーブポイントの 1 頭の引き直しは入れない代わりに ★**数えて警報**（★黙ってやり直し続けない）。
       */
      if (isNameKeyConflict(e)) {
        nameKeyConflictWeeks += 1;
        onAlert(`★NPC の仔の名前が馬名の一意違反になり、★週 ${w} を戻しました`
          + `（★起動から ${nameKeyConflictWeeks} 回目・★次の周に名前を引き直します）`);
      }
      throw e;
    }
    if (r.week !== w) {
      throw new Error(
        `breeding-runner: ★週の組み立てがずれています（★頼んだ ${w} / 処理された ${r.week}）`,
      );
    }
    weeks.push(w);
    eligible += r.eligible;
    born += r.born;
    noSire += r.noSire;
    alreadyThere += r.alreadyThere;
    if (r.yearReset) yearResets += 1;
  }

  if (weeks.length > 0) {
    const upd = await client.query(
      'update world_state set last_bred_week = $1, updated_at = now() where id = true',
      [weeks[weeks.length - 1]],
    );
    if (upd.rowCount !== 1) {
      throw new Error(
        `breeding-runner: ★配合した週の印を書けませんでした（★${upd.rowCount} 行）。`
        + '★次の周が同じ週をやり直します',
      );
    }
  }

  const lastDone = weeks.length > 0 ? (weeks[weeks.length - 1] as number) : last;
  const remaining = lastDone === null ? 0 : Math.max(0, target - lastDone);
  return {
    weeks, target, remaining, eligible, born, noSire, alreadyThere,
    yearResets, stoppedByBudget, startedFresh,
  };
}
