/**
 * ★D-080 — すべての書き込み RPC が `assert_setup_complete()` を呼んでいること（走査型）
 *
 * 【なぜ走査型か】
 *   裁定（2026-08-20）:
 *     > **メタテストは、手書きの一覧ではなく走査型にしてください。**
 *     > すべての書き込み RPC を列挙し、`assert_setup_complete()` を呼んでいないものがあれば落ちる。
 *     > **除外は明示の登録簿でのみ許す。**
 *
 *   **この案件では、手書きの列挙が4回漏れています**（R-29）:
 *     Q-3 の走査境界／`classification.mjs` の登録漏れ／anon 露出の対象／`0002` の revoke（TRUNCATE）。
 *   → **新しい RPC を黙って足せなくする**のが目的です。
 *     `tool-guard.test.ts` が `tools/*.mjs` に、V-20 ③ が public のテーブルに対して
 *     やっているのと同じ形です。
 *
 * 【走査の対象】
 *   `db/migrations/*.sql` に定義されたすべての関数のうち、**最後に定義されたもの**を見ます。
 *   ★同じ関数が複数のマイグレーションで再定義されることがあるため
 *     （`spend_training_ep` は `0013` と `0014` の両方にあり、**効いているのは後のほう**）。
 *     **前のものを見て「呼んでいない」と判定すると、直したのに落ち続けます。**
 */

import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const ROOT = new URL('../../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const DIR = `${ROOT}db/migrations`;

/**
 * ★読み取り専用の関数は除外してよい（登録簿）。
 *   ⚠️ ここに足すのは「状態を変えない関数」だけ。**書き込む関数を逃がさないこと。**
 */
const READONLY_FUNCTIONS = [
  // ガード自身。呼ぶ側であって呼ばれる側なので、自分を呼ばない
  'assert_setup_complete',
];

/** マイグレーションを番号順に読み、関数名 → 最後の定義本文 を作る */
function latestFunctionBodies(): Map<string, { file: string; body: string }> {
  const files = readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort();
  const out = new Map<string, { file: string; body: string }>();
  for (const f of files) {
    const sql = readFileSync(`${DIR}/${f}`, 'utf8');
    // `create [or replace] function [schema.]<name>(` … 次の `create ... function` か末尾まで
    //
    // ★スキーマ修飾を許すこと。`0020` は `pg_get_functiondef()` の出力なので
    //   `CREATE OR REPLACE FUNCTION public.place_bet(...)` の形になる。
    //   修飾を許さない版では **`0020` の定義を1つも拾えず、古い `0002` の定義で判定**していた
    //   （＝直したのに落ち続ける）。**走査器の取りこぼしは、対象が全部消えれば「合格」にもなる。**
    const re = /create\s+(?:or\s+replace\s+)?function\s+(?:[a-z_][a-z0-9_]*\.)?([a-z_][a-z0-9_]*)\s*\(/gi;
    const hits = [...sql.matchAll(re)];
    for (let i = 0; i < hits.length; i += 1) {
      const name = hits[i]![1]!;
      const start = hits[i]!.index!;
      const end = i + 1 < hits.length ? hits[i + 1]!.index! : sql.length;
      out.set(name, { file: f, body: sql.slice(start, end) });
    }
  }
  return out;
}

describe('D-080 書き込み RPC のセットアップ判定', () => {
  const bodies = latestFunctionBodies();

  it('マイグレーションから関数を1つ以上拾えている（★走査が空振りしていないこと）', () => {
    // 0件は「全部合格」に見えてしまう。走査器が動いていることを先に確かめる（R-11）
    expect(bodies.size).toBeGreaterThanOrEqual(4);
    expect([...bodies.keys()]).toContain('place_bet');
  });

  it('★すべての書き込み RPC が assert_setup_complete() を呼ぶ', () => {
    const missing: string[] = [];
    for (const [name, { file, body }] of bodies) {
      if (READONLY_FUNCTIONS.includes(name)) continue;
      if (!body.includes('assert_setup_complete()')) missing.push(`${name}（最後の定義: ${file}）`);
    }
    expect(
      missing,
      `★assert_setup_complete() を呼んでいない書き込み RPC があります。\n` +
        `  D-080: 落ち方を RPC ごとにばらけさせない。読み取り専用なら登録簿に明示すること:\n  ${missing.join('\n  ')}`,
    ).toEqual([]);
  });

  it('★同じ関数が再定義されていたら、最後の定義で判定している', () => {
    // spend_training_ep は 0013 / 0014 / 0020 にある。効いているのは 0020
    const s = bodies.get('spend_training_ep');
    expect(s).toBeDefined();
    expect(s!.file.startsWith('0020')).toBe(true);
  });

  it('★スキーマ修飾された定義を拾えている（拾えないと古い定義で判定してしまう）', () => {
    // 0020 は pg_get_functiondef の出力なので `public.place_bet(` の形
    for (const name of ['place_bet', 'exchange_prize', 'spend_training_ep']) {
      expect(bodies.get(name)?.file.startsWith('0020'), `${name} が 0020 から拾えていない`).toBe(true);
    }
  });

  it('除外簿に載せてよいのは状態を変えない関数だけ', () => {
    // ★書き込み RPC の名前を除外簿に入れられないようにする
    for (const n of READONLY_FUNCTIONS) {
      expect(['place_bet', 'exchange_prize', 'spend_training_ep']).not.toContain(n);
    }
  });
});
