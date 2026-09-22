/**
 * ★**Q-2「代を重ねて自分の血統を伸ばせるか」の模擬**（★PLAN Q-2・2026-09-22）。
 *
 *   npx tsx apps/cli/src/lineage-sim.ts [--seeds 42,7,11,23] [--years 100] [--json out.json]
 *
 * 【★何を測るか】（★照会 `QUESTIONS_Q2_LINEAGE_SIM_20260922.md`・裁定 `REVIEW_Q2_LINEAGE_SIM_VERDICT_20260922.md`）
 *   ★プレイヤーが ★案 B の初回の母（★NPC の引退した産める牝馬）1 頭から始め、★毎年 自分の繁殖牝馬に配合し、
 *   ★仔のうち牝馬を繁殖に残していったとき、★**仔の素質の合計が世代・年を追ってどこまで伸びるか**。
 *   ★物差しは ★**NPC の現役馬の素質の合計の分布**（★レースで勝てるか・裁定 §2-4）。
 *
 * 【★方針】
 *   R  … ★選ばない（★残す牝馬・父とも無作為）。★対照
 *   N  … ★見える手がかり（★素質の合計 ＋ 雑音）で選ぶ。★雑音は NPC 現役の SD の 0.25 / 0.5 / 1.0 倍
 *   O  … ★素質が見えるとして選ぶ（★上限）
 *   O′ … ★O に加えて ★自家の牡馬を種牡馬に残し（上限 5）、★自分の牝馬に付ける（★近交が効く・裁定 §2-2）
 *   Oa … ★O ＋ ★仔の近交係数が 0.25 を超える相手は選ばない（★伸びのうち近交の上乗せの分を切り分ける・裁定 §4）
 *
 * 【⚠️ 仮定（★報告に書く）】
 *   A: ★NPC の世界は動かさない（★`runPreseed` の最終年の種牡馬・現役を環境として固定）
 *   B: ★EP の制約は外す（★種付料を払えるだけ払える＝ **伸びの上限**・裁定 §2-3）
 *   C: ★NPC 種牡馬の年の上限は ★プレイヤーの使用だけで数える（★NPC 自身の使用は数えない）
 *   D: ★初回の母は ★引退した産める NPC 牝馬から ★無作為に 1 頭（★素質は見えないので、選べるのは無作為と同じ）
 *   ⚠️ E: 🔴 ★**D-120 との食い違い**: ★実際の初回の配合で得られる仔は ★**1 頭だけ**で、★NPC の母はプレイヤーのものにならない。
 *      ★この模擬は ★**「繁殖牝馬を 1 頭持った後」**の伸びを測る（★その母から何年も産ませる）。
 *      ★実際の遊びでは ★その 1 頭が ★**牝で**、★**6 歳になって繁殖に上がる（約 52 日後）**まで ★自分の血統は始まらない。
 *      ★報告では ★年の軸を「繁殖牝馬を持ってから」と読み、★実際の始まりは約 52 日遅れる、と書く
 *   F: ★初回の母の残りの産める数は ★候補ごとに違う（★1〜7 産）。★残りが少なく仔が全部 牡なら ★牝の血統は途絶える（★数えて出す）
 *
 * ★DB を使いません。★固定の種で完全に再現します（憲法 4）。★数は画面に出しません（D-114・D-116）。
 */
import {
  ABILITY_KEYS, ALLOW_ALL_NAMES, DEFAULT_BALANCE, LINEAGE_SIM_STREAM, NPC_STABLES,
  breed, calcInbreedCoefficient, canMate, deriveRng, type HorseRecord, type Rng,
} from '@star/sim-engine';
import { OWNERSHIP_LIMITS, WEEKS_PER_DAY, WEEKS_PER_YEAR } from '@star/scheduler';
import { writeFileSync } from 'node:fs';

import { DEFAULT_PRESEED_OPTIONS, preseedNicks, runPreseed } from './preseed.js';

/** ★1 ゲーム年の実日数（★写さずに導く・D-052。★52 週 ÷ 1 日 6 週 ＝ 8.67 日） */
const REAL_DAYS_PER_YEAR = WEEKS_PER_YEAR / WEEKS_PER_DAY;
/** ★所有上限（★正典 §6.7・★`ownership.ts` の 1 か所から） */
const MAX_BROODMARES = OWNERSHIP_LIMITS.broodmare;
const MAX_STALLIONS = OWNERSHIP_LIMITS.stallion;

type Policy = 'R' | 'N0.25' | 'N0.5' | 'N1.0' | 'O' | 'Oa' | "O'";
/** ★乱数の流れの番号はこの並びの位置で決まる（★Oa は後から足したので最後・★既存の方針の番号を変えない） */
const ALL_POLICIES: readonly Policy[] = ['R', 'N0.25', 'N0.5', 'N1.0', 'O', "O'", 'Oa'];

