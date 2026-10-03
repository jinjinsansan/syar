/**
 * ★**ライバルの当たりやすさの天井 — クラスの重なり**（★2026-10-03・裁定 `REVIEW_D126_D131_MINIMAL_VERDICT_20261003.md` §6）。
 *   ★分類: **READONLY**（★DB に触りません。★計算だけです）
 *
 * 【★何を数えるか】
 *   ★看板馬は ★その世代の素質の上位なので ★先に上のクラスへ上がり、★同じ世代の普通の馬と ★クラスが分かれる見込み（★齢の窓より効く天井）。
 *   ★ある馬が出走したレースで、★その馬のライバルが ★**同じレースの資格（勝利数の窓）を満たし・引退していない**割合を数える。
 *   ★齢の窓（`rival-age-overlap.ts`）とは別の天井。★2 つを掛けたものが 「ライバル枠の確率 p を掛ける前」の上限の見積り。
 *
 * 【★模型】（★`market-price-distribution.ts` の `runCohort` と同じ道具・★数を写さない）
 *   ★番組表 `classOf` ／ ★資格 `winsRangeFor` ／ ★出走表 `generateRace` ／ ★着順 `resolveRace`（★本番と同じエンジン）。
 *   ★引退は ★**齢だけ**（★デビューから `CAREER_DAYS` 日）。★本番には出走数の上限が無い（★D-128・裁定 §8）。★引退したらその場で新しい馬を 1 頭入れる（★世代交代）。
 *   ★初めの集団は ★デビューを過去 `CAREER_DAYS` 日に散らす（★同じ日に全頭が引退しないように）。★ウォームアップ（`CAREER_DAYS` 日）の後にデビューし、★キャリアを終えた世代だけを数える。
 *   ★**世代** ＝ ★デビューした日を ★ゲーム年（52 週 ＝ `WEEKS_PER_YEAR / WEEKS_PER_DAY` 日）で区切ったもの。
 *   ★世代ごとに ★素質の合計の上位 `SIGNATURE_PER_YEAR` 頭を看板馬とし、★他の馬には id の順に 1 頭ずつライバルを割り当てる。
 *
 * 【⚠️ ★本番と違うところ】（★報告に必ず書く）
 *   ① ★育成を入れていない（★`generateRace` の仮定値の能力）。★本番の看板馬は `breed()` で強い親から産むが、★ここは創始馬の上位 10 頭。
 *   ② ★初めの集団は 0 勝のまま 過去にデビューしたことにする（★ウォームアップの間はクラスの構成が本番と違う → ★数えない）。
 *   ③ ★齢・距離・馬場・故障は見ない（★齢は `rival-age-overlap.ts`）。
 *   ④ ★ライバルは「資格がある」だけで、★実際に同じレースに入るかは ★p とペースの上限（照会中）で決まる。
 *
 * 実行: `npx tsx apps/cli/src/rival-class-overlap.ts [--pool 3000] [--days 90] [--seed 42]`
 */
import {
  classOf, dailyProgramme, winsRangeFor, CAREER_DAYS, RACES_PER_DAY, WEEKS_PER_DAY, WEEKS_PER_YEAR,
  type RaceClass,
} from '@star/scheduler';
import { CALIBRATED_RACE_RANDOM_K, DEFAULT_RACE_BALANCE, resolveRace } from '@star/race-engine';
import { createFounder, deriveRng, DEFAULT_BALANCE, FOUNDERS, type HorseId, type HorseRecord } from '@star/sim-engine';
import { SIGNATURE_PER_YEAR } from '../../worker/src/breeding-runner.js';
import { generateRace, sortPoolByClass } from './race-field.js';

interface Career { wins: number; debutDay: number; retired: boolean }

export interface ClassOverlap {
  /** ★数えた出走（★看板馬でない馬の・数える世代の） */
  readonly starts: number;
  /** ★そのうち ライバルが資格の窓に居た */
  readonly rivalEligible: number;
  /** ★クラスごと（★そのレースのクラス） */
  readonly byClass: Readonly<Record<string, { starts: number; rivalEligible: number }>>;
  /** ★ライバルが居なかった出走（★デビュー前・引退後 ＝ 齢の効き・分母に入れない） */
  readonly rivalAbsent: number;
  readonly generations: number;
}

const potentialSum = (h: HorseRecord): number => Object.values(h.potential).reduce((a, b) => a + b, 0);

/**
 * @param control ★対照。★'weak' ＝ 同じ世代の素質の下から 10 頭（★弱い馬は未勝利に留まる）／★'peer' ＝ 素質の順で隣の馬（★同じ強さなら同じクラスに居るはず ＝ ★数え方が壊れていないかの確認）
 */
