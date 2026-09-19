/**
 * DB の馬を `HorseRecord` に戻す（正典 §4.2）
 *
 * 【★較正済みロジックを複製しない】
 *   出走馬の構成（クラス帯・能力レンジの床・オーバーサンプル）は
 *   `apps/cli/src/race-field.ts` で P1 に較正済みです。
 *   ワーカー用に書き直すと**2つ目の置き場**ができ、片方だけ更新されます（L-2）。
 *   → DB から読んだ行を `HorseRecord` に戻し、**既存の `generateRace` にそのまま渡します**。
 *
 * ⚠️ ここで型を組み立てる以上、**列の取りこぼしが起きうる**点に注意。
 *    取りこぼすと「DB には正しく入っているのにレースでは能力が違う」ことが起きます。
 *    → `assertComplete` で必須項目の欠落を検出します。
 */

import type pg from 'pg';
import type { HorseRecord } from '@star/sim-engine';

/** DB 行 → HorseRecord。★1列でも欠けたら例外（黙って既定値で埋めない） */
export function rowToHorse(row: Record<string, unknown>): HorseRecord {
  const need = <T>(k: string): T => {
    const v = row[k];
    if (v === null || v === undefined) {
      throw new Error(`rowToHorse: ${k} が欠けています（黙って既定値で埋めません）`);
    }
    return v as T;
  };
  return {
    id: need<string>('id'),
    sex: need<'male' | 'female'>('sex'),
    generation: Number(need<number>('generation')),
    birthYear: Number(need<number>('birth_year')),
    sireId: (row['sire_id'] as string | null) ?? null,
    damId: (row['dam_id'] as string | null) ?? null,
    sireLine: need<string>('sire_line'),
    damSireLine: (row['dam_sire_line'] as string | null) ?? null,
    genotype: need('genotype'),
    potential: need('potential'),
    stats: need('stats'),
    unlockRate: Number(need<number>('unlock_rate')),
    surfaceAptitude: need('surface_aptitude'),
    distanceCenter: Number(need<number>('distance_center')),
    distanceRange: Number(need<number>('distance_range')),
    strategyAptitude: need('strategy_aptitude'),
    heavyAptitude: Number(need<number>('heavy_aptitude')),
    growth: need('growth'),
    temper: Number(need<number>('temper')),
    durability: Number(need<number>('durability')),
    injuryRateMult: 1,
    frail: Boolean(row['frail']),
    skillGenes: need('skill_genes'),
    inbreedCoeff: Number(need<number>('inbreed_coeff')),
    nicksMultiplier: Number(need<number>('nicks_multiplier')),
    pedigreeCache: new Map(Object.entries((row['pedigree_cache'] as Record<string, number[]>) ?? {})),
    foalCount: Number(row['foal_count'] ?? 0),
    coveringsThisYear: 0,
    bredThisYear: false,
    g1Wins: Number(row['g1_wins'] ?? 0),
    breedingRecord: null,
  } as HorseRecord;
}

/**
 * 出走可能な馬を読む。
 *
 * ★現役だけを対象にする。繁殖に上がった馬や祖先まで含めると、
 *   出走表に「もう走らない馬」が混ざります。
 */
