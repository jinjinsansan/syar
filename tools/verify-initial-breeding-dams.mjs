/**
 * ★**初回の配合で選べる母の候補を読む口を、実 DB で確かめる**（★2026-09-24・0077）
 *
 * 【★何を見るか】
 *   ★① ★未認証では通らない（★`auth.uid()` が null）
 *   ★② ★閾値を渡さないと落ちる（★SQL に定数を写していないことの裏返し）
 *   ★③ ★返る行が ★**ワーカーの述語と一致**する（★`damCandidateExists` と同じ条件で数えた値と突き合わせ）
 *   ★④ 🔴 ★**利用者ごとに並びが違い、★同じ利用者では毎回同じ**（★乱数ではない・憲法 4）
 *   ★⑤ ★`p_limit` が効く／範囲外は落ちる
 *   ★⑥ ★素質・能力の列を返していない（★D-114）
 *
 * ⚠️ ★**読むだけ**です。★1 行も書きません。★`--env` は必須（`loadEnv`）。
 * ⚠️ ★本番には向けません（`assertNotProduction`）。★母の数は環境で違うので、
 *    ★合格線は ★**同じ接続で数えた値**と突き合わせます（★数を書き写さない）。
 *
 * ★実行: npx tsx tools/verify-initial-breeding-dams.mjs --env staging
 *   ⚠️ ★`node` ではなく ★`npx tsx`（★`packages/` の TS を直に読むため・`diag-initial-parent-pool.mjs` と同じ）
 */
import pg from 'pg';
import { loadEnv } from './lib/env.mjs';
import { assertNotProduction } from './lib/guard.mjs';
import { beginSandbox, endSandbox } from './lib/sandbox-tx.mjs';
import { DEFAULT_BALANCE } from '../packages/sim-engine/src/index.ts';
import { WEEKS_PER_YEAR, gameYearOf } from '../packages/scheduler/src/index.ts';

const env = loadEnv();
const c = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
await assertNotProduction(c, 'verify-initial-breeding-dams.mjs');

const MIN_AGE_WEEKS = DEFAULT_BALANCE.MIN_BREEDING_AGE_YEARS * WEEKS_PER_YEAR;
const MAX_FOALS = DEFAULT_BALANCE.MARE_LIFETIME_FOALS;

let pass = 0; let fail = 0;
const check = (ok, label, detail = '') => {
  if (ok) { pass += 1; console.log(`  ✅ ${label}${detail === '' ? '' : `  ${detail}`}`); }
  else { fail += 1; console.log(`  🔴 ${label}${detail === '' ? '' : `  ${detail}`}`); }
};

/** ★利用者のふりをして呼ぶ（★`security definer` なので `auth.uid()` を差し替える） */
const asUser = async (userId, sql, params) => {
  await c.query('begin');
  await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: userId })]);
  try { return await c.query(sql, params); } finally { await c.query('rollback'); }
};

console.log('=== 0077 initial_breeding_dams ===');
console.log(`  閾値（TS から）: 年齢 ${MIN_AGE_WEEKS} 週以上 ／ 生涯 ${MAX_FOALS} 産未満`);

/** ★① 未認証 */
try {
  await c.query('select * from initial_breeding_dams($1,$2,$3)', [MIN_AGE_WEEKS, MAX_FOALS, 5]);
  check(false, '未認証で通ってしまった');
} catch (e) { check(String(e.message).includes('未認証'), '① 未認証では通らない', e.message); }

const u = (await c.query('select id from users order by created_at limit 1')).rows;
if (u.length < 1) {
  console.error('🔴 ★利用者が 1 人も居ません。★staging に登録してください');
  await c.end();
  process.exit(2);
}
const u1 = u[0].id;
/**
 * ★2 人目は ★**作りません**（★並びの比較にしか使わないため）。
 *   ✔ ★`initial_breeding_dams` は `users` を読みません（★`auth.uid()` を種にするだけ）。
 *   ★固定の uuid にします（★乱数を使わない・憲法 4。★同じ値なら結果も毎回同じ）。
 */
const u2 = '00000000-0000-4000-8000-000000000002';

