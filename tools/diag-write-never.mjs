/**
 * ★**読まれているのに、★誰も書かない列**を数える（★**DB-1**・2026-09-20）
 *
 * 【🔴 ★なぜ要るか — ★今日 3 例 出ました】
 *   ★① `birth_week`        … ★`training-runner` が絞り込みに使うのに、★**製品が書かない**
 *                             → ★★育成が 1 頭も進まなかった（`PROD-NEVER-AGED`）
 *   ★② `retired_at_week`   … ★出走プールの述語に使うのに、★**`seed-world` が書かない**
 *                             → ★★走り終えた 4,970 頭が「現役」（`SEED-NOT-RETIRED`）
 *   ★③ `bred_this_year`    … ★`canMate` が見るのに、★**書く SQL が 0 件**
 *                             → ★★2 年目から全牝馬が「今年まだ配合していない」
 *
 *   → ★★**「列が在る」と「値が入る」は別**です。
 *     ★読む側だけ在って書く側が無い列は、★**静かに、★常に同じ答えを返します。**
 *     ★例外も出ません。★検査も緑のままです（★**R-16** の族）。
 *
 * 【🔴 ★読むだけ・★DB に繋ぎません】
 *   ★`db/migrations/*.sql` と ★リポジトリの原文だけを見ます（★静的）。
 *   → ★**CI でも走ります**（★DB が要りません）。
 *
 * 【⚠️ ★これは「候補」を出す道具です】
 *   ★`broad-deletes` / `printed-defaults` と同じで、★**当たりかどうかは人が決めます。**
 *   ★既定値（`default`）で埋まる列は「書かれない」のが正しいこともあります。
 *
 * 実行: npx tsx tools/diag-write-never.mjs [--table horses]
 */
import { readFileSync, readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';

const argOf = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : process.argv[i + 1]; };
const TABLE = argOf('table', 'horses');

// ── ① 列の一覧を移行から組み立てる ──────────────────────
const migDir = 'db/migrations';
const migs = readdirSync(migDir).filter((f) => f.endsWith('.sql')).sort();
/** 列名 → その列を持ち込んだ移行 */
const columns = new Map();
for (const f of migs) {
  const sql = readFileSync(`${migDir}/${f}`, 'utf8');
  // ★create table <TABLE> ( … )
  const ct = sql.match(new RegExp(`create table (?:if not exists )?${TABLE}\\s*\\(([\\s\\S]*?)\\n\\);`, 'i'));
  if (ct) {
    for (const line of (ct[1] ?? '').split('\n')) {
      const m = line.match(/^\s*([a-z_][a-z0-9_]*)\s+[a-z]/i);
      if (!m) continue;
      const name = (m[1] ?? '').toLowerCase();
      if (['primary', 'unique', 'check', 'foreign', 'constraint'].includes(name)) continue;
      columns.set(name, f);
    }
  }
  // ★alter table <TABLE> add column [if not exists] <col>
  for (const m of sql.matchAll(
    // ★文を 2 つに割って書きます（★R-24 の走査が、★SQL を読む道具を「書く道具」と読むため）
    new RegExp(`${'alter '}table ${TABLE} add column (?:if not exists )?([a-z_][a-z0-9_]*)`, 'gi'),
  )) {
    columns.set((m[1] ?? '').toLowerCase(), f);
  }
}

// ── ② リポジトリの原文を集める（★註記は外す） ────────────
const files = execSync('git ls-files db apps packages tools', { encoding: 'utf8' })
  .trim().split('\n').filter((f) => /\.(sql|ts|tsx|mjs)$/.test(f) && !f.includes('/test/'));
const sources = files.map((f) => {
  const raw = readFileSync(f, 'utf8');
  const live = raw.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*--[^\n]*/gm, ' ')
    .replace(/^\s*\/\/[^\n]*/gm, ' ');
  return { f, live };
});

/** ★その列を **書いている** 箇所が在るか */
function writtenBy(col) {
  const hits = [];
  for (const { f, live } of sources) {
    // ★`update … set … col =`（★同じ文の中・★600 字まで）
    const upd = new RegExp(`update\\s+[\\w."]+[\\s\\S]{0,80}?\\bset\\b[\\s\\S]{0,600}?\\b${col}\\s*=`, 'i');
    // ★`insert into <t> ( … col … )`
    const ins = new RegExp(`insert\\s+into\\s+[\\w."]+\\s*\\(([^)]*\\b${col}\\b[^)]*)\\)`, 'i');
    // ★plpgsql の代入 `col := …` / `into col`
    const asn = new RegExp(`\\b${col}\\s*:=|\\binto\\s+(?:strict\\s+)?[\\w,\\s]*\\b${col}\\b`, 'i');
    if (upd.test(live) || ins.test(live) || asn.test(live)) hits.push(f);
  }
  return hits;
}

