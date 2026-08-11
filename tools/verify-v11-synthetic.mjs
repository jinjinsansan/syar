/**
 * ★V-11 の② を「合成集団」で成立させる（P3 クローズ条件4・レビュー側裁定）
 *
 * 【裁定】
 *   > | | 対象 | ②の期待 |
 *   > | **較正**（P3 のゲート） | **合成プレイヤー集団** | **②が成立すること** |
 *   > | **運用監視** | 実集団（internal を除く） | 開業前は②が不成立で正常 |
 *   >
 *   > P3 のゲートとしては、**合成集団で経済を一巡させて②が成立することを示してください**
 *   > — 所有・調教・出走・受賞・馬券購入・払戻が実際に起き、
 *   >   発行量と消費量がともにゼロでないこと。
 *
 * 【★何を一巡させるか】
 *   ```
 *   EP を配る（inflow）
 *     → 馬を持つ
 *     → 調教する（EP 消費・G-6）
 *     → 出走して受賞する（PP 発行・G-7）
 *     → 馬券を買う（EP 消費）→ 払戻（PP 発行）
 *     → 景品と交換する（PP 消費・§11.3）
 *   ```
 *   ★**すべて本番と同じ経路**を通します。ここで台帳に直接書いたら意味がありません。
 *
 * 【★合成集団は internal 口座です】
 *   §11.2 の実経済の指標を汚さないためです（0009）。
 *   ★したがって**②の判定は internal を対象に**行います（監視とは逆）。
 *
 * 実行: npx tsx tools/verify-v11-synthetic.mjs --env staging
 */
import { createHash, createHmac, randomUUID } from 'node:crypto';
import pg from 'pg';
import { createPgStore } from '../apps/worker/src/pg-store.ts';
import { advanceTrainingWeeks } from '../apps/worker/src/training-runner.ts';
import { weekIndexAt } from '../packages/scheduler/src/index.ts';
import { assertNotProduction } from './lib/guard.mjs';
import { loadEnv, requireRow } from './lib/env.mjs';

/** ★合成プレイヤー。固定の UUID にして、流し直しても同じ口座を使う */
const UIDS = [
  '00000000-0000-4000-8000-00000000c001',
  '00000000-0000-4000-8000-00000000c002',
  '00000000-0000-4000-8000-00000000c003',
];
const START_EP = 500_000;

const env = loadEnv();
const c = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
await assertNotProduction(c, 'verify-v11-synthetic.mjs');

const hash = {
  sha256: (m) => createHash('sha256').update(m, 'utf8').digest('hex'),
  hmacSha256: (k, m) => createHmac('sha256', k).update(m, 'utf8').digest('hex'),
};
const EPOCH = Date.parse(env.STAR_EPOCH_ISO);
const n = (v) => (v === null || v === undefined ? 0 : Number(v));
const jp = (v) => Math.round(v).toLocaleString();

const fails = [];
const check = (ok, label, detail) => {
  console.log(`  ${ok ? '✓' : '★'} ${label}${detail ? `  ${detail}` : ''}`);
  if (!ok) fails.push(label);
};

console.log('# V-11 の② を合成集団で成立させる（P3 のゲート）');
console.log('');

// ── 前提: これから発走するレースが要る ──────────────────────
const race = requireRow(
  (await c.query(
    `select id, cycle_index, class_rank, grade from races
      where status = 'scheduled' and scheduled_at > now() order by cycle_index limit 1`,
  )).rows[0],
  'これから発走する発売中のレース', 'seed-races でレースを作ってから流してください',
);

// ── 後片付け（★先に流して、再実行できるようにする）──────────
const clean = async () => {
  await c.query('update horses set owner_id = null, npc_stable_id = 1 where owner_id = any($1)', [UIDS]);
  for (const t of ['prize_exchanges', 'pp_ledger', 'ep_ledger', 'bets']) {
    await c.query(`delete from ${t} where user_id = any($1)`, [UIDS]);
  }
  await c.query('delete from users where id = any($1)', [UIDS]);
  await c.query('delete from auth.users where id = any($1)', [UIDS]);
  // ★検証用に作ったダミー景品も消す（実カタログを汚さない）
  await c.query("delete from prize_catalog where name like '★検証用ダミー景品%'");
};
await clean();

/**
 * ★途中で落ちても後片付けします（R-18）。
 *   前に verify-economy などで「作った後に落ちて行が残る」を踏んでいます。
 */
let done = false;
const bail = async (why) => {
  if (done) return;
  done = true;
  try {
    await clean();
    console.error(`
★${why} で中断。作ったものを削除しました`);
  } finally {
    process.exit(1);
  }
};
process.on('uncaughtException', (e) => void bail(`例外(${e.message})`));
process.on('unhandledRejection', (e) => void bail(`例外(${(e && e.message) || e})`));

