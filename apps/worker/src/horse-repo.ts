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
export async function loadRaceablePool(
  client: pg.Client | pg.PoolClient,
  limit = 3000,
): Promise<HorseRecord[]> {
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
      where generation >= (select max(generation) - 2 from horses)
        and retired_at_week is null
        and owner_id is null
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
