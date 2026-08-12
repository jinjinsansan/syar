/**
 * ★V-10 を「合成集団が実際に買った馬券」で測る（本番経路）
 *
 * 【レビュー側の指摘】
 *   > 測れなかった理由は「本番に馬券が1枚もない」ことでした。
 *   > 同じ合成集団で本番経路の V-10 が測れます。
 *
 * 【★こちらの見立て（訂正を含みます）】
 *   前便で「原理的に測れない」と書いたのは**実現払戻率の統計的精度**についてで、
 *   馬券の有無とは別の理由です。1レース＝1回の確定なので分散が大きく、
 *   ±1% を 3 SE で判定するには **win で287万レース**要ります（1本約100秒＝約9年）。
 *   **馬券を入れてもこの分散は変わりません。**
 *
 *   ★ただし、**馬券を入れると分散ゼロで測れるものが増えます**:
 *
 *     ① **払戻の機械が正しいか** — 券ごとに `payout = amount × odds_at_purchase` が
 *        厳密に成り立つか。**1枚でも違えば即座に分かります**（統計は要りません）
 *     ② **払戻の総額と PP 発行額が一致するか** — 台帳と馬券の突合
 *     ③ 実現払戻率（参考値・SE と必要レース数を併記）
 *
 *   ★①が「本番の払戻率が正しい」ことの実質的な保証です。
 *     オッズ表が正しく（`verify-v10-db` の `p × odds`）、
 *     払戻が表どおりなら（本ツールの①）、実現率は定義から従います。
 *
 * 【★馬を持たない買い手を使います】
 *   §9.5「自馬出走レースでは自馬絡みの馬券のみ」があるので、
 *   馬を持つ合成プレイヤーでは**全通り買えません**（実際に place_bet に弾かれました）。
 *   → 馬を1頭も持たない買い手を作ります。
 *
 * 実行: npx tsx tools/verify-v10-bets.mjs --env staging [--races 2]
 */
import { randomUUID, createHash, createHmac } from 'node:crypto';
import pg from 'pg';
import { MARGIN, TICKET_KINDS } from '../packages/betting/src/index.ts';
import { createPgStore } from '../apps/worker/src/pg-store.ts';
import { assertNotProduction } from './lib/guard.mjs';
import { loadEnv } from './lib/env.mjs';

const i = process.argv.indexOf('--races');
const RACES = i >= 0 ? Number(process.argv[i + 1]) : 2;
/** ★馬を1頭も持たない買い手（§9.5 の制限を受けない） */
const UID = '00000000-0000-4000-8000-00000000b010';
const START_EP = 5_000_000;
const STAKE = 100;

const env = loadEnv();
const c = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
await assertNotProduction(c, 'verify-v10-bets.mjs');

const hash = {
  sha256: (m) => createHash('sha256').update(m, 'utf8').digest('hex'),
  hmacSha256: (k, m) => createHmac('sha256', k).update(m, 'utf8').digest('hex'),
};
const n = (v) => (v === null || v === undefined ? 0 : Number(v));
const jp = (v) => Math.round(v).toLocaleString();

const clean = async () => {
  for (const t of ['pp_ledger', 'ep_ledger', 'bets']) {
    await c.query(`delete from ${t} where user_id = $1`, [UID]);
  }
  await c.query('delete from users where id = $1', [UID]);
  await c.query('delete from auth.users where id = $1', [UID]);
};

const fails = [];
const check = (ok, label, detail) => {
  console.log(`  ${ok ? '✓' : '★'} ${label}${detail ? `  ${detail}` : ''}`);
  if (!ok) fails.push(label);
};

console.log('# V-10 を「実際に買った馬券」で測る（本番経路）');
console.log('');

const races = (await c.query(
  `select id, cycle_index from races
    where status = 'scheduled' and scheduled_at > now() order by cycle_index limit $1`, [RACES],
)).rows;
if (races.length === 0) {
  console.error('★これから発走する発売中のレースがありません。seed-races で作ってから流してください');
  await c.end();
  process.exit(2);
}
console.log(`  対象 ${races.length} レース（cycle ${races.map((r) => r.cycle_index).join(', ')}）`);

await clean();
await c.query(
  `insert into auth.users (id,instance_id,aud,role,email,encrypted_password,created_at,updated_at)
   values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',
           'v10@star.local','x',now(),now()) on conflict (id) do nothing`, [UID]);
await c.query(
  `insert into users (id,display_name,stable_name,entry_points,prize_points,account_type)
   values ($1,'V-10 検証（馬を持たない）','検証用',$2,0,'internal')`, [UID, START_EP]);
