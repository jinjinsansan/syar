/**
 * ★**移行ファイルの「本文」を読む道具**（★CK-1・2026-09-19）
 *   ★裁定 `REVIEW_BET_ALLOWANCE_VERDICT_20260919.md` §4
 *
 * 【🔴 ★なぜ作るか — ★同じ誤診が 4 回起きました】
 *   ★検査が ★**SQL の註記（コメント）に一致して**、★赤/緑を誤りました:
 *     ① `/\bband\b/`      → ★`className="a-band"` に一致
 *     ② `/\x08band\x08/`  → ★**何にも一致しない**（★`\b` が制御文字になっていた）
 *     ③ `/60 minutes/`    → ★**自分が書いた註記**に一致（★ED-1 の後も緑のまま）
 *     ④ `/達しています/`   → ★**自分が `0045` に書いた註記**に一致（★直したのに 🔴 と報告）
 *   ★4 例とも ★**「検査が本文と註記を区別していなかった」**ことが原因です。
 *
 * 【★この道具の約束】
 *   ⚠️ ★**生の SQL を返す関数を置きません。** ★返すのは ★**必ず註記を落とした本文**だけです。
 *      ★「生も返せる」ようにすると、★次の検査がそちらを使い、★5 例目が起きます。
 *   ⚠️ ★`pg_get_functiondef` でも足りません — ★**実体にも註記が入っています**（★④ がまさにそれ）。
 *   ★★**いちばん強いのは「呼ぶこと」**です（★戻り値には註記が入りません）。
 *      ★この道具は ★**呼べないもの**（★列の並び・grant・制約の有無）のためのものです。
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../../../..');
const DIR = path.join(ROOT, 'db/migrations');

/** ★移行ファイルの名前（★番号順） */
export function migrationFiles(): readonly string[] {
  return readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort();
}

/**
 * ★**註記を落とす**。★文字列リテラルと dollar-quote の中は ★**触りません**
 * （★`'1 レース 1 種の上限（30,000 EP）を超える'` のような**本文の言葉**は残す）。
 *
 * ★落とすもの:
 *   ① `-- …` 行註記
 *   ② `/* … *\/` 塊註記
 *   ③ `comment on … ;` 文まるごと（★DB に載る註記。★③④ の原因）
 *
 * ⚠️ ★`'` と `$tag$` を数えながら進みます。★正規表現の一括置換では
 *    ★**文字列の中の `--` まで落ちます**。
 */
export function stripSqlComments(sql: string): string {
  let out = '';
  let i = 0;
  const n = sql.length;
  while (i < n) {
    const two = sql.slice(i, i + 2);
    // ① 行註記
    if (two === '--') {
      const nl = sql.indexOf('\n', i);
      i = nl === -1 ? n : nl;
      out += ' ';
      continue;
    }
    // ② 塊註記
    if (two === '/*') {
      const end = sql.indexOf('*/', i + 2);
      i = end === -1 ? n : end + 2;
      out += ' ';
      continue;
    }
    // ★文字列リテラル（★中は触らない）
    if (sql[i] === "'") {
      let j = i + 1;
      while (j < n) {
        if (sql[j] === "'") {
          if (sql[j + 1] === "'") { j += 2; continue; }  // ★'' は 1 個の '
          j += 1; break;
        }
        j += 1;
      }
      out += sql.slice(i, j);
      i = j;
      continue;
    }
    // ★dollar-quote（★$fn$ … $fn$。★中の -- は註記なので、ここでは**再帰的に**落とす）
    const dq = /^\$[A-Za-z_]*\$/.exec(sql.slice(i));
    if (dq !== null) {
      const tag = dq[0];
      const end = sql.indexOf(tag, i + tag.length);
      const bodyEnd = end === -1 ? n : end;
      out += tag + stripSqlComments(sql.slice(i + tag.length, bodyEnd)) + tag;
      i = end === -1 ? n : end + tag.length;
      continue;
    }
    out += sql[i];
    i += 1;
  }
  return stripCommentOnStatements(out);
}

/**
 * ★`comment on … ;` 文を落とす。★③④ の直接の原因です
 * （★DB に載る註記なので `pg_get_functiondef` でも消えません）。
 * ⚠️ ★終端の `;` は ★**文字列の外**のものを探します（★註記の本文に `;` が入りうる）。
 */
