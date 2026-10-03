/**
 * ★**ライバル枠の p と ペースの余裕を決める模擬**（★2026-10-03・裁定 `REVIEW_D126_D131_MINIMAL_VERDICT_20261003.md` §9）。
 *   ★分類: **READONLY**（★DB に触りません。★計算だけです）
 *
 * 【★線】（§9・★測る前に置かれた）
 *   ★**利用者の馬とライバルが 同じ条件の窓に居る出走のうち、★ライバルが同じレースに居る割合 50% 以上**。
 *
 * 【★模型】（★`rival-class-overlap.ts` と同じ道具・★引退は齢だけ）
 *   ★世代（ゲーム年）の初めに ★看板馬 `SIGNATURE_PER_YEAR` 頭が生まれる（★候補の創始馬から素質の上位を選ぶ ＝ 強い親の代わり）。
 *   ★その世代で次に生まれる普通の馬 10 頭を ★利用者の馬とし、★1 頭ずつ別の看板馬をライバルにする（★利用者 1 人 ＝ ライバル 1 頭・§8）。
 *   ★利用者の馬は ★普通に抽選で出走する（★本番は登録で出る。★出る頻度は NPC と同じと仮定）。
 *   ★利用者の馬が出走表に入り、★ライバルが同じレースの資格の窓に居て 現役で、★まだ入っていなければ、
 *     ★`rivalSlotFires`（★本番と同じ関数）が働いたとき ★`mustInclude: [利用者, ライバル]` で出走表を組み直す。
 *   ★1 キャリアの出走数は ★`startsPerCareerOf`（★その時点の平均出走頭数と頭数から導く・D-128）。
 *
 * 【⚠️ ★本番と違うところ】★育成なし・★齢と牝馬限定は見ない（★`rival-age-overlap.ts`）・★利用者の出る頻度は NPC と同じ仮定。
 *
 * 実行: `npx tsx apps/cli/src/rival-slot-sim.ts [--pool 3000] [--days 90] [--seed 42] [--p 0.6] [--margin 1.3]`
 */
import {
  classOf, dailyProgramme, winsRangeFor, gradeOf, startsPerCareerOf, rivalPaceLimit, rivalSlotFires,
  CAREER_DAYS, RACES_PER_DAY, WEEKS_PER_DAY, WEEKS_PER_YEAR,
} from '@star/scheduler';
import { CALIBRATED_RACE_RANDOM_K, DEFAULT_RACE_BALANCE, resolveRace } from '@star/race-engine';
import {
  createFounder, deriveRng, DEFAULT_BALANCE, FOUNDERS, RIVAL_STREAM, type HorseId, type HorseRecord,
} from '@star/sim-engine';
import { SIGNATURE_PER_YEAR } from '../../worker/src/breeding-runner.js';
import { generateRace, sortPoolByClass } from './race-field.js';

interface Career { wins: number; starts: number; debutDay: number; graded: number }

export interface SlotSimResult {
  /** ★利用者の出走のうち ★ライバルが同じ窓に居た（★分母） */
  readonly bothInWindow: number;
  /** ★そのうち ライバルが同じレースに居た */
  readonly together: number;
  /** ★そのうち ライバル枠で入れた */
  readonly viaSlot: number;
  /** ★ペースの上限で止めた回 */
  readonly paceBlocked: number;
  /** ★看板馬の 1 頭あたりの出走（★平均）と 齢に見合う数（★キャリアの終わり） */
  readonly signatureStartsMean: number;
  /** ★看板馬の 1 キャリアの勝利（★平均）と ★オープン以上に上がった割合 */
  readonly signatureWinsMean: number;
  readonly signatureReachedOpen: number;
  readonly startsPerCareer: number;
  /** ★重賞の席のうち 看板馬が占めた割合（★顔ぶれの偏り） */
  readonly gradedSeatShare: number;
}

const potentialSum = (h: HorseRecord): number => Object.values(h.potential).reduce((a, b) => a + b, 0);