// ── ① EP を配る（外部流入）──────────────────────────────
for (const uid of UIDS) {
  await c.query(
    `insert into auth.users (id,instance_id,aud,role,email,encrypted_password,created_at,updated_at)
     values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',
             $2,'x',now(),now()) on conflict (id) do nothing`,
    [uid, `synth-${uid.slice(-4)}@star.local`],
  );
  await c.query(
    `insert into users (id,display_name,stable_name,entry_points,prize_points,account_type)
     values ($1,$2,'合成牧場',$3,0,'internal')`,
    [uid, `合成プレイヤー ${uid.slice(-4)}`, START_EP],
  );
  // ★台帳にも残す。users だけ増やすと「どこから来た EP か」が分からない
  await c.query(
    `insert into ep_ledger (user_id, delta, balance_after, reason)
     values ($1, $2, $2, 'inflow')`, [uid, START_EP],
  );
}
console.log(`  ① EP を配りました: ${UIDS.length} 人 × ${jp(START_EP)} EP`);

// ── ② 馬を持つ（そのレースの出走馬を分け合う）────────────────
const ents = (await c.query(
  'select horse_id, gate from race_entries where race_id = $1 order by gate', [race.id],
)).rows;
if (ents.length < 4) throw new Error(`出走 ${ents.length} 頭では足りません`);
// ★最終枠は NPC のまま残す（「所有していない馬には払わない」を同時に見るため）
for (let k = 0; k < ents.length - 1; k += 1) {
  await c.query('update horses set owner_id = $1, npc_stable_id = null where id = $2',
    [UIDS[k % UIDS.length], ents[k].horse_id]);
}
console.log(`  ② 馬を持ちました: ${ents.length - 1}/${ents.length} 頭（最終枠は NPC のまま）`);

// ── ③ 調教する（EP 消費・G-6）───────────────────────────
const nowMs = Number((await c.query('select (extract(epoch from now()) * 1000)::bigint as ms')).rows[0].ms);
// ★週が締まっていないと進まないので、1週ぶん巻き戻して仕事を作る
await c.query(
  `update horses set last_processed_week = last_processed_week - 1
    where owner_id = any($1) and retired_at_week is null`, [UIDS],
);
const t = await advanceTrainingWeeks(c, nowMs, EPOCH, (m) => console.log(`     [警告] ${m}`));
console.log(`  ③ 調教しました: 延べ ${t.advanced} 頭 / EP 消費 ${jp(t.epSpent)}`);

// ── ④ 馬券を買う（EP 消費）──────────────────────────────
/**
 * ★§9.5 の八百長防止が効きます:
 *   「**自馬出走レースでは自馬絡みの馬券のみ購入できる**」「上限 5,000 EP」
 *
 *   最初、人気順に6点ずつ買おうとして **place_bet に弾かれました**。
 *   合成プレイヤーは出走馬を分け合って持っているので、
 *   **他人の馬の単勝は買えません**。★憲法が正しく働いた形です。
 *
 *   → 各プレイヤーは**自分の馬の枠だけ**買います。
 */
const SELF_BET = 200;
let staked = 0;
let betRows = 0;
for (const uid of UIDS) {
  const mine = (await c.query(
    `select e.gate from race_entries e join horses h on h.id = e.horse_id
      where e.race_id = $1 and h.owner_id = $2 order by e.gate`, [race.id, uid],
  )).rows;
  if (mine.length === 0) continue;
  await c.query('begin');
  await c.query(
    `select set_config('request.jwt.claims', json_build_object('sub',$1::text)::text, true)`, [uid]);
  for (const m of mine) {
    // ★自馬絡みのレースは合計 5,000 EP まで（§9.5）
    if (staked % 5000 + SELF_BET > 5000) break;
    const sel = JSON.stringify([Number(m.gate)]);
    const sold = (await c.query(
      `select 1 from race_odds where race_id=$1 and bet_type='win' and selection=$2::jsonb`,
      [race.id, sel])).rowCount;
    if (sold === 0) continue; // ★売っていない目は買えない（D-035）
    await c.query(`select place_bet($1,'win',$2::jsonb,$3,$4)`,
      [race.id, sel, SELF_BET, randomUUID()]);
    staked += SELF_BET;
    betRows += 1;
  }
  await c.query('commit');
}
console.log(`  ④ 馬券を買いました: ${jp(staked)} EP（${betRows}枚・★自馬絡みのみ・§9.5）`);

// ── ⑤ 確定（賞金 PP 発行 + 払戻 PP 発行）────────────────────
const store = createPgStore(c, hash);
await store.settleRace(Number(race.cycle_index));
const issued = (await c.query(
  `select reason, coalesce(sum(delta),0)::text total, count(*)::int rows
     from pp_ledger where user_id = any($1) group by reason order by reason`, [UIDS],
)).rows;
console.log(`  ⑤ 確定しました: ${issued.map((r) => `${r.reason} ${jp(n(r.total))}PP(${r.rows}行)`).join(' / ') || '★発行なし'}`);

