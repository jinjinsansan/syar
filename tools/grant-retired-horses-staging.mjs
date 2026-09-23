/**
 * ★**staging のオーナーのアカウントに、引退馬を渡す**（★2026-09-24・裁定 §13 の第 1 案）
 *
 *   ★分類: **STATE_CHANGING**（★書きます。★**staging 専用**）
 *   🔴 ★**本番には向けません**（`assertNotProduction`）。★本番で同じことをするなら、
 *      ★裁定 §13 の第 2 案の条件（★オーナーの直接の指示・功労馬から・前後の頭数を残す）に従うこと。
 *
 * 【★なぜ要るか】
 *   ★登録してもらえるのは ★**現役の 1 頭**で、★引退まで実時間で約 26 時間かかります。
 *   ★そのままでは `/stable/roles` が空で、★**一周触れません**。
 *
 * 【★渡すもの】
 *   ★持ち主の居ない ★**功労馬**（`retirement_role = 'honored'`・引退済み）から、★牝 1・牡 1。
 *   ⚠️ ★役割は ★**変えません**（★功労馬のまま渡す）。★繁殖入りさせるのは利用者の操作です。
 *   ⚠️ ★**産める牝**を選びます（★6 歳以上・生涯 8 産未満・今年未産）。★選べないと配合まで進めません。
 *
 * ★使い方: node tools/grant-retired-horses-staging.mjs --env staging --user <uuid>
 */
import pg from 'pg';
import { loadEnv } from './lib/env.mjs';
import { assertNotProduction } from './lib/guard.mjs';

const userId = process.argv[process.argv.indexOf('--user') + 1];
if (userId === undefined || !userId.includes('-')) {
  console.error('使い方: node tools/grant-retired-horses-staging.mjs --env staging --user <uuid>');
  process.exit(2);
}

const env = loadEnv();
const c = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
await assertNotProduction(c, 'grant-retired-horses-staging.mjs');

const one = async (sql, p) => (await c.query(sql, p)).rows[0];
const count = async (sql, p) => Number((await one(sql, p)).n);

/** ★前の頭数（★裁定の条件: 前後を残す） */
const before = {
  owned: await count('select count(*)::int n from horses where owner_id = $1', [userId]),
  retired: await count('select count(*)::int n from horses where owner_id = $1 and retired_at_week is not null', [userId]),
  npcHonored: await count("select count(*)::int n from horses where owner_id is null and retirement_role = 'honored'"),
};
console.log(`★前: この利用者 ${before.owned} 頭（うち引退 ${before.retired}）／ NPC の功労馬 ${before.npcHonored} 頭`);

const week = Number((await one('select game_week n from world_state where id = true')).n);
/** ★産める牝（★6 歳以上・生涯 8 産未満・今年まだ産んでいない） */
const mare = await one(
  "select id::text, name from horses where owner_id is null and retirement_role = 'honored'"
    + ' and sex = $1 and retired_at_week is not null and not bred_this_year and foal_count < 8'
    + ' and birth_week is not null and ($2 - birth_week) >= 6 * 52 order by id limit 1',
  ['female', week],
);
const stallion = await one(
  "select id::text, name from horses where owner_id is null and retirement_role = 'honored'"
    + ' and sex = $1 and retired_at_week is not null and birth_week is not null order by id limit 1',
  ['male'],
);
if (mare === undefined || stallion === undefined) {
  console.error('🔴 ★渡せる馬が見つかりません（★牝 か 牡 が足りない）');
  await c.end();
  process.exit(1);
}

await c.query('begin');
try {
  await c.query('update horses set owner_id = $1, npc_stable_id = null where id = any($2::uuid[])',
    [userId, [mare.id, stallion.id]]);
  await c.query('commit');
} catch (e) {
  await c.query('rollback');
  throw e;
}

const after = {
  owned: await count('select count(*)::int n from horses where owner_id = $1', [userId]),
  retired: await count('select count(*)::int n from horses where owner_id = $1 and retired_at_week is not null', [userId]),
  npcHonored: await count("select count(*)::int n from horses where owner_id is null and retirement_role = 'honored'"),
};
console.log(`★渡した: 牝 ${mare.name}（${mare.id}）／ 牡 ${stallion.name}（${stallion.id}）`);
console.log(`★後: この利用者 ${after.owned} 頭（うち引退 ${after.retired}）／ NPC の功労馬 ${after.npcHonored} 頭`);
console.log(`★差: 利用者 +${after.owned - before.owned} ／ NPC の功労馬 ${after.npcHonored - before.npcHonored}`);
await c.end();
