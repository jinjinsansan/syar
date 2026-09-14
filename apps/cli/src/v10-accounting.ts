/**
 * ★V-10 の集計と合否（`verify-payout.ts` から切り出し・AUDIT_FIX2 BF-5・BF-6・2026-09-14）
 *
 * 【なぜ切り出したか】
 *   V-10 は 1 本 6 時間を超える。★中身をテストで固定しないと、測定器が製品と別の集合を見ていても気づけない（R-30）。
 *   `apps/cli/test/v10-accounting.test.ts` が、この集計を本番のオッズ表（`buildOddsRows`）と突き合わせる。
 *
 * 【売る目】`sellDecision`（`packages/betting`）だけで決める。本番のオッズ表と**同じ述語**。
 *   ★以前の V-10 は「MC で 1 回以上出た目」をすべて賭け金に入れ、本番が D-035 で売らない目まで数えていた
 *     （`DEV_INSTRUCTIONS_AUDIT_FIX2_20260914.md` §5-1）。
 *   売らない目は、当たっても払わない（本番と同じ）。「売っていたら」の賭け金と払戻額は、D-035 分と D-096 分に分けて数える。
 *
 * 【判定値】切り捨て前の払戻率（D-094: 控除率・還元率は 0.1 単位の切り捨て前の定義）。
 *   切り捨て後の払戻率とその差は、並べて出すだけで判定に使わない。
 *
 * 【SE】出走表間 SD を出し、SE = SD / √レース数 とする（D-036「出走表間 SD を出したうえでプール SE ≤ 0.25pt」）。
 *   ⚠️ 正典に SE の式そのものは無い。レースごとの払戻率を等しい重みで扱う、この実装の解釈（報告に明記する）。
 *   SE が 0.25pt に届かなければ、合否は「判定不能」として扱う（R-3）。
 */
import {
  MARGIN,
  ODDS_CAP,
  debiasedProbability,
  oddsFromProbability,
  sellDecision,
  type SellDecision,
  type TicketKind,
} from '@star/betting';

/** ★正典 §13.2「設定 margin ±1%」の写し（較正定数ではない・`calibration.ts` の EXEMPT） */
export const V10_TOLERANCE = 0.01;

/** ★正典 §13.2（D-036）「プール SE ≤ 0.25pt」の写し（較正定数ではない・`calibration.ts` の EXEMPT） */
export const V10_SE_LIMIT = 0.0025;

export interface UnsoldStat {
  /** 売らなかった目の数（「売っていたら」の賭け金。1 目 1 点） */
  bets: number;
  /** そのうち確定着順で当たった数 */
  hits: number;
  /** 「売っていたら」払っていた額（切り捨て前のオッズ・判定値と同じ定義） */
  payoutBeforeFloor: number;
}

export interface KindStat {
  /** 売った目の数 ＝ 賭け金（1 目 1 点） */
  stake: number;
  /** 払戻（切り捨て後のオッズで払った額） */
  payout: number;
  /** MC で一度も出なかった目が当たった回数（売っていないので払わない） */
  unseenHits: number;
  /** ★配当上限（§9.4）に当たる売り目の数（D-035 の下では 0 のはず） */
  cappedBets: number;
  /** ★cap が無ければ払っていた額との差の総額 */
  cappedLoss: number;
  /** ★0.1 単位の切り捨て（D-094）で減った額の総額 */
  floorLoss: number;
  /** ★D-035（p̂ < p_min）で売らなかった目 */
  unsoldMinProbability: UnsoldStat;
  /** ★D-096（切り捨て前のオッズ < 1.0 倍）で売らなかった目 */
  unsoldEvenOdds: UnsoldStat;
  /** ★出走表間のばらつき（D-036）: レースごとの切り捨て前払戻率の和・二乗和・レース数 */
  raceRateSum: number;
  raceRateSqSum: number;
  races: number;
}

const emptyUnsold = (): UnsoldStat => ({ bets: 0, hits: 0, payoutBeforeFloor: 0 });

export function emptyKindStat(): KindStat {
  return {
    stake: 0, payout: 0, unseenHits: 0, cappedBets: 0, cappedLoss: 0, floorLoss: 0,
    unsoldMinProbability: emptyUnsold(), unsoldEvenOdds: emptyUnsold(),
    raceRateSum: 0, raceRateSqSum: 0, races: 0,
  };
}

/** `b` を `a` に足す（シードをまたいでプールする） */
export function mergeKindStat(a: KindStat, b: KindStat): void {
  a.stake += b.stake;
  a.payout += b.payout;
  a.unseenHits += b.unseenHits;
  a.cappedBets += b.cappedBets;
  a.cappedLoss += b.cappedLoss;
  a.floorLoss += b.floorLoss;
  for (const key of ['unsoldMinProbability', 'unsoldEvenOdds'] as const) {
    a[key].bets += b[key].bets;
    a[key].hits += b[key].hits;
    a[key].payoutBeforeFloor += b[key].payoutBeforeFloor;
  }
  a.raceRateSum += b.raceRateSum;
  a.raceRateSqSum += b.raceRateSqSum;
  a.races += b.races;
}

