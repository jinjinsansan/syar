/**
 * K-3 介入モデルの回帰テスト（正典 §8b）
 *
 * ★最重要は**ハードキャップ ±10%**（§1.5-1「育成が主・操作が従」の担保）。
 *   ここが漏れると「操作が上手い人だけ勝つ」ゲームになり、D-006 の安全条件が崩れる。
 *   したがって上下両側（R-2）と、極端な入力を総当たりで押さえる。
 */

import { Rng } from '@star/sim-engine';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_INTERVENTION_BALANCE as IB,
  aiProxyPlan,
  driveBonusOf,
  drainPerSecond,
  initialStamina,
  optimalPlan,
  resolveIntervention,
  spurtBonusOf,
  startBonusOf,
  type InterventionHorse,
  type InterventionPlan,
} from '../src/index.js';

const neutralHorse: InterventionHorse = { iq: 500, gt: 500, st: 500, condition: 3, fatigue: 0 };
/** 2000m を約2分で走る想定の平均速度 */
const SPEED_MPS = 16.6;
/** 2000m を想定（D-017 で距離が要るようになった） */
const RACE_M = 2000;

describe('§8b.2 スタミナゲージ', () => {
  it('初期値は正典の式そのもの: clamp(50 + ST/20 + (condition-3)*4 - max(0,fatigue-50)/2, 20, 100)', () => {
    // ST1000・絶好調(5)・疲労なし → 50 + 50 + 8 = 108 → 100 で頭打ち（正典のコメントどおり）
    expect(initialStamina(1000, 5, 0, IB)).toBe(100);
    // 中立
    expect(initialStamina(500, 3, 0, IB)).toBeCloseTo(75, 10);
    // 疲労は50を超えた分だけ効く（R-2 両側）
    expect(initialStamina(500, 3, 50, IB)).toBeCloseTo(75, 10);
    expect(initialStamina(500, 3, 100, IB)).toBeCloseTo(50, 10);
    // 下限20
    expect(initialStamina(0, 1, 100, IB)).toBe(20);
  });

  it('消費はポジション係数と仕掛け倍率の積（正典 §8b.2）', () => {
    expect(drainPerSecond('middle', false, false, IB)).toBeCloseTo(1.0, 10);
    expect(drainPerSecond('front', false, false, IB)).toBeCloseTo(1.3, 10);
    expect(drainPerSecond('back', false, false, IB)).toBeCloseTo(0.85, 10);
    // 仕掛け中は3倍
    expect(drainPerSecond('middle', true, false, IB)).toBeCloseTo(3.0, 10);
    // 早仕掛けはさらに1.6倍
    expect(drainPerSecond('middle', true, true, IB)).toBeCloseTo(4.8, 10);
  });
});

describe('§8b.3 各局面のボーナス', () => {
  it('スタート: 誤差0が満点、外すほど下限へ単調に落ちる（R-2 両側・値域 -0.04〜+0.03）', () => {
    expect(startBonusOf(0, 500, IB)).toBeCloseTo(IB.START_BONUS_MAX, 10);
    // 判定窓の外は下限で頭打ち（左右対称）
    expect(startBonusOf(100000, 500, IB)).toBeCloseTo(IB.START_BONUS_MIN, 10);
    expect(startBonusOf(-100000, 500, IB)).toBeCloseTo(IB.START_BONUS_MIN, 10);
    expect(startBonusOf(-100, 500, IB)).toBeCloseTo(startBonusOf(100, 500, IB), 12);
    // 単調減少
    let prev = startBonusOf(0, 500, IB);
    for (const err of [50, 100, 150, 200, 225, 300]) {
      const v = startBonusOf(err, 500, IB);
      expect(v).toBeLessThanOrEqual(prev + 1e-12);
      prev = v;
    }
    // 値域の外には出ない（浮動小数の丸め分だけ許容する）
    for (const err of [-5000, -300, -150, 0, 150, 300, 5000]) {
      const v = startBonusOf(err, 500, IB);
      expect(v).toBeGreaterThanOrEqual(IB.START_BONUS_MIN - 1e-12);
      expect(v).toBeLessThanOrEqual(IB.START_BONUS_MAX + 1e-12);
    }
  });

  it('スタート: IQ が高いほど判定幅が広い（正典 §8b.3「判定幅は IQ に比例」）', () => {
    // 同じ誤差でも IQ1000 のほうが有利
    // ★誤差が IQ1000 の判定窓(300ms)以上だと両者とも下限に張り付き、比較にならない。
    //   窓の内側でだけ差が出るのが正しい挙動なので、比較点は窓の内側から取る。
    for (const err of [100, 200, 250]) {
      expect(startBonusOf(err, 1000, IB), `誤差${err}ms`).toBeGreaterThan(
        startBonusOf(err, 0, IB),
      );
    }
    // IQ0 の判定窓はラグ猶予150ms ちょうど（§8b.6 は全員に適用される）
    expect(startBonusOf(150, 0, IB)).toBeCloseTo(IB.START_BONUS_MIN, 10);
    expect(startBonusOf(150, 1000, IB)).toBeGreaterThan(IB.START_BONUS_MIN);
  });

  it('仕掛け: 適正区間で最大、外れるほど下限（正典の値域 -0.08〜+0.09）', () => {
    const best = IB.EARLY_SPURT_METER * 0.55;
    expect(spurtBonusOf(best, IB)).toBeCloseTo(IB.SPURT_BONUS_MAX, 10);
    // 早すぎ・遅すぎの両側で下がる（R-2）
    expect(spurtBonusOf(2000, IB)).toBeCloseTo(IB.SPURT_BONUS_MIN, 10);
    expect(spurtBonusOf(0, IB)).toBeLessThan(IB.SPURT_BONUS_MAX);
    for (const m of [0, 200, 495, 900, 1500, 3000]) {
      const v = spurtBonusOf(m, IB);
      expect(v).toBeGreaterThanOrEqual(IB.SPURT_BONUS_MIN);
      expect(v).toBeLessThanOrEqual(IB.SPURT_BONUS_MAX);
    }
  });

  it('直線: 0〜+0.10 × GT/1000。連打は秒間15回で頭打ち（正典 §8b.6）', () => {
    expect(driveBonusOf(0, 1000, IB)).toBe(0);
    expect(driveBonusOf(15, 1000, IB)).toBeCloseTo(0.1, 10);
    expect(driveBonusOf(15, 500, IB)).toBeCloseTo(0.05, 10);
    // 15回を超えても増えない（マクロで有利にならない）
    expect(driveBonusOf(100, 1000, IB)).toBeCloseTo(0.1, 10);
    expect(driveBonusOf(1000, 1000, IB)).toBeCloseTo(0.1, 10);
  });
});

