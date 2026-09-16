/**
 * ★V-10 の集計と合否（AUDIT_FIX2 BF-5・BF-6・2026-09-14）
 *
 * ★測定器（V-10）と製品（本番のオッズ表）が**同じ「売る目」を見ていること自体**を検査で固定する（R-30）。
 * ★SE は判定値と同じ比の推定量で出す（正典 §13.2・裁定 `REVIEW_AUDIT_FIX2_VERDICT_20260914.md` §3-1）。
 *   SE の検査は公開の関数（`accountRaceKind`・`judgeKind`）だけを通す（内部の集計の持ち方に依存しない）。
 */
import { describe, expect, it } from 'vitest';
import {
  MARGIN,
  ODDS_CAP,
  TICKET_KINDS,
  debiasedProbability,
  minSellableProbability,
  type TicketKind,
} from '@star/betting';
import { ODDS_MC_TRIALS, buildOddsRows } from '../../worker/src/odds.js';
import {
  V10_SE_LIMIT,
  V10_TOLERANCE,
  accountRaceKind,
  emptyKindStat,
  foldRaceSample,
  judgeKind,
  mergeKindStat,
  type KindStat,
} from '../src/v10-accounting.js';

const M = ODDS_MC_TRIALS;

/**
 * 売る目・D-035 で売らない目・D-096 で売らない目が混ざった集計。
 *   '1' … p_min のすぐ下（D-035 で売らない）
 *   '2' … p_min ちょうど（売る）
 *   '3' … p = 0.05（売る）
 *   '4' … p = 0.95（どの券種でも 1 − margin を上回る → D-096 で売らない）
 */
function mixedCounts(kind: TicketKind): Map<string, number> {
  const atMin = Math.ceil(minSellableProbability(kind) * M);
  return new Map([
    ['1', atMin - 1],
    ['2', atMin],
    ['3', Math.round(M * 0.05)],
    ['4', Math.round(M * 0.95)],
  ]);
}

describe('BF-5 V-10 の賭け金は本番と同じ「売る目」', () => {
  it('★経路: 賭け金は、同じ counts から本番の buildOddsRows が作る行数と一致する（R-30）', () => {
    for (const kind of TICKET_KINDS) {
      const counts = mixedCounts(kind);
      const st = emptyKindStat();
      accountRaceKind(st, kind, counts, M, []);
      const rows = buildOddsRows(new Map([[kind, counts]]), M);
      expect(st.stake, kind).toBe(rows.length);
      // ★空振りしていない: 売る目と、両方の規則で売らない目が実際に混ざっている
      expect(st.stake, kind).toBe(2);
      expect(st.unsoldMinProbability.bets, kind).toBe(1);
      expect(st.unsoldEvenOdds.bets, kind).toBe(1);
    }
  });

  it('★売らなかった目は払わず、「売っていたら」を規則ごとに数える ／ MC で出なかった目は unseenHits', () => {
    const st = emptyKindStat();
    accountRaceKind(st, 'win', mixedCounts('win'), M, ['1', '3', '4', '9']);
    expect(st.unsoldMinProbability.hits).toBe(1); // '1'
    expect(st.unsoldEvenOdds.hits).toBe(1); // '4'
    expect(st.unseenHits).toBe(1); // '9'
    expect(st.unsoldMinProbability.payoutBeforeFloor).toBeGreaterThan(0);
    expect(st.unsoldEvenOdds.payoutBeforeFloor).toBeGreaterThan(0);
    expect(st.unsoldEvenOdds.payoutBeforeFloor).toBeLessThan(1); // 1.0 倍未満の目
    // ★払戻は売った '3' の分だけ
    const rows = buildOddsRows(new Map([['win', mixedCounts('win')]]), M);
    const odds3 = rows.find((r) => r.selection[0] === 3)!.odds;
    expect(st.payout).toBeCloseTo(odds3, 10);
  });

  it('シードをまたいでプールしても件数と額が足し合わさる', () => {
    const a = emptyKindStat();
    const b = emptyKindStat();
    accountRaceKind(a, 'place', mixedCounts('place'), M, ['3']);
    accountRaceKind(b, 'place', mixedCounts('place'), M, ['3', '4']);
    mergeKindStat(a, b);
    expect(a.stake).toBe(4);
    expect(a.unsoldEvenOdds.hits).toBe(1);
  });
});