// ★馬を1頭も持たないことを確かめる（§9.5 に当たらないことの前提）
const owns = (await c.query('select count(*)::int n from horses where owner_id = $1', [UID])).rows[0];
check(owns.n === 0, '① 買い手は馬を1頭も持たない（§9.5 に当たらない）', `${owns.n} 頭`);

// ── 全通り買う ──────────────────────────────────────────
let placed = 0;
let staked = 0;
for (const r of races) {
  const odds = (await c.query(
    `select bet_type, selection from race_odds where race_id = $1 and bet_type = 'win'`, [r.id],
  )).rows;
  await c.query('begin');
  await c.query(
    `select set_config('request.jwt.claims', json_build_object('sub',$1::text)::text, true)`, [UID]);
  for (const o of odds) {
    // ★§9.4 の上限（1レース1券種 30,000 EP）に当たらない範囲で
    if (staked % 30000 + STAKE > 30000) break;
    await c.query(`select place_bet($1,'win',$2::jsonb,$3,$4)`,
      [r.id, JSON.stringify(o.selection), STAKE, randomUUID()]);
    placed += 1;
    staked += STAKE;
  }
  await c.query('commit');
}
console.log(`  買いました: ${placed} 枚 / ${jp(staked)} EP`);

// ── 確定 ──────────────────────────────────────────────
const store = createPgStore(c, hash);
for (const r of races) await store.settleRace(Number(r.cycle_index));

// ── ★① 払戻の機械が正しいか（分散ゼロ）────────────────────
const bets = (await c.query(
  `select b.id, b.amount, b.odds_at_purchase, b.payout, b.status
     from bets b where b.user_id = $1`, [UID],
)).rows;
const won = bets.filter((b) => b.status === 'won');
const lost = bets.filter((b) => b.status === 'lost');
const wrongWon = won.filter((b) => Math.abs(n(b.payout) - n(b.amount) * n(b.odds_at_purchase)) > 0.5);
const wrongLost = lost.filter((b) => n(b.payout) !== 0);

console.log('');
console.log('【判定】★分散ゼロで測れるもの');
check(bets.length === placed, '② 買った枚数がすべて記録されている', `${bets.length} / ${placed} 枚`);
check(won.length > 0, '③ 的中が1枚以上ある（★0枚なら払戻を検査できていない）', `${won.length} 枚`);
check(wrongWon.length === 0,
  '④ ★的中券の払戻が「購入額 × 購入時オッズ」と厳密に一致',
  `${won.length - wrongWon.length}/${won.length} 枚が一致`);
check(wrongLost.length === 0, '⑤ 外れ券の払戻は 0', `違反 ${wrongLost.length} 枚`);

const ppPayout = (await c.query(
  `select coalesce(sum(delta),0)::text t from pp_ledger where user_id=$1 and reason='payout'`, [UID],
)).rows[0];
const paidTotal = won.reduce((a, b) => a + n(b.payout), 0);
check(Math.abs(n(ppPayout.t) - paidTotal) < 0.5,
  '⑥ 払戻の総額と PP 台帳の payout が一致', `${jp(paidTotal)} / ${jp(n(ppPayout.t))} PP`);

// ── ③ 実現払戻率（参考値・判定しない）──────────────────────
console.log('');
console.log('【参考】実現払戻率（★統計的な精度が足りないので判定しません）');
const rate = staked > 0 ? paidTotal / staked : NaN;
console.log(`  売上 ${jp(staked)} EP / 払戻 ${jp(paidTotal)} PP → 実現払戻率 ${(rate * 100).toFixed(2)}%`);
console.log(`  §9.4 の設計値（単勝）: ${((1 - MARGIN.win) * 100).toFixed(0)}%  差 ${((rate - (1 - MARGIN.win)) * 100).toFixed(2)}pt`);
console.log(`  ★${races.length} レースでは判定できません。±1% を 3 SE で判定するには`);
console.log('    win で約287万レース要ります（1本約100秒＝約9年）。★馬券の有無では変わりません。');
console.log('  → **オッズ表が正しく（verify-v10-db の p×odds）、払戻が表どおりなら（上の④）、');
console.log('     実現率は定義から従います。** そちらが本番経路の実質的な保証です。');

await clean();
await c.end();
console.log('');
console.log(fails.length === 0
  ? `★V-10（実際の馬券・本番経路）: PASS — 6項目すべて成立（${placed}枚）`
  : `★V-10（実際の馬券・本番経路）: FAIL — ${fails.join(' / ')}`);
process.exit(fails.length === 0 ? 0 : 1);
