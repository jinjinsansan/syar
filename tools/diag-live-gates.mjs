/**
 * ★**実際に走ったレースから V-4 / V-5 / V-6 を数える**（★読むだけ・2026-09-20）
 *
 * 【★なぜ要るか】
 *   ★較正（`K = 0.237` → V-4 32.3% / V-5 62.6% / V-6 1.18%）は ★**合成**で取りました。
 *   ★合成の馬は ★**育ちます**（正典 §7.3 の伸びが入る）。
 *   🔴 ★2026-09-19 に測ったところ、★**本番の馬は `birth_week` が全頭 null で、★一度も育っていません**
 *     （★`PROD-NEVER-AGED`）。
 *   → ★★**較正した模型と、★実際に走っている集団が別物かもしれません。**
 *
 * 【🔴 ⚠️ ★この数字の読み方 — ★先に書きます（★**MD-6**）】
 *   ★★**一致しても不一致でも、★これを較正の根拠には使えません。**
 *   ★理由: ★この記録は ★**育っていない馬**のものです（★本番の場合）。
 *   ★★**言えるのは「★模型と実物がどれだけ離れているか」まで。**
 *
 * 【⚠️ ★ほかに見ていないもの】
 *   ★頭数の分布・番組の構成・馬場が、★合成の条件と揃っているかは見ていません。
 *   ★`popularity` が null の行は数から外します（★何本 外したかを出します）。
 *
 * 実行: node tools/diag-live-gates.mjs --env production   ★読むだけ
 *       node tools/diag-live-gates.mjs --env staging
 */
import pg from 'pg';
import { loadEnv } from './lib/env.mjs';

const env = loadEnv();
const c = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
const one = async (sql, p = []) => (await c.query(sql, p)).rows[0] ?? {};

const e = await one('select (select environment from app_environment limit 1) as env');
console.log('# 実際に走ったレースから V-4 / V-5 / V-6 を数える（★読むだけ）');
console.log(`  接続先: app_environment = ${e.env}`);

/** ★対象: ★確定していて、★着順と人気が入っている行だけ */
const scope = `
  from race_entries e
  join races r on r.id = e.race_id
 where r.status = 'settled' and e.finish_pos is not null`;

const base = await one(`
  select count(distinct r.id)::int as races,
         count(*)::int as entries,
         count(*) filter (where e.popularity is null)::int as no_pop
  ${scope}`);
console.log('');
console.log(`  対象: ${base.races} レース / ${base.entries} 行（★人気が null の行 ${base.no_pop} 件は外します）`);

if (Number(base.races) === 0) {
  console.log('  ★確定したレースがありません');
  await c.end();
  process.exit(0);
}

// ── V-4 / V-5: 1 番人気 ─────────────────────────────────
const fav = await one(`
  select count(*)::int as n,
         count(*) filter (where e.finish_pos = 1)::int as wins,
         count(*) filter (where e.finish_pos <= 3)::int as shows
  ${scope} and e.popularity = 1`);
const pct = (a, b) => (Number(b) === 0 ? '—' : ((Number(a) / Number(b)) * 100).toFixed(2));
/** ★二項の SE（★pp 単位） */
const se = (a, b) => {
  const n = Number(b); const p = Number(a) / n;
  return n === 0 ? 0 : Math.sqrt((p * (1 - p)) / n) * 100;
};

// ── V-6: 下位 3 ランクの平均勝率 ───────────────────────
const tail = await one(`
  with ranked as (
    select e.finish_pos,
           row_number() over (partition by e.race_id order by e.popularity desc nulls last) as from_bottom
    ${scope} and e.popularity is not null
  )
  select count(*)::int as n, count(*) filter (where finish_pos = 1)::int as wins
    from ranked where from_bottom <= 3`);

console.log('');
console.log('  #      実測        n        SE      合成（K=0.237・8 シード）  帯');
console.log(`  V-4  ${pct(fav.wins, fav.n).padStart(6)}%  ${String(fav.n).padStart(6)}  ${se(fav.wins, fav.n).toFixed(3)}pp        32.30%            30〜34%`);
console.log(`  V-5  ${pct(fav.shows, fav.n).padStart(6)}%  ${String(fav.n).padStart(6)}  ${se(fav.shows, fav.n).toFixed(3)}pp        62.60%            60〜65%`);
console.log(`  V-6  ${pct(tail.wins, tail.n).padStart(6)}%  ${String(tail.n).padStart(6)}  ${se(tail.wins, tail.n).toFixed(3)}pp         1.18%           0.5〜2%`);

console.log('');
console.log('🔴 ★**この数字は較正の根拠に使えません。**');
console.log('   ★本番の馬は `birth_week` が全頭 null で、★一度も育っていません（★`PROD-NEVER-AGED`）。');
console.log('   ★合成は育つ馬で取りました。★**言えるのは「模型と実物がどれだけ離れているか」まで**です。');

await c.end();
