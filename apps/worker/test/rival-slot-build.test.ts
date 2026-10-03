/**
 * ★**ライバル枠の結線**（★正典 D-131・`buildRace` の `rivals`・裁定 `REVIEW_D126_D131_MINIMAL_VERDICT_20261003.md` §4・§8・§9）。
 *
 * 【★見ていること】
 *   ① ★働かないとき（★窓の外・★ペースの上限）は ★出走表が 1 ビットも変わらない（★MI-1 と同じ約束）
 *   ② ★窓に居れば ★p（0.6）前後の割合で入り、★入れた馬は `viaRival` に載る
 *   ③ ★クラスを跨がせない（★勝利数の段が違えば入れない・オーナー決定「追いついたら当たる」）
 *   ④ ★利用者の登録を押し出さない（★席が埋まっていれば入れない）
 */
import { describe, expect, it } from 'vitest';
import { NICKS_GEN, type HorseRecord } from '@star/sim-engine';
import { FIELD_SIZE, sortPoolByClass } from '../../cli/src/race-field.js';
import { resolveRuntimeConfig } from '../../cli/src/config.js';
import { runSimulation } from '../../cli/src/simulator.js';
import { buildRace, type BuiltRace } from '../src/build-race.js';

const SEED = 20261003;
const { balance, founders } = resolveRuntimeConfig();
const ALL: readonly HorseRecord[] = sortPoolByClass(
  runSimulation(
    { seed: 11, generations: 6, population: 400, stallionPool: 60, v1Pairs: 1, v1Repeats: 5, retainFinalPopulation: true },
    balance, founders, NICKS_GEN,
  ).finalPopulation ?? [],
);
const USER = ALL[0]!;
/** ★素質の最上位（★帯の窓にはほとんど入らない ＝ 入ったら枠のおかげと分かる） */
const RIVAL = ALL[ALL.length - 1]!;
const POOL = ALL.slice(1);

const build = (i: number, o: { rivalWins?: number; rivalStarts?: number; users?: readonly HorseRecord[]; rivals?: boolean }): BuiltRace =>
  buildRace(
    POOL, i, SEED, 20, undefined, undefined,
    { raceClass: 'maiden', winsOf: (h) => (h.id === RIVAL.id ? (o.rivalWins ?? 0) : 0) },
    o.users ?? [USER],
    o.rivals === false ? undefined : {
      pairs: [{ userHorseId: USER.id, rival: RIVAL, rivalStarts: o.rivalStarts ?? 0, rivalActiveWeeks: 78 }],
      startsPerCareer: 26,
    },
  );
const has = (b: BuiltRace, id: string): boolean => b.entrants.some((e) => e.horseId === id);
const CYCLES = 120;

describe('★ライバル枠（D-131）', () => {
  it('① ★窓の外なら 出走表は 1 ビットも変わらない（★枠の材料を渡さない場合と丸ごと一致）', () => {
    for (let i = 0; i < 40; i += 1) {
      const a = build(i, { rivalWins: 3 });
      // ★比べる相手も 同じ勝利数（★ライバルは POOL にも居るので 勝利数が違うと 資格の層そのものが変わる）
      const b = build(i, { rivalWins: 3, rivals: false });
      expect(JSON.stringify(a.entrants), `cycle ${i}`).toBe(JSON.stringify(b.entrants));
      expect(a.viaRival).toEqual([]);
    }
  });

  it('② ★窓に居れば p 前後で入り、★入れた馬は viaRival に載る', () => {
    let inRace = 0;
    let natural = 0;
    for (let i = 0; i < CYCLES; i += 1) {
      const b = build(i, {});
      if (has(b, RIVAL.id)) inRace += 1;
      expect(b.viaRival.length === 1, `cycle ${i}: 入ったのに印が無い／入らないのに印がある`).toBe(has(b, RIVAL.id) && b.viaRival[0] === RIVAL.id);
      if (has(build(i, { rivals: false }), RIVAL.id)) natural += 1;
    }
    // ★対照: ★枠が無ければ 最上位の馬はほとんど入らない
    expect(natural / CYCLES).toBeLessThan(0.1);
    expect(inRace / CYCLES).toBeGreaterThan(0.45);
    expect(inRace / CYCLES).toBeLessThan(0.75);
  });

  it('★対照: ★ペースの上限に届いていれば 入らない（★出走表も 1 ビットも変わらない）', () => {
    for (let i = 0; i < 40; i += 1) {
      const a = build(i, { rivalStarts: 1000 });
      expect(a.viaRival).toEqual([]);
      expect(JSON.stringify(a.entrants)).toBe(JSON.stringify(build(i, { rivals: false }).entrants));
    }
  });

  it('③ ★クラスを跨がせない（★ライバルが 1 勝なら 未勝利のレースに入れない）', () => {
    for (let i = 0; i < CYCLES; i += 1) expect(build(i, { rivalWins: 1 }).viaRival).toEqual([]);
  });

  it('④ ★席が利用者の登録で埋まっていれば 入れない（★押し出さない）', () => {
    const users = [USER, ...POOL.slice(0, FIELD_SIZE.MAX - 1)];
    expect(users.length).toBe(FIELD_SIZE.MAX);
    for (let i = 0; i < 20; i += 1) {
      const b = build(i, { users });
      expect(b.viaRival).toEqual([]);
      for (const u of users) expect(has(b, u.id), `cycle ${i}: 登録が外れた`).toBe(true);
    }
  });
});
