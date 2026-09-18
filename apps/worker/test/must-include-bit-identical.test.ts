/**
 * ★**MI-1**: ★`mustInclude` が空のとき、★**1 ビットも変わらない**
 * （★2026-09-19・**D-117 DS-2**・裁定 `REVIEW_MUSTINCLUDE_VERDICT_20260919.md`）
 *
 * 【🔴 ★なぜこの検査が (b) の価値そのものなのか】
 *   ★案は 3 つありました:
 *     (a) 登録馬を含めた帯から残りを引く（★帯が広がる）
 *     ✅ **(b) 登録馬を先に入れ、残りは従来どおりの帯から引く**
 *     (c) 帯の中心を登録馬へ寄せる
 *
 *   ★いま ★**プレイヤーは 0 人**です → ★**すべてのレースが「プレイヤー馬のいないレース」**。
 *   ★(b) なら ★**その種のレースは 1 ビットも変わらない** →
 *   ★★**D-117 後の V の取り直しは「合格/不合格」ではなく「★基準値と完全一致するか」という強い検査**になります。
 *   ★(a)(c) だと「動いた理由が 2 つ（D-117 の作り直し ＋ 帯の変更）」で、★切り分けられません。
 *
 *   → ★★**その「1 ビットも変わらない」を、口ではなく機械に言わせます。**
 *
 * 【★何を比べるか】
 *   ★`generateRace` の返り値を ★**丸ごと JSON で**比べます（★出走馬・枠・脚質・能力・条件すべて）。
 *   ★一部の列だけ比べると、★比べていない列が動いても緑になります。
 */
import { describe, expect, it } from 'vitest';
import { NICKS_GEN, deriveRng, type HorseRecord } from '@star/sim-engine';
import { FIELD_SIZE, generateRace, sortPoolByClass } from '../../cli/src/race-field.js';
import { resolveRuntimeConfig } from '../../cli/src/config.js';
import { runSimulation } from '../../cli/src/simulator.js';

const STREAM_FIELD = 61;
const SEED = 20260919;

const { balance, founders } = resolveRuntimeConfig();
const ALL: readonly HorseRecord[] = sortPoolByClass(
  runSimulation(
    { seed: 11, generations: 6, population: 400, stallionPool: 60, v1Pairs: 1, v1Repeats: 5, retainFinalPopulation: true },
    balance, founders, NICKS_GEN,
  ).finalPopulation ?? [],
);

/** ★`generateRace` の返り値を丸ごと文字列にする（★一部だけ比べない） */
function whole(i: number, opts: Parameters<typeof generateRace>[6]): string {
  return JSON.stringify(generateRace(ALL, i, deriveRng(SEED, STREAM_FIELD, i), undefined, undefined, undefined, opts));
}

describe('MI-1 mustInclude が空なら 1 ビットも変わらない', () => {
  /**
   * ⚠️ ★`mustInclude: undefined` は**型が通りません**（`exactOptionalPropertyTypes`）。
   *    ★`build-race.ts` も `... === undefined ? {} : { mustInclude }` で渡さない形にしています。
   *    → ★比べるのは ★**「渡さない」と「空配列」**の 2 つです。
   */
  it('★渡さない ≡ `[]`（★300 レース・返り値を丸ごと比較）', () => {
    let checked = 0;
    for (let i = 0; i < 300; i += 1) {
      expect(whole(i, { mustInclude: [] }), `cycle ${i}`).toBe(whole(i, {}));
      checked += 1;
    }
    expect(checked).toBe(300); // ★R-21: 0 件の緑にしない
  });

  it('★中身がある（★上の比較が「空文字 ≡ 空文字」でないこと・★対照）', () => {
    const s = whole(0, {});
    expect(s.length).toBeGreaterThan(1000);
    const race = generateRace(ALL, 0, deriveRng(SEED, STREAM_FIELD, 0));
    expect(race.entrants.length).toBeGreaterThanOrEqual(FIELD_SIZE.MIN);
  });

  it('🔴 ★1 頭でも渡すと**変わる**（★上の検査が「何を渡しても同じ」で緑になっていないこと）', () => {
    const outsider = ALL[0]!; // ★いちばん弱い馬（★帯の外から入る）
    const base = whole(5, {});
    const withOne = whole(5, { mustInclude: [outsider] });
    expect(withOne).not.toBe(base);
  });
});

