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
