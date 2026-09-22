/**
 * ★**既存の全頭の `horses.name_key` を埋める**（★PLAN I-3 段 2・裁定 `REVIEW_I3_NAMING_VERDICT_20260922.md` §3）。
 *
 *   ★分類: **STATE_CHANGING**（★既定は ★**下見だけ**。★`--apply` を付けたときだけ書きます）
 *
 * ============================================================================
 * 【★何をするか】
 *   ★全頭の `name` を ★`normalizeName()`（★TS・`packages/sim-engine/src/naming.ts`）で正規化し、★`name_key` に書きます。
 *   ★正規化を SQL に写しません（★D-052・★TS が計算した値を DB は比べるだけ）。
 *   ⚠️ ★`name_checked_with`（★禁止名の検査の版）は ★**触りません**（★検査し直しは NG リストが届いた日の別の道具）。
 *
 * 【★書く前に止まる条件】（★1 つでも当たれば、★`--apply` が付いていても書きません）
 *   ① ★正規化した名前が ★**2 頭以上で重なる**（★段 3 の `unique` が張れない）
 *   ② ★正規化で ★**空になる名前**がある
 *   ③ ★本番なら ★関門（★`--yes-production` ・`--backfill-name-key` ・`--expect-null <いま空の頭数>`）
 *
 * 【★書いた後に確かめること】（★取引の中で数え直し、★合わなければ戻します）
 *   ④ ★`name_key` が空の行 ＝ 0
 *   ⑤ ★`name_key` ≠ `normalizeName(name)` の行 ＝ 0（★読み直して TS で比べる）
 *   ★確定の後に ★**もう一度 DB から読んで** ④⑤ を数えます（★道具の言い分ではなく DB に訊く）。
 *   ★**2 回流すこと**: ★2 回目は ★「書く行 0」になって初めて ★繰り返せると言えます。
 *
 * 【★使い方】
 *   npx tsx tools/backfill-name-key.mjs --env staging                 # ★下見（書きません）
 *   npx tsx tools/backfill-name-key.mjs --env staging --apply
 *   npx tsx tools/backfill-name-key.mjs --env production              # ★下見（★読むだけ）
 *   npx tsx tools/backfill-name-key.mjs --env production --apply \
 *       --yes-production --backfill-name-key --expect-null <いま name_key が空の頭数>   # ★オーナーの許可が要る
 * ============================================================================
 */
import pg from 'pg';

import { loadEnv } from './lib/env.mjs';
import { assertNotProduction } from './lib/guard.mjs';
import { productionNameKeyOptInProblem } from './lib/args.mjs';
import { exitWithVerdict, verdictOf, VERDICT } from './lib/counted-verdict.mjs';
import { normalizeName } from '../packages/sim-engine/src/index.ts';
import { blocksBackfill, surveyNameKeys } from './lib/name-key-survey.mjs';

const APPLY = process.argv.includes('--apply');
const YES_PRODUCTION = process.argv.includes('--yes-production');
const BACKFILL_FLAG = process.argv.includes('--backfill-name-key');
const EXPECT_NULL = (() => {
  const i = process.argv.indexOf('--expect-null');
  if (i < 0) return null;
  const n = Number(process.argv[i + 1]);
  return Number.isInteger(n) ? n : null;
})();

const env = loadEnv();
const c = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
c.on('error', (e) => { console.error(`🔴 ★接続が落ちました: ${e.message}`); process.exit(VERDICT.UNDECIDABLE); });
await c.connect();
const q = async (s, p) => (await c.query(s, p)).rows;

const hasCol = Number((await q(
  "select count(*)::int n from information_schema.columns"
    + " where table_schema = 'public' and table_name = 'horses' and column_name = 'name_key'",
))[0].n) > 0;
if (!hasCol && APPLY) {
  console.error('🔴 ★`horses.name_key` がありません（★移行 0064 の前）。★先に移行を当ててください');
  await c.end();
  process.exit(VERDICT.UNDECIDABLE);
}
if (!hasCol) {
  // ★下見だけは ★列が無くても名前から数えられる（★段 3 の前に「本番の名前が重ならないか」を知るため）
  console.log('  ・ ★`horses.name_key` がありません（★移行 0064 の前）。★名前だけで重なりを数えます（★書きません）');
}

const fails = [];
let checked = 0;
const check = (ok, label, detail) => {
  checked += 1;
  if (!ok) fails.push(label);
  console.log(`  ${ok ? '✓' : '🔴'} ${label}${detail ? `  ${detail}` : ''}`);
};

/** ★全頭を読み、★正規化の結果と食い違いを数える（★読むだけ・★数えるのは純関数 `surveyNameKeys`） */
const survey = async () => surveyNameKeys(
  await q(hasCol
    ? 'select id::text as id, name, name_key from horses'
    : 'select id::text as id, name, null::text as name_key from horses'),
  normalizeName,
);

