/**
 * ★検証ツールの自己汚染点検（レビュー側指定・2026-08-11）
 *
 * 【何を見るか】
 *   > 「実行前の状態に戻るか」だけでなく、**同じツールを2回続けて流して
 *   >  2回の出力が一致するか**を見てください。状態が戻っていても、
 *   >  乱数や時刻で結果が動くなら同じ問題です。
 *
 * 【★なぜ「2回流して一致」なのか】
 *   B-1 で見つけた型は「**検証が対象を汚染し、再実行するほど結果が良く見える**」でした。
 *   素質が 578 → 606 → 637 と累積していたのに、出力は毎回「PASS」とだけ出ます。
 *   ★通常の劣化は「だんだん落ちる」ので気づけますが、これは
 *     **「だんだん通りやすくなる」ので、気づく契機が構造的にありません。**
 *   → 出力そのものを突き合わせれば、良くなる方向の変化も拾えます。
 *
 * 【★行数も見ます】
 *   出力が一致していても、DB に行が積もっていれば別の形の汚染です。
 *   実行前後で主要テーブルの行数を数えます。
 *
 * 【★このツール自体が状態を変えます】
 *   中で状態を変えるツールを流すので、`STATE_CHANGING` に登録しています。
 *
 * 実行: npx tsx tools/audit-tools.mjs --env staging
 */
import { spawnSync } from 'node:child_process';
import pg from 'pg';
import { STATE_CHANGING, READONLY } from './lib/classification.mjs';
import { assertNotProduction } from './lib/guard.mjs';
import { loadEnv } from './lib/env.mjs';

/**
 * ★点検の対象から外すもの（理由を必ず書く）。
 *   ⚠️ 「時間がかかるから」で外さないこと。外した理由が残らないと、
 *      次に見た人が「点検済み」と読みます。
 */
const SKIP = new Map([
  ['seed-world.mjs', '世界を作り直すツール。2回流せば当然2回作り直るので、一致を問う対象ではない（そもそも他の点検の前提を壊す）'],
  ['seed-stables.mjs', '同上（NPC 厩舎の初期投入）'],
  ['synthetic-bettor.mjs', '常駐して賭け続けるツール。終了しないので2回流す形にならない'],
  ['audit-tools.mjs', 'これ自身'],
  ['fix-purse.mjs', '一度きりの是正ツール（P2 の賞金額修正）。当てる対象がもう無い'],
  ['verify-b1.mjs', '1頭を260週×DB往復で回すため1回 4分。★別枠で2回流して一致を確認済み（誕生時の写しから復元する設計）'],
]);

const env = loadEnv();
const c = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
await assertNotProduction(c, 'audit-tools.mjs');

const TABLES = [
  'horses', 'races', 'race_entries', 'bets', 'ep_ledger', 'pp_ledger',
  'prize_exchanges', 'users', 'horse_week_log',
];
const counts = async () => {
  const out = {};
  for (const t of TABLES) {
    out[t] = (await c.query(`select count(*)::int n from ${t}`)).rows[0].n;
  }
  return out;
};

/** DB に繋ぐツールだけを対象にする（繋がないものは env を受け取らない） */
const { readFileSync } = await import('node:fs');
const connects = (f) => {
  try {
    return readFileSync(`tools/${f}`, 'utf8').includes('loadEnv');
  } catch {
    return false;
  }
};
const targets = [...STATE_CHANGING, ...READONLY]
  .filter((f) => !SKIP.has(f) && connects(f))
  .sort();

console.log('# 検証ツールの自己汚染点検');
console.log(`  対象 ${targets.length} 本 / 除外 ${SKIP.size} 本`);
console.log('  ★「2回流して出力が一致するか」と「行数が戻るか」の両方を見ます');
console.log('');

const run = (f) => {
  const r = spawnSync('npx', ['tsx', `tools/${f}`, '--env', 'staging'], {
    encoding: 'utf8', shell: true, timeout: 600_000,
  });
  return { out: `${r.stdout ?? ''}${r.stderr ?? ''}`, code: r.status };
};

const rows = [];
for (const f of targets) {
  const before = await counts();
  const a = run(f);
  const b = run(f);
  const after = await counts();
  const same = a.out === b.out;
  const drift = TABLES.filter((t) => before[t] !== after[t])
    .map((t) => `${t} ${before[t]}→${after[t]}`);
  rows.push({ f, same, codeA: a.code, codeB: b.code, drift, out: a.out });
  console.log(
    `  ${f.padEnd(22)} exit ${String(a.code).padStart(2)}/${String(b.code).padStart(2)}  ` +
    `${same ? '出力一致' : '★出力が違う'}  ` +
    `${drift.length === 0 ? '行数戻る' : `★行数が残る: ${drift.join(', ')}`}`,
  );
}

console.log('');
console.log('【除外したもの（理由つき）】');
for (const [f, why] of SKIP) console.log(`  ${f.padEnd(22)} ${why}`);

const bad = rows.filter((r) => !r.same || r.drift.length > 0);
console.log('');
if (bad.length > 0) {
  console.log(`★${bad.length} 本に問題があります:`);
  for (const r of bad) {
    console.log(`  ── ${r.f}`);
    if (!r.same) console.log('     出力が2回で違う（乱数・時刻・連番のいずれか）');
    if (r.drift.length > 0) console.log(`     行数が戻らない: ${r.drift.join(', ')}`);
  }
} else {
  console.log('★全件: 2回の出力が一致し、行数も戻ります');
}

// ★前提が揃わず exit 2 で終わったものは「点検できていない」（R-21）
const notRun = rows.filter((r) => r.codeA === 2);
if (notRun.length > 0) {
  console.log('');
  console.log(`★${notRun.length} 本は前提が揃わず**実行できていません**（点検した扱いにしない）:`);
  for (const r of notRun) console.log(`  ${r.f}`);
}

await c.end();
process.exit(bad.length === 0 ? 0 : 1);
