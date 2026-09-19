/**
 * ★**`STABLE-1-SKEW` の原因を、★消さずに探す**（★読むだけ・2026-09-19）
 *
 * 【★何を確かめるか】
 *   ★簿（`STABLE-1-SKEW`）: ★NPC 厩舎 1 が他より **95 頭 多い（7.9 SD）**。★**原因 未特定**。
 *   ★簿には ★**「直さないこと — 原因が分かる前に動かすと跡が消えます」**と書いてあります。
 *   → ★**この道具は 1 行も書きません。★`select` だけです。**
 *
 * 【🔴 ★試す見立て（★数が出る前に書く・**MD-6**）】
 *   ★`tools/verify-prize.mjs` の後片付けの 1 行が、★`npc_stable_id` に
 *   ★**1 を決め打ち**して書き戻しています（★`535db6e`・2026-08-08 から）。
 *   （⚠️ ★その SQL をここに写すと、★READONLY の裏取りが**書き込み文**と見なすので写しません）
 *   ★しかもこの道具は ★**出走表の「最終枠を除く全頭」**をプレイヤー所有にします
 *   （★`66e0dae`・2026-08-11 から）。★1 回あたり ★**17 頭 前後**です。
 *
 *   → ★**1 回 流すたびに、★17 頭が いろいろな厩舎から 厩舎 1 へ 一方向に移る。**
 *   ⚠️ ★`verify-g6` の見立てが取り下げられたのは「★1 回 1 頭・★毎回 同じ馬（`order by id limit 1`）
 *     ★だから何回 流しても +1」だったからです。★**こちらは 1 回 17 頭で、★毎回 違う出走表**です。
 *
 * 【🔴 ★予想（★大きさも出す・**MD-7**）】
 *   ★もしこれが原因なら:
 *     ★**①（いちばん鋭い）** ★厩舎 1 の馬を「どのレースに出ていたか」で束ねると、
 *        ★**1 レースから 17 頭 前後 来ている山**がいくつか見えるはずです。
 *        ★ふつうのレースが 1 つの厩舎に寄せる数は ★**18 頭 ÷ 40 厩舎 ≈ 0.45 頭**です。
 *        → ★**17 と 0.45 は 38 倍 違います。★見えるか見えないかで決まります。**
 *     ★② ★95 ÷ 17 ≈ **5.6 回**。★山の数はその程度のはずです。
 *     ★③ ★出走表は `loadRaceablePool`（`order by id limit 3000`）から作られるので、
 *        ★厩舎 1 の余りは ★**id の若い側に偏る**はずです。
 *
 *   ⚠️ ★**外れ方も先に書きます**: ★①の山が**無く**、★厩舎 1 の余りが
 *     ★**一度も出走していない馬**に多いなら、★**この見立ては外れ**です。
 *     ★そのときは「原因を書かない」（★簿の指示）に戻します。
 *
 * 【⚠️ ★この道具が見ないもの】
 *   ★`verify-prize` が ★**何回 流されたか**の記録は どこにもありません。
 *   → ★**跡から数えるしかありません。** ★それがこの道具です。
 *   ⚠️ ★`race_entries` が消えているレースの分は ★**数えられません**（★下限になります）。
 *
 * 実行: npx tsx tools/diag-stable1-skew.mjs --env staging
 */
import pg from 'pg';
import { loadEnv } from './lib/env.mjs';

const env = loadEnv();
const c = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

/**
 * ⚠️ ★`assertNotProduction` は**呼びません** — ★これは読むだけの道具で、★R-24 の対象外です。
 *   ★代わりに ★**どこに繋いだかを必ず出します**（★`loadEnv` が `--env` を必須にしています）。
 */
const where = (await c.query(`select current_database() as db, (select environment from app_environment limit 1) as env`))
  .rows[0] ?? { db: '?', env: '?' };
console.log(`# STABLE-1-SKEW の跡を読む（★読むだけ）`);
console.log(`  接続先: db=${where.db} / app_environment=${where.env}`);
console.log('');