/** 判定の検査用に、賭け金・払戻・切り捨ての損失だけを持つ集計を作る */
const statWith = (stake: number, payout: number, floorLoss: number): KindStat => ({
  ...emptyKindStat(),
  stake,
  payout,
  floorLoss,
});

describe('BF-6 V-10 の合否は切り捨て前の払戻率で出す（D-094）', () => {
  it('★切り捨て前が帯の内・切り捨て後が帯の外 → 合格', () => {
    const target = 1 - MARGIN.place; // 0.82
    // 切り捨て前 0.815（−0.5pt・帯の内）／ 切り捨て後 0.800（−2.0pt・帯の外）
    const v = judgeKind('place', statWith(1000, 800, 15));
    expect(v.rateBeforeFloor).toBeCloseTo(0.815, 12);
    expect(v.rateAfterFloor).toBeCloseTo(0.8, 12);
    expect(v.floorDiff).toBeCloseTo(-0.015, 12);
    expect(Math.abs(v.rateBeforeFloor - target)).toBeLessThanOrEqual(V10_TOLERANCE);
    expect(Math.abs(v.rateAfterFloor - target)).toBeGreaterThan(V10_TOLERANCE);
    expect(v.pass).toBe(true);
    expect(v.passAfterFloor).toBe(false);
  });

  it('★切り捨て前が帯の外 → 不合格（切り捨て後が帯の内でも）', () => {
    // 切り捨て前 0.835（+1.5pt・帯の外）／ 切り捨て後 0.825（+0.5pt・帯の内）
    const v = judgeKind('place', statWith(1000, 825, 10));
    expect(v.pass).toBe(false);
    expect(v.passAfterFloor).toBe(true);
  });

  it('賭け金 0 は不合格（判定不能を合格にしない・R-3）', () => {
    const v = judgeKind('win', emptyKindStat());
    expect(v.pass).toBe(false);
    expect(Number.isNaN(v.rateBeforeFloor)).toBe(true);
  });
});

/**
 * ★**レース内の多数引きを 1 標本に畳む**（★`verify-pmin.ts` の分散低減・2026-09-16）。
 *
 * 【★見ている壊れ方】
 *   ① ★確定を `finals` 回引いたぶん **`races` が増え、SE がレース内の分散で薄まる**（★D-036 が禁じる形）
 *   ② ★畳むと**比（判定値）が変わる**（★正規化の取り違え）
 *   ③ ★件数（未発売の的中・上限に当たった売り目）まで割って**起きた回数が読めなくなる**
 */
