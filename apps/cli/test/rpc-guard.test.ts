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
 *     （`spend_training_ep` は `0013`・`0014`・`0020`・`0021` にあり、**効いているのは最後のもの**）。
 *     **前のものを見て「呼んでいない」と判定すると、直したのに落ち続けます。**
 *
 * 【★ワーカー専用関数（2026-09-14・監査 H-3＋H-4・D-095 候補）】
 *   D-080 は「利用者が呼ぶ RPC」を前提にした決定でした。ワーカーだけが呼ぶ `spend_training_ep` にも
 *   この判定を課し、それを満たすために入れた 1 行（`0020`）が、**ワーカーの呼び出しを毎回「未認証」で
 *   弾いていました**（H-3・検査を満たすための変更が副作用の経路になった・R-26）。
 *   → ワーカー専用関数は登録簿に載せ、`assert_setup_complete()` の代わりに次を要求します:
 *     ① 最後の定義より後に、public・anon・authenticated からの revoke がある
 *     ② その revoke より後に、それらのロールへの grant が無い
 *     ③ 本体で `auth.uid()` を使わない（呼んでいるのが誰かに依存しない）
 *   ★利用者が呼ぶ RPC（`place_bet`・`exchange_prize`）はこの登録簿に入れられません。
 */

import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { EP_SHORT_SQLSTATE, classifySpendError } from '../../worker/src/training-runner.js';

