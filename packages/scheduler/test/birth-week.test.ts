/**
 * ★**生まれた週の配り方**（★案 B-3・2026-09-20 裁定）
 *
 * 【★この検査が守るもの】
 *   ★① ★歳の境目と §7.1 の節目がちょうど合う（★端が 1 週もはみ出さない）
 *   ★② ★**毎週 15〜16 頭**に散る（★`POOL-DRAIN` の「2 段の崖」が作られない）
 *   ★③ ★`% 4` の位相が 4 つとも埋まる（★`SEED-LOCKSTEP` が作られない）
 *   ★④ ★**決定論** — ★locale にも実行順にも依らない
 *
 * 【⚠️ ★この検査が見ないもの】
 *   ★DB に入った姿は見ていません。★ここは**配り方の算術**だけです。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import nodePath from 'node:path';
import {
  LIFECYCLE_WEEKS,
  WEEKS_PER_YEAR,
  ageWeeksOf,
  assertYearAligned,
  birthWeekOf,
  rankByStableKey,
  strataOffsetWeeks,
} from '../src/index.js';

/** ★実測のコホート（`evidence/20260920-world-supply/`: ★800 頭 × 3 コホート） */
const COHORT = 800;

describe('★層化の算術', () => {
  it('★rank 0 は 0 週、★最後の 1 頭は 51 週（★52 を超えない）', () => {
    expect(strataOffsetWeeks(0, COHORT)).toBe(0);
    expect(strataOffsetWeeks(COHORT - 1, COHORT)).toBe(51);
    expect(strataOffsetWeeks(COHORT - 1, COHORT)).toBeLessThan(WEEKS_PER_YEAR);
  });

  it('🔴 ★どの週も 15 頭 か 16 頭（★無作為なら 15.4 ± 3.9 で揺れる）', () => {
    const perWeek = new Map<number, number>();
    for (let r = 0; r < COHORT; r += 1) {
      const w = strataOffsetWeeks(r, COHORT);
      perWeek.set(w, (perWeek.get(w) ?? 0) + 1);
    }
    expect(perWeek.size, '★52 週すべてに馬が居ない').toBe(WEEKS_PER_YEAR);
    const counts = [...perWeek.values()];
    expect(Math.min(...counts)).toBe(15);
    expect(Math.max(...counts)).toBe(16);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(COHORT);
  });

  it('★単調に増える（★順位が上がって週が戻らない）', () => {
    let prev = -1;
    for (let r = 0; r < COHORT; r += 1) {
      const w = strataOffsetWeeks(r, COHORT);
      expect(w).toBeGreaterThanOrEqual(prev);
      prev = w;
    }
  });

  it('⚠️ ★1 頭だけのコホートでも落ちない（★端）', () => {
    expect(strataOffsetWeeks(0, 1)).toBe(0);
  });

  it('🔴 ★範囲の外は**投げる**（★黙って丸めない）', () => {
    expect(() => strataOffsetWeeks(800, 800)).toThrow(/rank/);
    expect(() => strataOffsetWeeks(-1, 800)).toThrow(/rank/);
    expect(() => strataOffsetWeeks(1.5, 800)).toThrow(/rank/);
    expect(() => strataOffsetWeeks(0, 0)).toThrow(/cohortSize/);
  });
});

describe('🔴 ★歳の境目が §7.1 の節目とちょうど合う', () => {
  /**
   * ★ここが合っていないと、★**2 歳の一部が出走できない**／
   * ★**4 歳の一部が引退している**世界ができます。
   */
  it('★2 歳コホートは、★いちばん若い馬でちょうど `raceableFrom`', () => {
    expect(ageWeeksOf(2, 0, COHORT)).toBe(LIFECYCLE_WEEKS.raceableFrom);
  });

  it('★4 歳コホートは、★いちばん年長の馬が `retireAt` の 1 週 手前', () => {
    expect(ageWeeksOf(4, COHORT - 1, COHORT)).toBe(LIFECYCLE_WEEKS.retireAt - 1);
  });

  it('★2〜4 歳の全頭が「出走できて、まだ引退していない」', () => {
    for (const age of [2, 3, 4]) {
      for (const r of [0, 1, COHORT - 2, COHORT - 1]) {
        const w = ageWeeksOf(age, r, COHORT);
        expect(w, `age=${age} rank=${r}`).toBeGreaterThanOrEqual(LIFECYCLE_WEEKS.raceableFrom);
        expect(w, `age=${age} rank=${r}`).toBeLessThan(LIFECYCLE_WEEKS.retireAt);
      }
    }
  });

  it('★5 歳は全頭が引退済み（★対照）', () => {
    expect(ageWeeksOf(5, 0, COHORT)).toBe(LIFECYCLE_WEEKS.retireAt);
    expect(ageWeeksOf(5, COHORT - 1, COHORT)).toBeGreaterThan(LIFECYCLE_WEEKS.retireAt);
  });

  it('★コホートどうしが重ならず、隙間もない', () => {
    const seen = new Set<number>();
    for (const age of [2, 3, 4]) {
      for (let r = 0; r < COHORT; r += 1) seen.add(ageWeeksOf(age, r, COHORT));
    }
    expect(seen.size, '★週齢の種類が 156 でない').toBe(156);
    expect(Math.min(...seen)).toBe(LIFECYCLE_WEEKS.raceableFrom);
    expect(Math.max(...seen)).toBe(LIFECYCLE_WEEKS.retireAt - 1);
  });
});

