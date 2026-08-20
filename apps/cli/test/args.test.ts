/**
 * ★引数解析（`tools/lib/args.mjs`）— 2026-08-20 に本番へ意図しないマイグレーションを当てた事故の再発防止。
 *
 * 【何が起きたか】
 *   `migrate.mjs` は位置引数を「`--` で始まる語の**次**は、その語の値」という決め打ちで拾っていた。
 *   そこへ真偽値フラグ `--yes-production` を足した瞬間、
 *
 *     migrate.mjs --env production --yes-production 0017
 *
 *   の `0017` が `--yes-production` の値と見なされて消え、**位置引数なし＝「未適用を全部当てる」**に化けた。
 *
 * 【★この試験が守る性質】
 *   **真偽値フラグを足しても、位置引数が消えないこと。**
 *   ★壊れ方が「引数が消えて、既定の**広い**動作に落ちる」方向だったのが最悪だった
 *     （狭くなるなら気づく。広くなると黙って余計に効く）。
 */

import { describe, expect, it } from 'vitest';
// @ts-expect-error -- .mjs の素の JS を読む（型定義は置いていない）
import { parseArgs } from '../../../tools/lib/args.mjs';

const VALUE_FLAGS = ['--env', '--baseline'];

describe('引数解析', () => {
  it('★真偽値フラグの直後に置いた位置引数を食べない（事故そのものの形）', () => {
    const r = parseArgs(['--env', 'production', '--yes-production', '0017'], VALUE_FLAGS);
    expect(r.positionals).toEqual(['0017']);      // ★ここが [] になると本番に全件当たる
    expect(r.flags['--env']).toBe('production');
    expect(r.switches.has('--yes-production')).toBe(true);
  });

  it('★値を取るフラグの値は位置引数に混ざらない', () => {
    const r = parseArgs(['--env', 'staging', '0010'], VALUE_FLAGS);
    expect(r.positionals).toEqual(['0010']);
    expect(r.flags['--env']).toBe('staging');
  });

  it('★真偽値フラグが複数並んでも位置引数は残る', () => {
    const r = parseArgs(['--a', '--b', '--env', 'staging', '--c', '0012'], VALUE_FLAGS);
    expect(r.positionals).toEqual(['0012']);
    expect(r.switches.has('--a')).toBe(true);
    expect(r.switches.has('--c')).toBe(true);
  });

  it('位置引数が無ければ空（＝呼び出し側が「全部」と解釈する）', () => {
    const r = parseArgs(['--env', 'staging'], VALUE_FLAGS);
    expect(r.positionals).toEqual([]);
  });

  it('★値を取るフラグに値が無ければ落とす（黙って真偽値に降格しない）', () => {
    expect(() => parseArgs(['--env'], VALUE_FLAGS)).toThrow();
    expect(() => parseArgs(['--env', '--yes-production'], VALUE_FLAGS)).toThrow();
  });

  it('位置引数が複数あっても順序を保つ', () => {
    const r = parseArgs(['0001', '--env', 'staging', '0002'], VALUE_FLAGS);
    expect(r.positionals).toEqual(['0001', '0002']);
  });
});
