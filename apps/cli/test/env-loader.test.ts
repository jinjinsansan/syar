/**
 * ★`tools/lib/env.mjs` — 接続先の選択は `--env` を必須にする（裁定 `REVIEW_AUDIT_FIX2_VERDICT_20260914.md` §3-3・監査 M-5・R-27）
 *
 * 【なぜ】
 *   以前は `--env` を省くと本番（`secrets.production.env`）を読んでいた。
 *   2026-09-14、開発側がその場のスクリプトを `--env` 無しで流し、本番の DB を読んだ（読み取り専用・書き込み無し）。
 *   コマンドに「production」の文字が無いので、道具の外の判定もすり抜けた。**防御は道具の中に置く。**
 *
 * 【この検査】
 *   接続しない。例外は秘密ファイルを読む**前**に出るので、秘密ファイルが無い環境でも同じ結果になる。
 */
import { describe, expect, it } from 'vitest';
// @ts-expect-error -- .mjs の素の JS を読む（型定義は置いていない）
import { envFileName, loadEnv } from '../../../tools/lib/env.mjs';

const argv = (...rest: string[]): string[] => ['node', 'tool.mjs', ...rest];

describe('接続先の選択は --env を必須にする（R-27）', () => {
  it('★--env なし → 例外（本番に落ちない）', () => {
    expect(() => envFileName(argv())).toThrow(/既定は廃止/);
    // 位置引数だけ渡した形（migrate.mjs の `0021` のような使い方）も同じ
    expect(() => envFileName(argv('0021'))).toThrow(/既定は廃止/);
  });

  it('★loadEnv も、秘密ファイルを読む前に例外', () => {
    expect(() => loadEnv(argv())).toThrow(/既定は廃止/);
  });

  it('--env staging → staging ／ --env production → 本番（位置引数と混ざっても）', () => {
    expect(envFileName(argv('--env', 'staging'))).toBe('secrets.staging.env');
    expect(envFileName(argv('--env', 'production'))).toBe('secrets.production.env');
    expect(envFileName(argv('0021', '--env', 'staging'))).toBe('secrets.staging.env');
  });

  it('値の無い --env・知らない値・廃止した local → 例外', () => {
    expect(() => envFileName(argv('--env'))).toThrow(/production か staging/);
    expect(() => envFileName(argv('--env', 'prod'))).toThrow(/production か staging/);
    expect(() => envFileName(argv('--env', 'local'))).toThrow(/local/);
  });
});
