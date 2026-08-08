/**
 * A-2「強制終了して再起動しても二重生成・二重払戻が起きない」を**壊して確かめる**。
 *
 * ★正常系が動くことは A-1 で分かります。ここは異常系だけを起こします。
 */

import { describe, expect, it } from 'vitest';
import { CYCLE_MS } from '@star/scheduler';
import { LOCK_KEY, runCycle, type CycleStore, type RaceSpec } from '../src/cycle-runner.js';
import { assertEnvironmentMatches, loadConfig } from '../src/env.js';

const EPOCH = 1_700_000_000_000;

/** テスト用の seed 源。★決定論（同じサイクルからは同じ値） */
/** テスト用の出走表・オッズ（中身は問わない。runCycle は素通しするだけ） */
const BUILD = () => ({ entrants: [], odds: [] });

const SEEDS = {
  serverSeed: (i: number) => `seed-${i}`,
  seedCommit: (i: number) => `commit-${i}`,
};

/** 記録つきの偽ストア。**同じレースが2回作られたら記録に残る** */
function makeStore(nowMs: number) {
  const races = new Set<number>();
  const createLog: number[] = [];
  const settleLog: number[] = [];
  let locked = false;
  const store: CycleStore & { createLog: number[]; settleLog: number[]; races: Set<number> } = {
    races,
    createLog,
    settleLog,
    serverNowMs: async () => nowMs,
    tryLock: async () => {
      if (locked) return false;
      locked = true;
      return true;
    },
    unlock: async () => {
      locked = false;
    },
    raceExists: async (i: number) => races.has(i),
    createRace: async (s: RaceSpec) => {
      createLog.push(s.cycleIndex);
      races.add(s.cycleIndex);
    },
    pendingSettlements: async () => [],
    settleRace: async (i: number) => {
      settleLog.push(i);
    },
  };
  return store;
}

describe('★A-2 冪等性（壊して確かめる）', () => {
  it('★同じ時刻で何度回しても、レースは一度しか作られない', async () => {
    const now = EPOCH + 4 * 60_000;
    const store = makeStore(now);
    for (let i = 0; i < 10; i += 1) await runCycle(store, EPOCH, SEEDS, BUILD);
    // 10周しても作成は最初の1回ぶんだけ（先行2レース）
    expect(store.createLog).toEqual([1, 2]);
    expect(new Set(store.createLog).size).toBe(store.createLog.length);
  });

  it('★「再起動」しても作り直さない（ストアは残り、プロセスだけ落ちた想定）', async () => {
    const store = makeStore(EPOCH + 4 * 60_000);
    await runCycle(store, EPOCH, SEEDS, BUILD);
    const before = [...store.createLog];
    // プロセスが落ちて上がり直しても、runCycle をもう一度呼ぶだけ
    await runCycle(store, EPOCH, SEEDS, BUILD);
    await runCycle(store, EPOCH, SEEDS, BUILD);
    expect(store.createLog).toEqual(before);
  });

  it('★ロックが取れないときは何もせず戻る（例外にしない）', async () => {
    const store = makeStore(EPOCH + 4 * 60_000);
    store.tryLock = async () => false;
    const out = await runCycle(store, EPOCH, SEEDS, BUILD);
    expect(out.lockBusy).toBe(true);
    expect(out.created).toEqual([]);
    // ★例外にすると再起動ループになり A-1（24時間稼働）が壊れる
  });

  it('★処理中に例外が出てもロックを解放する（次の周が永久待ちにならない）', async () => {
    const store = makeStore(EPOCH + 4 * 60_000);
    let unlocked = false;
    store.unlock = async () => {
      unlocked = true;
    };
    store.createRace = async () => {
      throw new Error('生成失敗');
    };
    await expect(runCycle(store, EPOCH, SEEDS, BUILD)).rejects.toThrow('生成失敗');
    expect(unlocked).toBe(true);
  });

  it('★時刻が進めば新しいレースだけを作る（既存は作り直さない）', async () => {
    const store = makeStore(EPOCH + 4 * 60_000);
    await runCycle(store, EPOCH, SEEDS, BUILD);
    expect(store.createLog).toEqual([1, 2]);
    store.serverNowMs = async () => EPOCH + CYCLE_MS + 4 * 60_000;
    await runCycle(store, EPOCH, SEEDS, BUILD);
    // 次のサイクルでは 3 だけが増える（2 は既存）
    expect(store.createLog).toEqual([1, 2, 3]);
  });

  it('★ワーカーの時計を使わない（serverNowMs だけを見る）', async () => {
    const store = makeStore(EPOCH + 4 * 60_000);
    const out = await runCycle(store, EPOCH, SEEDS, BUILD);
    expect(out.nowMs).toBe(EPOCH + 4 * 60_000);
    expect(out.cycleIndex).toBe(0);
  });

  it('advisory lock のキーは固定値（用途ごとに衝突させない）', () => {
    expect(LOCK_KEY.CYCLE).toBe(0x5741_0001);
  });
});

describe('★A-7 環境ガード', () => {
  it('★宣言と DB が一致しなければ起動失敗', () => {
    expect(() => assertEnvironmentMatches('staging', 'production')).toThrow(/一致しません/);
    expect(() => assertEnvironmentMatches('production', 'staging')).toThrow(/一致しません/);
  });

  it('★DB に宣言が無ければ起動失敗（不明なら止める）', () => {
    expect(() => assertEnvironmentMatches('production', null)).toThrow(/確認できない/);
  });

  it('一致していれば通る', () => {
    expect(() => assertEnvironmentMatches('production', 'production')).not.toThrow();
  });

  it('★必須の環境変数が欠けていれば起動失敗（空文字も欠落扱い）', () => {
    expect(() => loadConfig({})).toThrow(/STAR_ENV/);
    expect(() => loadConfig({ STAR_ENV: '  ' })).toThrow(/STAR_ENV/);
    expect(() => loadConfig({ STAR_ENV: 'prod' })).toThrow(/不正/);
  });

  it('★起点が ISO8601 でなければ起動失敗', () => {
    expect(() =>
      loadConfig({
        STAR_ENV: 'development',
        STAR_EPOCH_ISO: 'いつか',
        DATABASE_URL: 'x',
        SUPABASE_URL: 'x',
        SUPABASE_SERVICE_ROLE_KEY: 'x',
      }),
    ).toThrow(/ISO8601/);
  });
});
