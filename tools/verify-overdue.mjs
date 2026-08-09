/**
 * ★D-037 の境界を**実 DB で**確かめる。
 *
 * 【なぜ単体テストでは足りないか】
 *   `cycle-runner.test.ts` は偽ストアを使うので、`overdueRaces` が返す値を
 *   テスト側が決めています。**SQL の境界そのものは一度も実行されていません。**
 *   「確定できないレースを60分で中止する」の 60分 は SQL の中にあります。
 *
 * 【R-2: 境界の両側を見る】
 *   59分のレース → 返らない  /  61分のレース → 返る
 *   片側だけだと「常に返す」実装でも「常に返さない」実装でも通ってしまいます。
 *
 * ⚠️ 本番 DB に一時的な行を作ります。★異常終了しても必ず消します（R-18）。
 */
import { readFileSync } from 'node:fs';
import { createHash, createHmac } from 'node:crypto';
import pg from 'pg';
import { createPgStore } from '../apps/worker/src/pg-store.ts';

const env = Object.fromEntries(
  readFileSync('secrets.local.env', 'utf8')
    .split(/\r?\n/)
    .map((l) => l.match(/^([A-Za-z_]+)=(.*)$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2].trim()]),
);
const c = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

/** ★本番のサイクル番号と絶対に重ならない領域を使う */
const INSIDE = 900_001; // 59分前 → 中止しない
const OUTSIDE = 900_002; // 61分前 → 中止する

const cleanup = async () => {
  await c.query('delete from bets where race_id in (select id from races where cycle_index = any($1))', [
    [INSIDE, OUTSIDE],
  ]);
  await c.query('delete from races where cycle_index = any($1)', [[INSIDE, OUTSIDE]]);
};

// ★SIGKILL 以外は必ず片付ける。前に変異試験で木を汚したのと同じ失敗を繰り返さない（R-18）
let done = false;
const bail = async (why) => {
  if (done) return;
  done = true;
  try {
    await cleanup();
    console.error(`\n★${why} で中断。一時データは削除しました`);
  } finally {
    process.exit(1);
  }
};
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => void bail(sig));
process.on('uncaughtException', (e) => void bail(`例外(${e.message})`));

await cleanup();

const mkRace = async (cycleIndex, minutesAgo) => {
  await c.query(
    `insert into races (cycle_index, name, class_rank, grade, surface, distance,
                        track_condition, course_id, scheduled_at, seed_commit, server_seed, purse, status)
     values ($1, 'D-037 境界確認', 1, null, 'turf', 2000, 'good', 'C1',
             now() - ($2::text || ' minutes')::interval, 'x', 'y', 0, 'scheduled')`,
    [cycleIndex, String(minutesAgo)],
  );
};
await mkRace(INSIDE, 59);
await mkRace(OUTSIDE, 61);

const hash = {
  sha256: (m) => createHash('sha256').update(m, 'utf8').digest('hex'),
  hmacSha256: (k, m) => createHmac('sha256', k).update(m, 'utf8').digest('hex'),
};
const store = createPgStore(c, hash);
const nowMs = Number((await c.query('select (extract(epoch from now()) * 1000)::bigint ms')).rows[0].ms);

const overdue = await store.overdueRaces(nowMs);
const got = overdue.filter((x) => x === INSIDE || x === OUTSIDE);

console.log('# D-037 の境界（実 DB・60分）');
console.log(`  59分前のレース(${INSIDE}): ${got.includes(INSIDE) ? '★返った（誤り）' : '返らない  OK'}`);
console.log(`  61分前のレース(${OUTSIDE}): ${got.includes(OUTSIDE) ? '返った  OK' : '★返らない（誤り）'}`);

// ★「確定を待つべきもの」とは別物であることも確かめる。
//   pendingSettlements は両方返すはず（どちらも発走時刻を過ぎている）
const pending = (await store.pendingSettlements(nowMs)).filter((x) => x === INSIDE || x === OUTSIDE);
console.log(`  確定待ち（pendingSettlements）: [${pending.join(',')}]  ★両方あるのが正しい`);

const ok =
  !got.includes(INSIDE) &&
  got.includes(OUTSIDE) &&
  pending.includes(INSIDE) &&
  pending.includes(OUTSIDE);
console.log(`\n★境界: ${ok ? 'PASS' : 'FAIL'}`);

await cleanup();
done = true;
const left = (await c.query('select count(*)::int n from races where cycle_index = any($1)', [[INSIDE, OUTSIDE]]))
  .rows[0].n;
console.log(`★後片付け: 残存 ${left} 件`);
await c.end();
if (!ok || left !== 0) process.exit(1);
