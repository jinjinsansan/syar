/**
 * ★**騎手の名簿: TS の `JOCKEYS` と ★生きている DB の `jockeys` の行が一致するか**（★読むだけ・2026-09-28）
 *
 * 【★なぜ要るか】
 *   ★画面は TS の `JOCKEYS` で料金を出し、★出走登録（`enter_race` → `jockey_frozen_build`）は ★DB の `jockeys.fee_ep` を引きます。
 *   ★2 か所がずれると ★**画面が 200 と出してサーバーが 300 引く**形が静かに成立します（★金額・D-052）。
 *   ★網 `apps/cli/test/jockey-roster-sql.test.ts` は ★移行 `0082` の本文を読むので、
 *   ★後の移行や手作業で ★DB の行が動いたときは ★見えません（★`0082` は `on conflict (id) do update`）。
 *   → ★生きている DB を読み、★id・name・fee_ep・calm と人数を突き合わせます（★レビュー側の条件）。
 *
 * 使い方（★`--env` は必須・既定は無い）:
 *   npx tsx tools/verify-jockey-roster-live.mjs --env staging
 *   npx tsx tools/verify-jockey-roster-live.mjs --env production
 *
 * ★ずれが 1 件でも ★非ゼロで終わります。★DB の行が 0 人でも ★不合格（★R-21・「0 件を返して緑」にしない）。
 * ⚠️ ★1 行も書きません（★select のみ）。
 */
import pg from 'pg';
import { loadEnv } from './lib/env.mjs';
import { JOCKEYS } from '../packages/scheduler/src/jockeys.ts';

const env = loadEnv();
const c = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
let failed = false;
try {
  const rows = (await c.query('select id, name, fee_ep, calm::float8 as calm from jockeys order by id')).rows;
  const wrong = [];
  if (rows.length === 0) wrong.push('★DB の jockeys が 0 人（★読めていないか、名簿が空）');
  if (JOCKEYS.length === 0) wrong.push('★TS の JOCKEYS が 0 人');
  if (rows.length !== JOCKEYS.length) wrong.push(`★人数が違う（TS ${JOCKEYS.length} / DB ${rows.length}）`);
  for (const j of JOCKEYS) {
    const r = rows.find((x) => x.id === j.id);
    if (!r) { wrong.push(`${j.id}: DB に無い`); continue; }
    if (r.name !== j.name) wrong.push(`${j.id}: 名前 TS ${j.name} / DB ${r.name}`);
    if (r.fee_ep !== j.feeEP) wrong.push(`${j.id}: 料金 TS ${j.feeEP} / DB ${r.fee_ep}`);
    if (Math.abs(r.calm - j.calm) > 1e-9) wrong.push(`${j.id}: 落ち着き TS ${j.calm} / DB ${r.calm}`);
  }
  for (const r of rows) if (!JOCKEYS.some((j) => j.id === r.id)) wrong.push(`${r.id}: TS に無い（★DB で発明している）`);
  console.log('# 騎手の名簿（★TS と 生きている DB）');
  console.log(`  DB ${rows.length} 人 ／ TS ${JOCKEYS.length} 人`);
  console.log(`  DB の料金: ${rows.map((r) => `${r.id}=${r.fee_ep}`).join(' ')}`);
  if (wrong.length > 0) {
    failed = true;
    console.log(`\n🔴 ★ずれ ${wrong.length} 件（★正は TS。★画面の料金とサーバーが引く料金が違う）`);
    for (const w of wrong) console.log(`  🔴 ${w}`);
  } else {
    console.log('\n✅ ★一致しました（★id・name・fee_ep・calm と人数）');
  }
} finally {
  await c.end();
}
console.log('⚠️ ★1 行も書いていません（★select のみ）');
process.exit(failed ? 1 : 0);
