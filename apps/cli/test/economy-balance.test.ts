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
import { JOCKEYS, priceOfStars, sellBackEP } from '@star/scheduler';
import { careerBalance, meanWeeklyTrainingEP, meanJockeyFeeEP, starsPerEP, CAREER_ASSUMPTION } from '../src/economy-balance.js';

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
    const b = careerBalance('bronze', 3);
    expect(b.trainingEP).toBeLessThan(0);
    expect(b.entryEP).toBe(-CAREER_ASSUMPTION.entryFeeEP * CAREER_ASSUMPTION.starts);
    expect(b.jockeyEP, '★騎手の料金が入っている（D-105）').toBeLessThan(0);
    expect(b.purchaseEP, '★購入が入っている（D-102）').toBe(-priceOfStars(3));
    expect(b.sellBackEP, '★手放したときの戻り').toBe(sellBackEP(priceOfStars(3)));
    /** ★支出計は内訳の合計（★取りこぼしが無い） */
    expect(b.totalEP).toBe(b.trainingEP + b.entryEP + b.jockeyEP + b.breedingEP + b.purchaseEP + b.sellBackEP);
  });

  it('③ ★格を上げると支出は増えるが、EP あたりの伸びは変わらない（★D-103 ②）', () => {
    const bronze = careerBalance('bronze', 3);
    const gold = careerBalance('gold', 3);
    expect(Math.abs(gold.trainingEP)).toBeGreaterThan(Math.abs(bronze.trainingEP));
    /** ★増えたのは調教費だけ（★購入・登録料・騎手・配合は格によらない） */
    expect(gold.entryEP).toBe(bronze.entryEP);
    expect(gold.jockeyEP).toBe(bronze.jockeyEP);
    expect(gold.purchaseEP).toBe(bronze.purchaseEP);
    expect(gold.breedingEP).toBe(bronze.breedingEP);
  });

  it('④ ★同じ EP での期待する★（★D-102 ④ の報告の材料）', () => {
    /** ★★が高いほど 1 EP あたりの★は下がる（★高い馬ほど割高＝配合を中核に保つ向き） */
    let prev = Infinity;
    for (const s of [2, 3, 4, 5]) {
      const v = starsPerEP(s);
      expect(v, `★${s}`).toBeLessThanOrEqual(prev);
      prev = v;
    }
    expect(starsPerEP(3)).toBeCloseTo(3 / priceOfStars(3), 12);
  });
});