describe('MI-3 登録した馬は能力の帯の外からでも席に着く', () => {
  const weakest = ALL[0]!;
  const strongest = ALL[ALL.length - 1]!;

  it('★いちばん弱い馬でも必ず出走する（★床の引き直しで落とされない）', () => {
    let seen = 0;
    for (let i = 0; i < 60; i += 1) {
      const race = generateRace(ALL, i, deriveRng(SEED, STREAM_FIELD, i), undefined, undefined, undefined, {
        mustInclude: [weakest],
      });
      expect(race.entrants.some((e) => e.horseId === weakest.id), `cycle ${i}`).toBe(true);
      seen += 1;
    }
    expect(seen).toBe(60);
  });

  it('★いちばん強い馬でも必ず出走する（★上下どちらの外れも・R-2）', () => {
    for (let i = 0; i < 60; i += 1) {
      const race = generateRace(ALL, i, deriveRng(SEED, STREAM_FIELD, i), undefined, undefined, undefined, {
        mustInclude: [strongest],
      });
      expect(race.entrants.some((e) => e.horseId === strongest.id), `cycle ${i}`).toBe(true);
    }
  });

  it('★二重に入らない（★`pool` に同じ馬がいても 1 頭）', () => {
    for (let i = 0; i < 40; i += 1) {
      const race = generateRace(ALL, i, deriveRng(SEED, STREAM_FIELD, i), undefined, undefined, undefined, {
        mustInclude: [weakest, strongest],
      });
      const ids = race.entrants.map((e) => e.horseId);
      expect(new Set(ids).size, `cycle ${i}`).toBe(ids.length);
      expect(ids.filter((x) => x === weakest.id).length).toBe(1);
      expect(ids.filter((x) => x === strongest.id).length).toBe(1);
    }
  });

  it('★頭数は §10.4 の 8〜18 のまま', () => {
    for (let i = 0; i < 60; i += 1) {
      const race = generateRace(ALL, i, deriveRng(SEED, STREAM_FIELD, i), undefined, undefined, undefined, {
        mustInclude: [weakest, strongest],
      });
      expect(race.entrants.length).toBeGreaterThanOrEqual(FIELD_SIZE.MIN);
      expect(race.entrants.length).toBeLessThanOrEqual(FIELD_SIZE.MAX);
    }
  });

  it('★枠は 1..n で重複しない（★先に席に着けても枠順の抽選は通る）', () => {
    const race = generateRace(ALL, 3, deriveRng(SEED, STREAM_FIELD, 3), undefined, undefined, undefined, {
      mustInclude: [weakest, strongest],
    });
    const gates = race.entrants.map((e) => e.gate).sort((a, b) => a - b);
    expect(gates).toEqual(race.entrants.map((_, k) => k + 1));
  });

  it('★上限を超える登録は**投げる**（★推測で除外を決めない・R-27）', () => {
    const many = ALL.slice(0, FIELD_SIZE.MAX + 1);
    expect(() =>
      generateRace(ALL, 1, deriveRng(SEED, STREAM_FIELD, 1), undefined, undefined, undefined, { mustInclude: many }),
    ).toThrow(/上限 18 頭を超えています/);
    // ★これは「届かないはずの番人」です（★上流の `entry-lottery.ts` が 18 頭に絞る）
    // ★対照: ★ちょうど 18 頭なら通る（★境界の反対側・R-2）
    expect(() =>
      generateRace(ALL, 1, deriveRng(SEED, STREAM_FIELD, 1), undefined, undefined, undefined, {
        mustInclude: ALL.slice(0, FIELD_SIZE.MAX),
      }),
    ).not.toThrow();
  });
});
