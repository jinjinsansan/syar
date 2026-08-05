/**
 * O-1: §8.8「seed + 介入入力ログ → 同じ着順」／O-3: 入口クランプ
 *
 * ★どちらも**経路テスト**として書く（R-1 の5度目・6度目を作らないため）:
 *   - O-1 は「変換関数が正しい」ではなく「監査経路が実際に再計算して一致を見ている」ことを固定
 *   - O-3 は「純関数がクランプする」ではなく「`resolveRace` に範囲外を渡しても支配されない」ことを固定
 */

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_INTERVENTION_BALANCE,
  DEFAULT_RACE_BALANCE,
  auditRaceFailures,
  clampInterventionMult,
  clientEntropy,
  commitServerSeed,
  deriveFinalSeed,
  finalSeedToRngSeed,
  interventionMultsFromLog,
  planFromInputs,
  replayRace,
  resolveRace,
  type InterventionInput,
  type RaceAuditRecord,
  type RaceConditions,
  type ReplayContext,
} from '../src/index.js';
import { neutralEntrant, neutralField } from './helpers.js';
import { pureHashProvider } from './pure-hash.js';

const B = DEFAULT_RACE_BALANCE;
const IB = DEFAULT_INTERVENTION_BALANCE;
const H = pureHashProvider;

function conditions(overrides: Partial<RaceConditions> = {}): RaceConditions {
  return {
    raceId: 'R-REPLAY-0001',
    distance: 2000,
    surface: 'turf',
    trackCondition: 'good',
    courseShape: 'oval',
    baseWeightKg: 55,
    ...overrides,
  };
}

/** 2000m を約120秒で走る想定のログ（勝負所で仕掛け、直線で連打） */
function sampleLog(horseId: string): InterventionInput[] {
  const out: InterventionInput[] = [
    { horseId, phase: 'start', serverMs: 120, clientMs: 60 },
    { horseId, phase: 'travel', serverMs: 30_000, clientMs: 29_900 },
    { horseId, phase: 'spurt', serverMs: 90_000, clientMs: 89_800 },
  ];
  for (let i = 0; i < 20; i++) {
    out.push({ horseId, phase: 'drive', serverMs: 100_000 + i * 500, clientMs: 100_000 + i * 500 });
  }
  return out;
}

describe('O-1 介入ログ → プランの変換（§8.8）', () => {
  const ctx: ReplayContext = {
    distance: 2000,
    averageSpeedMps: 16.6,
    startAtMs: 0,
    driveWindowSec: IB.DRIVE_WINDOW_SEC,
  };

  it('スタート誤差はサーバー受信時刻から取る（クライアント申告時刻は使わない）', () => {
    const plan = planFromInputs(
      [{ horseId: 'A', phase: 'start', serverMs: 200, clientMs: 0 }],
      ctx,
    );
    expect(plan.startErrorMs).toBe(200);
    // ★クライアント申告を使っていたら 0 になる。詐称で有利になってはいけない（§8b.6）
    expect(plan.startErrorMs).not.toBe(0);
  });

  it('仕掛けの時刻が残距離へ換算される', () => {
    const plan = planFromInputs(
      [{ horseId: 'A', phase: 'spurt', serverMs: 90_000, clientMs: 0 }],
      ctx,
    );
    // 90秒 × 16.6m/s = 1494m 走行 → 残り 506m
    expect(plan.spurtAtMeter).toBeCloseTo(2000 - 90 * 16.6, 6);
  });

  it('連打の件数が秒間レートになる', () => {
    const drives: InterventionInput[] = Array.from({ length: 48 }, (_, i) => ({
      horseId: 'A',
      phase: 'drive' as const,
      serverMs: 100_000 + i,
      clientMs: 0,
    }));
    const plan = planFromInputs(drives, ctx);
    expect(plan.driveTapsPerSec).toBeCloseTo(48 / IB.DRIVE_WINDOW_SEC, 10);
  });

  it('ログが空なら中立プラン（介入なし）', () => {
    const plan = planFromInputs([], ctx);
    expect(plan.driveTapsPerSec).toBe(0);
    expect(plan.spurtAtMeter).toBe(0);
    expect(Number.isFinite(plan.startErrorMs)).toBe(false);
  });

  it('★ログの並び順に依存しない（DB の取り出し順で再現が壊れない）', () => {
    const log = sampleLog('A');
    const reversed = [...log].reverse();
    const shuffled = [log[5], log[0], log[2], log[1], ...log.slice(6), log[3], log[4]].filter(
      (x): x is InterventionInput => x !== undefined,
    );
    const a = planFromInputs(log, ctx);
    expect(planFromInputs(reversed, ctx)).toEqual(a);
    expect(planFromInputs(shuffled, ctx)).toEqual(a);
  });
});