const potentialSum = (h: HorseRecord): number => ABILITY_KEYS.reduce((a, k) => a + h.potential[k], 0);

interface Owned {
  record: HorseRecord;
  /** ★プレイヤーの世代（★初回の母 ＝ 0） */
  gen: number;
  /** ★選ぶときの点（★方針ごと・馬ごとに 1 度だけ決める） */
  score: number;
}

interface YearRow { year: number; foals: number; meanFoal: number | null; maxFoal: number | null; meanF: number | null; frailShare: number | null; broodmares: number }
interface GenRow { gen: number; foals: number; meanFoal: number; maxFoal: number; meanF: number; frailShare: number }

function percentileOf(sorted: readonly number[], x: number): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((sorted[mid] as number) < x) lo = mid + 1; else hi = mid;
  }
  return lo / sorted.length;
}

function quantile(sorted: readonly number[], q: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] as number;
}

function runPlayer(
  policy: Policy,
  seed: number,
  env: {
    readonly year0: number;
    readonly stallions: readonly HorseRecord[];
    readonly candidates: readonly HorseRecord[];
    readonly worldLookup: (id: string) => HorseRecord | undefined;
    readonly nicks: ReturnType<typeof preseedNicks>;
    readonly sdActive: number;
  },
  years: number,
): { byYear: YearRow[]; byGen: GenRow[] } {
  // ★絞って流しても同じ乱数になるよう、★全方針の並びの位置を使う（★--policies で番号を変えない）
  const policyIndex = ALL_POLICIES.indexOf(policy);
  const rng: Rng = deriveRng(seed, LINEAGE_SIM_STREAM.PLAYER, policyIndex);
  const noiseRng: Rng = deriveRng(seed, LINEAGE_SIM_STREAM.NOISE, policyIndex);
  const noiseSd = policy.startsWith('N') ? Number(policy.slice(1)) * env.sdActive : 0;
  const scoreOf = (h: HorseRecord): number => {
    if (policy === 'R') return rng.range(0, 1);
    if (policy.startsWith('N')) return potentialSum(h) + noiseRng.gaussian(0, noiseSd);
    return potentialSum(h);
  };

  const mine = new Map<string, HorseRecord>();
  const lookup = (id: string): HorseRecord | undefined => mine.get(id) ?? env.worldLookup(id);

  // ★初回の母（★仮定 D: 無作為に 1 頭）。★記録は写して使う（★世界の記録を書き換えない）
  const first = env.candidates[rng.int(0, env.candidates.length - 1)] as HorseRecord;
  let herd: Owned[] = [{ record: { ...first, pedigreeCache: new Map(first.pedigreeCache) }, gen: 0, score: 0 }];
  herd[0]!.score = scoreOf(herd[0]!.record);
  let ownStallions: Owned[] = [];
  /** ★まだ繁殖年齢に達していない自家の仔 */
  let youngsters: Owned[] = [];
  const npcCoverings = new Map<string, number>();

  const byYear: YearRow[] = [];
  const genAcc = new Map<number, { n: number; sum: number; max: number; fSum: number; frail: number }>();

  for (let t = 1; t <= years; t += 1) {
    const year = env.year0 + t;
    npcCoverings.clear();
    for (const s of ownStallions) s.record = { ...s.record, coveringsThisYear: 0 };
    herd = herd.map((m) => ({ ...m, record: { ...m.record, bredThisYear: false } }));

    // ★6 歳になった自家の仔を、★繁殖牝馬・種牡馬の候補に上げる（★上限まで・★点の高い順）
    const ready = youngsters.filter((y) => year - y.record.birthYear >= DEFAULT_BALANCE.MIN_BREEDING_AGE_YEARS);
    youngsters = youngsters.filter((y) => !ready.includes(y));
    const pool = [...herd, ...ready.filter((y) => y.record.sex === 'female')]
      .filter((m) => m.record.foalCount < DEFAULT_BALANCE.MARE_LIFETIME_FOALS);
    herd = pool.sort((a, b) => b.score - a.score).slice(0, MAX_BROODMARES);
    if (policy === "O'") {
      ownStallions = [...ownStallions, ...ready.filter((y) => y.record.sex === 'male')]
        .sort((a, b) => b.score - a.score).slice(0, MAX_STALLIONS);
    }

    const foals: { rec: HorseRecord; gen: number }[] = [];
    for (const dam of herd) {
      const npcOk = env.stallions.filter((s) => (npcCoverings.get(s.id) ?? 0) < 20 && canMate(s, dam.record, DEFAULT_BALANCE, year).ok);
      const ownOk = ownStallions.filter((s) => canMate(s.record, dam.record, DEFAULT_BALANCE, year).ok).map((s) => s.record);
      // ★父の選び方: ★R は無作為・★N/O は点の高い順・★O′ は自家を優先（★近交が効く）
      let sire: HorseRecord | undefined;
      if (policy === "O'" && ownOk.length > 0) {
        sire = ownOk.reduce((a, b) => (potentialSum(b) > potentialSum(a) ? b : a));
      } else if (npcOk.length > 0) {
        if (policy === 'R') sire = npcOk[rng.int(0, npcOk.length - 1)];
        else if (policy === 'Oa') {
          /**
           * ★**Oa ＝ O ＋ 近交を避ける**（★裁定 `REVIEW_Q2_LINEAGE_SIM_VERDICT_20260922.md` §4・切り分けの 1 本）。
           *   ★仔の近交係数が ★虚弱の閾値（`INBREED_DEPRESSION_THRESHOLD` ＝ 0.25）を超える相手は選ばない。
           *   ★O との差 ＝ ★伸びのうち ★近交の上乗せ（最大 30%）の分。★全員超えるなら、★いちばん F の低い相手
           */
          const withF = npcOk.map((s) => ({
            s, f: calcInbreedCoefficient(s, dam.record, lookup, DEFAULT_BALANCE.PEDIGREE_DEPTH).F,
          }));
          const safe = withF.filter((x) => x.f <= DEFAULT_BALANCE.genetics.INBREED_DEPRESSION_THRESHOLD);
          sire = safe.length > 0
            ? safe.reduce((a, b) => (potentialSum(b.s) > potentialSum(a.s) ? b : a)).s
            : withF.reduce((a, b) => (b.f < a.f ? b : a)).s;
        } else {
          const noisy = npcOk.map((s) => ({ s, v: policy.startsWith('N') ? potentialSum(s) + noiseRng.gaussian(0, noiseSd) : potentialSum(s) }));
          sire = noisy.reduce((a, b) => (b.v > a.v ? b : a)).s;
        }
      }
      if (sire === undefined) continue;
      const foal = breed({
        id: `P${policyIndex}-${t}-${dam.record.id}`,
        sire, dam: dam.record, seed: rng.nextUint32(),
        generation: Math.max(sire.generation, dam.record.generation) + 1,
        birthYear: year, lookup, balance: DEFAULT_BALANCE, nicks: env.nicks,
      });
      mine.set(foal.id, foal);
      dam.record = { ...dam.record, foalCount: dam.record.foalCount + 1, bredThisYear: true };
      mine.set(dam.record.id, dam.record);
      if (ownStallions.some((s) => s.record.id === sire!.id)) {
        const s = ownStallions.find((x) => x.record.id === sire!.id)!;
        s.record = { ...s.record, coveringsThisYear: s.record.coveringsThisYear + 1 };
      } else {
        npcCoverings.set(sire.id, (npcCoverings.get(sire.id) ?? 0) + 1);
      }
      const gen = dam.gen + 1;
      foals.push({ rec: foal, gen });
      youngsters.push({ record: foal, gen, score: scoreOf(foal) });
    }

    const sums = foals.map((f) => potentialSum(f.rec));
    byYear.push({
      year: t,
      foals: foals.length,
      meanFoal: sums.length === 0 ? null : sums.reduce((a, b) => a + b, 0) / sums.length,
      maxFoal: sums.length === 0 ? null : Math.max(...sums),
      meanF: foals.length === 0 ? null : foals.reduce((a, f) => a + f.rec.inbreedCoeff, 0) / foals.length,
      frailShare: foals.length === 0 ? null : foals.filter((f) => f.rec.frail).length / foals.length,
      broodmares: herd.length,
    });
    for (const f of foals) {
      const acc = genAcc.get(f.gen) ?? { n: 0, sum: 0, max: -Infinity, fSum: 0, frail: 0 };
      const v = potentialSum(f.rec);
      acc.n += 1; acc.sum += v; acc.max = Math.max(acc.max, v); acc.fSum += f.rec.inbreedCoeff;
      if (f.rec.frail) acc.frail += 1;
      genAcc.set(f.gen, acc);
    }
  }
  const byGen = [...genAcc.entries()].sort((a, b) => a[0] - b[0])
    .map(([gen, a]) => ({ gen, foals: a.n, meanFoal: a.sum / a.n, maxFoal: a.max, meanF: a.fSum / a.n, frailShare: a.frail / a.n }));
  return { byYear, byGen };
}