/** ★② 閾値を渡さない */
try {
  await asUser(u1, 'select * from initial_breeding_dams(null,$1,$2)', [MAX_FOALS, 5]);
  check(false, '② 閾値なしで通ってしまった');
} catch (e) { check(String(e.message).includes('渡してください'), '② 閾値を渡さないと落ちる'); }

/** ★⑤ 範囲外の件数 */
for (const n of [0, 201]) {
  try {
    await asUser(u1, 'select * from initial_breeding_dams($1,$2,$3)', [MIN_AGE_WEEKS, MAX_FOALS, n]);
    check(false, `⑤ 件数 ${n} が通ってしまった`);
  } catch (e) { check(String(e.message).includes('1〜200'), `⑤ 件数 ${n} は落ちる`); }
}

const rows1 = (await asUser(u1, 'select * from initial_breeding_dams($1,$2,$3)', [MIN_AGE_WEEKS, MAX_FOALS, 20])).rows;
check(rows1.length > 0, '★候補が 1 頭以上ある（★0 件だと以下が何も言えない）', `${rows1.length} 頭`);

/** ★③ ワーカーの述語と一致 */
const week = (await c.query('select game_week from world_state where id = true')).rows[0]?.game_week;
const ageKnown = week !== undefined;
const mine = await c.query(
  "select count(*)::int n from horses h where h.sex = 'female' and h.owner_id is null"
  + " and h.retirement_role = 'honored' and not h.bred_this_year and h.foal_count < $1"
  + ' and h.birth_week is not null'
  + (ageKnown ? ' and $2::bigint - h.birth_week >= $3' : ''),
  ageKnown ? [MAX_FOALS, week, MIN_AGE_WEEKS] : [MAX_FOALS],
);
check(Number(rows1[0].total_count) === mine.rows[0].n,
  '③ 総数がワーカーの述語と一致する',
  `口 ${rows1[0].total_count} ／ 直に数えた ${mine.rows[0].n}`);
check(rows1[0].age_known === ageKnown, '③ age_known が world_state の有無と一致', `${rows1[0].age_known}`);

/** ★④ 並び: 同じ人は同じ・別の人は違う */
const again = (await asUser(u1, 'select * from initial_breeding_dams($1,$2,$3)', [MIN_AGE_WEEKS, MAX_FOALS, 20])).rows;
check(JSON.stringify(rows1.map((r) => r.horse_id)) === JSON.stringify(again.map((r) => r.horse_id)),
  '④ 同じ利用者では毎回同じ並び（★乱数ではない）');
const rows2 = (await asUser(u2, 'select * from initial_breeding_dams($1,$2,$3)', [MIN_AGE_WEEKS, MAX_FOALS, 20])).rows;
const same = rows1.filter((r, i) => r.horse_id === rows2[i]?.horse_id).length;
check(Number(rows1[0].total_count) <= 20 || same < rows1.length,
  '④ 別の利用者では並びが違う（★同じ母に集まらない）',
  `先頭 20 のうち同じ位置 ${same} 件`);

/** ★⑥ 素質・能力を返していない */
const cols = Object.keys(rows1[0]);
const leaked = cols.filter((k) => /potential|stats|genotype|unlock|aptitude|growth|temper|durab|skill/i.test(k));
check(leaked.length === 0, '⑥ 素質・能力の列を返していない（★D-114）', cols.join(' '));

/** ★⑤ 件数が効く */
const few = (await asUser(u1, 'select * from initial_breeding_dams($1,$2,$3)', [MIN_AGE_WEEKS, MAX_FOALS, 3])).rows;
check(few.length === Math.min(3, Number(rows1[0].total_count)), '⑤ p_limit が効く', `${few.length} 件`);

/**
 * 🔴 ★**⑦ 年齢の条件が、実際に働くか**（★2026-09-24・レビュー側の条件）。
 *
 * 【★なぜ要るか】
 *   ★実測で、★**年齢の条件はいまどちらの環境でも 1 頭も落としていません**
 *   （★「年齢を見ない数」＝「候補の数」）。★働いていない条件は ★**間違っていても誰も気づきません**
 *   （★`u-gallop`（使われない規則）と同じ形）。
 *
 * 【★どう確かめるか】
 *   ★取引の中で ★**年齢だけ足りない牝馬を 1 頭 作り**、★候補に出ないこと・総数が増えないことを見ます。
 *   ★**対照**: ★年齢の下限を 0 にして呼び直すと ★**その馬が出てくる**（★＝落としていたのは年齢の項）。
 *   ⚠️ ★`beginSandbox` / `endSandbox` で ★**必ず戻し、戻ったことを数えます**（★SB-3）。
 */
