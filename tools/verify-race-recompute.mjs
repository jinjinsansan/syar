/**
 * ★**確定した着順を、★保存された seed から再計算して照合する**（★正典 §17.3 **F-3** 案③）
 *
 * 【★なぜ証跡ではなく再計算か（★裁定 2026-09-20）】
 *   ★**証跡も書き換えられます。★再計算は嘘をつけません。**
 *   ★そして ★F-1 / F-2 と同じ作法なので、★道具が 1 つで済みます（★D-052）。
 *
 * 【🔴 ★読むだけ】★`select` しかしません。★1 行も変えません。
 *   ⚠️ ★`--record` のときだけ、★**リポジトリの `evidence/` にファイルを 1 つ**書きます
 *     （★DB ではありません）。
 *
 * 【★どうやって同じ入力を作るか】
 *   ★`apps/worker/src/pg-store.ts` の確定の経路と ★**同じ組み立て**を使います:
 *     ★① 出走馬 … `{ ...entrant_snapshot, horseId: String(gate) }`（★`:674-680`）
 *     ★② 走路   … `conditionsFromFrozen(course_frozen, …)`（★`:704-709`）
 *     ★③ 種     … `races.server_seed`
 *   🔴 ★**ここに DB の最新値を混ぜないこと**（★混ぜたら「2 回読む構造」に戻ります・D-056）。
 *
 * 【⚠️ ★再計算できないレースが在ります】
 *   ★`entrant_snapshot` が無いレースは ★**原理的に再計算できません**（★入力が残っていない）。
 *   ✔ ★実測（2026-09-20）: ★**本番は 6,141 本 すべてが再計算できません**（★凍結 0 件）。
 *     ★配備が 2026-08-20 で、★凍結を書く製品コードは 2026-09-19 のものだからです。
 *   → ★**「照合して一致した」と「そもそも照合できない」を、★必ず分けて数えます。**
 *
 * 実行:
 *   npx tsx tools/verify-race-recompute.mjs --env staging [--limit 200] [--record]
 */
import pg from 'pg';
import { createHash, createHmac } from 'node:crypto';
import { settleRace } from '../apps/worker/src/settle.ts';
import { conditionsFromFrozen } from '../packages/race-engine/src/index.ts';
import { loadEnv } from './lib/env.mjs';
import { exitWithVerdict, verdictOf } from './lib/counted-verdict.mjs';

const argNum = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : Number(process.argv[i + 1]); };
const LIMIT = argNum('limit', 500);
const RECORD = process.argv.includes('--record');

const hash = {
  sha256: (m) => createHash('sha256').update(m, 'utf8').digest('hex'),
  hmacSha256: (k, m) => createHmac('sha256', k).update(m, 'utf8').digest('hex'),
};

const env = loadEnv();
const c = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

console.log('# ★着順の再計算による照合（★F-3・★読むだけ）');
console.log('');

const total = Number((await c.query(
  "select count(*)::text n from races where status = 'settled'",
)).rows[0].n);

/** ★再計算できるレース（★凍結が在るもの）だけを引く */
const races = (await c.query(
  `select r.id, r.server_seed, r.distance, r.surface, r.track_condition, r.course_id,
          r.course_frozen
     from races r
    where r.status = 'settled' and r.server_seed is not null and r.course_frozen is not null
      and exists (select 1 from race_entries e
                   where e.race_id = r.id and e.entrant_snapshot is not null)
    order by r.scheduled_at desc
    limit $1`, [LIMIT],
)).rows;

console.log(`  ★確定したレース ${total.toLocaleString()} 本 / ★再計算できるもの ${races.length} 本を見ます`
  + `（★上限 ${LIMIT}）`);
if (races.length === 0) {
  console.log('');
  console.log('  🔴 ★**1 本も再計算できません**（★`entrant_snapshot` か `course_frozen` が無い）。');
  console.log('     → ★**F-3 は、この環境では示せません。** ★入力が残っていないためです。');
}
console.log('');

let checked = 0;
let matched = 0;
const mismatches = [];
const skipped = [];
/**
 * 🔴 ★**5 つ目の箱: 版不明**（★裁定 2026-09-20・`F3-RECOMPUTE-NEEDS-VERSION`）。
 *
 * ★どの版のエンジンが確定させたか分からないレースは、
 * ★★**「一致」にも「不一致」にも数えません。**
 * ⚠️ ★今日の `22.58%` は、★★**版の違うものを引き算して 9 時間 追いかけました。**
 *   ★同じ混乱を、★この道具の出力で作らないためです。
 * ⚠️ ★`races.engine_version` は ★**まだ在りません**（★配備と同じ便で入れます）。
 *   ★入るまでは ★**全部ここに落ちます** — ★それが正しい姿です。
 */
const unknownVersion = [];
/** ★いまの版（★`engine_version` 列が入ったら、★これと比べます） */
const CURRENT_VERSION = process.env['VERCEL_GIT_COMMIT_SHA'] ?? null;

