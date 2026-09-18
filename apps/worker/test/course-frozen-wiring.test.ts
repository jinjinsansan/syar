/**
 * ★**オッズのモンテカルロと確定が、同じ凍結した走路の形を読む**（★2026-09-15・指示書 VW §4-2・§5-4）
 *
 * 【★何を見るか — 経路の検査（R-30）】
 *   ★`buildRace` → `createRace`（保存）→ `settleRace`（読む）を**偽の DB** で通し、
 *   ★**エンジン（`resolveRace`）が実際に受け取った条件**を両方の経路で記録して突き合わせます。
 *   ⚠️ ★両辺を自分で組み立てると、★呼び出し側が渡し忘れたことは捕まりません（台帳 B-6 と同じ形）。
 *
 * ⚠️ ★**スターパークだけで検査しないこと**（指示書 F-12）。★スターパークは `DEFAULT_OVAL` と同じ値なので、
 *    ★確定が `course` を渡し忘れても一致してしまいます。★下の組は**スターパーク以外を必ず含み**、
 *    ★1400m 以下（★以前オッズ側だけ 20% 直線にしていた距離）も含みます。
 */
import { createHash, createHmac } from 'node:crypto';
import type pg from 'pg';
import { describe, expect, it, vi } from 'vitest';
import type { RaceConditions } from '@star/race-engine';
import { DEFAULT_OVAL } from '@star/race-engine';
import { NICKS_GEN, type HorseRecord } from '@star/sim-engine';
import { productionRaceOf } from '@star/scheduler';

const engineCalls = vi.hoisted(() => ({ conditions: [] as RaceConditions[] }));

vi.mock('@star/race-engine', async (importOriginal) => {
  const m = await importOriginal<typeof import('@star/race-engine')>();
  return {
    ...m,
    resolveRace: (p: Parameters<typeof m.resolveRace>[0]) => {
      engineCalls.conditions.push(p.conditions);
      return m.resolveRace(p);
    },
  };
});
// ★賞金・払戻は本検査の対象外（★それぞれ prize-award.test.ts・payout.test.ts が見ている）
vi.mock('../src/prize-award.js', () => ({ awardPrizes: async () => undefined }));
vi.mock('../src/payout.js', () => ({ settlePayouts: async () => ({ won: 0, lost: 0, paid: 0 }) }));

const { buildRace } = await import('../src/build-race.js');
const { createPgStore } = await import('../src/pg-store.js');
const { runSimulation } = await import('../../cli/src/simulator.js');
const { resolveRuntimeConfig } = await import('../../cli/src/config.js');

const hash = {
  sha256: (s: string) => createHash('sha256').update(s, 'utf8').digest('hex'),
  hmacSha256: (k: string, s: string) => createHmac('sha256', k).update(s, 'utf8').digest('hex'),
};

const { balance, founders } = resolveRuntimeConfig();
const POOL: readonly HorseRecord[] = runSimulation(
  { seed: 7, generations: 8, population: 160, stallionPool: 48, v1Pairs: 1, v1Repeats: 5, retainFinalPopulation: true },
  balance, founders, NICKS_GEN,
).finalPopulation ?? [];

const TRIALS = 40;
const EPOCH_SEED = 20260915;

interface Row { [k: string]: unknown }