function stripCommentOnStatements(sql: string): string {
  const re = /\bcomment\s+on\b/gi;
  let out = '';
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql)) !== null) {
    out += sql.slice(last, m.index) + ' ';
    let i = m.index;
    let inStr = false;
    while (i < sql.length) {
      if (sql[i] === "'") {
        if (inStr && sql[i + 1] === "'") { i += 2; continue; }
        inStr = !inStr;
      } else if (sql[i] === ';' && !inStr) { i += 1; break; }
      i += 1;
    }
    last = i;
    re.lastIndex = i;
  }
  return out + sql.slice(last);
}

/** ★すべての移行を、★註記を落として 1 本に繋いだもの */
export function allMigrationsBody(): string {
  return migrationFiles()
    .map((f) => stripSqlComments(readFileSync(path.join(DIR, f), 'utf8')))
    .join('\n');
}

/**
 * ★**最後に定義された関数の本文**（★`create or replace` は重なる・R-19）。
 * ⚠️ ★見つからなければ ★**投げます**（★0 件を「該当なし」と読まない・R-21）。
 */
export function lastFunctionBody(name: string): { readonly file: string; readonly body: string } {
  let found: { file: string; body: string } | null = null;
  for (const file of migrationFiles()) {
    const sql = stripSqlComments(readFileSync(path.join(DIR, file), 'utf8'));
    const re = new RegExp(`create\\s+(?:or\\s+replace\\s+)?function\\s+(?:public\\s*\\.\\s*)?${name}\\s*\\(`, 'gi');
    for (const m of sql.matchAll(re)) {
      const rest = sql.slice(m.index);
      const next = rest.slice(1).search(/create\s+(?:or\s+replace\s+)?function\s/i);
      found = { file, body: next === -1 ? rest : rest.slice(0, next + 1) };
    }
  }
  if (found === null) throw new Error(`★${name} の定義がありません（★走査が空・R-21）`);
  return found;
}

/**
 * ★**最後に定義されたビューの本文**。
 * ⚠️ ★見つからなければ投げます（R-21）。★「落とされた」ことを見たいときは
 *    ★`allMigrationsBody()` で `drop view` を探してください。
 */
export function lastViewBody(name: string): { readonly file: string; readonly body: string } {
  let found: { file: string; body: string } | null = null;
  for (const file of migrationFiles()) {
    const sql = stripSqlComments(readFileSync(path.join(DIR, file), 'utf8'));
    const re = new RegExp(`create\\s+(?:or\\s+replace\\s+)?view\\s+(?:public\\s*\\.\\s*)?${name}\\s+as`, 'gi');
    for (const m of sql.matchAll(re)) {
      const rest = sql.slice(m.index);
      const semi = rest.indexOf(';');
      found = { file, body: semi === -1 ? rest : rest.slice(0, semi) };
    }
  }
  if (found === null) throw new Error(`★${name} の定義がありません（★走査が空・R-21）`);
  return found;
}

/**
 * ★**いま生きている関数の本文**を、★名前 → 本文 で返す（★`create or replace` の重なりを解く・R-19）。
 *
 * ⚠️ ★**「全移行を繋いで数える」では足りません** — ★`0044`・`0045`・`0047` が同じ関数を
 *    ★3 回定義していれば、★**同じ 1 行が 3 回数えられます**。
 *    ★「★◯◯を読むのは 1 か所だけ」を見たいときは ★**必ずこちらを使ってください**。
 * ⚠️ ★`drop function` は追っていません（★落としてから作り直す形は 1 件に収まります）。
 */
export function liveFunctionBodies(): ReadonlyMap<string, { readonly file: string; readonly body: string }> {
  const live = new Map<string, { file: string; body: string }>();
  const re = /create\s+(?:or\s+replace\s+)?function\s+(?:public\s*\.\s*)?([a-z_][a-z0-9_]*)\s*\(/gi;
  for (const file of migrationFiles()) {
    const sql = stripSqlComments(readFileSync(path.join(DIR, file), 'utf8'));
    for (const m of sql.matchAll(re)) {
      const rest = sql.slice(m.index);
      const next = rest.slice(1).search(/create\s+(?:or\s+replace\s+)?function\s/i);
      live.set(m[1]!.toLowerCase(), { file, body: next === -1 ? rest : rest.slice(0, next + 1) });
    }
  }
  return live;
}

/**
 * ★**いま生きている定義のどこで、その語が出てくるか**（★名前の一覧を返す）。
 * ★「★`bet_limits` を読むのは 1 本だけ」のような検査に使います。
 */
export function liveFunctionsMatching(re: RegExp): readonly string[] {
  const hits: string[] = [];
  for (const [name, { body }] of liveFunctionBodies()) {
    if (new RegExp(re.source, re.flags.replace('g', '')).test(body)) hits.push(name);
  }
  return hits.sort();
}
