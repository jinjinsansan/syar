/**
 * ★**ワーカーが進んでいるか**を、★読むだけで切り分ける（★2026-09-20・`WORKER-STALL-0916`）
 *
 * 【★なぜ要るか】
 *   ★2026-09-19、★staging で ★**3 日間 1 本も確定していない**ことが分かりました
 *   （★最後の `settled` が 09-16 15:30Z・★発走時刻を過ぎた `scheduled` が 1 本 残存）。
 *   → ★★**これが staging だけの話か、★本番も止まっているか**を先に決める必要があります。
 *
 * 【⚠️ ★この道具は 1 行も書きません（`select` のみ）】
 *   ★`assertNotProduction` は**呼びません** — ★**本番を見るのが目的**だからです。
 *   ★そのかわり ★**接続先を必ず最初に出します**（★`loadEnv` が `--env` を必須にしています）。
 *
 * 【★見るもの】
 *   ★① 接続先の `app_environment`
 *   ★② `races` の最終 `settled` / 最終 `scheduled` / 未来の発売中の本数
 *   ★③ ★**発走時刻を過ぎたのに `scheduled` のまま**の本数（★誰も見ていない状態）
 *   ★④ ★育成が進んでいるか（`last_processed_week` の最大・分布）
 *   ★⑤ ★助言ロックを誰かが掴んでいるか（★掴んでいれば「動いているが進めない」側）
 *
 * 実行: node tools/diag-worker-alive.mjs --env staging
 *       node tools/diag-worker-alive.mjs --env production   ★読むだけ
 */
import pg from 'pg';
import { loadEnv } from './lib/env.mjs';

const env = loadEnv();
const c = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

const one = async (sql, params = []) => (await c.query(sql, params)).rows[0] ?? {};
const all = async (sql, params = []) => (await c.query(sql, params)).rows;

const envRow = await one('select (select environment from app_environment limit 1) as env, now()::text as now');
console.log('# ワーカーは進んでいるか（★読むだけ）');
console.log(`  ① 接続先: app_environment = ${envRow.env} ／ DB の now() = ${envRow.now}`);
console.log('');

// ── ② レースの時計 ───────────────────────────────────────
const races = await all(
  `select status, count(*)::int as n,
          max(scheduled_at)::text as latest,
          min(scheduled_at)::text as earliest
     from races group by 1 order by 1`,
);
console.log('  ② races の時計');
for (const r of races) console.log(`     ${String(r.status).padEnd(10)} ${String(r.n).padStart(5)} 本   最後 ${r.latest}`);
const future = (await one(`select count(*)::int as n from races where status = 'scheduled' and scheduled_at > now()`)).n;
console.log(`     ★これから発走する発売中: ${future} 本`);

// ── ③ 発走時刻を過ぎたのに scheduled ─────────────────────
const overdue = await all(
  `select id::text as id, cycle_index, scheduled_at::text as at,
          extract(epoch from (now() - scheduled_at))::bigint as late_sec
     from races where status = 'scheduled' and scheduled_at <= now()
     order by scheduled_at limit 5`,
);
const overdueN = (await one(`select count(*)::int as n from races where status = 'scheduled' and scheduled_at <= now()`)).n;
console.log('');
console.log(`  ③ 🔴 発走時刻を過ぎたのに scheduled: ${overdueN} 本`);
for (const r of overdue) {
  const h = (Number(r.late_sec) / 3600).toFixed(1);
  console.log(`     cycle ${r.cycle_index} / ${r.at} / ★${h} 時間 遅れ`);
}

// ── ④ 育成は進んでいるか ─────────────────────────────────
const tr = await one(
  `select max(last_processed_week)::int as maxw, min(last_processed_week)::int as minw,
          count(distinct last_processed_week)::int as kinds, count(*)::int as n
     from horses where retired_at_week is null`,
);
console.log('');
console.log(`  ④ 育成: last_processed_week ${tr.minw}〜${tr.maxw}（${tr.kinds} 種類 / 現役 ${tr.n} 頭）`);

// ── ⑤ 助言ロック（★掴まれていれば「動いているが進めない」） ──
/**
 * ⚠️ ★`pg_locks` は ★**いまこの瞬間**しか見えません。
 *   ★掴んでいなくても「さっきまで動いていた」は否定できません（★**R-21** の族）。
 */
const locks = await all(
  `select l.pid, l.granted, a.application_name, a.state, a.query_start::text as since
     from pg_locks l left join pg_stat_activity a on a.pid = l.pid
    where l.locktype = 'advisory'`,
);
console.log('');
console.log(`  ⑤ 助言ロック: ${locks.length} 件${locks.length === 0 ? '（★誰も掴んでいない）' : ''}`);
for (const l of locks) console.log(`     pid ${l.pid} granted=${l.granted} ${l.application_name ?? ''} ${l.state ?? ''} since ${l.since ?? ''}`);

// ── ⑥ いま繋いでいる相手（★ワーカーが生きていれば接続が在るはず） ──
const conns = await all(
  `select application_name, state, count(*)::int as n, max(state_change)::text as latest
     from pg_stat_activity where datname = current_database()
     group by 1, 2 order by 3 desc limit 8`,
);
console.log('');
console.log('  ⑥ いまの接続（★ワーカーが生きていれば見えるはず）');
for (const x of conns) {
  console.log(`     ${String(x.application_name || '(名前なし)').padEnd(24)} ${String(x.state).padEnd(20)} ${x.n} 本  最後 ${x.latest}`);
}

await c.end();
console.log('');
console.log('⚠️ ★1 行も書いていません（`select` のみ）。★判定は書きません — ★数だけ出します。');
