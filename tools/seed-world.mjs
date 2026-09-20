/**
 * プリシード世界を DB へ投入する（正典 §10.5 / 合格基準3）。
 *
 * 【★全馬は入れない】
 *   50世代で 40,000頭以上が生まれますが、サービス開始に必要なのは
 *   **現役 + 種牡馬 + 繁殖牝馬 と、その5代血統に現れる祖先**だけです。
 *   全部入れると DB が重くなるうえ、参照されない馬が大半を占めます。
 *   → 必要な馬から**5代さかのぼって到達できる馬だけ**を投入します。
 *
 * 【★親を先に入れる】
 *   horses.sire_id / dam_id は自己参照の外部キーなので、
 *   **親より先に子を入れると失敗します**。世代順に並べてから投入します。
 *
 * 【🔴 ★2026-09-20 — ★この道具は「誰が現役か」と「いつ生まれたか」を捨てていました】
 *   ✔ ★**実測**（`evidence/20260920-world-supply/`・★DB に繋がず）:
 *     ★投入 **7,370 頭** ＝ 現役 2,400 ＋ 種牡馬 200 ＋ 繁殖牝馬 800 ＋ 5 代の祖先。
 *     ★このうち ★**4,970 頭（67%）は、★プリシード世界では走り終えた馬**です。
 *   ★しかし `insert` の列に ★**`birth_week` も `retired_at_week` もありませんでした**。
 *   → ★★**引退済みの 4,970 頭が DB では「現役」**になり、★種牡馬・繁殖牝馬まで出走表に載りえた。
 *   → ★★**`birth_week` が null なので、★育成が 1 頭も進まなかった**（★`PROD-NEVER-AGED`）。
 *   ✅ ★これは ★**`PO-8`（母数の帳簿が合わない）の答え**でした —
 *     ★正典 §10.5 の **2,500** と ★実際の現役 **2,400** は ★**ほぼ一致していました**。
 *
 *   ★**直し方は「発明」ではなく「転記」です。** ★プリシード世界は誰が現役かを知っています。
 *
 * 【★生まれた週の配り方 ＝ ★案 B-3（裁定 2026-09-20）】
 *   ★規則そのものは ★**製品側**（`@star/scheduler` の `birth-week.ts`）にあります。
 *   ★この道具は**適用するだけ**です（★D-052: ★正を道具側に置かない）。
 */
import pg from 'pg';
import { ALLOW_ALL_NAMES, NPC_STABLES } from '../packages/sim-engine/src/index.ts';
import { loadNameBlocklist } from '../apps/cli/src/name-blocklist.ts';
import { DEFAULT_PRESEED_OPTIONS, preseedNicks, runPreseed } from '../apps/cli/src/preseed.ts';
import {
  LIFECYCLE_WEEKS, birthWeekOf, rankByStableKey, weekIndexAt,
} from '../packages/scheduler/src/index.ts';
import { advanceTrainingWeeks } from '../apps/worker/src/training-runner.ts';

import { assertNotProduction } from './lib/guard.mjs';
import { loadEnv, positionals } from './lib/env.mjs';
import { VERDICT } from './lib/counted-verdict.mjs';

/** ★フラグ（--env など）を除いた位置引数 */
const POS = positionals();
const SEED = Number(POS[0] ?? 20260833);
const GENERATIONS = Number(POS[1] ?? 50);
/**
 * ★**育成の追いつきを流すか**（★決め C）。
 *
 * ⚠️ ★既定は **流す**。★`--no-catch-up` で止められます（★所要を測るとき用）。
 * 🔴 ★止めると ★**4 歳の馬が創始のままの能力（素質開放率 0.28〜0.35）で立ちます**。
 *    ★世界としては嘘なので、★**本番の投入では止めないでください**。
 */
const CATCH_UP = !process.argv.includes('--no-catch-up');

/**
 * 🔴 ★**実在競走馬名の NG 判定**（★憲法 §0.1 / 正典 §17.2 **C-4**・2026-09-20）。
 *
 * 【★何が起きていたか】
 *   ⚠️ ★旧: ★`blocklist: ALLOW_ALL_NAMES` を**直に渡していました**。
 *     → ★★**この道具が作る世界の名前は、★一度も NG 判定を通っていません。**
 *   ✔ ★`apps/cli/src/name-blocklist.ts` は ★**既定で厳格**（★ハッシュ表が無ければ投げる）。
 *     ★★**呼ぶ側が素通しにしていただけ**でした。★註記は「★本番では禁止」と書いていました。
 *
 * 【★なぜ旗を「立てないと止まる」側にするか】
 *   🔴 ★**旗が無いと素通し、では駄目です。★旗を立てないと止まる、が正しい**（★**R-27**）。
 *   ★`tools/age-horses.mjs` の `--flatten` と同じ作法です。
 *
 * ⚠️ ★**過大に読まないこと**: ★名前は音節を並べて作るので ★**実在名を参照する経路はありません**。
 *    ★ここが守るのは ★**偶然の一致を拾う網**です。
 */
const ALLOW_ALL = process.argv.includes('--allow-all-names');

const env = loadEnv();

