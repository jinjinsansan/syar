/**
 * ★**運営が馬名を戻す部品（`tools/lib/name-reset.mjs`）を、本物の DB で通す**（★裁定 `REVIEW_NAME_RESET_TOOL_VERDICT_20260922.md`・2026-09-22）
 *
 *   ★分類: **STATE_CHANGING**（★取引の中で書きます。★**必ず `rollback` します**）
 *   ★本番には向けません（`assertNotProduction`）。
 *   ★`reset-horse-name.mjs --rehearse` は ★staging に持ち主の居る馬がいないと ★NPC の経路しか通らないので、★ここで両方を通す。
 *
 * ============================================================================
 * 【★判定】
 *   ① ★持ち主の居る馬 → ★仮の名前（接頭辞で始まる・利用者の命名では付けられない形）・★1 つ目の候補が一覧に当たれば次の候補
 *   ② ★NPC の馬 → ★仮の名前を使わない（★普通の名前）
 *   ③ ★元の名前が今の一覧に当たるかを ★正しく言う（★当たる一覧を渡したとき）
 *   ④ ★記録: 理由・持ち主の有無・ハッシュ（16 桁）・新しい名前。★元の名前の平文は ★記録のどの列にも無い
 *   ⑤ ★rollback の後、★記録の数と 2 頭の名前が元に戻っている
 *
 * ★使い方: npx tsx tools/verify-name-reset-live.mjs --env staging
 * ============================================================================
 */
import pg from 'pg';

import { loadEnv } from './lib/env.mjs';
import { assertNotProduction } from './lib/guard.mjs';
import { exitWithVerdict, verdictOf, VERDICT } from './lib/counted-verdict.mjs';
import { applyNameReset, planNameReset } from './lib/name-reset.mjs';
import {
  PROVISIONAL_NAME_PREFIX, checkPlayerHorseName, normalizeName, provisionalHorseName,
} from '../packages/sim-engine/src/index.ts';

const env = loadEnv();
const c = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
c.on('error', (e) => { console.error(`🔴 ★接続が落ちました: ${e.message}`); process.exit(VERDICT.UNDECIDABLE); });
await c.connect();
await assertNotProduction(c, 'verify-name-reset-live.mjs');
const q = async (s, p) => (await c.query(s, p)).rows;

const fails = [];
let checked = 0;
const check = (ok, label, detail) => {
  checked += 1;
  if (!ok) fails.push(label);
  console.log(`  ${ok ? '✓' : '🔴'} ${label}${detail ? `  ${detail}` : ''}`);
};
const U = '0f000000-0000-4000-8000-00000000f901';

console.log('# ★運営が馬名を戻す部品を、本物の DB で通す（★必ず rollback します）');
const [owned, npc] = (await q(
  'select id::text id, name from horses where owner_id is null and npc_stable_id is not null order by id limit 2',
));
if (owned === undefined || npc === undefined) {
  console.error('🔴 ★馬が 2 頭 要ります');
  process.exit(VERDICT.UNDECIDABLE);
}
const countResets = async () => Number((await q('select count(*)::int n from horse_name_resets'))[0].n);
const before = { resets: await countResets(), owned: owned.name, npc: npc.name };

await c.query('begin');
try {
  await c.query('insert into auth.users (id, email, email_confirmed_at) values ($1, $2, now())',
    [U, 'verify-name-reset+f901@example.invalid']);
  await c.query("insert into users (id, display_name, stable_name, entry_points) values ($1, '検証', '検証牧場', 0)", [U]);
  await c.query('update horses set owner_id = $1, npc_stable_id = null where id = $2', [U, owned.id]);

  // ★一覧: ★元の名前と ★1 つ目の仮の名前に当たる（★引き直しと「当たる」の両方を通す）
  const firstProvisional = normalizeName(provisionalHorseName(owned.id, 0));
  const oldOwnedKey = normalizeName(owned.name);
  const checks = {
    blocked: (k) => k === oldOwnedKey || k === firstProvisional,
    version: 'real-horse:0123456789abcdef',
  };

  // ① 持ち主の居る馬
  const p1 = await planNameReset(c, owned.id, checks);
  await applyNameReset(c, p1, { reason: 'offensive', note: '検証' });
  const h1 = (await q('select name, name_checked_with from horses where id = $1', [owned.id]))[0];
  check(p1.owned && h1.name === provisionalHorseName(owned.id, 1) && h1.name.startsWith(PROVISIONAL_NAME_PREFIX)
    && checkPlayerHorseName(h1.name).ok === false && h1.name_checked_with === checks.version,
  '① ★持ち主の居る馬 → 仮の名前（★1 つ目は一覧に当たったので 2 つ目）・★利用者の命名では付けられない形',
  `★${h1.name}（${checkPlayerHorseName(h1.name).ok ? '付けられる' : '付けられない'}）/ 版 ${h1.name_checked_with}`);

  // ③ 元の名前が当たるか
  check(p1.oldBlocked === true, '③ ★元の名前が一覧に当たる、と言う（★当たる一覧を渡した）');

  // ② NPC の馬
  const p2 = await planNameReset(c, npc.id, { blocked: () => false, version: null });
  await applyNameReset(c, p2, { reason: 'real_horse', note: null });
  const h2 = (await q('select name from horses where id = $1', [npc.id]))[0];
  check(!p2.owned && !h2.name.startsWith(PROVISIONAL_NAME_PREFIX) && h2.name !== npc.name && p2.oldBlocked === false,
    '② ★NPC の馬 → 仮の名前を使わず ★普通の名前（★元の名前は当たらない一覧）', `★${h2.name}`);

  // ④ 記録
  const rows = await q(
    'select horse_id::text horse_id, owned, reason, note, old_name_hash, new_name, checked_with from horse_name_resets'
      + ' where horse_id = any($1::uuid[]) order by id',
    [[owned.id, npc.id]],
  );
  const plain = rows.some((r) => Object.values(r).some((v) => v === owned.name || v === npc.name));
  check(rows.length === 2 && rows[0].owned === true && rows[0].reason === 'offensive'
    && rows[1].owned === false && rows[1].reason === 'real_horse'
    && rows.every((r) => /^[0-9a-f]{16}$/.test(r.old_name_hash)) && !plain,
  '④ ★記録: 理由・持ち主の有無・ハッシュ 16 桁・新しい名前・★元の名前の平文は無い', `★${rows.length} 行 / 平文 ${plain ? 'あり 🔴' : 'なし'}`);
} catch (e) {
  check(false, '★予行が途中で落ちました', `🔴 ${e.message}`);
} finally {
  await c.query('rollback');
}

const after = {
  resets: await countResets(),
  owned: (await q('select name from horses where id = $1', [owned.id]))[0].name,
  npc: (await q('select name from horses where id = $1', [npc.id]))[0].name,
};
// 🔴 ★元の名前は出さない（★一致したかだけ）
check(after.resets === before.resets && after.owned === before.owned && after.npc === before.npc,
  '⑤ ★rollback の後、★記録の数と 2 頭の名前が元に戻っている', `★記録 ${before.resets} → ${after.resets}`);
await c.end();
console.log('');
exitWithVerdict(verdictOf({ checked, failed: fails.length, label: '★運営が馬名を戻す部品' }));
