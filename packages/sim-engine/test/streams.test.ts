/**
 * 乱数ストリームの用途 ID（レビュー側 2026-08-07 の指摘への対応）
 *
 * ★疑った現象（同一 index の別ドメインの相関）は**起きていませんでした**が、
 *   番号が重なりうる構造は実在していました。
 *   相関の検定が否定したのは「今この瞬間に壊れているか」であって「壊れうるか」ではありません。
 */

import { describe, expect, it } from 'vitest';
import {
  ALL_STREAM_TABLES,
  DIAGNOSTIC_STREAM,
  GENETICS_STREAM,
  PRESEED_STREAM,
  RACE_STREAM,
  VERIFY_PAYOUT_STREAM,
  VERIFY_RACE_STREAM,
  deriveRng,
  duplicateStreamIds,
} from '../src/index.js';

describe('乱数ストリーム ID の一意性', () => {
  it('★用途 ID が重複していない（重なると同じ index で同じ系列を引く）', () => {
    expect(duplicateStreamIds()).toEqual([]);
  });

  it('★すべての表が重複検査の対象に入っている（R-19: 網羅範囲が自動で広がること）', () => {
    // 表を新設して ALL_STREAM_TABLES に入れ忘れると、重複検査を素通りする。
    // 「件数が同じまま増えないことは、成功ではなく縮小の兆候」
    const registered = new Set(Object.values(ALL_STREAM_TABLES));
    for (const t of [
      GENETICS_STREAM,
      RACE_STREAM,
      VERIFY_RACE_STREAM,
      VERIFY_PAYOUT_STREAM,
      PRESEED_STREAM,
      DIAGNOSTIC_STREAM,
    ]) {
      expect(registered.has(t)).toBe(true);
    }
    // 表の数そのものも押さえる（増やしたらこのテストが落ち、登録を促す）
    expect(Object.keys(ALL_STREAM_TABLES).length).toBe(6);
  });

  it('★すべての ID が正の整数（0 や小数だと衝突の元になる）', () => {
    for (const ids of Object.values(ALL_STREAM_TABLES)) {
      for (const [name, id] of Object.entries(ids)) {
        expect(Number.isInteger(id), name).toBe(true);
        expect(id, name).toBeGreaterThan(0);
      }
    }
  });

  it('★§9.2: オッズ算出と本番確定が別 ID である（同じだと同じ結果を引く）', () => {
    expect(VERIFY_PAYOUT_STREAM.ODDS).not.toBe(VERIFY_PAYOUT_STREAM.FINAL);
    expect(VERIFY_RACE_STREAM.POPULARITY).not.toBe(VERIFY_RACE_STREAM.DECIDE);
  });

  it('★別 ID・同 index からは別のシードが出る', () => {
    for (let i = 0; i < 50; i += 1) {
      const a = deriveRng(42, VERIFY_PAYOUT_STREAM.ODDS, i).nextUint32();
      const b = deriveRng(42, VERIFY_PAYOUT_STREAM.FINAL, i).nextUint32();
      expect(a).not.toBe(b);
    }
  });
});
