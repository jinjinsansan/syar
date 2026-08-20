/**
 * ★R-24: 状態を変えるツールを本番から締め出す構造を、**書式で強制する**メタテスト
 *
 * 【背景】
 *   `verify-a2.mjs` は `delete from races where cycle_index is not null` で
 *   **本番のレースを全件削除**する実装でした。
 *   `verify-a7.mjs` は `app_environment` を 'development' に固定して終わり、
 *   ★**A-7 のガードが正しく働くぶん、確実に本番ワーカーが起動しなくなる**うえ、
 *     **次の再起動まで顕在化しない**ので流した本人が気づけません。
 *
 * 【このテストが保証すること】
 *   1. `tools/*.mjs` は**すべて分類簿に載っている**（新しいツールを黙って足せない）
 *   2. `stateChanging` のものは**必ず `assertNotProduction` を呼んでいる**
 *   3. ガード自体が**4通りすべてで正しく振る舞う**
 *
 *   ★当初これを grep で分類しようとして2回外しました（`grep -P` が使えず全件
 *     「読取専用」／`migrate.mjs` は DDL が .sql 側にあるので誤判定）。
 *     **見た目からは決まらないので、明示した登録簿を検査します。**
 */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PRODUCTION_OPS, READONLY, STATE_CHANGING, allClassified } from '../../../tools/lib/classification.mjs';
import { assertNotProduction } from '../../../tools/lib/guard.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const toolFiles = readdirSync(`${ROOT}tools`).filter((f) => f.endsWith('.mjs'));

/** 最小限の偽クライアント */
const fake = (impl: () => Promise<{ rows: { environment: string }[] }>) =>
  ({ query: impl }) as unknown as Parameters<typeof assertNotProduction>[0];

describe('★R-24 ツールの分類（メタテスト）', () => {
  it('★tools/*.mjs はすべて分類簿に載っている', () => {
    const classified = new Set(allClassified());
    const missing = toolFiles.filter((f) => !classified.has(f));
    expect(
      missing,
      `分類の登録漏れ。tools/lib/classification.mjs の READONLY / STATE_CHANGING / PRODUCTION_OPS のどれかに載せてください:\n  ${missing.join('\n  ')}`,
    ).toEqual([]);
  });

  it('★分類簿に載っているファイルが実在する（消えたツールが残っていない）', () => {
    const actual = new Set(toolFiles);
    const ghosts = allClassified().filter((f) => !actual.has(f));
    expect(ghosts, `存在しないファイルが分類簿にあります:\n  ${ghosts.join('\n  ')}`).toEqual([]);
  });

  it('★状態を変えるツールは必ず assertNotProduction を呼ぶ', () => {
    const unguarded = STATE_CHANGING.filter(
      (f) => !readFileSync(`${ROOT}tools/${f}`, 'utf8').includes('assertNotProduction('),
    );
    expect(
      unguarded,
      `本番に向けたら止まる仕掛けがありません:\n  ${unguarded.join('\n  ')}`,
    ).toEqual([]);
  });

  it('★読取専用に分類したものは書き込み文を持たない', () => {
    // ★分類簿が実態とずれていないかを、こちら側からも当てる（R-13 の形）
    //
    // 【2026-08-20: `truncate` を「語」から「文の形」に変えた】
    //   `verify-anon-exposure.mjs` は **「anon に truncate 権限が付いていないか」を検査する**
    //   ツールなので、語としての `truncate` を必然的に含みます（V-20 ①）。
    //   ★語で弾くと、**書き込みを検査するツールが書き込むツールに見えます。**
    //   → `truncate <識別子>` の形だけを書き込み文とみなす。
    //   （他の3つは元から文の形なので変更していません）
    const write = /insert into|update [a-z_]+ set|delete from|truncate\s+(table\s+)?["a-z_]|alter table/i;

    // ★検出器が鈍っていないことを、ここで確かめる（R-14: 検出器は自分自身を検査しない）
    for (const sample of [
      'insert into t values (1)',
      'delete from t where x',
      'update horses set stats = 1',
      'truncate t',
      'truncate table t',
      'alter table t add column c int',
    ]) {
      expect(write.test(sample), `★検出器がこれを見逃します: ${sample}`).toBe(true);
    }

    const lying = READONLY.filter((f) => write.test(readFileSync(`${ROOT}tools/${f}`, 'utf8')));
    expect(lying, `読取専用と分類されているのに書き込み文があります:\n  ${lying.join('\n  ')}`).toEqual([]);
  });

  it('★本番に向けてよいものは理由が書かれている', () => {
    for (const e of PRODUCTION_OPS) {
      expect(e.why.length, `${e.file} の理由が短すぎます`).toBeGreaterThan(20);
    }
  });
});

describe('★R-24 ガード本体（4通り）', () => {
  it('production は拒否する', async () => {
    await expect(
      assertNotProduction(fake(async () => ({ rows: [{ environment: 'production' }] })), 't'),
    ).rejects.toThrow(/production/);
  });

  it('development は通す', async () => {
    await expect(
      assertNotProduction(fake(async () => ({ rows: [{ environment: 'development' }] })), 't'),
    ).resolves.toBe('development');
  });

  it('★宣言が無い DB も拒否する（「宣言が無い＝本番でない」ではない）', async () => {
    await expect(assertNotProduction(fake(async () => ({ rows: [] })), 't')).rejects.toThrow(/宣言がありません/);
  });

  it('★読めなかったときも拒否する（読めない＝本番でない、ではない）', async () => {
    await expect(
      assertNotProduction(
        fake(async () => {
          throw new Error('接続断');
        }),
        't',
      ),
    ).rejects.toThrow(/判断できない/);
  });
});
