/**
 * ★**公示（announce）と組成（fill）が同じ馬場状態になるか**（★2026-09-19・**D-117**）
 *
 * ★D-117 で生成は 2 段に割れました。★`races.track_condition` は **not null** なので、
 *   ★出走馬が決まる**前**（公示）に馬場状態が 1 つ決まります。
 *
 * ★成立の根拠は `race-field.ts` の `drawRacePrefix` にあります:
 *   ★`Rng.int`/`pick`/`float` はどれも `float()` を**ちょうど 1 回**消費するので、
 *   ★母集団が違っても**引く位置は同じ**です（★`int` は棄却サンプリングではない）。
 *
 * ⚠️ ★この設計が壊れる道はひとつだけ:
 *    ★`generateRace` の **`drawRacePrefix` より前**に乱数を足すこと。
 *    ★このテストはその 1 点を見張ります。
 *
 * ★本番は ★**公示が書いた行の値を組成が読み直す**ので（D-052）、
 *   ★ここが赤くなっても「違う馬場で走る」ことにはなりません。
 *   ★赤が意味するのは「★公示が見せた馬場は、抽選が本来出すはずの馬場ではない」です。
 */
import { describe, expect, it } from 'vitest';
import { NICKS_GEN, deriveRng, type HorseRecord } from '@star/sim-engine';
import { announcedTrackCondition, generateRace, sortPoolByClass } from '../../cli/src/race-field.js';
import { resolveRuntimeConfig } from '../../cli/src/config.js';
import { runSimulation } from '../../cli/src/simulator.js';

/** ★`build-race.ts` の `STREAM.FIELD`。★あちらは非公開なので数だけ写します */
const STREAM_FIELD = 61;
const SEED = 20260919;

const { balance, founders } = resolveRuntimeConfig();
const ALL: readonly HorseRecord[] = sortPoolByClass(
  runSimulation(
    { seed: 11, generations: 6, population: 400, stallionPool: 60, v1Pairs: 1, v1Repeats: 5, retainFinalPopulation: true },
    balance, founders, NICKS_GEN,
  ).finalPopulation ?? [],
);

/**
 * ★**母集団の頭数を変える**ための切り出し。
 *   ★`fieldSize` は `rng.int(8, min(18, poolLen))` なので、★10 頭と 400 頭では**値の幅が違います**
 *   （span 3 と span 11）。★それでも消費数は 1 回きりなので、★馬場は一致するはずです。
 */
function slice(n: number): readonly HorseRecord[] {
  return sortPoolByClass(ALL.slice(0, n));
}

describe('D-117 公示と組成の馬場状態', () => {
  it('★母集団が 10 頭でも 400 頭でも、同じサイクル番号なら同じ馬場になる', () => {
    expect(ALL.length).toBeGreaterThanOrEqual(200); // ★母集団が空の緑にしない（R-21）
    const sizes = [10, 12, 200, Math.min(400, ALL.length)];
    let checked = 0;
    for (let idx = 0; idx < 120; idx += 1) {
      const announced = announcedTrackCondition(deriveRng(SEED, STREAM_FIELD, idx));
      for (const n of sizes) {
        const race = generateRace(slice(n), idx, deriveRng(SEED, STREAM_FIELD, idx));
        expect(race.conditions.trackCondition, `cycle ${idx} / pool ${n}`).toBe(announced);
        checked += 1;
      }
    }
    expect(checked).toBe(120 * sizes.length);
  });

  it('★頭数の「値」は母集団で実際に変わる（★上のテストが素通りでないことの対照）', () => {
    const small = new Set<number>();
    const large = new Set<number>();
    for (let idx = 0; idx < 60; idx += 1) {
      small.add(generateRace(slice(10), idx, deriveRng(SEED, STREAM_FIELD, idx)).entrants.length);
      large.add(generateRace(slice(200), idx, deriveRng(SEED, STREAM_FIELD, idx)).entrants.length);
    }
    // ★10 頭プールは 8〜10 頭、★200 頭プールは 8〜18 頭 — ★別の集合になる
    expect(Math.max(...small)).toBeLessThanOrEqual(10);
    expect(Math.max(...large)).toBeGreaterThan(10);
  });

  it('★4 通りの馬場が実際に出る（★always good の緑でないこと）', () => {
    const seen = new Set<string>();
    for (let idx = 0; idx < 3000; idx += 1) {
      seen.add(announcedTrackCondition(deriveRng(SEED, STREAM_FIELD, idx)));
    }
    expect([...seen].sort()).toEqual(['bad', 'good', 'soft', 'yielding']);
  });

  it('★公示済みの馬場を渡すと、それがそのまま出る（★抽選は引いてから捨てる）', () => {
    const p = slice(200);
    // ★上書き無しの結果（★対照）
    expect(generateRace(p, 5, deriveRng(SEED, STREAM_FIELD, 5)).conditions.trackCondition)
      .toBe(announcedTrackCondition(deriveRng(SEED, STREAM_FIELD, 5)));

    for (const forced of ['good', 'yielding', 'soft', 'bad'] as const) {
      const race = generateRace(p, 5, deriveRng(SEED, STREAM_FIELD, 5), undefined, undefined, undefined, {
        programme: { surface: 'turf', distance: 1600, courseShape: 'oval', trackCondition: forced },
      });
      expect(race.conditions.trackCondition).toBe(forced);
    }
  });

  it('★馬場を上書きしても出走馬は変わらない（★乱数の並びを動かしていないこと）', () => {
    const p = slice(200);
    const base = generateRace(p, 11, deriveRng(SEED, STREAM_FIELD, 11), undefined, undefined, undefined, {
      programme: { surface: 'turf', distance: 1600, courseShape: 'oval' },
    });
    const forced = generateRace(p, 11, deriveRng(SEED, STREAM_FIELD, 11), undefined, undefined, undefined, {
      programme: { surface: 'turf', distance: 1600, courseShape: 'oval', trackCondition: 'bad' },
    });
    expect(base.entrants.length).toBeGreaterThan(0);
    expect(forced.entrants.map((e) => e.horseId)).toEqual(base.entrants.map((e) => e.horseId));
    expect(forced.entrants.map((e) => e.gate)).toEqual(base.entrants.map((e) => e.gate));
    expect(forced.entrants.map((e) => e.strategy)).toEqual(base.entrants.map((e) => e.strategy));
    // ★上書き前は 'bad' ではなかった（★同じ値を比べて緑にしていない）
    expect(base.conditions.trackCondition).not.toBe('bad');
  });
});
