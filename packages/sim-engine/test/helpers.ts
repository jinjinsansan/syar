/** テスト用の馬レコード生成ヘルパ（血統構造だけを組み立てたいときに使う） */

import { buildPedigreeCache } from '../src/inbreeding.js';
import type { Genotype, HorseId, HorseRecord, Sex } from '../src/types.js';

export function makeGenotype(value: number): Genotype {
  const pair = (v: number) => ({ a1: v, a2: v });
  return {
    sp: pair(value),
    st: pair(value),
    pw: pair(value),
    gt: pair(value),
    iq: pair(value),
    surface: { turf: pair(50), dirt: pair(50) },
    distance_center: pair(2000),
    distance_range: pair(600),
    strategy_bias: { a1: 'senko', a2: 'sashi' },
    growth: { a1: 'normal', a2: 'normal' },
    temper: pair(50),
    durability: pair(600),
    skill_genes: [],
  };
}

export class Herd {
  readonly horses = new Map<HorseId, HorseRecord>();

  readonly lookup = (id: HorseId): HorseRecord | undefined => this.horses.get(id);

  /**
   * 馬を1頭作って登録する。
   * 親を渡すと pedigree_cache を親から積み上げる（実装と同じ経路）。
   */
  add(
    id: HorseId,
    sex: Sex,
    sire: HorseRecord | null = null,
    dam: HorseRecord | null = null,
    opts: { ability?: number; birthYear?: number; inbreedCoeff?: number; depth?: number } = {},
  ): HorseRecord {
    const ability = opts.ability ?? 500;
    const horse: HorseRecord = {
      id,
      sex,
      generation: sire === null || dam === null ? 0 : 1 + Math.max(sire.generation, dam.generation),
      birthYear: opts.birthYear ?? 0,
      sireId: sire?.id ?? null,
      damId: dam?.id ?? null,
      sireLine: sire?.sireLine ?? 'LINE_A',
      damSireLine: dam?.sireLine ?? null,
      genotype: makeGenotype(ability),
      potential: { sp: ability, st: ability, pw: ability, gt: ability, iq: ability },
      stats: { sp: 0, st: 0, pw: 0, gt: 0, iq: 0 },
      unlockRate: 0.3,
      surfaceAptitude: { turf: 50, dirt: 50 },
      distanceCenter: 2000,
      distanceRange: 600,
      strategyAptitude: { nige: 30, senko: 85, sashi: 70, oikomi: 30 },
      growth: 'normal',
      temper: 50,
      durability: 600,
      injuryRateMult: 1,
      frail: false,
      skillGenes: [],
      inbreedCoeff: opts.inbreedCoeff ?? 0,
      nicksMultiplier: 1,
      pedigreeCache: buildPedigreeCache(sire, dam, opts.depth ?? 5),
      foalCount: 0,
      coveringsThisYear: 0,
      bredThisYear: false,
      g1Wins: 0,
      breedingRecord: null,
    };
    this.horses.set(id, horse);
    return horse;
  }

  /**
   * 「祖先 X から length 代下の子孫」を一直線に作る。各代の相手は無関係な新規馬。
   * 戻り値は末端の子孫（= X から見て length 代下）。
   */
  descendLine(
    prefix: string,
    ancestor: HorseRecord,
    length: number,
    sex: Sex = 'male',
  ): HorseRecord {
    let current = ancestor;
    for (let i = 0; i < length; i++) {
      const isLast = i === length - 1;
      const mate = this.add(`${prefix}_M${i}`, current.sex === 'male' ? 'female' : 'male');
      const sire = current.sex === 'male' ? current : mate;
      const dam = current.sex === 'male' ? mate : current;
      current = this.add(`${prefix}_G${i}`, isLast ? sex : 'male', sire, dam);
    }
    return current;
  }
}
