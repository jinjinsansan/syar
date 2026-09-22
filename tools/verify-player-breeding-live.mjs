/**
 * 🔴 ★**プレイヤーの配合が、★本物の DB で通ることを確かめる**（★PLAN I-2・D-120・2026-09-22）
 *
 *   ★分類: **STATE_CHANGING**（★取引の中で書きます。★**必ず `rollback` します**）
 *
 * ============================================================================
 * 【★なぜ在るか】
 *   ★`apps/cli/test/player-breeding.test.ts` は ★偽の DB です。★偽物では ★**行の形・権限・一意・RPC の SQL** が見えません
 *   （★2026-09-21 に偽物で緑・本物で赤を 1 度やりました・`verify-breeding-live.mjs`）。
 *   ★そして裁定（`REVIEW_FIRST_HORSE_BREED_PLACEMENT_VERDICT_20260922.md` §2）が
 *   ★**「NPC の経路とプレイヤーの経路が同じ母で 1 頭ずつ作ろうとする形」**で試験を書け、と言っています。
 *
 * 【★なぜ `rollback` して構わないか（★確かめました）】
 *   ★`confirmInitialBreeding` と `runBreedingWeek` は ★**自分で `begin`/`commit` しません**
 *   （★`player-breeding.test.ts` の「確定の本体は取引に触らない」と、
 *    ★`breeding-runner.test.ts` の「runBreedingWeek は取引に触らない」が釘付け）。
 *   ★RPC（`request_initial_breeding`）も ★関数の中で取引を閉じません（★plpgsql の関数は閉じられない）。
 *
 * 【★判定】
 *   ① ★表・関数が届いていて、★利用者のロールから表を直に読めない（★対照: RPC は呼べる）
 *   ② ★受付の鍵 2 段（★同じ要求 ID → 同じ行 ／ ★別の要求 ID → 最初の行 ／ ★他人の ID は拒む）
 *   ③ ★確定: 下書き・母の印と産駒数・父の種付・免除の記帳（★増減 0）・要求の完了が ★そろう
 *   ④ ★仔の ID ＝ ★要求 ID から作った ID（★裁定 §3）
 *   ⑤ ★同じ要求をもう一度 確定しても増えない（★skipped）
 *   ⑥ ★本人の読む口が ★性別・父・母・誕生週だけを返す（★genotype / potential / stats の列が無い）
 *   ⑦ 🔴 ★NPC の週次配合が ★**同じ母で同じ年に産まない**（★案 B の母〔功労馬〕が年の頭に繁殖牝馬へ補充され、
 *      ★印も戻った形を作って確かめる）
 *      ★対照: ★プレイヤーが触っていない母は ★**普通に産む**（★番人が常に止めるのではない）
 *   ⑧ ★`rollback` の後、★行数が ★元に戻っている
 *
 * ★使い方: npx tsx tools/verify-player-breeding-live.mjs --env staging
 * ============================================================================
 */
import { createHash } from 'node:crypto';

import pg from 'pg';

import { loadEnv } from './lib/env.mjs';
import { assertNotProduction } from './lib/guard.mjs';
import { exitWithVerdict, verdictOf, VERDICT } from './lib/counted-verdict.mjs';
import {
  BREEDING_COLS, breedingRecordOf, idAndSeedFromKey, runBreedingWeek,
} from '../apps/worker/src/breeding-runner.ts';
import {
  PLAYER_FOAL_KEY_PREFIX, confirmInitialBreeding, playerBreedingContext,
} from '../apps/worker/src/player-breeding.ts';
import { DEFAULT_PRESEED_OPTIONS } from '../apps/cli/src/preseed.ts';
import { FIELD_SIZE } from '../apps/cli/src/race-field.ts';
import { DEFAULT_BALANCE, canMate } from '../packages/sim-engine/src/index.ts';
import { WEEK_MS, WEEKS_PER_YEAR, gameYearOf, weekIndexAt } from '../packages/scheduler/src/index.ts';