const q = async (sql, params = []) => (await c.query(sql, params)).rows;

// ── ① 厩舎ごとの頭数（★簿の 277 / 184.25 を再現できるか＝対照） ──────────
const stables = await q(`
  select npc_stable_id as stable, count(*)::int as n
    from horses
   where npc_stable_id is not null and retired_at_week is null
   group by 1 order by 2 desc`);
const total = stables.reduce((s, r) => s + r.n, 0);
const mean = total / stables.length;
const others = stables.filter((r) => String(r.stable) !== '1');
const othersMean = others.reduce((s, r) => s + r.n, 0) / others.length;
const sd = Math.sqrt(others.reduce((s, r) => s + (r.n - othersMean) ** 2, 0) / others.length);
const one = stables.find((r) => String(r.stable) === '1');
console.log('【① 対照: 厩舎ごとの頭数（★簿と同じ絵が出るか）】');
console.log(`  合計 ${total} 頭 / ${stables.length} 厩舎（平均 ${mean.toFixed(2)}）`);
console.log(`  厩舎 1 = ${one?.n ?? '(無し)'} / 他 ${others.length} 厩舎の平均 ${othersMean.toFixed(1)}・SD ${sd.toFixed(1)}`);
console.log(`  → ${one ? ((one.n - othersMean) / sd).toFixed(1) : '?'} SD`);
console.log(`  上位 5: ${stables.slice(0, 5).map((r) => `${r.stable}:${r.n}`).join(' ')}`);
console.log('');

// ── ② 🔴 いちばん鋭い: 1 レースから何頭が厩舎 1 に居るか ──────────────
/**
 * 🔴 ★**ふつうは 18 ÷ 40 ≈ 0.45 頭。★verify-prize のレースなら 17 頭。**
 * ⚠️ ★対照として ★**厩舎 2 と 3** も同じ形で出します
 *   （★`CN-15`: ★受け取りやすさのために対称を作るのではなく、★同じ物差しを当てるため）。
 */
console.log('【② 🔴 1 レースあたり、その厩舎の馬が何頭 出ていたか（★上位 8）】');
for (const st of ['1', '2', '3']) {
  const rows = await q(`
    select re.race_id::text as race_id, count(*)::int as n
      from race_entries re join horses h on h.id = re.horse_id
     where h.npc_stable_id = $1
     group by 1 order by 2 desc limit 8`, [Number(st)]);
  const max = rows[0]?.n ?? 0;
  console.log(`  厩舎 ${st}: ${rows.map((r) => r.n).join(' ')} … 最大 ${max}`);
  if (st === '1') {
    const big = rows.filter((r) => r.n >= 10);
    console.log(`    → ★10 頭 以上のレース: ${big.length} 本${big.length > 0 ? `（${big.map((r) => `${r.race_id.slice(0, 8)}=${r.n}`).join(' ')}）` : ''}`);
  }
}
console.log('');

// ── ③ 全体の分布（★「17 の山」が厩舎 1 だけの話か） ────────────────
console.log('【③ 対照: どの厩舎でも「1 レースに多数」は起きるか】');
const anyBig = await q(`
  select h.npc_stable_id as stable, count(*)::int as n, re.race_id::text as race_id
    from race_entries re join horses h on h.id = re.horse_id
   where h.npc_stable_id is not null
   group by h.npc_stable_id, re.race_id
  having count(*) >= 8
   order by n desc limit 15`);
console.log(`  ★8 頭 以上 同じレースに出ていた（厩舎, 頭数）: ${anyBig.length === 0 ? '(1 件も無い)' : anyBig.map((r) => `${r.stable}:${r.n}`).join(' ')}`);
console.log('');

// ── ④ 厩舎 1 の余りは「走った馬」に偏るか ─────────────────────────
console.log('【④ 出走したことがある馬の割合（★ポンプなら厩舎 1 が高いはず）】');
const raced = await q(`
  select h.npc_stable_id as stable,
         count(*)::int as n,
         count(*) filter (where exists (select 1 from race_entries re where re.horse_id = h.id))::int as raced
    from horses h
   where h.npc_stable_id is not null and h.retired_at_week is null
   group by 1 order by 1`);
