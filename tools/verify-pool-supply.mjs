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
 * 【🔴 ★設計書の合否欄（`REPORT_POOL_SUPPLY_DESIGN_20260920.md` ⑥）との対応】
 *   ⚠️ ★**2 つ 言い換えています。★黙って変えません。**
 *
 *   ★設計 ① 現役の頭数が単調に減らない
 *     → ★道具 ② ★**導出した必要数を下回らない**に変えました。
 *       ✔ ★理由（実測）: ★種の世界は現役 2,400 で、★導出値は 2,028。
 *         ★世界は ★**2,028 へ正しく縮みます**。★「減らない」を的にすると、
 *         ★★**正しい収束を不合格と読みます**（★実際 2 回 そう報告しました）。
 *   ★設計 ② 週あたり 入る − 出る が 0 から 2SE 以内
 *     → ★道具 ① ★**「入る」を「出走年齢に達した数」**に変えました。
 *       ✔ ★理由: ★生まれてから走れるまで 2 年 あり、★**生まれた数と現役の増減は同じ週に起きません**。
 *   ★設計 ③ `birth_week` の種類が 156 → ★道具 ③（★同じ。★2026-09-21 に数え方を直しました）
 *   ★設計 ④ 有効系統数 ≥ 5 → ★道具 ④（★同じ）
 *
 * ★使い方: npx tsx tools/verify-pool-supply.mjs [--years 12] [--policy top] [--seed 20260833]
 */
import { ALLOW_ALL_NAMES, NPC_STABLES } from '../packages/sim-engine/src/index.ts';
import { DEFAULT_PRESEED_OPTIONS, preseedNicks, runPreseed } from '../apps/cli/src/preseed.ts';
import { lineConcentration } from '../apps/cli/src/pedigree-audit.ts';
import {
  LIFECYCLE_WEEKS, birthWeekOf, rankByStableKey, requiredActivePool, requiredBroodmares,
} from '../packages/scheduler/src/index.ts';
import { runBreedingWeek } from '../apps/worker/src/breeding-runner.ts';
import { FIELD_SIZE } from '../apps/cli/src/race-field.ts';

import { createHash } from 'node:crypto';

import { exitWithVerdict, verdictOf } from './lib/counted-verdict.mjs';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? Number(process.argv[i + 1]) : fallback;
};
const YEARS = arg('years', 6);
/** ★誰を繁殖牝馬に上げるか（★裁定 ③ を測るため） */
const POLICY = (() => {
  const i = process.argv.indexOf('--policy');
  return i >= 0 ? process.argv[i + 1] : 'random';
})();
const SEED = arg('seed', 20260833);
const WEEK_MS = 4 * 60 * 60 * 1000;
/**
 * 🔴 ★**平均出走頭数**。★`FIELD_SIZE`（8〜18）から。★ここで数を決めません。
 *   ⚠️ ★私は一度 製品側に `= 12` と書き、★世界がその数へ縮んでいました
 *     （★繁殖牝馬 624・現役 1,872 へ収束）。
 */
const MEAN_FIELD = (FIELD_SIZE.MIN + FIELD_SIZE.MAX) / 2;

