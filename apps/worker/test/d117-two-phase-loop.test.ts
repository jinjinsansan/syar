/**
 * ★**生成を 2 段に割る**（★2026-09-19・**D-117**・裁定 `REVIEW_D117_SHAPE_VERDICT_20260919.md`）
 *
 * ★① **公示**（announce）… ★`ANNOUNCE_AHEAD_RACES = 4` 先まで、★枠と条件だけ
 * ★② **組成**（fill）  … ★締切を過ぎたものに、★登録馬 ＋ NPC ＋ オッズ
 *
 * 【★ここで見ている壊れ方】
 *   ★**DS-2** … ★登録した馬が出走表に入らないまま組成が通る
 *   ★**DS-6/7** … ★発売開始までに組成が終わらないのに、★そのまま放置される（★中止・返金しない）
 *   ★**DS-8** … ★遅れが数に出ない（★静かに溜まる）
 *   ★**DS-9** … ★1 周で何本でも組成して、★確定を待たせる
 */
import { describe, expect, it } from 'vitest';
import {
  ANNOUNCE_AHEAD_RACES, CYCLE_MS, MAX_FILLS_PER_CYCLE, PHASE_OFFSET_MS,
  cycleStartMs, entryDeadlineMs, frozenCourseOf,
} from '@star/scheduler';
import { runCycle, type CycleStore, type RaceSpec } from '../src/cycle-runner.js';

const EPOCH = 1_700_000_000_000;
const CONDITIONS: RaceSpec['conditions'] = {
  surface: 'turf', distance: 1600, courseId: 'star-park',
  trackCondition: 'good', courseFrozen: frozenCourseOf('star-park'),
};
const SEEDS = { serverSeed: (i: number) => `s${i}`, seedCommit: (i: number) => `c${i}` };
const ANNOUNCE = (): RaceSpec['conditions'] => CONDITIONS;

interface Fake {
  store: CycleStore;
  announcedSet: Set<number>;
  filled: number[];
  cancelled: number[];
  /** ★`fillRace` が受け取った `registered`（★DS-2 の検査） */
  fillSpecs: { cycleIndex: number; registered: readonly string[]; entrants: readonly string[] }[];
  registered: Map<number, readonly string[]>;
  specs: { cycleIndex: number; entryDeadlineAtMs: number }[];
}

function fake(nowMs: number, alreadyAnnounced: readonly number[] = []): Fake {
  const announcedSet = new Set<number>(alreadyAnnounced);
  const done = new Set<number>();
  const filled: number[] = [];
  const cancelled: number[] = [];
  const fillSpecs: Fake['fillSpecs'] = [];
  const registered = new Map<number, readonly string[]>();
  const specs: Fake['specs'] = [];
  const store: CycleStore = {
    serverNowMs: async () => nowMs,
    tryLock: async () => true,
    unlock: async () => {},
    raceExists: async (i) => done.has(i) || announcedSet.has(i),
    createRace: async () => { throw new Error('D-117 の経路では呼ばれません'); },
    announceRace: async (s) => {
      specs.push({ cycleIndex: s.cycleIndex, entryDeadlineAtMs: s.entryDeadlineAtMs });
      announcedSet.add(s.cycleIndex);
    },
    announcedRaces: async () => [...announcedSet].sort((a, b) => a - b),
    announcedConditions: async (i) =>
      announcedSet.has(i) ? { cycleIndex: i, conditions: CONDITIONS } : null,
    registeredHorses: async (i) => registered.get(i) ?? [],
    fillRace: async (i, spec) => {
      const missing = spec.registered.filter((h) => !spec.entrants.some((e) => e.horseId === h));
      if (missing.length > 0) throw new Error(`登録済みの ${missing.length} 頭が出走表にありません`);
      fillSpecs.push({
        cycleIndex: i, registered: spec.registered, entrants: spec.entrants.map((e) => e.horseId),
      });
      filled.push(i);
      announcedSet.delete(i);
      done.add(i);
    },
    pendingSettlements: async () => [],
    settleRace: async () => {},
    overdueRaces: async () => [],
    cancelRace: async (i) => {
      cancelled.push(i);
      announcedSet.delete(i);
      return { refundedBets: 0, refundedEp: 400 };
    },
  };
  return { store, announcedSet, filled, cancelled, fillSpecs, registered, specs };
}

