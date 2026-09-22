/**
 * ★**D-121 ③ — 利用者の血統の伸びを測る**（★裁定 `REVIEW_D121_MEASURE_TOOL_VERDICT_20260923.md`）。
 *
 *   ★分類: **READONLY**（★取引を `read only` で張ります。★DB に書きません。★結果は日付つきのファイルにだけ残します）
 *
 * ============================================================================
 * 【★何を出すか】（★数だけ・★利用者の ID と馬名は出さない・★画面には出さない＝D-114・D-116）
 *   ① ★物差し: ★いまの NPC 現役の素質の合計（★人数 n・分位点）
 *   ② ★利用者の繁殖牝馬の素質の合計の % 点（★M-1）
 *   ③ ★自家で生産した仔の、★利用者ごとの最良の % 点の分布（★(b) 高さ）と ★母系の世代ごとの推移
 *   ④ ★参考の列 (a): ★直近 K 世代が それまでの最良 ＋ 幅 を上回らなかった利用者の数（★合否の判定にしない・★判定できない人数も出す）
 *   ⑤ ★近交係数の平均と虚弱の割合（★M-3）
 *   ★比べる目安: 模擬の N0.5 は 60〜70% 点で平ら・O は 85〜90% 点（★`REPORT_Q2_LINEAGE_SIM_20260922.md`・★EP の制約を外した上限）
 *
 * 【★残すもの】（★M-4）
 *   ★`evidence/d121/<日付>-<接続先>.json` に ★その日の物差し（★NPC 現役の素質の合計・昇順）と結果。★ID と馬名は書かない。
 *   🔴 ★**このファイルを画面や外部（利用者・SNS・外部の対話 AI など）に出さない**。★素質の数値そのものなので、★画面に出さない決め（D-114・D-116）と同じ扱い（★裁定 §4）。
 *
 * 【★使い方】
 *   npx tsx tools/measure-lineage-plateau.mjs --env staging [--generations 2] [--width 0]
 *   npx tsx tools/measure-lineage-plateau.mjs --env production              # ★本番の読み取り（★オーナーが流す）
 * ============================================================================
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import pg from 'pg';

import { loadEnv } from './lib/env.mjs';
import { percentileOf, potentialSum, quantile, summarizeUsers } from './lib/lineage-measure.mjs';

const argValue = (name) => { const i = process.argv.indexOf(name); return i < 0 ? null : (process.argv[i + 1] ?? null); };
const numArg = (name, d) => { const v = argValue(name); const n = v === null ? d : Number(v); return Number.isFinite(n) ? n : d; };
/** ★参考の列 (a) の数（★発明した数・★出力の先頭に印刷する・裁定 §1） */
const K = numArg('--generations', 2);
const WIDTH = numArg('--width', 0);
const OUT_DIR = argValue('--out-dir') ?? 'evidence/d121';

const env = loadEnv();
const c = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
const q = async (s, p) => (await c.query(s, p)).rows;

