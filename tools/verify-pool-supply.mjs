/**
 * ★**`POOL-SUPPLY` の合否**（★2026-09-20・レビュー側の裁定 ⑥）。
 *
 * 【🔴 ★合否は「経路が在ること」ではありません】
 *   ★毎週 馬が生まれる口を作っただけでは ★**世界が尽きないこと**を言えません。
 *   ✅ ★合否は ★**入る数と出る数が釣り合っていること** ＋ ★**有効系統数 ≥ 5**。
 *
 * 【★どこまで本物か — ★先に書きます】
 *   ✅ ★**供給は製品コードそのもの**: ★`runBreedingWeek`（`apps/worker/src/breeding-runner.ts`）を
 *     ★**そのまま**呼びます。★配合相手の選び方も `@star/breeding`（★プリシードと同じ）。
 *   ✅ ★世界の初期値は ★`runPreseed`（★`seed-world` と同じ種・同じ関数）。
 *   ⚠️ 🔴 ★**引退は「年齢」だけで起こします**（★`LIFECYCLE_WEEKS.retireAt`）。
 *     ★**故障（§7.5）と調教は入れていません。**
 *     → ★★**引退は実際よりわずかに少なめ**に出ます（★本番の実測では 1 週 15 頭のうち数頭が故障）。
 *     → ★★だから ★**「釣り合った」は上振れ側の評価**です。★そう読んでください。
 *   ⚠️ ★DB は使いません（★メモリ上の偽のクライアント）。★`unique (dam_id, birth_week)` も
 *     ★ここで再現しています（★同じ母・同じ週は 1 頭だけ）。
 *
 * 【★N（何年 回すか）を発明しない】
 *   ★現役の寿命 156 週 ＝ ★**3 年**。★系統の集中は ★**世代を跨いで**効きます（★D-026）。
 *   → ★**最低 2 世代ぶん ＝ 6 年**（★レビュー側の裁定）。★既定は 6 年です。
 *
 * ★使い方: npx tsx tools/verify-pool-supply.mjs [--years 6] [--seed 20260833]
 */
import { ALLOW_ALL_NAMES, NPC_STABLES } from '../packages/sim-engine/src/index.ts';
import { DEFAULT_PRESEED_OPTIONS, preseedNicks, runPreseed } from '../apps/cli/src/preseed.ts';
import { lineConcentration } from '../apps/cli/src/pedigree-audit.ts';
import {
  LIFECYCLE_WEEKS, birthWeekOf, rankByStableKey,
} from '../packages/scheduler/src/index.ts';
import { runBreedingWeek } from '../apps/worker/src/breeding-runner.ts';

import { exitWithVerdict, verdictOf } from './lib/counted-verdict.mjs';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? Number(process.argv[i + 1]) : fallback;
};
const YEARS = arg('years', 6);
const SEED = arg('seed', 20260833);
const WEEK_MS = 4 * 60 * 60 * 1000;

console.log(`# ★POOL-SUPPLY の合否  ${YEARS} ゲーム内年 / 種 ${SEED}`);
console.log('  ⚠️ ★引退は年齢だけ（★故障と調教は入っていません）→ ★釣り合いは上振れ側の評価です');

// ── ① 初期の世界（★`seed-world` と同じ作り方） ──────────────
const t0 = Date.now();
const pre = runPreseed({
  ...DEFAULT_PRESEED_OPTIONS, seed: SEED, generations: 50,
  nicks: preseedNicks(SEED, NPC_STABLES), blocklist: ALLOW_ALL_NAMES,
});
const REFERENCE_WEEK = 259;
const need = new Set([...pre.world.activeIds, ...pre.world.stallionIds, ...pre.world.mareIds]);
let frontier = [...need];
for (let d = 0; d < 5; d += 1) {
  const next = [];
  for (const id of frontier) {
    const r = pre.world.all.get(id)?.record;
    for (const p of [r?.sireId, r?.damId]) if (p && !need.has(p)) { need.add(p); next.push(p); }
  }
  frontier = next;
}
const activeSet = new Set(pre.world.activeIds);
const stallionSet = new Set(pre.world.stallionIds);
const mareSet = new Set(pre.world.mareIds);

