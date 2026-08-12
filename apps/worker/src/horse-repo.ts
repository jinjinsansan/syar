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
    `select * from horses
      where generation >= (select max(generation) - 2 from horses)
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