const r1 = raced.find((r) => String(r.stable) === '1');
const rOthers = raced.filter((r) => String(r.stable) !== '1');
const pctOthers = rOthers.reduce((s, r) => s + r.raced, 0) / rOthers.reduce((s, r) => s + r.n, 0);
console.log(`  厩舎 1: ${r1?.raced}/${r1?.n} = ${r1 ? ((r1.raced / r1.n) * 100).toFixed(1) : '?'}%`);
console.log(`  他の厩舎 まとめて: ${(pctOthers * 100).toFixed(1)}%`);
console.log('');

// ── ⑤ id の若い側に偏るか（★プールは order by id limit 3000） ──────────
console.log('【⑤ id の若い 3,000 頭（★出走表が読む範囲）に、どれだけ入っているか】');
const prefix = await q(`
  with pool as (
    select id from horses
     where retired_at_week is null and owner_id is null
     order by id limit 3000
  )
  select h.npc_stable_id as stable, count(*)::int as n,
         count(*) filter (where h.id in (select id from pool))::int as in_pool
    from horses h
   where h.npc_stable_id is not null and h.retired_at_week is null
   group by 1 order by 1`);
const p1 = prefix.find((r) => String(r.stable) === '1');
const pOthers = prefix.filter((r) => String(r.stable) !== '1');
const poolOthersMean = pOthers.reduce((s, r) => s + r.in_pool, 0) / pOthers.length;
console.log(`  厩舎 1: ${p1?.in_pool}/${p1?.n} 頭が範囲内`);
console.log(`  他の厩舎の平均: ${poolOthersMean.toFixed(1)} 頭`);
console.log(`  → 差 ${p1 ? (p1.in_pool - poolOthersMean).toFixed(1) : '?'} 頭`);

// ── ⑥ 🔴 決め手: その山のレースは「出走頭数 − 1」ちょうどか ──────────
/**
 * 🔴 ★`verify-prize` は ★**最終枠を除く全頭**を取ります。
 *   → ★その山のレースでは ★**厩舎 1 の頭数 ＝ 出走頭数 − 1** に ★**ちょうど**なるはずです。
 *   ⚠️ ★「多い」だけなら偶然もありえます。★**`−1` ちょうど**は、★偶然では出ません。
 *   ⚠️ ★ただし ★**引退した馬は今の `horses` から外れる**ので、★`−1` より小さく出ることがあります
 *     （★`retired_at_week is null` を掛けていないので、★ここでは引退込みで数えます）。
 */
console.log('');
console.log('【⑥ 🔴 決め手: 山のレースで「厩舎 1 の頭数」対「出走頭数」】');
const clusters = await q(`
  select re.race_id::text as race_id,
         count(*) filter (where h.npc_stable_id = 1)::int as in1,
         count(*)::int as field,
         max(r.status) as status
    from race_entries re
    join horses h on h.id = re.horse_id
    join races r on r.id = re.race_id
   group by re.race_id
  having count(*) filter (where h.npc_stable_id = 1) >= 5
   order by in1 desc`);
for (const r of clusters) {
  const mark = r.in1 === r.field - 1 ? '🔴 ちょうど −1' : `差 ${r.field - r.in1}`;
  console.log(`  ${r.race_id.slice(0, 8)}  厩舎1 ${String(r.in1).padStart(2)} / 出走 ${r.field}  [${r.status}]  ${mark}`);
}
const exact = clusters.filter((r) => r.in1 === r.field - 1).length;
console.log(`  → ★「ちょうど −1」: ${exact} / ${clusters.length} 本`);
console.log(`  → ★山が説明する頭数（★5 頭 以上のレースの合計）: ${clusters.reduce((s, r) => s + r.in1, 0)} 頭`);

