/**
 * K-a: テストヘルパ `Herd.add()` が作るレコードが、本番の `expressPhenotype` の出力と
 *      **値として整合している**ことを固定する。
 *
 * 【なぜこの形なのか】
 *   M-3(e) の指摘は「`Herd` が `HorseRecord` をリテラルで組むため、`createFounder` /
 *   `expressPhenotype` が構築時点で全面バイパスされている」だった。
 *   ただし監査の追加指摘どおり、**「全フィールドが揃っていること」は TypeScript が既に
 *   保証しているので追加価値がほぼない**。実効があるのは**値の整合**である:
 *   ヘルパのレコードが本番の発現ロジックと食い違った値を持っていると、
 *   そのヘルパを使う4ファイルのテストが「本番ではありえない馬」を前提に緑になる。
 *
 * ⚠️ `strategyAptitude` は `STRATEGY_JITTER` による揺らぎがあるため厳密一致しない。
 *    ここでは**揺らぎ幅の内側にいること**を確認する（値の意味が同じであることの担保）。
 */

import { describe, expect, it } from 'vitest';
import { DEFAULT_BALANCE } from '../src/balance.js';
import { expressPhenotype } from '../src/phenotype.js';
import { Rng } from '../src/rng.js';
import { ABILITY_KEYS, STRATEGIES } from '../src/types.js';
import { Herd, makeGenotype } from './helpers.js';

describe('Herd.add() が本番の発現ロジックと値として整合していること（K-a）', () => {
  const balance = DEFAULT_BALANCE;

  it('素質値・非能力形質が expressPhenotype の出力と一致する（F=0・ニックス1.0）', () => {
    const herd = new Herd();
    const horse = herd.add('H1', 'male', null, null, { ability: 500 });

    const expressed = expressPhenotype(
      makeGenotype(500),
      { F: 0, nicksMultiplier: 1 },
      new Rng(1),
      balance,
    );

    // 素質値: 2アレルが同値なので DOMINANT_WEIGHT によらず素の値になる
    for (const key of ABILITY_KEYS) {
      expect(horse.potential[key], `potential.${key}`).toBe(expressed.potential[key]);
    }
    // 非能力形質
    expect(horse.surfaceAptitude).toEqual(expressed.surfaceAptitude);
    expect(horse.distanceCenter).toBe(expressed.distanceCenter);
    expect(horse.distanceRange).toBe(expressed.distanceRange);
    expect(horse.temper).toBe(expressed.temper);
    expect(horse.durability).toBe(expressed.durability);
    expect(horse.growth).toBe(expressed.growth);
    expect(horse.injuryRateMult).toBe(expressed.injuryRateMult);
    expect(horse.frail).toBe(expressed.frail);
  });

  it('strategyAptitude は揺らぎ幅の内側にある（厳密一致はしない）', () => {
    const herd = new Herd();
    const horse = herd.add('H1', 'male');
    const g = makeGenotype(500);
    const primary = g.strategy_bias.a1;
    const secondary = g.strategy_bias.a2;

    for (const s of STRATEGIES) {
      const base =
        s === primary
          ? balance.STRATEGY_PRIMARY
          : s === secondary
            ? balance.STRATEGY_SECONDARY
            : balance.STRATEGY_OTHER;
      const value = horse.strategyAptitude[s];
      expect(value, `${s} が揺らぎ幅の下限を割っている`).toBeGreaterThanOrEqual(
        Math.max(0, base - balance.STRATEGY_JITTER - 1),
      );
      expect(value, `${s} が揺らぎ幅の上限を超えている`).toBeLessThanOrEqual(
        Math.min(100, base + balance.STRATEGY_JITTER + 1),
      );
    }
  });

  it('ability を変えると potential も expressPhenotype と同じだけ動く', () => {
    const herd = new Herd();
    for (const ability of [300, 500, 800]) {
      const horse = herd.add(`H${ability}`, 'male', null, null, { ability });
      const expressed = expressPhenotype(
        makeGenotype(ability),
        { F: 0, nicksMultiplier: 1 },
        new Rng(1),
        balance,
      );
      for (const key of ABILITY_KEYS) {
        expect(horse.potential[key], `ability=${ability} の potential.${key}`).toBe(
          expressed.potential[key],
        );
      }
    }
  });

  it('★このテストが空振りしていないこと: makeGenotype を変えれば落ちる', () => {
    // makeGenotype の丈夫さ(600)とヘルパの durability(600) が一致していることが
    // 上のテストの前提。前提そのものを固定して、両方を同時に書き換えたときだけ緑になる状態を防ぐ
    const g = makeGenotype(500);
    expect(g.durability).toEqual({ a1: 600, a2: 600 });
    expect(g.temper).toEqual({ a1: 50, a2: 50 });
    expect(g.distance_center).toEqual({ a1: 2000, a2: 2000 });
  });
});
