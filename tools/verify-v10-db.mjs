/**
 * ★V-10 を「ワーカー＋DB の経路」で測る（読むだけ・判定を出す）
 *
 * レビュー側の指定（REVIEW_P3_Q32_VERDICT）:
 *   > 3. **V-10 を「ワーカー＋DB の経路」で測る** — 本番が作ったオッズと
 *   >    本番が出した着順で払戻率を出す。**3が本体です。**
 *   > 現在の V-10 の PASS は verify-payout の中だけの話で、
 *   > **本番の払戻率は誰も測っていません。**
 *
 * 【★既存の V-10 と何が違うか】
 *   `verify-pmin.ts` は1レースにつきオッズを1回作り、**同じ条件で確定を何度も引いて**
 *   分散を下げています。それは「実装が正しいか」を見るのに適した測り方です。
 *
 *   こちらは **DB に入っているオッズ**と、**ワーカーが出した着順**だけを使います。
 *   1レースにつき確定は**1回しかありません**（実際にそう走ったので）。
 *   ★したがって**分散がはるかに大きく、必要なレース数も桁違い**です。
 *   そこを誤魔化さないよう、**SE と必要レース数を必ず出します**（R-20）。
 *
 * 【★払戻率の定義（`verify-pmin.ts` と同じ）】
 *   1レース・1券種について「**売られている全通りに1点ずつ買う**」。
 *     stake  = 売られている買い目の数
 *     payout = 当たった買い目のオッズ（売られていなければ 0）
 *     率     = payout / stake
 *   これをレースで平均すると 1 − margin に近づくはずです（§9.4）。
 *
 * 実行: npx tsx tools/verify-v10-db.mjs --env staging
 */
import pg from 'pg';
import { MARGIN, TICKET_KINDS, placeDepth } from '../packages/betting/src/index.ts';
import { winningKeys } from '../apps/worker/src/odds.ts';
import { loadEnv } from './lib/env.mjs';

const env = loadEnv();
const c = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

/** ★`verify-pmin.ts` と**同じ**鍵の作り方（違うと全件不一致になる） */
const keyOfSelection = (sel, kind) =>
  kind === 'exacta' || kind === 'trifecta'
    ? sel.join('>')
    : [...sel].sort((a, b) => a - b).join('-');

const races = (await c.query(
  `select id, cycle_index from races where status = 'settled' order by cycle_index`,
)).rows;

console.log('# V-10 をワーカー＋DB の経路で測る');
console.log('  ★本番が作ったオッズ（race_odds）と、本番が出した着順（race_entries）だけを使います');
console.log('');
if (races.length === 0) {
  console.error('★確定済みのレースがありません。点検できません（R-21: 実行できていない）');
  await c.end();
  process.exit(2);
}

const stat = new Map(TICKET_KINDS.map((k) => [k, { rates: [], unsoldHits: 0, stake: 0, payout: 0 }]));
let usable = 0;
let skipped = 0;

for (const r of races) {
  const ents = (await c.query(
    'select gate, finish_pos from race_entries where race_id = $1 order by finish_pos', [r.id],
  )).rows;
  // ★着順が入っていないレースは飛ばす。★飛ばした数を必ず出す
  if (ents.length === 0 || ents.some((e) => e.finish_pos === null)) { skipped += 1; continue; }
  const order = ents.map((e) => Number(e.gate));
  const depth = placeDepth(order.length);

  const odds = (await c.query(
    'select bet_type, selection, odds from race_odds where race_id = $1', [r.id],
  )).rows;
  if (odds.length === 0) { skipped += 1; continue; }

  const table = new Map(TICKET_KINDS.map((k) => [k, new Map()]));
  for (const o of odds) {
    table.get(o.bet_type)?.set(keyOfSelection(o.selection, o.bet_type), Number(o.odds));
  }

  let any = false;
  for (const kind of TICKET_KINDS) {
    const t = table.get(kind);
    if (t === undefined || t.size === 0) continue;
    any = true;
    const s = stat.get(kind);
    let payout = 0;
    for (const key of winningKeys(kind, order, depth)) {
      const o = t.get(key);
      if (o === undefined) s.unsoldHits += 1; // ★売っていない目が当たった（D-035 の下限）
      else payout += o;
    }
    s.stake += t.size;
    s.payout += payout;
    s.rates.push(payout / t.size);
  }
  if (any) usable += 1; else skipped += 1;
}

console.log(`  確定済み ${races.length} 本 / 測れた ${usable} 本 / 飛ばした ${skipped} 本`);
console.log('  ★飛ばしたのは「着順が無い」「オッズが無い」レースです（黙って除いていません）');
console.log('');

const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const sd = (a) => {
  if (a.length < 2) return NaN;
  const m = mean(a);
  return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / (a.length - 1));
};

/**
 * ── ★分散ゼロで測れる量: オッズ表そのものが正しい控除率を含んでいるか ──
 *
 * 【なぜこれが要るか】
 *   上の「実現払戻率」は **1レース＝1回の確定**なので分散が桁違いに大きく、
 *   ±1% を判定するには数百万レースが要ります（下に出します）。
 *   ★それは**この経路では原理的に測れない**ということです。
 *
 *   一方 `race_odds` には確率とオッズが**両方**入っています。
 *   §9.4 の設計では `odds = (1 − margin) / p` なので、
 *   **`p × odds` は買い目ごとに `1 − margin` になるはず**です。
 *   → **確定を1回も引かずに**、オッズ表が正しい控除率を含むか測れます。
 *
 *   ★上限に当たった目（`capped`）は `odds` が切り詰められているので下振れします。
 *     D-013 の凸性補正のぶんも下振れします（`odds` は補正後の確率で作られている）。
 *     どちらも**設計どおり**なので、内訳を分けて出します。
 */