const ROOT = new URL('../../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const DIR = `${ROOT}db/migrations`;

/**
 * ★読み取り専用の関数は除外してよい（登録簿）。
 *   ⚠️ ここに足すのは「状態を変えない関数」だけ。**書き込む関数を逃がさないこと。**
 */
const READONLY_FUNCTIONS = [
  // ガード自身。呼ぶ側であって呼ばれる側なので、自分を呼ばない
  'assert_setup_complete',
  // ★初期馬の候補かの判定（`0031`）。`language sql stable` で**状態を変えない**
  //   （★書き込む関数をここに入れられないよう、下の「除外簿に載せてよいのは…」が弾く）
  'is_initial_horse_candidate',
  /**
   * ★初期馬の候補の集合（`0037`・UI1-1）。`language sql stable` で**状態を変えない**。
   *   ★`is_initial_horse_candidate` はこれに id を渡すだけの包みになったので、★**同じ区分**です。
   * ⚠️ ★利用者からも呼べません（`revoke all ... from public, anon, authenticated`）が、
   *    ★区分の根拠は★**「状態を変えない」**の方です。
   */
  'initial_horse_candidates',
  /**
   * ★あと何 EP 投票できるか（`0044`・`0045`・BT-1/BT-2）。`language plpgsql stable` で**状態を変えない**。
   *   ★`place_bet`（書き込む側）が `assert_setup_complete()` を呼んでおり、★こちらは**その中から呼ばれます**。
   * ⚠️ ★利用者からは呼べません（`revoke all ... from public, anon, authenticated`）が、
   *    ★区分の根拠は★**「状態を変えない」**の方です。
   */
  'bet_allowance',
  /**
   * ★画面が読む「あと何 EP 投票できるか」（`0047`・**BT-5**）。`language plpgsql stable` で**状態を変えない**。
   *   🔴 ★`0044` では ★**ビュー**でした。★ビューは引数を取れず、★券種を渡せないため
   *      ★**`null` を渡していて、全券種の合計を 1 券種とみなしていました**（★誤った数を表示）。
   *      → ★`0047` で ★**関数**にしたので、★この登録簿に載ります。
   * ⚠️ ★区分の根拠は ★**「状態を変えない」**です（★`authenticated` からは呼べます）。
   *    ★書き込む側（`place_bet`）は自分で `assert_setup_complete()` を呼びます。
   */
  'my_bet_allowance',
];

/**
 * ★ワーカー専用関数の登録簿（D-095 候補・裁定 §4-2）。
 *   利用者のロールから実行できない代わりに、`assert_setup_complete()` を要求しない。
 *   ⚠️ **利用者が呼ぶ RPC をここへ入れないこと**（入れると D-080 の判定が外れる）。
 */
const WORKER_ONLY_FUNCTIONS = [
  'spend_training_ep',
  /**
   * ★初期馬を 1 頭選ぶ（`0037`・UI1-6）。
   *   ★**除外簿に入れない理由**: ★`volatile` で、★`for update ... skip locked` で**行を掴みます**。
   *     ★台帳を動かしませんが、★「状態を変えない」と名乗るべきではありません。
   *   ★**この簿の条件を満たす**: ① 利用者ロールから実行できない（★定義の後に
   *     ★`public` / `anon` / `authenticated` を revoke）② 本体で `auth.uid()` を使わない。
   * ⚠️ ★**呼ぶのはワーカーではなく `create_account` です**（★簿の名前は「利用者から呼べない」の意）。
   *    ★画面に渡すと★**「選ぶ → 渡す」の 2 本立て**になり、★間に割り込まれて別の馬になりえます
   *    （★照会 `QUESTIONS_UI_SETUP_HORSE_20260918.md` §2 の案 B の穴）。
   */
  'pick_initial_horse',
];

/**
 * ★**第三の登録簿 — 口座を作る側の RPC**（2026-09-18・裁定
 *   `REVIEW_SETUP_PREDICATE_VERDICT_20260918.md` §3-2）。
 *
 * 【なぜ既存の 2 つに入れられないか】
 *   除外簿 … ★**状態を変えない関数だけ**（下の「除外簿に載せてよいのは…」が弾く）→ これは書き込む
 *   ワーカー専用簿 … ★**利用者から実行できず `auth.uid()` を使わない**こと → これは両方する
 *   ★上の `USER_RPCS` の註記が「利用者が呼ぶ書き込み RPC は、どちらにも入れられない」と明言している
 *
 * 【なぜ `assert_setup_complete()` を呼べないか】
 *   あれは `users` 行の存在を要求する（`0019`）。★**この簿の RPC はその行を作る側**なので順序が逆で、
 *   呼べば必ず自分で落ちる。`0030` 以降は `email_confirmed_at` も要求するため、なおさら。
 *
 * 【★だから「代わりに要求すること」を検査で固定する】
 *   ⚠️ ★**簿に載せるだけで中身を要求しないと、「例外にした」が「無検査にした」になる**（R-16）。
 *   ① `auth.uid()` が null なら弾く
 *   ② ★`email_confirmed_at` を**この RPC 自身の中でも**確認する（D-113 ④・設定 1 枚に頼らない）
 *   ③ `dedupe_key` で冪等（`0025`・`0026` と同形）
 */
const ACCOUNT_CREATING_FUNCTIONS = ['create_account'];

/** 利用者が呼ぶ書き込み RPC。どちらの登録簿にも入れられない */
const USER_RPCS = ['place_bet', 'exchange_prize'];

/** ワーカー専用関数から実行権限を剥がすべきロール */
const USER_ROLES = ['public', 'anon', 'authenticated'];

interface Migration {
  readonly file: string;
  readonly sql: string;
}

function readMigrations(): Migration[] {
  return readdirSync(DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((file) => ({ file, sql: readFileSync(`${DIR}/${file}`, 'utf8') }));
}

/** ★`--` のコメントを同じ長さの空白に置き換える（位置を保ったまま、コメント中の語を拾わない） */
const blankComments = (sql: string): string => sql.replace(/--[^\n]*/g, (m) => ' '.repeat(m.length));

/**
 * ★`comment on … is '…';` 文を落とす（2026-09-18）。
 *
 * 【なぜ要るか】
 *   関数の本文は「次の `create function` まで」で切り出すので、★**直後の `comment on` 文も含まれます**。
 *   その**文字列リテラル**に関数名を書くと（★説明としてはむしろ望ましい）、
 *   ★`blankComments` は `--` しか消さないため**リテラルが残り**、
 *   「その関数を呼んでいる」と**誤って判定**します。
 *   ★実例: `0031` の `comment on function create_account(...) is '…assert_setup_complete() は呼ばない…'`
 *   で、**呼んでいないのに「呼んでいる」と出ました**。
 *
 * 【★`blankComments` 自体は変えないこと】
 *   あれは 7 か所から呼ばれており、★**文字列リテラルが残ることを前提にした検査があります**
 *   （★`errcode = '…'` を見ている箇所）。リテラルを一律に消すと**別の検査が静かに通ります**。
 *   → ★**必要な検査だけがこれを使う。**
 *
 * ⚠️ ★註記の語を言い換えて検出器を黙らせる形は採りません（D-108 ③）。**構造の側で直します。**
 */
/** ⚠️ ★`latestFunctionBodies` と `functionPrivilegeStatements` の両方が使います */
const stripFunctionComments = (sql: string): string =>
  blankComments(sql).replace(/\bcomment\s+on\b[\s\S]*?;/gi, (m) => ' '.repeat(m.length));

/** 全マイグレーションを通した位置（ファイル順 → ファイル内の位置） */
const positionOf = (fileIndex: number, offset: number): number => fileIndex * 100_000_000 + offset;

interface Definition {
  readonly file: string;
  readonly body: string;
  readonly pos: number;
}

/** マイグレーションを番号順に読み、関数名 → 最後の定義（本文と位置）を作る */
function latestFunctionBodies(migrations: readonly Migration[] = readMigrations()): Map<string, Definition> {
  const out = new Map<string, Definition>();
  migrations.forEach(({ file, sql }, fileIndex) => {
    // `create [or replace] function [schema.]<name>(` … 次の `create ... function` か末尾まで
    //
    // ★スキーマ修飾を許すこと。`0020` は `pg_get_functiondef()` の出力なので
    //   `CREATE OR REPLACE FUNCTION public.place_bet(...)` の形になる。
    //   修飾を許さない版では **`0020` の定義を1つも拾えず、古い `0002` の定義で判定**していた
    //   （＝直したのに落ち続ける）。**走査器の取りこぼしは、対象が全部消えれば「合格」にもなる。**
    // ★コメントの中の語は拾わない（位置は保つので、本文は元の SQL から切り出せる）
    //
    // ⚠️ ★**`stripFunctionComments` を使います**（★2026-09-19・裁定 `REVIEW_UI1_VERDICT_20260919.md`）。
    //    ★`comment on … is '…create or replace function foo(…)…'` と註記に書くと、
    //    ★**存在しない関数を登録してしまいます**（★本文の切り出しもずれます）。
    //    ★位置は同じ長さの空白で保たれるので、★`sql.slice` は元の SQL のままで正しく動きます。
    const re = /create\s+(?:or\s+replace\s+)?function\s+(?:[a-z_][a-z0-9_]*\.)?([a-z_][a-z0-9_]*)\s*\(/gi;
    const hits = [...stripFunctionComments(sql).matchAll(re)];
    for (let i = 0; i < hits.length; i += 1) {
      const name = hits[i]![1]!.toLowerCase();
      const start = hits[i]!.index!;
      const end = i + 1 < hits.length ? hits[i + 1]!.index! : sql.length;
      out.set(name, { file, body: sql.slice(start, end), pos: positionOf(fileIndex, start) });
    }
  });
  return out;
}

interface PrivilegeStatement {
  readonly file: string;
  readonly pos: number;
  readonly action: 'grant' | 'revoke';
  /** 対象の関数名。`all functions in schema public` なら 'all' */
  readonly functions: readonly string[] | 'all';
  readonly roles: readonly string[];
}

/**
 * ★関数に対する grant / revoke を、全マイグレーションから位置つきで拾う（コメントは除く）。
 * ⚠️ ★**`stripFunctionComments` を使います**（★2026-09-19）— ★註記に
 *    ★`'…revoke all on function foo() from anon…'` と書くと、★**実際には無い権限の文を
 *    ★拾ってしまいます**（★逆に「閉じている」と誤認する形です）。
 */
function functionPrivilegeStatements(migrations: readonly Migration[]): PrivilegeStatement[] {
  const out: PrivilegeStatement[] = [];
  const re = /\b(grant|revoke)\b[^;]*?\bon\s+(?:functions?\s+([^;]*?)|all\s+functions\s+in\s+schema\s+public)\s+(to|from)\s+([^;]+);/gi;
  migrations.forEach(({ file, sql }, fileIndex) => {
    for (const m of stripFunctionComments(sql).matchAll(re)) {
      const action = m[1]!.toLowerCase() as 'grant' | 'revoke';
      const functions = m[2] === undefined
        ? 'all' as const
        : [...m[2].matchAll(/(?:[a-z_][a-z0-9_]*\.)?([a-z_][a-z0-9_]*)\s*\(/gi)].map((x) => x[1]!.toLowerCase());
      const roles = m[4]!.split(',').map((r) => r.trim().split(/\s+/)[0]!.toLowerCase()).filter((r) => r !== '');
      out.push({ file, pos: positionOf(fileIndex, m.index!), action, functions, roles });
    }
  });
  return out;
}

/** ワーカー専用関数の条件（①②③）に反するものを返す。空なら合格 */
function workerOnlyViolations(name: string, migrations: readonly Migration[]): string[] {
  const def = latestFunctionBodies(migrations).get(name);
  if (def === undefined) return [`${name}: 定義が見つからない`];
  const out: string[] = [];
  const after = functionPrivilegeStatements(migrations).filter(
    (s) => s.pos > def.pos && (s.functions === 'all' || s.functions.includes(name)),
  );
  for (const role of USER_ROLES) {
    const revokes = after.filter((s) => s.action === 'revoke' && s.roles.includes(role));
    if (revokes.length === 0) {
      out.push(`${name}: 最後の定義（${def.file}）より後に ${role} からの revoke が無い`);
      continue;
    }
    const lastRevoke = revokes[revokes.length - 1]!.pos;
    const regrants = after.filter((s) => s.action === 'grant' && s.roles.includes(role) && s.pos > lastRevoke);
    if (regrants.length > 0) {
      out.push(`${name}: revoke の後に ${role} への grant がある（${regrants.map((g) => g.file).join(', ')}）`);
    }
  }
  /**
   * ⚠️ ★**`stripFunctionComments` を使います**（★`blankComments` では不足・2026-09-19）。
   *    ★本文は「次の `create function` まで」で切り出すので、★**直後の `comment on` 文も含みます**。
   *    ★`blankComments` は `--` しか消さないため、★**文字列リテラルが残ります**。
   *    🔴 ★実例: `0037` の `comment on function pick_initial_horse() is '…auth.uid() のハッシュは
   *    ★D-079 ① が禁じている…'` で、★**使っていないのに「使っている」と出ました**
   *    （★`0031` の `create_account` で起きたのと全く同じ形・上の註記）。
   * ★**註記の語を言い換えて検出器を黙らせません**（D-108 ③）。★**構造の側で直します。**
   * ★この検査は文字列リテラルを見ていないので、★落としても弱くなりません
   *   （★`errcode = '…'` を見ている検査は `blankComments` のままです）。
   */
  if (/auth\s*\.\s*uid\s*\(\s*\)/i.test(stripFunctionComments(def.body))) {
    out.push(`${name}: 本体で auth.uid() を使っている（${def.file}）`);
  }
  return out;
}

/**
 * ★利用者が呼ぶ RPC の実行権限の条件（照会 Q2・AUDIT_FIX2 §2-2・2026-09-14）。**開きすぎも塞ぎすぎも落とす**（R-2）。
 *   ① 最後の定義より後に、public と anon からの revoke がある（開きすぎ）
 *   ② 最後の定義より後に、authenticated への grant があり、その後に authenticated からの revoke が無い（塞ぎすぎ・書き忘れ）
 *   ③ ① の revoke より後に、public・anon への grant が無い（開き直し）
 *   ★`create or replace` は権限を保つが、この検査は「最後の定義より後」に書かれていることを要求する
 *     （書かれていなければ、どの付与が効いているかを移行ファイルから読めない）。
 */
function userRpcViolations(name: string, migrations: readonly Migration[]): string[] {
  const def = latestFunctionBodies(migrations).get(name);
  if (def === undefined) return [`${name}: 定義が見つからない`];
  const out: string[] = [];
  const after = functionPrivilegeStatements(migrations).filter(
    (s) => s.pos > def.pos && (s.functions === 'all' || s.functions.includes(name)),
  );
  for (const role of ['public', 'anon']) {
    const revokes = after.filter((s) => s.action === 'revoke' && s.roles.includes(role));
    if (revokes.length === 0) {
      out.push(`${name}: 最後の定義（${def.file}）より後に ${role} からの revoke が無い（開きすぎ）`);
      continue;
    }
    const lastRevoke = revokes[revokes.length - 1]!.pos;
    const regrants = after.filter((s) => s.action === 'grant' && s.roles.includes(role) && s.pos > lastRevoke);
    if (regrants.length > 0) {
      out.push(`${name}: revoke の後に ${role} への grant がある（開き直し・${regrants.map((g) => g.file).join(', ')}）`);
    }
  }
  const authGrants = after.filter((s) => s.action === 'grant' && s.roles.includes('authenticated'));
  const authRevokes = after.filter((s) => s.action === 'revoke' && s.roles.includes('authenticated'));
  if (authGrants.length === 0) {
    out.push(`${name}: 最後の定義（${def.file}）より後に authenticated への grant が無い（塞ぎすぎ・書き忘れ）`);
  } else if (
    authRevokes.length > 0 &&
    authRevokes[authRevokes.length - 1]!.pos > authGrants[authGrants.length - 1]!.pos
  ) {
    out.push(`${name}: authenticated への grant の後に authenticated からの revoke がある（塞ぎすぎ）`);
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

  it('★すべての書き込み RPC が assert_setup_complete() を呼ぶ（ワーカー専用関数を除く）', () => {
    const missing: string[] = [];
    for (const [name, { file, body }] of bodies) {
      if (READONLY_FUNCTIONS.includes(name)) continue;
      if (WORKER_ONLY_FUNCTIONS.includes(name)) continue;
      // ★口座を作る側は呼べない（呼べば必ず自分で落ちる）。代わりの 3 条件を下の describe が検査する
      if (ACCOUNT_CREATING_FUNCTIONS.includes(name)) continue;
      if (!body.includes('assert_setup_complete()')) missing.push(`${name}（最後の定義: ${file}）`);
    }
    expect(
      missing,
      `★assert_setup_complete() を呼んでいない書き込み RPC があります。\n` +
        `  D-080: 落ち方を RPC ごとにばらけさせない。読み取り専用なら登録簿に明示すること:\n  ${missing.join('\n  ')}`,
    ).toEqual([]);
  });

  it('★同じ関数が再定義されていたら、最後の定義で判定している', () => {
    // spend_training_ep は 0013 / 0014 / 0020 / 0021 にある。効いているのは 0021
    const s = bodies.get('spend_training_ep');
    expect(s).toBeDefined();
    expect(s!.file.startsWith('0021')).toBe(true);
  });

  it('★スキーマ修飾された定義を拾えている（拾えないと古い定義で判定してしまう）', () => {
    /**
     * ★`0020` 以降は `pg_get_functiondef()` の出力なので `public.place_bet(` の形です。
     * ⚠️ ★**ファイル名を決め打ちしません**（★2026-09-16 に直しました）。
     *    ★以前は「最後の定義は `0020`」と書いていましたが、★`0024` で `place_bet` を
     *    ★§9.5 どおりに再定義した日に落ちました。★**見たいのは「修飾された形を拾えること」**で、
     *    ★どのファイルが最後かは便ごとに変わります（★`spend_training_ep` も `0013`→`0021` と動いた）。
     */
    for (const name of ['place_bet', 'exchange_prize', 'spend_training_ep']) {
      const def = bodies.get(name);
      expect(def, `${name} の定義が拾えていない`).toBeDefined();
      expect(/create\s+or\s+replace\s+function\s+public\./i.test(def!.body), `${name} がスキーマ修飾の形で拾えていない（${def!.file}）`).toBe(true);
    }
    /** ★対照: 修飾を許さない走査だと、この形は 1 つも拾えない（★昔それで古い定義を見ていた） */
    const unqualified = /create\s+(?:or\s+replace\s+)?function\s+[a-z_][a-z0-9_]*\s*\(/i;
    expect(unqualified.test(bodies.get('place_bet')!.body), '★place_bet の最後の定義は修飾されている前提').toBe(false);
  });

  it('除外簿に載せてよいのは状態を変えない関数だけ', () => {
    // ★書き込み RPC の名前を除外簿に入れられないようにする
    for (const n of READONLY_FUNCTIONS) {
      expect(['place_bet', 'exchange_prize', 'spend_training_ep']).not.toContain(n);
    }
  });
});

describe('★口座を作る側の RPC（第三の登録簿・裁定 REVIEW_SETUP_PREDICATE_VERDICT_20260918 §3-2）', () => {
  const bodies = latestFunctionBodies();

  it('★登録簿の関数がマイグレーションに実在する（空振りしていない）', () => {
    // ★0 件は「全部合格」に見える。走査器が動いていることを先に確かめる（R-11）
    for (const n of ACCOUNT_CREATING_FUNCTIONS) {
      expect(bodies.get(n), `★${n} の定義がマイグレーションに無い`).toBeDefined();
    }
  });

  it('★除外簿・ワーカー専用簿と重ならない（区分が曖昧にならないこと）', () => {
    for (const n of ACCOUNT_CREATING_FUNCTIONS) {
      expect(READONLY_FUNCTIONS).not.toContain(n);
      expect(WORKER_ONLY_FUNCTIONS).not.toContain(n);
    }
  });

  it('★assert_setup_complete() を呼んでいないこと（呼べば必ず自分で落ちる）', () => {
    for (const n of ACCOUNT_CREATING_FUNCTIONS) {
      const def = bodies.get(n);
      if (def === undefined) continue;
      expect(
        // ★`comment on` の文字列リテラルまで落としてから見る（★説明文を「呼んでいる」と読まない）
        stripFunctionComments(def.body).includes('assert_setup_complete()'),
        `★${n} が assert_setup_complete() を呼んでいます。`
          + '★あれは users 行の存在を要求しますが、この RPC はその行を作る側で順序が逆です',
      ).toBe(false);
    }
  });

  /**
   * ★**ここが本体です。**
   *   簿に載せるだけだと「例外にした」が「無検査にした」になります（R-16）。
   *   `assert_setup_complete()` の代わりに、裁定 §3-2 の 3 条件を本文に要求します。
   */
  it('★代わりの 3 条件を本文で満たしている（①未認証を弾く ②メール確認 ③冪等）', () => {
    const violations: string[] = [];
    for (const n of ACCOUNT_CREATING_FUNCTIONS) {
      const def = bodies.get(n);
      if (def === undefined) { violations.push(`${n}: 定義が見つからない`); continue; }
      // ★註記と `comment on` の説明文を消してから見る
      //   （★**説明文に語があるだけで合格になる**のを防ぐ。★3 条件はすべて実コード側に要る）
      const body = stripFunctionComments(def.body);

      // ① auth.uid() が null なら弾く
      if (!/auth\s*\.\s*uid\s*\(\s*\)/i.test(body)) {
        violations.push(`${n}: auth.uid() を使っていない（${def.file}）`);
      } else if (!/is\s+null[\s\S]{0,200}raise\s+exception/i.test(body)) {
        violations.push(`${n}: auth.uid() が null のときに raise exception が無い（${def.file}）`);
      }

      // ② ★メール確認を、この RPC 自身の中でも確認する（D-113 ④・設定 1 枚に頼らない）
      if (!/email_confirmed_at/i.test(body)) {
        violations.push(`${n}: email_confirmed_at を確認していない（${def.file}）`);
      }
      // ★OIDC 経路を巻き込まないこと（裁定 C-3-1）。メール経路に限って課しているか
      if (!/auth\s*\.\s*identities/i.test(body)) {
        violations.push(`${n}: 経路を auth.identities で判定していない＝OIDC の利用者も弾く恐れ（${def.file}）`);
      }

      // ③ dedupe_key で冪等
      if (!/dedupe_key/i.test(body)) {
        violations.push(`${n}: dedupe_key による冪等が無い（${def.file}）`);
      }

      // ★V-19 ⑭: upsert を書かない（2 回目は落ちて全ロールバック）
      if (/on\s+conflict/i.test(body)) {
        violations.push(`${n}: on conflict がある（★upsert を書かない・V-19 ⑭）（${def.file}）`);
      }
    }
    expect(violations, violations.join('\n')).toEqual([]);
  });
});

describe('★ワーカー専用関数（D-095 候補・監査 H-3＋H-4）', () => {
  it('★登録簿の関数は、利用者のロールから実行権限を剥がし、auth.uid() を使わない', () => {
    const migrations = readMigrations();
    const violations = WORKER_ONLY_FUNCTIONS.flatMap((n) => workerOnlyViolations(n, migrations));
    expect(violations, violations.join('\n')).toEqual([]);
  });

  it('★利用者が呼ぶ RPC は、ワーカー専用にも読み取り専用にも入れられない', () => {
    for (const n of USER_RPCS) {
      expect(WORKER_ONLY_FUNCTIONS).not.toContain(n);
      expect(READONLY_FUNCTIONS).not.toContain(n);
    }
  });

  it('★登録簿の関数がマイグレーションに実在する（空振りしていない）', () => {
    const bodies = latestFunctionBodies();
    for (const n of WORKER_ONLY_FUNCTIONS) expect(bodies.has(n), n).toBe(true);
  });

  it('★検査が効くこと: 壊れた移行の形を与えると落ちる（R-14）', () => {
    const def = 'create or replace function spend_training_ep(p uuid) returns int language sql as $$ select 1 $$;\n';
    const revokeAll = 'revoke all on function spend_training_ep(uuid) from public, anon, authenticated;\n';
    const one = (sql: string): Migration[] => [{ file: '0001_a.sql', sql }];

    // 正しい形は通る
    expect(workerOnlyViolations('spend_training_ep', one(def + revokeAll))).toEqual([]);
    // ★anon の revoke が抜けた（0013・0014 の形）
    expect(
      workerOnlyViolations('spend_training_ep', one(`${def}revoke all on function spend_training_ep(uuid) from public, authenticated;\n`)).join('\n'),
    ).toMatch(/anon/);
    // ★revoke が再定義より前にしか無い
    expect(workerOnlyViolations('spend_training_ep', one(revokeAll + def)).length).toBeGreaterThan(0);
    // ★revoke の後の移行で grant して戻した
    expect(
      workerOnlyViolations('spend_training_ep', [
        { file: '0001_a.sql', sql: def + revokeAll },
        { file: '0002_b.sql', sql: 'grant execute on function public.spend_training_ep(uuid) to anon;\n' },
      ]).join('\n'),
    ).toMatch(/grant/);
    // ★コメントの中の revoke は数えない
    expect(workerOnlyViolations('spend_training_ep', one(`${def}-- ${revokeAll}`)).length).toBe(3);
    // ★本体で auth.uid() を使っている
    expect(
      workerOnlyViolations(
        'spend_training_ep',
        one(`create or replace function spend_training_ep(p uuid) returns uuid language sql as $$ select auth.uid() $$;\n${revokeAll}`),
      ).join('\n'),
    ).toMatch(/auth\.uid/);
  });
});

describe('★利用者が呼ぶ RPC の実行権限（照会 Q2・AUDIT_FIX2 BF-2）', () => {
  it('★place_bet・exchange_prize は public・anon から剥がし、authenticated には付けている（最後の定義より後で）', () => {
    const migrations = readMigrations();
    const violations = USER_RPCS.flatMap((n) => userRpcViolations(n, migrations));
    expect(violations, violations.join('\n')).toEqual([]);
  });

  it('★検査が効くこと: 開きすぎも塞ぎすぎも落ちる（R-2・R-14）', () => {
    const def = 'create or replace function place_bet(p uuid) returns int language sql as $$ select 1 $$;\n';
    const revoke = 'revoke all on function place_bet(uuid) from public, anon;\n';
    const grant = 'grant execute on function place_bet(uuid) to authenticated;\n';
    const one = (sql: string): Migration[] => [{ file: '0001_a.sql', sql }];

    // 正しい形は通る
    expect(userRpcViolations('place_bet', one(def + revoke + grant))).toEqual([]);
    // ★開きすぎ: anon の revoke が無い
    expect(
      userRpcViolations('place_bet', one(`${def}revoke all on function place_bet(uuid) from public;\n${grant}`)).join('\n'),
    ).toMatch(/anon からの revoke が無い/);
    // ★開きすぎ: 後の移行で anon に付け直した
    expect(
      userRpcViolations('place_bet', [
        { file: '0001_a.sql', sql: def + revoke + grant },
        { file: '0002_b.sql', sql: 'grant execute on function public.place_bet(uuid) to anon;\n' },
      ]).join('\n'),
    ).toMatch(/anon への grant がある/);
    // ★塞ぎすぎ: authenticated への grant が無い（書き忘れ）
    expect(userRpcViolations('place_bet', one(def + revoke)).join('\n')).toMatch(/authenticated への grant が無い/);
    // ★塞ぎすぎ: 付けた後に authenticated から剥がした
    expect(
      userRpcViolations('place_bet', one(`${def}${revoke}${grant}revoke all on function place_bet(uuid) from authenticated;\n`)).join('\n'),
    ).toMatch(/塞ぎすぎ/);
    // ★権限の文が再定義より前にしか無い
    expect(userRpcViolations('place_bet', one(revoke + grant + def)).length).toBeGreaterThan(0);
    // ★コメントの中の revoke・grant は数えない
    expect(userRpcViolations('place_bet', one(`${def}-- ${revoke}-- ${grant}`)).length).toBe(3);
  });
});

describe('★EP 不足の SQLSTATE（関数とワーカーで同じ値・指示書 AF-3 §4-1-3）', () => {
  it('★最後の定義の spend_training_ep は、EP 不足に EP_SHORT_SQLSTATE を付けて投げる', () => {
    const def = latestFunctionBodies().get('spend_training_ep');
    expect(def).toBeDefined();
    expect(blankComments(def!.body)).toMatch(new RegExp(`errcode\\s*=\\s*'${EP_SHORT_SQLSTATE}'`, 'i'));
  });

  it('★ワーカーは SQLSTATE だけで EP 不足を見分ける（メッセージの文字列では見分けない）', () => {
    expect(classifySpendError({ code: EP_SHORT_SQLSTATE, message: 'EP が不足している' })).toBe('ep_short');
    // ★0020 以降の実際の失敗: 「未認証」（raise exception の既定 P0001）。以前はこれも休養に落ちていた（監査 H-3）
    expect(classifySpendError({ code: 'P0001', message: '未認証' })).toBe('other');
    // ★文言が EP 不足でも、SQLSTATE が無ければ EP 不足としない
    expect(classifySpendError(new Error('EP が不足している（残高 0 / 必要 800）'))).toBe('other');
    expect(classifySpendError({ code: '42501', message: 'permission denied for function spend_training_ep' })).toBe('other');
    expect(classifySpendError(null)).toBe('other');
    expect(classifySpendError('ST001')).toBe('other');
  });

  it('★SQLSTATE は 5 文字の英大文字・数字で、PostgreSQL が定める分類と重ならない', () => {
    expect(EP_SHORT_SQLSTATE).toMatch(/^[0-9A-Z]{5}$/);
    // PostgreSQL の付録 A「エラーコード」の分類（先頭 2 文字）
    const pgClasses = [
      '00', '01', '02', '03', '08', '09', '0A', '0B', '0F', '0L', '0P', '0Z', '20', '21', '22', '23', '24',
      '25', '26', '27', '28', '2B', '2D', '2F', '34', '38', '39', '3B', '3D', '3F', '40', '42', '44', '53',
      '54', '55', '57', '58', '72', 'F0', 'HV', 'P0', 'XX',
    ];
    expect(pgClasses).not.toContain(EP_SHORT_SQLSTATE.slice(0, 2));
  });
});
