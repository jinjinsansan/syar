// @ts-check
/**
 * 🔴 ★**引退馬の公開の一覧**（★`0083`・裁定 `REVIEW_RETIRED_SCREEN_PORTS_20260925.md` §4）
 *
 * 【★確かめること】
 *   ★① ★行が返る（★対照: ★引退馬が 0 件なら測れないので、先に数える）
 *   ★② ★**持ち主の表示名が列に無い**（★LR-6・★列の名前を実 DB から引く）
 *   ★③ ★牧場名は出る（★持ち主がいる馬）
 *   ★④ ★`anon` のロールで読める（★裁定 §4 条件 ②）
 *   ★⑤ ★並びが決定論（★2 回 読んで同じ順）
 *   ★⑥ ★戦績が `my_retired_horses()` と ★**同じ数**（★同じ馬で突き合わせる）
 *
 * ⚠️ ★**必ず `--env staging`**。★読むだけ（★書きません）。
 *
 *   npx tsx tools/verify-retired-public.mjs --env staging
 */
import pg from 'pg';
import { loadEnv } from './lib/env.mjs';

const env = loadEnv();
console.log('接続先:', env.STAR_ENV);
const c = new pg.Client({ connectionString: env.DATABASE_URL });
await c.connect();
await c.query('begin read only');

let failed = 0;
const must = (b, m) => { console.log(`  ${b ? '✅' : '🔴'} ${m}`); if (!b) failed += 1; };
/** @param {string} s @param {unknown[]=} p @returns {Promise<any[]>} */
const q = async (s, p) => (await c.query(s, p)).rows;

try {
  // --- ① 対照: 引退馬が在るか ---
  const n = Number((await q('select count(*)::int n from horses where retired_at_week is not null'))[0].n);
  must(n > 0, `① 対照: 引退馬が ${n} 頭 在る（★0 なら以下は測れません）`);

  const rows = await q('select * from retired_horses_public order by retired_at_week desc, horse_id limit 5');
  must(rows.length > 0, `① 公開の一覧が ${rows.length} 行 返る`);

  // --- ② 表示名の列が無い ---
  const cols = (await q(
    `select column_name from information_schema.columns where table_name = 'retired_horses_public' order by column_name`,
  )).map((r) => r.column_name);
  console.log(`     列: ${cols.join(', ')}`);
  for (const bad of ['display_name', 'email', 'owner_id']) {
    must(!cols.includes(bad), `② 列に ${bad} が無い（★LR-6）`);
  }
  for (const bad of ['potential', 'speed', 'stamina', 'guts', 'wisdom']) {
    must(!cols.includes(bad), `② 列に ${bad} が無い（★D-114）`);
  }
  must(cols.includes('stable_name'), '③ 牧場名の列は在る（★LR-6 の上限）');

  // --- ③ 持ち主がいる馬に牧場名が入る ---
  const owned = await q(
    `select v.horse_name, v.stable_name from retired_horses_public v
      join horses h on h.id = v.horse_id where h.owner_id is not null limit 3`,
  );
  if (owned.length === 0) console.log('  ⚠️ 持ち主のいる引退馬が staging に 0 頭（★牧場名は測れません）');
  for (const r of owned) must(r.stable_name !== null, `③ ${r.horse_name} に牧場名が入る（${r.stable_name}）`);

  // --- ④ anon で読める ---
  await c.query('savepoint sp');
  await c.query('set local role anon');
  const anonRows = await q('select count(*)::int n from retired_horses_public');
  await c.query('rollback to savepoint sp');
  must(Number(anonRows[0].n) > 0, `④ anon のロールで ${anonRows[0].n} 行 読める（★条件 ②）`);

  // --- ⑤ 並びが決定論 ---
  const ord = async () => (await q(
    'select horse_id from retired_horses_public order by retired_at_week desc, horse_id limit 20',
  )).map((r) => r.horse_id).join(',');
  must(await ord() === await ord(), '⑤ 2 回 読んで同じ順（★決定論・条件 ①）');

  // --- ⑥ 戦績が my_retired_horses と同じ（★同じ馬で） ---
  const same = await q(
    `select v.horse_id, v.wins, v.starts,
            (select count(*) from race_entries e where e.horse_id = v.horse_id and e.finish_pos = 1) w2,
            (select count(*) from race_entries e where e.horse_id = v.horse_id and e.finish_pos is not null) s2
       from retired_horses_public v limit 5`,
  );
  const mismatch = same.filter((r) => Number(r.wins) !== Number(r.w2) || Number(r.starts) !== Number(r.s2));
  must(mismatch.length === 0, `⑥ 戦績の式が一致（★${same.length} 頭で突合・不一致 ${mismatch.length} 件）`);
} finally {
  await c.query('rollback');
  await c.end();
}

console.log(failed === 0 ? '\n✅ すべて通りました' : `\n🔴 ${failed} 件 落ちました`);
process.exit(failed === 0 ? 0 : 1);