// ── ⑥ 景品と交換する（PP 消費）──────────────────────────
/**
 * ★景品カタログは**運用が決めるもの**です（§11.3「カタログは運用で差し替え可」）。
 *   正典は「発明しない」ためカタログを空にしてあります。
 *   → 検証用に、**それと分かる名前**のダミーを1件だけ作ります。
 *   ★実在しそうな品目を入れません。P-1 の制約（現金等価物を弾く）も効いています。
 */
let prize = (await c.query(
  "select id, cost_pp, stock from prize_catalog where stock > 0 and active order by cost_pp limit 1",
)).rows[0];
let madePrize = false;
if (prize === undefined) {
  const ins = await c.query(
    `insert into prize_catalog (name, cost_pp, stock, active)
     values ('★検証用ダミー景品（実カタログではありません）', 3000, 10, true)
     returning id, cost_pp, stock`,
  );
  prize = ins.rows[0];
  madePrize = true;
  console.log('  ★検証用のダミー景品を作りました（3,000 PP・在庫10・後で消します）');
}
let exchanged = 0;
if (prize === undefined) {
  console.log('  ⑥ ★在庫のある景品がありません（交換できません）');
} else {
  for (const uid of UIDS) {
    const bal = n((await c.query('select prize_points from users where id=$1', [uid])).rows[0].prize_points);
    if (bal < n(prize.cost_pp)) continue;
    await c.query('begin');
    await c.query(
      `select set_config('request.jwt.claims', json_build_object('sub',$1::text)::text, true)`, [uid]);
    try {
      await c.query('select exchange_prize($1,$2)', [prize.id, randomUUID()]);
      exchanged += n(prize.cost_pp);
      await c.query('commit');
    } catch (e) {
      await c.query('rollback');
      console.log(`     [交換できず] ${e.message}`);
    }
  }
  console.log(`  ⑥ 景品と交換しました: ${jp(exchanged)} PP`);
}

// ── 判定 ────────────────────────────────────────────────
const flow = (await c.query(
  `select
     coalesce(sum(delta) filter (where delta > 0), 0)::text as issued,
     coalesce(-sum(delta) filter (where delta < 0), 0)::text as consumed
   from pp_ledger where user_id = any($1)`, [UIDS],
)).rows[0];
const epFlow = (await c.query(
  `select reason, coalesce(sum(delta),0)::text t from ep_ledger where user_id = any($1)
    group by reason order by reason`, [UIDS],
)).rows;
const ppIssued = n(flow.issued);
const ppConsumed = n(flow.consumed);

console.log('');
console.log('【判定】★V-11 の② — 合成集団で経済が一巡したか');
console.log(`  EP 台帳: ${epFlow.map((r) => `${r.reason} ${jp(n(r.t))}`).join(' / ')}`);
console.log(`  PP 発行 ${jp(ppIssued)} / PP 消費 ${jp(ppConsumed)} / 純発行 ${jp(ppIssued - ppConsumed)}`);
console.log('');
check(epFlow.some((r) => r.reason === 'training' && n(r.t) < 0), '① 調教で EP が消費された（G-6）');
check(epFlow.some((r) => r.reason === 'bet' && n(r.t) < 0), '② 馬券で EP が消費された');
check(issued.some((r) => r.reason === 'prize' && n(r.total) > 0), '③ 賞金で PP が発行された（G-7）');
check(issued.some((r) => r.reason === 'payout' && n(r.total) > 0), '④ 払戻で PP が発行された');
check(ppConsumed > 0, '⑤ 景品交換で PP が消費された（§11.3）');
check(ppIssued > 0 && ppConsumed > 0,
  '⑥ ★V-11 の②: 発行量と消費量がともに実質ゼロでない',
  `発行 ${jp(ppIssued)} / 消費 ${jp(ppConsumed)}`);
check(!epFlow.some((r) => r.reason === 'payout'),
  '⑦ EP に払戻の行が無い（PP→EP の還流が無い・憲法②）');

console.log('');
console.log('  ★合成集団は internal 口座なので、§11.2 の実経済の指標には別掲されます。');
console.log('    実集団（監視側）で②が不成立なのは「利用者がいない」という正しい表示です。');

// ★判定に使った数字を取り終えてから片付ける（先に消すと測れない）
await clean();
void madePrize;
await c.end();
console.log('');
console.log(fails.length === 0
  ? '★V-11 ②（合成集団）: PASS — 7項目すべて成立'
  : `★V-11 ②（合成集団）: FAIL — ${fails.length} 項目: ${fails.join(' / ')}`);
process.exit(fails.length === 0 ? 0 : 1);