export function measureClassOverlap(poolSize: number, days: number, seed: number, control: false | 'weak' | 'peer' = false): ClassOverlap {
  const programme = dailyProgramme();
  const rng = deriveRng(seed, 0);
  const daysPerYear = WEEKS_PER_YEAR / WEEKS_PER_DAY;
  let nextId = 0;
  const born = (day: number): HorseRecord => {
    const id = nextId;
    nextId += 1;
    const h = createFounder({
      id: `h${id}` as HorseId, sex: id % 2 === 0 ? 'male' : 'female', sireLine: `L${id % 12}` as never,
      birthYear: 0, rng, balance: DEFAULT_BALANCE, founders: FOUNDERS,
    });
    careers.set(h.id, { wins: 0, debutDay: day, retired: false });
    everyone.set(h.id, h);
    return h;
  };
  const careers = new Map<HorseId, Career>();
  const everyone = new Map<HorseId, HorseRecord>();
  const pool: HorseRecord[] = [];
  // ★デビューを過去 CAREER_DAYS 日に等間隔で散らす（★乱数を使わない）
  for (let i = 0; i < poolSize; i += 1) pool.push(born(-CAREER_DAYS * (i / poolSize)));

  /** ★出走の記録（★あとで世代が決まってから数える）: 馬・レースの勝利数の窓・その時点の全頭の勝利数の写しは重いので 窓だけ持つ */
  const startLog: { horse: HorseId; raceClass: RaceClass; idx: number }[] = [];
  /** ★各馬の 勝利数の推移（★レースの番号ごと）— ★ライバルの その時点の勝利数を引くため */
  const winsAt = new Map<HorseId, { idx: number; wins: number; retired: boolean }[]>();
  const pushState = (id: HorseId, idx: number): void => {
    const c = careers.get(id)!;
    const arr = winsAt.get(id) ?? [];
    arr.push({ idx, wins: c.wins, retired: c.retired });
    winsAt.set(id, arr);
  };
  for (const h of pool) pushState(h.id, -1);

  const balance = { ...DEFAULT_RACE_BALANCE, RACE_RANDOM_K: CALIBRATED_RACE_RANDOM_K };
  const races = Math.round(days * RACES_PER_DAY);
  for (let idx = 0; idx < races; idx += 1) {
    /** ★日の初めに 齢で引退させ、★その場で新しい馬を入れる */
    if (idx % RACES_PER_DAY === 0) {
      const day = idx / RACES_PER_DAY;
      for (let i = 0; i < pool.length; i += 1) {
        const c = careers.get(pool[i]!.id)!;
        if (day - c.debutDay < CAREER_DAYS) continue;
        c.retired = true;
        pushState(pool[i]!.id, idx);
        pool[i] = born(day);
        pushState(pool[i]!.id, idx);
      }
    }
    const raceClass = classOf(idx, programme);
    const range = winsRangeFor(raceClass);
    const candidates = pool.filter((h) => {
      const c = careers.get(h.id)!;
      if (c.wins < range.min) return false;
      return range.max === null || c.wins <= range.max;
    });
    if (candidates.length < 8) continue;
    const race = generateRace(sortPoolByClass(candidates), idx, rng);
    const result = resolveRace({ conditions: race.conditions, entrants: race.entrants, seed: rng.nextUint32() >>> 0, balance });
    for (const row of result.order) {
      const id = row.horseId as HorseId;
      startLog.push({ horse: id, raceClass, idx });
      const c = careers.get(id)!;
      if (row.finishPosition === 1) { c.wins += 1; pushState(id, idx); }
    }
  }

  /** ★世代 ＝ デビューの日をゲーム年で区切る */
  const genOf = (id: HorseId): number => Math.floor(careers.get(id)!.debutDay / daysPerYear);
  /** ★数える世代: ★ウォームアップの後にデビューを始め、★最後の日までにキャリアを終える */
  const measured = (g: number): boolean => g * daysPerYear >= CAREER_DAYS && (g + 1) * daysPerYear + CAREER_DAYS <= days;
  const byGen = new Map<number, HorseRecord[]>();
  for (const h of everyone.values()) {
    const g = genOf(h.id);
    const arr = byGen.get(g) ?? [];
    arr.push(h);
    byGen.set(g, arr);
  }
  const rivalOf = new Map<HorseId, HorseId>();
  const signature = new Set<HorseId>();
  for (const [, hs] of byGen) {
    const sig = [...hs].sort((a, b) => potentialSum(b) - potentialSum(a) || (a.id < b.id ? -1 : 1)).slice(0, SIGNATURE_PER_YEAR);
    for (const s of sig) signature.add(s.id);
    /** ★対照のときのライバル（★看板馬の数え方は同じ・★割り当て先だけ替える） */
    const targets = control === 'weak'
      ? [...hs].filter((h) => !signature.has(h.id)).sort((a, b) => potentialSum(a) - potentialSum(b) || (a.id < b.id ? -1 : 1)).slice(0, SIGNATURE_PER_YEAR)
      : sig;
    if (control === 'peer') {
      const ranked = [...hs].filter((h) => !signature.has(h.id)).sort((a, b) => potentialSum(a) - potentialSum(b) || (a.id < b.id ? -1 : 1));
      ranked.forEach((h, i) => { const nb = ranked[i % 2 === 0 ? i + 1 : i - 1]; if (nb !== undefined) rivalOf.set(h.id, nb.id); });
    } else {
      hs.filter((h) => !signature.has(h.id) && !targets.includes(h)).forEach((h, i) => { if (targets.length > 0) rivalOf.set(h.id, targets[i % targets.length]!.id); });
    }
  }
  /** ★ライバルの idx 時点の状態（★その出走の直前）。★まだ生まれていなければ null */
  const stateAt = (id: HorseId, idx: number): { wins: number; retired: boolean } | null => {
    const arr = winsAt.get(id) ?? [];
    if (arr.length === 0 || arr[0]!.idx >= idx) return null;
    let lo = 0; let hi = arr.length - 1; let best = arr[0]!;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (arr[mid]!.idx < idx) { best = arr[mid]!; lo = mid + 1; } else hi = mid - 1;
    }
    return best;
  };

  let starts = 0; let rivalEligible = 0; let rivalAbsent = 0;
  const gens = new Set<number>();
  const byClass: Record<string, { starts: number; rivalEligible: number }> = {};
  for (const s of startLog) {
    if (signature.has(s.horse)) continue;
    const g = genOf(s.horse);
    if (!measured(g)) continue;
    gens.add(g);
    const r = rivalOf.get(s.horse);
    if (r === undefined) continue;
    const st = stateAt(r, s.idx);
    /** ★ライバルが まだデビュー前・もう引退 ＝ 齢の効き（★`rival-age-overlap.ts` が数える）→ ★ここでは分母から外す */
    if (st === null || st.retired) { rivalAbsent += 1; continue; }
    const range = winsRangeFor(s.raceClass);
    const ok = st.wins >= range.min && (range.max === null || st.wins <= range.max);
    starts += 1; if (ok) rivalEligible += 1;
    const b = byClass[s.raceClass] ?? { starts: 0, rivalEligible: 0 };
    b.starts += 1; if (ok) b.rivalEligible += 1;
    byClass[s.raceClass] = b;
  }
  return { starts, rivalEligible, rivalAbsent, byClass, generations: gens.size };
}