// ⚠️ ★対照: ★同じ形を他の厩舎でも数える（★「厩舎 1 だけ」を言うために）
const otherExact = await q(`
  select count(*)::int as n from (
    select re.race_id, h.npc_stable_id as st,
           count(*)::int as inst, (select count(*) from race_entries x where x.race_id = re.race_id)::int as field
      from race_entries re join horses h on h.id = re.horse_id
     where h.npc_stable_id is not null and h.npc_stable_id <> 1
     group by re.race_id, h.npc_stable_id
  ) t where t.inst = t.field - 1`);
console.log(`  ⚠️ 対照: ★厩舎 1 以外で「ちょうど −1」になったレース: ${otherExact[0].n} 本`);

// ── ⑦ 🔴 引き算できる形に揃える（★**CN-14**: 同じ標本の大きさか先に見る） ──
/**
 * 🔴 ★①の「余り 92 頭」は ★**現役だけ**（`retired_at_week is null`）を数えています。
 *   ★⑥の「69 頭」は ★**引退込み**です。★**そのまま引けません。**
 *   → ★ここで ★**「①と同じ網」で、★山のレースに出ていた馬**を数え直します。
 */
console.log('');
console.log('【⑦ 🔴 ①と同じ網で数え直す（★引き算できる形に）】');
const attributable = await q(`
  select count(distinct h.id)::int as n
    from horses h
    join race_entries re on re.horse_id = h.id
   where h.npc_stable_id = 1
     and h.retired_at_week is null
     and re.race_id in (
       select re2.race_id from race_entries re2 join horses h2 on h2.id = re2.horse_id
        where h2.npc_stable_id = 1
        group by re2.race_id
       having count(*) >= 5
     )`);
const excess = one && othersMean ? one.n - othersMean : null;
console.log(`  ★現役で、★山のレースに出ていた 厩舎 1 の馬: ${attributable[0].n} 頭`);
console.log(`  ★①の余り（273 − 他の平均）: ${excess === null ? '?' : excess.toFixed(1)} 頭`);
console.log(`  → ★説明できる割合: ${excess ? ((attributable[0].n / excess) * 100).toFixed(0) : '?'}%`);
console.log('  ⚠️ ★残りは説明していません（★`race_entries` が消えたレース／★別の経路／★偶然の上振れ）。');

// ── ⑧ `--dump-ids`: ★当たった馬の id を出す（★記録のため） ──────────────
/**
 * 🔴 ★**レビュー側の裁定（2026-09-19・`04feada`）**: ★staging の 66 頭は ★**直しません**。
 *   ★そのかわり ★**今日時点の id と、★それを引く問い合わせの両方**を `evidence/` に残します。
 *   ★**id だけだと引退で古くなり、★問い合わせだけだと今日の姿が消える。★両方。**
 *
 * ⚠️ ★問い合わせを ★**この道具の中**に置くのが要点です — ★`evidence/` の txt に写すと、
 *   ★コードが変わっても txt は変わらず、★**どちらが本当か分からなくなります**。
 */
if (process.argv.includes('--dump-ids')) {
  const ids = await q(`
    select h.id::text as id, h.name, h.birth_week
      from horses h
     where h.npc_stable_id = 1 and h.retired_at_week is null
       and exists (
         select 1 from race_entries re
          where re.horse_id = h.id
            and re.race_id in (
              select re2.race_id from race_entries re2 join horses h2 on h2.id = re2.horse_id
               where h2.npc_stable_id = 1 group by re2.race_id having count(*) >= 5))
     order by h.id`);
  console.log('');
  console.log(`【⑧ 当たった馬の id（${ids.length} 頭・★${new Date().toISOString().slice(0, 10)} 時点）】`);
  console.log('id\tname\tbirth_week');
  for (const r of ids) console.log(`${r.id}\t${r.name}\t${r.birth_week}`);
}

await c.end();
console.log('');
console.log('⚠️ ★この道具は 1 行も書いていません（★`select` のみ）。★判定は書きません — ★数だけ出します。');