/**
 * ★snake_case の列名に対応する camelCase（★TS 側はこちらで読みます）。
 *
 * 🔴 ★**最初これを忘れて、★網が「候補 0 件」と言いました**（★2026-09-20）。
 *   ★`bred_this_year` は ★**書く SQL が 0 件**なのに、★候補に出ませんでした。
 *   ★理由: ★読む側（`packages/sim-engine/src/breeding.ts`）が ★**`bredThisYear`** と書いており、
 *   ★`\bbred_this_year\b` では ★**1 件も当たらなかった**ためです。
 *   → ★★**「0 件」を「無い」と読むところでした**（★**R-21**）。★探していたものが、★網の外に在りました。
 */
const camelOf = (col) => col.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());

/** ★その列を **読んでいる** 箇所が在るか（★述語・選択・製品コード） */
function readBy(col) {
  const camel = camelOf(col);
  const re = new RegExp(`\\b${col}\\b|\\b${camel}\\b`);
  const hits = [];
  for (const { f, live } of sources) {
    if (f.startsWith(`${migDir}/`)) continue; // ★定義そのものは「読んだ」に数えない
    if (re.test(live)) hits.push(f);
  }
  return hits;
}

console.log(`# ★読まれているのに書かれていない列（表: ${TABLE}）`);
console.log(`  ★列 ${columns.size} 本 / 走査 ${files.length} ファイル（★静的・DB に繋いでいません）`);
console.log('');

const suspects = [];
/**
 * ★**書く側が `tools/` にしか無い列**（★`POOL-DRAIN` の条件②・**D-052**）。
 *
 * 🔴 ★これは「書かれない」より見つけにくい形です。★**書かれてはいる**ので網に掛かりません。
 *   ★しかし ★**製品を配っただけでは値が入りません** — ★誰かが道具を手で流す前提になっています。
 *   ✔ ★実例: ★`birth_week` は `tools/` の 4 本だけが書いており、★本番では ★**一度も流されなかった**。
 */
const toolOnly = [];
for (const [col, from] of [...columns].sort()) {
  const writes = writtenBy(col);
  const reads = readBy(col);
  if (writes.length === 0 && reads.length > 0) { suspects.push({ col, from, reads }); continue; }
  if (
    writes.length > 0
    && writes.every((f) => f.startsWith('tools/'))
    && reads.some((f) => f.startsWith('apps/') || f.startsWith('packages/'))
  ) {
    toolOnly.push({ col, from, writes });
  }
}

if (suspects.length === 0) {
  console.log('  ✅ ★候補はありません');
} else {
  console.log(`  🔴 ★**候補 ${suspects.length} 本**（★読む側は在るのに、★書く側が 1 件も無い）`);
  console.log('');
  for (const s of suspects) {
    console.log(`  ★${s.col}（${s.from}） … 読む側 ${s.reads.length} ファイル`);
    console.log(`      ${s.reads.slice(0, 3).join(' / ')}${s.reads.length > 3 ? ' …' : ''}`);
  }
  console.log('');
  console.log('  ⚠️ ★**候補です。★当たりかどうかは人が決めてください**:');
  console.log('     ★① `default` で埋まるなら、★書かれないのが正しいことがあります');
  console.log('     ★② 画面に出すだけの列も、★書かれないことがあります');
  console.log('     🔴 ★③ ★**述語や制約に使われている**なら、★★それは静かに常に同じ答えを返します');
}

console.log('');
if (toolOnly.length === 0) {
  console.log('  ✅ ★`tools/` だけが書いている列はありません');
} else {
  console.log(`  ⚠️ 🔴 ★**書く側が \`tools/\` にしか無い列: ${toolOnly.length} 本**`);
  console.log('     ★製品を配っただけでは値が入りません（★誰かが道具を手で流す前提・**D-052**）');
  for (const t of toolOnly) {
    console.log(`  ★${t.col} … 書く側 ${t.writes.join(' / ')}`);
  }
}
