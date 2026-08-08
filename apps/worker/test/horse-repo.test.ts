/**
 * §4.2 DB 行 → HorseRecord。
 *
 * ★「1列でも欠けたら例外」が要点です。既定値で埋めると
 *   **DB には正しく入っているのにレースでは能力が違う**が起きます。
 */
import { describe, expect, it } from 'vitest';
import { rowToHorse } from '../src/horse-repo.js';

const row = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'h1', sex: 'male', generation: 12, birth_year: 50,
  sire_id: 's1', dam_id: 'd1', sire_line: 'L-NPC01', dam_sire_line: 'L-NPC02',
  genotype: { sp: { a1: 700, a2: 640 } },
  potential: { sp: 700, st: 650, pw: 600, gt: 620, iq: 580 },
  stats: { sp: 210, st: 195, pw: 180, gt: 186, iq: 174 },
  unlock_rate: 0.3,
  surface_aptitude: { turf: 62, dirt: 41 },
  distance_center: 2100, distance_range: 580,
  strategy_aptitude: { nige: 40, senko: 60, sashi: 55, oikomi: 45 },
  heavy_aptitude: 58, growth: 'normal', temper: 52, durability: 625,
  frail: false, skill_genes: ['G_SPURT'],
  inbreed_coeff: 0.0287, nicks_multiplier: 1.05,
  pedigree_cache: { s1: [1], d1: [1] },
  foal_count: 0, g1_wins: 0,
  ...over,
});

describe('★§4.2 DB 往復で情報が失われない', () => {
  it('能力・適性がそのまま復元される', () => {
    const h = rowToHorse(row());
    expect(h.potential.sp).toBe(700);
    expect(h.stats.iq).toBe(174);
    expect(h.surfaceAptitude.turf).toBe(62);
    expect(h.strategyAptitude.senko).toBe(60);
    expect(h.heavyAptitude).toBe(58);
    expect(h.durability).toBe(625);
    expect(h.inbreedCoeff).toBeCloseTo(0.0287, 6);
  });

  it('★pedigree_cache が Map に戻る（近交係数の計算に要る）', () => {
    const h = rowToHorse(row());
    expect(h.pedigreeCache instanceof Map).toBe(true);
    expect(h.pedigreeCache.get('s1')).toEqual([1]);
  });

  it('★1列でも欠けたら例外（黙って既定値で埋めない）', () => {
    for (const k of ['potential', 'stats', 'surface_aptitude', 'heavy_aptitude', 'durability', 'sire_line']) {
      const r = row();
      delete r[k];
      expect(() => rowToHorse(r), `${k} が欠けている`).toThrow(new RegExp(k));
    }
  });

  it('★null も欠落として扱う（DB の null を 0 にしない）', () => {
    expect(() => rowToHorse(row({ heavy_aptitude: null }))).toThrow(/heavy_aptitude/);
    expect(() => rowToHorse(row({ durability: null }))).toThrow(/durability/);
  });

  it('親が無い馬（創始世代）は sire_id / dam_id が null で通る', () => {
    const h = rowToHorse(row({ sire_id: null, dam_id: null, dam_sire_line: null }));
    expect(h.sireId).toBeNull();
    expect(h.damId).toBeNull();
    expect(h.damSireLine).toBeNull();
  });

  it('数値が文字列で返っても数値になる（pg の bigint / numeric 対策）', () => {
    const h = rowToHorse(row({ generation: '12', heavy_aptitude: '58', inbreed_coeff: '0.0287' }));
    expect(h.generation).toBe(12);
    expect(h.heavyAptitude).toBe(58);
    expect(h.inbreedCoeff).toBeCloseTo(0.0287, 6);
  });
});