/**
 * ★NG 判定を組み立てる。★**旗が無ければ、ここで投げます**（★`loadNameBlocklist` の既定が厳格）。
 */
let nameBlocklist;
let ngSize = 0;
if (ALLOW_ALL) {
  console.log('');
  console.log('🔴🔴 ★**--allow-all-names: ★実在競走馬名の NG 判定をしません**（★憲法 §0.1 / C-4）');
  console.log('   ★この世界の名前は ★**未検査**です。★弁護士に見せる構成に使わないでください。');
  console.log('   ★印を `evidence/world-build/` に残します。');
  console.log('');
  nameBlocklist = ALLOW_ALL_NAMES;
} else {
  // ★ハッシュ表が無ければ投げます（★既定 strict）。★それが正しい
  const ng = loadNameBlocklist();
  nameBlocklist = ng.blocklist;
  ngSize = ng.size;
  console.log(`  ✅ ★実在馬名 NG リスト ${ngSize} 件 を突合します（★憲法 §0.1）`);
}

console.log(`# プリシード世界の投入  seed=${SEED} generations=${GENERATIONS}`);
const t0 = Date.now();
const pre = runPreseed({
  ...DEFAULT_PRESEED_OPTIONS, seed: SEED, generations: GENERATIONS,
  nicks: preseedNicks(SEED, NPC_STABLES), blocklist: nameBlocklist,
});
console.log(`  生成 ${pre.world.all.size} 頭（${((Date.now()-t0)/1000).toFixed(1)}秒）`);

// --- 必要な馬 = 現役 + 種牡馬 + 繁殖牝馬、そこから5代さかのぼる ---
const need = new Set([...pre.world.activeIds, ...pre.world.stallionIds, ...pre.world.mareIds]);
let frontier = [...need];
for (let depth = 0; depth < 5; depth += 1) {
  const next = [];
  for (const id of frontier) {
    const r = pre.world.all.get(id)?.record;
    for (const p of [r?.sireId, r?.damId]) {
      if (p && !need.has(p)) { need.add(p); next.push(p); }
    }
  }
  frontier = next;
}
console.log(`  投入対象 ${need.size} 頭（現役+繁殖+5代の祖先）`);

// ★親を先に入れる。世代順に並べる
const rows = [...need].map((id) => pre.world.all.get(id)).filter(Boolean)
  .sort((a, b) => a.record.generation - b.record.generation);

/**
 * 🔴 ★**接続が落ちても、★プロセスごと死なないようにします**（★2026-09-20・★演習 4 回目）。
 *
 * 【★何が起きたか】
 *   ★追いつきの最中に ★`Connection terminated unexpectedly` で落ちました。
 *   ⚠️ ★問題は ★**落ち方**です: ★`pg.Client` の `error` を ★**誰も受けていません**でした。
 *     → ★Node が ★**`Unhandled error event` でプロセスを殺します**（★途中で止まる）。
 *   ✔ ★**実測**（★落ちた後の staging・★読むだけ）: ★世界は建っている（★7,370 頭・
 *     ★`birth_week` 欠け 0）のに、★**いちばん遅い馬の週齢 78 / 基準 258**。★引退 3 頭。
 *   🔴 ★本番で同じことが起きると、★**作り直しを最初からやり直す**ことになります
 *     （★本番は `race_odds` 15.5M 行 を消すところから）。
 *
 * 【★接続先】★`pooler.supabase.com:5432`（★Supavisor 経由）。★切れるのはここです。
 *
 * ⚠️ ★**繋ぎ直しても「合格」にはしません。** ★落ちた周に済んだ分は DB に残り、
 *    ★戻り値としては数えられないので、★下の ②b は ★**判定不能**にします（★CK-14）。
 */
let c;
/** ★繋ぎ直した回数（★0 でなければ ②b は判定不能） */
let reconnects = 0;
const RECONNECT_MAX = 5;
/** ★受けるだけ。★ここで投げ直すと `unhandledRejection` になります */
function onClientError(e) {
  console.log(`  ⚠️ ★接続の異常: ${e.message}`);
}
/** ★「接続が落ちた」かどうか。⚠️ ★文法の誤りや制約違反と混ぜないこと */
function isConnectionLost(e) {
  const m = String(e?.message ?? '');
  return m.includes('Connection terminated')
    || m.includes('Client has encountered a connection error')
    || m.includes('server closed the connection')
    || e?.code === 'ECONNRESET' || e?.code === 'EPIPE' || e?.code === '57P01';
}
async function connectDb() {
  c = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  c.on('error', onClientError);
  await c.connect();
  // ★状態を変えるツールなので、本番に向いていたら実行しない（R-24）
  // 🔴 ★繋ぎ直したときも★必ず通します（★門を 1 度きりにしない）
  await assertNotProduction(c, 'seed-world.mjs');
}
await connectDb();

// ─────────────────────────────────────────────────────────
// ★生まれた週・引退を決める（★決め A ＋ B-3）
// ─────────────────────────────────────────────────────────
/**
 * ★**基準の週**。★ゲーム内時刻の真実は Postgres の `now()` だけです（§14・憲法 §1-4）。
 *   ★`Date.now()` は使いません。
 */
