/**
 * ★**1 頭・1 キャリアの収支**（★GB-6・2026-09-16・指示書 `DEV_INSTRUCTIONS_GAME_BODY_1_20260916.md` §6・正典 §3.4）
 *
 * 【★見ている壊れ方】
 *   ① ★収支の道具が ★**額を自分で持つ**（★実装を直した日に報告だけが古くなる＝二重帳簿）
 *   ② ★格を上げると ★**支出だけが増えて、得られる時間が増えない**（★D-103 ② の裏返し）
 *   ③ ★購入の価格が ★収支に入っていない（★D-102 ④ の「配合より割高」を測れない）
 */
import { describe, it, expect } from 'vitest';
import { MENUS, MENU_IDS, STABLE_GRADES, gradeEpCost } from '@star/training';
import { JOCKEYS, npcStudFee, sellBackEP } from '@star/scheduler';
import { careerBalance, meanWeeklyTrainingEP, meanJockeyFeeEP, CAREER_ASSUMPTION } from '../src/economy-balance.js';

describe('★1 キャリアの収支（GB-6）', () => {
  it('① ★額は実装の 1 か所から引く（★道具に数を書き写していない）', () => {
    /** ★1 週の平均の調教費は、§7.2 の表（MENUS）から出た値そのもの */
    const want = MENU_IDS.reduce((a, id) => a + MENUS[id].epCost, 0) / MENU_IDS.length;
    expect(meanWeeklyTrainingEP('bronze')).toBeCloseTo(want, 10);
    /** ★騎手の料金の平均は名簿から */
    expect(meanJockeyFeeEP()).toBeCloseTo(JOCKEYS.reduce((a, j) => a + j.feeEP, 0) / JOCKEYS.length, 10);
    /** ★格の倍率は grade.ts から（★道具側に 1.25 などの数が無い） */
    for (const g of STABLE_GRADES) {
      expect(meanWeeklyTrainingEP(g)).toBeCloseTo(
        MENU_IDS.reduce((a, id) => a + gradeEpCost(id, g), 0) / MENU_IDS.length, 10);
    }
  });

  it('② ★収支の内訳がそろっている（★購入・騎手・格が入っている）', () => {
    /** 🔴 ★T-11: ★価格は ★**§10.5 の式**から来ます（★★からではない） */
    const price = npcStudFee(0, 100_000);
    const b = careerBalance('bronze', price);
    expect(b.trainingEP).toBeLessThan(0);
    expect(b.entryEP).toBe(-CAREER_ASSUMPTION.entryFeeEP * CAREER_ASSUMPTION.starts);
    expect(b.jockeyEP, '★騎手の料金が入っている（D-105）').toBeLessThan(0);
    expect(b.purchaseEP, '★購入が入っている（D-102）').toBe(-price);
    expect(b.sellBackEP, '★手放したときの戻り').toBe(sellBackEP(price));
    /** ★支出計は内訳の合計（★取りこぼしが無い） */
    expect(b.totalEP).toBe(b.trainingEP + b.entryEP + b.jockeyEP + b.breedingEP + b.purchaseEP + b.sellBackEP);
  });

  it('③ ★格を上げると支出は増えるが、EP あたりの伸びは変わらない（★D-103 ②）', () => {
    const bronze = careerBalance('bronze', npcStudFee(0, 100_000));
    const gold = careerBalance('gold', npcStudFee(0, 100_000));
    expect(Math.abs(gold.trainingEP)).toBeGreaterThan(Math.abs(bronze.trainingEP));
    /** ★増えたのは調教費だけ（★購入・登録料・騎手・配合は格によらない） */
    expect(gold.entryEP).toBe(bronze.entryEP);
    expect(gold.jockeyEP).toBe(bronze.jockeyEP);
    expect(gold.purchaseEP).toBe(bronze.purchaseEP);
    expect(gold.breedingEP).toBe(bronze.breedingEP);
  });

  it('🔴 ④ ★「同じ EP での期待する★」はもう出せない（★T-11）', () => {
    /**
     * 🔴 ★**2026-09-19・T-11 で成立しなくなりました**。
     *   ★D-102 ④ は「同じ EP での期待する★を報告する」と定めていますが、
     *   ★D-102 ③（2026-09-18 改訂）で ★**価格が素質を入力に取らなくなり**ました。
     *   → ★**価格から★を逆算できません**。★**それが ③ の目的**（「逆算が原理的に起きない」）です。
     *   🔴 ★**③ と ④ が矛盾しています** — ★照会中（`QUESTIONS_T11_20260919.md`）。
     * → ★代わりに ★**戦績が良いほど高い**こと（★式の単調性）を見ます。
     */
    let prev = -Infinity;
    for (const e of [0, 20_000, 100_000, 500_000]) {
      const v = npcStudFee(0, e);
      expect(v, `総獲得賞金 ${e}`).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
    /** ★G1 の方が重い（★8,000 EP 対 総獲得賞金/20） */
    expect(npcStudFee(1, 0)).toBeGreaterThan(npcStudFee(0, 100_000));
  });
});
