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
  overdueBefore,
  phaseAt,
  racesToPrepare,
} from '../src/index.js';

const EPOCH = 1_700_000_000_000;
const at = (min: number, sec = 0): number => EPOCH + min * 60_000 + sec * 1000;

describe('§10.2 タイムテーブルが正典と一致している', () => {
  it('★1サイクルは3分（D-007 改訂・2026-09-18）', () => {
    expect(CYCLE_MS).toBe(180_000);
  });

  it('★相対時刻（確定0:00 / 公開0:20 / 発売0:30 / 締切2:30 / 発走3:00）', () => {
    // ★正典 §10.2 の表の写しなので、定数ではなくリテラルで置く（★定数を動かすと一緒に動く形にしない）
    expect(PHASE_OFFSET_MS.settle).toBe(0);
    expect(PHASE_OFFSET_MS.publish).toBe(20_000);
    expect(PHASE_OFFSET_MS.salesOpen).toBe(30_000);
    expect(PHASE_OFFSET_MS.salesClose).toBe(150_000);
    expect(PHASE_OFFSET_MS.start).toBe(180_000);
  });

  it('★発売の長さは 2 分ある（★短すぎると客が買えない・D-007 改訂 ①）', () => {
    expect(PHASE_OFFSET_MS.salesClose - PHASE_OFFSET_MS.salesOpen).toBe(120_000);
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

  it('★3分ごとに1つ進む', () => {
    expect(cycleIndexAt(at(0), EPOCH)).toBe(0);
    expect(cycleIndexAt(at(2, 59), EPOCH)).toBe(0);
    expect(cycleIndexAt(at(3), EPOCH)).toBe(1);
    expect(cycleIndexAt(at(480 * 3), EPOCH)).toBe(480); // ★1日480R（§10.3・D-007 改訂）
  });

  it('サイクル先頭の時刻と往復する', () => {
    for (const i of [0, 1, 479, 5000]) {
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
    expect(phaseAt(at(0, 19), EPOCH)).toBe('settling');
    expect(phaseAt(at(0, 20), EPOCH)).toBe('publishing');
    expect(phaseAt(at(0, 45), EPOCH)).toBe('onSale');
    expect(phaseAt(at(2, 30), EPOCH)).toBe('parade');
    expect(phaseAt(at(2, 59), EPOCH)).toBe('parade');
  });

  it('★発売の境界: 開始ちょうどは売る／締切ちょうどは売らない（R-2）', () => {
    expect(isOnSale(at(0, 29), EPOCH)).toBe(false);
    expect(isOnSale(at(0, 30), EPOCH)).toBe(true);
    expect(isOnSale(at(2, 29), EPOCH)).toBe(true);
    // ★等号の向きを間違えると、締切と同時刻の注文が通る
    expect(isOnSale(at(2, 30), EPOCH)).toBe(false);
    expect(isOnSale(at(2, 59), EPOCH)).toBe(false);
  });

  it('次のサイクルでも同じ境界になる（相対時刻で判定している）', () => {
    expect(isOnSale(at(3, 30), EPOCH)).toBe(true);   // ★2 周目の 0:30
    expect(isOnSale(at(5, 30), EPOCH)).toBe(false);  // ★2 周目の 2:30（締切ちょうど）
  });
});

describe('§10.2 先行生成', () => {
  it('★常に「次」と「その次」を返す（今のサイクルは含めない）', () => {
    // 今のレースを作り直そうとすると、公開済みの出走表を差し替えることになる
    const now = at(1, 0);
    expect(racesToPrepare(now, EPOCH)).toEqual([1, 2]);
    expect(racesToPrepare(at(4, 0), EPOCH)).toEqual([2, 3]);
  });

  it('★同じサイクル内で何度呼んでも同じ一覧（ワーカーが何度起きても同じ）', () => {
    const a = racesToPrepare(at(0, 31), EPOCH);
    const b = racesToPrepare(at(2, 29), EPOCH);
    expect(b).toEqual(a);
  });
});

describe('★D-037 確定できないレースを開催中止にする境界', () => {
  // ★閾値に CANCEL_AFTER_START_MS 自身を使わない。使うと定数を動かしたとき
  //   テストも一緒に動き、「守られている」が空振りになる（D-018 で潰した自己検出）。
  //   正典の 60分 をリテラルで置く。
  const MIN = 60_000;
  const NOW = 1_800_000_000_000;

  it('★59分前の発走は中止しない / 61分前は中止する（境界の両側・R-2）', () => {
    expect(NOW - 59 * MIN > overdueBefore(NOW)).toBe(true); // まだ確定を待つ
    expect(NOW - 61 * MIN <= overdueBefore(NOW)).toBe(true); // もう待たない
  });

  it('★配備・再起動・ヘルスチェック待ちを吸収できる長さがある', () => {
    // ヘルスチェックの待ちは 600秒。配備が2回続けて失敗しても中止に至らないこと
    // ★D-007 改訂（3 分サイクル）でも **60 分という時間は変えていない**（AL-10）。
    //   ★変わったのは「何周ぶんか」の数え方だけ（6 サイクル → 20 サイクル）
    expect(NOW - overdueBefore(NOW)).toBeGreaterThan(3 * 600_000);
  });

  it('★かといって客を長く拘束しない（2時間より短い）', () => {
    expect(NOW - overdueBefore(NOW)).toBeLessThan(120 * MIN);
  });
});