describe('O-1 ★経路: seed + 介入ログ → 同じ着順（§8.8）', () => {
  const field = neutralField(10);
  const cond = conditions();
  const seed = 4242;

  it('本番と同じ介入倍率が再計算される', () => {
    const log = sampleLog('H003');
    const mults = interventionMultsFromLog({
      conditions: cond,
      entrants: field,
      seed,
      balance: B,
      interventions: log,
    });
    // 介入した馬だけが 1 以外
    expect(mults.size).toBe(1);
    const v = mults.get('H003');
    expect(v).toBeDefined();
    expect(v).toBeGreaterThanOrEqual(1 - IB.INTERVENTION_CAP);
    expect(v).toBeLessThanOrEqual(1 + IB.INTERVENTION_CAP);
  });

  it('replayRace の着順が、同じ倍率で resolveRace を回した着順と一致する', () => {
    const log = sampleLog('H003');
    const mults = interventionMultsFromLog({
      conditions: cond,
      entrants: field,
      seed,
      balance: B,
      interventions: log,
    });
    const direct = resolveRace({
      conditions: cond,
      entrants: field,
      seed,
      balance: B,
      interventionMults: mults,
    });
    const replayed = replayRace({
      conditions: cond,
      entrants: field,
      seed,
      balance: B,
      interventions: log,
    });
    expect(replayed.order.map((o) => o.horseId)).toEqual(direct.order.map((o) => o.horseId));
  });

  it('★監査経路が着順の再計算まで行う（ハッシュだけでは通らない）', () => {
    const serverSeed = 'server-seed-replay';
    const entrantIds = field.map((e) => e.horseId);
    const entropy = clientEntropy(entrantIds, H);
    const finalSeed = deriveFinalSeed(serverSeed, cond.raceId, entropy, H);
    const log = sampleLog('H003');
    const rngSeed = finalSeedToRngSeed(finalSeed);
    const truth = replayRace({
      conditions: cond,
      entrants: field,
      seed: rngSeed,
      balance: B,
      interventions: log,
    });
    const record: RaceAuditRecord = {
      raceId: cond.raceId,
      seedCommit: commitServerSeed(serverSeed, H),
      seedReveal: serverSeed,
      clientEntropy: entropy,
      finalSeed,
      entrantIds,
      interventions: log,
    };
    const recordedOrder = truth.order.map((o) => o.horseId);

    // 正しい記録は不合格理由ゼロ
    expect(
      auditRaceFailures(record, H, {
        conditions: cond,
        entrants: field,
        balance: B,
        recordedOrder,
      }),
    ).toEqual([]);

    // ★着順を1つ入れ替えると検出される（ハッシュ連鎖は無傷なので、再計算しないと通ってしまう）
    const tampered = [...recordedOrder];
    const a = tampered[0];
    const b = tampered[1];
    if (a === undefined || b === undefined) throw new Error('着順が足りない');
    tampered[0] = b;
    tampered[1] = a;
    const failures = auditRaceFailures(record, H, {
      conditions: cond,
      entrants: field,
      balance: B,
      recordedOrder: tampered,
    });
    expect(failures.length).toBeGreaterThan(0);
    expect(failures.some((f) => f.includes('再現した着順が記録と一致しない'))).toBe(true);
  });

  it('★介入ログを改竄すると着順の再現が合わなくなる（ログが結果に効いている証拠）', () => {
    const serverSeed = 'server-seed-replay-2';
    const entrantIds = field.map((e) => e.horseId);
    const entropy = clientEntropy(entrantIds, H);
    const finalSeed = deriveFinalSeed(serverSeed, cond.raceId, entropy, H);
    const rngSeed = finalSeedToRngSeed(finalSeed);
    const goodLog = sampleLog('H003');
    const recordedOrder = replayRace({
      conditions: cond,
      entrants: field,
      seed: rngSeed,
      balance: B,
      interventions: goodLog,
    }).order.map((o) => o.horseId);

    // 仕掛けを極端に早い時刻へ改竄（早仕掛け → 倍率が変わる）
    const badLog = goodLog.map((i) =>
      i.phase === 'spurt' ? { ...i, serverMs: 1_000 } : i,
    );
    const record: RaceAuditRecord = {
      raceId: cond.raceId,
      seedCommit: commitServerSeed(serverSeed, H),
      seedReveal: serverSeed,
      clientEntropy: entropy,
      finalSeed,
      entrantIds,
      interventions: badLog,
    };
    const badMult = interventionMultsFromLog({
      conditions: cond,
      entrants: field,
      seed: rngSeed,
      balance: B,
      interventions: badLog,
    }).get('H003');
    const goodMult = interventionMultsFromLog({
      conditions: cond,
      entrants: field,
      seed: rngSeed,
      balance: B,
      interventions: goodLog,
    }).get('H003');
    // まず倍率が実際に変わっていること（変わらなければ以下の検定は無意味・R-9）
    expect(badMult).not.toBe(goodMult);

    const failures = auditRaceFailures(record, H, {
      conditions: cond,
      entrants: field,
      balance: B,
      recordedOrder,
    });
    expect(failures.length).toBeGreaterThan(0);
  });

  it('seed_reveal が無ければ「再計算できない」と明示する（黙って通さない・R-3）', () => {
    const record: RaceAuditRecord = {
      raceId: cond.raceId,
      seedCommit: 'a'.repeat(64),
      seedReveal: null,
      clientEntropy: clientEntropy(['X'], H),
      finalSeed: 'b'.repeat(64),
      entrantIds: ['X'],
      interventions: [],
    };
    const failures = auditRaceFailures(record, H, {
      conditions: cond,
      entrants: field,
      balance: B,
      recordedOrder: [],
    });
    expect(failures.some((f) => f.includes('再計算ができない'))).toBe(true);
  });
});

