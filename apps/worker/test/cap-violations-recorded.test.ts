/**
 * 🔴 ★**範囲外の介入倍率は、★記録する**（★O-3 / 憲法 §1.5-1・2026-09-20）
 *
 * 【★何が起きていたか】
 *   ✔ ★`packages/race-engine/src/race.ts:254`:
 *     ★**「クランプは黙って行わず `capViolations` に記録する（★不正の兆候かもしれないため）」**
 *   ✔ ★`:342` で ★**戻り値に入れて返している**。
 *   🔴 ★しかし ★`apps/worker/src/settle.ts` が ★**戻り値を組み立てるときに落として**いた。
 *   🔴 ★`race_entries.cap_violations` 列（`0001_init.sql:204`）は ★**誰も書かなかった**。
 *   → ★★**作って、返して、受け取る手前で捨てていた。**
 *
 * 【★なぜ「いま」繋ぐか】
 *   ✔ ★介入は ★**まだ 1 度も使われていません**（★本番 79,859 行 で 0 件）。
 *   → ★★**いま繋げば「最初の介入の日」から残ります。★後だと最初の何回かが永久に欠けます。**
 *
 * 【⚠️ ★この便がしないこと】
 *   ★**警報を鳴らしません。** ★鳴らして何をするかが決まっていないためです（★別項）。
 *   → ★ここは ★**「残す」まで**。
 */
import { describe, expect, it } from 'vitest';
import { createHash, createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import nodePath from 'node:path';
import { settleRace } from '../src/settle.js';
import { DEFAULT_RACE_BALANCE, resolveRace } from '@star/race-engine';

const SRC = readFileSync(
  nodePath.join(nodePath.resolve(__dirname, '..'), 'src/pg-store.ts'), 'utf8',
);
/** ★註記を外した本文（★註記の語で緑にしない・**CK-13**） */
const LIVE = SRC.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/[^\n]*/gm, ' ');

const hash = {
  sha256: (m: string): string => createHash('sha256').update(m, 'utf8').digest('hex'),
  hmacSha256: (k: string, m: string): string =>
    createHmac('sha256', k).update(m, 'utf8').digest('hex'),
};

/**
 * ★最小の出走表（★着順の中身は見ません。★記録が通るかだけ）。
 * ⚠️ ★形は `apps/worker/test/settle.test.ts` の `entrant` に揃えています。
 */
const entrant = (id: string, gate: number) => ({
  horseId: id,
  stats: { sp: 500, st: 500, pw: 500, gt: 500, iq: 500 },
  surfaceAptitude: { turf: 50, dirt: 50 },
  distanceCenter: 2000,
  distanceRange: 600,
  strategyAptitude: { nige: 50, senko: 50, sashi: 50, oikomi: 50 },
  heavyAptitude: 55,
  strategy: 'senko' as const,
  condition: 3,
  fatigue: 0,
  weightKg: 55,
  gate,
  age: 4,
  skillGenes: [],
});

function inputWith(mults: ReadonlyMap<string, number> | undefined) {
  return {
    conditions: {
      raceId: 'race-cap-1',
      surface: 'turf' as const,
      distance: 2000,
      trackCondition: 'good' as const,
      courseShape: 'oval' as const,
      baseWeightKg: 55,
    },
    entrants: [entrant('H1', 1), entrant('H2', 2), entrant('H3', 3)],
    serverSeed: 'a'.repeat(64),
    interventionMults: mults,
  };
}

describe('🔴 ★O-3: 範囲外の介入倍率を、★捨てない', () => {
  it('★範囲内なら、★記録は空（★対照）', () => {
    const out = settleRace(inputWith(new Map([['H1', 1.05]])) as never, hash);
    expect(out.capViolations, '★範囲内なのに記録が出ている').toEqual([]);
  });

  it('🔴 ★エンジンは、★範囲外を渡すと**受け取った値と適用した値**を残す', () => {
    /**
     * ⚠️ 🔴 ★**包み（`settleRace`）ではなく、★エンジンを直に叩きます。**
     *   ✔ ★理由（★2026-09-20 に判明）: ★`settleRace` は `resolveRace` を呼ぶとき
     *     ★**`interventionMults` を渡していません**（`settle.ts:61-66`）。
     *   → ★★**介入は、★エンジンにだけ在って、★経路が繋がっていません。**
     *     ★だから `intervention_mult` も `intervention_log` も空のままでした。
     *   → ★ここでは ★**記録する仕掛けが生きていること**だけを確かめます。
     */
    const i = inputWith(undefined);
    const out = resolveRace({
      conditions: i.conditions as never,
      entrants: i.entrants as never,
      seed: 12345,
      balance: DEFAULT_RACE_BALANCE,
      interventionMults: new Map([['H1', 100]]),
    } as never);
    expect(out.capViolations.length, '★範囲外なのに記録が 0 件').toBe(1);
    const v = out.capViolations[0]!;
    expect(v.horseId).toBe('H1');
    expect(v.received, '★受け取った生の値が残っていない').toBe(100);
    expect(v.applied, '★適用した値が ±10% に収まっていない').toBeLessThanOrEqual(1.1);
    expect(v.applied).toBeGreaterThanOrEqual(0.9);
  });

  it('🔴 ★包みが、★介入をエンジンへ渡していない（★いまの姿を固定する）', () => {
    /**
     * ⚠️ ★**これは「直せ」ではありません。** ★介入の実装はまだです。
     *   ★**繋いだ日に、★この検査が落ちて気づけるように**固定します（★`CK-11`）。
     */
    const settleSrc = readFileSync(
      nodePath.join(nodePath.resolve(__dirname, '..'), 'src/settle.ts'), 'utf8',
    ).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
    expect(settleSrc, '★介入を渡し始めました。★この検査と `F2-LOG-NOT-PUBLISHED` を見直してください')
      .not.toMatch(/interventionMults/);
  });

  it('⚠️ ★介入が無ければ空（★いまの本番の姿）', () => {
    const out = settleRace(inputWith(undefined) as never, hash);
    expect(out.capViolations).toEqual([]);
  });

  it('🔴 ★確定の SQL が `cap_violations` を書いている', () => {
    const at = LIVE.indexOf('update race_entries set finish_pos');
    expect(at, '★着順を書く文が見つかりません').toBeGreaterThan(-1);
    const stmt = LIVE.slice(at, at + 300);
    expect(stmt, '🔴 ★`cap_violations` を書いていない（★また捨てています）')
      .toMatch(/cap_violations\s*=/);
  });

  it('🔴 ★包みが、★エンジンの記録を**落としていない**（★捨てていた場所）', () => {
    const settleSrc = readFileSync(
      nodePath.join(nodePath.resolve(__dirname, '..'), 'src/settle.ts'), 'utf8',
    ).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/[^\n]*/gm, ' ');
    expect(settleSrc, '★`SettleResult` に capViolations が無い')
      .toMatch(/capViolations/);
    expect(settleSrc, '★エンジンの値を通していない')
      .toMatch(/capViolations:\s*result\.capViolations/);
  });
});
