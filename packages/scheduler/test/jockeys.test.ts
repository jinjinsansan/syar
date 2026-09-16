/**
 * ★**騎手**（★GB-3・2026-09-16・指示書 `DEV_INSTRUCTIONS_GAME_BODY_1_20260916.md` §3-1）
 *
 * 【★見ている壊れ方】
 *   ① ★**この便で着順に効いてしまう**（★効果 0 の対照。★効かせる便まで 0 のまま）
 *   ② ★料金が PP に触れる／★賞金からの差し引きになる（★S-5・L-4 の近縁・D-105 ②）
 *   ③ ★凍結せず名簿を引き直す（★名簿を直した日に過去のレースが動く・D-055）
 *   ④ ★親密度が頭打ちにならない（★長く乗せた人だけが一方的に有利になる・D-077）
 */
import { describe, it, expect } from 'vitest';
import {
  JOCKEYS, JOCKEY_EFFECT, JOCKEY_BOND_MAX, JOCKEY_FEE_LEDGER_REASON,
  jockeyById, jockeyBondAfterRides, freezeJockey, entryCostEP,
} from '../src/index.js';

describe('★騎手（GB-3・D-105）', () => {
  it('① ★この便では着順に効かない（★効果は 0 で固定）', () => {
    expect(JOCKEY_EFFECT).toBe(0);
    /** ★凍結にも 0 が入る（★どの騎手でも同じ） */
    for (const j of JOCKEYS) expect(freezeJockey(j.id, 3).effect, j.name).toBe(0);
  });

  it('② ★名簿は架空の名前と EP の料金だけ（★PP も報酬率も持たない）', () => {
    expect(JOCKEYS.length).toBeGreaterThan(0);
    const ids = JOCKEYS.map((j) => j.id);
    expect(new Set(ids).size, '★id の重複').toBe(ids.length);
    for (const j of JOCKEYS) {
      expect(j.name.length, j.id).toBeGreaterThan(0);
      expect(j.feeEP, `${j.name} の料金`).toBeGreaterThan(0);
      /**
       * ★賞金からの差し引き（報酬率）を持たない — ★持てば「PP を払って勝ちやすさを買う」形になる。
       * ⚠️ ★**2026-09-16・第 4 便で `calm` が増えました**（★D-110 ②「暴走の抑え」）。
       *    ★この錨は ★**意図して付け替えたもの**です。★`calm` は 0〜1 の**順序の宣言**で、
       *    ★`race-engine` の `JOCKEY_CALM_EFFECT`・`RUNAWAY_BASE` が ★**どちらも 0** のあいだは着順に効きません
       *    （★対照は `apps/cli/test/jockey-window-no-effect.test.ts` が実際に判定を回して取ります）。
       */
      expect(Object.keys(j).sort()).toEqual(['calm', 'feeEP', 'id', 'name']);
      expect(j.calm, `${j.name} の抑え`).toBeGreaterThanOrEqual(0);
      expect(j.calm, `${j.name} の抑え`).toBeLessThanOrEqual(1);
    }
    /** ★記帳は EP の台帳の語（`0001_init.sql` の閉じた集合の 1 つ） */
    expect(['inflow', 'training', 'entry_fee', 'bet', 'refund', 'stud_fee']).toContain(JOCKEY_FEE_LEDGER_REASON);
    expect(JOCKEY_FEE_LEDGER_REASON).toBe('entry_fee');
  });

  it('③ ★出走登録で凍結する（★名簿を引き直さずに読める形）', () => {
    const j = JOCKEYS[0]!;
    const frozen = freezeJockey(j.id, 2);
    /** ⚠️ ★`calm` は第 4 便で増えた（★D-110 ④「凍結から介入の判定に渡す」・上の ② の註記と同じ理由） */
    expect(frozen).toEqual({ v: 1, jockeyId: j.id, name: j.name, feeEP: j.feeEP, bond: 2, effect: 0, calm: j.calm });
    /** ★凍結だけで確定に必要な値がそろう（★id から引き直さなくても名前と料金が分かる） */
    expect(frozen.name).toBe(j.name);
    expect(frozen.feeEP).toBe(j.feeEP);
    /** ★名簿にいない id は投げる（★黙って既定の騎手にしない・R-27） */
    expect(() => freezeJockey('j-unknown', 1)).toThrow(/名簿/);
    expect(jockeyById('j-unknown')).toBeUndefined();
  });

  it('④ ★親密度は早く頭打ち（★境界の両側・R-2）', () => {
    expect(jockeyBondAfterRides(0)).toBe(0);
    expect(jockeyBondAfterRides(1)).toBe(1);
    expect(jockeyBondAfterRides(JOCKEY_BOND_MAX - 1)).toBe(JOCKEY_BOND_MAX - 1);
    expect(jockeyBondAfterRides(JOCKEY_BOND_MAX)).toBe(JOCKEY_BOND_MAX);
    expect(jockeyBondAfterRides(JOCKEY_BOND_MAX + 1), '★上限を超えない').toBe(JOCKEY_BOND_MAX);
    expect(jockeyBondAfterRides(1000)).toBe(JOCKEY_BOND_MAX);
    expect(jockeyBondAfterRides(-3)).toBe(0);
  });

  it('⑤ ★出走 1 回の EP は「登録料 ＋ 騎手の料金」（★賞金には触れない）', () => {
    const frozen = freezeJockey(JOCKEYS[2]!.id, 1);
    expect(entryCostEP(200, frozen)).toBe(200 + frozen.feeEP);
    expect(entryCostEP(200, null), '★騎手を選ばなければ登録料だけ').toBe(200);
  });
});