if (week === undefined) {
  check(false, '⑦ 年齢の予行: いまの週が読めないので試せません');
} else {
  const tx = await beginSandbox(c);
  try {
    await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: u1 })]);
    const before = Number((await c.query(
      'select total_count from initial_breeding_dams($1,$2,$3) limit 1', [MIN_AGE_WEEKS, MAX_FOALS, 1],
    )).rows[0].total_count);

    /**
     * ★**いま候補に居る 1 頭の「生まれた週」だけを動かします**（★年齢の下限の 1 週 手前へ）。
     *
     * 🔴 ★新しく 1 頭 作る形は ★**やめました**。★`horses` は必須列と制約が多く、
     *    ★`birth_year` → `sire_line` → `horses_processed_after_birth` と ★3 回 落ちました。
     *    ★列を並べて作ると、★**検査が「馬の作り方」に依存**します（★列が増えるたびに落ちる）。
     * → ★既に居る 1 頭の ★**1 列だけ**動かせば、★変えたものが 1 つだと言い切れます。
     * ⚠️ ★年は週から出します（★`gameYearOf` — ★SQL に式を写さない・D-052）。
     */
    const born = Number(week) - (MIN_AGE_WEEKS - 1);
    const source = rows1[0].horse_id;
    /**
     * ⚠️ ★**週の列を 3 つ 一緒に動かします**（★`horses_processed_after_birth` などの制約が縛るため）。
     *    ★`birth_week` だけ動かすと ★`last_processed_week >= birth_week` に当たって落ちます
     *    （★この馬は種の週が `-1506` で、★生まれを `-38` に上げると追い越します）。
     * ✔ ★動かす 3 つは ★**候補の述語が 1 つも見ない列**です（★述語が見るのは
     *    ★`sex` / `owner_id` / `retirement_role` / `bred_this_year` / `foal_count` / `birth_week`）。
     *    ★つまり ★**効くのは `birth_week` だけ**で、★対照（下限 0）がそれを示します。
     */
    await c.query(
      'update horses set birth_week = $2, birth_year = $3,'
      + ' last_processed_week = $2, retired_at_week = $2 where id = $1',
      [source, born, gameYearOf(born)],
    );

    const after = Number((await c.query(
      'select total_count from initial_breeding_dams($1,$2,$3) limit 1', [MIN_AGE_WEEKS, MAX_FOALS, 1],
    )).rows[0].total_count);
    check(after === before - 1, '⑦ 年齢が足りなくなった牝馬は候補から外れる', `前 ${before} → 後 ${after}`);

    const shown = (await c.query(
      'select horse_id from initial_breeding_dams($1,$2,$3)', [MIN_AGE_WEEKS, MAX_FOALS, 200],
    )).rows.some((r) => r.horse_id === source);
    check(!shown, '⑦ その馬が一覧にも出ない');

    // 🔴 ★対照: ★年齢の下限を 0 にすると戻ってくる（★落としていたのが年齢の項だと分かる）
    const loose = Number((await c.query(
      'select total_count from initial_breeding_dams($1,$2,$3) limit 1', [0, MAX_FOALS, 1],
    )).rows[0].total_count);
    check(loose === before, '⑦ 対照: 年齢の下限を 0 にすると戻る', `${after} → ${loose}（元 ${before}）`);
  } finally {
    const end = await endSandbox(c, tx);
    check(!end.committed, '⑦ 予行を戻した（★途中の commit なし・SB-3）');
  }
}

console.log(`\n${fail === 0 ? '✅ ★合格' : '🔴 ★不合格'}（${pass} 件 通過 / ${fail} 件 失敗）`);
await c.end();
process.exit(fail === 0 ? 0 : 1);