/** ★createRace の引数を記録し、settleRace にはその保存値を読ませる偽の DB */
function fakeDb() {
  const saved = new Map<number, { params: readonly unknown[]; entrants: Row[] }>();
  let settleRow: Row | null = null;
  let settleEntrants: Row[] = [];
  const client = {
    query: async (sql: string, params: readonly unknown[] = []) => {
      const s = sql.trim();
      if (/^(begin|commit|rollback)$/.test(s)) return { rows: [], rowCount: 0 };
      if (s.startsWith('insert into races')) {
        saved.set(Number(params[0]), { params, entrants: [] });
        return { rows: [], rowCount: 1 };
      }
      if (s.startsWith('select id from races')) return { rows: [{ id: `race-${String(params[0])}` }], rowCount: 1 };
      if (s.startsWith('insert into race_entries')) {
        const id = String(params[0]);
        const cycle = Number(id.replace('race-', ''));
        const gates = params[2] as number[];
        const snaps = params[6] as (string | null)[];
        saved.get(cycle)!.entrants = gates.map((g, i) => ({
          gate: g, weight: 55, strategy: 'senko', entrant_snapshot: snaps[i] === null ? null : JSON.parse(snaps[i]!),
        }));
        return { rows: [], rowCount: gates.length };
      }
      if (s.startsWith('insert into race_odds')) return { rows: [], rowCount: 1 };
      if (s.startsWith('update races set status')) return settleRow === null ? { rows: [], rowCount: 0 } : { rows: [settleRow], rowCount: 1 };
      if (s.startsWith('select e.gate')) return { rows: settleEntrants, rowCount: settleEntrants.length };
      /**
       * ★取消（除外）の枠（★2026-09-16・正典 D-111 ③・移行 `0028`）。
       * ★この偽の DB では取消が無いので 0 行。★製品側はこれを `settlePayouts` に渡す
       *   （★渡さないと取消馬を含む馬券が「外れ」になり、客の EP が返らない）。
       */
      if (s.startsWith('select gate from race_entries')) return { rows: [], rowCount: 0 };
      if (s.startsWith('update race_entries')) return { rows: [], rowCount: 1 };
      throw new Error(`偽の DB が知らない SQL: ${s.slice(0, 60)}`);
    },
  };
  return {
    client: client as unknown as pg.Client,
    saved,
    /** ★確定で読ませる行。★course_frozen は保存した JSON を jsonb と同じくオブジェクトに戻す */
    armSettle(cycle: number, override?: { courseFrozen?: unknown }) {
      const { params, entrants } = saved.get(cycle)!;
      settleRow = {
        id: `race-${cycle}`, server_seed: 'a'.repeat(64), distance: params[8], surface: params[7],
        track_condition: params[11], course_id: params[9], class_rank: params[2], grade: params[3],
        course_frozen: override !== undefined && 'courseFrozen' in override
          ? override.courseFrozen
          : JSON.parse(params[12] as string),
      };
      settleEntrants = entrants;
    },
  };
}

/** ★スターパーク以外・1400m 以下を必ず含む本番の組 */
function pickCycles(): number[] {
  const out: number[] = [];
  const seen = new Set<string>();
  for (let i = 0; out.length < 3 && i < 2000; i += 1) {
    const p = productionRaceOf(i);
    if (p.courseFrozen.venueId === 'star-park') continue;
    const short = p.programme.distance <= 1400;
    const key = `${short}/${p.courseFrozen.turn}`;
    if (seen.has(key)) continue;
    if (out.length === 0 && !short) continue;
    seen.add(key);
    out.push(i);
  }
  return out;
}

async function buildAndSave(db: ReturnType<typeof fakeDb>, cycle: number) {
  const p = productionRaceOf(cycle);
  engineCalls.conditions.length = 0;
  const built = buildRace(POOL, cycle, EPOCH_SEED, TRIALS, undefined, p.programme);
  const oddsConditions = [...engineCalls.conditions];
  const store = createPgStore(db.client, hash, { onCourseNotFrozen: () => undefined });
  await store.createRace({
    cycleIndex: cycle, raceClass: p.raceClass, grade: p.grade, scheduledAtMs: 0,
    // ★登録の締切（★2026-09-19・ED-1）。★この検査は走路の凍結を見るものなので、値は何でもよい
    entryDeadlineAtMs: 0,
    // ★ゲーム内の週（★2026-09-19・UI-4）。★この検査も走路の凍結を見るものなので、値は何でもよい
    gameWeek: 0,
    seedCommit: 'c', serverSeed: 'a'.repeat(64), purse: 0,
    conditions: built.conditions, entrants: built.entrants, odds: built.odds,
  });
  return { p, built, oddsConditions };
}