describe('★確定の多数引きは「1 レース 1 標本」に畳む（D-036）', () => {
  const M2 = ODDS_MC_TRIALS;
  const counts = mixedCounts('place');

  it('① ★確定を何回引いても races は 1 だけ増える（★SE がレース内で薄まらない）', () => {
    const race = emptyKindStat();
    const FINALS = 100;
    for (let t = 0; t < FINALS; t += 1) accountRaceKind(race, 'place', counts, M2, ['3']);
    expect(race.races, '★前提: レース内では finals 回ぶん積まれている').toBe(FINALS);

    const parent = emptyKindStat();
    foldRaceSample(parent, race, FINALS);
    expect(parent.races, '★畳んだ後は 1 標本').toBe(1);
  });

  it('② ★畳んでも比（判定値）が変わらない', () => {
    const FINALS = 7;
    const race = emptyKindStat();
    for (let t = 0; t < FINALS; t += 1) accountRaceKind(race, 'place', counts, M2, ['3']);
    const parent = emptyKindStat();
    foldRaceSample(parent, race, FINALS);
    /** ★同じ内容を 1 回だけ積んだもの（★畳んだ結果はこれと一致するはず） */
    const once = emptyKindStat();
    accountRaceKind(once, 'place', counts, M2, ['3']);
    expect(judgeKind('place', parent).rateBeforeFloor)
      .toBeCloseTo(judgeKind('place', once).rateBeforeFloor, 12);
    expect(parent.stake).toBeCloseTo(once.stake, 12);
    expect(parent.payout).toBeCloseTo(once.payout, 12);
  });

  it('③ ★件数は割らない（★何回起きたかが読める）', () => {
    const FINALS = 5;
    const race = emptyKindStat();
    /** ★'1' は D-035 で売らない目・'4' は D-096 で売らない目・'9' は MC で出なかった目 */
    for (let t = 0; t < FINALS; t += 1) accountRaceKind(race, 'place', counts, M2, ['1', '4', '9']);
    const parent = emptyKindStat();
    foldRaceSample(parent, race, FINALS);
    expect(parent.unseenHits, '★未発売の的中は延べで数える').toBe(FINALS);
    expect(parent.unsoldMinProbability.hits).toBe(FINALS);
    expect(parent.unsoldEvenOdds.hits).toBe(FINALS);
  });

  it('★★レース間のばらつきが残る（★1 レースを何回引いても判定不能のまま）', () => {
    /**
     * ★同じ出走表を何回引いても ★**出走表間のばらつきは 1 標本のまま**（D-036 の本文）。
     * ★畳んだ結果が 1 標本なら、★`judgeKind` は SE を出せない（`races >= 2` が条件）。
     */
    const race = emptyKindStat();
    for (let t = 0; t < 1000; t += 1) accountRaceKind(race, 'place', counts, M2, ['3']);
    const parent = emptyKindStat();
    foldRaceSample(parent, race, 1000);
    expect(judgeKind('place', parent).se, '★1 レースでは SE を出さない').toBeNull();
    expect(judgeKind('place', parent).seReached).toBe(false);

    /** ★★畳まずに積むと「1000 レース」に見えてしまう（★これが直した壊れ方） */
    expect(judgeKind('place', race).se, '★畳まなければ SE が出てしまう').not.toBeNull();
  });

  it('★不正な回数で畳まない（★0 割りを黙って通さない）', () => {
    expect(() => foldRaceSample(emptyKindStat(), emptyKindStat(), 0)).toThrow();
    expect(() => foldRaceSample(emptyKindStat(), emptyKindStat(), -1)).toThrow();
    expect(() => foldRaceSample(emptyKindStat(), emptyKindStat(), Number.NaN)).toThrow();
  });
});