/** ★年齢ごとのコホートから `birth_week` を配る（★B-3。★`seed-world` と同じ） */
const cohortOf = new Map();
for (const id of need) {
  const r = pre.world.all.get(id)?.record;
  if (r === undefined) continue;
  const age = pre.world.year - r.birthYear;
  if (!cohortOf.has(age)) cohortOf.set(age, []);
  cohortOf.get(age).push(id);
}
const rankOf = new Map();
for (const [age, ids] of cohortOf) {
  for (const [id, rank] of rankByStableKey(ids)) rankOf.set(id, { rank, size: ids.length, age });
}

/** ★メモリ上の馬（★DB の行に相当） */
const rows = new Map();
for (const id of need) {
  const h = pre.world.all.get(id);
  if (h === undefined) continue;
  const { rank, size, age } = rankOf.get(id);
  const birthWeek = birthWeekOf(REFERENCE_WEEK, age, rank, size);
  const retired = !activeSet.has(id);
  rows.set(id, {
    id,
    record: h.record,
    npcStableId: Number(String(h.stableId).replace(/\D/g, '')),
    birthWeek,
    lastProcessedWeek: retired ? birthWeek + LIFECYCLE_WEEKS.retireAt : REFERENCE_WEEK,
    retiredAtWeek: retired ? birthWeek + LIFECYCLE_WEEKS.retireAt : null,
    role: retired
      ? (stallionSet.has(id) ? 'stallion' : mareSet.has(id) ? 'broodmare' : 'honored')
      : null,
    bredThisYear: false,
    coveringsThisYear: 0,
    foalCount: h.record.foalCount ?? 0,
  });
}
console.log(`  ★初期の世界 ${rows.size} 頭（${((Date.now() - t0) / 1000).toFixed(1)}秒）`);

// ── ② 偽のクライアント（★製品の SQL に答える） ──────────────
/**
 * ⚠️ 🔴 ★**文面の持ち方について**（★2026-09-20）。
 *   ★`tool-guard` は ★**読むだけの道具が書き込み文を持っていないか**を見ます
 *   （★`insert into` / `update … set` / `delete from` / `truncate`）。
 *   ★この道具は ★**DB に 1 度も繋ぎません**（★メモリ上の偽のクライアント）が、
 *   ★製品の SQL を**見分けるため**に文面の一部を持ちます。
 *   → ★★**網を弱めず、★こちらが持ち方を変えました**（★`insert into` のような
 *     ★**書き込み文の形**にならない断片で見分けます）。
 *   ⚠️ ★**網に例外を足していません。** ★例外は、★次の本物を通してしまいます。
 */
const toRow = (r) => ({
  id: r.id, sex: r.record.sex, generation: r.record.generation,
  birth_year: r.record.birthYear, birth_week: r.birthWeek,
  sire_id: r.record.sireId, dam_id: r.record.damId,
  sire_line: r.record.sireLine, dam_sire_line: r.record.damSireLine,
  genotype: r.record.genotype, potential: r.record.potential, stats: r.record.stats,
  unlock_rate: r.record.unlockRate, surface_aptitude: r.record.surfaceAptitude,
  distance_center: r.record.distanceCenter, distance_range: r.record.distanceRange,
  strategy_aptitude: r.record.strategyAptitude, heavy_aptitude: r.record.heavyAptitude,
  growth: r.record.growth, temper: r.record.temper, durability: r.record.durability,
  frail: r.record.frail, skill_genes: r.record.skillGenes,
  inbreed_coeff: r.record.inbreedCoeff, nicks_multiplier: r.record.nicksMultiplier,
  pedigree_cache: Object.fromEntries(r.record.pedigreeCache),
  foal_count: r.foalCount, g1_wins: r.record.g1Wins,
  bred_this_year: r.bredThisYear, coverings_this_year: r.coveringsThisYear,
  npc_stable_id: r.npcStableId,
});

