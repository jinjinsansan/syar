/**
 * ★B-3: V-11 の構造報告（PP の発行量と各シンクの比）— 読むだけ・判定を出さない
 *
 * 正典 §13.2 V-11: 「ポイント純発行量/日 が **ゼロ近傍〜微減**」
 * 正典 §11.4:「★PP の総残高は『いつか景品に換わりうる量』である。
 *              発行量だけでなく**残高の推移**を見ること」
 *
 * 【★指示書の条件】
 *   > V-11 の構造報告（PP 発行量と各シンクの比。**外部流入はパラメータ**）
 *
 *   → **外部流入（EP をいくら配るか）と交換性向（プレイヤーが PP をどれだけ使うか）は
 *     こちらで値を決めません。** 構造だけを出し、実測できるものは実測します。
 *
 * 【★このツールは本番に向けてよい】
 *   `select` しかしません。むしろ**本番の実データでないと意味がありません**
 *   （合成ベッターが動いているのは本番だけです）。
 *
 * 実行: npx tsx tools/diag-v11.mjs            # 本番（既定）
 *       npx tsx tools/diag-v11.mjs --env staging
 */
import pg from 'pg';
import { MARGIN, TICKET_KINDS } from '../packages/betting/src/index.ts';
import { PRIZE_TABLE } from '../apps/worker/src/prize-award.ts';
import { loadEnv } from './lib/env.mjs';

const env = loadEnv();
const c = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

const n = (v) => (v === null || v === undefined ? 0 : Number(v));
const jp = (v) => Math.round(v).toLocaleString();

console.log('# B-3: V-11 の構造報告（PP の発行と吸収）');
console.log('');

// ───────────────────────────────────────────────────────────
// ① 構造: PP が増える経路と減る経路を**全件**列挙する
// ───────────────────────────────────────────────────────────
console.log('## ① PP が動く経路（★DB の制約で閉じているか）');
const cons = await c.query(
  `select pg_get_constraintdef(oid) as def from pg_constraint
    where conrelid = 'pp_ledger'::regclass and conname like '%reason%'`,
);
console.log(`  pp_ledger の reason 制約: ${cons.rows[0]?.def ?? '★ありません'}`);
console.log('');
console.log('  | 理由 | 向き | どこで | 何に比例するか |');
console.log('  |---|---|---|---|');
console.log("  | `prize`          | ＋発行 | `prize-award.ts`  | §11.1 の賞金表 × レース数 × プレイヤー所有馬の割合 |");
console.log("  | `payout`         | ＋発行 | `payout.ts`       | (1 − margin) × 馬券の売上（EP） |");
console.log("  | `prize_exchange` | −吸収 | `0008` の RPC     | ★プレイヤーの交換性向（パラメータ） |");
console.log('');
console.log('  ★**PP→EP の還流は存在しません**（憲法②・S-5）。制約が `reason` を3つに閉じています。');
console.log('  ★したがって **PP の出口は景品交換だけ**です。');
console.log('');

// ★実装が制約どおりか（コードに4つ目の経路が生えていないか）を DB 側から確認する
const used = await c.query('select distinct reason from pp_ledger order by 1');
console.log(`  実際に使われている理由: ${used.rows.map((r) => r.reason).join(', ') || '（まだ無し）'}`);
console.log('');

// ───────────────────────────────────────────────────────────
// ② 恒等式
// ───────────────────────────────────────────────────────────
console.log('## ② 純発行量の恒等式');
console.log('');
console.log('```');
console.log('  純発行量/日 = payout + prize − exchanged');
console.log('              = (1 − margin) × B  +  P  −  X');
console.log('');
console.log('    B = その日の馬券売上（EP）');
console.log('    P = その日の賞金発行（§11.1 の表。★馬券の売上とは無関係に発行される）');
console.log('    X = その日の景品交換（★プレイヤーの行動 = パラメータ）');
console.log('```');
console.log('');
console.log('  ★**P は EP の焼却を伴いません。** 賞金は §11.1 の表から**新規に発行**されます。');
console.log('    payout は EP を焼いた見返りですが、prize は対価なしの発行です。');
console.log('    → **PP が構造的に増えるのは prize のぶん**で、V-11 はここを X が受け止められるかを見ています。');
console.log('');
console.log(`  margin（§9.4 の写し）: ${TICKET_KINDS.map((k) => `${k} ${(MARGIN[k] * 100).toFixed(0)}%`).join(' / ')}`);
const tiers = Object.keys(PRIZE_TABLE);
console.log(`  §11.1 の賞金表: ${tiers.length} 階級（1着 ${jp(PRIZE_TABLE[tiers[tiers.length - 1]]?.[0] ?? 0)} 〜 ${jp(PRIZE_TABLE[tiers[0]]?.[0] ?? 0)} PP）`);
console.log('');

