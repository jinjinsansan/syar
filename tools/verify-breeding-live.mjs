/**
 * 🔴 ★**配合が、★本物の DB で走ることを確かめる**（★2026-09-21・簿 `PEDIGREE-CACHE-IDS-NOT-DB-IDS`）
 *
 *   ★分類: **STATE_CHANGING**（★取引の中で書きます。★**必ず `rollback` します**）
 *
 * ============================================================================
 * 【🔴 ★なぜ在るか — ★偽の DB で緑になり、★本番を落としました】
 *   ✔ ★2026-09-21、★`apps/cli/test/breeding-runner.test.ts` は ★**全部 通っていました**。
 *   🔴 ★本番に配備した途端、★週送りが落ちました:
 *     `invalid input syntax for type uuid: "NPC-F00014"`
 *   ★原因は ★**偽の DB が返す行の形が、★本物と違った**ことです
 *     （★偽物の `pedigree_cache` の鍵は uuid、★本物はプリシードの id）。
 *   → ★★**偽物では見つかりません。★本物の DB に、★一度 通してみるしかありません。**
 *
 * 【★なぜ `rollback` して構わないか（★確かめました）】
 *   ✔ ★`runBreedingWeek` は ★**自分で `begin`/`commit` しません**（★`main.ts` が外で張ります）。
 *   ⚠️ ★これは ★**確かめるべきこと**です: ★内側が commit する関数を `rollback` で包むと、
 *     ★★**外側ごと確定します**（★2026-09-21 に staging を 2 度 汚しました）。
 *     → ★2026-09-21 は `grep -n 'begin\|commit\|rollback' apps/worker/src/breeding-runner.ts` が ★**0 行**。
 *     ★2026-09-22 から ★追いつき（`runBreedingCatchUp`）が週ごとに取引を張るので ★grep は使えません。
 *     ★`runBreedingWeek` が取引に触らないことは ★`apps/cli/test/breeding-runner.test.ts` が釘付けにしています。
 *
 * 【★判定】
 *   ★① ★落ちずに走り切る（★これが本題。★本番を落としたのはここ）
 *   ★② ★生まれた仔の ★`sire_id`/`dam_id`/`pedigree_cache` が ★**すべて DB の uuid**
 *   ★③ ★`rollback` の後、★頭数が ★**元に戻っている**（★この道具が世界を動かしていない）
 *   ★⑤ ★（★`name_key` の列が在る DB で）★仔の `name_key` ＝ 正規化した名前・★既存の馬とも仔どうしとも重ならない
 *      （★PLAN I-3 段 0・2026-09-22）
 *   ★⑥ ★持ち主のいる母・種牡馬から ★仔が生まれない（★対照: NPC どうしからは生まれる・裁定 I-1 §2・Q-4）
 *
 * ★使い方: npx tsx tools/verify-breeding-live.mjs --env staging [--week <週>]
 * ============================================================================
 */
import pg from 'pg';

import { loadEnv } from './lib/env.mjs';
import { assertNotProduction } from './lib/guard.mjs';
import { exitWithVerdict, verdictOf, VERDICT } from './lib/counted-verdict.mjs';
import { runBreedingWeek } from '../apps/worker/src/breeding-runner.ts';
import { DEFAULT_PRESEED_OPTIONS } from '../apps/cli/src/preseed.ts';
import { FIELD_SIZE } from '../apps/cli/src/race-field.ts';
import { CYCLE_MS, weekIndexAt } from '../packages/scheduler/src/index.ts';
import { DEFAULT_BALANCE, normalizeName } from '../packages/sim-engine/src/index.ts';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const WEEK_ARG = (() => {
  const i = process.argv.indexOf('--week');
  if (i < 0) return null;
  const n = Number(process.argv[i + 1]);
  return Number.isInteger(n) ? n : null;
})();

const env = loadEnv();
const EPOCH = Date.parse(env.STAR_EPOCH_ISO);
if (!Number.isFinite(EPOCH)) throw new Error('verify-breeding-live: STAR_EPOCH_ISO を読めません');

const c = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
c.on('error', (e) => { console.error(`🔴 ★接続が落ちました: ${e.message}`); process.exit(VERDICT.UNDECIDABLE); });
await c.connect();
// 🔴 ★書きます（★取引の中だけ・★必ず戻します）。★本番には向けません
await assertNotProduction(c, 'verify-breeding-live.mjs');
const q = async (s, p) => (await c.query(s, p)).rows;

console.log('# ★配合を、★本物の DB で 1 週 走らせる（★必ず rollback します）');
const before = Number((await q('select count(*)::int n from horses'))[0].n);
console.log(`  ★いまの頭数: ${before} 頭`);

// ★週は、★DB の now() から出します（★`Date.now()` を使いません・憲法 4）
const nowMs = WEEK_ARG !== null
  ? EPOCH + WEEK_ARG * 4 * 60 * 60 * 1000
  : Number((await q('select (extract(epoch from now()) * 1000)::bigint as ms'))[0].ms);