console.log(`# ★POOL-SUPPLY の合否  ${YEARS} ゲーム内年 / 種 ${SEED} / 上げ方 ${POLICY}`);
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
    if (sql.includes("retirement_reason = 'mare_lifetime_foals'")) {
      let n = 0;
      for (const r of rows.values()) {
        if (r.role === 'broodmare' && r.foalCount >= params[0]) { r.role = 'honored'; n += 1; }
      }
      return { rows: [], rowCount: n };
    }
    if (sql.includes("count(*)::text n from horses where retirement_role = 'broodmare'")) {
      // ★数えるのは「まだ産める牝馬」（★尽きた馬は枠に数えない）
      const n = [...rows.values()]
        .filter((r) => r.role === 'broodmare' && r.foalCount < params[0]).length;
      return { rows: [{ n: String(n) }], rowCount: 1 };
    }
    if (sql.includes("retirement_role = 'honored' and sex = 'female'")) {
      const [limit, want, salt, , curWeek, minAge] = params;
      // 🔴 ★産める年齢だけ（★引退 5 歳／繁殖 6 歳 の 1 年の空白）
      let cands = [...rows.values()].filter((r) => r.role === 'honored'
        && r.record.sex === 'female' && r.foalCount < limit
        && Math.floor((curWeek - r.birthWeek) / 52) >= minAge);
      const ability = (r) => Object.values(r.record.potential).reduce((a2, b2) => a2 + b2, 0);
      if (POLICY === 'top') cands.sort((a2, b2) => ability(b2) - ability(a2));
      else {
        // ★週から決まる並び（★`Math.random()` を呼ばない）
        const key = (r) => `${r.id}|${salt}`;
        cands.sort((a2, b2) => (key(a2) < key(b2) ? -1 : 1));
        if (POLICY === 'weighted') {
          /**
           * 🔴 ★**ここは 1 度 壊れていました**（★2026-09-20）: `… * 0` と書いてしまい、
           *   ★能力の項が消えて ★**`random` と 1 ビット同じ結果**を出していました。
           *   ✔ ★気づけたのは ★**2 通りの数が完全に一致した**からです（★対照が効いた）。
           * ★重みづけ: ★順位に能力の順位を混ぜます（★上位ほど当たりやすいが、決まらない）。
           */
          const abilityRank = new Map();
          [...cands].sort((a2, b2) => ability(b2) - ability(a2))
            .forEach((r, idx) => abilityRank.set(r.id, idx));
          const noise = new Map(cands.map((r) => [r.id,
            parseInt(createHash('sha256').update(key(r)).digest('hex').slice(0, 6), 16) % cands.length]));
          cands.sort((a2, b2) =>
            (abilityRank.get(a2.id) + noise.get(a2.id)) - (abilityRank.get(b2.id) + noise.get(b2.id)));
        }
      }
      return { rows: cands.slice(0, want).map((r) => ({ id: r.id })), rowCount: Math.min(want, cands.length) };
    }
    if (sql.includes("retirement_role = 'broodmare' where id = any")) {
      for (const id of params[0]) { const r = rows.get(id); if (r) r.role = 'broodmare'; }
      return { rows: [], rowCount: params[0].length };
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
const alertSeen = new Set();
/** ★年ごとの内訳（★「相手なし」を数えていませんでした） */
let yearNoSire = 0;
let yearDue = 0;
let yearBorn = 0;
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
    /**
     * 🔴 ★**引退した馬は、★いったん全部 `honored` にします**（★2026-09-20 に直しました）。
     *
     *   ⚠️ ★旧: ★ここで「繁殖牝馬が 800 未満なら broodmare」と ★**ハーネスが足していました**。
     *     → ★★製品（`breeding-runner`）も年の変わり目に足すので、★**二重管理**でした。
     *     ✔ ★実測でそれが出ました: ★年の途中で役割の頭数が 800 → 677 と動き、
     *       ★★「番が来た」が年 679〜799 とばらつきました（★本来は年 800 で一定のはず）。
     *   ✅ ★**繁殖牝馬の枠は、★製品だけが決めます。** ★ハーネスは引退させるだけ。
     *   ⚠️ ★種牡馬は製品が管理していないので、★ここで配ります（★200 頭を保つ）。
     */
    if (r.record.sex === 'female') r.role = 'honored';
    else {
      const studs = [...rows.values()].filter((x) => x.role === 'stallion').length;
      r.role = studs < 200 ? 'stallion' : 'honored';
    }
  }

  if ((w - REFERENCE_WEEK) % 52 === 0) {
    const studs = [...rows.values()].filter((x) => x.role === 'stallion');
    const dams = [...rows.values()].filter((x) => x.role === 'broodmare');
    const cov = studs.reduce((a2, x) => a2 + x.coveringsThisYear, 0);
    const bred = dams.filter((x) => x.bredThisYear).length;
    // ★**産める牝馬**（★役割だけでは分からない）
    const able = dams.filter((x) => x.foalCount < 8).length;
    const pool = [...rows.values()].filter((x) => x.role === 'honored'
      && x.record.sex === 'female' && x.foalCount < 8
      && Math.floor((w - x.birthWeek) / 52) >= 6).length;
    console.log(`    週 ${w}: 種牡馬 ${studs.length} / 繁殖牝馬 ${dams.length}`
      + ` / うち産める ${able} / 控え ${pool} / 今年 配合済 ${bred}`);
    console.log(`           ★この 1 年: 番が来た ${yearDue} / 生まれた ${yearBorn}`
      + ` / 相手なし ${yearNoSire}`);
    yearNoSire = 0; yearDue = 0; yearBorn = 0;
  }
  /**
   * ⚠️ ★**投げたら、★そのまま落とします**（★fail-closed を握りつぶさない）。
   *   ★2026-09-20、★ここが週 312 で発火し ★**繁殖牝馬の生涯上限**を見つけました。
   */
  /**
   * 🔴 ★**警報を握りつぶしません**（★2026-09-20・★自分で `() => {}` にしていました）。
   *   ★`breeding-runner` は「★繁殖牝馬が足りません」を `onAlert` で出します。
   *   ★★捨てていたので、★**足りていないことが 2 回の測定で見えませんでした。**
   */
  const res = await runBreedingWeek(
    client, (w + 1) * WEEK_MS, 0,
    (m) => { if (!alertSeen.has(m)) { alertSeen.add(m); console.log(`    ⚠️ ${m}`); } },
    undefined, POLICY, MEAN_FIELD,
  );
  yearNoSire += res.noSire;
  yearDue += res.eligible + res.noSire;
  yearBorn += res.born;
  /**
   * 🔴 ★**「現役」を数え直しました**（★2026-09-20・★6 年 回して気づきました）。
   *
   *   ⚠️ ★旧: ★`retiredAtWeek === null`（★引退していない馬ぜんぶ）。
   *     → ★★**生まれたばかりの 0〜1 歳が入ります。** ★出走できないのに「現役」に数えていました。
   *   ✔ ★実測でそれが出ました: ★6 年後に ★**3,748 頭**（★初期 2,400）。★毎週 +5.99 頭。
   *     ★★「増えている」のではなく、★**走れない馬を数えていた**だけでした。
   *   ✅ ★`requiredActivePool` が言う「現役」は ★**出走できる馬**です
   *     （★`raceableFrom` 104 週 以上・`retireAt` 260 週 未満）。★そちらで数えます。
   *
   * ⚠️ ★**釣り合いも数え直します**: ★入るのは「生まれた数」ではなく
   *   ★**その週に出走できる年齢になった数**（★2 年 遅れて入ってきます）。
   */
  let racing = 0;
  let debuted = 0;
  for (const x of rows.values()) {
    if (x.retiredAtWeek !== null) continue;
    const ageW = w - x.birthWeek;
    if (ageW >= LIFECYCLE_WEEKS.raceableFrom) racing += 1;
    if (ageW === LIFECYCLE_WEEKS.raceableFrom) debuted += 1;
  }
  series.push({
    week: w, born: bornThisWeek, retired: retiredThisWeek, active: racing, debuted,
  });
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