for (const r of races) {
  const es = (await c.query(
    `select gate, entrant_snapshot, finish_pos from race_entries
      where race_id = $1 and scratched_at is null order by gate`, [r.id],
  )).rows;
  if (es.some((e) => e.entrant_snapshot === null) || es.some((e) => e.finish_pos === null)) {
    skipped.push({ id: r.id, why: '凍結か着順が欠けている' });
    continue;
  }
  // ★確定の経路と同じ組み立て（★pg-store.ts:674-680 / :704-709）
  const entrants = es.map((row) => ({ ...row.entrant_snapshot, horseId: String(row.gate) }));
  let conditions;
  try {
    conditions = conditionsFromFrozen(r.course_frozen, {
      raceId: r.id,
      distance: r.distance,
      surface: r.surface,
      trackCondition: r.track_condition,
    });
  } catch (e) {
    skipped.push({ id: r.id, why: `走路を組めない: ${e.message}` });
    continue;
  }

  /**
   * 🔴 ★**版が分からないレースは、★照合しません**（★5 つ目の箱）。
   * ★`engine_version` 列が無い間は、★`r.engine_version` が `undefined` なので全部ここに来ます。
   */
  if (r.engine_version === undefined || r.engine_version === null
      || CURRENT_VERSION === null || r.engine_version !== CURRENT_VERSION) {
    unknownVersion.push({ id: r.id, stored: r.engine_version ?? null, current: CURRENT_VERSION });
    continue;
  }

  let out;
  try {
    out = settleRace({ conditions, entrants, serverSeed: r.server_seed }, hash);
  } catch (e) {
    skipped.push({ id: r.id, why: `再計算で例外: ${e.message}` });
    continue;
  }
  checked += 1;

  /** ★再計算した着順（★枠 → 着） */
  const recomputed = new Map(out.order.map((o, i) => [Number(o.horseId), i + 1]));
  const stored = new Map(es.map((e) => [Number(e.gate), Number(e.finish_pos)]));
  let same = stored.size === recomputed.size;
  if (same) {
    for (const [gate, pos] of stored) if (recomputed.get(gate) !== pos) { same = false; break; }
  }
  if (same) matched += 1;
  else {
    mismatches.push({
      id: r.id,
      stored: [...stored.entries()].sort((a, b) => a[1] - b[1]).map(([g]) => g).join(','),
      recomputed: [...recomputed.entries()].sort((a, b) => a[1] - b[1]).map(([g]) => g).join(','),
    });
  }
}

console.log('【★結果】');
console.log(`  ✅ ★照合して一致  ${matched} 本`);
console.log(`  🔴 ★食い違い      ${mismatches.length} 本`);
console.log(`  ⚠️ ★照合できない  ${skipped.length} 本（★入力が欠けている）`);
console.log(`  ⚠️ ★そもそも対象外 ${(total - races.length).toLocaleString()} 本`
  + '（★凍結が無い ＝ ★**原理的に再計算できない**）');
console.log(`  ⚠️ 🔴 ★版不明        ${unknownVersion.length} 本`
  + '（★どの版が確定させたか分からない ＝ ★**照合しない**）');
if (unknownVersion.length > 0 && CURRENT_VERSION === null) {
  console.log('     🔴 ★`VERCEL_GIT_COMMIT_SHA` が無いので、★いまの版が分かりません。');
  console.log('     ★`races.engine_version` 列も、★まだ在りません（★配備と同じ便で入れます）。');
  console.log('     → ★★**この状態では 1 本も照合できません。★それが正しい姿です。**');
}
for (const m of mismatches.slice(0, 5)) {
  console.log(`     🔴 ${m.id}`);
  console.log(`        保存 ${m.stored}`);
  console.log(`        再計算 ${m.recomputed}`);
}
for (const s of skipped.slice(0, 3)) console.log(`     ⚠️ ${s.id}: ${s.why}`);

if (RECORD) {
  const { writeFileSync, mkdirSync } = await import('node:fs');
  mkdirSync('evidence/race-recompute', { recursive: true });
  writeFileSync('evidence/race-recompute/last-check.json', `${JSON.stringify({
    checkedAt: new Date().toISOString(),
    env: process.argv.includes('--env') ? process.argv[process.argv.indexOf('--env') + 1] : null,
    settledTotal: total,
    recomputable: races.length,
    checked,
    matched,
    mismatched: mismatches.length,
    skipped: skipped.length,
    unknownVersion: unknownVersion.length,
    /** 🔴 ★**照合できなかった本数**。★0 に見せない（★R-21） */
    notRecomputable: total - races.length,
  }, null, 2)}\n`, 'utf8');
  console.log('');
  console.log('  ★記録しました: evidence/race-recompute/last-check.json');
}

await c.end();
console.log('');
console.log('🔴 ★**「一致した」と「照合できない」を混ぜないこと**（★**R-21**）。');
console.log('   ★この道具は ★**照合できた本数**しか保証しません。');

/**
 * 🔴 ★**判定は部品に任せます**（★**CK-14**・`tools/lib/counted-verdict.mjs`）。
 *
 * ⚠️ ★最初はここに `process.exit(mismatches.length === 0 ? 0 : 1)` と書いていました。
 *   ★5 つ目の箱を足した直後、★**全部が「版不明」に落ちて 0 を返しました**
 *   （★★1 本も照合していないのに「合格」）。
 * → ★**「0 件 通過」を合格として返せない部品**に通します。
 */
exitWithVerdict(verdictOf({
  checked,
  failed: mismatches.length,
  label: '★着順の再計算による照合（F-3）',
  skipped: {
    '版不明': unknownVersion.length,
    '入力が欠けている': skipped.length,
    '凍結が無い（対象外）': total - races.length,
  },
}));