const EPOCH = Date.parse(env.STAR_EPOCH_ISO);
if (!Number.isFinite(EPOCH)) throw new Error('seed-world: STAR_EPOCH_ISO を読めません');
const nowMs = Number(
  (await c.query('select (extract(epoch from now()) * 1000)::bigint as ms')).rows[0].ms,
);
/** ★「締まった週」。★いまの週はまだ締まっていないので使いません */
const referenceWeek = weekIndexAt(nowMs, EPOCH) - 1;

/** ★歳（＝ 最終年 − 生まれ年）ごとにコホートを作る */
const cohortOf = new Map();
for (const h of rows) {
  const age = pre.world.year - h.record.birthYear;
  if (!cohortOf.has(age)) cohortOf.set(age, []);
  cohortOf.get(age).push(h.record.id);
}
/** ★コホート内の順位（★プリシードの id から。★`randomUUID` からではない・決定論） */
const rankOf = new Map();
for (const [age, ids] of cohortOf) {
  const ranks = rankByStableKey(ids);
  for (const [id, r] of ranks) rankOf.set(id, { rank: r, size: ids.length, age });
}

const activeIdSet = new Set(pre.world.activeIds);
const stallionIdSet = new Set(pre.world.stallionIds);
const mareIdSet = new Set(pre.world.mareIds);

/**
 * ★その馬の一生の列を作る（★転記であって発明ではありません）。
 *
 * ★**現役**       … 引退の 3 列は null。★`last_processed_week` は調教開始の週
 *                    （★そこから `advanceTrainingWeeks` が追いつかせます・決め C）
 * ★**引退済み**   … 260 週で引退した、として 3 列を埋める。★役割はプリシード世界のとおり
 */
function lifeColumns(preseedId) {
  const { rank, size, age } = rankOf.get(preseedId);
  const birthWeek = birthWeekOf(referenceWeek, age, rank, size);
  if (activeIdSet.has(preseedId)) {
    return {
      birthWeek,
      lastProcessedWeek: birthWeek + LIFECYCLE_WEEKS.trainableFrom,
      retiredAtWeek: null, retirementRole: null, retirementReason: null,
    };
  }
  const retiredAtWeek = birthWeek + LIFECYCLE_WEEKS.retireAt;
  const role = stallionIdSet.has(preseedId) ? 'stallion'
    : mareIdSet.has(preseedId) ? 'broodmare'
      : 'honored';
  return {
    birthWeek,
    lastProcessedWeek: retiredAtWeek,
    retiredAtWeek,
    retirementRole: role,
    // ★§7.1 の強制引退。★プリシードに故障の記録は無いので `age` 一択
    retirementReason: 'age',
  };
}

/**
 * 🔴 ★**`delete from horses` の 1 文では落ちます**（★2026-09-20・レビュー側が指摘・★実測で確認）。
 *
 * ✔ ★**実測**（`tools/diag-horses-refs.mjs`・★読むだけ）:
 *   ★`horses` を止める形で参照している外部キー … ★**本番 3 本 / staging 5 本**
 *   ★行が在る表 … ★**本番 `race_entries` 79,746 行 ／ staging は さらに
 *     `horse_story_event` 77・`horse_market_listing` 15**。
 *   ★`on delete cascade` が付いているのは ★**`horse_week_log` の 1 本だけ**。
 *   → ★★**空の DB でしか通っていませんでした。**
 *
 * 【★`cascade` を足さない理由】
 *   ★「消しやすくするため」に製品の制約を緩めることになります。
 *   ★`cascade` にすると、★**将来 馬を 1 頭 消したときに、★その馬のレース記録が黙って消えます**。
 *   → ★**順に消します**（★レビュー側も同じ判断）。
 *
 * 【★順を手で書かない理由（★D-052）】
 *   ★表はこれからも増えます（★移行 33 件 で 2 つ 増えました）。
 *   ★**手で書いた順は、★増えた日に黙って古くなります。**
 *   → ★★**`pg_constraint` から毎回 引きます。** ★増えた表は自動で入ります。
 */