const env = loadEnv();
const EPOCH = Date.parse(env.STAR_EPOCH_ISO);
if (!Number.isFinite(EPOCH)) throw new Error('verify-player-breeding-live: STAR_EPOCH_ISO を読めません');

const c = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
c.on('error', (e) => { console.error(`🔴 ★接続が落ちました: ${e.message}`); process.exit(VERDICT.UNDECIDABLE); });
await c.connect();
// 🔴 ★書きます（★取引の中だけ・★必ず戻します）。★本番には向けません
await assertNotProduction(c, 'verify-player-breeding-live.mjs');
const q = async (s, p) => (await c.query(s, p)).rows;

const fails = [];
let checked = 0;
const check = (ok, label, detail) => {
  checked += 1;
  if (!ok) fails.push(label);
  console.log(`  ${ok ? '✓' : '🔴'} ${label}${detail ? `  ${detail}` : ''}`);
};

const COUNTED = ['horses', 'foal_requests', 'foal_drafts', 'ep_ledger', 'users'];
const countAll = async () => {
  const out = {};
  for (const t of COUNTED) out[t] = Number((await q(`select count(*)::int n from ${t}`))[0].n);
  return out;
};

/** ★NPC の配合が母の番を決める式（★`breeding-runner.ts` の `mare-week|<id>`・★写しなので下で突き合わせる） */
const dueOf = (id) => parseInt(createHash('sha256').update(`mare-week|${id}`, 'utf8').digest('hex').slice(0, 8), 16) % 52;

/** ★ロールと利用者を切り替えて RPC を呼ぶ（★取引の中だけ・`set local`） */
const asUser = async (userId, fn) => {
  // ★失敗したときに ★元のエラーが「取引が中断している」に隠れないよう、★セーブポイントで包む
  await c.query('savepoint as_user');
  await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: userId, role: 'authenticated' })]);
  await c.query('set local role authenticated');
  try {
    const out = await fn();
    await c.query('reset role');
    await c.query('release savepoint as_user');
    return out;
  } catch (e) {
    await c.query('rollback to savepoint as_user');
    await c.query('reset role');
    throw e;
  }
};

console.log('# ★プレイヤーの配合を、★本物の DB で通す（★必ず rollback します）');
const before = await countAll();
console.log(`  ★いまの行数: ${JSON.stringify(before)}`);

const nowMs = Number((await q('select (extract(epoch from now()) * 1000)::bigint as ms'))[0].ms);
const week = weekIndexAt(nowMs, EPOCH);
const year = gameYearOf(week);
const yearStart = year * WEEKS_PER_YEAR;
console.log(`  ★いまの週 ${week}（★${year} 年・年の中で ${week - yearStart} 週目）`);

const U1 = '0f000000-0000-4000-8000-00000000a001';
const U2 = '0f000000-0000-4000-8000-00000000a002';
const R1 = '0f000000-0000-4000-8000-00000000b001';
const R2 = '0f000000-0000-4000-8000-00000000b002';

