/**
 * ★合成ベッター — A-1 の「払戻されたことまで確認」を成立させるための道具
 *
 * 【なぜ要るか】
 *   P2 指示書 §3:
 *     「A-1 の『24時間回る』は、レースが実際に**生成・確定・払戻**されたことまで
 *       確認してください。プロセスが生きていることではありません」
 *
 *   1回目の24時間では **払戻が0件**でした。認証が未実装で実ユーザーがおらず、
 *   **本物の馬券が1枚も存在しなかった**からです。
 *
 * 【★本番の経路をそのまま通す】
 *   馬券は `place_bet`（Postgres 関数・§15.3）で買います。**直接 INSERT しません。**
 *   直接入れると、発売時間内チェック・上限チェック・自馬ルール・残高ゲート・
 *   EP 減算との原子性（A-5）を**すべて迂回**するので、
 *   「払戻された」ことの証拠になりません。
 *
 * 【★これは本番コードではありません】
 *   ワーカーには一切入れていません。認証が入って実ユーザーが現れたら**捨てます**。
 *   本番コードに「テスト用の分岐」を入れると、消し忘れが本番に残ります。
 *
 * 【⚠️ 未解決 — §11.2 の監視を汚します】
 *   この馬券は `point_flow_daily` に**そのまま集計されます**。実ユーザーがいない間、
 *   **監視は合成ベッターだけを見ている**ことになり、`margin_actual` の3%アラートも
 *   合成側の性質で決まります。除外すべきか、承知の上で汚すかは**レビュー側の判断**です。
 *   照会に載せてあります。
 *
 * 実行: npx tsx tools/synthetic-bettor.mjs          （常駐）
 *       npx tsx tools/synthetic-bettor.mjs --clean  （後片付け）
 */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import pg from 'pg';

const env = Object.fromEntries(
  readFileSync('secrets.local.env', 'utf8')
    .split(/\r?\n/)
    .map((l) => l.match(/^([A-Za-z_]+)=(.*)$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2].trim()]),
);

/** ★固定 UUID。毎回同じ利用者になるので、あとから集計と除外の両方ができる */
const UID = '00000000-0000-4000-8000-00000000a1a1';
const STAKE = 100; // §9.1 の最小単位
/** 初期 EP。1日144レース × 100 EP = 14,400 EP なので、これで約69日ぶん */
const SEED_EP = 1_000_000;
const CLEAN = process.argv.includes('--clean');

const c = new pg.Client({
  connectionString: env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  application_name: 'star-synthetic-bettor',
});
await c.connect();

const log = (m) => console.log(`[bettor] ${new Date().toISOString().slice(11, 19)} ${m}`);

async function clean() {
  await c.query('delete from pp_ledger where user_id=$1', [UID]);
  await c.query('delete from ep_ledger where user_id=$1', [UID]);
  await c.query('delete from bets where user_id=$1', [UID]);
  await c.query('delete from users where id=$1', [UID]);
  await c.query('delete from auth.users where id=$1', [UID]);
  log('後片付け完了');
}

if (CLEAN) {
  await clean();
  await c.end();
  process.exit(0);
}

// --- 利用者を用意する（冪等） ---
await c.query(
  `insert into auth.users (id,instance_id,aud,role,email,encrypted_password,created_at,updated_at)
   values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',
           'synthetic@star.local','x',now(),now())
   on conflict (id) do nothing`,
  [UID],
);
await c.query(
  `insert into users (id,display_name,stable_name,entry_points,prize_points)
   values ($1,'合成ベッター','検証用',$2,0)
   on conflict (id) do nothing`,
  [UID, SEED_EP],
);

// ★残高が尽きたら黙って買えなくなるので、起動時に確かめる（R-21）
{
  const r = await c.query('select entry_points from users where id=$1', [UID]);
  const ep = Number(r.rows[0].entry_points);
  log(`利用者 準備完了  EP=${ep.toLocaleString()}`);
  if (ep < STAKE * 200) {
    log(`★EP が少ないので補充します（${ep} → ${SEED_EP}）`);
    await c.query(
      `update users set entry_points=$2 where id=$1`, [UID, SEED_EP],
    );
    await c.query(
      `insert into ep_ledger (user_id,delta,balance_after,reason)
       values ($1,$2,$3,'inflow')`,
      [UID, SEED_EP - ep, SEED_EP],
    );
  }
}

let placed = 0;
let skipped = 0;

async function tick() {
  // 発売中のレースを1つ選ぶ（★発売時間内かどうかは place_bet 側が判定する）
  const race = (
    await c.query(
      `select id, cycle_index from races
        where status='scheduled' and scheduled_at > now()
        order by scheduled_at limit 1`,
    )
  ).rows[0];
  if (!race) return;

  // ★同じレースに二度買わない。冪等キーをレースから決定的に作る
  const key = createHash('sha256').update(`synthetic:${race.cycle_index}`).digest('hex').slice(0, 32);
  const idem = `${key.slice(0, 8)}-${key.slice(8, 12)}-4${key.slice(13, 16)}-8${key.slice(17, 20)}-${key.slice(20, 32)}`;
  const dup = await c.query('select 1 from bets where user_id=$1 and race_id=$2 limit 1', [UID, race.id]);
  if (dup.rowCount > 0) {
    skipped += 1;
    return;
  }

  // 単勝の1番人気（オッズ最小）を買う。★当たる目に賭けないと払戻経路が通らない
  const fav = (
    await c.query(
      `select selection, odds from race_odds
        where race_id=$1 and bet_type='win' order by odds limit 1`,
      [race.id],
    )
  ).rows[0];
  if (!fav) return;

  const before = Number((await c.query('select entry_points from users where id=$1', [UID])).rows[0].entry_points);
  try {
    // ★set_config の第3引数 true はトランザクション内でのみ有効
    await c.query('begin');
    await c.query(`select set_config('request.jwt.claims', json_build_object('sub',$1::text)::text, true)`, [UID]);
    await c.query(`select place_bet($1,'win',$2::jsonb,$3,$4)`, [race.id, JSON.stringify(fav.selection), STAKE, idem]);
    await c.query('commit');
  } catch (e) {
    await c.query('rollback');
    // ★発売時間外は正常系。落とさない
    log(`cycle=${race.cycle_index} 見送り: ${String(e.message).slice(0, 60)}`);
    return;
  }

  // ★「買えた」を信じない。EP が減って馬券が増えたことを確かめる（R-21）
  const after = Number((await c.query('select entry_points from users where id=$1', [UID])).rows[0].entry_points);
  const n = Number((await c.query('select count(*) from bets where user_id=$1 and race_id=$2', [UID, race.id])).rows[0].count);
  if (after !== before - STAKE || n !== 1) {
    throw new Error(`購入後の状態が合いません: EP ${before}→${after}（期待 ${before - STAKE}） / 馬券 ${n}枚`);
  }
  placed += 1;
  log(`cycle=${race.cycle_index} 購入 単勝${fav.selection} ${STAKE}EP（オッズ${fav.odds}） 累計${placed}件`);
}

log('開始。Ctrl-C で停止（--clean で後片付け）');
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => {
    log(`${sig} 受信。購入 ${placed}件 / 既存で見送り ${skipped}件`);
    await c.end();
    process.exit(0);
  });
}

// eslint-disable-next-line no-constant-condition
while (true) {
  try {
    await tick();
  } catch (e) {
    // ★1回の失敗で止めない。ただし黙らせない
    log(`★失敗: ${e.message}`);
  }
  await new Promise((r) => setTimeout(r, 60_000));
}
