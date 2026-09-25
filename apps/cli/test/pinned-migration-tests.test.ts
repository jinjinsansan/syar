/**
 * ★**移行ファイルを名指しで固めた検査が、黙って盲になっていないか**（★2026-09-19）
 *
 * 【🔴 ★同じ形を 2 日で 3 件踏みました】
 *   ① `entry-rpc-migration.test.ts` … ★`expect(def.file).toBe('0033_…')` — ★`0039` で落ちた
 *   ② `my-horses-view.test.ts` … ★`VIEW_FILE = '0034_…'` — ★`0040` で列を足しても ★**古い定義を見続けた**
 *   ③ 🔴 ★**①を直した同じファイルに、★同じ形がもう 1 つ残っていました**（`place_bet` の側）
 *
 *   → ★**「1 か所直した」は「その 1 か所を直した」でしかありません**（★裁定 `REVIEW_UI1_SETUP_VERDICT_20260919.md`）。
 *
 * 【★2 つの壊れ方は向きが違います】
 *   ★**うるさい方**: `expect(def.file).toBe('0033_…')` — ★**落ちる**。★ただし
 *     ★**落ちても何も分からない**（★数字を書き換えて終わり）。
 *   🔴 ★**静かな方**: `const sql = read('0025_…')` — ★**落ちません**。
 *     ★後の移行が同じ関数を `create or replace` で置き換えても、★**この検査は古い本文を見続けます**
 *     ＝ ★**緑なのに何も見ていない**。★こちらが本当に怖い方です。
 *
 * 【★この検査が守ること】
 *   ① ★名指しの一覧が ★**実物と合っている**（★消えたファイルを見張り続けない）
 *   ② 🔴 ★**名指しで固めた検査が、1 つ残らず分類されている**（★新しく書いたら、ここに載るまで通れない・R-19）
 *   ③ 🔴 ★**名指ししたファイルで定義された関数が、後の移行で置き換えられていない**
 *     ★置き換えられた瞬間に落ち、★**どの検査が盲になったか**を名指しします
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { otherRegistriesHint } from './lib/registries.js';

const ROOT = path.resolve(__dirname, '../../..');
const MIGRATIONS = path.join(ROOT, 'db/migrations');
const TESTS = __dirname;

const migrationFiles = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort();
const testFiles = readdirSync(TESTS).filter((f) => f.endsWith('.test.ts'));

/** ★`--` のコメントと `comment on … ;` を落とす（★註記の中の語を拾わない） */
const strip = (sql: string): string =>
  sql.replace(/--[^\n]*/g, ' ').replace(/\bcomment\s+on\b[\s\S]*?;/gi, ' ');

/** ★その移行が定義している関数の名前 */
function functionsDefinedIn(file: string): string[] {
  const sql = strip(readFileSync(path.join(MIGRATIONS, file), 'utf8'));
  return [...sql.matchAll(/create\s+(?:or\s+replace\s+)?function\s+(?:public\s*\.\s*)?([a-z_][a-z0-9_]*)\s*\(/gi)]
    .map((m) => m[1]!.toLowerCase());
}

/** ★関数名 → その関数を定義している移行ファイルの並び（★番号順） */
function definitionsByFunction(): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const f of migrationFiles) {
    for (const name of functionsDefinedIn(f)) {
      const list = out.get(name) ?? [];
      if (list[list.length - 1] !== f) list.push(f);
      out.set(name, list);
    }
  }
  return out;
}

/**
 * ★**移行ファイルを名指ししている検査**の分類簿。
 *
 * ★`pinned` … ★**その移行の本文を読む**検査。★後で関数が置き換えられたら盲になります（★③ が見ます）
 * ★`history` … ★**「その移行で起きたこと」**を見る検査。★後の移行で覆っても
 *   ★**「あのとき起きた」ことは変わらない**ので、★盲にはなりません。
 *   ⚠️ ★ただし ★**いまの状態は見ていません** — ★そちらは **V-20**（`verify-anon-exposure.mjs`）が
 *      ★**生きている DB を測って**見ます。★静的な検査に現状の保証をさせないこと。
 * ★`synthetic` … ★**作り物のファイル名**（★検出器そのものを試すための見本）。★実在しません
 */