// ───────────────────────────────────────────────────────────
// ③ 実測
// ───────────────────────────────────────────────────────────
console.log('## ③ 実測（この DB の全期間）');
const flow = await c.query(
  `select l.reason, coalesce(u.account_type, '不明') as kind,
          sum(l.delta)::text as total, count(*)::int as rows
     from pp_ledger l left join users u on u.id = l.user_id
    group by 1, 2 order by 1, 2`,
);
if (flow.rowCount === 0) {
  console.log('  ★pp_ledger が空です。この DB では実測できません');
} else {
  console.log(`  ${'理由'.padEnd(16)} ${'口座'.padEnd(10)} ${'合計 PP'.padStart(14)} ${'行数'.padStart(8)}`);
  for (const r of flow.rows) {
    console.log(`  ${r.reason.padEnd(16)} ${r.kind.padEnd(10)} ${jp(n(r.total)).padStart(14)} ${String(r.rows).padStart(8)}`);
  }
}
console.log('');

const agg = await c.query(
  `select
     coalesce(sum(delta) filter (where reason = 'prize'), 0)::text as prize,
     coalesce(sum(delta) filter (where reason = 'payout'), 0)::text as payout,
     coalesce(-sum(delta) filter (where reason = 'prize_exchange'), 0)::text as exchanged
   from pp_ledger`,
);
const a = agg.rows[0];
const prize = n(a.prize), payout = n(a.payout), exchanged = n(a.exchanged);
const issued = prize + payout;
const net = issued - exchanged;

const bets = await c.query(
  `select coalesce(sum(amount), 0)::text as staked,
          coalesce(sum(payout), 0)::text as paid,
          count(*)::int as rows
     from bets where status <> 'refunded'`,
);
const b = bets.rows[0];
const staked = n(b.staked), paid = n(b.paid);

console.log('## ④ 各シンクの比');
if (issued === 0) {
  console.log('  ★PP がまだ1点も発行されていません。比は出せません');
} else {
  console.log(`  発行 合計          ${jp(issued).padStart(14)} PP`);
  console.log(`    うち prize       ${jp(prize).padStart(14)} PP  （${((prize / issued) * 100).toFixed(1)}%）★対価なしの発行`);
  console.log(`    うち payout      ${jp(payout).padStart(14)} PP  （${((payout / issued) * 100).toFixed(1)}%）`);
  console.log(`  吸収（景品交換）    ${jp(exchanged).padStart(14)} PP  （発行の ${((exchanged / issued) * 100).toFixed(1)}%）`);
  console.log(`  ★純発行量          ${jp(net).padStart(14)} PP  ${net > 0 ? '（増えている）' : net < 0 ? '（減っている）' : '（ゼロ）'}`);
  console.log('');
  console.log(`  馬券: 売上 ${jp(staked)} EP / 払戻 ${jp(paid)} PP / ${b.rows} 枚`);
  if (staked > 0) {
    console.log(`    実効の控除率（1 − 払戻÷売上）: ${(((staked - paid) / staked) * 100).toFixed(2)}%`);
    console.log(`    ★§9.4 の設計値は ${TICKET_KINDS.map((k) => `${(MARGIN[k] * 100).toFixed(0)}%`).join('/')}。乖離が大きいなら固定オッズのリスクが出ています`);
  }
}
console.log('');

// ───────────────────────────────────────────────────────────
// ⑤ 残高（§11.4: 将来の景品債務）
// ───────────────────────────────────────────────────────────
console.log('## ⑤ PP 残高（§11.4「将来の景品債務」）');
const bal = await c.query(
  `select coalesce(u.account_type, '不明') as kind, count(*)::int as users,
          coalesce(sum(u.prize_points), 0)::text as pp
     from users u group by 1 order by 1`,
);
for (const r of bal.rows) {
  console.log(`  ${r.kind.padEnd(10)} ${String(r.users).padStart(6)} 人  残高 ${jp(n(r.pp)).padStart(14)} PP`);
}
console.log('  ★残高は「いつか景品に換わりうる量」です。発行量だけでなくこの推移を見ます（§11.4）');
console.log('');

