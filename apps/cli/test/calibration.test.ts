/**
 * O-4: 較正定数と K-4 の是正を**経路で**固定する
 *
 * 【なぜ必要か】
 *   P1 提出時、次の改変がすべて `npm test` 196/196 全緑のまま通った:
 *     - クラス係数を適用経路から外す（V-2d が実際に FAIL するのに）
 *     - 素質開放率の幅 0.55–0.85 → 0.30–0.95
 *     - クラス幅 6% → 100%（クラス分け撤廃）
 *     - CALIBRATED_RACE_RANDOM_K 0.26 → 0.12
 *     - 母集団を能力順に並べない
 *   テストが純関数しか見ておらず、**本番経路で効いているか**を誰も確認していなかった。
 *   I-3 / I-4 / L-1 と同じ構造の4度目（R-1）。
 *
 * 【設計方針】
 *   較正の正しさそのもの（V-4 が 30〜34% に入るか）は 10万レースが要るのでここでは測れない。
 *   代わりに **「較正を成立させている前提が壊れていないこと」** を、
 *   短時間で観測できる中間量（レース内スコアCV・出走馬の能力幅・賞金のクラス依存）で固定する。
 *   前提が壊れれば較正も壊れる、という関係を明示的に書く。
 */

import { NICKS_GEN, deriveRng } from '@star/sim-engine';
import { CALIBRATED_RACE_RANDOM_K, DEFAULT_RACE_BALANCE, resolveRace } from '@star/race-engine';
import { describe, expect, it } from 'vitest';
import { resolveRuntimeConfig } from '../src/config.js';
import {
  DEFAULT_CLASS_BAND,
  OFF_SURFACE_ENTRY_RATE,
  PLACEHOLDER_UNLOCK,
  generateRace,
  sortPoolByClass,
} from '../src/race-field.js';
import { emptyCareer, runSeason, type CareerRecord } from '../src/racing-season.js';
import { runSimulation } from '../src/simulator.js';
import { coefficientOfVariation, mean } from '../src/stats.js';

const B = DEFAULT_RACE_BALANCE;

/** 小さめの母集団を1回だけ作って使い回す（テスト時間を抑える） */
function makePool() {
  const { balance, founders } = resolveRuntimeConfig();
  const sim = runSimulation(
    {
      seed: 42,
      generations: 10,
      population: 240,
      stallionPool: 72,
      v1Pairs: 1,
      v1Repeats: 5,
      retainFinalPopulation: true,
    },
    balance,
    founders,
    NICKS_GEN,
  );
  return sortPoolByClass(sim.finalPopulation ?? []);
}

const POOL = makePool();

describe('O-4 較正定数が正典・較正条件と一致している', () => {
  it('RACE_RANDOM_K は正典 §13.1（D-016）の 0.26', () => {
    expect(CALIBRATED_RACE_RANDOM_K).toBe(0.26);
    // ★二重管理を作らない: DEFAULT は較正値を参照しているだけであること
    expect(B.RACE_RANDOM_K).toBe(CALIBRATED_RACE_RANDOM_K);
  });

  it('素質開放率のプレースホルダは 0.55〜0.85（正典 §13.1 の較正条件）', () => {
    expect(PLACEHOLDER_UNLOCK.MIN).toBe(0.55);
    expect(PLACEHOLDER_UNLOCK.MAX).toBe(0.85);
  });

  it('クラス幅は 6%（正典 §10.4・D-018 の較正条件）', () => {
    expect(DEFAULT_CLASS_BAND).toBe(0.06);
  });

  it('不向きな馬場への出走率は 15%（K-4 の是正値）', () => {
    expect(OFF_SURFACE_ENTRY_RATE).toBe(0.15);
  });
});

