/**
 * ★**引数の取りこぼしで黙って既定値に落ちない**（★2026-09-17・V-10 の測定で踏んだ事故）
 *
 * 【★見ている壊れ方】
 *   ① ★**位置引数だけが残る**（★`npm run x -- --races 40` が PowerShell で `x 40` に化けた形）
 *   ② ★知らないフラグを黙って無視する
 *   ③ ★値を取るフラグに値が無いのに走る
 *   ④ ★**真偽値フラグの次の位置引数を食べる**（★2026-08-20 の本番事故の形）
 *
 * ⚠️ ★どれも「★引数が消えて、既定の**広い**動作に落ちる」方向です。
 *    ★狭くなるなら気づきますが、★広くなると黙って余計に効きます。
 */
import { describe, expect, it } from 'vitest';
import { assertKnownArgs, type CliSpec } from '../src/cli-args.js';

const SPEC: CliSpec = {
  valueFlags: ['--races', '--finals', '--seed', '--odds-trials'],
  switches: ['--legacy-conditions'],
};

describe('★引数の検算（2026-09-17 の事故）', () => {
  it('★正しい引数は通る', () => {
    expect(() => assertKnownArgs(['--races', '40'], SPEC, 'verify-pmin')).not.toThrow();
    expect(() => assertKnownArgs([], SPEC, 'verify-pmin')).not.toThrow();
    expect(() => assertKnownArgs(
      ['--races', '40', '--finals', '20000', '--legacy-conditions'], SPEC, 'verify-pmin',
    )).not.toThrow();
  });

  it('① ★★事故そのもの: 位置引数だけが残った形で投げる', () => {
    /**
     * ★`npm run verify:pmin -- --races 40` が PowerShell で
     * ★`tsx verify-pmin.ts 40` に化けたときの argv です。
     * ⚠️ ★以前はこれで **既定の 100 レース**が黙って走り出しました。
     */
    expect(() => assertKnownArgs(['40'], SPEC, 'verify-pmin')).toThrow(/読み取れませんでした/);
  });

  it('② ★知らないフラグで投げる（★黙って無視しない）', () => {
    expect(() => assertKnownArgs(['--race', '40'], SPEC, 'verify-pmin')).toThrow(/知らないフラグ/);
  });

  it('③ ★値を取るフラグに値が無ければ投げる', () => {
    expect(() => assertKnownArgs(['--races'], SPEC, 'verify-pmin')).toThrow(/値が要ります/);
    /** ★次がフラグなら「値」ではない */
    expect(() => assertKnownArgs(['--races', '--finals', '20'], SPEC, 'verify-pmin')).toThrow(/値が要ります/);
  });

  it('④ ★真偽値フラグの次の語を食べない（★2026-08-20 の本番事故の形）', () => {
    /**
     * ★`--legacy-conditions` は値を取りません。★次の `40` を値として食べてしまうと、
     * ★位置引数が消え、★**気づかないまま既定で走ります**。→ ★ここでは「位置引数」として弾かれるのが正しい。
     */
    expect(() => assertKnownArgs(['--legacy-conditions', '40'], SPEC, 'verify-pmin'))
      .toThrow(/読み取れませんでした/);
    /** ★フラグが続く分には通る */
    expect(() => assertKnownArgs(['--legacy-conditions', '--races', '40'], SPEC, 'verify-pmin'))
      .not.toThrow();
  });

  it('★エラーは「どう呼べばよいか」を書いている（★止めるだけにしない）', () => {
    try {
      assertKnownArgs(['40'], SPEC, 'verify-pmin');
      throw new Error('★投げていません');
    } catch (e) {
      const m = (e as Error).message;
      expect(m).toContain('npx tsx');
      expect(m, '★知っているフラグを並べる').toContain('--races');
      expect(m, '★どの道具の話か').toContain('verify-pmin');
    }
  });
});