// ───────────────────────────────────────────────────────────
// ⑥ 日次の記録
// ───────────────────────────────────────────────────────────
console.log('## ⑥ point_flow_daily（§4.6 の毎日の記録）');
const daily = await c.query(
  `select date, ep_inflow, ep_burned, pp_issued, pp_exchanged, margin_actual,
          pp_issued_internal, pp_exchanged_internal
     from point_flow_daily order by date desc limit 7`,
);
if (daily.rowCount === 0) {
  console.log('  ★1日ぶんも記録がありません。V-11 は「毎日確認する」ゲートなので、記録が無ければ判定できません');
} else {
  console.log(`  ${'日付'.padEnd(12)} ${'EP流入'.padStart(12)} ${'EP焼却'.padStart(12)} ${'PP発行'.padStart(12)} ${'PP交換'.padStart(12)} ${'純発行'.padStart(12)}`);
  for (const r of daily.rows) {
    const netDay = n(r.pp_issued) - n(r.pp_exchanged);
    console.log(
      `  ${String(r.date).slice(0, 10).padEnd(12)} ${jp(n(r.ep_inflow)).padStart(12)} ${jp(n(r.ep_burned)).padStart(12)} ` +
      `${jp(n(r.pp_issued)).padStart(12)} ${jp(n(r.pp_exchanged)).padStart(12)} ${jp(netDay).padStart(12)}`,
    );
  }
}
console.log('');

// ───────────────────────────────────────────────────────────
// ⑦ ★V-11 が「機構が止まっているから通る」状態になっていないか
//
//   これは V-12a（上限のみ → F≒0 が最大余裕）や
//   V-15①（下限のみ → 比率1.0 が最大余裕）と**同じ型**です。
//   ★純発行量は「発行も交換も 0」のとき**必ず 0** になり、V-11 は自動的に通ります。
// ───────────────────────────────────────────────────────────
console.log('## ⑦ ★V-11 が「機構が止まっているから通る」状態になっていないか');
const live = await c.query(
  `select
     (select count(*) from users)::int as users,
     (select count(*) from bets)::int as bets,
     (select count(*) from pp_ledger)::int as pp_rows,
     (select count(*) from races where status = 'settled')::int as settled,
     (select count(*) from horses where owner_id is not null)::int as player_horses`,
);
const L = live.rows[0];
console.log(`  利用者 ${L.users} 人 / 馬券 ${L.bets} 枚 / PP 台帳 ${L.pp_rows} 行 / 確定済みレース ${L.settled} / プレイヤー所有馬 ${L.player_horses} 頭`);
if (L.pp_rows === 0) {
  console.log('');
  console.log('  ★**経済が動いていません。** PP が1点も発行されていないので、');
  console.log('    純発行量は毎日 0 になり、**V-11 は自動的に満たされます。**');
  console.log('    ★これは「合格」ではありません。**測定対象が存在しない**状態です（R-21）。');
  if (L.settled > 0 && L.player_horses === 0) {
    console.log(`    原因: レースは ${L.settled} 件確定していますが、**プレイヤー所有の馬が 0 頭**です。`);
    console.log('          prize-award.ts は NPC 馬（owner_id が null）には払わないので、賞金が発行されません。');
  }
  if (L.users === 0) {
    console.log('    原因: **利用者が 0 人**です。馬券が買われないので payout も発行されません。');
  }
  console.log('');
  console.log('  → **V-11 には「機構が動いていること」の条件が要ります。**');
  console.log('    V-15 に②（低下 15%以上）を足したのと同じ形です。');
} else {
  console.log('  ★PP が動いています。V-11 は実測で判定できます');
}
console.log('');

// ───────────────────────────────────────────────────────────
// ⑧ ★値を発明しないもの
// ───────────────────────────────────────────────────────────
console.log('## ⑧ ★こちらで値を決めないもの（指示書の条件）');
console.log('  1. **EP の外部流入量**（1日あたり何 EP を無償で配るか）');
console.log('     → B（馬券売上）の上限を決め、payout の発行量を決めます');
console.log('  2. **プレイヤーの交換性向**（配布された PP のうち何割が景品に換わるか）');
console.log('     → X を決めます。V-11 が満たせるかは**ここだけ**に懸かっています');
console.log('  3. **1日のレース数 × プレイヤー所有馬の割合**');
console.log('     → P（対価なしの発行）を決めます');
console.log('');
console.log('  ★V-11（純発行量がゼロ近傍〜微減）は、**X ≥ (1−margin)·B + P** のときだけ成立します。');
console.log('    P は対価なしの発行なので、**交換性向が低いと必ず純発行量は正になります**。');
console.log('    → これは実装の不足ではなく、**3つのパラメータの関係**です。裁定を仰ぎます。');

await c.end();