/**
 * 🔴 ★**立ち上がりの長さを、★構造から決めます**（★2026-09-20・★6 年 回して分かりました）。
 *
 * 【★6 年では足りませんでした】
 *   ✔ ★実測（★6 年・立ち上がり 2 年を捨てた場合）:
 *     ★出走年齢に達した **3,194 頭**（798/年）／★引退 **1,600 頭**（400/年）→ ★差 +7.66/週。
 *   🔴 ★これは ★**供給が多すぎる**のではありません。★**引退がまだ来ていない**だけです:
 *     ★世界の最初の馬は 3 年で引退し切ります。★**自前で生まれた仔が引退するのは**
 *     ★生まれて ★**5 年 後**（`retireAt` 260 週）。★6 年では ★**その谷しか見えません。**
 *   ✅ ★捨てる長さ ＝ ★**`retireAt`（5 年）**。★自前の仔が 1 頭も引退していない期間です。
 *   ✅ ★測る長さ ＝ ★**最低 1 回の現役期間**（`CAREER_WEEKS`・3 年）。
 *   → ★★**最低 8 年。** ★★これは発明した数ではなく、★寿命の定数から出ています。
 *
 * ⚠️ ★短い窓で回したときは ★**「不合格」ではなく「判定不能」**にします（★`CK-14`）。
 *   ★★測れていないものを「落ちた」と書かない。
 */