const PINNED: Readonly<Record<string, string>> = {
  'entry-scratch-migration.test.ts': '0028_entry_scratch.sql',
  /**
   * ★**GB-1 ④⑤⑥ の配線**（★2026-09-19）。★`0053` は ★**列を足すだけ**の移行で、
   *   ★`create or replace function` を持たないので ★**後から置き換えられません**。
   *   → ★`pinned`（★本文を読む）で正しく、★③ が後の置き換えを見張ります。
   */
  'growth-tell-wiring.test.ts': '0053_growth_tell_baseline.sql',
  'horse-sale-migration.test.ts': '0026_horse_sale.sql',
  'stable-grade-unlock-migration.test.ts': '0027_stable_grade_unlock.sql',
};

const CLASSIFIED: Readonly<Record<string, string>> = {
  ...Object.fromEntries(Object.keys(PINNED).map((f) => [f, 'pinned'])),
  /**
   * ★history — ★関数の本文は `lastDefinitionOf()` で探しており、★名指しで見ているのは
   *   ★**`0024` で起きたこと**だけです（★表の作成・権限の剥ぎ・列の既定）。
   *   ⚠️ ★**DDL は `create or replace function` では覚らない**ので、★盲になりません。
   * 🔴 ★ただし 2026-09-19 の時点で ★**`expect(def.file).toBe(MIGRATION)` が 1 つ残っていました**
   *   （★`place_bet` の側）。★同じファイルの `enter_race` 側を直したときに見落としたものです。
   */
  'entry-rpc-migration.test.ts':
    '★history — ★関数の本文は lastDefinitionOf() で探す。★名指しで見ているのは 0024 の DDL と権限だけ',
  /** ★この分類簿そのもの（★一覧にファイル名を書くのが仕事） */
  'pinned-migration-tests.test.ts': '★この分類簿そのもの',
  'my-horses-view.test.ts':
    '★history — ★名指しは註記の中だけ（★2026-09-19 に「最後の定義を探す」形へ直した経緯を残している）',
  /**
   * ★history — ★`buy_horse` は `0070` で定義し直した（★2026-09-22・利用者の行を先にロック）。
   *   ★RPC の振る舞いは ★`lastFunctionBody('buy_horse')`（★最後の定義）で見る。★名指しの `0025` は ★表・台帳の語・権限（★0025 で起きたこと）だけ
   */
  'horse-market-migration.test.ts':
    '★history — ★RPC の本文は lastFunctionBody で最後の定義を読む。★0025 は表・台帳の語・権限だけ',
  /**
   * ★history — ★上限の数は ★`lastFunctionBody`（★最後の定義）で読む。★`0025` を名指しするのは ★**対照だけ**
   *   （★「0025 の定義は数えてからロックしていた」を ★この検査が区別できることを示す）
   */
  'ownership-limits-sql.test.ts':
    '★history — ★本文は lastFunctionBody。★0025 の名指しは「古い定義では落ちる」の対照だけ',
  'rpc-guard.test.ts':
    '★synthetic ＋ history — ★`0001_a.sql` などは検出器を試す作り物。★`0032` は「あのとき閉じた」ことの確認',
  /**
   * ★pinned — ★`0080_daily_ep.sql` を名指しするのは ★**1 か所だけ**で、
   *   ★「`create_account` の ★最後の定義が 0080 であること」を固めています。
   *   ★額そのものは ★`lastFunctionBody('ep_grant_amount')`（★最後の定義）から読むので、
   *   ★0081 以降で定義し直しても ★**正しい方を読み続けます**。
   * ⚠️ ★`create_account` を将来 また定義し直したら ★**この名指しが赤くなります**（★意図どおり）。
   *    ★そのとき ★「額を直に書き戻していないか」を人が見てから、★番号を進めてください。
   */
  'ep-grant-sql.test.ts':
    '★pinned — ★create_account の最後の定義が 0080 であることだけを固める。★額は lastFunctionBody で読む',
  /**
   * ★pinned — ★`0082_jockey_roster_server_side.sql` を名指しするのは ★**2 つの用途**だけです:
   *   ★① ★名簿の転記（`insert into jockeys ... values`）を ★その移行から読む
   *      （★転記は ★**その移行にしか無い**ので、★最新の定義を探す意味がありません）
   *   ★② 🔴 ★**古い `jsonb` の署名を `drop` しているか**を ★その移行の原文で確かめる
   *      （★`drop` は ★**その移行に書いてあることが要件**です）
   *   ★`enter_race` の本文は ★`lastFunctionBody`（★最後の定義）で読みます。
   * ⚠️ ★名簿を後の移行で足したら、★①の切り出しを ★**最後の転記を読む形**に直すこと。
   */
  'jockey-roster-sql.test.ts':
    '★pinned — ★名簿の転記と「古い署名を drop したか」は 0082 の原文で見る。★enter_race の本文は lastFunctionBody',
  /**
   * ★pinned — ★`0083` の原文で ★出す列・出さない列を見ます（★LR-6・D-114）。
   *   ★`0086` の名指しは ★「★戦績の寄せ替えが漏れていないか」を ★1 か所で固めるためです
   *   （★`lastViewBody('retired_horses_public').file` が `0086` であること）。
   * ⚠️ ★戦績をまた別の移行で寄せ直したら ★**この名指しが赤くなります**（★意図どおり）。
   */
  'retired-public-view.test.ts':
    '★pinned — ★`0083` の原文で列を見る。★`0086` の名指しは「戦績の寄せ替えが漏れていないか」だけ',
  'market-public-view.test.ts':
    '★pinned — ★`0085` の原文で列を見る（★名前と戦績を出し、素質を出していない）。'
    + '★戦績の呼び出しは `lastViewBody`（最後の定義）で読む',
  'horse-record-one-place.test.ts':
    '★history ＋ pinned — ★`0086` は唯一の置き場所なので名指し。'
    + '★`0051` / `0082` の名指しは ★**除外の簿**（★enter_race はまだ寄せていない）。'
    + '★本体は `liveFunctionBodies` / `lastViewBody` で ★**いま効いている定義だけ**を見る',
};