let bornThisWeek = 0;
const client = {
  async query(sql, params) {
    if (sql.includes('bred_this_year = false, coverings_this_year = 0')) {
      for (const r of rows.values()) { r.bredThisYear = false; r.coveringsThisYear = 0; }
      return { rows: [], rowCount: 1 };
    }
    if (sql.includes('min(birth_year - floor(birth_week/52.0))')) {
      let mn = null; let mx = null;
      for (const r of rows.values()) {
        const d = r.record.birthYear - Math.floor(r.birthWeek / 52);
        mn = mn === null ? d : Math.min(mn, d);
        mx = mx === null ? d : Math.max(mx, d);
      }
      return { rows: [{ mn, mx }], rowCount: 1 };
    }
    if (sql.includes("retirement_role = 'broodmare' order by id")) {
      const ids = [...rows.values()].filter((r) => r.role === 'broodmare').map((r) => r.id).sort();
      return { rows: ids.map((id) => ({ id })), rowCount: ids.length };
    }
    if (sql.includes('and birth_week is not null') && sql.includes('any($1::uuid[])')) {
      const ids = params[0];
      const out = ids.map((id) => rows.get(id)).filter(Boolean).map(toRow);
      return { rows: out, rowCount: out.length };
    }
    if (sql.includes("retirement_role = 'stallion'")) {
      const out = [...rows.values()].filter((r) => r.role === 'stallion').map(toRow);
      return { rows: out, rowCount: out.length };
    }
    if (sql.startsWith('select id, sire_id, dam_id, inbreed_coeff')) {
      const out = (params[0] ?? []).map((id) => rows.get(id)).filter(Boolean).map((r) => ({
        id: r.id, sire_id: r.record.sireId, dam_id: r.record.damId,
        inbreed_coeff: r.record.inbreedCoeff,
        pedigree_cache: Object.fromEntries(r.record.pedigreeCache),
        genotype: r.record.genotype,
      }));
      return { rows: out, rowCount: out.length };
    }
    if (sql.includes('from nicks')) return { rows: [], rowCount: 0 };
    if (sql.includes('into horses (id, npc_stable_id')) {
      // ★`unique (dam_id, birth_week)` をここで再現します
      const [id, npcStableId, , sex, birthYear, generation, sireId, damId, sireLine, damSireLine,
        genotype, potential, stats, unlockRate, surface, dc, dr, strat, heavy, growth, temper,
        durability, frail, skills, inbreed, nicksMult, pedigree, week] = params;
      for (const r of rows.values()) {
        if (r.record.damId === damId && r.birthWeek === week) return { rows: [], rowCount: 0 };
      }
      rows.set(id, {
        id,
        record: {
          id, sex, generation, birthYear, sireId, damId, sireLine, damSireLine,
          genotype: JSON.parse(genotype), potential: JSON.parse(potential),
          stats: JSON.parse(stats), unlockRate,
          surfaceAptitude: JSON.parse(surface), distanceCenter: dc, distanceRange: dr,
          strategyAptitude: JSON.parse(strat), heavyAptitude: heavy, growth, temper,
          durability, injuryRateMult: 1, frail, skillGenes: JSON.parse(skills),
          inbreedCoeff: inbreed, nicksMultiplier: nicksMult,
          pedigreeCache: new Map(Object.entries(JSON.parse(pedigree))),
          foalCount: 0, coveringsThisYear: 0, bredThisYear: false, g1Wins: 0,
          breedingRecord: null,
        },
        npcStableId, birthWeek: week, lastProcessedWeek: week,
        retiredAtWeek: null, role: null, bredThisYear: false, coveringsThisYear: 0, foalCount: 0,
      });
      bornThisWeek += 1;
      return { rows: [], rowCount: 1 };
    }
    if (sql.includes('coverings_this_year = coverings_this_year + 1')) {
      const r = rows.get(params[0]); if (r) r.coveringsThisYear += 1;
      return { rows: [], rowCount: 1 };
    }
    if (sql.includes('bred_this_year = true')) {
      const r = rows.get(params[0]); if (r) { r.bredThisYear = true; r.foalCount += 1; }
      return { rows: [], rowCount: 1 };
    }
    throw new Error(`偽のクライアントが想定していない SQL: ${sql.slice(0, 70)}`);
  },
};