describe('★SE は判定値（合計 ÷ 合計の比）と同じ推定量で出す（正典 §13.2・裁定 FIX2 §3-1）', () => {
  /** 単勝で、確率 p の目の切り捨て前のオッズ（`accountRaceKind` と別に、検査の側で計算する） */
  const beforeFloorOdds = (count: number): number =>
    Math.min(ODDS_CAP.win, (1 / debiasedProbability(count / M, M)) * (1 - MARGIN.win));

  /**
   * ★売る目の数（賭け金 X）がレースごとに違う 4 レース。
   *   等しい賭け金だけの例では「等しい重みの平均」と「比の推定量」が一致してしまい、誤りを捕まえられない。
   */
  const RACES: readonly { probs: readonly number[]; winner: number | null }[] = [
    { probs: [0.3, 0.2], winner: 0 }, //                        X = 2
    { probs: [0.05, 0.05, 0.05, 0.05, 0.05, 0.05], winner: 2 }, // X = 6
    { probs: [0.1, 0.1, 0.1], winner: null }, //                 X = 3（外れ）
    { probs: [0.25, 0.25, 0.25, 0.25], winner: 1 }, //           X = 4
  ];

  /** 検査の側で、レースごとの (X, Y) を作る */
  const pairs = RACES.map((r) => {
    const counts = r.probs.map((p) => Math.round(M * p));
    return { x: counts.length, y: r.winner === null ? 0 : beforeFloorOdds(counts[r.winner]!), counts, winner: r.winner };
  });

  /** 正典 §13.2 の式（検査の側で独立に計算する） */
  function ratioEstimator(): { ratio: number; sd: number; se: number } {
    const n = pairs.length;
    const sumX = pairs.reduce((a, p) => a + p.x, 0);
    const sumY = pairs.reduce((a, p) => a + p.y, 0);
    const ratio = sumY / sumX;
    const residual = pairs.reduce((a, p) => a + (p.y - ratio * p.x) ** 2, 0);
    const sd = Math.sqrt(residual / (n - 1)) / (sumX / n);
    return { ratio, sd, se: sd / Math.sqrt(n) };
  }

  /** ★採らない形: レースごとの払戻率を等しい重みで平均したばらつき */
  function equalWeightSe(): number {
    const n = pairs.length;
    const rates = pairs.map((p) => p.y / p.x);
    const mean = rates.reduce((a, r) => a + r, 0) / n;
    const sd = Math.sqrt(rates.reduce((a, r) => a + (r - mean) ** 2, 0) / (n - 1));
    return sd / Math.sqrt(n);
  }

  function accounted(): KindStat {
    const st = emptyKindStat();
    for (const p of pairs) {
      const counts = new Map(p.counts.map((c, i) => [String(i + 1), c]));
      accountRaceKind(st, 'win', counts, M, p.winner === null ? [] : [String(p.winner + 1)]);
    }
    return st;
  }

  it('★前提: この例では、比の推定量と等しい重みの平均で SE がはっきり食い違う（検査が誤りを捕まえられる）', () => {
    const { se } = ratioEstimator();
    const eq = equalWeightSe();
    expect(Math.abs(se - eq) / se).toBeGreaterThan(0.1);
    // ★全レースで売る目がすべて売られている（賭け金 X が上の想定どおり）
    expect(accounted().stake).toBe(2 + 6 + 3 + 4);
  });

  it('★judgeKind の SD・SE は、正典 §13.2 の式の値と一致し、等しい重みの平均の値とは一致しない', () => {
    const v = judgeKind('win', accounted());
    const expected = ratioEstimator();
    expect(v.rateBeforeFloor).toBeCloseTo(expected.ratio, 12);
    expect(v.raceSd).toBeCloseTo(expected.sd, 12);
    expect(v.se).toBeCloseTo(expected.se, 12);
    expect(Math.abs(v.se! - equalWeightSe())).toBeGreaterThan(0.01);
  });

  it('レース 1 本は判定不能 ／ 同じレースの繰り返しは SE = 0 で届く ／ 上限は 0.25pt', () => {
    const one = emptyKindStat();
    accountRaceKind(one, 'win', new Map([['1', Math.round(M * 0.3)], ['2', Math.round(M * 0.2)]]), M, ['1']);
    expect(judgeKind('win', one).se).toBeNull();
    expect(judgeKind('win', one).seReached).toBe(false);

    const same = emptyKindStat();
    for (let i = 0; i < 3; i += 1) {
      accountRaceKind(same, 'win', new Map([['1', Math.round(M * 0.3)], ['2', Math.round(M * 0.2)]]), M, ['1']);
    }
    // ★真の値は 0。正典 §13.2 の展開した形 ΣY² − 2R̂·ΣXY + R̂²·ΣX² は、ほぼ同じ大きさの項が打ち消し合うので
    //   浮動小数の丸めが残る（実測 1.7e-8）。上限 0.25pt（0.0025）より 5 桁以上小さく、合否に影響しない
    expect(judgeKind('win', same).se!).toBeLessThan(1e-6);
    expect(judgeKind('win', same).seReached).toBe(true);
    expect(V10_SE_LIMIT).toBe(0.0025);
  });
});
