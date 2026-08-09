/**
 * A-2「強制終了して再起動しても二重生成・二重払戻が起きない」を**実 DB で**確かめる。
 *
 * ★偽ストアではなく本物の Postgres に対して行う。
 *   `cycle-runner.test.ts` の偽ストアは**こちらが返す値を決めている**ので、
 *   一意制約もトランザクションも実際には一度も動いていません。
 *
 * 【★2026-08-10 に2つ直しました】
 *   ① **後片付けが `delete from races where cycle_index is not null` だった。**
 *      ★これは**本番のレースを全件削除します。**「既存データを汚さないよう後で消す」と
 *      書きながら全部消す実装でした。→ **自分が作った番号だけ**を消します。
 *   ② `createPgStore` / `runCycle` の引数が増えたのに追随しておらず、
 *      **そもそも実行できない状態**でした。★A-2 の PASS は、
 *      D-037（中止）と D-038（順序入替）を入れる前の証拠のまま繰り越されていました。
 *
 * 【★二重払戻について】
 *   払戻の二重防止は `verify-economy.mjs` が「二重確定で PP が増えない」で確認します。
 *   ここは**生成の冪等性と一意制約**に絞ります（分けたほうが、落ちたときに場所が分かる）。
 */
import { readFileSync } from 'node:fs';
import { createHash, createHmac } from 'node:crypto';
import pg from 'pg';
import { createPgStore } from '../apps/worker/src/pg-store.ts';
import { runCycle } from '../apps/worker/src/cycle-runner.ts';

import { assertNotProduction } from './lib/guard.mjs';
const env = Object.fromEntries(
  readFileSync('secrets.local.env', 'utf8')
    .split(/\r?\n/)
    .map((l) => l.match(/^([A-Za-z_]+)=(.*)$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2].trim()]),
);
const c = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

// ★状態を変えるツールなので、本番に向いていたら実行しない（R-24）
await assertNotProduction(c, 'verify-a2.mjs');

/**
 * ★テスト用の起点。2020-01-01 を起点にすると、いまのサイクル番号は 34万台になり、
 *   本番（3桁）と**絶対に重なりません**。
 */
const EPOCH = Date.parse('2020-01-01T00:00:00Z');

/** ★自分が作った番号だけを覚えておき、それだけを消す */
const mine = new Set();
const cleanup = async () => {
  if (mine.size === 0) return;
  const ids = [...mine];
  await c.query('delete from race_odds where race_id in (select id from races where cycle_index = any($1))', [ids]);
  await c.query('delete from race_entries where race_id in (select id from races where cycle_index = any($1))', [ids]);
  await c.query('delete from races where cycle_index = any($1)', [ids]);
};

let done = false;
const bail = async (why) => {
  if (done) return;
  done = true;
  try {
    await cleanup();
    console.error(`\n★${why} で中断。作った ${mine.size} 件を削除しました`);
  } finally {
    process.exit(1);
  }
};
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => void bail(sig));
process.on('uncaughtException', (e) => void bail(`例外(${e.message})`));

const hash = {
  sha256: (m) => createHash('sha256').update(m, 'utf8').digest('hex'),
  hmacSha256: (k, m) => createHmac('sha256', k).update(m, 'utf8').digest('hex'),
};
const store = createPgStore(c, hash);
const seeds = { serverSeed: (i) => `a2-seed-${i}`, seedCommit: (i) => hash.sha256(`a2-seed-${i}`) };
/** ★A-2 は生成の冪等性を見るので、出走表とオッズの中身は問わない */
const build = () => ({ entrants: [], odds: [] });
const alerts = [];
const onAlert = (a) => alerts.push(a);

const countAll = async () => (await c.query('select count(*)::int n from races')).rows[0].n;
const before = await countAll();

console.log('--- 1周目 ---');
const a = await runCycle(store, EPOCH, seeds, build, onAlert);
a.created.forEach((i) => mine.add(i));
console.log(`  作成 ${a.created.length}（cycle ${a.created.join(',')}） / 既存 ${a.skipped.length}`);

console.log('--- 「強制終了して再起動」= もう一度呼ぶ × 5 ---');
for (let i = 0; i < 5; i += 1) {
  const r = await runCycle(store, EPOCH, seeds, build, onAlert);
  r.created.forEach((x) => mine.add(x));
}

const dup = await c.query(
  'select cycle_index, count(*)::int n from races where cycle_index = any($1) group by 1 having count(*) > 1',
  [[...mine]],
);
const total = await countAll();
console.log(`  レース総数 ${before} → ${total}（増分 ${total - before}）`);
console.log(`  ★重複しているサイクル番号: ${dup.rowCount}件`);

// ★一意制約が本当に効くか、直接ぶつけて確かめる（制約が無くても上の検査は通ってしまう）
let uniqueOk = false;
try {
  await c.query(
    `insert into races (cycle_index,name,class_rank,surface,distance,track_condition,course_id,scheduled_at,seed_commit,server_seed,purse,status)
     values ($1,'DUP',1,'turf',2000,'good','C1',now(),'x','y',0,'scheduled')`,
    [a.created[0]],
  );
  console.log('  ★一意制約: FAIL — 同じ cycle_index を挿入できてしまった');
} catch (e) {
  uniqueOk = true;
  console.log(`  ★一意制約: PASS — ${e.message.slice(0, 60)}`);
}

// ★D-037 の中止も冪等か（順序入替と中止処理を入れた後、実機で確かめていなかった）
const cancelIdempotent = alerts.length === 0;
console.log(`  ★中止の誤発火なし（期限内のレースを中止していない）: ${cancelIdempotent ? 'PASS' : `FAIL（${alerts.length}件）`}`);

const pass = dup.rowCount === 0 && total - before === mine.size && uniqueOk && cancelIdempotent;
console.log(`\n★A-2: ${pass ? 'PASS' : 'FAIL'}`);

await cleanup();
done = true;
const left = (await c.query('select count(*)::int n from races where cycle_index = any($1)', [[...mine]])).rows[0].n;
const after = await countAll();
console.log(`★後片付け: 作った ${mine.size} 件 → 残存 ${left} 件 / レース総数 ${after}（開始時 ${before}）`);
await c.end();
if (!pass || left !== 0 || after !== before) process.exit(1);