async function deleteAllHorses(roots) {
  const edges = (await c.query(`
    select src.relname as child, tgt.relname as parent, con.confdeltype as on_delete
      from pg_constraint con
      join pg_class src on src.oid = con.conrelid
      join pg_class tgt on tgt.oid = con.confrelid
      join pg_namespace ns on ns.oid = src.relnamespace
     where con.contype = 'f' and ns.nspname = 'public'`)).rows;
  /**
   * 🔴 ★**`truncate` では、★`cascade` の辺も数えます**（★2026-09-20・★演習 2 回目が落ちて分かった）。
   *
   * 【★何が起きたか】
   *   ★旧: ★「`cascade` / `set null` は DB が面倒を見る」として ★**辺を外していました**。
   *     ★それは ★**`delete` の話としては正しい**（★DB が自動で処理します）。
   *   🔴 ★しかし ★**`truncate` は違います**:
   *   ```
   *   error: cannot truncate a table referenced in a foreign key constraint
   *   detail: Table "horse_week_log" references "horses".
   *   ```
   *   ★`truncate` は ★**参照している表が在るだけで拒みます**（★削除時の動作に関係なく）。
   *
   * 【🔴 ★学んだこと】
   *   ★★**機構を変えると、★効く規則も変わります。**
   *   ★集合の作り方は `delete` の意味に合わせて書いてあり、★`truncate` には合っていませんでした。
   *   → ★**`truncate` なら、★参照している表を 1 つ残らず集合に入れます。**
   *
   * ⚠️ ★**`cascade` を付けて済ませません。** ★★名前を全部 並べます —
   *    ★`cascade` は ★**集合の外まで巻き込みうる**からです。
   */
  const childrenOf = new Map();
  /** ★`truncate` のためだけに足した辺（★出力に出して、★違いを見えるようにします） */
  const addedForTruncate = new Set();
  for (const e of edges) {
    // ★自己参照は 1 文の中で解けます（★truncate は 1 文なので問題になりません）
    if (e.child === e.parent) continue;
    const managedByDb = e.on_delete === 'c' || e.on_delete === 'n';
    if (managedByDb) {
      addedForTruncate.add(`${e.child} → ${e.parent}（${e.on_delete === 'c' ? 'cascade' : 'set null'}）`);
      // 🔴 ★`set null` は、★`delete` なら「列を null にする」だけ。★`truncate` は**行ごと消えます**
      if (e.on_delete === 'n') {
        console.log(`  ⚠️ 🔴 ★${e.child} は ${e.parent} を set null で参照しています。`);
        console.log('     ★`delete` なら列が null になるだけですが、★**truncate では行ごと消えます**。');
      }
    }
    if (!childrenOf.has(e.parent)) childrenOf.set(e.parent, new Set());
    childrenOf.get(e.parent).add(e.child);
  }
  const mustEmpty = new Set();
  const walk = (t) => {
    for (const ch of childrenOf.get(t) ?? []) {
      if (mustEmpty.has(ch)) continue;
      mustEmpty.add(ch);
      walk(ch);
    }
  };
  /**
   * ★**根を複数 取れます**（★2026-09-20・案 A）。
   *
   * ⚠️ ★根そのものも `mustEmpty` に入れます（★`horses` だけは最後に別で消していたので、
   *    ★そこは呼ぶ側の形を保ちます）。
   */
  for (const root of roots) walk(root);
  // ★根どうしの依存（★`race_entries` は `races` の子でもある）を順に反映させる
  for (const root of roots) if (root !== 'horses') mustEmpty.add(root);

  const order = [];
  const placed = new Set();
  for (let guard = 0; guard < 50 && order.length < mustEmpty.size; guard += 1) {
    for (const t of mustEmpty) {
      if (placed.has(t)) continue;
      if ([...(childrenOf.get(t) ?? [])].every((x) => !mustEmpty.has(x) || placed.has(x))) {
        order.push(t); placed.add(t);
      }
    }
  }
  if (order.length < mustEmpty.size) {
    throw new Error(
      `seed-world: 消す順を決められません（★環があります）: `
        + `${[...mustEmpty].filter((t) => !placed.has(t)).join(', ')}`,
    );
  }

  // 🔴 ★**1 つの取引で**。★途中で落ちたら全部 戻す（★半分 消えた世界を残さない）
  /**
   * 🔴 ★**`delete` ではなく `truncate` を使います**（★2026-09-20・★演習が落ちて分かった）。
   *
   * 【★何が起きたか — ★staging の演習 1 回目】
   *   ★子の表は全部 速く消えました（★`race_odds` 162,568 行 が **1.6 秒**）。
   *   🔴 ★しかし ★**`delete from horses` が時間切れ**（★57014）。★落ちた場所は:
   *   ```
   *   SELECT 1 FROM ONLY "public"."horses" x WHERE $1 = "sire_id" FOR KEY SHARE OF x
   *   ```
   *   ✔ ★原因（★実測）: ★`horses` の索引は 4 つだけで、
   *     ★**`sire_id` にも `dam_id` にも索引がありません**。
   *   → ★7,370 行を消すあいだ ★**1 行ごとに 2 回の全表走査** ≒ ★**約 1 億回**の行走査。
   *
   * 【🔴 ★私の見立ては外れていました】
   *   ★手順書に「★自己参照は 1 文の delete の中で解ける」と書きました。★**外れ**です。
   *   ★PostgreSQL は ★**削除した行 1 つずつに RI 検査を走らせます**。
   *   ★同じ文の中で参照元も消えていても、★**検査そのものは走ります**。
   *
   * 【★なぜ `truncate` でよいか】
   *   ★`truncate` は ★**1 行ごとの外部キー検査をしません**（★表ごと空にするため）。
   *   🔴 ★**`cascade` は付けません。** ★消す集合は `pg_constraint` から閉じるまで辿ってあるので、
   *     ★**その集合を全部 並べれば足ります**。→ ★★**巻き込みが原理的に起きません。**
   *   ⚠️ ★`truncate` も ★**取引の中で巻き戻せます**（★PostgreSQL）。★1 回目の巻き戻りは実測済み。
   *
   * ⚠️ ★**索引を足す案は採っていません**（★こちらの判断ではないため）。
   *    ★`sire_id` / `dam_id` の索引は ★**配合の血統辿りにも効く**はずなので、★別に起票しました。
   */
  const all = [...order, 'horses'];
  /**
   * ⚠️ ★**消す集合に関係する辺だけを出します**（★2026-09-20・★演習 3 回目の出力で気づいた）。
   *
   *   🔴 ★旧は ★**DB 全体の cascade / set null の辺**を並べていました。
   *     ★実際の出力: ★`user_identities → users（cascade）` — ★**`users` は消していません**。
   *   → ★★**消していない表の話を「足した」と書くのは、★嘘です。**
   *   → ★**親が集合に入っている辺だけ**に絞ります。
   */
  const relevant = [...addedForTruncate].filter((a) => all.includes(a.split(' → ')[1]?.split('（')[0]));
  if (relevant.length > 0) {
    console.log(`  ⚠️ ★\`truncate\` のために足した参照 ${relevant.length} 本`
      + '（★`delete` なら DB が面倒を見るもの）:');
    for (const a of relevant) console.log(`     ${a}`);
  }
  const before = {};
  for (const t of all) {
    before[t] = Number((await c.query(`select count(*)::int n from ${t}`)).rows[0].n);
  }
  await c.query('begin');
  try {
    const t0 = process.hrtime.bigint();
    // ★1 文で、★閉じた集合を全部（★`cascade` 無し）
    await c.query(`truncate table ${all.join(', ')}`);
    const sec = Number(process.hrtime.bigint() - t0) / 1e9;
    for (const t of all) {
      console.log(`  ★空にしました: ${t}（${before[t].toLocaleString()} 行）`);
      wipedCounts[t] = before[t];
    }
    console.log(`  ★1 文の truncate で ${sec.toFixed(1)} 秒`
      + `（★合計 ${Object.values(before).reduce((a, b) => a + b, 0).toLocaleString()} 行）`);
    await c.query('commit');
  } catch (e) {
    await c.query('rollback');
    throw e;
  }
}
/**
 * 🔴 ★**`races` / `race_odds` も消すか**（★案 A・裁定 2026-09-20）。
 *
 * 【★なぜ要るか】
 *   ★`horses` を消すのに必要なのは `race_entries` までで、★`races` と `race_odds` は**残ります**。
 *   ✔ ★実測（2026-09-20・本番）: ★`races` **6,152 行** ／ `race_odds` **15,490,715 行**。
 *   → ★★**出走馬が 1 頭も居ない「確定済みレース」が 6,152 本**残ります。
 *
 * 【★消す理由（★裁定の 4 つ）】
 *   ★① ★出走馬が 1 頭も居ないレースは ★**履歴ではなく、壊れた行**
 *   ★② ★`races_public` は `race_entries` と結合する → ★**空のレースが画面に並ぶ**
 *   ★③ ★`entrant_snapshot` が 0 なので ★**F-3 で照合できない ＝ 何の証拠にもならない**
 *   ★④ ★2026-08-20 のエンジンの記録 → ★**今日のエンジンの記録として読めない**
 *   ✔ ★そして ★**困る人が 1 人も居ません**（★本番実測: users 0 / bets 0 / 台帳 0）。
 *
 * 【⚠️ ★なぜ既定で消さないのか】
 *   ★`horses` の作り直しに ★**必要ではない**からです。
 *   ★★**「ついでに消す」を既定にすると、★消す範囲が黙って広がります。**
 *   → ★**明示した人だけが消せる形**にします（★`--flatten` / `--allow-all-names` と同じ作法）。
 */
