/**
 * ★**相手を決める前の「選べない」**（★`damBlockOf` / `sireBlockOf`・第 2 便 B-1 / B-2・2026-09-23）
 *
 * 【★見ている壊れ方】
 *   🔴 ★画面が「選べる」と薄くしなかった母を、★確定のときに `canMate` が弾く（★判定が 2 つ）
 *   🔴 ★理想の相手の作り方が甘く、★**相手側の理由が漏れてくる**（★母の一覧に「父が若い」が出る）
 */
import { describe, it, expect } from 'vitest';
import { DEFAULT_BALANCE, canMate, damBlockOf, sireBlockOf, type MateCandidate } from '@star/sim-engine';

const YEAR = 100;
const B = DEFAULT_BALANCE;
const mare = (over: Partial<MateCandidate> = {}): MateCandidate => ({
  id: 'd1' as MateCandidate['id'],
  sex: 'female',
  birthYear: YEAR - B.MIN_BREEDING_AGE_YEARS,
  foalCount: 0,
  bredThisYear: false,
  coveringsThisYear: 0,
  g1Wins: 0,
  ...over,
});
const stud = (over: Partial<MateCandidate> = {}): MateCandidate => mare({ id: 's1' as MateCandidate['id'], sex: 'male', ...over });

describe('★相手を決める前の「選べない」', () => {
  it('★条件を満たす母は選べる（★null）', () => {
    expect(damBlockOf(mare(), B, YEAR)).toBe(null);
  });

  it('★母の 3 通り（★第 2 便 §8-7 の 4 つのうち、母に関わるもの）', () => {
    expect(damBlockOf(mare({ birthYear: YEAR - (B.MIN_BREEDING_AGE_YEARS - 1) }), B, YEAR)).toBe('dam_too_young');
    expect(damBlockOf(mare({ foalCount: B.MARE_LIFETIME_FOALS }), B, YEAR)).toBe('dam_lifetime_foals_exceeded');
    expect(damBlockOf(mare({ bredThisYear: true }), B, YEAR)).toBe('dam_already_bred_this_year');
  });

  it('★父の 2 通り', () => {
    expect(sireBlockOf(stud(), B, YEAR)).toBe(null);
    expect(sireBlockOf(stud({ birthYear: YEAR - (B.MIN_BREEDING_AGE_YEARS - 1) }), B, YEAR)).toBe('sire_too_young');
    expect(sireBlockOf(stud({ coveringsThisYear: B.STALLION_BASE_COVERINGS }), B, YEAR)).toBe('sire_coverings_exceeded');
  });

  /**
   * 🔴 ★**相手側の理由が漏れてこない**（★理想の相手が、相手側の条件をすべて満たしていること）。
   *   ★母を見ているのに「父が若い」「父の枠が尽きた」が返ったら、★一覧の見せ方が壊れる。
   */
  it('🔴 ★母を見たとき、父側の理由は 1 つも返らない', () => {
    const sireReasons = ['sire_not_male', 'sire_too_young', 'sire_coverings_exceeded', 'same_horse'];
    for (const over of [{}, { bredThisYear: true }, { foalCount: B.MARE_LIFETIME_FOALS },
      { birthYear: YEAR - 1 }, { coveringsThisYear: 999 }, { g1Wins: 0 }]) {
      const got = damBlockOf(mare(over), B, YEAR);
      expect(sireReasons, `★父側の理由が漏れた: ${String(got)}`).not.toContain(got);
    }
  });

  it('🔴 ★父を見たとき、母側の理由は 1 つも返らない', () => {
    const damReasons = ['dam_not_female', 'dam_too_young', 'dam_lifetime_foals_exceeded',
      'dam_already_bred_this_year', 'same_horse'];
    for (const over of [{}, { coveringsThisYear: 999 }, { birthYear: YEAR - 1 },
      { bredThisYear: true }, { foalCount: 999 }]) {
      const got = sireBlockOf(stud(over), B, YEAR);
      expect(damReasons, `★母側の理由が漏れた: ${String(got)}`).not.toContain(got);
    }
  });

  /**
   * 🔴 ★**一覧で通した組が、確定の `canMate` でも通る**（★判定が 2 つになっていない）。
   *   ★対照: ★片方が選べない組は `canMate` も弾く。
   */
  it('🔴 ★一覧で通した父母の組は、canMate でも通る（★対照つき）', () => {
    const okMare = mare();
    const okStud = stud();
    expect(damBlockOf(okMare, B, YEAR)).toBe(null);
    expect(sireBlockOf(okStud, B, YEAR)).toBe(null);
    expect(canMate(okStud, okMare, B, YEAR).ok).toBe(true);

    const ngMare = mare({ bredThisYear: true });
    expect(damBlockOf(ngMare, B, YEAR)).not.toBe(null);
    expect(canMate(okStud, ngMare, B, YEAR).ok).toBe(false);
  });
});
