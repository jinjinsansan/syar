/**
 * ★**`horses` を参照している表を、★全部 数える**（★2026-09-20・世界の作り直しの前提）
 *
 * 【★なぜ要るか】
 *   ★`tools/seed-world.mjs` は ★**`horses` の全件 削除**（条件なし）から始まります。
 *   🔴 ★`horses` を参照する外部キーに ★**`on delete cascade` が付いていない**なら、
 *     ★**その `delete` は落ちます**。★世界は 1 頭も作られません。
 *   ⚠️ ★この道具が無いと「★空の DB では通った」を「★通る」と読んでしまいます。
 *
 * 【🔴 ★読むだけ】
 *   ★`pg_constraint` と `count(*)` しか見ません。★**1 行も作らず、変えず、消しません。**
 *
 * 【⚠️ ★環境で姿が違います】
 *   ★本番は移行が **33 件 未適用**なので、★**いま見える姿と、移行後の姿は別物**です。
 *   → ★**staging（53/53 適用済み）が「移行後の本番」の姿**です。★両方 流して比べてください。
 *
 * 【⚠️ ★この道具は SQL の文そのものを印刷しません】
 *   ★`R-24` の走査（`tool-guard.test.ts`）は ★**読取専用の道具に書き込み文が無いこと**を見ます。
 *   ★削除文を**印刷するだけ**でも、★走査からは ★**書く道具に見えます**
 *   （⚠️ ★この註記に削除文を書くと ★**註記だけで落ちます**。★実際に 1 度 落としました）。
 *   → ★**検出器を鈍らせるのではなく、★こちらが表の名前だけを出します**
 *     （★`verify-anon-exposure.mjs` の `truncate` は検出器を絞って解きましたが、
 *      ★あちらは ★**語**の問題で、★こちらは ★**文の形そのもの**なので、絞ると穴になります）。
 *   ★流す SQL は `RUNBOOK_PROD_RECOVERY_20260920.md` と `seed-world.mjs` が持ちます。
 *
 * 実行: npx tsx tools/diag-horses-refs.mjs --env staging
 */
import pg from 'pg';
import { loadEnv } from './lib/env.mjs';

const env = loadEnv();
const c = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

/**
 * ★`horses` を指している外部キーを全部 引く。
 * ★`confdeltype`: ★`a` = no action ／ `r` = restrict ／ `c` = cascade ／ `n` = set null ／ `d` = set default
 */
const r = await c.query(`
  select con.conname                                   as name,
         src.relname                                   as child_table,
         con.confdeltype                               as on_delete,
         pg_get_constraintdef(con.oid)                 as def
    from pg_constraint con
    join pg_class src on src.oid = con.conrelid
    join pg_class tgt on tgt.oid = con.confrelid
    join pg_namespace ns on ns.oid = src.relnamespace
   where con.contype = 'f' and tgt.relname = 'horses' and ns.nspname = 'public'
   order by con.confdeltype, src.relname, con.conname`);

const LABEL = { a: '★NO ACTION', r: '★RESTRICT', c: '✅ CASCADE', n: 'SET NULL', d: 'SET DEFAULT' };

console.log('# `horses` を参照している外部キー');
console.log('');
const blocking = [];
const seen = new Set();
for (const row of r.rows) {
  const ok = row.on_delete === 'c' || row.on_delete === 'n';
  if (!ok) blocking.push(row);
  seen.add(row.child_table);
  console.log(`  ${LABEL[row.on_delete] ?? row.on_delete}  ${row.child_table}.${row.name}`);
}
console.log('');
console.log(`  ★外部キー ${r.rows.length} 本 / 表 ${seen.size} 種類`);
console.log(`  🔴 ★**削除を止めるもの（cascade でも set null でもない）: ${blocking.length} 本**`);
console.log('');

