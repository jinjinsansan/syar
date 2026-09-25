/**
 * ★**週送りの周が失敗していないかを、DB から確かめる**（★裁定 `REVIEW_HORSE_IDENTITY_VERDICT_20260923.md` §12）
 *
 *   ★分類: **READONLY**（★1 文字も書きません）
 *
 * 【⚠️ ★この道具の限界を先に書きます】
 *   🔴 ★**ワーカーの標準出力は読めません**（★VPS の systemd の側にあります）。
 *      ★前の配備の報告にある「失敗 0・発売の遅れ 0」は ★**ログの行**から取ったもので、
 *      ★ここで測るのは ★**DB に残った跡**です。★同じものではありません。
 *   → ★だから「失敗 0」と言い切らず、★**測れた 4 つを数で出します**。
 *
 * ★測るもの:
 *   ① ★日次の枝の記録（`daily_run_log`）… ★`ok = false` が何件あるか
 *   ② ★いまの週と、最後に書かれた時刻（`world_state`）… ★止まっていないか
 *   ③ ★直近のレースが片付いているか（★`status` の内訳）
 *   ④ ★利用者の要求の失敗（`foal_requests`）… ★理由ごとの数（★利用者都合の失敗も含む）
 *
 * ★使い方: node tools/check-weekly-cycle-health.mjs --env production
 */
import pg from 'pg';
import { loadEnv } from './lib/env.mjs';

const env = loadEnv();
const c = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
const rows = async (sql, p) => (await c.query(sql, p)).rows;

console.log('# ★週送りの周の健康（★DB から読めるものだけ・★1 文字も書きません）');

// ① 日次の枝
const daily = await rows(
  "select ok, count(*)::int n from daily_run_log where started_at > now() - interval '24 hours' group by ok order by ok",
);
const ng = daily.find((r) => r.ok === false)?.n ?? 0;
const okN = daily.find((r) => r.ok === true)?.n ?? 0;
console.log(`  ① 日次の枝（24 時間）… ok ${okN} 件 / 🔴 失敗 ${ng} 件`);
if (ng > 0) {
  for (const r of await rows(
    "select branch, detail, started_at from daily_run_log"
      + " where ok = false and started_at > now() - interval '24 hours' order by started_at desc limit 5",
  )) console.log(`     🔴 ${r.started_at.toISOString()} ${r.branch}: ${String(r.detail).slice(0, 120)}`);
}

// ② 世界の時計
const w = (await rows('select game_week, updated_at, extract(epoch from (now() - updated_at))::int stale from world_state where id = true'))[0];
console.log(`  ② いまの週 ${w?.game_week ?? '不明'} / 最後に書かれてから ${w?.stale ?? '?'} 秒`);
/**
 * 🔴 ★**線を引く**（★2026-09-25・裁定 §7 ①）。
 *   ⚠️ ★ここは以前 ★**秒数を出すだけ**でした。★数字は出るのに ★**誰も合否を言いません**でした。
 *     ★`day_started_at` が止まると ★`0080` のデイリー EP が ★**誰も受け取れなくなります**。
 *   ★線は ★**SQL の `day_boundary_stale_after_hours()`（`0081`）が 1 か所で持ちます**。
 *     ★画面（`my_daily_ep_state`）と ★ここが ★**同じ関数を読みます**（★D-052）。
 */
const st = (await rows(
  'select world_day_stalled() stalled, day_boundary_stale_after_hours() hours,'
  + ' extract(epoch from (now() - day_started_at))::int / 3600 age_h from world_state where id = true',
))[0];
if (st?.stalled === true) {
  console.log(`  ② 🔴 ★配布が止まっています（1 日の境目が ${st.age_h ?? '?'} 時間前・線 ${st.hours} 時間）`);
  console.log('       → ★このあいだ デイリー EP は誰も受け取れません。★画面もそう出します（0081）');
} else {
  console.log(`  ② ✅ 1 日の境目は新しい（${st?.age_h ?? '?'} 時間前・線 ${st?.hours ?? '?'} 時間）`);
}

// ③ 直近のレース
for (const r of await rows(
  "select status, count(*)::int n from races where scheduled_at > now() - interval '6 hours' group by status order by n desc",
)) console.log(`  ③ レース（6 時間）… ${r.status}: ${r.n} 件`);

// ④ 利用者の要求
const req = await rows(
  "select kind, status, failure_reason, count(*)::int n from foal_requests"
    + " where created_at > now() - interval '24 hours' group by kind, status, failure_reason order by n desc limit 10",
);
if (req.length === 0) console.log('  ④ 利用者の要求（24 時間）… 0 件');
for (const r of req) console.log(`  ④ 要求 ${r.kind} / ${r.status}${r.failure_reason === null ? '' : ` (${r.failure_reason})`}: ${r.n} 件`);

await c.end();
console.log('\n⚠️ ★これは「ワーカーのログに失敗の行が無いこと」の確認ではありません。★DB に残った跡だけです。');