/**
 * ★**NPC の出走表を埋めるための集合**（★**PO-4**・2026-09-19 に測って言い直しました）。
 *
 * 【🔴 ★旧の註記は「現役が 2 つある」と書いていました。★測ったら、そうではありません】
 *   ★① ここ … `generation >= max(generation) - 2 and retired_at_week is null and owner_id is null`
 *   ★② `market-flow` … `owner_id is null and npc_stable_id is not null and retired_at_week is null`
 *   ✔ ★staging の実測（2026-09-19）: ★**① = 4,389 頭 / ② = 7,333 頭**・★差 **2,944 頭**（★② の 40.1%）。
 *   ✔ ★**差の内訳を数えました**: ★**2,944 / 2,944 が「世代が古いだけ」**。
 *     ★`npc_stable_id` による差は ★**0 頭**（★① にいて ② にいない馬は 1 頭もいない）。
 *   → ★★**差はまるごと `generation` の 1 行**です。
 *
 * 【✅ ★「現役」は 1 つです ＝ `retired_at_week is null`】
 *   ✔ ★正典 §7.1 の寿命に照らして確かめました: ★`raceableFrom 104` ≦ 齢 < ★`retireAt 260`。
 *     ★staging の NPC の齢は ★**188〜221 週**（★全世代で同じ範囲）→ ★**7,333 頭すべてが現役**です。
 *   ★`retired_at_week` を書くのは `training-runner.ts` **1 か所だけ**なので、
 *     ★引退の規則（齢・`CAREER_RACE_LIMIT` 24 戦）は**すでにその列に畳まれて**います（D-052）。
 *   → ★★**② が「現役」です。① は現役の述語ではありません。**
 *
 * 【★では ① の `generation` は何か ＝ **能力の帯**（D-018）の話】
 *   ★新しい世代ほど遺伝的に強いので、★第 0 世代と第 7 世代を混ぜると ★**帯が広がり V-4 が壊れます**。
 *   → ★① は「引退したか」ではなく ★**「どの世代から埋めるか」**を言っています。★名前が誤解を生みます。
 *   ⚠️ ✔ ★**`birth_week` は全頭 `-160` です**（★世代によらず同じ・実測）。
 *      → ★この行が外しているのは ★**「歳を取った馬」ではなく「遺伝的に前の世代の馬」**です。
 *
 * 【★市場が ② で売っているのは矛盾しません】
 *   ✔ ★買われた瞬間 `owner_id` が入る → ★NPC プールから外れる → ★`enter_race` で走ります。
 *   ✔ ★`enter_race` は ★**世代を見ていません**（★`0051` の本文に `generation` は **0 回**・実測）。
 *   → ★**第 2 世代の馬を売っても「走れない馬を売った」ことにはなりません。**
 *
 * 🔴 ⚠️ ★**それでも ① を ② に揃えるのは、この便ではしません。**
 *    ★揃えると ★**出走馬の顔ぶれが変わり**、★V-4・V-5・V-6 の取り直しが要ります。
 *    ★**AL-11 の便**（`RACEABLE_POOL_LIMIT` の 3,000 と一緒に）で 1 回だけ測ります。
 *    ★そのとき見るべき副作用: ★プールが 4,389 → 7,333 になると ★**上級条件の枯渇（CC-4）が緩む**かもしれません。
 */
export const RACEABLE_WHERE = `generation >= (select max(generation) - 2 from horses)
        and retired_at_week is null
        and owner_id is null`;

/**
 * ★**「現役」そのもの**（★**PO-4** の答え・★2026-09-19）。★上から `generation` の 1 行を外したもの。
 *
 * ⚠️ 🔴 ★**本番はこれを使っていません。** ★`loadRaceablePool` の既定は `RACEABLE_WHERE` のままです。
 *    ★これは ★**AL-11 の便で「揃えたらどうなるか」を測るための口**で、
 *    ★`tools/export-pool.mjs --predicate active` が明示的に渡したときだけ効きます
 *    （★`fieldSizeRange`・`mustInclude` と同じ作法 — ★**既定では絶対に効かせない**）。
 * ✔ ★実測（staging・2026-09-19）: ★`RACEABLE_WHERE` 4,389 頭 / ★こちら 7,333 頭。
 */
export const ACTIVE_WHERE = `retired_at_week is null
        and owner_id is null`;