const fails = [];
let checked = 0;
const check = (ok, label, detail) => {
  checked += 1;
  if (!ok) fails.push(label);
  console.log(`  ${ok ? '✓' : '🔴'} ${label}${detail ? `  ${detail}` : ''}`);
};

const alerts = [];
let result = null;
let threw = null;
/** ★配合 1 週の所要（★周の予算と照らします） */
let elapsedMs = 0;
/**
 * ⑥ ★**持ち主のいる馬を NPC の配合に使わない**（★裁定 `REVIEW_I1_RETIREMENT_ROLE_VERDICT_20260922.md` §2・Q-4）。
 *   ★取引の中で ★「その週に番が来る・産める NPC の繁殖牝馬 1 頭」と ★「種牡馬の半分」に ★仮の持ち主を付けます。
 *   ★その母から仔が生まれず、★その種牡馬が父にならないこと。★対照: ★残りの NPC の馬からは仔が生まれること。
 */
const OWNER = '0f000000-0000-4000-8000-00000000e601';
let ownedMare = null;
let ownedSires = [];
let ownedWeek = null;
await c.query('begin');
try {
  await c.query('insert into auth.users (id, email, email_confirmed_at) values ($1, $2, now())',
    [OWNER, 'verify-breeding-live+e601@example.invalid']);
  await c.query("insert into users (id, display_name, stable_name, entry_points) values ($1, '検証', '検証牧場', 0)", [OWNER]);
  {
    const { createHash } = await import('node:crypto');
    // ★ワーカーは「1 つ前の週」を処理します（`runBreedingWeek` の `weekIndexAt(...) - 1`）。★下で result.week と突き合わせます
    const week = weekIndexAt(nowMs, EPOCH) - 1;
    ownedWeek = week;
    const target = ((week % 52) + 52) % 52;
    const cands = await q(
      "select id::text as id from horses where retirement_role = 'broodmare' and owner_id is null"
        + ' and not bred_this_year and foal_count < $1 and (($2::bigint - birth_week) / 52) >= $3 order by id',
      [DEFAULT_BALANCE.MARE_LIFETIME_FOALS, week, DEFAULT_BALANCE.MIN_BREEDING_AGE_YEARS],
    );
    ownedMare = cands.map((r) => r.id).find((id) => parseInt(
      createHash('sha256').update(`mare-week|${id}`, 'utf8').digest('hex').slice(0, 8), 16,
    ) % 52 === target) ?? null;
    if (ownedMare !== null) await c.query('update horses set owner_id = $1, npc_stable_id = null where id = $2', [OWNER, ownedMare]);
    const sires = await q(
      "select id::text as id from horses where retirement_role = 'stallion' and owner_id is null order by id",
    );
    ownedSires = sires.map((r) => r.id).filter((_, i) => i % 2 === 0);
    await c.query('update horses set owner_id = $1, npc_stable_id = null where id = any($2::uuid[])', [OWNER, ownedSires]);
  }
  const t0 = process.hrtime.bigint();
  result = await runBreedingWeek(
    c, nowMs, EPOCH,
    (m) => { alerts.push(m); },
    undefined, 'top', (FIELD_SIZE.MIN + FIELD_SIZE.MAX) / 2,
    DEFAULT_PRESEED_OPTIONS.mares,
  );
  elapsedMs = Number(process.hrtime.bigint() - t0) / 1e6;

  // ② 生まれた仔の参照が uuid か（★取引の中で読みます）
  const foals = await q(
    'select id::text as id, sire_id::text as sire_id, dam_id::text as dam_id, pedigree_cache'
    + ' from horses where birth_week = $1', [result.week],
  );
  let badRef = 0;
  let badKey = 0;
  for (const f of foals) {
    for (const v of [f.id, f.sire_id, f.dam_id]) if (v !== null && !UUID_RE.test(v)) badRef += 1;
    for (const k of Object.keys(f.pedigree_cache ?? {})) if (!UUID_RE.test(k)) badKey += 1;
  }
  check(true, '① ★落ちずに走り切った（★本番を落としたのはここ）',
    `★週 ${result.week} / 生まれた ${result.born} 頭 / 相手なし ${result.noSire} 頭`
    + ` / 既に居た ${result.alreadyThere} 頭${result.yearReset ? ' / 年次カウンタを戻した' : ''}`);
  if (foals.length === 0) {
    checked += 1;
    fails.push('② ★判定不能');
    console.log('  🔴 ★② を判定できません（★この週に生まれた仔が 0 頭）。★合格にしません'
      + '（★--week で、★配合の番が来る週を指してください）');
  } else {
    check(badRef === 0 && badKey === 0,
      '② ★生まれた仔の参照と血統の鍵が、★すべて DB の uuid',
      `★${foals.length} 頭 / 壊れた参照 ${badRef} 件 / 壊れた鍵 ${badKey} 件`);

    /**
     * ⑤ ★**仔の名前と `name_key`**（★PLAN I-3 段 0・2026-09-22）。
     *   ★`name_key`（★移行 0064）が在る DB では、★生まれた仔に ★`normalizeName(name)` が書かれていること。
     *   ★名前が ★世界の既存の馬とも、★仔どうしとも ★正規化して重ならないこと（★段 3 の一意の前提）。
     */
    const hasKey = Number((await q(
      "select count(*)::int n from information_schema.columns"
        + " where table_schema = 'public' and table_name = 'horses' and column_name = 'name_key'",
    ))[0].n) > 0;
    if (hasKey) {
      const named = await q(
        'select id::text as id, name, name_key from horses where birth_week = $1', [result.week],
      );
      const wrongKey = named.filter((f) => f.name_key !== normalizeName(f.name)).length;
      // ★既存の馬の name_key はまだ埋まっていない（★段 2 の前）ので、★名前を TS で正規化して比べる
      const foalIds = new Set(named.map((f) => f.id));
      const others = new Set((await q('select id::text as id, name from horses'))
        .filter((r) => !foalIds.has(r.id)).map((r) => normalizeName(r.name)));
      const keys = named.map((f) => normalizeName(f.name));
      const clash = keys.filter((k) => others.has(k)).length + (keys.length - new Set(keys).size);
      check(wrongKey === 0 && clash === 0,
        '⑤ ★仔の name_key ＝ 正規化した名前・★既存の馬とも仔どうしとも重ならない',
        `★${named.length} 頭 / 食い違い ${wrongKey} / 重なり ${clash}（★例: ${named[0]?.name ?? '-'}）`);
    } else {
      console.log('  ・ ⑤ ★`name_key` の列が無い DB です（★0064 の前）。★名前の判定はしません');
    }
  }

  // ⑥ ★持ち主のいる馬を NPC の配合に使わない（★上の註記）
  if (ownedMare === null || ownedSires.length === 0 || ownedWeek !== result.week) {
    checked += 1;
    fails.push('⑥ ★判定不能');
    console.log(`  🔴 ★⑥ を判定できません（★その週に番が来る産める母か、★種牡馬が居ない。★または選んだ週 ${ownedWeek} と処理した週 ${result.week} がずれた）。★合格にしません`);
  } else {
    const ownedSet = new Set(ownedSires);
    const fromOwnedMare = foals.filter((f) => f.dam_id === ownedMare).length;
    const fromOwnedSire = foals.filter((f) => ownedSet.has(f.sire_id)).length;
    const fromNpc = foals.filter((f) => f.dam_id !== ownedMare && !ownedSet.has(f.sire_id)).length;
    check(fromOwnedMare === 0 && fromOwnedSire === 0 && fromNpc > 0,
      '⑥ ★持ち主の母・種牡馬から仔が生まれない（★対照: NPC の馬からは生まれる）',
      `★持ち主の母 1 頭 → ${fromOwnedMare} 頭 / 持ち主の種牡馬 ${ownedSires.length} 頭 → ${fromOwnedSire} 頭`
      + ` / NPC どうし ${fromNpc} 頭`);
  }
} catch (e) {
  threw = e;
  check(false, '① ★落ちずに走り切った（★本番を落としたのはここ）', `🔴 ${e.message}`);
  checked += 1;
  fails.push('② ★判定不能（★①で落ちました）');
} finally {
  await c.query('rollback');
}

