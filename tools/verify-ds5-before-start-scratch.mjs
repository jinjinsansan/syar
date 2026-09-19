/**
 * ★**組成 → 発走の間に引退した馬は、確定の前に取消になるか**（★**DS-5 ④**・**D-111 ③⑥**・2026-09-19）
 *
 * 【★DS-5 ③ で塞いだのは 95% で、100% ではありませんでした】
 *   ★`main.ts` の抽選前の取消が塞ぐのは ★**登録 → 組成**までです。
 *   🔴 ★**組成 → 発走（12 分）**に引退した馬は ★**凍結を持っている**ので、
 *     ★`entry-freeze`（「凍結が無い」を見る）も ★D-111 ④（同じ）も ★**拾いません。**
 *
 * 【🔴 ★この 1 本が本当に確かめたいこと — ★**対照のほう**】
 *   ★「引退した馬が取消になる」だけなら、★**`where` を広げれば必ず通ります。**
 *   ★**難しいのは、広げすぎないこと**です:
 *     🔴 ★確定は ★**発走より後**に走ります。★「いま引退しているか」で切ると、
 *       ★**レースの最中／後に引退した馬まで取消**になり、★**走った馬の結果を消し、
 *       ★その馬を含む馬券を返してしまいます**（§9.1）。
 *   → ★★**対照（発走より後に引退した馬は取消にならない）が、この 1 本の主眼**です。
 *
 * 【✅ ★SQL を写していません】
 *   ★この道具は ★**製品の `createPgStore().scratchRetiredBeforeStart` をそのまま呼びます。**
 *   → ★**製品を直すと、この道具の判定も動きます**（D-052。★写しは古くなります）。
 *   ⚠️ ★そのため ★**`npx tsx` で呼ぶこと**（★TypeScript を読み込みます）。
 *
 * 【🔴 ★その代償 — ★**2 度 staging を汚しました**】
 *   ★製品の関数は ★**自分で `begin`/`commit`** します。★Postgres に入れ子の取引は無いので、
 *   ★**内側の `commit` が、外側のサンドボックスごと確定**させます。
 *   ✔ ★実害（2026-09-19・staging）: ★レース 1 本・出走表 3 行・★**現役馬 3 頭の引退** × 2 回。
 *     ★`SB-3` が「途中で確定しています」と出して分かり、★手で消して DB で確かめました。
 *   ✅ ★直し: ★**`sandboxTx` で包む**（★`begin`/`commit` を横取りする）。
 *   ⚠️ 🔴 ★**`sandbox-tx.mjs` は、まさにこのために 2026-09-19 に作られていました。**
 *      ★**先に読めば汚さずに済みました**（★同じ日に、同じ罠を踏んでいます）。
 *
 * ⚠️ ★**必ず `--env staging` を付けて呼ぶこと**（★`loadEnv` の既定は本番）。
 * ⚠️ ★取引の中で書くので、本番からは締め出します（R-24）。★最後に rollback します。
 *
 *   npx tsx tools/verify-ds5-before-start-scratch.mjs --env staging
 */
import pg from 'pg';
import { createHash, createHmac } from 'node:crypto';
import { loadEnv } from './lib/env.mjs';
import { assertNotProduction } from './lib/guard.mjs';
import { beginSandbox, endSandbox, sandboxTx } from './lib/sandbox-tx.mjs';
import { createPgStore } from '../apps/worker/src/pg-store.ts';
import { weekIndexAt } from '@star/scheduler';

const env = loadEnv();
console.log('接続先:', env.STAR_ENV);
const c = new pg.Client({ connectionString: env.DATABASE_URL });
await c.connect();
await assertNotProduction(c, 'verify-ds5-before-start-scratch.mjs');
const __tx = await beginSandbox(c);

const ok = (b, m) => console.log(`  ${b ? '✅' : '🔴'} ${m}`);
let failed = 0;
const must = (b, m) => { ok(b, m); if (!b) failed += 1; };

/** ★store を作るのに要ります（★この検査では seed を使いません） */
const hash = {
  sha256: (m) => createHash('sha256').update(m).digest('hex'),
  hmacSha256: (k, m) => createHmac('sha256', k).update(m).digest('hex'),
};