const dbEnvironment = (await q('select environment from app_environment'))[0]?.environment ?? null;
console.log(`# ★馬名の正規化キーを埋める（★${APPLY ? '書きます' : '下見だけ・書きません'}）  接続先の申告: ${dbEnvironment}`);

await c.query('begin read only');
const before = await survey();
await c.query('rollback');
console.log(`  ★全 ${before.total} 頭 / 空 ${before.nullKey} / 食い違い ${before.wrongKey}`
  + ` / ★書く行 ${before.toWrite.length} / 正規化で重なる組 ${before.collisions} / 正規化で空 ${before.empty}`);

check(before.collisions === 0, '① ★正規化した名前が重ならない（★段 3 の unique が張れる）', `${before.collisions} 組`);
check(before.empty === 0, '② ★正規化で空になる名前が無い', `${before.empty} 頭`);

if (!APPLY) {
  console.log('  ・ ★下見なので書きません（★--apply で書きます）');
  await c.end();
  exitWithVerdict(verdictOf({ checked, failed: fails.length, label: '馬名の正規化キー（下見）' }));
}

// ── 🔴 ★本番の関門（★書くときだけ） ─────────────────────────────
const problem = productionNameKeyOptInProblem({
  environment: dbEnvironment,
  yesProduction: YES_PRODUCTION,
  backfillFlag: BACKFILL_FLAG,
  expectNull: EXPECT_NULL,
  actualNull: before.nullKey,
});
if (problem !== null) {
  console.error(`🔴 ★本番には通しません: ${problem}`);
  // 🔴 ★**実数を出さないこと**（★出すと 1 回 失敗して画面の数を写すだけになります）
  console.error('   ★通る形: --env production --apply --yes-production --backfill-name-key --expect-null <いま空の頭数>');
  console.error('   ★数え方（★自分で数えてください）: select count(*) from horses where name_key is null;');
  await c.end();
  process.exit(VERDICT.UNDECIDABLE);
}
await assertNotProduction(c, 'backfill-name-key.mjs', {
  allowProduction: YES_PRODUCTION && BACKFILL_FLAG,
});

if (blocksBackfill(before)) {
  console.error('🔴 ★①② に当たったので書きません（★重なりか空の名前を先に直してください）');
  await c.end();
  exitWithVerdict(verdictOf({ checked, failed: fails.length, label: '馬名の正規化キー' }));
}

// ── ★書く（★1 取引・★書いた後に取引の中で数え直し、★合わなければ戻す） ──────────
let written = 0;
await c.query('begin');
try {
  if (before.toWrite.length > 0) {
    const res = await c.query(
      'update horses h set name_key = u.k from unnest($1::uuid[], $2::text[]) as u(id, k)'
        + ' where h.id = u.id and h.name_key is distinct from u.k',
      [before.toWrite.map((w) => w[0]), before.toWrite.map((w) => w[1])],
    );
    written = res.rowCount ?? 0;
  }
  const inTx = await survey();
  // ★重なりも数え直す（★書いている間に別の経路が名前を書いた場合も拾う・裁定 922b338 §7 の推奨）
  if (inTx.nullKey !== 0 || inTx.wrongKey !== 0 || blocksBackfill(inTx)) {
    throw new Error(`★書いた後も 空 ${inTx.nullKey} / 食い違い ${inTx.wrongKey}`
      + ` / 重なり ${inTx.collisions} / 正規化で空 ${inTx.empty}（★戻します）`);
  }
  await c.query('commit');
} catch (e) {
  await c.query('rollback');
  check(false, '③ ★書いて確定した', `🔴 ${e.message}`);
  await c.end();
  exitWithVerdict(verdictOf({ checked, failed: fails.length, label: '馬名の正規化キー' }));
}
check(written === before.toWrite.length, '③ ★書いた行数 ＝ 書く予定の行数', `${written} / ${before.toWrite.length}`);

// ── ★確定の後に、★もう一度 DB から読む（★道具の言い分ではなく DB に訊く） ─────
await c.query('begin read only');
const after = await survey();
await c.query('rollback');
check(after.nullKey === 0, '④ ★確定の後、★name_key が空の行 ＝ 0', `${after.nullKey} 頭`);
check(after.wrongKey === 0, '⑤ ★確定の後、★name_key ≠ normalizeName(name) の行 ＝ 0', `${after.wrongKey} 頭`);
console.log(`  ★2 回目に流したときは ★「書く行 0」になるはずです（★いま ${after.toWrite.length}）`);

await c.end();
exitWithVerdict(verdictOf({ checked, failed: fails.length, label: '馬名の正規化キー' }));