for (const m of alerts) console.log(`  ⚠️ ★警報: ${m}`);
if (threw !== null) console.log(`  🔴 ★落ちた場所:\n${String(threw.stack ?? threw).split('\n').slice(0, 6).join('\n')}`);

/**
 * 🔴 ★**周の予算に収まるか**（★2026-09-21）。
 *
 * ⚠️ ★配合は ★**週送りの後**に呼ばれます（`main.ts`）。
 *   ★つまり ★**周の所要に乗ります**。★周は `CYCLE_MS`。
 * 🔴 ★**前に 1 度、★配備して本番を落としました**（★2026-09-21）。
 *   ★そのときは例外でしたが、★**遅すぎても同じことが起きます**。
 * ⚠️ ★ここで見るのは ★**配合だけ**です。★週送り本体とレースの分は別。
 *   ★だから ★**余裕を広く取ります**（★周の 10% を線にします）。
 */
const BUDGET_RATIO = 0.10;
const budgetMs = CYCLE_MS * BUDGET_RATIO;
check(elapsedMs > 0 && elapsedMs <= budgetMs,
  `④ 🔴 ★配合 1 週 が、★周の ${(BUDGET_RATIO * 100).toFixed(0)}% に収まる`,
  elapsedMs <= 0
    ? '🔴 ★測れていません（★①で落ちた）'
    : `★${elapsedMs.toFixed(0)}ms / ★線 ${budgetMs.toFixed(0)}ms`
      + `（★周 ${(CYCLE_MS / 1000).toFixed(0)}s の ${(elapsedMs / CYCLE_MS * 100).toFixed(2)}%）`);

// ③ 戻っていること
const after = Number((await q('select count(*)::int n from horses'))[0].n);
check(after === before, '③ ★rollback の後、★頭数が元に戻っている（★この道具が世界を動かしていない）',
  `★前 ${before} 頭 / 後 ${after} 頭`);

await c.end();
exitWithVerdict(verdictOf({
  checked, failed: fails.length, label: '★配合が本物の DB で走る',
}));
