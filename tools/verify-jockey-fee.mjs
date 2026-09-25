// @ts-check
/**
 * 🔴 ★**騎手の料金が実際に引かれ、クライアントが額を決められないこと**
 *   ★裁定 `REVIEW_JOCKEY_FEE_20260925.md`・移行 `0082_jockey_roster_server_side.sql`
 *
 * 【★確かめること】
 *   ★① ★騎手を指名すると ★**登録料 ＋ 名簿の料金**が引かれる（★対照: 指名しなければ登録料だけ）
 *   ★② ★凍結が ★**サーバーの形**（`{ v, jockeyId, name, feeEP, bond, effect, calm }`）で入る
 *   ★③ ★**古い（`jsonb` を受ける）署名が呼べない**（★多重定義で残っていないこと）
 *   ★④ ★知らない騎手 id は ★**落ちる**（★「無料の騎手」にならない）
 *   ★⑤ ★親密度は ★**乗せた回数から**サーバーが決める（★利用者が申告しない）
 *
 * ⚠️ ★**必ず `--env staging`**（★`loadEnv` の既定は本番）。★最後に rollback します。
 *
 *   npx tsx tools/verify-jockey-fee.mjs --env staging
 */
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { loadEnv } from './lib/env.mjs';
import { assertNotProduction } from './lib/guard.mjs';
import { beginSandbox, endSandbox } from './lib/sandbox-tx.mjs';
import { JOCKEYS } from '@star/scheduler';

const env = loadEnv();
console.log('接続先:', env.STAR_ENV);
const c = new pg.Client({ connectionString: env.DATABASE_URL });
await c.connect();
await assertNotProduction(c, 'verify-jockey-fee.mjs');
const __tx = await beginSandbox(c);