/**
 * 1 レース・1 券種: **売る目**すべてに 1 点ずつ賭け、確定着順の当たり目で精算して `st` に足す。
 *
 * @param counts  当たり目キー → MC で出た回数（本番の `buildOddsRows` に渡すものと同じ）
 * @param trials  MC 試行数
 * @param winners 確定着順での当たり目キー
 */
export function accountRaceKind(
  st: KindStat,
  kind: TicketKind,
  counts: ReadonlyMap<string, number>,
  trials: number,
  winners: readonly string[],
): void {
  const decisions = new Map<string, SellDecision>();
  let raceStake = 0;
  for (const [key, c] of counts) {
    // ★売る目の判定は本番のオッズ表と同じ述語（R-30）
    const decision = sellDecision(kind, c / trials, trials);
    decisions.set(key, decision);
    if (decision === 'sell') {
      raceStake += 1;
      // ★cap に当たっている売り目を数える（D-035 の下では 0 のはず。立ったら規則が効いていない証拠）
      const pe = debiasedProbability(c / trials, trials);
      if ((1 / pe) * (1 - MARGIN[kind]) > ODDS_CAP[kind]) st.cappedBets += 1;
    } else if (decision === 'below_min_probability') {
      st.unsoldMinProbability.bets += 1;
    } else {
      st.unsoldEvenOdds.bets += 1;
    }
  }
  st.stake += raceStake;

  let racePayoutBeforeFloor = 0;
  for (const key of winners) {
    const c = counts.get(key);
    if (c === undefined) {
      // 売っていない目が当たった ＝ 払戻なし。頻度を報告する（見逃すと払戻率が過大に出る）
      st.unseenHits += 1;
      continue;
    }
    const prob = c / trials;
    // ★raw も補正後で取る（cap の効果を過大に読まない）
    const raw = (1 / debiasedProbability(prob, trials)) * (1 - MARGIN[kind]);
    const beforeFloor = Math.min(ODDS_CAP[kind], raw);
    const decision = decisions.get(key)!;
    if (decision !== 'sell') {
      // ★売らなかった目は払わない。「売っていたら」だけを規則ごとに数える
      const unsold = decision === 'below_min_probability' ? st.unsoldMinProbability : st.unsoldEvenOdds;
      unsold.hits += 1;
      unsold.payoutBeforeFloor += beforeFloor;
      continue;
    }
    const paid = oddsFromProbability(kind, prob, trials);
    st.payout += paid;
    // ★cap による損失と、0.1 単位の切り捨て（D-094）による損失を分けて数える
    if (raw > beforeFloor) st.cappedLoss += raw - beforeFloor;
    st.floorLoss += beforeFloor - paid;
    racePayoutBeforeFloor += beforeFloor;
  }

  if (raceStake > 0) {
    const rate = racePayoutBeforeFloor / raceStake;
    st.raceRateSum += rate;
    st.raceRateSqSum += rate * rate;
    st.races += 1;
  }
}

export interface KindVerdict {
  readonly target: number;
  /** ★判定値（切り捨て前の払戻率・D-094） */
  readonly rateBeforeFloor: number;
  /** 参考（切り捨て後の払戻率） */
  readonly rateAfterFloor: number;
  /** 切り捨て後 − 切り捨て前（切り捨てで減った分・負の値） */
  readonly floorDiff: number;
  /** ★合否（切り捨て前の払戻率で判定） */
  readonly pass: boolean;
  /** 参考（切り捨て後の払戻率で判定した場合） */
  readonly passAfterFloor: boolean;
  /** 出走表間 SD（レースが 2 本未満なら null） */
  readonly raceSd: number | null;
  /** SE = SD / √レース数（レースが 2 本未満なら null） */
  readonly se: number | null;
  /** ★SE が 0.25pt 以下か。false なら合否は判定不能（R-3） */
  readonly seReached: boolean;
}

/**
 * ★V-10 の判定（AUDIT_FIX2 BF-6・D-094）: `|(payout + floorLoss) / stake − (1 − margin)| ≤ 0.01`。
 *   賭け金が 0 なら不合格（判定不能を合格にしない・R-3）。
 */
export function judgeKind(kind: TicketKind, st: KindStat): KindVerdict {
  const target = 1 - MARGIN[kind];
  let raceSd: number | null = null;
  let se: number | null = null;
  if (st.races >= 2) {
    const mean = st.raceRateSum / st.races;
    const variance = Math.max(0, (st.raceRateSqSum - st.races * mean * mean) / (st.races - 1));
    raceSd = Math.sqrt(variance);
    se = raceSd / Math.sqrt(st.races);
  }
  const seReached = se !== null && se <= V10_SE_LIMIT;
  if (st.stake === 0) {
    return {
      target, rateBeforeFloor: Number.NaN, rateAfterFloor: Number.NaN, floorDiff: Number.NaN,
      pass: false, passAfterFloor: false, raceSd, se, seReached,
    };
  }
  const rateAfterFloor = st.payout / st.stake;
  const rateBeforeFloor = (st.payout + st.floorLoss) / st.stake;
  return {
    target,
    rateBeforeFloor,
    rateAfterFloor,
    floorDiff: rateAfterFloor - rateBeforeFloor,
    pass: Math.abs(rateBeforeFloor - target) <= V10_TOLERANCE,
    passAfterFloor: Math.abs(rateAfterFloor - target) <= V10_TOLERANCE,
    raceSd,
    se,
    seReached,
  };
}