describe('O-4 ★経路: 較正条件が出走表に実際に効いている', () => {
  it('現在値が potential × 0.55〜0.85 の範囲に入り、両端に届く', () => {
    const rng = deriveRng(1, 11);
    const ratios: number[] = [];
    for (let i = 0; i < 60; i++) {
      const race = generateRace(POOL, i, rng);
      for (const e of race.entrants) {
        const horse = POOL.find((h) => h.id === e.horseId);
        if (horse === undefined) continue;
        ratios.push(e.stats.sp / horse.potential.sp);
      }
    }
    expect(ratios.length).toBeGreaterThan(400);
    const lo = Math.min(...ratios.slice(0, 400));
    const hi = Math.max(...ratios.slice(0, 400));
    // ★幅を広げる改変（0.30–0.95）を入れるとここが破れる
    expect(lo).toBeGreaterThanOrEqual(PLACEHOLDER_UNLOCK.MIN - 1e-9);
    expect(hi).toBeLessThanOrEqual(PLACEHOLDER_UNLOCK.MAX + 1e-9);
    // 両端に十分近づいている（範囲を狭める改変も検出する・R-2）
    expect(lo).toBeLessThan(PLACEHOLDER_UNLOCK.MIN + 0.02);
    expect(hi).toBeGreaterThan(PLACEHOLDER_UNLOCK.MAX - 0.02);
  });

  it('クラス分けが効いており、1レース内の能力幅が狭い', () => {
    const rng = deriveRng(2, 11);
    const spreads: number[] = [];
    for (let i = 0; i < 60; i++) {
      const race = generateRace(POOL, i, rng);
      const totals = race.entrants.map((e) =>
        Object.values(e.stats).reduce((a, b) => a + b, 0),
      );
      spreads.push(Math.max(...totals) / Math.min(...totals));
    }
    const avg = mean(spreads);
    // ★クラス分けを撤廃（幅100%）すると最強/最弱の比が跳ね上がる。
    //   6% 帯では概ね 1.6 倍以内に収まる（実測 1.4 前後）
    expect(avg, `1レース内の能力比の平均 ${avg}`).toBeLessThan(1.7);
  });

  it('母集団が能力順に並んでいる（並んでいないとクラス分けが無意味になる）', () => {
    const totals = POOL.map((h) =>
      Object.values(h.potential).reduce((a: number, b: number) => a + b, 0),
    );
    for (let i = 1; i < totals.length; i++) {
      expect(totals[i - 1] ?? 0).toBeLessThanOrEqual(totals[i] ?? 0);
    }
  });

  it('★較正の前提: レース内スコアCV が K と同程度に収まっている', () => {
    // V-4（1番人気の勝率 30〜34%）は「実力差 ÷ 乱数」で決まる。
    // 実力差(CV) が K に対して大きすぎると堅く、小さすぎると荒れる。
    // 較正時の実測は CV ≒ 0.17 / K = 0.26。ここが大きく動いたら V-4 も動く。
    const rng = deriveRng(3, 11);
    const cvs: number[] = [];
    for (let i = 0; i < 60; i++) {
      const race = generateRace(POOL, i, rng);
      const r = resolveRace({
        conditions: race.conditions,
        entrants: race.entrants,
        seed: 1,
        balance: B,
      });
      cvs.push(coefficientOfVariation(r.order.map((o) => o.breakdown.score)));
    }
    const cv = mean(cvs);
    expect(cv, `レース内スコアCV ${cv}`).toBeGreaterThan(0.1);
    expect(cv, `レース内スコアCV ${cv}`).toBeLessThan(0.26);
  });
});

describe('O-4 ★経路: クラス係数が runSeason で実際に賞金へ掛かっている', () => {
  it('上位クラスの馬ほど1走あたりの賞金が大きい', () => {
    const careers = new Map<string, CareerRecord>();
    runSeason(POOL, careers, deriveRng(4, 7), 6);

    // 母集団の上位25% と下位25% で「1走あたり賞金」を比べる
    const q = Math.floor(POOL.length / 4);
    const bottom = POOL.slice(0, q);
    const top = POOL.slice(POOL.length - q);
    const perStart = (ids: readonly { id: string }[]): number => {
      const vals: number[] = [];
      for (const h of ids) {
        const c = careers.get(h.id) ?? emptyCareer();
        if (c.starts > 0) vals.push(c.prize / c.starts);
      }
      return mean(vals);
    };
    const topPrize = perStart(top);
    const bottomPrize = perStart(bottom);

    expect(topPrize).toBeGreaterThan(0);
    expect(bottomPrize).toBeGreaterThan(0);
    // ★クラス係数を外すと、上位も下位も「自分のクラスで戦う」ので1走あたり賞金がほぼ同じになる。
    //   係数が効いていれば上位は桁違いに大きい（最上級40倍・指数）
    const ratio = topPrize / bottomPrize;
    expect(ratio, `上位25% ÷ 下位25% の1走あたり賞金 = ${ratio}`).toBeGreaterThan(4);
  });

  it('出走していない馬は賞金0（走らずに種牡馬になる経路を作らない）', () => {
    const careers = new Map<string, CareerRecord>();
    runSeason(POOL.slice(0, 20), careers, deriveRng(5, 7), 2);
    for (const h of POOL.slice(100, 120)) {
      const c = careers.get(h.id);
      expect(c === undefined || c.starts === 0).toBe(true);
    }
  });

  it('母集団が8頭未満なら開催しない（正典 §10.4 の下限）', () => {
    const careers = new Map<string, CareerRecord>();
    runSeason(POOL.slice(0, 7), careers, deriveRng(6, 7), 4);
    expect(careers.size).toBe(0);
  });
});