let failed = 0;
const must = (b, m) => { console.log(`  ${b ? '✅' : '🔴'} ${m}`); if (!b) failed += 1; };
/** @param {string} s @param {unknown[]=} p @returns {Promise<any[]>} */
const q = async (s, p) => (await c.query(s, p)).rows;
/** @param {string} s @param {unknown[]=} p @returns {Promise<any>} */
const one = async (s, p) => (await q(s, p))[0];
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
    [uid, `jockey-fee-${uid.slice(0, 8)}@test.local`],
  );
  await c.query(
    `insert into users (id, display_name, stable_name, entry_points) values ($1, $2, $3, 100000)`,
    [uid, `検査 ${uid.slice(0, 8)}`, '検査厩舎'],
  );
  await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: uid, role: 'authenticated' })]);

  /** ★一番高い騎手で試す（★無料になっていたら差が大きく出る） */
  const top = [...JOCKEYS].sort((a, b) => b.feeEP - a.feeEP)[0];
  console.log(`  試す騎手: ${top.id}（名簿の料金 ${top.feeEP} EP）`);

  /**
   * ★検査用の馬。
   * ⚠️ ★`horses` には NOT NULL の列（`sire_line` など）が在るので、★**行を作りません**。
   *    ★列を発明すると ★製品が入れている値と違うものを測ることになります。
   *    → ★NPC の未出走馬を ★**借ります**（★初期馬の付与と同じ形。★サンドボックスで戻ります）。
   */
  const mkHorse = async () => {
    const h = await one(
      `select h.id from horses h
        where h.owner_id is null and h.npc_stable_id is not null and h.retired_at_week is null
          and not exists (select 1 from race_entries e where e.horse_id = h.id)
        limit 1 for update skip locked`,
    );
    if (h === undefined) throw new Error('★NPC の未出走馬がいません（★staging に馬が無い）');
    await c.query('update horses set owner_id = $2, npc_stable_id = null where id = $1', [h.id, uid]);
    return h.id;
  };
  const mkRace = async (cy) => (await one(
    `insert into races (name, class_rank, surface, distance, track_condition, course_id, scheduled_at,
                        seed_commit, purse, status, cycle_index, entry_deadline_at, min_wins, max_wins,
                        entry_fee_ep, weight_kg)
     values ($1, 1, 'turf', 1600, 'good', 'C1', now() + interval '2 hours', 'X', 0, 'announced', $2,
             now() + interval '1 hour', 0, null, 200, 55) returning id`,
    [`検査レース${cy}`, cy],
  )).id;

  const baseCy = Number((await one('select coalesce(max(cycle_index), 0) + 400000 n from races')).n);
  const horseA = await mkHorse();
  const horseB = await mkHorse();
  const raceA = await mkRace(baseCy);
  const raceB = await mkRace(baseCy + 1);

  const bal = async () => Number((await one('select entry_points from users where id = $1', [uid])).entry_points);

  // --- ① 対照: 指名しない → 登録料だけ ---
  const b0 = await bal();
  await one('select enter_race($1, $2, $3, $4, $5)', [raceB, horseB, 'senko', null, randomUUID()]);
  const paidNone = b0 - await bal();
  must(paidNone === 200, `① 対照: 指名しないと登録料 200 だけ引かれる（実測 ${paidNone}）`);

  // --- ① 指名する → 登録料 ＋ 名簿の料金 ---
  const b1 = await bal();
  const entryId = (await one('select enter_race($1, $2, $3, $4, $5) id', [raceA, horseA, 'senko', top.id, randomUUID()])).id;
  const paid = b1 - await bal();
  must(paid === 200 + top.feeEP,
    `① 指名すると登録料 200 ＋ 騎手 ${top.feeEP} ＝ ${200 + top.feeEP} 引かれる（実測 ${paid}）`
    + `${paid === 200 ? ' 🔴 ★騎手が無料のままです' : ''}`);

  // --- ② 凍結がサーバーの形 ---
  const fr = (await one('select jockey_frozen f from race_entries where id = $1', [entryId])).f;
  must(fr !== null && Number(fr.v) === 1, `② 凍結に v=1 が入っている（実測 ${JSON.stringify(fr)}）`);
  must(fr?.jockeyId === top.id, `② jockeyId が入っている（★旧は 'id' キーだった）`);
  must(Number(fr?.feeEP) === top.feeEP, `② feeEP が名簿の額（実測 ${fr?.feeEP} / 名簿 ${top.feeEP}）`);
  must(fr?.name === top.name, '② 名前が名簿から入っている');
  must(Number(fr?.effect) === 0, '② 着順への効果は 0（★この便では効かない）');

  // --- ③ 古い（jsonb を受ける）署名が呼べない ---
  const f3 = await expectFail(() => c.query(
    `select enter_race($1, $2, 'senko', $3::jsonb, $4)`,
    [raceA, horseA, JSON.stringify({ jockeyId: top.id, feeEP: 0 }), randomUUID()],
  ));
  must(f3.ok, `③ jsonb を受ける古い署名が呼べない（★多重定義で残っていない）`
    + `${f3.ok ? ` — ${f3.message.split('\n')[0]}` : ' 🔴 ★呼べてしまいます＝穴が残っています'}`);

  // --- ④ 知らない騎手 id は落ちる ---
  const horseC = await mkHorse();
  const raceC = await mkRace(baseCy + 2);
  const f4 = await expectFail(() => c.query(
    'select enter_race($1, $2, $3, $4, $5)', [raceC, horseC, 'senko', 'j-nonexistent', randomUUID()],
  ));
  must(f4.ok, `④ 知らない騎手 id で落ちる（★「無料の騎手」にならない）`
    + `${f4.ok ? ` — ${f4.message.split('\n')[0]}` : ''}`);

  // --- ⑤ 親密度は乗せた回数から（★1 回 乗せた後は bond = 1） ---
  const raceD = await mkRace(baseCy + 3);
  const e2 = (await one('select enter_race($1, $2, $3, $4, $5) id', [raceD, horseA, 'senko', top.id, randomUUID()])).id;
  const fr2 = (await one('select jockey_frozen f from race_entries where id = $1', [e2])).f;
  must(Number(fr2?.bond) === 1, `⑤ 2 回めの登録で親密度が 1 になる（実測 ${fr2?.bond}・★利用者は申告していない）`);
} finally {
  await endSandbox(c, __tx);
  await c.end();
}

console.log(failed === 0 ? '\n✅ すべて通りました' : `\n🔴 ${failed} 件 落ちました`);
process.exit(failed === 0 ? 0 : 1);