await c.query('begin read only');
let report;
try {
  const dbEnv = (await q('select environment from app_environment'))[0]?.environment ?? 'unknown';
  const date = (await q("select to_char(now() at time zone 'Asia/Tokyo', 'YYYY-MM-DD') d"))[0].d;
  const ref = (await q(
    'select potential from horses where owner_id is null and retired_at_week is null and birth_week is not null',
  )).map((r) => potentialSum(r.potential)).sort((a, b) => a - b);
  const mares = (await q(
    "select potential from horses where owner_id is not null and retirement_role = 'broodmare'",
  )).map((r) => percentileOf(ref, potentialSum(r.potential)));
  const hasDrafts = (await q("select to_regclass('public.foal_drafts')::text t"))[0].t !== null;
  const bred = hasDrafts ? (await q(
    'select h.id::text id, d.user_id::text user_id, h.dam_id::text dam_id, h.potential, h.inbreed_coeff, h.frail'
      + ' from foal_drafts d join horses h on h.id = d.named_horse_id',
  )).map((r) => ({
    id: r.id, userId: r.user_id, damId: r.dam_id, sum: potentialSum(r.potential),
    inbreed: Number(r.inbreed_coeff ?? 0), frail: r.frail === true,
  })) : [];
  const users = summarizeUsers(bred, ref, { k: K, width: WIDTH });
  const maxGen = users.reduce((m, u) => Math.max(m, u.bestByGen.length), 0);
  const byGen = [];
  for (let g = 1; g <= maxGen; g += 1) {
    const vals = users.filter((u) => u.bestByGen.length >= g).map((u) => u.bestByGen[g - 1]);
    byGen.push({ generation: g, users: vals.length, p50: quantile(vals, 50), p90: quantile(vals, 90) });
  }
  const bests = users.map((u) => u.best);
  const count = (s) => users.filter((u) => u.plateau === s).length;
  report = {
    date, environment: dbEnv,
    params: { generations: K, width: WIDTH, note: '★(a) の数は発明した数。★合否の判定にしない（裁定 §1）' },
    simulationTargets: { source: 'REPORT_Q2_LINEAGE_SIM_20260922.md', N05: '60〜70% 点で平ら', O: '85〜90% 点', note: '★EP の制約を外した上限' },
    ruler: { n: ref.length, p10: quantile(ref, 10), p50: quantile(ref, 50), p90: quantile(ref, 90), sortedSums: ref },
    broodmares: { n: mares.length, p10: quantile(mares, 10), p50: quantile(mares, 50), p90: quantile(mares, 90) },
    bredUsers: {
      n: users.length, horses: bred.length,
      best: { p10: quantile(bests, 10), p50: quantile(bests, 50), p90: quantile(bests, 90) },
      byGeneration: byGen,
      referenceA: { plateau: count('plateau'), rising: count('rising'), undecidable: count('undecidable') },
      inbreedMean: users.length === 0 ? null : users.reduce((a, u) => a + u.inbreedMean, 0) / users.length,
      frailShare: bred.length === 0 ? null : bred.filter((h) => h.frail).length / bred.length,
    },
  };
} finally {
  await c.query('rollback');
  await c.end();
}

const f = (v, d = 1) => (v === null || v === undefined ? '—' : Number(v).toFixed(d));
console.log(`# D-121 ③ 利用者の血統の伸び（★読むだけ・★数だけ）  ${report.date}  接続先の申告: ${report.environment}`);
console.log(`  ★参考の列 (a) の数: 直近 ${K} 世代が それまでの最良 ＋ ${WIDTH} を上回らない（★発明した数・★判定に使わない）`);
console.log(`  ★比べる目安（模擬・EP の制約なし）: N0.5 は 60〜70% 点で平ら / O は 85〜90% 点（${report.simulationTargets.source}）`);
console.log(`  ① 物差し（NPC 現役の素質の合計）: n ${report.ruler.n} / 10% ${f(report.ruler.p10, 0)} / 50% ${f(report.ruler.p50, 0)} / 90% ${f(report.ruler.p90, 0)}`);
console.log(`  ② 利用者の繁殖牝馬: n ${report.broodmares.n} / % 点 10% ${f(report.broodmares.p10)} / 50% ${f(report.broodmares.p50)} / 90% ${f(report.broodmares.p90)}`);
const b = report.bredUsers;
console.log(`  ③ 自家で生産した利用者: n ${b.n}（${b.horses} 頭）/ 最良の % 点 10% ${f(b.best.p10)} / 50% ${f(b.best.p50)} / 90% ${f(b.best.p90)}`);
for (const g of b.byGeneration) console.log(`     世代 ${g.generation}: 利用者 ${g.users} / 最良の % 点 50% ${f(g.p50)} / 90% ${f(g.p90)}`);
console.log(`  ④ 参考 (a): 平ら ${b.referenceA.plateau} / 伸びている ${b.referenceA.rising} / ★判定できない ${b.referenceA.undecidable}（★世代が ${K + 1} に満たない）`);
console.log(`  ⑤ 近交係数の平均 ${f(b.inbreedMean, 3)} / 虚弱の割合 ${b.frailShare === null ? '—' : `${f(b.frailShare * 100)}%`}`);

mkdirSync(OUT_DIR, { recursive: true });
const out = `${OUT_DIR}/${report.date}-${report.environment}.json`;
writeFileSync(out, `${JSON.stringify(report, null, 1)}\n`, 'utf8');
console.log(`  ★物差しと結果を残しました: ${out}（★ID と馬名は書いていません）`);