const WIPE_RACES = process.argv.includes('--wipe-races');
/** ★追いつきの最中に引退した頭数（★下の判定②で使います） */
let retiredDuringCatchUp = 0;
/** ★消した行数（★後で `evidence/world-build/` に残します） */
const wipedCounts = {};
await deleteAllHorses(WIPE_RACES ? ['horses', 'races'] : ['horses']);
if (!WIPE_RACES) {
  const left = await c.query(
    'select (select count(*) from races)::int r, (select count(*) from race_odds)::int o',
  );
  console.log(`  ⚠️ ★--wipe-races なし: ★races ${left.rows[0].r.toLocaleString()} 行 / `
    + `race_odds ${left.rows[0].o.toLocaleString()} 行 が ★**残ります**`);
  console.log('     🔴 ★出走馬の居ない確定済みレースが残ると、★画面に空の行が並びます');
}

// UUID はアプリ側で振り、プリシードの ID と対応づける
const uuid = new Map();
const { randomUUID } = await import('node:crypto');
for (const h of rows) uuid.set(h.record.id, randomUUID());

const stableId = (sid) => Number(String(sid).replace(/\D/g, ''));
/** ★投入にかかった時間（★運用簿の「作り直し全体に何分か」の内訳） */
const tInsert = process.hrtime.bigint();
let n = 0;
const tally = { active: 0, stallion: 0, broodmare: 0, honored: 0 };
for (const h of rows) {
  const r = h.record;
  const life = lifeColumns(r.id);
  tally[life.retirementRole ?? 'active'] += 1;
  await c.query(
    `insert into horses (id, npc_stable_id, name, sex, birth_year, generation,
       sire_id, dam_id, sire_line, dam_sire_line, genotype, potential, stats, unlock_rate,
       surface_aptitude, distance_center, distance_range, strategy_aptitude, heavy_aptitude,
       growth, temper, durability, frail, skill_genes, inbreed_coeff, nicks_multiplier,
       pedigree_cache, foal_count, g1_wins,
       birth_week, last_processed_week, retired_at_week, retirement_role, retirement_reason)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,
             $30,$31,$32,$33,$34)`,
    [uuid.get(r.id), stableId(h.stableId), h.name, r.sex, r.birthYear, r.generation,
     r.sireId ? uuid.get(r.sireId) ?? null : null, r.damId ? uuid.get(r.damId) ?? null : null,
     r.sireLine, r.damSireLine, JSON.stringify(r.genotype), JSON.stringify(r.potential),
     JSON.stringify(r.stats), r.unlockRate, JSON.stringify(r.surfaceAptitude),
     r.distanceCenter, r.distanceRange, JSON.stringify(r.strategyAptitude), r.heavyAptitude,
     r.growth, r.temper, r.durability, r.frail, JSON.stringify(r.skillGenes),
     r.inbreedCoeff, r.nicksMultiplier, JSON.stringify(Object.fromEntries(r.pedigreeCache)),
     r.foalCount, r.g1Wins,
     life.birthWeek, life.lastProcessedWeek,
     life.retiredAtWeek, life.retirementRole, life.retirementReason],
  );
  n += 1;
  if (n % 2000 === 0) process.stdout.write(`\r  投入 ${n}/${rows.length}`);
}
console.log(`\r  投入 ${n} 頭 完了            `
  + `（${(Number(process.hrtime.bigint() - tInsert) / 1e9).toFixed(1)}秒）`);
