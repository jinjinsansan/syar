/**
 * ★**未検査の馬名を、禁止名（実在馬名）のリストで検査し直す**（★PLAN I-3・裁定 `REVIEW_UNNAMED_FOAL_PLACEMENT_VERDICT_20260922.md` §4-2）。
 *
 *   ★分類: **STATE_CHANGING**（★既定は ★**下見だけ**。★`--apply` で書く。★`--rehearse` は ★書いて数え直してから ★必ず戻す）
 *
 * ============================================================================
 * 【★なぜ在るか】
 *   ★NG 名のリスト（`data/ng-names.hash`）が無い間に付いた名前は ★`name_checked_with = null`（★未検査）のまま。
 *   ★リストが届いたら ★その行を全部 検査し直す（★裁定: ★印を残すだけでは、★リストが届いた後に何も起きない）。
 *
 * 【★何をするか】
 *   ① ★未検査の行（`name_checked_with is null`）を読み、★`name_key` を ★リストで判定する
 *   ② ★当たらなかった行 → ★`name_checked_with = <リストの版>` を書く
 *   ③ ★当たった行 → ★`name_checked_with = 'hit:<リストの版>'`（★未検査の null とも合格の版とも違う印・レビュー側の推奨 2026-09-22）。
 *      ★**件数と馬の ID だけ**出す
 *      ⚠️ ★当たった場合の扱い（★改名を求めるか等）は ★**そのとき決める**（★裁定・★この道具は決めない）
 *   🔴 ★**当たった名前そのものは出力しない** — ★実在の競走馬名の可能性が高い（★憲法 §0.1・★出力にも書かない）
 *
 * 【★書いた後に確かめること】（★取引の中で数え直し、★合わなければ戻す）
 *   ★読んだ行のうち未検査の残り ＝ 0 ／ ★合格の行の版 ＝ いまのリストの版 ／ ★当たりの印の行数 ＝ 当たった件数
 *
 * 【★使い方】
 *   npx tsx tools/recheck-name-blocklist.mjs --env staging                              # ★下見
 *   npx tsx tools/recheck-name-blocklist.mjs --env staging --rehearse                   # ★書いて数え直し、★必ず戻す
 *   npx tsx tools/recheck-name-blocklist.mjs --env staging --apply
 *   npx tsx tools/recheck-name-blocklist.mjs --env production --apply \
 *       --yes-production --recheck-names --expect-unchecked <いま未検査の頭数>          # ★オーナーの許可が要る
 *   ★`--hash-path <ファイル>` でリストの場所を変えられる（★検証用の小さなリストで試すため・既定 `data/ng-names.hash`）
 * ============================================================================
 */
import pg from 'pg';

import { loadEnv } from './lib/env.mjs';
import { assertNotProduction } from './lib/guard.mjs';
import { productionNameRecheckOptInProblem } from './lib/args.mjs';
import { exitWithVerdict, verdictOf, VERDICT } from './lib/counted-verdict.mjs';
import { hitMarkOf, partitionByBlocklist } from './lib/name-recheck.mjs';
import { NG_HASH_PATH, loadNameBlocklist } from '../apps/cli/src/name-blocklist.ts';

const APPLY = process.argv.includes('--apply');
const REHEARSE = process.argv.includes('--rehearse');
const YES_PRODUCTION = process.argv.includes('--yes-production');
const RECHECK_FLAG = process.argv.includes('--recheck-names');
const argValue = (name) => { const i = process.argv.indexOf(name); return i < 0 ? undefined : process.argv[i + 1]; };
const EXPECT_UNCHECKED = (() => { const n = Number(argValue('--expect-unchecked')); return Number.isInteger(n) ? n : null; })();
const HASH_PATH = argValue('--hash-path') ?? NG_HASH_PATH;

// ★リストが無ければ ★判定不能（★「検査していない」を黙って合格にしない）
let ng;
try {
  ng = loadNameBlocklist(HASH_PATH, true);
} catch (e) {
  console.error(`🔴 ★禁止名のリストがありません（${HASH_PATH}）。★検査し直せません: ${e.message.split('\n')[0]}`);
  process.exit(VERDICT.UNDECIDABLE);
}

const env = loadEnv();
const c = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
c.on('error', (e) => { console.error(`🔴 ★接続が落ちました: ${e.message}`); process.exit(VERDICT.UNDECIDABLE); });
await c.connect();
const q = async (s, p) => (await c.query(s, p)).rows;

const fails = [];
let checked = 0;
const check = (ok, label, detail) => {
  checked += 1;
  if (!ok) fails.push(label);
  console.log(`  ${ok ? '✓' : '🔴'} ${label}${detail ? `  ${detail}` : ''}`);
};

const hasCols = Number((await q(
  "select count(*)::int n from information_schema.columns where table_schema = 'public' and table_name = 'horses'"
    + " and column_name in ('name_key', 'name_checked_with')",
))[0].n) === 2;
if (!hasCols) {
  console.error('🔴 ★`horses.name_key` / `name_checked_with` がありません（★移行 0064 の前）');
  await c.end();
  process.exit(VERDICT.UNDECIDABLE);
}