export function simulateRivalSlot(poolSize: number, days: number, seed: number, p: number, margin: number): SlotSimResult {
  const programme = dailyProgramme();
  const rng = deriveRng(seed, 0);
  const daysPerYear = WEEKS_PER_YEAR / WEEKS_PER_DAY;
  const careers = new Map<HorseId, Career>();
  let nextId = 0;
  const born = (day: number): HorseRecord => {
    const id = nextId;
    nextId += 1;
    const h = createFounder({
      id: `h${id}` as HorseId, sex: id % 2 === 0 ? 'male' : 'female', sireLine: `L${id % 12}` as never,
      birthYear: 0, rng, balance: DEFAULT_BALANCE, founders: FOUNDERS,
    });
    careers.set(h.id, { wins: 0, starts: 0, debutDay: day, graded: 0 });
    return h;
  };
  const pool: HorseRecord[] = [];
  for (let i = 0; i < poolSize; i += 1) pool.push(born(-CAREER_DAYS * (i / poolSize)));

  const signature = new Set<HorseId>();
  /** ★利用者の馬 → ライバル */
  const rivalOf = new Map<HorseId, HorseId>();
  /** ★この世代で まだ利用者を割り当てていない看板馬 */
  let pendingRivals: HorseId[] = [];
  /** ★数える範囲（★ウォームアップの後・最後まで走り切る世代） */
  const measured = (debutDay: number): boolean => debutDay >= CAREER_DAYS && debutDay + CAREER_DAYS <= days;

  const balance = { ...DEFAULT_RACE_BALANCE, RACE_RANDOM_K: CALIBRATED_RACE_RANDOM_K };
  let bothInWindow = 0; let together = 0; let viaSlot = 0; let paceBlocked = 0;
  let seats = 0; let racesHeld = 0; let gradedSeats = 0; let gradedSigSeats = 0;
  let lastGen = Number.NEGATIVE_INFINITY;
  const races = Math.round(days * RACES_PER_DAY);

  for (let idx = 0; idx < races; idx += 1) {
    if (idx % RACES_PER_DAY === 0) {
      const day = idx / RACES_PER_DAY;
      for (let i = 0; i < pool.length; i += 1) {
        const c = careers.get(pool[i]!.id)!;
        if (day - c.debutDay < CAREER_DAYS) continue;
        pool[i] = born(day);
        // ★世代の初めの後に生まれた普通の馬を 利用者にする（★看板馬 1 頭に 1 頭）
        const r = pendingRivals.shift();
        if (r !== undefined) rivalOf.set(pool[i]!.id, r);
      }
      /** ★世代の初め: ★看板馬を産む（★候補 30 倍から素質の上位） */
      const gen = Math.floor(day / daysPerYear);
      if (gen !== lastGen && day >= 0) {
        lastGen = gen;
        const cands = Array.from({ length: SIGNATURE_PER_YEAR * 30 }, () => born(day));
        const sig = cands.sort((a, b) => potentialSum(b) - potentialSum(a) || (a.id < b.id ? -1 : 1)).slice(0, SIGNATURE_PER_YEAR);
        for (const s of sig) { signature.add(s.id); pool.push(s); }
        pendingRivals = sig.map((s) => s.id);
      }
    }
    const raceClass = classOf(idx, programme);
    const range = winsRangeFor(raceClass);
    const inWindow = (id: HorseId): boolean => {
      const c = careers.get(id);
      if (c === undefined) return false;
      return c.wins >= range.min && (range.max === null || c.wins <= range.max);
    };
    const candidates = pool.filter((h) => inWindow(h.id));
    if (candidates.length < 8) continue;
    const sorted = sortPoolByClass(candidates);
    let race = generateRace(sorted, idx, rng);
    /** ★ライバル枠（★本番と同じ判定関数・★別の乱数の流れ） */
    const slotRng = deriveRng(seed, RIVAL_STREAM.SLOT, idx);
    const day = idx / RACES_PER_DAY;
    const meanField = racesHeld === 0 ? 12 : seats / racesHeld;
    const spc = startsPerCareerOf({ meanFieldSize: meanField, poolSize: pool.length });
    const inField = new Set(race.entrants.map((e) => e.horseId as HorseId));
    const users = [...inField].filter((id) => rivalOf.has(id));
    const mustInclude: HorseRecord[] = [];
    const fired: { user: HorseId; rival: HorseId }[] = [];
    for (const u of users) {
      const r = rivalOf.get(u)!;
      const rc = careers.get(r)!;
      const rivalActive = day - rc.debutDay < CAREER_DAYS && pool.some((h) => h.id === r);
      const eligible = rivalActive && inWindow(r);
      if (!eligible || inField.has(r)) continue;
      const limit = rivalPaceLimit({ activeWeeks: (day - rc.debutDay) * WEEKS_PER_DAY, startsPerCareer: spc, margin });
      if (rc.starts >= limit) { paceBlocked += 1; continue; }
      if (rivalSlotFires({ eligible, rivalStarts: rc.starts, paceLimit: limit, u: slotRng.float(), p })) {
        fired.push({ user: u, rival: r });
        mustInclude.push(pool.find((h) => h.id === u)!, pool.find((h) => h.id === r)!);
      }
    }
    if (mustInclude.length > 0) {
      race = generateRace(sorted, idx, slotRng, undefined, undefined, undefined, { mustInclude });
    }
    const result = resolveRace({ conditions: race.conditions, entrants: race.entrants, seed: rng.nextUint32() >>> 0, balance });
    const field = new Set(result.order.map((row) => row.horseId as HorseId));
    racesHeld += 1; seats += field.size;
    const graded = gradeOf(idx, programme) !== null;
    // ★数える: ★利用者が走ったレースで ライバルが同じ窓に居たか・同じレースに居たか
    for (const u of field) {
      const r = rivalOf.get(u);
      if (r === undefined) continue;
      const uc = careers.get(u)!;
      if (!measured(uc.debutDay)) continue;
      const rc = careers.get(r)!;
      const rivalActive = day - rc.debutDay < CAREER_DAYS && pool.some((h) => h.id === r);
      if (!rivalActive || !inWindow(r)) continue;
      bothInWindow += 1;
      if (field.has(r)) { together += 1; if (fired.some((f) => f.user === u)) viaSlot += 1; }
    }
    for (const row of result.order) {
      const id = row.horseId as HorseId;
      const c = careers.get(id)!;
      c.starts += 1;
      if (row.finishPosition === 1) c.wins += 1;
      if (graded) { gradedSeats += 1; if (signature.has(id)) { gradedSigSeats += 1; c.graded += 1; } }
    }
  }
  const sigCareers = [...signature].map((id) => careers.get(id)!).filter((c) => measured(c.debutDay));
  return {
    bothInWindow, together, viaSlot, paceBlocked,
    signatureStartsMean: sigCareers.length === 0 ? 0 : sigCareers.reduce((a, c) => a + c.starts, 0) / sigCareers.length,
    signatureWinsMean: sigCareers.length === 0 ? 0 : sigCareers.reduce((a, c) => a + c.wins, 0) / sigCareers.length,
    signatureReachedOpen: sigCareers.length === 0 ? 0 : sigCareers.filter((c) => c.wins >= winsRangeFor('open').min).length / sigCareers.length,
    startsPerCareer: startsPerCareerOf({ meanFieldSize: racesHeld === 0 ? 12 : seats / racesHeld, poolSize: pool.length }),
    gradedSeatShare: gradedSeats === 0 ? 0 : gradedSigSeats / gradedSeats,
  };
}