console.log(`  ★基準の週 ${referenceWeek}`);
console.log(`  ★現役 ${tally.active} 頭 / 種牡馬 ${tally.stallion} / 繁殖牝馬 ${tally.broodmare}`
  + ` / 功労馬 ${tally.honored}`);

// ─────────────────────────────────────────────────────────
// ★決め C — ★能力は**本番の経路**で作る
// ─────────────────────────────────────────────────────────
/**
 * 🔴 ★`stats` を計算して直書きしません。
 *    ★正典 §10.5「NPC 馬はプレイヤー馬と**同一の遺伝エンジン**で生成。
 *    ★**専用の簡易ロジックを作らない**（同じ土俵にいることが公正性の担保）」に正面から反します。
 *
 * ⚠️ ★**引退済みの馬は追いつかせません。**
 *    ✔ ★理由（★数えました・2026-09-20）: ★`packages/sim-engine/src/breeding.ts` の `breed()` が
 *      ★親から読むのは ★**`genotype` / 血統 / `birthYear` / `foalCount` / `g1Wins`** で、
 *      ★**`stats` を 1 度も読みません**。→ ★引退馬の `stats` は何にも効きません。
 *    ★これが違っていたら、ここの `activeOnly` を外すだけで直ります。
 */
if (!CATCH_UP) {
  console.log('');
  console.log('  ⚠️ ★--no-catch-up: ★育成の追いつきを流していません。');
  console.log('     ★4 歳の馬も創始のままの能力です（★世界としては未完成）。');
} else {
  console.log('');
  console.log('  ★育成を追いつかせます（★本番と同じ `advanceTrainingWeeks` を呼びます）');
  const tCatch = process.hrtime.bigint();
  let rounds = 0;
  let advanced = 0;
  for (;;) {
    rounds += 1;
    if (rounds > 400) throw new Error('seed-world: 400 回 呼んでも追いつきません（上限）');
    let r;
    try {
      r = await advanceTrainingWeeks(c, nowMs, EPOCH, (m) => console.log(`    ★警報: ${m}`));
    } catch (e) {
      if (!isConnectionLost(e) || reconnects >= RECONNECT_MAX) throw e;
      reconnects += 1;
      process.stdout.write('\r                                                        \r');
      console.log(`  ⚠️ ★接続が切れました（${e.code ?? e.message}）。`
        + `★繋ぎ直して続けます ${reconnects}/${RECONNECT_MAX}`);
      console.log('     ⚠️ ★この周の分は数え直せません（★追いつきは取引を張らず、'
        + '★済んだ分を DB に残します）→ ★**②b は判定不能**になります');
      try { await c.end(); } catch { /* ★既に切れています */ }
      await connectDb();
      continue;
    }
    advanced += r.advanced;
    retiredDuringCatchUp += r.retired;
    if (r.advanced === 0) break;
    if (rounds % 10 === 0) {
      /**
       * 🔴 ★**旧: `min(last_processed_week - birth_week)`** は ★「いちばん遅い馬」ではなく
       *   ★**いちばん若い馬の週齢**でした（★2 歳なら 104。★追いつき済みでも 104 のまま）。
       *   → ★★進み具合を見ているつもりで、★**動かない数を見ていました。**
       *   ✅ ★見るべきは ★**基準の週に届いていない頭数**です。
       */
      const p = (await c.query(
        `select min(last_processed_week)::int mn,
                count(*) filter (where last_processed_week < $1)::int behind
           from horses where retired_at_week is null and birth_week is not null`,
        [referenceWeek],
      )).rows[0];
      process.stdout.write(`\r    ${rounds} 回目 … まだ届いていない馬 ${p.behind} 頭`
        + `（いちばん遅い週 ${p.mn} / 基準 ${referenceWeek}）   `);
    }
  }
  const sec = Number(process.hrtime.bigint() - tCatch) / 1e9;
  process.stdout.write('\r                                                        \r');
  console.log(`  ★${rounds} 回で追いつきました`
    + `（延べ ${advanced.toLocaleString()} 頭週 / 引退 ${retiredDuringCatchUp} 頭 / ${sec.toFixed(0)}秒）`);
}

