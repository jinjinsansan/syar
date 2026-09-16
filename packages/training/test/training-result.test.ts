/**
 * ★**調教の結果の段**（★D12-2・2026-09-16・デザイナーのカード `components/training-result`）
 *
 * 【★見ている壊れ方】
 *   ① ★**新しい抽選が足される**（★正典 D-101「既存の伸びの乱数の上側を見せるだけ」）
 *   ② ★境目が画面側にも書かれる（★D-052・二重帳簿）
 *   ③ ★境目の割合が思っていたものと違う（★「15 週に 1 回」のつもりが毎週出る等）
 *   ④ ★成長しなかった週（故障・休養）に段が出る
 *   ⑤ ★「N 週続けて」の週数を決め打ちして、★ほとんど出ない／毎週出る形になる
 */
import { describe, it, expect } from 'vitest';
import {
  trainingResultTierOf, trainingStreakOf,
  TRAINING_RESULT_THRESHOLDS, TRAINING_RESULT_LABEL, TRAINING_STREAK_WEEKS,
  GAIN_JITTER,
} from '../src/index.js';

/** ★一様分布のうち、その段に入る割合（★`rng.range` が一様なので計算で出る） */
const share = (lo: number, hi: number): number => (hi - lo) / (GAIN_JITTER.max - GAIN_JITTER.min);

describe('★調教の結果の段（D12-2）', () => {
  it('③ ★境目の割合が「15 週に 1 回・10 週に 1 回」になっている', () => {
    const great = share(TRAINING_RESULT_THRESHOLDS.great, GAIN_JITTER.max);
    const up = share(TRAINING_RESULT_THRESHOLDS.up, TRAINING_RESULT_THRESHOLDS.great);
    expect(great, '★GREAT の割合').toBeCloseTo(0.0667, 4);
    expect(up, '★UP の割合').toBeCloseTo(0.1000, 4);
    /** ★合わせて 6 週に 1 回くらい「良い報せ」が出る */
    expect(great + up).toBeCloseTo(0.1667, 4);
  });

  it('① ★見ているのは既存の乱数の範囲だけ（★外の値を段にしない）', () => {
    /** ★`GAIN_JITTER` の外は、そもそも `grow` が引きません */
    expect(TRAINING_RESULT_THRESHOLDS.great).toBeLessThan(GAIN_JITTER.max);
    expect(TRAINING_RESULT_THRESHOLDS.up).toBeGreaterThan(GAIN_JITTER.min);
    expect(TRAINING_RESULT_THRESHOLDS.up).toBeLessThan(TRAINING_RESULT_THRESHOLDS.great);
  });

  it('★境目の両側で段が切り替わる（R-2）', () => {
    expect(trainingResultTierOf(TRAINING_RESULT_THRESHOLDS.great)).toBe('great');
    expect(trainingResultTierOf(TRAINING_RESULT_THRESHOLDS.great - 1e-9)).toBe('up');
    expect(trainingResultTierOf(TRAINING_RESULT_THRESHOLDS.up)).toBe('up');
    expect(trainingResultTierOf(TRAINING_RESULT_THRESHOLDS.up - 1e-9)).toBe('normal');
    /** ★範囲の両端 */
    expect(trainingResultTierOf(GAIN_JITTER.min)).toBe('normal');
    expect(trainingResultTierOf(GAIN_JITTER.max)).toBe('great');
  });

  it('★名前が 3 段ぶんそろっている（★空が無い）', () => {
    for (const t of ['great', 'up', 'normal'] as const) {
      expect(TRAINING_RESULT_LABEL[t].length).toBeGreaterThan(0);
    }
    /** ★「強くなる」と読める語を使わない（★D12-6 の格と同じ線） */
    expect(Object.values(TRAINING_RESULT_LABEL).join('')).not.toMatch(/強化|パワーアップ/);
  });

  it('⑤ ★「N 週続けて」は週数を渡す形（★決め打ちしない）', () => {
    const recent = ['up', 'great', 'normal', 'up'] as const;
    /** ★直近 2 週は UP 以上 */
    expect(trainingStreakOf(recent, 2)).toBe(true);
    /** ★直近 3 週は 3 つ目が通常なので成立しない */
    expect(trainingStreakOf(recent, 3)).toBe(false);
    /** ★足りないときは false（★短い履歴で真にしない） */
    expect(trainingStreakOf(['great'], 2)).toBe(false);
    expect(trainingStreakOf([], 1)).toBe(false);
    expect(trainingStreakOf(recent, 0)).toBe(false);
  });

  it('⑤ ★3 週連続はほとんど出ない（★2 週との差を数で持っておく）', () => {
    const p = share(TRAINING_RESULT_THRESHOLDS.up, GAIN_JITTER.max);
    /** ★UP 以上は 16.7% */
    expect(p).toBeCloseTo(0.1667, 4);
    /** ★2 週続け 2.8%（36 週に 1 回）／★3 週続け 0.46%（216 週に 1 回・現役 182 週で 1 回も出ない馬が多い） */
    expect(p ** 2).toBeCloseTo(0.0278, 4);
    expect(p ** 3).toBeCloseTo(0.0046, 4);
    expect(1 / p ** 3).toBeGreaterThan(182);
  });

  it('⑤ ★週数は 2 週（★デザイナーが 2026-09-16 に確定・★現役の間に出る側を採った）', () => {
    const p = share(TRAINING_RESULT_THRESHOLDS.up, GAIN_JITTER.max);
    /** ★現役 182 週（★§7.1 の 3 歳〜引退）の間に ★**1 回以上出る**週数であること */
    const CAREER_WEEKS = 182;
    expect(CAREER_WEEKS * p ** TRAINING_STREAK_WEEKS, '★現役の間に一度も出ない週数を選んでいる').toBeGreaterThan(1);
    /**
     * ★**1 つ増やすと出なくなる**ことも見ます（★「2 でも 3 でも通る」検査にしない・R-16）。
     * ⚠️ ★これが ★**3 週を採らなかった理由そのもの**です。
     */
    expect(CAREER_WEEKS * p ** (TRAINING_STREAK_WEEKS + 1), '★1 つ増やしても現役の間に出てしまう').toBeLessThan(1);
    /** ★毎週出る形にもしない（★2 週未満を選んでいない） */
    expect(TRAINING_STREAK_WEEKS).toBeGreaterThan(1);
  });
});