describe('§8b.3 interventionMult のハードキャップ（±10%）', () => {
  it('最良入力でも 1.10 を超えない', () => {
    const best = optimalPlan(IB);
    const strong: InterventionHorse = { iq: 1000, gt: 1000, st: 1000, condition: 5, fatigue: 0 };
    const out = resolveIntervention(strong, best, SPEED_MPS, RACE_M, IB);
    expect(out.interventionMult).toBeLessThanOrEqual(1.1);
    expect(out.interventionMult).toBeCloseTo(1.1, 10);
  });

  it('最悪入力でも 0.90 を下回らない（早仕掛け -0.15 を含めても）', () => {
    const worst: InterventionPlan = {
      startErrorMs: 100000,
      spurtAtMeter: 3000,
      driveTapsPerSec: 0,
      position: 'front',
    };
    const weak: InterventionHorse = { iq: 0, gt: 0, st: 0, condition: 1, fatigue: 100 };
    const out = resolveIntervention(weak, worst, SPEED_MPS, RACE_M, IB);
    expect(out.ranEmpty).toBe(true);
    // クランプ前は 0.90 を割っている（＝ペナルティがクランプ前に効いている・正典の明記事項）
    expect(out.rawMult).toBeLessThan(0.9);
    // クランプ後は下限ちょうど
    expect(out.interventionMult).toBe(0.9);
  });

  it('入力を総当たりしてもキャップ外に出ない（R-2 の網羅版）', () => {
    const horses: InterventionHorse[] = [
      { iq: 0, gt: 0, st: 0, condition: 1, fatigue: 100 },
      { iq: 500, gt: 500, st: 500, condition: 3, fatigue: 0 },
      { iq: 1000, gt: 1000, st: 1000, condition: 5, fatigue: 0 },
    ];
    let sawCapTop = false;
    let sawCapBottom = false;
    for (const horse of horses) {
      for (const startErrorMs of [-100000, -400, -150, 0, 150, 400, 100000]) {
        for (const spurtAtMeter of [0, 300, 495, 900, 1200, 3000]) {
          for (const driveTapsPerSec of [0, 5, 15, 1000]) {
            for (const position of ['front', 'middle', 'back'] as const) {
              const out = resolveIntervention(
                horse,
                { startErrorMs, spurtAtMeter, driveTapsPerSec, position },
                SPEED_MPS,
                RACE_M,
                IB,
              );
              expect(out.interventionMult).toBeGreaterThanOrEqual(0.9);
              expect(out.interventionMult).toBeLessThanOrEqual(1.1);
              if (out.interventionMult >= 1.1 - 1e-12) sawCapTop = true;
              if (out.interventionMult <= 0.9 + 1e-12) sawCapBottom = true;
            }
          }
        }
      }
    }
    // ★キャップが「一度も効いていない」なら、このテストは何も守っていない（R-3 の精神）
    expect(sawCapTop, '上限クランプが一度も発生していない').toBe(true);
    expect(sawCapBottom, '下限クランプが一度も発生していない').toBe(true);
  });

  it('早仕掛けペナルティはクランプ前に効く（順序を入れ替える改変を検出する）', () => {
    // ゲージが尽きる条件を作り、rawMult と interventionMult の差で順序を観測する
    const weak: InterventionHorse = { iq: 1000, gt: 1000, st: 0, condition: 1, fatigue: 100 };
    const early: InterventionPlan = {
      startErrorMs: 0,
      spurtAtMeter: 2000, // 900m 超 = 早仕掛け
      driveTapsPerSec: 15,
      position: 'front',
    };
    const out = resolveIntervention(weak, early, SPEED_MPS, RACE_M, IB);
    expect(out.ranEmpty).toBe(true);
    // クランプ後に -0.15 していたら 0.75 になる。クランプ前なら 0.90 で止まる
    expect(out.interventionMult).toBe(0.9);
    expect(out.interventionMult).toBeGreaterThanOrEqual(0.9);
  });
});