let threw = null;
await c.query('begin');
try {
  // ── ① ★届いているか・★直に読めないか ──
  const t = (await q("select to_regclass('public.foal_requests')::text a, to_regclass('public.foal_drafts')::text b"))[0];
  const priv = (await q(
    "select has_table_privilege('authenticated','public.foal_requests','select') r,"
      + " has_table_privilege('authenticated','public.foal_drafts','select') d,"
      + " has_table_privilege('anon','public.foal_drafts','select') a,"
      + " has_function_privilege('authenticated','public.request_initial_breeding(uuid,uuid,uuid)','execute') f,"
      + " has_function_privilege('anon','public.request_initial_breeding(uuid,uuid,uuid)','execute') fa",
  ))[0];
  check(t.a === 'foal_requests' && t.b === 'foal_drafts', '① ★表が届いている（★0061）', JSON.stringify(t));
  check(priv.r === false && priv.d === false && priv.a === false,
    '① ★利用者・匿名のロールから表を直に読めない', JSON.stringify({ r: priv.r, d: priv.d, a: priv.a }));
  check(priv.f === true && priv.fa === false, '① ★対照: ★ログインした人は受付を呼べる／匿名は呼べない',
    JSON.stringify({ f: priv.f, fa: priv.fa }));

  // ── 試験用の利用者（★取引の中だけ） ──
  for (const u of [U1, U2]) {
    await c.query('insert into auth.users (id, email, email_confirmed_at) values ($1, $2, now())',
      [u, `verify-player-breeding+${u.slice(-4)}@example.invalid`]);
    await c.query(
      "insert into users (id, display_name, stable_name, entry_points) values ($1, '検証', '検証牧場', 2000)", [u],
    );
  }

  // ── 親を選ぶ（★NPC の繁殖馬・★ロックの後の判定と同じ canMate で絞る） ──
  // ★母は ★NPC の功労馬（★引退した産める牝馬・案 B・N-1 §1）。★⑦ の対照のために繁殖牝馬も読む
  const mareRows = await q(
    `select ${BREEDING_COLS} from horses where retirement_role = 'honored' and sex = 'female' and owner_id is null`
      + ' and birth_week is not null and not bred_this_year order by id',
  );
  const broodmareRows = await q(
    `select ${BREEDING_COLS} from horses where retirement_role = 'broodmare' and owner_id is null`
      + ' and birth_week is not null and not bred_this_year order by id',
  );
  const stallionRows = await q(
    `select ${BREEDING_COLS} from horses where retirement_role = 'stallion' and owner_id is null`
      + ' and birth_week is not null order by id',
  );
  const stallions = stallionRows.map(breedingRecordOf);
  /** ★⑦ のために: ★この年のうちに、★まだ来ていない番の母（★年の頭の週は避ける＝印の一斉戻しが別に走る） */
  const futureDue = (r) => {
    const d = dueOf(r.id);
    return d > week - yearStart && d !== 0;
  };
  let dam = null;
  let sire = null;
  for (const row of mareRows) {
    if (!futureDue(row)) continue;
    const m = breedingRecordOf(row);
    const s = stallions.find((x) => canMate(x, m, DEFAULT_BALANCE, year).ok);
    if (s !== undefined) { dam = m; sire = s; break; }
  }
  if (dam === null || sire === null) throw new Error('★条件に合う父母が見つかりません（★判定不能）');
  const damDue = yearStart + dueOf(dam.id);
  console.log(`  ★母 ${dam.id}（★番は ${damDue} 週）/ ★父 ${sire.id}`);
  const damBefore = (await q('select foal_count, bred_this_year from horses where id = $1', [dam.id]))[0];
  const sireBefore = (await q('select coverings_this_year from horses where id = $1', [sire.id]))[0];

  // ── ② ★受付の鍵 2 段 ──
  const call = (u, r) => asUser(u, async () =>
    (await q('select * from request_initial_breeding($1, $2, $3)', [r, sire.id, dam.id]))[0]);
  const a1 = await call(U1, R1);
  /** ★最初の受付の直後の seed_key（★再送・別タブの後と比べる） */
  const skFirst = (await q('select seed_key::text sk from foal_requests where id = $1', [R1]))[0]?.sk;
  const a2 = await call(U1, R1);
  const a3 = await call(U1, R2);
  check(a1.status === 'pending' && a1.request_id === R1, '② ★受け付けた（★待ち）', JSON.stringify(a1));
  check(a2.request_id === R1 && a2.status === 'pending', '② ★同じ要求 ID の再送 → ★同じ行（★エラーにしない）');
  check(a3.request_id === R1, '② ★別の要求 ID（★別タブ）→ ★最初の行を返す（★初回は 1 件）', `返った ${a3.request_id}`);
  const nReq = Number((await q('select count(*)::int n from foal_requests where user_id = $1', [U1]))[0].n);
  check(nReq === 1, '② ★要求の行は 1 つだけ', `${nReq} 行`);
  const skAfterResend = (await q('select seed_key::text sk from foal_requests where id = $1', [R1]))[0]?.sk;
  check(typeof skFirst === 'string' && skAfterResend === skFirst && skFirst !== R1,
    '② ★再送・別タブの後も seed_key は最初の値のまま（★DB が決め、★要求 ID とは別の値）',
    `${String(skFirst).slice(0, 8)}… → ${String(skAfterResend).slice(0, 8)}…`);
  let rejected = false;
  try { await call(U2, R1); } catch (e) { rejected = /使えません/.test(e.message); }
  check(rejected, '② ★他人の要求 ID は拒む（★中身を返さない）');

  // ── ③ ★確定 ──
  const ctx = await playerBreedingContext(c, nowMs, EPOCH, () => {});
  const t0 = process.hrtime.bigint();
  const o1 = await confirmInitialBreeding(c, R1, ctx);
  const elapsedMs = Number(process.hrtime.bigint() - t0) / 1e6;
  const req = (await q('select status, result_id::text rid, waived_stud_fee_ep w, failure_reason from foal_requests where id = $1', [R1]))[0];
  const draft = (await q('select id::text, user_id::text, sire_id::text, dam_id::text, sex, birth_week, record from foal_drafts where request_id = $1', [R1]))[0];
  const damAfter = (await q('select foal_count, bred_this_year from horses where id = $1', [dam.id]))[0];
  const sireAfter = (await q('select coverings_this_year from horses where id = $1', [sire.id]))[0];
  const led = await q("select delta, reason from ep_ledger where dedupe_key = $1", [`stud_fee_waiver:${R1}`]);
  check(o1 === 'done' && req.status === 'done', '③ ★確定した', `★${o1} / ${JSON.stringify(req).slice(0, 160)} / ★${elapsedMs.toFixed(0)}ms`);
  check(draft !== undefined && draft.sire_id === sire.id && draft.dam_id === dam.id && draft.user_id === U1
    && Number(draft.birth_week) === week,
    '③ ★下書き: ★選んだ父母・本人・いまの週', draft === undefined ? '★無い' : `${draft.sex} / 週 ${draft.birth_week}`);
  check(damAfter.bred_this_year === true && damAfter.foal_count === damBefore.foal_count + 1,
    '③ ★母: 今年の印 ＋ 産駒数 +1', `${JSON.stringify(damBefore)} → ${JSON.stringify(damAfter)}`);
  check(sireAfter.coverings_this_year === sireBefore.coverings_this_year + 1,
    '③ ★父: 種付 +1', `${sireBefore.coverings_this_year} → ${sireAfter.coverings_this_year}`);
  check(led.length === 1 && Number(led[0].delta) === 0 && led[0].reason === 'stud_fee' && Number(req.w) >= 3000,
    '③ ★免除を記帳（★台帳は増減 0 の stud_fee・★額は要求の行）', `★${req.w} EP`);
  const ep = (await q('select entry_points from users where id = $1', [U1]))[0];
  check(Number(ep.entry_points) === 2000, '③ ★EP は動いていない（★無償・D-120 ②）', `${ep.entry_points}`);

  // ── ④ ★仔の ID（★DB が決めた seed_key から・裁定 322d603 §1） ──
  const sk = (await q('select seed_key::text sk from foal_requests where id = $1', [R1]))[0].sk;
  const want = await idAndSeedFromKey(`${PLAYER_FOAL_KEY_PREFIX}${sk}`);
  const fromClient = await idAndSeedFromKey(`${PLAYER_FOAL_KEY_PREFIX}${R1}`);
  check(draft?.id === want.id && req.rid === want.id && draft?.id !== fromClient.id,
    '④ 🔴 ★仔の ID ＝ DB が決めた seed_key から作った ID（★クライアントの要求 ID からではない）', `seed_key ${sk.slice(0, 8)}…`);

  // ── ⑤ ★もう一度 ──
  const o2 = await confirmInitialBreeding(c, R1, ctx);
  const nDraft = Number((await q('select count(*)::int n from foal_drafts where user_id = $1', [U1]))[0].n);
  check(o2 === 'skipped' && nDraft === 1, '⑤ ★同じ要求をもう一度 確定しても増えない', `★${o2} / 下書き ${nDraft}`);

  // ── ⑥ ★本人の読む口 ──
  const mine = await asUser(U1, async () => (await c.query('select * from my_foal_drafts()')));
  const cols = mine.fields.map((f) => f.name);
  const leaked = cols.filter((n) => /genotype|potential|stats|record/i.test(n));
  check(mine.rows.length === 1 && leaked.length === 0, '⑥ ★本人の下書きは 1 頭・★非公開の列が無い', `列 ${cols.join(',')}`);
  const others = await asUser(U2, async () => (await c.query('select * from my_foal_drafts()')).rows.length);
  check(others === 0, '⑥ ★他人の下書きは見えない', `${others} 行`);

  // ── ⑦ ★NPC の週次配合と、★同じ母を取り合う ──
  //   ★案 B の母は ★NPC の功労馬。★年の頭に NPC は功労馬から繁殖牝馬を補充し（★素質の高い順）、★その後で全馬の印を戻す。
  //   ★→ ★プレイヤーが使った母が ★繁殖牝馬に上がり、★印も戻る形を作る（★これが 2 つの表で数える理由）
  await c.query("update horses set retirement_role = 'broodmare', bred_this_year = false where id = $1", [dam.id]);
  const dueMates = broodmareRows.filter((r) => yearStart + dueOf(r.id) === damDue && r.id !== dam.id).map((r) => r.id);
  const npc = await runBreedingWeek(
    c, EPOCH + (damDue + 1) * WEEK_MS, EPOCH, () => {}, undefined, 'top',
    (FIELD_SIZE.MIN + FIELD_SIZE.MAX) / 2, DEFAULT_PRESEED_OPTIONS.mares,
  );
  const npcFoalOfDam = Number((await q(
    'select count(*)::int n from horses where dam_id = $1 and birth_week >= $2 and birth_week < $3',
    [dam.id, yearStart, yearStart + WEEKS_PER_YEAR],
  ))[0].n);
  check(npc.week === damDue, '⑦ ★NPC の配合が ★母の番の週を処理した', `★週 ${npc.week} / 生まれた ${npc.born} / 既に居た ${npc.alreadyThere} / 相手なし ${npc.noSire}`);
  check(npcFoalOfDam === 0 && npc.alreadyThere >= 1, '⑦ 🔴 ★同じ母・同じ年に ★NPC は産ませなかった（★印が戻っていても）',
    `★この母の今年の NPC の仔 ${npcFoalOfDam} 頭`);
  const bornOthers = dueMates.length === 0 ? null : Number((await q(
    'select count(*)::int n from horses where dam_id = any($1::uuid[]) and birth_week = $2', [dueMates, damDue],
  ))[0].n);
  if (bornOthers === null) {
    checked += 1;
    fails.push('⑦ 対照 ★判定不能');
    console.log('  🔴 ★⑦ の対照を判定できません（★同じ週が番の母が他に居ない）。★合格にしません');
  } else {
    check(bornOthers > 0, '⑦ ★対照: ★プレイヤーが触っていない母は ★普通に産んだ', `★${bornOthers} / ${dueMates.length} 頭`);
  }
} catch (e) {
  threw = e;
  check(false, '★途中で落ちた', `🔴 ${e.message}`);
} finally {
  await c.query('rollback');
}
if (threw !== null) console.log(`  🔴 ★落ちた場所:\n${String(threw.stack ?? threw).split('\n').slice(0, 6).join('\n')}`);

// ── ⑧ ★戻ったか（★rollback を呼んだだけで済ませない） ──
const after = await countAll();
check(JSON.stringify(after) === JSON.stringify(before), '⑧ ★rollback の後、★行数が元に戻った', JSON.stringify(after));

await c.end();
for (const f of fails) console.log(`  🔴 ${f}`);
exitWithVerdict(verdictOf({ checked, failed: fails.length, label: 'プレイヤーの配合（本物の DB）' }));
