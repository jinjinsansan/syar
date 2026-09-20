/**
 * ★**要る現役頭数は導出する**（★裁定 Q1・2026-09-20）
 *
 * 【★この検査が守るもの】
 *   🔴 ★**`CAREER_RACE_LIMIT` を動かしたら、要る頭数も動くこと。**
 *     ★これが動かないなら、それは「導出」ではなく写しです。
 *     ✔ ★実際、★D-007 の **3,500** は `CC-1 ③`（24 → 40 戦）で古くなったまま残っていました。
 */
import { describe, expect, it } from 'vitest';
import {
  CAREER_DAYS,
  CAREER_RACE_LIMIT,
  CAREER_WEEKS,
  LIFECYCLE_WEEKS,
  RACES_PER_DAY,
  STARTS_PER_HORSE_PER_DAY,
  poolHeadroom,
  requiredActivePool,
  totalStartsPerDay,
} from '../src/index.js';

/**
 * ★D-007 が使った ★**実測の平均出走頭数**。
 * ⚠️ ★§10.4 の「8〜18 頭」の中点（13.0）ではありません。★**測った数**です。
 */
const MEAN_FIELD_MEASURED = 13.46;

describe('★導出の土台', () => {
  it('★現役は 156 週 ＝ 26 日（★正典 §7.1・D-007）', () => {
    expect(CAREER_WEEKS).toBe(LIFECYCLE_WEEKS.retireAt - LIFECYCLE_WEEKS.raceableFrom);
    expect(CAREER_WEEKS).toBe(156);
    expect(CAREER_DAYS).toBe(26);
  });

  it('★1 頭が 1 日に走る回数は、★キャリア上限から出る', () => {
    expect(STARTS_PER_HORSE_PER_DAY).toBeCloseTo(CAREER_RACE_LIMIT / 26, 10);
    // ★いま 40 戦なので約 1.54（★24 戦のときは 0.92 だった）
    expect(STARTS_PER_HORSE_PER_DAY).toBeCloseTo(1.538, 3);
  });

  it('★1 日の延べ出走数は `RACES_PER_DAY × 平均頭数`', () => {
    expect(totalStartsPerDay(MEAN_FIELD_MEASURED)).toBeCloseTo(RACES_PER_DAY * 13.46, 6);
  });
});

describe('🔴 ★要る頭数', () => {
  it('★いまの条件（240R・40 戦）で 2,098 頭ほど', () => {
    const n = requiredActivePool(MEAN_FIELD_MEASURED);
    expect(n).toBeGreaterThan(2000);
    expect(n).toBeLessThan(2200);
  });

  it('🔴 ★**プリシードの現役 2,400 頭で足りる**（★実測の頭数と突き合わせる）', () => {
    /** ✔ `evidence/20260920-world-supply/`: ★現役 **2,400 頭**（★800 × 3 コホート） */
    const h = poolHeadroom(2400, MEAN_FIELD_MEASURED);
    expect(h.spare, `★足りない（要 ${h.required}）`).toBeGreaterThan(0);
    expect(h.ratioMinusOne).toBeGreaterThan(0.1);
  });

  it('🔴 ★キャリア上限を動かすと、★要る頭数が動く（★写しならここが落ちる）', () => {
    /**
     * ★`STARTS_PER_HORSE_PER_DAY` は `CAREER_RACE_LIMIT` から導かれています。
     * ★同じ算術を 24 戦で組み直すと、★D-007 の本文の 3,500 に戻るはずです。
     * → ★★**3,500 は「昔の条件での答え」であって、★いまの答えではない**ことの確認。
     */
    const startsPerDayAt24 = 24 / CAREER_DAYS;
    expect(startsPerDayAt24).toBeCloseTo(0.923, 3);
    const requiredAt24 = Math.ceil((RACES_PER_DAY * MEAN_FIELD_MEASURED) / startsPerDayAt24);
    expect(requiredAt24, '★24 戦なら D-007 の 3,500 付近').toBeGreaterThan(3400);
    expect(requiredAt24).toBeLessThan(3600);

    // ★いまの答えは、それより**ずっと少ない**
    expect(requiredActivePool(MEAN_FIELD_MEASURED)).toBeLessThan(requiredAt24 * 0.7);
  });

  it('★頭数が増えれば余力も増える（★向き）', () => {
    const a = poolHeadroom(2400, MEAN_FIELD_MEASURED);
    const b = poolHeadroom(3000, MEAN_FIELD_MEASURED);
    expect(b.spare).toBeGreaterThan(a.spare);
    expect(b.ratioMinusOne).toBeGreaterThan(a.ratioMinusOne);
  });
});

describe('🔴 ★既定値を置かない', () => {
  it('★平均出走頭数を渡さないと**投げる**（★出どころの分からない数を増やさない）', () => {
    // @ts-expect-error ★引数なしで呼べないことを型でも押さえる
    expect(() => requiredActivePool()).toThrow(/平均出走頭数/);
    expect(() => requiredActivePool(0)).toThrow(/平均出走頭数/);
    expect(() => requiredActivePool(-1)).toThrow(/平均出走頭数/);
    expect(() => requiredActivePool(Number.NaN)).toThrow(/平均出走頭数/);
  });
});
