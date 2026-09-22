/**
 * ★**運営が馬名を戻す**（★裁定 `REVIEW_NAME_RESET_TOOL_VERDICT_20260922.md`・提案 `PROPOSAL_PLAYER_NAME_MODERATION_20260922.md` §2 段 2）。
 *
 *   ★分類: **STATE_CHANGING**（★既定は ★**下見だけ**。★`--apply` で書く。★`--rehearse` は ★書いて確かめてから ★必ず戻す）
 *
 * ============================================================================
 * 【★何をするか】
 *   ★持ち主の居る馬 … ★仮の名前（★接頭辞 ＋ ID から決まるカタカナ・P-1）
 *   ★NPC の馬 … ★普通の名前を引き直す（★`generateHorseName`・§2）
 *   ★どちらも ★今の一覧の組（★実在馬名・不快な語）と ★重複の判定を通し、★`name_checked_with` に版を書く。
 *   ★記録は `horse_name_resets`（★`0072`・理由・元の名前のハッシュ）。★生涯の記録には書かない（★理由が公開されるため・P-2）。
 *   🔴 ★**元の名前は出力しない**（★実在馬名・不快な語の可能性・憲法 §0.1）。★出すのは ID・持ち主の有無・新しい名前・元の名前が今の一覧に当たるか。
 *
 * 【★使い方】
 *   npx tsx tools/reset-horse-name.mjs --env staging --horse <ID> --reason <語>                  # ★下見
 *   npx tsx tools/reset-horse-name.mjs --env staging --horse <ID> --reason <語> --rehearse       # ★書いて確かめ、★必ず戻す
 *   npx tsx tools/reset-horse-name.mjs --env staging --horse <ID> --reason <語> --note <短い書き込み> --apply
 *   npx tsx tools/reset-horse-name.mjs --env production --horse <ID> --reason <語> --apply \
 *       --yes-production --reset-name --expect-horse <同じ ID をもう一度>                       # ★オーナーの許可が要る
 *   ★理由の語: real_horse / offensive / person / trademark / other
 * ============================================================================
 */
import pg from 'pg';

import { loadEnv } from './lib/env.mjs';
import { assertNotProduction } from './lib/guard.mjs';
import { productionNameResetOptInProblem } from './lib/args.mjs';
import { exitWithVerdict, verdictOf, VERDICT } from './lib/counted-verdict.mjs';
import { RESET_REASONS, applyNameReset, planNameReset } from './lib/name-reset.mjs';
import { loadNameChecks } from '../apps/cli/src/name-blocklist.ts';

const argValue = (name) => { const i = process.argv.indexOf(name); return i < 0 ? null : (process.argv[i + 1] ?? null); };
const APPLY = process.argv.includes('--apply');
const REHEARSE = process.argv.includes('--rehearse');
const HORSE = argValue('--horse');
const REASON = argValue('--reason');
const NOTE = argValue('--note');

if (HORSE === null || !/^[0-9a-f-]{36}$/i.test(HORSE)) {
  console.error('🔴 ★--horse <馬の ID（uuid）> が要ります');
  process.exit(VERDICT.UNDECIDABLE);
}
if (REASON === null || !RESET_REASONS.includes(REASON)) {
  console.error(`🔴 ★--reason は ${RESET_REASONS.join(' / ')} のどれか`);
  process.exit(VERDICT.UNDECIDABLE);
}

// ★一覧は在るものを全部読む（★実在馬名の一覧が無くても止めない＝ワーカーの命名と同じ。★版は null になる）
const checks = loadNameChecks(undefined, false);

const env = loadEnv();
const c = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
c.on('error', (e) => { console.error(`🔴 ★接続が落ちました: ${e.message}`); process.exit(VERDICT.UNDECIDABLE); });
await c.connect();

const fails = [];
let checked = 0;
const check = (ok, label, detail) => {
  checked += 1;
  if (!ok) fails.push(label);
  console.log(`  ${ok ? '✓' : '🔴'} ${label}${detail ? `  ${detail}` : ''}`);
};

const dbEnvironment = (await c.query('select environment from app_environment')).rows[0]?.environment ?? null;
const mode = APPLY ? '書きます' : REHEARSE ? '書いて確かめ、★必ず戻します' : '下見だけ・書きません';
console.log(`# ★馬名を戻す（★${mode}）  接続先の申告: ${dbEnvironment}`);
console.log(`  ★一覧: ${checks.kinds.length === 0 ? '（無し）' : checks.kinds.join(' / ')}・★版 ${checks.version}`);

await c.query('begin read only');
const plan = await planNameReset(c, HORSE, checks);
await c.query('rollback');
// 🔴 ★元の名前（plan.oldName）は出さない
console.log(`  ★馬 ${plan.horseId}（${plan.owned ? '持ち主あり → 仮の名前' : 'NPC → 普通の名前を引き直す'}）`);
console.log(`  ★元の名前が今の一覧に当たるか: ${plan.oldBlocked ? '当たる' : '当たらない'}／★新しい名前: ${plan.newName}／★理由: ${REASON}`);

if (!APPLY && !REHEARSE) {
  await c.end();
  process.exit(0);
}

if (APPLY) {
  const problem = productionNameResetOptInProblem({
    environment: dbEnvironment, yesProduction: process.argv.includes('--yes-production'),
    resetFlag: process.argv.includes('--reset-name'), horse: HORSE, expectHorse: argValue('--expect-horse'),
  });
  if (problem !== null) {
    console.error(`🔴 ★本番には通しません: ${problem}`);
    await c.end();
    process.exit(VERDICT.UNDECIDABLE);
  }
  await assertNotProduction(c, 'reset-horse-name.mjs', {
    allowProduction: process.argv.includes('--yes-production') && process.argv.includes('--reset-name'),
  });
} else {
  await assertNotProduction(c, 'reset-horse-name.mjs');
}

const countResets = async () => Number((await c.query(
  'select count(*)::int n from horse_name_resets where horse_id = $1', [HORSE],
)).rows[0].n);
const before = await countResets();
await c.query('begin');
try {
  await applyNameReset(c, plan, { reason: REASON, note: NOTE });
  const row = (await c.query(
    'select name, name_checked_with from horses where id = $1', [HORSE],
  )).rows[0];
  check(row.name === plan.newName, '① ★名前が新しい名前になった', plan.newName);
  check(row.name_checked_with === plan.checkedWith, '② ★name_checked_with ＝ 今の一覧の組の版', String(row.name_checked_with));
  check(await countResets() === before + 1, '③ ★記録が 1 行 増えた（★理由・元の名前のハッシュ）');
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
if (REHEARSE) check(await countResets() === before, '④ ★--rehearse の後、★記録の数が元に戻った');
await c.end();
exitWithVerdict(verdictOf({ checked, failed: fails.length, label: '馬名を戻す' }));