console.log('## ★オッズ表が含む控除率（分散ゼロ・確定を引かない）');
const implied = new Map(TICKET_KINDS.map((k) => [k, { sum: 0, n: 0, cappedSum: 0, cappedN: 0 }]));
for (const r of races) {
  const rows2 = (await c.query(
    'select bet_type, probability, odds, capped from race_odds where race_id = $1', [r.id])).rows;
  for (const o of rows2) {
    const t = implied.get(o.bet_type);
    if (t === undefined) continue;
    const v = Number(o.probability) * Number(o.odds);
    if (o.capped) { t.cappedSum += v; t.cappedN += 1; } else { t.sum += v; t.n += 1; }
  }
}
console.log(`  ${'券種'.padEnd(16)} ${'p×odds（上限外）'.padStart(16)} ${'目標'.padStart(7)} ${'差'.padStart(9)} ${'上限に当たった目'.padStart(20)}`);
for (const kind of TICKET_KINDS) {
  const t = implied.get(kind);
  const target = 1 - MARGIN[kind];
  if (t.n === 0 && t.cappedN === 0) { console.log(`  ${kind.padEnd(16)} ★売り目が無い`); continue; }
  const m = t.n > 0 ? t.sum / t.n : NaN;
  const cm = t.cappedN > 0 ? t.cappedSum / t.cappedN : NaN;
  console.log(
    `  ${kind.padEnd(16)} ${(m * 100).toFixed(3).padStart(15)}% ${(target * 100).toFixed(0).padStart(6)}% ` +
    `${((m - target) * 100).toFixed(3).padStart(8)}pt ` +
    `${(t.cappedN > 0 ? `${t.cappedN}目 平均 ${(cm * 100).toFixed(1)}%` : 'なし').padStart(20)}`,
  );
}
console.log('  ★上限外の目で `p×odds` が `1−margin` から離れていれば、**オッズ表そのものが壊れています**。');
console.log('    ★確定を引かないので、レース数が少なくても判定できます。');
console.log('');
console.log('## 実現払戻率（1レース＝1回の確定）');

console.log(`  ${'券種'.padEnd(16)} ${'払戻率'.padStart(9)} ${'目標'.padStart(8)} ${'差'.padStart(8)} ${'SE'.padStart(8)} ${'判定'.padStart(6)}`);
const fails = [];
const needed = [];
for (const kind of TICKET_KINDS) {
  const s = stat.get(kind);
  if (s.rates.length === 0) {
    console.log(`  ${kind.padEnd(16)} ★測れていません（売り目が1つもない）`);
    fails.push(`${kind}: 測れていない`);
    continue;
  }
  const rate = s.stake === 0 ? NaN : s.payout / s.stake;
  const target = 1 - MARGIN[kind];
  const dev = (rate - target) * 100;
  const se = sd(s.rates) / Math.sqrt(s.rates.length) * 100;
  // ★±1%（正典 §13.2 の V-10）
  const pass = Math.abs(dev) <= 1;
  if (!pass) fails.push(`${kind}: ${dev.toFixed(2)}pt`);
  // ★3 SE の精度で ±1% を判定するのに要るレース数
  const n1 = Number.isFinite(se) && se > 0
    ? Math.ceil(s.rates.length * ((3 * se) / 1) ** 2) : NaN;
  needed.push({ kind, n: n1 });
  console.log(
    `  ${kind.padEnd(16)} ${(rate * 100).toFixed(2).padStart(8)}% ${(target * 100).toFixed(0).padStart(7)}% ` +
    `${dev.toFixed(2).padStart(7)}pt ${se.toFixed(2).padStart(7)}pt ${(pass ? 'PASS' : 'FAIL').padStart(6)}`,
  );
}

console.log('');
console.log('  【★この測定で「判定できる」だけの精度があるか（R-20）】');
for (const { kind, n } of needed) {
  const s = stat.get(kind);
  console.log(`    ${kind.padEnd(16)} いま ${String(s.rates.length).padStart(4)} 本 / ±1% を 3 SE で判定するには ${Number.isFinite(n) ? `${n.toLocaleString()} 本` : '—'}`);
}
const short = needed.filter((x) => Number.isFinite(x.n) && x.n > usable);
if (short.length > 0) {
  console.log('');
  console.log(`  ★${short.length} 券種は**本数が足りず、判定できていません**。`);
  console.log('    ★「差が ±1% に入っている」ことは、いまの本数では偶然と区別できません（R-20）。');
}

const unsold = TICKET_KINDS.filter((k) => stat.get(k).unsoldHits > 0);
if (unsold.length > 0) {
  console.log('');
  console.log(`  【D-035】売っていない目が当たった回数: ${unsold.map((k) => `${k} ${stat.get(k).unsoldHits}`).join(' / ')}`);
  console.log('    ★これは想定内です（p_min 未満の目は発売しない）。払戻 0 として率に含めています。');
}

await c.end();
console.log('');
if (short.length > 0) {
  console.log('★V-10（本番経路）: 判定不能 — 本数が足りません。合否を出しません');
  process.exit(2);
}
console.log(fails.length === 0
  ? '★V-10（本番経路）: PASS — 全券種が ±1% 以内'
  : `★V-10（本番経路）: FAIL — ${fails.join(' / ')}`);
process.exit(fails.length === 0 ? 0 : 1);