describe('★VW-1・VW-3 オッズと確定が同じ走路の形を読む（偽の DB）', () => {
  const cycles = pickCycles();

  it('★組の選び方: スターパーク以外・1400m 以下・左右の回りを含む', () => {
    expect(cycles.length).toBe(3);
    const ps = cycles.map(productionRaceOf);
    expect(ps.every((p) => p.courseFrozen.venueId !== 'star-park')).toBe(true);
    expect(ps.some((p) => p.programme.distance <= 1400)).toBe(true);
  });

  it('★1（§5-4-1・§4-2-1）保存した course_frozen ＝ モンテカルロに渡した course・courseShape', async () => {
    const db = fakeDb();
    for (const cycle of cycles) {
      const { p, built, oddsConditions } = await buildAndSave(db, cycle);
      expect(oddsConditions.length).toBe(TRIALS);
      const saved = JSON.parse(db.saved.get(cycle)!.params[12] as string);
      expect(saved, '★保存したのは番組の場の凍結').toEqual(p.courseFrozen);
      expect(built.conditions.courseFrozen, '★作り直していない').toEqual(p.courseFrozen);
      expect(db.saved.get(cycle)!.params[9], '★course_id は凍結の venueId').toBe(saved.venueId);
      for (const c of oddsConditions) {
        expect(c.courseShape).toBe(saved.courseShape);
        expect(c.course).toEqual({ lapM: saved.lapM, homeStretchM: saved.homeStretchM, widthM: saved.widthM });
      }
    }
  });

  it('★2（§5-4-2・§4-2-1）確定は保存した凍結から作った条件でエンジンを呼び、オッズ側と完全に一致する', async () => {
    const db = fakeDb();
    for (const cycle of cycles) {
      const { oddsConditions } = await buildAndSave(db, cycle);
      db.armSettle(cycle);
      engineCalls.conditions.length = 0;
      const store = createPgStore(db.client, hash, { onCourseNotFrozen: () => { throw new Error('凍結があるのに通報された'); } });
      await store.settleRace(cycle);
      expect(engineCalls.conditions.length).toBe(1);
      const settled = engineCalls.conditions[0]!;
      const odds = oddsConditions[0]!;
      expect(settled.courseShape, `★cycle ${cycle}`).toBe(odds.courseShape);
      expect(settled.course, `★cycle ${cycle}`).toEqual(odds.course);
      expect(settled.distance).toBe(odds.distance);
      expect(settled.surface).toBe(odds.surface);
      expect(settled.trackCondition).toBe(odds.trackCondition);
      // ★DEFAULT_OVAL と違う形であること（★スターパーク以外なので、渡し忘れれば必ずここで食い違う）
      expect(settled.course).not.toEqual(DEFAULT_OVAL);
    }
  });

  it('★3（§5-4-3）course_frozen が null の行は DEFAULT_OVAL・oval で確定し、件数が通報に出る', async () => {
    const db = fakeDb();
    const alerts: { cycleIndex: number; count: number }[] = [];
    const store = createPgStore(db.client, hash, { onCourseNotFrozen: (a) => alerts.push(a) });
    for (const cycle of cycles.slice(0, 2)) {
      await buildAndSave(db, cycle);
      db.armSettle(cycle, { courseFrozen: null });
      engineCalls.conditions.length = 0;
      await store.settleRace(cycle);
      expect(engineCalls.conditions[0]!.course).toBe(DEFAULT_OVAL);
      expect(engineCalls.conditions[0]!.courseShape).toBe('oval');
    }
    expect(alerts).toEqual([{ cycleIndex: cycles[0], count: 1 }, { cycleIndex: cycles[1], count: 2 }]);
  });

  it('★4（§5-4-4）course_frozen が不正な行は確定せずに投げる（エンジンを呼ばない）', async () => {
    const db = fakeDb();
    const cycle = cycles[0]!;
    const { p } = await buildAndSave(db, cycle);
    const store = createPgStore(db.client, hash, { onCourseNotFrozen: () => undefined });
    for (const bad of [
      { ...p.courseFrozen, lapM: 'wide' },
      { ...p.courseFrozen, v: 9 },
      { ...p.courseFrozen, venueId: 'star-park' }, // ★course_id と別の場
      '{"v":1}',
    ]) {
      db.armSettle(cycle, { courseFrozen: bad });
      engineCalls.conditions.length = 0;
      await expect(store.settleRace(cycle)).rejects.toMatchObject({ name: 'InvalidFrozenCourseError' });
      expect(engineCalls.conditions.length).toBe(0);
    }
  });
});
