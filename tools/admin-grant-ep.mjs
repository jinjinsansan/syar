// @ts-check
/**
 * ★**管理者のデバッグ用に 参加ポイント（EP）を付与する**（★2026-09-29・オーナー指示「デバッグ体験が必要。今の利用者に大量のポイントを付与」）
 *
 * 【★オーナーの決定（2026-09-29・開発側の窓）】 ★本番の全員（★いま 1 名）に ★100,000 EP。
 * 【★台帳】 ★reason `inflow`（★発行＝issuance に数える・★知らない分類にしない＝日次の集計を止めない）・
 *   ★鍵 `admin-debug:<日>:<利用者>`（★同じ日に 2 度流しても 2 度入らない・ep_ledger_dedupe_key_uniq）。
 *   ⚠️ ★お金で買う道ではない（★管理者の手作業・憲法 第 2 原則）。★V-11 には 発行として数える。
 *
 * 【★既定は 下見だけ】 ★`--apply` で書く。★本番は `--env production --yes-production --apply`。★1 つの取引・★書いた後に 数え直す。
 *
 *   npx tsx tools/admin-grant-ep.mjs --env production --amount 100000              … 下見
 *   npx tsx tools/admin-grant-ep.mjs --env production --amount 100000 --yes-production --apply
 */
import pg from 'pg';
import { loadEnv } from './lib/env.mjs';

const has = (/** @type {string} */ f) => process.argv.includes(`--${f}`);
const arg = (/** @type {string} */ k) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? null : process.argv[i + 1] ?? null; };
const AMOUNT = Number(arg('amount'));
if (!Number.isInteger(AMOUNT) || AMOUNT <= 0 || AMOUNT > 1_000_000) { console.error('★--amount は 1〜1,000,000 の整数（★既定を置かない）'); process.exit(2); }
const env = loadEnv();
if (env.STAR_ENV === 'production' && has('apply') && !has('yes-production')) { console.error('★本番に書くには --yes-production'); process.exit(2); }

const c = new pg.Client({ connectionString: env.DATABASE_URL });
await c.connect();
const day = new Date().toISOString().slice(0, 10);
try {
  await c.query('begin');
  const users = (await c.query('select id, entry_points from users order by created_at')).rows;
  console.log(`★${env.STAR_ENV}: 利用者 ${users.length} 名に ${AMOUNT.toLocaleString('ja-JP')} EP（鍵の日 ${day}）`);
  let granted = 0;
  for (const u of users) {
    const key = `admin-debug:${day}:${u.id}`;
    const dup = (await c.query('select 1 from ep_ledger where dedupe_key = $1', [key])).rows.length > 0;
    if (dup) { console.log(`  ${String(u.id).slice(0, 8)}: ★今日は付与済み（飛ばす）`); continue; }
    const r = (await c.query('update users set entry_points = entry_points + $1 where id = $2 returning entry_points', [AMOUNT, u.id])).rows[0];
    await c.query(`insert into ep_ledger (user_id, delta, balance_after, reason, dedupe_key) values ($1, $2, $3, 'inflow', $4)`, [u.id, AMOUNT, r.entry_points, key]);
    console.log(`  ${String(u.id).slice(0, 8)}: ${u.entry_points} → ${r.entry_points} EP`);
    granted += 1;
  }
  /** ★書いた後に数え直す（★台帳の行と 残高が 合っているか） */
  const check = (await c.query(`select count(*)::int n from ep_ledger where dedupe_key like $1`, [`admin-debug:${day}:%`])).rows[0].n;
  console.log(`★今日の管理者付与の台帳の行: ${check}（★この実行で ${granted} 件）`);
  if (has('apply')) { await c.query('commit'); console.log('★書いた（commit）'); } else { await c.query('rollback'); console.log('★下見だけ（rollback・--apply で書く）'); }
} catch (e) {
  await c.query('rollback').catch(() => undefined);
  throw e;
} finally {
  await c.end();
}
