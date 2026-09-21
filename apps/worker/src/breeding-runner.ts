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

import type { BalanceConfig, HorseRecord, Stable } from '@star/sim-engine';
import {
  DEFAULT_BALANCE, NPC_STABLES, applyMatingCounters, breed,
} from '@star/sim-engine';
import { buildSireAncestorIndex, pickSire, rankSires } from '@star/breeding';
import {
  LIFECYCLE_WEEKS, gameYearOf, requiredBroodmares, weekIndexAt,
} from '@star/scheduler';

import { rowToHorse } from './horse-repo.js';

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
  /**
   * 🔴 ★**保存する `birth_year` の尺度を、★世界から測ります**（★Q-5）。
   *   ★既存の行は ★`gameYearOf(birth_week) + 46` になっていました（★本番の実測）。
   *   ★**46 を書きません** — ★世界ごとに違いうるので、★**その場で数えます**。
   *   🔴 ★定数でなければ投げます（★min ≠ max ＝ ★既に混ざっている）。
   */
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
  /** ★保存する年 ＝ ゲームの年 ＋ 既存の行と同じずれ（★世界が空なら 0） */
  const yearOffset = mn ?? 0;

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
  const target = requiredBroodmares(meanFieldSize);
  const haveRow = await client.query<{ n: string }>(
    "select count(*)::text n from horses where retirement_role = 'broodmare'"
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
        + " from horses where retirement_role = 'honored' and sex = 'female'"
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

  const mareRows = await client.query<{ id: string }>(
    "select id from horses where retirement_role = 'broodmare' order by id",
  );
  const mareIds = mareRows.rows.map((r) => r.id);
  if (mareIds.length === 0) {
    onAlert('★繁殖牝馬が 1 頭も居ません（★世界がまだ出来ていないか、★役割が付いていない）');
    return {
      week, eligible: 0, born: 0, noSire: 0, alreadyThere: 0, yearReset,
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
      week, eligible: 0, born: 0, noSire: 0, alreadyThere: 0, yearReset,
      retiredFromBreeding, promoted,
    };
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
      'select id, sire_id, dam_id, inbreed_coeff, pedigree_cache, genotype from horses'
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

  /**
   * ★**配合の相性表**（★§6.6・`0054` の `nicks`）。
   *   ⚠️ ★空でも `getNicksMultiplier` は 1 を返すので動きますが、★**世界の過去と食い違います**
   *     （★プリシードは表が在る前提で 50 世代 配合しています）。
   *   → ★`seed-world` が ★**プリシードと同じ表**を転記します。★ここはそれを読むだけです。
   */
  const nicksRows = await client.query<{ sire_line: string; dam_sire_line: string; multiplier: string }>(
    'select sire_line, dam_sire_line, multiplier from nicks',
  );
  const nicks = new Map<string, number>(
    nicksRows.rows.map((r) => [`${r.sire_line}|${r.dam_sire_line}`, Number(r.multiplier)]),
  );
  if (nicks.size === 0) {
    onAlert('★相性表（nicks）が空です。★全組み合わせ 1.00 で配合します（★§6.6 の帯の下端）');
  }

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
      birthYear: year + yearOffset,
      lookup,
      balance,
      nicks,
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
        foal.sex, year + yearOffset, foal.generation,
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
  return { week, eligible, born, noSire, alreadyThere, yearReset, retiredFromBreeding, promoted };
}