// ── ★引数 ─────────────────────────────────────────────
const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(name);
  return i < 0 ? undefined : process.argv[i + 1];
};
const SEEDS = (arg('--seeds') ?? '42,7,11,23').split(',').map(Number);
const YEARS = Number(arg('--years') ?? 100);
const JSON_OUT = arg('--json');
/** ★流す方針（★既定は全部。★切り分けの 1 本だけ流すときは --policies O,Oa） */
const POLICIES: readonly Policy[] = arg('--policies') === undefined
  ? ALL_POLICIES : (arg('--policies') as string).split(',') as Policy[];

const out: Record<string, unknown> = { seeds: SEEDS, years: YEARS, realDaysPerYear: REAL_DAYS_PER_YEAR, perSeed: [] };
for (const seed of SEEDS) {
  const t0 = process.hrtime.bigint();
  const pre = runPreseed({
    ...DEFAULT_PRESEED_OPTIONS, seed, nicks: preseedNicks(seed, NPC_STABLES), blocklist: ALLOW_ALL_NAMES,
  });
  const w = pre.world;
  const rec = (id: string): HorseRecord => w.all.get(id)!.record;
  const active = w.activeIds.map((id) => potentialSum(rec(id))).sort((a, b) => a - b);
  const meanActive = active.reduce((a, b) => a + b, 0) / active.length;
  const sdActive = Math.sqrt(active.reduce((a, b) => a + (b - meanActive) ** 2, 0) / active.length);
  // ★最終年の種付回数が残っているので 0 に戻す（★年の上限はプレイヤーの使用で数える・仮定 C）
  const stallions = w.stallionIds.map(rec).map((r) => ({ ...r, coveringsThisYear: 0 }));
  const mareSet = new Set(w.mareIds);
  const activeSet = new Set(w.activeIds);
  // ★案 B の候補: ★現役でも繁殖牝馬でもない牝馬で、★6〜15 歳・生涯 8 産未満（★DB の「産める功労馬」に相当）
  const candidates = [...w.all.values()].map((h) => h.record).filter((r) => r.sex === 'female'
    && !mareSet.has(r.id) && !activeSet.has(r.id)
    && w.year - r.birthYear >= DEFAULT_BALANCE.MIN_BREEDING_AGE_YEARS && w.year - r.birthYear <= 15
    && r.foalCount < DEFAULT_BALANCE.MARE_LIFETIME_FOALS);
  const env = {
    year0: w.year, stallions, candidates, nicks: preseedNicks(seed, NPC_STABLES), sdActive,
    worldLookup: (id: string) => w.all.get(id)?.record,
  };
  const npc = {
    active: { n: active.length, mean: meanActive, sd: sdActive, p50: quantile(active, 0.5), p90: quantile(active, 0.9), p99: quantile(active, 0.99) },
    candidatesMean: candidates.reduce((a, r) => a + potentialSum(r), 0) / Math.max(1, candidates.length),
    candidates: candidates.length,
    stallionsMean: stallions.reduce((a, r) => a + potentialSum(r), 0) / stallions.length,
  };
  const policies: Record<string, unknown> = {};
  for (const p of POLICIES) {
    const r = runPlayer(p, seed, env, YEARS);
    policies[p] = {
      byYear: r.byYear.map((y) => ({ ...y, pct: y.meanFoal === null ? null : percentileOf(active, y.meanFoal) })),
      byGen: r.byGen.map((g) => ({ ...g, pct: percentileOf(active, g.meanFoal) })),
    };
  }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  (out['perSeed'] as unknown[]).push({ seed, ms, npc, policies });
  console.log(`# seed ${seed}（${(ms / 1000).toFixed(1)} 秒）  NPC 現役 ${npc.active.n} 頭・平均 ${npc.active.mean.toFixed(0)}・`
    + `p50 ${npc.active.p50} / p90 ${npc.active.p90} / p99 ${npc.active.p99}・候補の母 ${npc.candidates} 頭（平均 ${npc.candidatesMean.toFixed(0)}）`
    + `・種牡馬 平均 ${npc.stallionsMean.toFixed(0)}`);
  for (const p of POLICIES) {
    const g = (policies[p] as { byGen: (GenRow & { pct: number })[] }).byGen;
    const pick = [1, 2, 3, 5, 8, 12, 15].map((k) => g.find((x) => x.gen === k))
      .map((x) => (x === undefined ? '   -   ' : `${x.meanFoal.toFixed(0)}(${(x.pct * 100).toFixed(0)}%)`));
    console.log(`  ${p.padEnd(6)} 世代 1/2/3/5/8/12/15: ${pick.join(' ')}`);
  }
}
if (JSON_OUT !== undefined) writeFileSync(JSON_OUT, JSON.stringify(out, null, 2), 'utf8');