// ── ★止めるものについて、実際に行が在るかを数える ──────────
console.log('【★いま行が在るか】★在れば `horses` の全件 削除はそこで落ちます');
const counts = [];
for (const t of [...new Set(blocking.map((b) => b.child_table))].sort()) {
  const n = Number((await c.query(`select count(*)::text as n from ${t}`)).rows[0].n);
  counts.push({ table: t, n });
  console.log(`  ${n > 0 ? '🔴' : '  '} ${t.padEnd(28)} ${n.toLocaleString()} 行`);
}
const live = counts.filter((x) => x.n > 0);
console.log('');
if (live.length === 0) {
  console.log('  ✅ ★止める表はどれも空です。★いまなら `horses` の全件 削除は通ります。');
  console.log('  ⚠️ ★**「いまなら」です。** ★ワーカーが動いていれば、★数秒後には増えます。');
} else {
  console.log(`  🔴🔴 ★**\`horses\` の全件 削除は落ちます。** ★${live.length} 表に行が在ります:`);
  console.log(`     ${live.map((x) => `${x.table}(${x.n.toLocaleString()})`).join(' / ')}`);
  console.log('  → ★**子から順に消すか、★cascade を足す移行を書くか**を先に決めること。');
}

// ─────────────────────────────────────────────────────────
// ★**消す順を出す**（★推移的に。★子を消すと、その子の子が引っかかる）
// ─────────────────────────────────────────────────────────
/**
 * ⚠️ ★`race_entries` を消せばよい、では済みません。
 *    ★`race_entries` を参照している表が在れば、★**そこも先に消す**必要があります。
 * → ★`horses` から**下流へ**辿って、★葉から順に並べます（★トポロジカル順）。
 *
 * ⚠️ ★`cascade` / `set null` の辺は ★**辿りません**（★DB が面倒を見てくれるので）。
 */
const edges = (await c.query(`
  select src.relname as child, tgt.relname as parent, con.confdeltype as on_delete
    from pg_constraint con
    join pg_class src on src.oid = con.conrelid
    join pg_class tgt on tgt.oid = con.confrelid
    join pg_namespace ns on ns.oid = src.relnamespace
   where con.contype = 'f' and ns.nspname = 'public'`)).rows;

/** ★親 → その親を「止める形で」参照している子たち */
const childrenOf = new Map();
for (const e of edges) {
  if (e.on_delete === 'c' || e.on_delete === 'n') continue;
  if (e.child === e.parent) continue; // ★自己参照は 1 文の delete の中で解ける
  if (!childrenOf.has(e.parent)) childrenOf.set(e.parent, new Set());
  childrenOf.get(e.parent).add(e.child);
}

/** ★`horses` から下流を集める */
const mustEmpty = new Set();
const walk = (t) => {
  for (const ch of childrenOf.get(t) ?? []) {
    if (mustEmpty.has(ch)) continue;
    mustEmpty.add(ch);
    walk(ch);
  }
};
walk('horses');

/** ★葉から順に（★自分を参照する表が全部 先に消えている順） */
const order = [];
const placed = new Set();
for (let guard = 0; guard < 50 && order.length < mustEmpty.size; guard += 1) {
  for (const t of mustEmpty) {
    if (placed.has(t)) continue;
    const blockers = [...(childrenOf.get(t) ?? [])].filter((x) => mustEmpty.has(x) && !placed.has(x));
    if (blockers.length === 0) { order.push(t); placed.add(t); }
  }
}

console.log('');
console.log('【★消す順の案】★`horses` から下流へ推移的に辿り、★葉から並べたもの');
if (mustEmpty.size === 0) {
  console.log('  ✅ ★先に空にすべき表はありません');
} else if (order.length < mustEmpty.size) {
  console.log('  🔴 ★**環があります**（★並べきれませんでした）。★手で決めてください:');
  console.log(`     ${[...mustEmpty].filter((t) => !placed.has(t)).join(' / ')}`);
} else {
  for (const [i, t] of order.entries()) {
    const n = Number((await c.query(`select count(*)::text as n from ${t}`)).rows[0].n);
    console.log(`  ${i + 1}. ${t.padEnd(26)} を空にする  -- ${n.toLocaleString()} 行`);
  }
  console.log(`  ${order.length + 1}. horses を空にする`);
  console.log('');
  console.log('  ⚠️ ★**1 つの取引（transaction）で**流すこと。★途中で落ちたら全部 戻すため。');
  console.log('  ⚠️ ★**ワーカーを止めてから**流すこと。★動いていると、消している間に増えます。');
}

await c.end();