describe('🔴 ★`SEED-LOCKSTEP` が作られないこと', () => {
  it('★`ageWeeks % 4` の 4 つの位相が、★どれも 2 割 以上', () => {
    /**
     * ★`defaultMenu`（`training-runner.ts`）は `ageWeeks % 4` で献立を選びます。
     * ✔ ★staging の実測（★直す前）: ★**7,325 / 7,333 頭が位相 1** — ★集団まるごと同時に動いていた。
     */
    const phase = [0, 0, 0, 0];
    for (const age of [2, 3, 4]) {
      for (let r = 0; r < COHORT; r += 1) {
        const p = ageWeeksOf(age, r, COHORT) % 4;
        phase[p] = (phase[p] ?? 0) + 1;
      }
    }
    const total = phase.reduce((a, b) => a + b, 0);
    expect(total).toBe(COHORT * 3);
    for (let i = 0; i < 4; i += 1) {
      expect(phase[i]! / total, `★位相 ${i} が偏っている（${phase.join('/')}）`)
        .toBeGreaterThan(0.2);
    }
  });

  it('🔴 ★引退が同じ週に固まらない（★「2 段の崖」の対照）', () => {
    /**
     * ★引退する週 ＝ `birth_week + retireAt`。★これが散っていることを見ます。
     * ⚠️ ★**対照**: ★全頭を同じ `birth_week` にすると 1 週に 800 頭 集まります。
     */
    const spread = new Map<number, number>();
    for (let r = 0; r < COHORT; r += 1) {
      const w = birthWeekOf(1000, 4, r, COHORT) + LIFECYCLE_WEEKS.retireAt;
      spread.set(w, (spread.get(w) ?? 0) + 1);
    }
    expect(spread.size, '★引退の週が散っていない').toBe(WEEKS_PER_YEAR);
    expect(Math.max(...spread.values()), '★1 週に固まっている').toBeLessThanOrEqual(16);

    // ★対照 — ★揃えたらどうなるか（★これが直す前の姿）
    const flat = new Map<number, number>();
    for (let r = 0; r < COHORT; r += 1) flat.set(-160, (flat.get(-160) ?? 0) + 1);
    expect(flat.size).toBe(1);
    expect(Math.max(...flat.values())).toBe(COHORT);
  });
});

describe('★決定論', () => {
  it('★順位は**コードポイント順**（★locale に依らない）', () => {
    const keys = ['NPC-48-000010', 'NPC-48-000002', 'NPC-46-000100'];
    const rank = rankByStableKey(keys);
    expect(rank.get('NPC-46-000100')).toBe(0);
    expect(rank.get('NPC-48-000002')).toBe(1);
    expect(rank.get('NPC-48-000010')).toBe(2);
  });

  it('★渡す順を変えても同じ順位', () => {
    const a = rankByStableKey(['b', 'a', 'c']);
    const b = rankByStableKey(['c', 'b', 'a']);
    expect([...a.entries()].sort()).toEqual([...b.entries()].sort());
  });

  it('🔴 ★キーが重複したら**投げる**（★1 頭ずれると以後 全部ずれる）', () => {
    expect(() => rankByStableKey(['a', 'a'])).toThrow(/重複/);
  });

  it('🔴 ★`localeCompare` を使っていない（★機械で順位が変わる）', () => {
    const src = readFileSync(
      nodePath.join(nodePath.resolve(__dirname, '..'), 'src/birth-week.ts'), 'utf8',
    );
    const live = src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
    expect(live, '★localeCompare は locale に依る（憲法 §1-4）').not.toMatch(/localeCompare/);
  });
});

describe('★番人', () => {
  it('★いまの §7.1 は 1 年の倍数なので通る', () => {
    expect(() => assertYearAligned()).not.toThrow();
    expect(LIFECYCLE_WEEKS.raceableFrom % WEEKS_PER_YEAR).toBe(0);
    expect(LIFECYCLE_WEEKS.retireAt % WEEKS_PER_YEAR).toBe(0);
  });

  it('★`birthWeekOf` は負の週を返せる（★祖先は何十年も前に生まれている）', () => {
    expect(birthWeekOf(22, 56, 0, 1)).toBe(22 - 56 * WEEKS_PER_YEAR);
    expect(birthWeekOf(22, 56, 0, 1)).toBeLessThan(0);
  });
});