/**
 * 🔴 ★**的は「種の 2,400」ではなく、★導出した必要数**です（★2026-09-20）。
 *   ✔ ★実測: ★世界は ★**導出した数へ収束**しました（★現役 1,872 ＝ 繁殖牝馬 624 × 3 年）。
 *     ★★私はそれを「減っている」と読んで ★**不合格 2 件**と報告していました。
 *     ★★減っていたのではなく、★**私が書いた 12 に向かって縮んでいた**のです。
 *   ✅ ★必要数と比べます。★★初期値と比べません。
 */
const REQUIRED_POOL = requiredActivePool(MEAN_FIELD);
const REQUIRED_MARES = requiredBroodmares(MEAN_FIELD);
console.log(`  ★導出した必要数: 現役 ${REQUIRED_POOL} 頭 / 繁殖牝馬 ${REQUIRED_MARES} 頭`
  + `（★平均出走頭数 ${MEAN_FIELD}）`);
/**
 * 🔴 ★**立ち上がりをもう 1 期 のばします**（★2026-09-20・★実測が「まだ足りない」と言いました）。
 *
 *   ✔ ★10 年（★捨てる 5 年）で: ★番が来た＝生まれた ＝ **674〜680/年**（★導出値 676 と一致）。
 *     ★それでも ★**入 676/年 対 出 715/年**（★−0.746/週）。
 *   🔴 ★出が多いのは ★**種の世界のこだま**です: ★1 年目に生まれた 798 頭が 6 年目に引退し、
 *     ★2 年目の ~750 頭が 7 年目に…と、★**先細りの世代が順に引退**してきます。
 *     ★★供給は既に 676 で一定なのに、★引退側だけがまだ大きい。
 *   ✅ ★捨てる長さ ＝ ★`retireAt`（5 年）★＋ `CAREER_WEEKS`（3 年）＝ **8 年**。
 *     ★こだまが抜けるまでです。★測るのはさらに ★**1 期（3 年）** → ★**最低 11 年**。
 *   ⚠️ ★どれも寿命の定数から出しています。★発明した数はありません。
 */
const BURN_IN = LIFECYCLE_WEEKS.retireAt + (LIFECYCLE_WEEKS.retireAt - LIFECYCLE_WEEKS.raceableFrom);
const MIN_WINDOW = LIFECYCLE_WEEKS.retireAt - LIFECYCLE_WEEKS.raceableFrom;
const steady = series.slice(BURN_IN);
if (steady.length < MIN_WINDOW) {
  console.log('');
  console.log(`🔴 ★**判定できません。** ★窓が短すぎます`);
  console.log(`   ★捨てる ${BURN_IN} 週（自前の仔が 1 頭も引退していない期間）`
    + ` ＋ 測る ${MIN_WINDOW} 週（現役 1 期）＝ ★**最低 ${((BURN_IN + MIN_WINDOW) / 52).toFixed(0)} 年**`);
  console.log(`   ★いまの窓: ${series.length} 週（★うち測れるのは ${steady.length} 週）`);
  console.log('   → ★`--years 10` などで回し直してください');
  process.exit(2);
}
const diffs = steady.map((s) => s.debuted - s.retired);
/**
 * ⚠️ ★**使う前に置く**（★2026-09-20・★同じ間違いを 2 度 しました:
 *   ★`steady` も `last` も、★定義より前で使って `ReferenceError` を出しました）。
 */
