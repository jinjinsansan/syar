/**
 * ★**騎手を介入に渡しても、この便では 1 ビットも動かない**（★第 4 便・2026-09-16・正典 **D-110**）
 *
 * 【★D-110 が採った形】（★裁定 `REVIEW_CONSULT_HORSE_LIFECYCLE_VERDICT_20260916.md` §3-2）
 *   ① ★**判定窓の広さは AI 代行にも同じ幅**を与える → ★**V-8 の比が保たれる**（D-105 ⑥ とも整合）
 *   ② ★騎手の値打ちは ★**「暴走の抑え」**で出す（★気性難の馬の失敗を減らす方向にだけ効かせる）
 *   ③ ★`INTERVENTION_CAP`（±10%）は ★**動かさない**
 *   ④ ★騎手は ★**出走登録で凍結し、凍結から判定に渡す**（★名簿を引き直さない・D-105 ④）
 *
 * 【★この便の約束】★効かせるのは別の便です。★そのときは **V-13**（必ず動く）を取り直し、
 *   **V-9a**（0.90〜1.10 の不変条件）が破れていないことを確認し、**V-8** の比が保たれることを実測で示します。
 *
 * ⚠️ ★**定数が 0 なだけを合格の根拠にしていません** — ★実際に凍結を渡して判定を回し、
 *    ★渡さない場合と 1 ビット比べます。
 */
import { describe, it, expect } from 'vitest';
import { Rng } from '@star/sim-engine';
import { JOCKEYS, freezeJockey } from '@star/scheduler';
import {
  DEFAULT_INTERVENTION_BALANCE as IB,
  resolveIntervention, aiProxyPlan, optimalPlan, jockeyWindowMultOf, runawayRiskOf,
  startBonusOf,
  type InterventionHorse,
} from '@star/race-engine';

const RACE_M = 2000;

/** ★気性の違う馬（★「暴走」は気性難ほど高い前提なので、★両端を含める） */
const horses: InterventionHorse[] = [
  { iq: 300, gt: 300, st: 300, condition: 2, fatigue: 40, temper: 90 },
  { iq: 500, gt: 500, st: 500, condition: 3, fatigue: 0, temper: 50 },
  { iq: 900, gt: 900, st: 900, condition: 5, fatigue: 0, temper: 10 },
];

const bits = (v: unknown): string => JSON.stringify(v, (_k, x: unknown) =>
  (typeof x === 'number' ? (Object.is(x, -0) ? '-0' : `n:${x.toString()}`) : x));

describe('★騎手は介入に効かない（D-110 の対照・この便は効果 0）', () => {
  it('★★凍結した騎手を渡しても、介入の結果が 1 ビットも変わらない', () => {
    for (const horse of horses) {
      for (const startErrorMs of [-400, -150, 0, 150, 400]) {
        for (const spurtAtMeter of [300, 495, 900, 1500]) {
          for (const driveTapsPerSec of [0, 8, 15]) {
            const plan = { startErrorMs, spurtAtMeter, driveTapsPerSec, position: 'middle' as const };
            const base = resolveIntervention(horse, plan, RACE_M, IB);
            for (const j of JOCKEYS) {
              const frozen = freezeJockey(j.id, 5);
              const withJockey = resolveIntervention(horse, plan, RACE_M, IB, frozen);
              expect(bits(withJockey), `${j.name} 気性${horse.temper}`).toBe(bits(base));
            }
          }
        }
      }
    }
  });

  it('★★判定窓の倍率はどの騎手でも 1（★この便は広げていない）', () => {
    expect(jockeyWindowMultOf(null, IB)).toBe(1);
    for (const j of JOCKEYS) {
      const frozen = freezeJockey(j.id, 5);
      expect(jockeyWindowMultOf(frozen, IB), j.name).toBe(1);
      /** ★窓を渡しても、スタート判定の値が 1 ビット同じ */
      for (const err of [0, 120, 260]) {
        expect(startBonusOf(err, 500, IB, jockeyWindowMultOf(frozen, IB)))
          .toBe(startBonusOf(err, 500, IB));
      }
    }
  });

  it('★★暴走の期待値は 0（★気性難でも・騎手がいてもいなくても）', () => {
    for (const temper of [0, 50, 100]) {
      expect(runawayRiskOf(temper, null, IB)).toBe(0);
      for (const j of JOCKEYS) {
        expect(runawayRiskOf(temper, freezeJockey(j.id, 5), IB), `${j.name} 気性${temper}`).toBe(0);
      }
    }
  });

  it('★★AI 代行と手動最適の比が騎手で変わらない（★V-8 の比を保つ・D-110 ①）', () => {
    /**
     * ★AI 代行にも ★**同じ騎手（同じ窓）**を渡します。★渡し方が手動と違うと、
     * ★V-8（AI ÷ 手動）が騎手ごとに変わります — ★それが裁定が (b) を退けた理由です。
     */
    const ratio = (jockey: ReturnType<typeof freezeJockey> | null): number => {
      const rng = new Rng(4242);
      const horse = horses[1]!;
      let ai = 0;
      for (let i = 0; i < 500; i += 1) {
        const plan = aiProxyPlan(horse, rng, IB);
        ai += resolveIntervention(horse, plan, RACE_M, IB, jockey).interventionMult;
      }
      const manual = resolveIntervention(horse, optimalPlan(IB), RACE_M, IB, jockey).interventionMult;
      return ai / 500 / manual;
    };
    const none = ratio(null);
    for (const j of JOCKEYS) {
      expect(ratio(freezeJockey(j.id, 5)), j.name).toBe(none);
    }
    /** ★比そのものが V-8 の帯にいること（★この便で壊していないことの確認） */
    expect(none).toBeGreaterThan(0.9);
    expect(none).toBeLessThan(1.0);
  });

  it('★★ハードキャップ ±10% を動かしていない（D-110 ③）', () => {
    expect(IB.INTERVENTION_CAP).toBe(0.1);
    for (const horse of horses) {
      for (const j of JOCKEYS) {
        const out = resolveIntervention(horse, optimalPlan(IB), RACE_M, IB, freezeJockey(j.id, 5));
        expect(out.interventionMult).toBeLessThanOrEqual(1.1);
        expect(out.interventionMult).toBeGreaterThanOrEqual(0.9);
      }
    }
  });
});
