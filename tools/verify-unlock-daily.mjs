/**
 * ★開放率の日次記録が動くか（レビュー側裁定 2026-08-12）
 *
 * 【裁定】
 *   > ★開放率は「動き続ける入力」です。今日 71.3% でも来月は違います。
 *   > つまり **P1 のゲートは、動く入力の上に立っています**。
 *   > → 分布を継続的に記録し、**測定時からずれたらゲートを測り直す**運用に。
 *
 * 【何を見るか】
 *   ① 記録が実際に書かれる（本番と同じ `recordUnlockDistribution` を呼ぶ）
 *   ② ★冪等（同じ日を二度集計しても行が増えない）
 *   ③ ★平均だけでなく分布の形（四分位）が残っている
 *   ④ 記録した値が、いま DB から直に測った値と一致する
 *   ⑤ ★対象0頭のとき**書かない**（0 を書くと「開放率が0になった」と読める）
 *
 * 実行: npx tsx tools/verify-unlock-daily.mjs --env staging
 */
import pg from 'pg';
import { recordUnlockDistribution } from '../apps/worker/src/unlock-flow.ts';
import { assertNotProduction } from './lib/guard.mjs';
import { loadEnv } from './lib/env.mjs';

const env = loadEnv();
const c = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
await assertNotProduction(c, 'verify-unlock-daily.mjs');

const fails = [];
const check = (ok, label, detail) => {
  console.log(`  ${ok ? '✓' : '★'} ${label}${detail ? `  ${detail}` : ''}`);
  if (!ok) fails.push(label);
};
const n = (v) => (v === null || v === undefined ? null : Number(v));

console.log('# 開放率の日次記録');
console.log('');

const today = (await c.query('select current_date::text d')).rows[0].d;
await c.query('delete from unlock_daily where date = $1', [today]);

// ── ① 記録する ──────────────────────────────────────────
const snap = await recordUnlockDistribution(c, today);
const rows1 = (await c.query('select * from unlock_daily where date = $1', [today])).rows;
check(snap !== null && rows1.length === 1, '① 記録が書かれた',
  snap === null ? '★null が返りました' :
    `${snap.horses}頭 / 平均 ${(snap.mean * 100).toFixed(1)}% SD ${(snap.sd * 100).toFixed(1)}pt`);

// ── ② 冪等 ────────────────────────────────────────────
await recordUnlockDistribution(c, today);
const rows2 = (await c.query('select count(*)::int n from unlock_daily where date = $1', [today])).rows[0];
check(rows2.n === 1, '② ★同じ日を二度集計しても行が増えない', `${rows2.n} 行`);

// ── ③ 分布の形が残っている ──────────────────────────────
const r = rows1[0];
check(r !== undefined && n(r.p10) < n(r.p50) && n(r.p50) < n(r.p90),
  '③ ★平均だけでなく分布の形（四分位）が残っている',
  r === undefined ? '—' :
    `p10 ${(n(r.p10) * 100).toFixed(0)}% < p50 ${(n(r.p50) * 100).toFixed(0)}% < p90 ${(n(r.p90) * 100).toFixed(0)}%`);

// ── ④ 直に測った値と一致 ────────────────────────────────
const direct = (await c.query(
  `select count(*)::int horses, avg(u)::float mean
     from (
       select (select sum((value)::numeric) from jsonb_each_text(stats))
            / nullif((select sum((value)::numeric) from jsonb_each_text(potential)), 0) as u
         from horses where retired_at_week is null and birth_week is not null
     ) t where u is not null`,
)).rows[0];
check(direct.horses === r?.horses && Math.abs(direct.mean - n(r.mean)) < 1e-4,
  '④ 記録した値が DB から直に測った値と一致',
  `${direct.horses}頭 / 平均 ${(direct.mean * 100).toFixed(2)}%`);

// ── ⑤ 対象0頭なら書かない ──────────────────────────────
/**
 * ★実データを消さずに確かめます。トランザクションの中で全馬を対象外にし、
 *   記録が **null を返して書かない**ことを見てから**必ず巻き戻します**。
 */
await c.query('begin');
await c.query("update horses set birth_week = null where retired_at_week is null");
const empty = await recordUnlockDistribution(c, '1999-01-01');
const emptyRows = (await c.query("select count(*)::int n from unlock_daily where date = '1999-01-01'")).rows[0];
await c.query('rollback');
check(empty === null && emptyRows.n === 0,
  '⑤ ★対象0頭のときは書かない（0 を書くと「開放率が0になった」と読める）',
  `戻り値 ${empty === null ? 'null' : '★値'} / 行 ${emptyRows.n}`);

// ★巻き戻したことを確かめる（ここを飛ばすと、実データを壊したまま PASS になる）
const restored = (await c.query(
  'select count(*)::int n from horses where retired_at_week is null and birth_week is not null',
)).rows[0];
check(restored.n === direct.horses, '⑤b ★巻き戻せている（実データを壊していない）',
  `${restored.n} / ${direct.horses} 頭`);

console.log('');
console.log('【いまの分布】★P1 のゲートはこの上に立っています');
console.log(`  ${r?.horses}頭 / 平均 ${(n(r.mean) * 100).toFixed(1)}%  SD ${(n(r.sd) * 100).toFixed(1)}pt`);
console.log(`  p10 ${(n(r.p10) * 100).toFixed(1)}% / p50 ${(n(r.p50) * 100).toFixed(1)}% / p90 ${(n(r.p90) * 100).toFixed(1)}%`);
console.log(`  週齢の平均 ${n(r.age_mean).toFixed(0)} 週`);
console.log('  ★ここが測定時からずれたら、P1 のゲートを測り直してください。');

await c.end();
console.log('');
console.log(fails.length === 0
  ? '★開放率の日次記録: PASS — 6項目すべて成立'
  : `★開放率の日次記録: FAIL — ${fails.join(' / ')}`);
process.exit(fails.length === 0 ? 0 : 1);
