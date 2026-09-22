/**
 * ★**持ち主のいる引退馬が、★その DB に何頭いるか**（★裁定 `REVIEW_I1_RETIREMENT_ROLE_VERDICT_20260922.md` §2 ③）。
 *
 *   ★分類: **READONLY**（★取引を `read only` で張ります。★書き込みは DB が拒みます）
 *
 * ============================================================================
 * 【★なぜ在るか】
 *   ★NPC の配合は ★持ち主の馬を母・種牡馬・補充に使っていました（★照会 I-1 の F-4〜F-7・直しは同日）。
 *   ★裁定: ★**0 頭でなければ、★既に NPC 側に生まれた「持ち主の馬の仔」の扱いを別に決める**。
 *   → ★その前に ★数を読むだけの道具で測ります。
 *
 * 【★出すもの（★数だけ・★馬の名前も持ち主も出しません）】
 *   ① ★持ち主のいる引退馬の数（★役割ごと: 種牡馬／繁殖牝馬／功労馬）
 *   ② ★持ち主のいる馬を父か母に持つ ★持ち主の居ない馬（★NPC の配合が作った仔）の数
 *   ③ ★対照: ★引退馬の総数（★① が 0 のとき ★「そもそも引退馬を読めていない」と区別するため）
 *   ④ ★生涯の産駒数に達した繁殖牝馬の数（★持ち主の有無を問わず。★次の年の頭に降ろされる馬。★0069 の前なら、この数が 1 以上で配合の週が落ちる・裁定 REVIEW_PROD_DEPLOY_ORDER_20260922.md §1）
 *
 * 【⚠️ ★本番に向けるとき】
 *   ★本番の読み取りも権限層が止めることがあります。★オーナーに次の 1 行を渡して流してもらいます:
 *     npx tsx tools/diag-owned-breeders.mjs --env production
 * ============================================================================
 */
import pg from 'pg';

import { loadEnv } from './lib/env.mjs';
import { DEFAULT_BALANCE } from '../packages/sim-engine/src/index.ts';

const env = loadEnv();
const c = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
const q = async (s, p) => (await c.query(s, p)).rows;

await c.query('begin read only');
try {
  console.log('# ★持ち主のいる引退馬と、生涯の産駒数に達した繁殖牝馬（★読むだけ・★数だけ）');
  const roles = await q(
    'select retirement_role r, count(*)::int n from horses'
      + ' where owner_id is not null and retired_at_week is not null group by 1 order by 1',
  );
  const byRole = Object.fromEntries(roles.map((x) => [x.r, x.n]));
  const owned = roles.reduce((a, x) => a + x.n, 0);
  console.log(`  ① ★持ち主のいる引退馬: ${owned} 頭（★種牡馬 ${byRole.stallion ?? 0}`
    + ` / 繁殖牝馬 ${byRole.broodmare ?? 0} / 功労馬 ${byRole.honored ?? 0}）`);
  const foals = (await q(
    'select count(*)::int n from horses f where f.owner_id is null and exists ('
      + 'select 1 from horses p where p.owner_id is not null and p.id in (f.sire_id, f.dam_id))',
  ))[0].n;
  console.log(`  ② ★持ち主の馬を父か母に持つ、★持ち主の居ない馬: ${foals} 頭`);
  const retired = (await q('select count(*)::int n from horses where retired_at_week is not null'))[0].n;
  console.log(`  ③ ★対照: ★引退馬の総数 ${retired} 頭（★0 なら ①② は判定できません）`);
  if (retired === 0) process.exitCode = 2;
  const worn = (await q(
    "select count(*)::int n from horses where retirement_role = 'broodmare' and foal_count >= $1",
    [DEFAULT_BALANCE.MARE_LIFETIME_FOALS],
  ))[0].n;
  console.log(`  ④ ★生涯 ${DEFAULT_BALANCE.MARE_LIFETIME_FOALS} 産に達した繁殖牝馬: ${worn} 頭（★次の年の頭に降ろされる）`);
} finally {
  await c.query('rollback');
  await c.end();
}