const isMain = process.argv[1] !== undefined && process.argv[1].endsWith('rival-class-overlap.ts');
if (isMain) {
  const arg = (n: string, d: number): number => {
    const i = process.argv.indexOf(`--${n}`);
    return i >= 0 ? Number(process.argv[i + 1]) : d;
  };
  const pool = arg('pool', 3000); const days = arg('days', 90); const seed = arg('seed', 42);
  const ci = process.argv.indexOf('--control');
  const control = ci < 0 ? false : (process.argv[ci + 1] === 'weak' ? 'weak' : 'peer');
  const r = measureClassOverlap(pool, days, seed, control);
  if (control !== false) console.log(`★対照: ${control === 'weak' ? 'ライバル ＝ 同じ世代の 素質の下から 10 頭' : 'ライバル ＝ 素質の順で隣の馬（同じ強さ）'}`);
  const pct = (n: number, d: number): string => (d === 0 ? '—' : `${((100 * n) / d).toFixed(1)}%`);
  console.log(`★クラスの重なり（pool=${pool} days=${days} seed=${seed}・数えた世代 ${r.generations}）`);
  console.log(`  ★看板馬でない馬の出走 ${r.starts} 走（★ライバルが現役のときだけ）のうち、ライバルが資格の窓に居た: ${pct(r.rivalEligible, r.starts)}`);
  console.log(`  ★（ライバルがデビュー前・引退後で外した出走 ${r.rivalAbsent} 走）`);
  for (const [k, v] of Object.entries(r.byClass)) console.log(`    ${k.padEnd(8)} ${String(v.starts).padStart(7)} 走  ${pct(v.rivalEligible, v.starts)}`);
}
