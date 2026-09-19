/**
 * ★**登録の後・発走の前に引退した馬は、取消になるか**（★**DS-5 ③**・**D-111 ③**・2026-09-19）
 *
 * 【★なぜ、いま測るか】
 *   ★DS-5 ② で **G1 の登録の窓を 12 分 → 3 時間 48 分**にしました（★1 ゲーム内週の 95%）。
 *   → ★★**登録と発走の間に週送りが入るのが「例外」から「常態」になります**
 *     （★12 分のときは 10%。★いまは 95%、★一様に登録するなら平均 48%）。
 *   ★週送りは ★**260 週到達**と ★**致命的な故障**で引退を書きます（§7.1・§7.5）。
 *   → ★**D-111 ③（登録の後に引退した馬は、その馬だけ取消にして料金を返す）**が、
 *     ★**G1 では常用の経路**になります。★**10% のときは踏まれなかった経路**です。
 *
 * 【🔴 ★何を疑っているか — ★読んだ限りでは、経路が届いていません】
 *   ★引退を見ているのは ★**`entry-freeze.ts:133` の 1 か所だけ**です。
 *   ★ところが `freezePendingEntries` の `where` は ★**`e.entrant_snapshot is null`**。
 *   ★一方 ★**`fillRace`（`pg-store.ts:377`）は、登録済みの行に `entrant_snapshot` を書きます**。
 *   → ★★**組成が済んだ登録の行を、凍結の掃き出しは二度と見ません。**
 *   → ★★**引退した馬が、そのまま走るのではないか。**
 *
 * ⚠️ ★**これは読んだだけの疑いです。** ★**実 DB で、本物の SQL を流して確かめます。**
 *    ★偽の DB では出ません（★層が上で、`where` を見ません）。
 *
 * ⚠️ ★**必ず `--env staging` を付けて呼ぶこと**（`loadEnv` の既定は本番）。
 * ⚠️ ★取引の中で書くので、本番からは締め出します（R-24）。★最後に rollback します。
 */
import pg from 'pg';
import { loadEnv } from './lib/env.mjs';
import { assertNotProduction } from './lib/guard.mjs';
import { beginSandbox, endSandbox } from './lib/sandbox-tx.mjs';

const env = loadEnv();
console.log('接続先:', env.STAR_ENV);
const c = new pg.Client({ connectionString: env.DATABASE_URL });
await c.connect();
await assertNotProduction(c, 'verify-ds5-retire-scratch.mjs');
const __tx = await beginSandbox(c);

const ok = (b, m) => console.log(`  ${b ? '✅' : '🔴'} ${m}`);
let failed = 0;
const must = (b, m) => { ok(b, m); if (!b) failed += 1; };