/**
 * ★**1 回に読む上限**。
 *
 * 🔴 ⚠️ ★**2026-09-19 時点で、これは黙って切っています**（★**PO-2**）。
 *   ✔ ★staging の実測: ★条件に合うのは **4,389 頭**、★読むのは **3,000 頭** →
 *     ★★**1,389 頭（32%）が一度も出走表に載りません。**
 *   ⚠️ ★`order by id` なので ★**毎回おなじ 1,389 頭**です（★「たまたま今日出なかった」ではない）。
 * → ★**この便では値を変えません** — ★上げると ★**出走馬の顔ぶれが変わり**、
 *   ★V-4・V-5・V-6 の取り直しが要ります（★裁定: **AL-11 と D-117 の便に合流。三度測らない**）。
 * → ★**代わりに、切ったことを黙らないようにしました**（★下の `onTruncated`）。
 */
export const RACEABLE_POOL_LIMIT = 3000;

export async function loadRaceablePool(
  client: pg.Client | pg.PoolClient,
  limit = RACEABLE_POOL_LIMIT,
  /**
   * ★**上限で切ったときに呼ばれます**（★**PO-2**・★黙らせない）。
   * ⚠️ ★渡さなくても動きますが、★**渡さないと「1,389 頭が走れない」ことが誰にも見えません**。
   */
  onTruncated?: (eligible: number, used: number) => void,
  /**
   * ★**出走できる馬の述語**（★**PO-4 ①**・2026-09-19 に既定を差し替えました）。
   *
   * 【★何が変わったか】
   *   ★旧の既定 … `RACEABLE_WHERE`（★`generation >= max-2` を含む）
   *   ✅ ★新の既定 … ★**`ACTIVE_WHERE`**（★`retired_at_week is null and owner_id is null` だけ）
   *
   * 【★採った理由 — ★V ではありません】
   *   🔴 ★**`generation` は「現役」を意味していませんでした**（★PO-4）。
   *   ✔ ★差 2,944 頭は ★**まるごと `generation` の 1 行**（★`npc_stable_id` による差は 0 頭）。
   *   ✔ ★`birth_week` は**全頭 −160**なので、★この行が外していたのは
   *     ★**「歳を取った馬」ではなく「遺伝的に前の世代の馬」**でした。
   *   ✔ ★正典 §7.1 に照らすと、★`raceableFrom 104` ≦ 齢（188〜221 週）< `retireAt 260` で
   *     ★**7,333 頭すべてが現役**です。
   *
   * 【★V は壊れないことを確かめてから入れました（★VP-9・8 シード × 120,000 レース）】
   *   ✔ ★入れた後の姿 ＝ ★**D**（`ACTIVE_WHERE` ＋ 上限 3,000）: ★**V-4 31.006%・下限まで 6.9 SE・PASS**。
   *   ⚠️ 🔴 ★**「V は動かない」とは言えません**（★A→D は **2.04σ**）。
   *      ★言えるのは ★**「入れた結果 D になった」**までです。
   *   🔴 ★**以後の前後比較は D が基準**です（★A ではありません）。
   *
   * ⚠️ ★`RACEABLE_WHERE` は ★**測定用に残してあります**（`export-pool.mjs --predicate raceable`）。
   *    ★渡してよいのは ★**このファイルが export している述語だけ**です。★SQL をここに書き起こさないこと（D-052）。
   */
  where: string = ACTIVE_WHERE,
): Promise<HorseRecord[]> {
  /**
   * ★**先に数えます**（★R-21: 0 件を「該当なし」と読まない・★切れたことを見えるようにする）。
   * ⚠️ ★`where` は ★**`RACEABLE_WHERE` の 1 か所**から引きます（★2 か所に書くとずれます・D-052）。
   */
  if (onTruncated !== undefined) {
    const cnt = await client.query<{ n: string }>(
      `select count(*)::text as n from horses where ${where}`,
    );
    const eligible = Number(cnt.rows[0]!.n);
    if (eligible > limit) onTruncated(eligible, limit);
  }
  const r = await client.query(
    /**
     * 🔴 ★**`retired_at_week is null` を 2026-09-18 に足しました**（★CL-3 の便）。
     *
     *   ★上の註記は「**現役だけを対象にする**」と書いていましたが、★**SQL がそれを見ていませんでした**
     *   （✔ Q-SETUP-05 の裁定 §4 が「註釈と実装が食い違っている・クラス分けの便でまとめて直す」と指示）。
     *   ✔ ★**実害を先に数えました**（★裁定 §4 の「便の冒頭で数えてから直す」）:
     *     ★staging で**読み込む 3,000 頭のうち 19 頭が引退済み**（★プール条件に合う 4,414 頭では 25 頭）。
     *   → ★**引退した馬が出走表に載りうる状態**でした（★D-111 ⑥ は「登録の後に引退した馬」を塞ぎましたが、
     *     ★こちらは**生成の側**です）。
     *
     * ⚠️ ★**出走馬の顔ぶれが変わります** → ★V-4・V-5・V-6・V-18 の取り直しは **CL-6** に含まれます。
     *
     * 🔴 ★**`owner_id is null` を 2026-09-19 に足しました**（★**EN-1**・裁定
     *   ★`REVIEW_ENTRY_GUARDS_VERDICT_20260919.md`）。
     *
     *   🔴 ★**所有馬が生成プールに入っていました** —
     *     ★**登録していない自分の馬が、窓に選ばれて勝手にレースに出ます**
     *     （★料金も脚質も騎手も無し）。★そのあと本人が登録しても、
     *     ★`enter_race` の冇等の早期 return がその行を返すだけです。
     *
     *   ★★**正典 1318 行**: 「1レース 8〜18頭。★プレイヤー馬を優先し、★**残りを NPC 馬で充填**」
     *   → ★**充填の側は NPC だけ**です。★D-117（登録 → 生成 の順序）を直した後も、
     *     ★**ここが NPC 専用であるのは正しい形**です（★捨て仕事になりません）。
     *
     *   ✔ ★**実害を先に数えました**: ★staging で ★**所有馬 0 頭**。
     *     → ★**行の集合が 1 頭も変わらない**ので、★V-4/V-5/V-6 の取り直しは要りません。
     *     🔴 ★**1 頭でもできた翻日には、取り直しが要る作業に化けます**（★`/setup` を繋いだ今日が期限でした）。
     */
    `select * from horses
      where ${where}
      order by id
      limit $1`,
    [limit],
  );
  if (r.rows.length === 0) {
    // ★空のまま進むと「出走馬0のレース」ができる。黙って続けない
    throw new Error('loadRaceablePool: 出走可能な馬が0頭です（プリシードが未投入の可能性）');
  }
  return r.rows.map(rowToHorse);
}