const isMain = process.argv[1] !== undefined && process.argv[1].endsWith('rival-slot-sim.ts');
if (isMain) {
  const arg = (n: string, d: number): number => {
    const i = process.argv.indexOf(`--${n}`);
    return i >= 0 ? Number(process.argv[i + 1]) : d;
  };
  const pool = arg('pool', 3000); const days = arg('days', 90); const seed = arg('seed', 42);
  const p = arg('p', 0.6); const margin = arg('margin', 1.3);
  const r = simulateRivalSlot(pool, days, seed, p, margin);
  const pct = (n: number, d: number): string => (d === 0 ? '—' : `${((100 * n) / d).toFixed(1)}%`);
  console.log(`★ライバル枠の模擬（pool=${pool} days=${days} seed=${seed} p=${p} margin=${margin}）`);
  console.log(`  ★同じ窓に居た利用者の出走 ${r.bothInWindow} 走のうち、ライバルが同じレースに居た: ${pct(r.together, r.bothInWindow)}（★線 50%）`);
  console.log(`    ★うち ライバル枠で入れた ${r.viaSlot}・★ペースの上限で止めた ${r.paceBlocked}`);
  console.log(`  ★看板馬の 1 キャリアの出走 平均 ${r.signatureStartsMean.toFixed(1)}（★齢に見合う数 ${r.startsPerCareer.toFixed(1)}）`);
  console.log(`  ★看板馬の 1 キャリアの勝利 平均 ${r.signatureWinsMean.toFixed(1)}・★オープン以上に上がった ${pct(r.signatureReachedOpen * 1000, 1000)}`);
  console.log(`  ★重賞の席のうち 看板馬 ${pct(r.gradedSeatShare * 1000, 1000)}`);
}