describe('§8b.5 AI 代行', () => {
  it('AI 代行はキャップ内に収まり、極端に不利でも有利でもない', () => {
    const rng = new Rng(42);
    const mults: number[] = [];
    for (let i = 0; i < 2000; i++) {
      const plan = aiProxyPlan(neutralHorse, rng, IB);
      const out = resolveIntervention(neutralHorse, plan, SPEED_MPS, RACE_M, IB);
      expect(out.interventionMult).toBeGreaterThanOrEqual(0.9);
      expect(out.interventionMult).toBeLessThanOrEqual(1.1);
      mults.push(out.interventionMult);
    }
    const mean = mults.reduce((a, b) => a + b, 0) / mults.length;
    // 「操作しないと大損」にしない（§8b.5）— 平均が1を大きく割らない
    expect(mean).toBeGreaterThan(0.98);
    expect(mean).toBeLessThan(1.1);
  });

  it('AI 代行は決定的（同じ Rng 列なら同じプラン）', () => {
    const a = aiProxyPlan(neutralHorse, new Rng(7), IB);
    const b = aiProxyPlan(neutralHorse, new Rng(7), IB);
    expect(b).toEqual(a);
  });

  it('IQ が高いほど AI のスタート判定が安定する（§8b.5「IQ 基準の標準判定」）', () => {
    const spread = (iq: number): number => {
      const rng = new Rng(123);
      const errs: number[] = [];
      for (let i = 0; i < 3000; i++) {
        errs.push(Math.abs(aiProxyPlan({ ...neutralHorse, iq }, rng, IB).startErrorMs));
      }
      return errs.reduce((a, b) => a + b, 0) / errs.length;
    };
    expect(spread(1000)).toBeLessThan(spread(0));
  });

  it('手動最適プランは全項目が理論上の最良値', () => {
    const p = optimalPlan(IB);
    expect(p.startErrorMs).toBe(0);
    expect(p.driveTapsPerSec).toBe(IB.TAP_RATE_CAP);
    expect(spurtBonusOf(p.spurtAtMeter, IB)).toBeCloseTo(IB.SPURT_BONUS_MAX, 10);
  });
});

/**
 * V-13（正典 §13.2・2026-08-06）: 仕掛けの巧拙が結果に出ること。
 *
 * ★R-16 の直接の産物。旧スタミナ実装では**全馬のゲージが必ず空になり**、
 * どう仕掛けても倍率が同じだった。V-8（比）も V-9a（範囲）も、
 * 全馬に一律に掛かるその歪みを検出できなかった。
 * 「上手い仕掛け」と「下手な仕掛け」の**差**だけが、その状態で消える。
 */
describe('★V-13 仕掛けの巧拙', () => {
  const B = IB;
  /** 全能力500・万全の中立馬（正典の基準馬） */
  const neutralIntervener = (): InterventionHorse => ({ iq: 500, gt: 500, st: 500, condition: 3, fatigue: 0 });

  /** 距離・平均速度は §8.4 の実効域から取る。2000m を 120秒＝16.67m/s */
  const DIST = 2000;
  const SPEED = 16.67;

  it('★早すぎるスパートは最適な仕掛けより倍率が低い（差は 0.03 以上）', () => {
    const horse = neutralIntervener();
    const best = resolveIntervention(horse, optimalPlan(B), SPEED, DIST, B);
    const early = resolveIntervention(
      horse,
      { ...optimalPlan(B), spurtAtMeter: B.EARLY_SPURT_METER * 1.6 },
      SPEED,
      DIST,
      B,
    );
    // 較正定数を閾値に使わない（D-018 の教訓・自己検出の回避）。リテラルで押さえる。
    expect(best.interventionMult - early.interventionMult).toBeGreaterThan(0.03);
  });

  it('★どの距離でも巧拙の差が消えない（時間比例スタミナ・D-017）', () => {
    // 距離不変性が壊れると、短距離か長距離のどちらかで差がゼロに潰れる。
    for (const d of [1200, 1600, 2400, 3200]) {
      const horse = neutralIntervener();
      const best = resolveIntervention(horse, optimalPlan(B), SPEED, d, B);
      const early = resolveIntervention(
        horse,
        { ...optimalPlan(B), spurtAtMeter: B.EARLY_SPURT_METER * 1.6 },
        SPEED,
        d,
        B,
      );
      expect(best.interventionMult - early.interventionMult).toBeGreaterThan(0.03);
    }
  });
});