// ─────────────────────────────────────────────────────────
// ★確かめる
// ─────────────────────────────────────────────────────────
const chk = await c.query(`select count(*)::int total,
  count(*) filter (where sire_id is not null)::int with_sire,
  count(distinct sire_line)::int lines,
  count(*) filter (where retired_at_week is null)::int active,
  count(*) filter (where retirement_reason = 'age')::int aged_retired,
  count(*) filter (where birth_week is null)::int no_birth_week,
  count(distinct birth_week) filter (where retired_at_week is null)::int active_birth_weeks
  from horses`);
console.log('  DB:', JSON.stringify(chk.rows[0]));
/**
 * ★**実現率を、★正典が記録した量で出します**（★2026-09-20・★`AU-21`: 同じもので測ったか）。
 *
 *   ★D-053 註記が記録した production の値 ★**0.3149** は
 *   ★**`mean(stats ÷ potential)`・★能力値 1 つ 1 票**（★n=36,775 能力値）です。
 *   🔴 ★馬ごとの平均でも、★集団の和の比でもありません（★育った後は 0.005 ずれます）。
 *   🔴 ★そして ★**`unlock_rate` 列は育成では書き換わりません**（★遺伝の定数）。
 *   → ★★**次に測る人が別の量を測らないように、★ここで出しておきます。**
 * ⚠️ ★これは ★**合否ではありません**（★予言 3 は向きだけを見る・★`AU-7'`）。
 */
const realized = async (where) => (await c.query(
  `select round(avg(r)::numeric, 4) mean, count(*)::int n
     from (select (s.value::numeric / nullif(p.value::numeric, 0)) r
             from horses h,
                  lateral jsonb_each_text(h.stats) s,
                  lateral jsonb_each_text(h.potential) p
            where s.key = p.key and ${where}) t`,
)).rows[0];
const rAll = await realized('true');
const rActive = await realized('h.retired_at_week is null');
console.log(`  ★実現率 mean(stats/potential)（★能力値ごと）:`
  + ` 全馬 ${rAll.mean}（n=${rAll.n}） / 現役 ${rActive.mean}（n=${rActive.n}）`);
console.log('     ⚠️ ★比べる相手は production の 0.3149（★同じ量・★全馬の取り方）。'
  + '★`unlock_rate` 列ではありません');

const fails = [];
/**
 * 🔴 ★**判定できなかった検査を、★合格の側に落とさない**（★CK-14・`counted-verdict` と同じ語彙）。
 *   ⚠️ ★世界を作るのは一発勝負なので、★**1 件でも判定できなければ終了コード 2**にします。
 */
const undecided = [];
const check = (ok, label, detail) => {
  console.log(`  ${ok ? '✓' : '★'} ${label}${detail ? `  ${detail}` : ''}`);
  if (!ok) fails.push(label);
};
const undecide = (label, why) => {
  console.log(`  ？ ${label}  ★判定不能: ${why}`);
  undecided.push(label);
};
const d = chk.rows[0];
check(d.no_birth_week === 0, '① ★`birth_week` が無い馬が 0 頭（★PROD-NEVER-AGED）',
  `${d.no_birth_week} 頭`);
/**
 * 🔴 ★**②a — ★投入が「引退」を書いたか**（★`SEED-NOT-RETIRED` の本体・2026-09-20）。
 *
 *   ★旧い ② は ★**頭数だけ**を見ていました。★しかし頭数は、
 *   ★`現役 ＝ 総数 − 引退` なので ★**DB から引き直すと恒真になります**（★何も言っていない）。
 *   ✔ ★中身が在るのはこちら: ★**投入時に引退と書いた頭数が、★そのまま残っているか**。
 *     ★元の不具合（★引退 4,970 頭が「現役」になっていた）なら、★ここが 0 になります。
 *   ⚠️ ★追いつきの最中に**寿命で**引退する馬が出ると、ここが増えて落ちます。
 *     ★実測ではまだ 0 件（★落ちるのは `career_ending_injury` だけ）。★落ちたら中身を見ること。
 */
const seededRetired = rows.length - tally.active;
check(d.aged_retired === seededRetired,
  '②a ★投入時に「引退」と書いた馬が、★DB でもそのまま引退（★SEED-NOT-RETIRED）',
  `reason=age ${d.aged_retired} 頭 / 期待 ${seededRetired} 頭`);