/** ★登録馬をそのまま出走表に入れる `build`（★DS-2 が守られている実装） */
const BUILD_KEEPING = async (_i: number, _c: RaceSpec['conditions'], registered: readonly string[]) => ({
  entrants: registered.map((h, k) => ({ horseId: h, gate: k + 1, weightKg: 55, strategy: 'senko' })),
  odds: [],
});
/** 🔴 ★登録馬を落とす `build`（★DS-2 が守られていない実装・★対照） */
const BUILD_DROPPING = async () => ({ entrants: [], odds: [] });

const NOOP = (): void => {};

describe('D-117 ① 公示', () => {
  it(`★${ANNOUNCE_AHEAD_RACES} レース先まで枠だけ作る`, async () => {
    const f = fake(EPOCH + Math.floor(CYCLE_MS * 0.4));
    const out = await runCycle(f.store, EPOCH, SEEDS, ANNOUNCE, BUILD_KEEPING, NOOP);
    expect(out.announced).toEqual([1, 2, 3, 4]);
    expect(out.announced.length).toBe(ANNOUNCE_AHEAD_RACES);
  });

  it('★締切は `entryDeadlineMs` が決める（★`publish` の 30 秒ではない）', async () => {
    const f = fake(EPOCH + Math.floor(CYCLE_MS * 0.4));
    await runCycle(f.store, EPOCH, SEEDS, ANNOUNCE, BUILD_KEEPING, NOOP);
    const spec = f.specs.find((x) => x.cycleIndex === 4)!;
    expect(spec.entryDeadlineAtMs).toBe(entryDeadlineMs(4, EPOCH));
    /**
     * ★**対照**: ★旧の形（`cycleStart + publish`）と ★**違う値**であること。
     *   ★同じなら「直した」と言えません。
     */
    expect(spec.entryDeadlineAtMs).not.toBe(cycleStartMs(4, EPOCH) + PHASE_OFFSET_MS.publish);
    /**
     * ★締切から発売開始までの持ち時間。★**780 秒 ＝ 13 分**（★2 周 ＋ 1 分）。
     *   ★オッズ 1 本は本番機で ★**70〜98 秒**（AL-6）なので、★**最悪でも 7.96 倍**です。
     * ⚠️ ★旧（`publish`）は **30 秒**で、★98 秒が**入りませんでした**。
     */
    const room = cycleStartMs(4, EPOCH) + PHASE_OFFSET_MS.salesOpen - spec.entryDeadlineAtMs;
    expect(room).toBe(2 * CYCLE_MS + PHASE_OFFSET_MS.salesOpen);
    expect(room).toBe(780_000);
    expect(room / 1000 / 98).toBeGreaterThan(7.9);
    // ★対照: ★旧の 30 秒では 98 秒が入らない
    expect(PHASE_OFFSET_MS.salesOpen - PHASE_OFFSET_MS.publish).toBeLessThan(98_000);
  });
});

