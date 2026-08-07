/**
 * §11.2 PP 発行量の監視。
 *
 * ★R-16 の適用が要点: 券種横断の1つの比では、券種ごとの偏りが打ち消し合って見えなくなる。
 */

import { describe, expect, it } from 'vitest';
import {
  MARGIN,
  MARGIN_ALERT_THRESHOLD,
  isPpNetHealthy,
  summarizeDay,
  type PointFlowInput,
} from '../src/index.js';

const base: PointFlowInput = {
  byKind: {},
  epInflow: 0,
  epBurnedOther: 0,
  ppPrize: 0,
  ppExchanged: 0,
};

/** 設定どおりの控除率で売れた日 */
const onTarget = (kind: 'win' | 'trifecta', stake: number) => ({
  stake,
  payout: stake * (1 - MARGIN[kind]),
  refund: 0,
});

describe('§11.2 乖離アラート', () => {
  it('正典の閾値は3%', () => {
    expect(MARGIN_ALERT_THRESHOLD).toBe(0.03);
  });

  it('設定どおりならアラートは出ない', () => {
    const d = summarizeDay({ ...base, byKind: { win: onTarget('win', 100_000) } });
    expect(d.byKind[0]!.marginActual).toBeCloseTo(0.18, 10);
    expect(d.alert).toBe(false);
  });

  it('★券種横断の比では偏りが打ち消し合って見えない（R-16）', () => {
    // 単勝が大きく上振れ、三連単が同じだけ下振れした日。
    // 合計では正常に見えるが、どちらも単体では異常。
    const d = summarizeDay({
      ...base,
      byKind: {
        win: { stake: 100_000, payout: 70_000, refund: 0 }, // 実控除 30%（設定18%）
        trifecta: { stake: 100_000, payout: 100_000, refund: 0 }, // 実控除 0%（設定23%）
      },
    });
    // 横断で見ると 15% で、設定平均（20.5%）から 5.5pt。券種別なら +12pt と −23pt
    expect(Math.abs(d.marginActualOverall - 0.205)).toBeLessThan(0.06);
    // ★券種別に見れば両方ともアラート
    expect(d.byKind.every((k) => k.alert)).toBe(true);
    expect(d.alert).toBe(true);
  });

  it('★控除率が高すぎる側もアラートにする（客が損し続けるのを見逃さない）', () => {
    const d = summarizeDay({
      ...base,
      byKind: { win: { stake: 100_000, payout: 60_000, refund: 0 } }, // 実控除 40%
    });
    expect(d.byKind[0]!.deviation).toBeGreaterThan(0);
    expect(d.byKind[0]!.alert).toBe(true);
  });

  it('★売上ゼロの券種は判定から外す（売れない日に毎回アラートを出さない）', () => {
    const d = summarizeDay({
      ...base,
      byKind: { win: onTarget('win', 1000), trifecta: { stake: 0, payout: 0, refund: 0 } },
    });
    expect(d.byKind.length).toBe(1);
    expect(d.alert).toBe(false);
  });
});

describe('§11.2 / V-11 PP の純発行量', () => {
  it('発行 = 賞金 + 払戻、純発行 = 発行 − 交換', () => {
    const d = summarizeDay({
      ...base,
      byKind: { win: onTarget('win', 100_000) },
      ppPrize: 50_000,
      ppExchanged: 120_000,
    });
    expect(d.ppIssued).toBe(50_000 + 82_000);
    expect(d.ppNet).toBe(132_000 - 120_000);
  });

  it('★EP の焼却に馬券の控除ぶんが入る（控除は EP 経済の最大シンク・§9.3）', () => {
    const d = summarizeDay({
      ...base,
      byKind: { win: onTarget('win', 100_000) },
      epBurnedOther: 5_000,
    });
    expect(d.epBurned).toBe(18_000 + 5_000);
  });

  it('★純発行の健全性は比で見る（絶対額では規模が変わると判定できない）', () => {
    const small = summarizeDay({ ...base, ppPrize: 100, ppExchanged: 98 });
    const large = summarizeDay({ ...base, ppPrize: 100_000_000, ppExchanged: 98_000_000 });
    // 額は100万倍違うが、比は同じなので判定も同じでなければならない
    expect(isPpNetHealthy(small)).toBe(isPpNetHealthy(large));
  });

  it('★発行が交換を大きく上回る日は不健全（PP が膨張している）', () => {
    const d = summarizeDay({ ...base, ppPrize: 1_000_000, ppExchanged: 0 });
    expect(isPpNetHealthy(d)).toBe(false);
  });

  it('発行ゼロの日は健全（ゼロ除算にしない）', () => {
    expect(isPpNetHealthy(summarizeDay(base))).toBe(true);
  });
});