describe('O-3 ★経路: resolveRace の入口で ±10% キャップが効く（憲法 §1.5-1）', () => {
  const field = neutralField(8);
  const cond = conditions();

  it('純関数のクランプは上下両端で効く（R-2）', () => {
    expect(clampInterventionMult(5, B)).toBeCloseTo(1.1, 10);
    expect(clampInterventionMult(100, B)).toBeCloseTo(1.1, 10);
    expect(clampInterventionMult(0.1, B)).toBeCloseTo(0.9, 10);
    expect(clampInterventionMult(-3, B)).toBeCloseTo(0.9, 10);
    expect(clampInterventionMult(1.05, B)).toBeCloseTo(1.05, 10);
    // 非有限は 1 に倒す（NaN を素通しすると着順が入力順のまま静かに壊れる）
    expect(clampInterventionMult(Number.NaN, B)).toBe(1);
    expect(clampInterventionMult(Number.POSITIVE_INFINITY, B)).toBe(1);
    expect(clampInterventionMult(Number.NEGATIVE_INFINITY, B)).toBe(1);
  });

  it('★interventionMult=100 を渡してもレースを支配できない', () => {
    // 最弱の馬に 100 を渡す。クランプが無ければ必ず1着になる
    const weak = neutralEntrant('WEAK', {
      gate: 9,
      stats: { sp: 10, st: 10, pw: 10, gt: 10, iq: 10 },
    });
    const entrants = [...field, weak];
    const r = resolveRace({
      conditions: cond,
      entrants,
      seed: 7,
      balance: B,
      interventionMults: new Map([['WEAK', 100]]),
    });
    const row = r.order.find((o) => o.horseId === 'WEAK');
    expect(row?.interventionMult).toBeCloseTo(1.1, 10);
    expect(row?.finishPosition).toBe(entrants.length);
    // 記録が残る（黙って直さない）
    expect(r.capViolations).toHaveLength(1);
    expect(r.capViolations[0]?.received).toBe(100);
    expect(r.capViolations[0]?.applied).toBeCloseTo(1.1, 10);
  });

  it('★NaN / Infinity を渡しても着順が壊れない', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      const r = resolveRace({
        conditions: cond,
        entrants: field,
        seed: 11,
        balance: B,
        interventionMults: new Map([['H002', bad]]),
      });
      for (const row of r.order) {
        expect(Number.isFinite(row.finalScore), `${String(bad)}: finalScore`).toBe(true);
      }
      // 着順は降順のまま
      for (let i = 1; i < r.order.length; i++) {
        expect(r.order[i - 1]?.finalScore).toBeGreaterThanOrEqual(r.order[i]?.finalScore ?? 0);
      }
      expect(r.capViolations.length).toBe(1);
    }
  });

  it('範囲内の値は素通しで、違反記録も残らない', () => {
    const r = resolveRace({
      conditions: cond,
      entrants: field,
      seed: 11,
      balance: B,
      interventionMults: new Map([['H002', 1.07]]),
    });
    expect(r.order.find((o) => o.horseId === 'H002')?.interventionMult).toBeCloseTo(1.07, 10);
    expect(r.capViolations).toEqual([]);
  });

  it('レース側とキャップ定数が介入側と一致している（二重管理のずれを検出）', () => {
    expect(B.INTERVENTION_CAP).toBe(IB.INTERVENTION_CAP);
  });

  it('★V-9a の不変条件: どんな入力でも適用倍率が 0.90〜1.10 に収まる', () => {
    const inputs = [-100, -1, 0, 0.5, 0.89, 0.9, 1, 1.1, 1.11, 3, 1e9, Number.NaN];
    for (const v of inputs) {
      const r = resolveRace({
        conditions: cond,
        entrants: field,
        seed: 3,
        balance: B,
        interventionMults: new Map([['H001', v]]),
      });
      const applied = r.order.find((o) => o.horseId === 'H001')?.interventionMult ?? 0;
      expect(applied, `入力 ${String(v)}`).toBeGreaterThanOrEqual(0.9);
      expect(applied, `入力 ${String(v)}`).toBeLessThanOrEqual(1.1);
    }
  });
});
