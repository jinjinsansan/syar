// @ts-check
/**
 * 🔴 ★**発見度の素（回数だけ）**（★`0084`・裁定 `REVIEW_DISCOVERY_AXES_20260925.md` §4）
 *
 * 【★確かめること】
 *   ★① ★行が返る（★対照: 出走のある自分の馬で）
 *   ★② ★**段を返さない**（★列に `stage` が無い・条件 3）
 *   ★③ ★**素質・現在値を返さない**（★D-114）
 *   ★④ 🔴 ★**他人の馬は拒む**（★裁定の答え ⑤・★`0083` で他人の馬が一覧に出るので重要）
 *   ★⑤ ★確定した出走だけ数える（★`finish_pos is not null`・`my_retired_horses` と同じ）
 *   ★⑥ ★並びが決定論（★2 回 読んで同じ）
 *
 * ⚠️ ★**必ず `--env staging`**。★取引の中で作って最後に rollback します。
 *
 *   npx tsx tools/verify-discovery-runs.mjs --env staging
 */
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { loadEnv } from './lib/env.mjs';
import { assertNotProduction } from './lib/guard.mjs';
import { beginSandbox, endSandbox } from './lib/sandbox-tx.mjs';

const env = loadEnv();
console.log('接続先:', env.STAR_ENV);
const c = new pg.Client({ connectionString: env.DATABASE_URL });
await c.connect();
await assertNotProduction(c, 'verify-discovery-runs.mjs');
const __tx = await beginSandbox(c);

let failed = 0;
const must = (b, m) => { console.log(`  ${b ? '✅' : '🔴'} ${m}`); if (!b) failed += 1; };
/** @param {string} s @param {unknown[]=} p @returns {Promise<any[]>} */
const q = async (s, p) => (await c.query(s, p)).rows;
/** @param {() => Promise<unknown>} fn */
const expectFail = async (fn) => {
  await c.query('savepoint sp');
  try { await fn(); await c.query('rollback to savepoint sp'); return { ok: false, message: '' }; }
  catch (e) {
    await c.query('rollback to savepoint sp');
    return { ok: true, message: e instanceof Error ? e.message : String(e) };
  }
};

try {
  const uid = randomUUID();
  await c.query(
    `insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
     values ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', $2, 'x', now(), now())`,
    [uid, `disc-${uid.slice(0, 8)}@test.local`],
  );
  await c.query(
    `insert into users (id, display_name, stable_name, entry_points) values ($1, $2, $3, 0)`,
    [uid, `検査 ${uid.slice(0, 8)}`, '検査厩舎'],
  );
  await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: uid, role: 'authenticated' })]);

  // ★出走の在る馬を借りる（★列を発明しない）
  const h = (await q(
    `select e.horse_id from race_entries e where e.finish_pos is not null
      group by e.horse_id having count(*) >= 2 limit 1`,
  ))[0];
  if (h === undefined) throw new Error('★確定した出走が 2 回以上ある馬がいません');
  const mine = h.horse_id;
  await c.query('update horses set owner_id = $2, npc_stable_id = null where id = $1', [mine, uid]);

  // --- ① 行が返る ---
  const rows = await q('select * from my_horse_discovery_runs($1)', [mine]);
  must(rows.length > 0, `① ${rows.length} 行 返る`);
  console.log(`     列: ${Object.keys(rows[0] ?? {}).join(', ')}`);

  // --- ② 段を返さない ／ ③ 素質を返さない ---
  const cols = Object.keys(rows[0] ?? {});
  for (const bad of ['stage', 'discovery_stage', 'label']) {
    must(!cols.includes(bad), `② 列に ${bad} が無い（★段は TS が決める・条件 2）`);
  }
  for (const bad of ['potential', 'speed', 'stamina', 'guts', 'wisdom', 'genotype']) {
    must(!cols.includes(bad), `③ 列に ${bad} が無い（★D-114）`);
  }

  // --- ⑤ 確定した出走だけ ---
  const total = rows.reduce((n, r) => n + Number(r.runs), 0);
  const settled = Number((await q(
    'select count(*)::int n from race_entries where horse_id = $1 and finish_pos is not null', [mine],
  ))[0].n);
  const all = Number((await q('select count(*)::int n from race_entries where horse_id = $1', [mine]))[0].n);
  must(total === settled, `⑤ 合計 ${total} ＝ 確定した出走 ${settled}（★全登録は ${all}）`);

  // --- ⑥ 並びが決定論 ---
  const ord = async () => (await q('select * from my_horse_discovery_runs($1)', [mine]))
    .map((r) => `${r.surface}/${r.track_condition}/${r.distance}/${r.strategy}`).join(',');
  must(await ord() === await ord(), '⑥ 2 回 読んで同じ順（★決定論）');

  // --- ④ 他人の馬は拒む ---
  const other = (await q(
    'select id from horses where (owner_id is null or owner_id <> $1) limit 1', [uid],
  ))[0];
  const f = await expectFail(() => c.query('select * from my_horse_discovery_runs($1)', [other.id]));
  must(f.ok, `④ 他人の馬（★持ち主が違う／NPC）を拒む${f.ok ? ` — ${f.message.split('\n')[0]}` : ' 🔴 ★読めてしまいます'}`);
} finally {
  await endSandbox(c, __tx);
  await c.end();
}

console.log(failed === 0 ? '\n✅ すべて通りました' : `\n🔴 ${failed} 件 落ちました`);
process.exit(failed === 0 ? 0 : 1);