/**
 * ★**id を名指しで馬を読む**（★2026-09-19・**D-117 DS-2**）。
 *
 * 【★なぜ別に要るか】
 *   ★`loadRaceablePool` は ★**NPC だけ**（`owner_id is null`）を返します。★それは正しい形です —
 *   ★充填に使う集合だからです。★ところが ★**登録した馬はプレイヤーの馬**なので、そこにいません。
 *   → ★組成のときに ★**名指しで読みます**。
 *
 * ⚠️ ★**引けなかった id があれば投げます**（R-21・R-16）。
 *    ★黙って落とすと「登録できたのに走らない馬」になり、★料金だけ取られます。
 * ⚠️ ★世代・引退・所有では**絞りません**。★資格は `enter_race` が登録の時点で見ており、
 *    ★登録の後に引退した馬は `entry-freeze` が取消にします（D-111 ③）。
 *    ★ここで重ねて絞ると、★**どちらが落としたのか分からなくなります**。
 */
export async function loadHorsesByIds(
  client: pg.Client | pg.PoolClient,
  ids: readonly string[],
): Promise<HorseRecord[]> {
  if (ids.length === 0) return [];
  const r = await client.query<Record<string, unknown>>(
    `select * from horses where id = any($1::uuid[]) order by id`,
    [ids],
  );
  if (r.rows.length !== ids.length) {
    const got = new Set(r.rows.map((x) => String(x['id'])));
    const missing = ids.filter((i) => !got.has(i));
    throw new Error(
      `loadHorsesByIds: ${missing.length} 頭が引けません（${missing.slice(0, 3).join(', ')}…）`
        + '★登録した馬が horses にありません（D-117 DS-2）',
    );
  }
  return r.rows.map(rowToHorse);
}