try {
  const CY = Number((await c.query('select coalesce(max(cycle_index), 0) + 200000 as n from races')).rows[0].n);
  const frozen = (await c.query(
    `select course_frozen from races where course_frozen is not null order by cycle_index desc limit 1`,
  )).rows[0]?.course_frozen;
  if (!frozen) throw new Error('course_frozen を持つレースが 1 件もありません');

  /**
   * 🔴 ⚠️ ★**発走は 10 分後にします**（★2026-09-19・★ここで 1 度 誤りました）。
   *    ★`freezePendingEntries` の既定は ★**発走 15 分前まで**（`beforeStartMs = 900000`）。
   *    ★最初 20 分後にしたので、★**⑦ の対照まで 0 件**になり、
   *    ★**「entrant_snapshot が理由」なのか「窓の外だから」なのか分かりませんでした。**
   *    → ★★**対照が、私の仕掛けの誤りを捕まえました。** ★これが対照を置く理由です。
   */
  console.log('--- ① 公示（G1 の窓を模す。発走は 10 分後 ＝ 凍結の窓の中）---');
  await c.query(
    `insert into races (cycle_index, name, class_rank, grade, surface, distance,
                        track_condition, course_id, scheduled_at, seed_commit, server_seed, purse, status,
                        course_frozen, min_wins, max_wins, entry_fee_ep, weight_kg,
                        entry_deadline_at, game_week)
     values ($1, $2, 1, 'G1', 'turf', 1600, 'good', 'star-park',
             now() + interval '10 minutes', 'commit-x', 'seed-x', 100000, 'announced',
             $3::jsonb, 0, 0, 200, 55, now() + interval '2 minutes', 42)`,
    [CY, `R${CY}`, JSON.stringify(frozen)],
  );
  const raceId = (await c.query('select id from races where cycle_index = $1', [CY])).rows[0].id;
  must(raceId !== undefined, '公示できた');

  console.log('--- ② 現役の馬を 1 頭 登録する（enter_race が作る形）---');
  const horse = (await c.query(
    `select id from horses where owner_id is null and retired_at_week is null limit 1`)).rows[0];
  must(horse !== undefined, '現役の馬が引けた');
  await c.query(
    `insert into race_entries (race_id, horse_id, gate, weight, strategy, jockey_frozen)
     values ($1, $2, 1, 55, 'senko', $3::jsonb)`,
    [raceId, horse.id, JSON.stringify({ feeEP: 300 })],
  );

  console.log('--- ③ 週送りで引退する（★3 時間 48 分の窓の途中で起きる・§7.1）---');
  /**
   * ★`training-runner.ts:345` が書くのと同じ列。
   * ⚠️ ★**3 列を一緒に書きます** — ★`horses_retirement_all_or_none` が
   *    ★「3 つとも null か、3 つとも非 null」を要求します（★2026-09-19 にここで 1 度 落ちました）。
   *    ★**引退を「週だけ」書けない**のは良い設計です（★半端な引退が作れない）。
   * ⚠️ ★理由は `horses_retirement_reason_known` で `'age' | 'career_ending_injury'` だけ。
   *    ★役は `horses_retirement_role_known` で `'stallion' | 'broodmare' | 'honored'` だけ。
   *    ★**どちらも自由文を入れさせません**（★ここでも 1 度 落ちました）。
   */
  await c.query(
    `update horses set retired_at_week = 260, retirement_role = 'broodmare',
                       retirement_reason = 'age'
      where id = $1`,
    [horse.id],
  );
  const isRetired = (await c.query(
    `select retired_at_week from horses where id = $1`, [horse.id])).rows[0].retired_at_week;
  must(Number(isRetired) === 260, `引退した（retired_at_week=${isRetired}）`);

  console.log('--- ④ 組成の前なら、凍結の掃き出しが拾えるか（freezePendingEntries の where そのまま）---');
  /**
   * ★`entry-freeze.ts:98-110` の `where` をそのまま流します。
   * ⚠️ ★このとき `status` はまだ `announced` です。
   */
  const sweepBefore = (await c.query(
    `select e.id from race_entries e
       join races r on r.id = e.race_id
      where e.entrant_snapshot is null
        and e.scratched_at is null
        and r.status = 'scheduled'
        and r.scheduled_at <= now() + (900000::bigint || ' milliseconds')::interval
        and r.cycle_index = $1`, [CY])).rowCount;
  must(sweepBefore === 0,
    `★組成の前は拾えない（${sweepBefore} 件）— ★status が 'announced' なので where に掛からない`);

  console.log('--- ⑤ 組成（fillRace が登録の行に entrant_snapshot を書く・pg-store.ts:377）---');
  /**
   * 🔴 ★引退した馬が、そもそも「必ず入れる馬」として返るか
   *   （★`registeredHorses` の where。★取消だけを外していて、★引退は外していない）。
   */
  const reg = (await c.query(
    `select e.horse_id from race_entries e join races r on r.id = e.race_id
      where r.cycle_index = $1 and e.scratched_at is null order by e.gate`, [CY])).rows;
  must(reg.length === 1 && reg[0].horse_id === horse.id,
    '🔴 ★registeredHorses は引退した馬をそのまま返す（★「必ず入れる馬」として組成に渡る）');

  await c.query(
    `update race_entries e
        set gate = 5, entrant_snapshot = $2::jsonb
      where e.race_id = $1 and e.horse_id = $3`,
    [raceId, JSON.stringify({ horseId: horse.id, gate: 5 }), horse.id],
  );
  await c.query(`update races set status = 'scheduled' where id = $1`, [raceId]);

  console.log('--- ⑥ 🔴 欠陥の記録: 組成の後、凍結の掃き出しは拾えない（★これは正しい状態ではない）---');
  const sweepAfter = (await c.query(
    `select e.id from race_entries e
       join races r on r.id = e.race_id
      where e.entrant_snapshot is null
        and e.scratched_at is null
        and r.status = 'scheduled'
        and r.scheduled_at <= now() + (900000::bigint || ' milliseconds')::interval
        and r.cycle_index = $1`, [CY])).rowCount;
  /**
   * 🔴 ⚠️ ★**0 件が「正しい」わけではありません。** ★ここは ★**欠陥の記録**です。
   *    ★`entry-freeze` はこの馬を永久に見ません。★だから ★**⑧ の直しが要ります**。
   *    ★`=== 0` で固定するのは、★「直したつもりで `entry-freeze` を触った」ときに
   *    ★**ここが変わったと気づくため**です（★直す場所はここではありません）。
   */
  must(sweepAfter === 0,
    `🔴 ★entry-freeze は組成後の行を拾わない（${sweepAfter} 件）→ ★D-111 ③ はここには届かない`);

  console.log('--- ⑦ 対照: ★組成していない行なら拾える（★掃き出しの where 自体は生きている）---');
  /**
   * ⚠️ ★これが無いと、★⑥ が 0 だったとき ★**「where が壊れている」のか
   *    ★「entrant_snapshot が理由で外れた」のか**が分かりません。
   */
  const other = (await c.query(
    `select id from horses where owner_id is null and id <> $1 limit 1`, [horse.id])).rows[0];
  await c.query(
    `insert into race_entries (race_id, horse_id, gate, weight, strategy)
     values ($1, $2, 9, 55, 'senko')`,
    [raceId, other.id],
  );
  const sweepControl = (await c.query(
    `select e.id from race_entries e
       join races r on r.id = e.race_id
      where e.entrant_snapshot is null
        and e.scratched_at is null
        and r.status = 'scheduled'
        and r.scheduled_at <= now() + (900000::bigint || ' milliseconds')::interval
        and r.cycle_index = $1`, [CY])).rowCount;
  must(sweepControl === 1,
    `★対照: 組成していない行は拾える（${sweepControl} 件）→ ★where は生きている`);

  console.log('--- ⑧ ✅ 直し: scratchRetiredEntries の SQL そのまま（★DS-5 ③ の対）---');
  /**
   * ★`apps/worker/src/scratch.ts` の `scratchRetiredEntries` が流す `where` をそのまま。
   * ⚠️ ★**組成より前**に流します（★§10.4「残りを NPC で充填」が空いた枠を埋めるため）。
   *    ★ここでは既に組成してしまっているので、★**拾えること**だけを見ます。
   */
  const retired = (await c.query(
    `select e.id, e.race_id, e.horse_id, e.jockey_frozen, h.retired_at_week
       from race_entries e
       join races r on r.id = e.race_id
       join horses h on h.id = e.horse_id
      where r.cycle_index = $1
        and e.scratched_at is null
        and h.retired_at_week is not null
      order by e.gate`, [CY])).rows;
  must(retired.length === 1,
    `✅ ★引退した登録を拾える（${retired.length} 件）— ★entrant_snapshot を見ないので組成の後でも拾う`);
  must(retired[0]?.horse_id === horse.id, '★拾ったのは引退した馬');

  console.log('--- ⑨ ✅ 取消と返金が通る（★D-111 ③⑤・★登録料 ＋ 騎手の料金）---');
  /**
   * ★所有者のいる馬にして、返金まで通します（★NPC は所有者がいないので返金が起きません）。
   * ⚠️ ★**この取引の中で作ります**（★staging に利用者が 0 人だったので、
   *    ★`limit 1` で引く形だと落ちました・2026-09-19）。★rollback で消えます。
   */
  const uid = (await c.query(`select gen_random_uuid() as id`)).rows[0].id;
  await c.query(
    `insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
     values ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
             'ds5@test.local', 'x', now(), now()) on conflict (id) do nothing`, [uid]);
  await c.query(
    `insert into users (id, display_name, stable_name, entry_points, account_type)
     values ($1, 'DS-5 ③ の確認', 'テスト牧場', 100000, 'internal')`, [uid]);
  const user = (await c.query(`select id, entry_points from users where id = $1`, [uid])).rows[0];
  must(user !== undefined, '★返金の宛先を作れた（★この取引の中だけ）');
  await c.query(`update horses set owner_id = $1, npc_stable_id = null where id = $2`,
    [user.id, horse.id]);
  const before = Number((await c.query(
    `select entry_points from users where id = $1`, [user.id])).rows[0].entry_points);

  /** ★`scratchEntry` が流すのと同じ順（★取消 → 料金を行から読む → 返金 → 台帳） */
  const upd = await c.query(
    `update race_entries set scratched_at = now(), scratch_reason = $1
      where id = $2 and scratched_at is null`,
    ['登録の後に引退しました（260 週で引退しました）', retired[0].id]);
  must(upd.rowCount === 1, '取消にできた');
  const fee = Number((await c.query(
    `select entry_fee_ep from races where id = $1`, [raceId])).rows[0].entry_fee_ep)
    + Number(retired[0].jockey_frozen?.feeEP ?? 0);
  must(fee === 500, `★返す額は行から読む（登録料 200 ＋ 騎手 300 ＝ ${fee} EP・D-103 ④）`);
  const key = `scratch:${retired[0].id}`;
  const bal = Number((await c.query(
    `update users set entry_points = entry_points + $1 where id = $2 returning entry_points`,
    [fee, user.id])).rows[0].entry_points);
  await c.query(
    `insert into ep_ledger (user_id, delta, balance_after, reason, ref_id, dedupe_key)
     values ($1, $2, $3, 'refund', $4, $5)`,
    [user.id, fee, bal, raceId, key]);
  must(bal === before + fee, `★EP が戻った（${before} → ${bal}）`);

  console.log('--- ⑩ 対照: ★二度目は返さない（★冪等・dedupe_key）---');
  const dup = (await c.query(`select 1 from ep_ledger where dedupe_key = $1`, [key])).rowCount;
  must(dup === 1, `★台帳に 1 行だけ（${dup}）→ ★二度目は scratchEntry が返金を飛ばす`);
  const again = await c.query(
    `update race_entries set scratched_at = now() where id = $1 and scratched_at is null`,
    [retired[0].id]);
  must(again.rowCount === 0, `★二度目の取消は 0 行（${again.rowCount}）→ ★理由を上書きしない`);

  console.log('--- ⑪ 対照: ★取消の行は「必ず入れる馬」に戻らない（registeredHorses）---');
  const regAfter = (await c.query(
    `select e.horse_id from race_entries e join races r on r.id = e.race_id
      where r.cycle_index = $1 and e.scratched_at is null order by e.gate`, [CY])).rows;
  must(!regAfter.some((x) => x.horse_id === horse.id),
    '★取消にした馬は registeredHorses から消えた');

  console.log('');
  console.log('=== ★結論 ===');
  console.log('🔴 ★**`entry-freeze` は、登録された馬を一度も見ません**（★2 つの理由で外れます）:');
  console.log('   ★組成の前 … `r.status` が `announced` ≠ `scheduled`  → ④ が 0 件');
  console.log('   ★組成の後 … `e.entrant_snapshot` が非 null          → ⑥ が 0 件');
  console.log('   → ★★**掛かる瞬間が存在しません。** ★D-111 ③ はプレイヤー馬に届いていませんでした。');
  console.log('');
  console.log('✅ ★**直し（`scratchRetiredEntries`・組成の前に流す）は通ります**: ⑧〜⑪。');
  console.log('   ★取消 → 登録料 200 ＋ 騎手 300 ＝ 500 EP を返す → 二度目は返さない →');
  console.log('   ★`registeredHorses` から消える。');
  console.log('');
  console.log('🔴 ⚠️ ★**まだ残る窓**（★**DS-5 ④**）: ★**組成 → 発走**（★12 分）。');
  console.log('   ★その馬は凍結を持っているので、掃き出しは相変わらず外します。');
  console.log('   ★D-111 ④（D-056 の安全網）も「凍結が無い」を見るので拾いません。');
  console.log('   → ★**発走の直前にもう 1 度 見る**形が要ります（★DS-5 ⑤・人を迎える前に）。');

  console.log('');
  console.log(failed === 0 ? '✅ 全部 想定どおり' : `🔴 ${failed} 件が想定と違いました`);
} finally {
  await endSandbox(c, __tx);
  await c.end();
  console.log('（rollback しました）');
}