describe('D-117 ② 組成', () => {
  it('★締切前のレースは組成しない（★登録を受け付けている最中）', async () => {
    // ★サイクル 0 の頭。★このとき締切を過ぎているのは 1 と 2 だけ
    const f = fake(EPOCH + 1_000);
    const out = await runCycle(f.store, EPOCH, SEEDS, ANNOUNCE, BUILD_KEEPING, NOOP);
    expect(out.filled).toEqual([1, 2]);
    // ★3・4 は公示だけで残る
    expect([...f.announcedSet].sort((a, b) => a - b)).toEqual([3, 4]);
  });

  it('★**DS-2** 登録した馬は出走表に入る', async () => {
    const f = fake(EPOCH + 1_000);
    f.registered.set(1, ['horse-a', 'horse-b']);
    const out = await runCycle(f.store, EPOCH, SEEDS, ANNOUNCE, BUILD_KEEPING, NOOP);
    expect(out.filled).toContain(1);
    const spec = f.fillSpecs.find((x) => x.cycleIndex === 1)!;
    expect(spec.registered).toEqual(['horse-a', 'horse-b']);
    expect(spec.entrants).toEqual(['horse-a', 'horse-b']);
  });

  it('🔴 ★**DS-2** 登録した馬を落とすと組成は失敗する（★黙って走らせない・★変異）', async () => {
    const f = fake(EPOCH + 1_000);
    f.registered.set(1, ['horse-a']);
    await expect(runCycle(f.store, EPOCH, SEEDS, ANNOUNCE, BUILD_DROPPING, NOOP))
      .rejects.toThrow(/出走表にありません/);
  });

  it('★**DS-9** 1 周で組成するのは `MAX_FILLS_PER_CYCLE` 本まで、残りは `fillDeferred`（★**DS-8**）', async () => {
    /**
     * 【★組成できる窓】★レース N は ★`cycleStart(N-2) ≦ now < cycleStart(N)+60s` のあいだ。
     *   ★`now = cycleStart(c) + 1 秒` に置くと、★**ちょうど 3 本**（c・c+1・c+2）が窓に入ります。
     *   ★上限は 2 本なので、★**3 本めが `fillDeferred` に落ちる**はずです。
     */
    const c = 10;
    const now = cycleStartMs(c, EPOCH) + 1_000;
    const f = fake(now, [c, c + 1, c + 2]);
    const out = await runCycle(f.store, EPOCH, SEEDS, ANNOUNCE, BUILD_KEEPING, NOOP);
    expect(out.filled).toEqual([c, c + 1]);
    expect(out.filled.length).toBe(MAX_FILLS_PER_CYCLE);
    expect(out.fillDeferred).toEqual([c + 2]);
    // ★まだ受付中のものは「遅れ」ではない（★c+3 以降）
    expect(out.fillDeferred).not.toContain(c + 3);
  });

  it('★**DS-8** 遅れたレースは次の周で組成される（★溜まったままにならない）', async () => {
    const c = 10;
    const f = fake(cycleStartMs(c, EPOCH) + 1_000, [c, c + 1, c + 2]);
    const out = await runCycle(f.store, EPOCH, SEEDS, ANNOUNCE, BUILD_KEEPING, NOOP);
    expect(out.fillDeferred).toEqual([c + 2]);

    /**
     * ★次の周（★同じストアの続き）。★`serverNowMs` を 1 周進めます。
     *   ★`c+2` は ★**発売開始（cycleStart(c+2)+60s）より前**なので、★まだ間に合います。
     */
    (f.store as { serverNowMs: () => Promise<number> }).serverNowMs =
      async () => cycleStartMs(c + 1, EPOCH) + 1_000;
    const out2 = await runCycle(f.store, EPOCH, SEEDS, ANNOUNCE, BUILD_KEEPING, NOOP);
    expect(out2.filled).toContain(c + 2);
    expect(out2.fillFailed).not.toContain(c + 2);
  });
});

describe('D-117 ★**DS-6/DS-7** 発売開始までに組成が終わらなかったレース', () => {
  it('★中止にして返金し、黙って放置しない', async () => {
    /**
     * ★`nowMs` を ★**レース 5 の発売開始より後**に置きます。
     *   ★5 は公示だけで残っていて、★もう組成しても間に合いません。
     */
    const now = cycleStartMs(5, EPOCH) + PHASE_OFFSET_MS.salesOpen + 1_000;
    const f = fake(now, [5]);
    const alerts: { cycleIndex: number; refundedEp: number }[] = [];
    const out = await runCycle(f.store, EPOCH, SEEDS, ANNOUNCE, BUILD_KEEPING, (a) => alerts.push(a));
    expect(out.fillFailed).toContain(5);
    expect(out.filled).not.toContain(5);
    expect(f.cancelled).toContain(5);
    // ★黙って中止にしない（★D-037 と同じ形）
    expect(alerts.some((a) => a.cycleIndex === 5)).toBe(true);
    expect(alerts.find((a) => a.cycleIndex === 5)!.refundedEp).toBe(400);
  });

  it('★発売開始の**直前**なら、まだ組成する（★境界の反対側・R-2）', async () => {
    const now = cycleStartMs(5, EPOCH) + PHASE_OFFSET_MS.salesOpen - 1;
    const f = fake(now, [5]);
    const out = await runCycle(f.store, EPOCH, SEEDS, ANNOUNCE, BUILD_KEEPING, NOOP);
    expect(out.filled).toContain(5);
    expect(out.fillFailed).toEqual([]);
    expect(f.cancelled).toEqual([]);
  });

  it('★間に合わないレースは `MAX_FILLS_PER_CYCLE` の枠を使わない', async () => {
    /**
     * ★もう間に合わない 3・4 と、★まだ間に合う 7 が並ぶ状況。
     *   ★判定が組成より**後**だと、3・4 で枠を 2 つ使って 7 が `fillDeferred` に落ちます。
     */
    const now = cycleStartMs(5, EPOCH) + PHASE_OFFSET_MS.salesOpen + 1_000;
    const f = fake(now, [3, 4, 7]);
    const out = await runCycle(f.store, EPOCH, SEEDS, ANNOUNCE, BUILD_KEEPING, NOOP);
    expect(out.fillFailed).toEqual([3, 4]);
    expect(out.filled).toContain(7);
    expect(out.fillDeferred).toEqual([]);
  });
});