const dbEnvironment = (await q('select environment from app_environment'))[0]?.environment ?? null;
const mode = APPLY ? '書きます' : REHEARSE ? '書いて数え直し、★必ず戻します' : '下見だけ・書きません';
console.log(`# ★未検査の馬名を禁止名のリストで検査し直す（★${mode}）  接続先の申告: ${dbEnvironment}`);
console.log(`  ★リスト: ${ng.size} 件・★版 ${ng.version}`);

const readUnchecked = async () => q('select id::text as id, name_key from horses where name_checked_with is null');
await c.query('begin read only');
const before = await readUnchecked();
await c.query('rollback');
const part = partitionByBlocklist(before, ng.blocklist);
console.log(`  ★未検査 ${before.length} 頭 / ★当たった ${part.hits.length} 頭 / ★書く ${part.clean.length} 頭`);
// 🔴 ★名前は出さない（★実在馬名の可能性・憲法 §0.1）。★ID だけ
if (part.hits.length > 0) console.log(`  ★当たった馬の ID（★名前は出しません）: ${part.hits.map((h) => h.id).join(', ')}`);
check(before.every((r) => r.name_key !== null), '① ★未検査の行はすべて name_key を持つ（★段 3 の後）',
  `${before.filter((r) => r.name_key === null).length} 頭が空`);

if (!APPLY && !REHEARSE) {
  await c.end();
  exitWithVerdict(verdictOf({ checked, failed: fails.length, label: '馬名の再検査（下見）' }));
}

if (APPLY) {
  const problem = productionNameRecheckOptInProblem({
    environment: dbEnvironment, yesProduction: YES_PRODUCTION, recheckFlag: RECHECK_FLAG,
    expectUnchecked: EXPECT_UNCHECKED, actualUnchecked: before.length,
  });
  if (problem !== null) {
    console.error(`🔴 ★本番には通しません: ${problem}`);
    console.error('   ★通る形: --env production --apply --yes-production --recheck-names --expect-unchecked <いま未検査の頭数>');
    console.error('   ★数え方（★自分で数えてください）: select count(*) from horses where name_checked_with is null;');
    await c.end();
    process.exit(VERDICT.UNDECIDABLE);
  }
  await assertNotProduction(c, 'recheck-name-blocklist.mjs', { allowProduction: YES_PRODUCTION && RECHECK_FLAG });
} else {
  // ★--rehearse は ★必ず戻すが、★本番には向けない（★読む人に紛らわしい）
  await assertNotProduction(c, 'recheck-name-blocklist.mjs');
}

let written = 0;
let marked = 0;
await c.query('begin');
try {
  if (part.clean.length > 0) {
    const r = await c.query(
      'update horses set name_checked_with = $2 where id = any($1::uuid[]) and name_checked_with is null',
      [part.clean.map((x) => x.id), ng.version],
    );
    written = r.rowCount ?? 0;
  }
  // ★当たった行には ★当たりの印（★未検査の null のままにしない・★名前は変えない）
  if (part.hits.length > 0) {
    const r = await c.query(
      'update horses set name_checked_with = $2 where id = any($1::uuid[]) and name_checked_with is null',
      [part.hits.map((x) => x.id), hitMarkOf(ng.version)],
    );
    marked = r.rowCount ?? 0;
  }
  const readIds = before.filter((r) => r.name_key !== null).map((r) => r.id);
  // ★読んだ行だけを数える（★この間にワーカーが足した新しい行を混ぜない）
  const remaining = Number((await q(
    'select count(*)::int n from horses where id = any($1::uuid[]) and name_checked_with is null', [readIds],
  ))[0].n);
  const countWith = async (ids, mark) => (ids.length === 0 ? 0 : Number((await q(
    'select count(*)::int n from horses where id = any($1::uuid[]) and name_checked_with = $2', [ids, mark],
  ))[0].n));
  const versionOk = await countWith(part.clean.map((x) => x.id), ng.version) === part.clean.length;
  const hitOk = await countWith(part.hits.map((x) => x.id), hitMarkOf(ng.version)) === part.hits.length;
  check(written === part.clean.length, '② ★書いた行数 ＝ 当たらなかった行数', `${written} / ${part.clean.length}`);
  check(remaining === 0, '③ ★読んだ行のうち未検査の残り ＝ 0（★当たった行にも印を書く）', `${remaining} 頭`);
  check(versionOk, '④ ★合格の行の版 ＝ いまのリストの版');
  check(marked === part.hits.length && hitOk, '⑤ ★当たりの印の行数 ＝ 当たった行数（★未検査とも合格とも違う印）',
    `${marked} / ${part.hits.length}`);
  if (fails.length > 0 || REHEARSE) {
    await c.query('rollback');
    console.log(REHEARSE ? '  ・ ★--rehearse なので戻しました' : '  🔴 ★判定に落ちたので戻しました');
  } else {
    await c.query('commit');
  }
} catch (e) {
  await c.query('rollback');
  check(false, '★書いて確定した', `🔴 ${e.message}`);
}

if (REHEARSE) {
  const after = await readUnchecked();
  check(after.length === before.length, '⑥ ★--rehearse の後、★未検査の頭数が元に戻った', `${after.length} / ${before.length}`);
}
await c.end();
exitWithVerdict(verdictOf({ checked, failed: fails.length, label: '馬名の再検査' }));
