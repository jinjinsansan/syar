/**
 * ★`pg` の bigint 変換。**2回踏んだので入口で1度だけ直す**（型パーサ）。
 *   ここで守るのは「変換される」ことと「安全範囲を超えたら止まる」ことの両方です。
 */
import { describe, expect, it } from 'vitest';
import pg from 'pg';
import { INT8_OID, NUMERIC_OID, assertPgTypesConfigured, parseInt8 } from '../src/pg-types.js';

describe('★pg の bigint を入口で数値にする', () => {
  it('★import しただけで型パーサが設定されている', () => {
    expect(() => assertPgTypesConfigured()).not.toThrow();
    expect(pg.types.getTypeParser(INT8_OID)('12345')).toBe(12345);
    expect(typeof pg.types.getTypeParser(INT8_OID)('12345')).toBe('number');
  });

  it('★金額として現実的な桁は誤差なく通る', () => {
    // §9.4 の1日上限 500,000 EP。台帳の累計でも桁が足りる
    expect(parseInt8('500000')).toBe(500_000);
    expect(parseInt8('9007199254740991')).toBe(9_007_199_254_740_991); // 2^53 − 1
  });

  it('★安全範囲を超えたら黙って丸めず例外にする（R-3）', () => {
    // ★Number('9007199254740993') は静かに ...992 になる。
    //   台帳の金額でそれが起きると客の残高がずれるので、止める。
    expect(Number('9007199254740993')).toBe(9_007_199_254_740_992); // 静かにずれる例
    expect(() => parseInt8('9007199254740993')).toThrow();
  });

  it('★numeric は変換しない（小数を持てるため）', () => {
    // ★実測: `select sum(delta) from ep_ledger` は OID 1700 で返る。
    //   一律に number 化すると小数が壊れるので、集計は呼ぶ側が明示的に変換する。
    expect(pg.types.getTypeParser(NUMERIC_OID)('1.5')).toBe('1.5');
  });
});