/**
 * ★B-6（D-050）: 出走馬の調子・疲労を DB から読む（0010 の列）。
 *
 * 【なぜ `HorseRecord` に入れないか】
 *   `HorseRecord` は `sim-engine` の**遺伝の記録**です。調子・疲労は育成の状態なので、
 *   そこに混ぜると「遺伝エンジンが育成を知っている」形になります。
 *   → **別の表**として返し、`generateRace` に渡します。
 *
 * 【★全馬を返します（2026-08-12 に直しました）】
 *   最初は「週送りを通していない馬は**返さない**。呼ぶ側が §7.4 の中央値に落とす。
 *   ここで 3/0 を作ると『実データがある馬』と『無い馬』が区別できなくなる」
 *   という理由で絞っていました。**その判断が乖離を作っていました。**
 *
 *   返さないと、生成側は `rng.int(2, 4)` に落ちます。ところが確定側
 *   （`pg-store.settleRace`）は **DB の列**を読み、そこには既定値 3 が入っています。
 *   → **生成側と確定側で調子が違う**。Q-P3-32 と同じ型です。
 *   ★実測: 本番で「育成状態が無い馬 224頭」となり、その全頭が乖離していました。
 *
 *   → **確定側が読む値をそのまま返します。** 区別が要るなら
 *     `last_processed_week` を見れば分かるので、ここで絞る理由はありません。
 */
export async function loadTrainingStates(
  client: pg.Client | pg.PoolClient,
): Promise<Map<string, { condition: number; fatigue: number }>> {
  const r = await client.query<{ id: string; condition: string | number; fatigue: string | number }>(
    `select id, condition, fatigue from horses`,
  );
  const out = new Map<string, { condition: number; fatigue: number }>();
  for (const row of r.rows) {
    const condition = Number(row.condition);
    const fatigue = Number(row.fatigue);
    // ★numeric は文字列で返る。数値にならないものを黙って通さない
    if (!Number.isFinite(condition) || !Number.isFinite(fatigue)) {
      throw new Error(`loadTrainingStates: 馬 ${row.id} の調子・疲労が数値として読めません`);
    }
    out.set(row.id, { condition, fatigue });
  }
  return out;
}

/**
 * ★**馬ごとの勝利数を読む**（★CL-1・指示書 `DEV_INSTRUCTIONS_RACE_CLASS_20260918.md`）。
 *
 * 【★なぜ表から数えるのか】
 *   ⚠️ ★**`horses` に勝利数の列はありません**（✔ `0001_init.sql:138` の `g1_wins` は **G1 勝利数のみ**）。
 *   → ★`race_entries` の **`finish_pos = 1`** を数えます（★CL-1 の指示どおり）。
 *   ★**確定した行だけが数に入ります** — ★`finish_pos` が書かれるのは確定時の 1 か所だけで
 *     （`pg-store.ts:459`）、★登録しただけの行・取消の行（`0028` の `scratched_at`）は
 *     ★`finish_pos` が null のままなので、★**自動的に除かれます**（★`0031` と同じ根拠）。
 *
 * ⚠️ ★**重ければ列にする**、と指示書にあります。★いまは 1 レースあたり 1 回の集計で足ります
 *    （★周に 1 回だけ読み、その周のすべてのレース生成で使い回します）。
 */
export async function loadWinsByHorse(
  client: pg.Client | pg.PoolClient,
): Promise<Map<string, number>> {
  const r = await client.query<{ horse_id: string; wins: string }>(
    `select horse_id, count(*) as wins
       from race_entries
      where finish_pos = 1
      group by horse_id`,
  );
  const out = new Map<string, number>();
  for (const row of r.rows) out.set(row.horse_id, Number(row.wins));
  return out;
}
