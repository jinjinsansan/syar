/**
 * ★**過去の走りに `race_entries.prize_pp` を埋め戻す**（★PR-1 の後始末・T-11 の前提）
 *   ★分類: **STATE_CHANGING**（★書き込みます。★`assertNotProduction` を通します）
 *
 * 【★なぜ道具でやるか — ★SQL でやらない】
 *   ★額は `prizeFor(tier, 着順)`（`packages/scheduler/src/prize.ts`）が決めます。
 *   🔴 ★SQL に賞金表を写すと ★**表が 2 か所**になります（D-052）。
 *   → ★**TypeScript から読み、★行に書きます。** ★移行（`0049`）は列を作るだけです。
 *
 * 【★何を埋めるか】
 *   ★`finish_pos is not null` かつ ★`prize_pp is null` の行 ★**すべて**。
 *   ⚠️ ★**すでに入っている行は触りません**（★ワーカーが書いた値を上書きしない）。
 *   ⚠️ ★NPC 馬も埋めます（★T-11 の価格式が必要とするのはそちら・PR-1）。
 *   ⚠️ 🔴 ★**賞金 0 の着順にも `0` を書きます**（★**PR-2**・★ワーカーと同じ扱い）。
 *      ★書かずに飛ばすと、★`null` に ★**「まだ書いていない」と「書いたが 0」の 2 つの意味**ができ、
 *      ★**二度流したときに同じ結果になると言えなくなります**。
 *      → ★いまは ★**`null` ＝ まだ書いていない**の 1 つだけ。★対象は「確定済みで `prize_pp` が null」と一言で言えます。
 *
 * 【★`pp_ledger` には触りません】
 *   ★あちらは ★**実際に発行した PP** です。★過去に発行しなかったものを、
 *   ★いま発行したことにはできません（★§3.4 の収支が嘘になります）。
 *   → ★**発生だけを埋めます。** ★この 2 つが一致しないのは ★**正しい状態**です。
 *
 * 【★使い方】
 *   `node tools/backfill-entry-prize.mjs --env staging`            … ★**下見だけ**（★既定・書きません）
 *   `node tools/backfill-entry-prize.mjs --env staging --write`    … ★実際に書く
 */
import pg from 'pg';
import { loadEnv } from './lib/env.mjs';
import { assertNotProduction } from './lib/guard.mjs';
import { prizeFor } from '../packages/scheduler/src/prize.ts';

/** ★class_rank（1..6）→ 賞金の格。★`apps/worker/src/prize-award.ts` と同じ対応 */
const RANK_TO_TIER = ['maiden', 'win1', 'win2', 'win3', 'open', 'G3'];
function tierFromDb(classRank, grade) {
  if (grade === 'G1' || grade === 'G2' || grade === 'G3') return grade;
  const t = RANK_TO_TIER[classRank - 1];
  if (t === undefined) throw new Error(`tierFromDb: 未知の class_rank ${classRank}`);
  return t;
}

const write = process.argv.includes('--write');
const env = loadEnv();
console.log('接続先:', env.STAR_ENV, write ? '／★書きます' : '／★下見だけ（--write で書きます）');

const c = new pg.Client({ connectionString: env.DATABASE_URL });
await c.connect();
try {
  /**
   * ⚠️ ★**接続してから**呼びます（★`assertNotProduction` は接続済みのクライアントを取り、
   *    ★DB の `app_environment` の宣言を読みます — ★env ファイルの自己申告ではありません）。
   */
  await assertNotProduction(c, 'backfill-entry-prize');
  const rows = (await c.query(
    `select e.race_id, e.gate, e.finish_pos, r.class_rank, r.grade
       from race_entries e join races r on r.id = e.race_id
      where e.finish_pos is not null and e.prize_pp is null
      order by r.scheduled_at, e.gate`)).rows;
  // ⚠️ ★0 件を「該当なし」と読まない（R-21）。★対象そのものが 0 なのか、走査が空なのかを言う
  const total = (await c.query(
    `select count(*)::int as n from race_entries where finish_pos is not null`)).rows[0].n;
  console.log(`★確定した走り ${total} 行 / ★埋め戻しの対象（prize_pp が null）${rows.length} 行`);
  if (total === 0) { console.error('🔴 ★確定した走りが 1 行もありません（★走査が空・R-21）'); process.exit(2); }

  let zero = 0;
  const byTier = new Map();
  const updates = [];
  for (const r of rows) {
    const tier = tierFromDb(Number(r.class_rank), r.grade);
    const amount = prizeFor(tier, Number(r.finish_pos));
    // 🔴 ★PR-2: ★**0 も書きます**（★飛ばすと null の意味が 2 つになる）
    if (amount <= 0) zero += 1;
    else byTier.set(tier, (byTier.get(tier) ?? 0) + amount);
    updates.push([amount, r.race_id, Number(r.gate)]);
  }
  console.log(`★書く行 ${updates.length}（★うち賞金 0 が ${zero} 行・★0 も書きます・PR-2）`);
  for (const [t, sum] of [...byTier].sort()) console.log(`    ${t.padEnd(7)} 合計 ${sum.toLocaleString('ja-JP')} PP`);

  if (!write) { console.log('\n（★下見だけでした。★書くには --write を付けてください）'); }
  else {
    await c.query('begin');
    for (const u of updates) {
      // ⚠️ ★`prize_pp is null` を条件に残します（★並行して確定が走っても上書きしない）
      await c.query(
        `update race_entries set prize_pp = $1 where race_id = $2 and gate = $3 and prize_pp is null`, u);
    }
    await c.query('commit');
    const left = (await c.query(
      `select count(*)::int as n from race_entries
        where finish_pos is not null and prize_pp is null`)).rows[0].n;
    console.log(`\n✅ ★書きました ${updates.length} 行 / ★残った null ${left} 行`);
    // 🔴 ★PR-2: ★二度流しても同じ結果になる（★残りは 0 でなければならない）
    if (left !== 0) {
      console.error('🔴 ★null が残っています。★「まだ書いていない」と「書いたが 0」が混ざります（PR-2）');
      process.exit(1);
    }
  }
} finally {
  await c.end();
}
