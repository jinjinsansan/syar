/**
 * §8.6/§8.7 レース確定。★「公開すれば誰でも再計算できる」ことが要点。
 */
import { createHash, createHmac } from 'node:crypto';
import { commitServerSeed, type RaceEntrant } from '@star/race-engine';
import { describe, expect, it } from 'vitest';
import { settleRace } from '../src/settle.js';

const hash = {
  sha256: (m: string) => createHash('sha256').update(m, 'utf8').digest('hex'),
  hmacSha256: (k: string, m: string) => createHmac('sha256', k).update(m, 'utf8').digest('hex'),
};

const entrant = (id: string, gate: number): RaceEntrant => ({
  horseId: id,
  stats: { sp: 500, st: 500, pw: 500, gt: 500, iq: 500 },
  surfaceAptitude: { turf: 50, dirt: 50 },
  distanceCenter: 2000,
  distanceRange: 600,
  strategyAptitude: { nige: 50, senko: 50, sashi: 50, oikomi: 50 },
  heavyAptitude: 55,
  strategy: 'senko',
  condition: 3,
  fatigue: 0,
  weightKg: 55,
  gate,
  age: 4,
  skillGenes: [],
});

const conditions = {
  raceId: 'race-1',
  surface: 'turf' as const,
  distance: 2000,
  trackCondition: 'good' as const,
  courseShape: 'oval' as const,
  baseWeightKg: 55,
};

const input = {
  conditions,
  entrants: [entrant('H1', 1), entrant('H2', 2), entrant('H3', 3)],
  serverSeed: 'a'.repeat(64),
};

describe('★§8.6 確定は検証可能でなければならない', () => {
  it('★同じ入力からは必ず同じ着順（再計算できる）', () => {
    const a = settleRace(input, hash);
    const b = settleRace(input, hash);
    expect(b.order.map((o) => o.horseId)).toEqual(a.order.map((o) => o.horseId));
    expect(b.finalSeed).toBe(a.finalSeed);
  });

  it('★seed_reveal から commit を検証できる', () => {
    const r = settleRace(input, hash);
    expect(hash.sha256(r.seedReveal)).toBe(commitServerSeed(input.serverSeed, hash));
  });

  it('★server_seed が違えば着順が変わりうる（seed が結果に効いている）', () => {
    const a = settleRace(input, hash);
    const b = settleRace({ ...input, serverSeed: 'b'.repeat(64) }, hash);
    expect(b.finalSeed).not.toBe(a.finalSeed);
  });

  it('★レースが違えば final_seed が違う（同じ server_seed でも系列が分かれる）', () => {
    const a = settleRace(input, hash);
    const b = settleRace({ ...input, conditions: { ...conditions, raceId: 'race-2' } }, hash);
    expect(b.finalSeed).not.toBe(a.finalSeed);
  });

  it('★出走馬の並び順を変えても同じ結果（entropy はソート済み・I-ENTROPY-SORT）', () => {
    const a = settleRace(input, hash);
    const rev = { ...input, entrants: [...input.entrants].reverse() };
    // client_entropy は集合ハッシュなので final_seed は同じ
    expect(settleRace(rev, hash).finalSeed).toBe(a.finalSeed);
  });

  it('着順が 1..n の連番で重複しない', () => {
    const r = settleRace(input, hash);
    expect(r.order.map((o) => o.finishPosition)).toEqual([1, 2, 3]);
    expect(new Set(r.order.map((o) => o.horseId)).size).toBe(3);
  });

  it('出走馬0頭なら例外', () => {
    expect(() => settleRace({ ...input, entrants: [] }, hash)).toThrow(/0頭/);
  });
});