const last = steady[steady.length - 1];
const n = steady.length;
const born = steady.reduce((a, s) => a + s.debuted, 0);
const gone = steady.reduce((a, s) => a + s.retired, 0);
const mean = diffs.reduce((a, b) => a + b, 0) / n;
const sd = Math.sqrt(diffs.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, n - 1));
const se = sd / Math.sqrt(n);

/** ★現役の頭数の傾き（★単純な最小二乗） */
const xm = (n - 1) / 2;
const ym = steady.reduce((a, s) => a + s.active, 0) / n;
let sxy = 0; let sxx = 0;
steady.forEach((s, i) => { sxy += (i - xm) * (s.active - ym); sxx += (i - xm) ** 2; });
const slope = sxy / sxx;

console.log(`  … （立ち上がり 2 年を除く）出走年齢に達した ${born} 頭 / 引退 ${gone} 頭 / 週あたりの差 ${mean.toFixed(3)} ± ${se.toFixed(3)}（SE）`);
check(Math.abs(mean) <= 2 * se || Math.abs(mean) < 0.5,
  '① ★週あたり「出走年齢に達した − 引退した」が 0 と区別できない',
  `平均 ${mean.toFixed(3)} / 2SE ${(2 * se).toFixed(3)}`);
check(last.active >= REQUIRED_POOL,
  '② ★現役が★導出した必要数を下回っていない（★初期値とは比べません）',
  `最後 ${last.active} 頭 / 必要 ${REQUIRED_POOL} 頭 / 傾き ${slope.toFixed(4)} 頭/週`);
/**
 * 🔴 ★**設計書は「156 種類」と書いていました**（★2026-09-21 の突き合わせで気づきました）。
   ⚠️ ★私は `birth_week % 52` を数え、★**52 種類 / 52** と出していました。★別の量です。
 *   ★156 ＝ 出走できる 3 年（★104〜259 週齢）× 52 週。★**絶対の `birth_week` の種類**です。
 *   → ★★設計の合否欄のとおりに数え直します。
 */
const racingWeeks = new Set(
  [...rows.values()]
    .filter((x) => x.retiredAtWeek === null
      && last.week - x.birthWeek >= LIFECYCLE_WEEKS.raceableFrom)
    .map((x) => x.birthWeek),
);
const EXPECT_WEEKS = LIFECYCLE_WEEKS.retireAt - LIFECYCLE_WEEKS.raceableFrom;
check(racingWeeks.size >= EXPECT_WEEKS,
  `③ ★現役の birth_week が ${EXPECT_WEEKS} 種類 以上（★B-3 の散らばりが保たれている）`,
  `${racingWeeks.size} 種類`);
const lines = lineConcentration(
  [...rows.values()].filter((x) => x.retiredAtWeek === null).map((x) => x.record.sireLine),
);
check(lines.effective >= 5, '④ 🔴 ★有効系統数 ≥ 5（★D-026）',
  `有効 ${lines.effective.toFixed(2)} / 実数 ${lines.count} / 最大占有 ${(lines.topShare * 100).toFixed(1)}%`);

console.log(`  … 最後の週: 現役 ${last.active} 頭（★初期 ${pre.world.activeIds.length} 頭）`);
exitWithVerdict(verdictOf({ checked, failed: fails.length, label: '★POOL-SUPPLY の釣り合い' }));
