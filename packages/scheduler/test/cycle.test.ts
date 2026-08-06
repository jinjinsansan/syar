/**
 * §10.2 開催サイクル。
 *
 * ★A-2（再起動しても二重生成しない）の前提は「時刻だけから決まること」なので、
 *   ここでは**同じ入力から同じ答えが出ること**と**境界の両側**（R-2）を押さえる。
 */

import { describe, expect, it } from 'vitest';
import {
  CYCLE_MS,
  LOOKAHEAD_RACES,
  ON_GENERATION_FAILURE,
  PHASE_OFFSET_MS,
  cycleIndexAt,
  cycleStartMs,
  isOnSale,
  offsetInCycle,
  phaseAt,
  racesToPrepare,
} from '../src/index.js';

const EPOCH = 1_700_000_000_000;
const at = (min: number, sec = 0): number => EPOCH + min * 60_000 + sec * 1000;

describe('§10.2 タイムテーブルが正典と一致している', () => {
  it('1サイクルは10分（D-007）', () => {
    expect(CYCLE_MS).toBe(600_000);
  });

  it('相対時刻（確定0:00 / 公開0:30 / 発売3:00 / 締切9:30 / 発走10:00）', () => {
    expect(PHASE_OFFSET_MS.settle).toBe(0);
    expect(PHASE_OFFSET_MS.publish).toBe(30_000);
    expect(PHASE_OFFSET_MS.salesOpen).toBe(180_000);
    expect(PHASE_OFFSET_MS.salesClose).toBe(570_000);
    expect(PHASE_OFFSET_MS.start).toBe(600_000);
  });

  it('★フェーズは単調増加（順序が崩れると締切後に買える穴になる）', () => {
    const order = [
      PHASE_OFFSET_MS.settle,
      PHASE_OFFSET_MS.publish,
      PHASE_OFFSET_MS.salesOpen,
      PHASE_OFFSET_MS.salesClose,
      PHASE_OFFSET_MS.start,
    ];
    for (let i = 1; i < order.length; i += 1) expect(order[i]!).toBeGreaterThan(order[i - 1]!);
  });

  it('生成は2レース先まで（§10.2 の障害時バッファ）', () => {
    expect(LOOKAHEAD_RACES).toBe(2);
  });

  it('生成失敗は開催中止＋EP返還（結果の事後差し替えをしない・§8.6）', () => {
    expect(ON_GENERATION_FAILURE).toBe('cancel_and_refund');
  });
});

describe('§10.2 サイクル番号（A-2 冪等性の鍵）', () => {
  it('★同じ時刻からは必ず同じ番号が出る（再起動しても番号が変わらない）', () => {
    for (const t of [at(0), at(7, 12), at(23, 59), at(1000)]) {
      expect(cycleIndexAt(t, EPOCH)).toBe(cycleIndexAt(t, EPOCH));
    }
  });

  it('10分ごとに1つ進む', () => {
    expect(cycleIndexAt(at(0), EPOCH)).toBe(0);
    expect(cycleIndexAt(at(9, 59), EPOCH)).toBe(0);
    expect(cycleIndexAt(at(10), EPOCH)).toBe(1);
    expect(cycleIndexAt(at(144 * 10), EPOCH)).toBe(144); // 1日144R（§10.3）
  });

  it('サイクル先頭の時刻と往復する', () => {
    for (const i of [0, 1, 143, 5000]) {
      expect(cycleIndexAt(cycleStartMs(i, EPOCH), EPOCH)).toBe(i);
    }
  });

  it('★起点より前の時刻でも相を負にしない（時計が巻き戻っても壊れない）', () => {
    const before = EPOCH - 60_000;
    expect(offsetInCycle(before, EPOCH)).toBeGreaterThanOrEqual(0);
    expect(offsetInCycle(before, EPOCH)).toBeLessThan(CYCLE_MS);
  });
});

describe('§10.2 フェーズ判定', () => {
  it('各フェーズに入る', () => {
    expect(phaseAt(at(0), EPOCH)).toBe('settling');
    expect(phaseAt(at(0, 29), EPOCH)).toBe('settling');
    expect(phaseAt(at(0, 30), EPOCH)).toBe('publishing');
    expect(phaseAt(at(3), EPOCH)).toBe('onSale');
    expect(phaseAt(at(9, 30), EPOCH)).toBe('parade');
    expect(phaseAt(at(9, 59), EPOCH)).toBe('parade');
  });

  it('★発売の境界: 開始ちょうどは売る／締切ちょうどは売らない（R-2）', () => {
    expect(isOnSale(at(2, 59), EPOCH)).toBe(false);
    expect(isOnSale(at(3, 0), EPOCH)).toBe(true);
    expect(isOnSale(at(9, 29), EPOCH)).toBe(true);
    // ★等号の向きを間違えると、締切と同時刻の注文が通る
    expect(isOnSale(at(9, 30), EPOCH)).toBe(false);
    expect(isOnSale(at(9, 59), EPOCH)).toBe(false);
  });

  it('次のサイクルでも同じ境界になる（相対時刻で判定している）', () => {
    expect(isOnSale(at(13, 0), EPOCH)).toBe(true);
    expect(isOnSale(at(19, 30), EPOCH)).toBe(false);
  });
});

describe('§10.2 先行生成', () => {
  it('★常に「次」と「その次」を返す（今のサイクルは含めない）', () => {
    // 今のレースを作り直そうとすると、公開済みの出走表を差し替えることになる
    const now = at(4, 0);
    expect(racesToPrepare(now, EPOCH)).toEqual([1, 2]);
    expect(racesToPrepare(at(14, 0), EPOCH)).toEqual([2, 3]);
  });

  it('★同じサイクル内で何度呼んでも同じ一覧（ワーカーが何度起きても同じ）', () => {
    const a = racesToPrepare(at(3, 1), EPOCH);
    const b = racesToPrepare(at(9, 29), EPOCH);
    expect(b).toEqual(a);
  });
});
