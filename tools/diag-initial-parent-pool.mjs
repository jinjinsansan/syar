/**
 * ★**初回の配合の父母候補が、★その DB にどれだけ在るか**（★D-120 ⑥ N-1・2026-09-22）。
 *
 *   ★分類: **READONLY**（★取引を `read only` で張ります。★書き込みは DB が拒みます）
 *
 * ============================================================================
 * 【★なぜ在るか】
 *   ★裁定 `REVIEW_N1_PARENT_SOURCE_VERDICT_20260922.md` §6: ★案 B（引退した産める NPC 牝馬）を本番に出す前に、
 *   ★**本番の数を読むだけの道具で測る**。★報告 `REPORT_N1_PARENT_SOURCE_20260922.md` の数は staging のもの。
 *
 * 【★出すもの】
 *   ① ★案 B の母の候補: ★NPC の功労馬（`honored`）の牝馬で、★6 歳以上・★生涯 8 産未満・★今年まだ産んでいない
 *   ② ★その `foal_count` の分布と、★残りの産める数の合計 Σ(8 − 産駒数)
 *   ③ ★NPC の種牡馬（6 歳以上）の年の上限の合計・★今年の使用・★余り
 *   ④ ★参考: 案 A の母（NPC の繁殖牝馬・今年まだ産んでいない）
 *   ★年齢・上限の判定は ★ワーカーと同じ部品（`@star/sim-engine` の `DEFAULT_BALANCE`・`@star/scheduler` の `gameYearOf`）
 *
 * 【⚠️ ★本番に向けるとき】
 *   ★本番の読み取りも権限層が止めることがあります（★記憶「本番の読み取りも権限層が止める」）。
 *   ★オーナーに次の 1 行を渡して流してもらいます:
 *     npx tsx tools/diag-initial-parent-pool.mjs --env production
 *   ★出力に接続文字列・個人の情報は出しません（★数だけ）。
 * ============================================================================
 */
import pg from 'pg';

import { loadEnv } from './lib/env.mjs';
import { DEFAULT_BALANCE } from '../packages/sim-engine/src/index.ts';
import { gameYearOf, weekIndexAt, WEEKS_PER_YEAR, WEEKS_PER_DAY } from '../packages/scheduler/src/index.ts';

const env = loadEnv();
const EPOCH = Date.parse(env.STAR_EPOCH_ISO);
if (!Number.isFinite(EPOCH)) throw new Error('diag-initial-parent-pool: STAR_EPOCH_ISO を読めません');

const c = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
const q = async (s, p) => (await c.query(s, p)).rows;

const B = DEFAULT_BALANCE;
await c.query('begin read only');
try {
  const nowMs = Number((await q('select (extract(epoch from now()) * 1000)::bigint ms'))[0].ms);
  const week = weekIndexAt(nowMs, EPOCH);
  const year = gameYearOf(week);
  console.log(`# ★初回の配合の父母候補（★読むだけ）`);
  console.log(`  ★いまの週 ${week}（★${year} 年・年の中で ${week - year * WEEKS_PER_YEAR} 週目・1 年 ＝ 実 ${(WEEKS_PER_YEAR / WEEKS_PER_DAY).toFixed(2)} 日）`);

  const ageOk = (r) => year - gameYearOf(Number(r.birth_week)) >= B.MIN_BREEDING_AGE_YEARS;
  const mares = await q(
    "select retirement_role, foal_count, bred_this_year, birth_week from horses"
      + " where sex = 'female' and owner_id is null and birth_week is not null"
      + " and retirement_role in ('honored', 'broodmare')",
  );
  const fertile = (r) => r.foal_count < B.MARE_LIFETIME_FOALS && ageOk(r) && !r.bred_this_year;

  // ① ② 案 B
  const bPool = mares.filter((r) => r.retirement_role === 'honored' && fertile(r));
  const dist = {};
  let slots = 0;
  for (const r of bPool) {
    dist[r.foal_count] = (dist[r.foal_count] ?? 0) + 1;
    slots += B.MARE_LIFETIME_FOALS - r.foal_count;
  }
  console.log(`  ① ★案 B の母の候補（★NPC の功労馬・6 歳以上・生涯 ${B.MARE_LIFETIME_FOALS} 産未満・今年未産）: ${bPool.length} 頭`);
  console.log(`  ② ★その産駒数の分布: ${JSON.stringify(dist)} ／ ★残りの産める数の合計: ${slots} 頭ぶん`);

  // ③ 種牡馬
  const st = await q(
    "select g1_wins, coverings_this_year, birth_week from horses"
      + " where retirement_role = 'stallion' and owner_id is null and birth_week is not null",
  );
  const stOk = st.filter(ageOk);
  const cap = (s) => B.STALLION_BASE_COVERINGS + s.g1_wins * B.STALLION_COVERINGS_PER_G1;
  const totalCap = stOk.reduce((a, s) => a + cap(s), 0);
  const used = stOk.reduce((a, s) => a + s.coverings_this_year, 0);
  const withG1 = stOk.filter((s) => s.g1_wins > 0).length;
  console.log(`  ③ ★NPC の種牡馬（6 歳以上）: ${stOk.length} 頭 ／ ★年の上限の合計 ${totalCap} 回`
    + ` ／ ★今年の使用 ${used} 回 ／ ★余り ${totalCap - used} 回 ／ ★G1 勝ち ${withG1} 頭`);

  // ④ 参考: 案 A
  const aPool = mares.filter((r) => r.retirement_role === 'broodmare' && fertile(r));
  console.log(`  ④ ★参考（案 A）: NPC の繁殖牝馬で今年まだ産んでいない: ${aPool.length} 頭`);
} finally {
  await c.query('rollback');
  await c.end();
}