describe('★名指しで固めた検査の分類（★2026-09-19）', () => {
  it('★走査が空振りしていない（R-21）', () => {
    expect(migrationFiles.length).toBeGreaterThan(30);
    expect(testFiles.length).toBeGreaterThan(30);
  });

  it('🔴 ② ★移行ファイルを名指ししている検査が、1 つ残らず分類されている（R-19）', () => {
    /** ★`'00NN_….sql'` という文字列を含む検査を、実物から数え上げる（★手書きの一覧にしない） */
    const naming = testFiles.filter((f) =>
      /'[0-9]{4}_[a-z0-9_]+\.sql'/.test(readFileSync(path.join(TESTS, f), 'utf8')));
    expect(naming.length, '★名指ししている検査が 1 つも見つからない（★走査が壊れている）').toBeGreaterThan(0);

    const unclassified = naming.filter((f) => CLASSIFIED[f] === undefined);
    /**
     * ⚠️ ★**ここが赤くなったら、名指しをやめるか、理由付きで載せてください。**
     *    ★`pinned`（本文を読む）なら ★**③ が後の置き換えを見張ります**。
     *    ★`history`（起きたことを見る）なら ★**いまの状態は別の検査が見ていること**を確かめてください。
     */
    expect(
      unclassified,
      '★分類されていない「名指しの検査」'
      + otherRegistriesHint("apps/cli/test/pinned-migration-tests.test.ts の CLASSIFIED"),
    ).toEqual([]);
  });

  it('★分類簿に載っている検査が実在する（★消えた検査を見張り続けない）', () => {
    const ghosts = Object.keys(CLASSIFIED).filter((f) => !testFiles.includes(f));
    expect(ghosts, '★存在しない検査が分類簿にあります').toEqual([]);
  });

  it('★名指しされた移行ファイルが実在する', () => {
    for (const [test, file] of Object.entries(PINNED)) {
      expect(migrationFiles, `★${test} が名指しする ${file} がありません`).toContain(file);
      expect(
        readFileSync(path.join(TESTS, test), 'utf8'),
        `★${test} は ${file} を名指ししていません（★分類簿が古い）`,
      ).toContain(file);
    }
  });

  it('🔴 ③ ★名指しした移行の関数が、後の移行で置き換えられていない（★盲になっていない）', () => {
    const byFunction = definitionsByFunction();
    expect(byFunction.size, '★関数の定義が 1 つも読めていない（R-21）').toBeGreaterThan(5);

    const blind: string[] = [];
    for (const [test, file] of Object.entries(PINNED)) {
      for (const name of functionsDefinedIn(file)) {
        const where = byFunction.get(name) ?? [];
        const last = where[where.length - 1];
        if (last !== undefined && last !== file) {
          blind.push(`${test}: ${name} の最後の定義は ${last}（★名指しは ${file}）`);
        }
      }
    }
    /**
     * ⚠️ ★**ここが赤くなったら、数字を書き換えて済ませないでください。**
     *    ★その検査は ★**古い本文を読んでいます** — ★直すべきは「どのファイルを読むか」ではなく、
     *    ★**「最後の定義を探す」形にすること**です（★`my-horses-view.test.ts` がその形）。
     */
    expect(blind, '★名指しの検査が古い定義を見ています').toEqual([]);
  });
});
