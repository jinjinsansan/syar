/**
 * ★**厩舎ごとの頭数の国勢調査**（★読むだけ・★前後で突き合わせる・2026-09-20）
 *
 * 【🔴 ★なぜ在るか】
 *   ★`STABLE-1-SKEW` は ★**66 頭ずれてから**見つかりました。
 *   ★★**ずれたその場で分からなかったのが、問題の本体**です。
 *   → ★控えを入れた道具（★`verify-g6` / `verify-prize`）を実 DB で試すときは、
 *     ★**「戻した」を主張にせず、★測定にします。**
 *
 * 【★使い方】
 *   ```
 *   node tools/diag-stable-census.mjs --env staging --save out/census-before.json
 *   npx tsx tools/verify-g6.mjs --env staging
 *   node tools/diag-stable-census.mjs --env staging --compare out/census-before.json
 *   ```
 *   ★`--compare` は ★**1 頭でも違えば終了コード 1**。
 *
 * 【⚠️ ★この道具が見ないもの】
 *   ★見るのは ★**厩舎ごとの頭数**（と合計）です。
 *   ⚠️ ★**同じ厩舎の中で馬が入れ替わっても分かりません**
 *     （★A が 7 番から出て、★B が 7 番に入れば、★数は同じ）。
 *   → ★だから `--save` は ★**馬 1 頭ずつの `id → npc_stable_id`** も持ちます。
 *     ★`--compare` はそちらも突き合わせます。★数だけでは足りません。
 *
 * ⚠️ ★1 行も書きません（`select` のみ）。
 */
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import pg from 'pg';
import { loadEnv } from './lib/env.mjs';

const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : null;
};
const savePath = arg('--save');
const comparePath = arg('--compare');
if (savePath === null && comparePath === null) {
  throw new Error('--save <path> か --compare <path> を指定してください');
}

const env = loadEnv();
const c = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
const where = (await c.query('select (select environment from app_environment limit 1) as env')).rows[0] ?? {};
console.log(`# 厩舎の国勢調査（★読むだけ） / 接続先 app_environment=${where.env}`);

/**
 * ★**引退込みで採ります。**
 * ⚠️ ★現役で絞ると、★`verify-b1` が引退させた 1 頭のような例外が見えません
 *   （★2026-09-19 に実際そうでした）。★突き合わせでは絞りません。
 */
const rows = (await c.query(
  'select id::text as id, npc_stable_id from horses where npc_stable_id is not null order by id',
)).rows;

/** ★厩舎ごとの頭数 */
const byStable = {};
for (const r of rows) {
  const k = String(r.npc_stable_id);
  byStable[k] = (byStable[k] ?? 0) + 1;
}
/** ★馬 1 頭ずつ。★`id → 厩舎` を並べて sha256（★中身は保存するが、比較は hash で速く） */
const perHorse = rows.map((r) => `${r.id}:${r.npc_stable_id}`).join('\n');
const sha = createHash('sha256').update(perHorse, 'utf8').digest('hex');

const census = { takenAt: new Date().toISOString(), total: rows.length, byStable, sha256: sha };
console.log(`  対象 ${census.total} 頭 / ${Object.keys(byStable).length} 厩舎 / sha256 ${sha.slice(0, 16)}…`);

if (savePath !== null) {
  mkdirSync(path.dirname(savePath), { recursive: true });
  // ⚠️ ★馬ごとの対応も保存します（★数だけでは入れ替わりが見えない）
  writeFileSync(savePath, JSON.stringify({ ...census, perHorse }, null, 2), 'utf8');
  console.log(`  ✅ 保存しました: ${savePath}`);
}

if (comparePath !== null) {
  const before = JSON.parse(readFileSync(comparePath, 'utf8'));
  const diffs = [];
  if (before.total !== census.total) diffs.push(`合計 ${before.total} → ${census.total}`);
  const keys = new Set([...Object.keys(before.byStable), ...Object.keys(byStable)]);
  for (const k of [...keys].sort((a, b) => Number(a) - Number(b))) {
    const a = before.byStable[k] ?? 0;
    const b = byStable[k] ?? 0;
    if (a !== b) diffs.push(`厩舎 ${k}: ${a} → ${b}`);
  }
  /** 🔴 ★数が同じでも、★中身が入れ替わっていれば hash が変わります */
  const sameHash = before.sha256 === census.sha256;
  console.log('');
  console.log(`  前: ${before.takenAt} / sha256 ${String(before.sha256).slice(0, 16)}…`);
  console.log(`  後: ${census.takenAt} / sha256 ${sha.slice(0, 16)}…`);
  if (diffs.length === 0 && sameHash) {
    console.log('  ✅ ★1 頭も動いていません（★頭数も、★馬ごとの所属も同じ）');
  } else {
    console.log(`  🔴 ★動いています: ${diffs.length === 0 ? '（頭数は同じ）' : diffs.join(' / ')}`);
    if (!sameHash) {
      console.log('  🔴 ★**馬ごとの所属が変わっています**（★頭数が同じでも入れ替わりがあります）');
      // ★どの馬が動いたかを出す（★最大 20 頭）
      const beforeMap = new Map(String(before.perHorse ?? '').split('\n').filter(Boolean)
        .map((l) => { const [id, st] = l.split(':'); return [id, st]; }));
      const moved = rows
        .filter((r) => beforeMap.has(r.id) && beforeMap.get(r.id) !== String(r.npc_stable_id))
        .slice(0, 20);
      for (const m of moved) {
        console.log(`     ${m.id.slice(0, 8)} 厩舎 ${beforeMap.get(m.id)} → ${m.npc_stable_id}`);
      }
      const gone = [...beforeMap.keys()].filter((id) => !rows.some((r) => r.id === id));
      if (gone.length > 0) console.log(`     ★前に在って今 無い馬: ${gone.length} 頭`);
    }
    process.exitCode = 1;
  }
}

await c.end();