/**
 * 🔴 ★**②b — ★追いつきが返した数と、★DB を突き合わせる**（★2026-09-20・★演習 3 回目で直した）。
 *
 *   ★演習 3 回目、★作り直しは通ったのに ★**この検査だけが落ちました**（★DB 2,388 / 期待 2,400）。
 *   ✔ ★差の 12 頭は ★**追いつきの最中に致命的故障で引退した馬**でした。
 *     ★種牡馬 200 → **206** ／ 繁殖牝馬 800 → **806** — ★`retirement.ts` が役割を付けています。
 *   → ★★**壊れていたのは世界ではなく、★私の検査でした。**
 *   ⚠️ ★**引退が 0 でないと落ちる検査は、★引退が動いていることを罰します**（★`CK-14` の裏）。
 *
 * 【🔴 ★右辺 2,400 の出どころ — ★ここが独立性の全てです】
 *   ★`tally.active` は ★**プリシード世界（純関数 `runPreseed`）を数えた値**で、
 *   ★**DB からは 1 度も引いていません**（★`lifeColumns()` の戻り値を投入前に数えるだけ）。
 *   🔴 ★もし右辺も DB から引いたら、★`現役 ＋ 引退 ＝ 総数` は ★**恒真**になります
 *     （★旧い ② がまさにそれでした）。★**ここを DB に替えないこと。**
 *
 * 【★これだけが「独立した 2 つ目の目」です】
 *   ★左辺は DB、★右辺は ★**追いつきの戻り値**。★別の経路で数えているから意味があります。
 *   🔴 ★だから ★**接続が切れた後は判定できません** — ★落ちた周に済んだ分は DB に残り、
 *     ★戻り値には入らないからです（★追いつきは取引を張りません）。
 */
if (!CATCH_UP) {
  undecide('②b ★追いつきが返した引退の数と、★DB が合う',
    '★--no-catch-up（★追いつきを流していないので、★突き合わせるものがありません）');
} else if (reconnects > 0) {
  undecide('②b ★追いつきが返した引退の数と、★DB が合う',
    `★接続が ${reconnects} 回 切れました（★落ちた周に済んだ分は戻り値に入っていません）`);
} else {
  check(d.active + retiredDuringCatchUp === tally.active,
    '②b ★現役 ＋ 追いつき中の引退 が、★プリシード世界の現役と一致',
    `DB ${d.active} ＋ 引退 ${retiredDuringCatchUp} ＝ ${d.active + retiredDuringCatchUp}`
      + ` / プリシード ${tally.active}`);
}
check(d.active_birth_weeks >= 100, '③ ★現役の `birth_week` が散っている（★SEED-LOCKSTEP）',
  `${d.active_birth_weeks} 種類`);

await c.end();
console.log('');
/**
 * ★**この世界が、どう作られたか**を残します（★2026-09-20）。
 * 🔴 ★とくに ★**名前が検査されたか**。★後から「この世界は未検査だった」と読めるように。
 * ⚠️ ★DB の列にしたいところですが、★本番は移行が 33 件 未適用なので ★**移行を足しません**。
 *    ★ファイルに残します（★移行が追いついたら列へ移すこと）。
 */
{
  const { mkdirSync, writeFileSync } = await import('node:fs');
  mkdirSync('evidence/world-build', { recursive: true });
  const stamp = new Date(nowMs).toISOString().replace(/[:.]/g, '-');
  const path = `evidence/world-build/${stamp}.json`;
  writeFileSync(path, `${JSON.stringify({
    builtAtIso: new Date(nowMs).toISOString(),
    seed: SEED,
    generations: GENERATIONS,
    referenceWeek,
    inserted: n,
    tally,
    catchUp: CATCH_UP,
    /** 🔴 ★接続が切れて繋ぎ直した回数（★0 でなければ ②b は判定不能） */
    reconnects,
    /** 🔴 ★**落ちた検査と、★判定できなかった検査**（★合格の側に落とさない） */
    checksFailed: fails,
    checksUndecided: undecided,
    /** 🔴 ★名前が検査されたか（★0 件 かつ allowAll なら**未検査**） */
    nameBlocklistSize: ngSize,
    nameCheckSkipped: ALLOW_ALL,
    /** 🔴 ★**消す前の数**（★行は消すが、★記録は残す・`STABLE-1-SKEW` と同じ作法） */
    wipedCounts,
    wipedRaces: WIPE_RACES,
  }, null, 2)}
`, 'utf8');
  console.log(`  ★世界の素性を残しました: ${path}`);
  if (ALLOW_ALL) console.log('  🔴 ★**nameCheckSkipped: true** — ★この世界の名前は未検査です');
}

if (fails.length > 0) {
  console.log(`★FAIL — ${fails.join(' / ')}`);
  process.exit(VERDICT.FAIL);
}
if (undecided.length > 0) {
  console.log(`★判定不能 — ${undecided.join(' / ')}`);
  console.log('   ⚠️ ★**これは「合格」ではありません。** ★世界は建っている可能性が高いですが、');
  console.log('   ★確かめきれていません。★緑が要るなら、★もう一度 作り直してください。');
  process.exit(VERDICT.UNDECIDABLE);
}
console.log(`★世界を作りました（★全体 ${((Date.now() - t0) / 1000).toFixed(0)}秒）`);
process.exit(VERDICT.PASS);
