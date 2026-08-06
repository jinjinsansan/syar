/**
 * 測定条件が正典 §13.2/§13.3 と一致していること
 *
 * ★これらは**判定を通すために動かせる値**（LONGSHOT_RANKS を 3→5 にすれば V-6 が上がる、
 *   試行数を減らせば V-4 が動く、頭数分布を狭めれば勝率が機械的に上がる）。
 *   「理由付きの免除」にすると変えても何も落ちないので、**正典との一致を照合する**。
 *
 * ★較正定数と扱いが違う理由: 較正定数はゲームの挙動を決めるので振る舞いで守る（R-14）。
 *   測定条件は「どう測るか」なので、正典に固定して値照合で守るのが適切。
 *   R-14 は較正定数についての規則であって、文書化された測定条件の照合を禁じない。
 */

import { FIELD_SIZE } from '../src/race-field.js';
import { describe, expect, it } from 'vitest';
import * as MC from '../src/measurement.js';

describe('測定条件が正典と一致している（§13.2 / §13.3）', () => {
  it('V-6 は下位3ランクの平均で測る（D-022）', () => {
    expect(MC.LONGSHOT_RANKS).toBe(3);
  });

  it('人気推定の試行数は 500', () => {
    expect(MC.POPULARITY_TRIALS).toBe(500);
  });

  it('検証の母集団は 40世代 × 繁殖牝馬400頭', () => {
    expect(MC.POOL_GENERATIONS).toBe(40);
    expect(MC.POOL_MARES).toBe(400);
  });

  it('受け入れ判定は 6万レース × 4シード（正典 §13.3「シード固定で再現可能」）', () => {
    expect(MC.VERIFY_RACES).toBe(60_000);
    expect([...MC.VERIFY_SEEDS]).toEqual([42, 7, 2026, 31337]);
  });

  it('出走頭数は 8〜18頭（正典 §10.4）', () => {
    expect(FIELD_SIZE.MIN).toBe(8);
    expect(FIELD_SIZE.MAX).toBe(18);
  });
});