try {
  /**
   * ★**epoch は製品と同じ環境変数から取ります**（★`apps/worker/src/env.ts:58`）。
   * ⚠️ ★ここで別の値を決めると、★**週の切り方が製品と違うものを測る**ことになります（R-30）。
   */
  const epochMs = Date.parse(env.STAR_EPOCH_ISO ?? '');
  if (!Number.isFinite(epochMs)) throw new Error('STAR_EPOCH_ISO が読めません（--env を確かめてください）');

  const nowMs = Number((await c.query(`select (extract(epoch from now()) * 1000)::bigint::text as ms`)).rows[0].ms);
  /** ★**発走は 20 分前**（★もう発走していて、確定を待っている状態） */
  const startMs = nowMs - 20 * 60 * 1000;
  const startWeek = weekIndexAt(startMs, epochMs);
  console.log(`  発走時刻の週 = ${startWeek}（いまの週 = ${weekIndexAt(nowMs, epochMs)}）`);

  const CY = Number((await c.query('select coalesce(max(cycle_index), 0) + 300000 as n from races')).rows[0].n);
  const frozen = (await c.query(
    `select course_frozen from races where course_frozen is not null order by cycle_index desc limit 1`,
  )).rows[0]?.course_frozen;
  if (!frozen) throw new Error('course_frozen を持つレースが 1 件もありません');

  console.log('--- ① 発走済み（status = scheduled・確定待ち）のレースを 1 本 作る ---');
  await c.query(
    `insert into races (cycle_index, name, class_rank, grade, surface, distance,
                        track_condition, course_id, scheduled_at, seed_commit, server_seed, purse, status,
                        course_frozen, min_wins, max_wins, entry_fee_ep, weight_kg,
                        entry_deadline_at, game_week)
     values ($1, $2, 1, 'G1', 'turf', 2000, 'good', 'oval',
             to_timestamp($3 / 1000.0), 'commit', 'seed', 1000, 'scheduled',
             $4::jsonb, 0, 99, 500, 55, to_timestamp($5 / 1000.0), $6)`,
    [CY, `DS5-4-${CY}`, startMs, JSON.stringify(frozen), startMs - 600000, startWeek],
  );
  const raceId = (await c.query('select id from races where cycle_index = $1', [CY])).rows[0].id;

  /**
   * ★3 頭 用意します。★**どれも `entrant_snapshot` を持ちます**（★組成が済んだ状態）。
   *   ★A … ★発走の**前**の週に引退（★取消になるべき）
   *   ★B … ★発走の**後**の週に引退（★**取消にならないべき** ← ★この 1 本の主眼）
   *   ★C … ★引退していない（★取消にならないべき）
   */
  const horses = (await c.query(
    `select id from horses where retired_at_week is null and birth_week is not null order by id limit 3`,
  )).rows.map((r) => r.id);
  if (horses.length < 3) throw new Error('現役の馬が 3 頭 ありません');
  const [A, B, C] = horses;

  console.log('--- ② 3 頭を出走表に入れる（凍結つき＝組成が済んだ形）---');
  let gate = 0;
  for (const h of horses) {
    gate += 1;
    await c.query(
      `insert into race_entries (race_id, horse_id, gate, weight, strategy, entrant_snapshot, jockey_frozen)
       values ($1, $2, $3, 55, 'senko', $4::jsonb, $5::jsonb)`,
      [raceId, h, gate, JSON.stringify({ horseId: h, gate }), JSON.stringify({ feeEP: 300 })],
    );
  }

  console.log('--- ③ A は発走の前の週に、B は発走の後の週に引退させる ---');
  /**
   * ⚠️ ★`horses_retirement_all_or_none`（移行 `0010`）があるので、★**3 列を揃えて書きます**
   *    （★週だけ書くと落ちます — ★実際に落ちました）。
   */
  const retire = async (id, week) => c.query(
    `update horses set retired_at_week = $2, retirement_role = 'honored', retirement_reason = 'age'
      where id = $1`, [id, week],
  );
  await retire(A, startWeek - 1);
  await retire(B, startWeek + 1);

  console.log('--- ④ ★製品の `scratchRetiredBeforeStart` を、そのまま呼ぶ ---');
  /** 🔴 ★**`c` をそのまま渡さない。** ★`sandboxTx` で包みます（★上の註記「2 度 汚した」）。 */
  const { client: sandboxed, swallowed } = sandboxTx(c);
  const store = createPgStore(sandboxed, hash, { epochMs });
  const r1 = await store.scratchRetiredBeforeStart(CY);
  console.log(`   返り値: ${JSON.stringify(r1)}`);

  const scratchedOf = async (h) => (await c.query(
    'select scratched_at, scratch_reason from race_entries where race_id = $1 and horse_id = $2', [raceId, h],
  )).rows[0];

  must(r1.skipped === false, '★見送っていない（epochMs は渡っている）');
  must(r1.scratched === 1, `★取消は 1 頭だけ（実際: ${r1.scratched} 頭）`);
  must((await scratchedOf(A)).scratched_at !== null, '★A（発走の前に引退）は取消になった');

  console.log('--- ⑤ 🔴 ★対照: 発走の「後」に引退した馬を取消にしていないか ---');
  must(
    (await scratchedOf(B)).scratched_at === null,
    '🔴 ★B（発走の後に引退）は取消に **なっていない**（★走った馬の結果を消していない）',
  );
  must((await scratchedOf(C)).scratched_at === null, '★C（引退していない）は取消になっていない');

  console.log('--- ⑥ ★理由が本人に届く形で入っている（D-111 ⑤）---');
  const reason = (await scratchedOf(A)).scratch_reason ?? '';
  must(reason.includes('発走の前に引退'), `★理由が入っている（実際: 「${reason}」）`);
  must(reason.includes(String(startWeek - 1)), '★何週で引退したかが理由に入っている');

  console.log('--- ⑦ ★もう 1 度 呼んでも二重に返さない（冪等）---');
  const r2 = await store.scratchRetiredBeforeStart(CY);
  must(r2.scratched === 0, `★2 回目は 0 頭（実際: ${r2.scratched} 頭）`);
  must(r2.refundedEp === 0, `★2 回目は 0 EP（実際: ${r2.refundedEp} EP）`);

  console.log('--- ⑧ 🔴 ★対照: 確定済みのレースには何もしない ---');
  /**
   * ★確定の後に取消にすると、★**払戻が済んだ後に結果を消す**ことになります。
   * ★製品は `status = 'scheduled'` で切っているはず。★**切っていなければここで落ちます。**
   */
  await retire(C, startWeek - 1);
  await c.query(`update races set status = 'settled' where cycle_index = $1`, [CY]);
  const r3 = await store.scratchRetiredBeforeStart(CY);
  must(r3.scratched === 0, `🔴 ★確定済みのレースは 0 頭（実際: ${r3.scratched} 頭）`);
  must((await scratchedOf(C)).scratched_at === null, '🔴 ★確定済みなら、引退していても取消にしない');

  console.log('--- ⑨ ⚠️ ★対照: epochMs が無ければ「黙って 0」ではなく skipped を返す（R-16）---');
  await c.query(`update races set status = 'scheduled' where cycle_index = $1`, [CY]);
  const blind = createPgStore(sandboxTx(c).client, hash, {});
  const r4 = await blind.scratchRetiredBeforeStart(CY);
  must(r4.skipped === true, '★`skipped: true` を返す（★黙って見送らない）');
  must(r4.scratched === 0, '★見送ったので 0 頭');
  must((await scratchedOf(C)).scratched_at === null, '★見送ったので書いていない');

  console.log('--- ⑩ ⚠️ ★対照: 包む意味があったか（★横取り 0 件なら、製品は取引を張っていない）---');
  must(swallowed.length > 0, `★begin/commit を横取りした（実際: ${swallowed.length} 件・${swallowed.join(',')}）`);

  console.log('');
  if (failed === 0) {
    console.log('✅ ★**DS-5 ④ は通ります**: ★発走の前に引退した馬だけを取消にし、');
    console.log('   ★**発走の後に引退した馬と、確定済みのレースには触れません。**');
  } else {
    console.log(`🔴 ★**${failed} 件 落ちました。**`);
  }
} finally {
  await endSandbox(c, __tx);
  await c.end();
}
process.exit(failed === 0 ? 0 : 1);