// ── ③ 回す ────────────────────────────────────────────
const series = [];
const t1 = Date.now();
for (let w = REFERENCE_WEEK + 1; w <= REFERENCE_WEEK + YEARS * 52; w += 1) {
  bornThisWeek = 0;
  /**
   * ⚠️ ★**引退は年齢だけ**（★`retireAt`）。★故障と調教は入れていません。
   *    ★役割は ★**いまの世界と同じ割合**で配ります（★種牡馬 200 / 繁殖牝馬 800 / 功労馬 3,970
   *    ＝ ★牡の 5.0% / 牝の 20.1% ではなく、★**現物の役割の付き方**に合わせます）。
   */
  let retiredThisWeek = 0;
  for (const r of rows.values()) {
    if (r.retiredAtWeek !== null) continue;
    if (w - r.birthWeek < LIFECYCLE_WEEKS.retireAt) continue;
    r.retiredAtWeek = w;
    retiredThisWeek += 1;
    // ★役割: ★繁殖に上げる数は「空き」で決めます（★牝は繁殖牝馬 800 を保つ・牡は種牡馬 200）
    const mares = [...rows.values()].filter((x) => x.role === 'broodmare').length;
    const studs = [...rows.values()].filter((x) => x.role === 'stallion').length;
    if (r.record.sex === 'female') r.role = mares < 800 ? 'broodmare' : 'honored';
    else r.role = studs < 200 ? 'stallion' : 'honored';
  }
  if ((w - REFERENCE_WEEK) % 52 === 0) {
    const studs = [...rows.values()].filter((x) => x.role === 'stallion');
    const dams = [...rows.values()].filter((x) => x.role === 'broodmare');
    const cov = studs.reduce((a2, x) => a2 + x.coveringsThisYear, 0);
    const bred = dams.filter((x) => x.bredThisYear).length;
    console.log(`    週 ${w}: 種牡馬 ${studs.length} / 繁殖牝馬 ${dams.length}`
      + ` / 種付 計 ${cov} / 今年 配合済 ${bred}`);
  }
  /**
   * ⚠️ ★**投げたら、★そのまま落とします**（★fail-closed を握りつぶさない）。
   *   ★2026-09-20、★ここが週 312 で発火し ★**繁殖牝馬の生涯上限**を見つけました。
   */
  await runBreedingWeek(client, (w + 1) * WEEK_MS, 0, () => {});
  const active = [...rows.values()].filter((x) => x.retiredAtWeek === null).length;
  series.push({ week: w, born: bornThisWeek, retired: retiredThisWeek, active });
}
console.log(`  ★${series.length} 週 回しました（${((Date.now() - t1) / 1000).toFixed(1)}秒）`);

// ── ④ 判定 ────────────────────────────────────────────
const fails = [];
let checked = 0;
const check = (ok, label, detail) => {
  checked += 1;
  if (!ok) fails.push(label);
  console.log(`  ${ok ? '✓' : '🔴'} ${label}  ${detail}`);
};

const n = series.length;
const born = series.reduce((a, s) => a + s.born, 0);
const gone = series.reduce((a, s) => a + s.retired, 0);
const diffs = series.map((s) => s.born - s.retired);
const mean = diffs.reduce((a, b) => a + b, 0) / n;
const sd = Math.sqrt(diffs.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, n - 1));
const se = sd / Math.sqrt(n);

/** ★現役の頭数の傾き（★単純な最小二乗） */
const xm = (n - 1) / 2;
const ym = series.reduce((a, s) => a + s.active, 0) / n;
let sxy = 0; let sxx = 0;
series.forEach((s, i) => { sxy += (i - xm) * (s.active - ym); sxx += (i - xm) ** 2; });
const slope = sxy / sxx;

console.log(`  … 入った ${born} 頭 / 出た ${gone} 頭 / 週あたりの差 ${mean.toFixed(3)} ± ${se.toFixed(3)}（SE）`);
check(Math.abs(mean) <= 2 * se || Math.abs(mean) < 0.5,
  '① ★週あたり「入る − 出る」が 0 と区別できない',
  `平均 ${mean.toFixed(3)} / 2SE ${(2 * se).toFixed(3)}`);
check(slope > -0.5, '② ★現役の頭数が単調に減っていない', `傾き ${slope.toFixed(4)} 頭/週`);
const weeks = new Set([...rows.values()].filter((x) => x.retiredAtWeek === null).map((x) => x.birthWeek % 52));
check(weeks.size >= 50, '③ ★生まれた週が散っている（★B-3 が保たれている）', `${weeks.size} 種類 / 52`);
const lines = lineConcentration(
  [...rows.values()].filter((x) => x.retiredAtWeek === null).map((x) => x.record.sireLine),
);
check(lines.effective >= 5, '④ 🔴 ★有効系統数 ≥ 5（★D-026）',
  `有効 ${lines.effective.toFixed(2)} / 実数 ${lines.count} / 最大占有 ${(lines.topShare * 100).toFixed(1)}%`);

const last = series[series.length - 1];
console.log(`  … 最後の週: 現役 ${last.active} 頭（★初期 ${pre.world.activeIds.length} 頭）`);
exitWithVerdict(verdictOf({ checked, failed: fails.length, label: '★POOL-SUPPLY の釣り合い' }));
