// @ts-check
/**
 * 🔴 ★**当たりの経路（PP の払戻）を 生きた DB の取引の中で通す**（★2026-09-29・レビュー側・簿 WIN-PAYOUT-PATH-UNPROVEN-IN-PROD）
 *
 * 【★なぜ】 ★本番の初めての投票は外れで、★当たりの経路は まだ 1 度も通っていない。★当たりを待つだけにしない。
 * 【★確かめること】（★ワーカーの `settlePayouts` そのものを呼ぶ）
 *   ① ★確定済みのレースの 1 着の単勝を /vote と同じ額で持った ★pending の馬券が ★won になる
 *   ② ★payout ＝ 金額 × odds_at_purchase（★0.1 単位・例 100 × 16.9 ＝ 1,690）
 *   ③ ★pp_ledger に ★reason payout・delta ＝ payout の行が 1 行・★users.prize_points が その額
 *   ④ ★EP の台帳に ★戻る行が無い（★憲法 §0.2 の一方通行）・★users.entry_points が 動かない
 *   ⑤ ★対照: ★2 着の馬の単勝は ★lost・payout 0・台帳 0 行
 *
 * 【★DB に何も残さない】 ★1 つの取引の中で行い ★必ず rollback。★前後の行数を数えて 戻ったことを確かめる。
 *   ⚠️ ★`settlePayouts` は commit しない（★呼ぶ側が取引を張る・payout.ts）。
 *
 * ⚠️ ★**必ず `--env staging`**（★本番では止まる）。
 *   npx tsx tools/verify-win-payout-live.mjs --env staging
 */
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { loadEnv } from './lib/env.mjs';
import { assertNotProduction } from './lib/guard.mjs';
import { settlePayouts } from '../apps/worker/src/payout.ts';
import { BET_PER_PICK_EP } from '../apps/web/src/lib/claims.ts';

const env = loadEnv();
console.log('接続先:', env.STAR_ENV);
const c = new pg.Client({ connectionString: env.DATABASE_URL });
await c.connect();
await assertNotProduction(c, 'verify-win-payout-live.mjs');

let failed = 0;
const must = (/** @type {boolean} */ b, /** @type {string} */ m) => { console.log(`  ${b ? '✅' : '🔴'} ${m}`); if (!b) failed += 1; };
const snap = async () => (await c.query(`select (select count(*) from bets)::int bets, (select count(*) from pp_ledger)::int pp,
  (select count(*) from ep_ledger)::int ep, (select count(*) from users)::int users`)).rows[0];
const before = await snap();
const ODDS = '16.9';

try {
  await c.query('begin');
  /** ★確定済みで 1 着・2 着が在るレース（★1 着だけ当たる単勝を作る） */
  const race = (await c.query(
    `select r.id from races r where r.status = 'settled'
       and exists (select 1 from race_entries e where e.race_id = r.id and e.finish_pos = 1)
       and exists (select 1 from race_entries e where e.race_id = r.id and e.finish_pos = 2)
     order by r.scheduled_at desc limit 1`,
  )).rows[0];
  if (race === undefined) throw new Error('★確定済みのレースが無い（★staging）');
  const entries = (await c.query(`select gate, finish_pos from race_entries where race_id = $1 and finish_pos is not null`, [race.id])).rows;
  const first = entries.find((e) => e.finish_pos === 1).gate;
  const second = entries.find((e) => e.finish_pos === 2).gate;
  const finished = entries.map((e) => ({ gate: Number(e.gate), finishPosition: Number(e.finish_pos) }));

  const uid = randomUUID();
  await c.query(
    `insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
     values ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', $2, 'x', now(), now(), now())`,
    [uid, `payout-${uid.slice(0, 8)}@test.local`],
  );
  await c.query(`insert into users (id, display_name, stable_name, entry_points, prize_points) values ($1, $2, '検査厩舎', 5000, 0)`, [uid, `検査 ${uid.slice(0, 8)}`]);
  const mk = async (/** @type {number} */ gate) => (await c.query(
    `insert into bets (user_id, race_id, bet_type, selection, amount, odds_at_purchase, client_token)
     values ($1, $2, 'win', $3::jsonb, $4, $5, $6) returning id`,
    [uid, race.id, JSON.stringify([gate]), BET_PER_PICK_EP, ODDS, randomUUID()],
  )).rows[0].id;
  const hitId = await mk(first);
  const missId = await mk(second);
  const epBefore = Number((await c.query('select entry_points from users where id = $1', [uid])).rows[0].entry_points);
  console.log(`★レース ${String(race.id).slice(0, 8)}・1 着 ${first}・2 着 ${second}・★${BET_PER_PICK_EP} EP × ${ODDS} 倍`);

  const res = await settlePayouts(c, race.id, finished);
  console.log(`★settlePayouts: won ${res.won}・lost ${res.lost}・paid ${res.paid}`);

  const expect = Math.round(BET_PER_PICK_EP * Number(ODDS));
  const hit = (await c.query('select status, payout from bets where id = $1', [hitId])).rows[0];
  must(hit.status === 'won', `① 1 着の単勝は won（${hit.status}）`);
  must(Number(hit.payout) === expect, `② payout ＝ ${BET_PER_PICK_EP} × ${ODDS} ＝ ${expect}（${hit.payout}）`);
  const pp = (await c.query(`select reason, delta from pp_ledger where user_id = $1`, [uid])).rows;
  must(pp.length === 1 && pp[0].reason === 'payout' && Number(pp[0].delta) === expect, `③ pp_ledger に payout ${expect} が 1 行（${JSON.stringify(pp)}）`);
  const pts = (await c.query('select entry_points, prize_points from users where id = $1', [uid])).rows[0];
  must(Number(pts.prize_points) === expect, `③ users.prize_points ＝ ${expect}（${pts.prize_points}）`);
  const ep = (await c.query(`select reason, delta from ep_ledger where user_id = $1`, [uid])).rows;
  must(ep.length === 0 && Number(pts.entry_points) === epBefore, `④ EP の台帳に戻る行 0・残高は動かない（行 ${ep.length}・${epBefore}→${pts.entry_points}）`);
  const miss = (await c.query('select status, payout from bets where id = $1', [missId])).rows[0];
  must(miss.status === 'lost' && Number(miss.payout) === 0, `⑤ 対照: 2 着の単勝は lost・payout 0（${miss.status}・${miss.payout}）`);
} finally {
  await c.query('rollback').catch(() => undefined);
}
const after = await snap();
await c.end();
console.log('');
must(JSON.stringify(after) === JSON.stringify(before),
  `★rollback で戻った: 投票 ${before.bets}→${after.bets}・PP 台帳 ${before.pp}→${after.pp}・EP 台帳 ${before.ep}→${after.ep}・口座 ${before.users}→${after.users}`);
console.log(failed === 0 ? '✅ ★合格' : `🔴 ★不合格 ${failed} 件`);
process.exit(failed === 0 ? 0 : 1);
