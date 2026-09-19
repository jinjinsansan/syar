/**
 * ★**「前より○○できるようになった」は、一生に 20〜30 回**（★**GB-1 ④**・2026-09-19・オーナー決定）
 *
 * 【★オーナーが決めたこと】★`OWNER_DECISIONS_20260919.md` C-4
 *   > ★**閾値から決めず、「一生で何回 言うか」から決めてください。★私の推しは 20〜30 回**
 *   > ★**今 決めるのは「累積で比べるか、週次で比べるか」の 1 行だけ**
 *
 * 【🔴 ★なぜ値の照合ではなく、★**振る舞い**で守るのか】
 *   ★`GROWTH_TELL_MIN` は ★**較正定数**です（R-14）。★`expect(GROWTH_TELL_MIN).toBe(13)` は
 *   ★**値を書き写すだけ**で、★13 が何を意味するかを守りません。
 *   → ★★**「一生に何回 言うか」を測って、★帯の中に居ることを見ます。**
 *   ★成長の較正（`advanceWeek`）が変われば回数も動くので、★**そのとき落ちます**。
 *   ★それが正しい形です — ★**回数が帯を出たら、幅を決め直すべき**だからです。
 *
 * 【★見ている壊れ方】
 *   ① ★幅を戻す（★8 に戻すと 37.6 回。★符号列が 1.5 倍に増える）
 *   ② ★**週次に戻す**（★1.2 回しか言われない ＝「育った実感」が消える）
 *   ③ ★累積の基準を ★**毎週 更新する**（★週次と同じものになる。★見分けが付きにくい）
 *   ④ ★一生で 1 度も言われない馬が出る（★いちばん悪い体験）
 */
import { describe, expect, it } from 'vitest';
import { GROWTH_TELL_MIN, growthTellsOf, type AbilityKey } from '@star/sim-engine';
import { countTells, measure } from '../src/growth-tell-frequency.js';

/** ★軽く回す（★門で毎回 流れるので）。★本番の判断は 150 頭 × 8 シードで取りました */
const HORSES = 30;
const SEEDS = [42, 7] as const;

describe('GB-1 ④ 一生に何回 言うか', () => {
  const rows = measure(HORSES, SEEDS);
  const current = rows.find((r) => r.minDelta === GROWTH_TELL_MIN);

  it('★測れている（★0 件を「該当なし」と読まない・R-21）', () => {
    expect(rows.length).toBeGreaterThan(5);
    expect(current, `★いまの幅 ${GROWTH_TELL_MIN} が候補に無い（★候補表を直すこと）`).toBeDefined();
    expect(current!.cumulativeMean, '★1 回も言われていない（★測定が空回りしている）').toBeGreaterThan(0);
  });

  it('① ★★いまの幅で、一生 20〜30 回に収まる（★オーナーの推し）', () => {
    expect(current!.cumulativeMean, `★平均 ${current!.cumulativeMean.toFixed(1)} 回（★20〜30 の外）`)
      .toBeGreaterThanOrEqual(20);
    expect(current!.cumulativeMean).toBeLessThanOrEqual(30);
    /** ★大多数の馬が帯の中（★平均だけ合っていて分布がばらけている、を避ける） */
    expect(current!.inTargetShare, '★帯に収まる馬が 9 割に満たない').toBeGreaterThan(0.9);
  });

  it('④ ★★一生で 1 度も言われない馬がいない（★いちばん悪い体験）', () => {
    expect(current!.silentShare).toBe(0);
    expect(current!.cumulativeMin, '★最低でも 1 回は言われる').toBeGreaterThan(0);
  });

  it('② ★★週次では届かない（★だから累積を採った — ★オーナー判断の表の左側を数で）', () => {
    /**
     * 🔴 ★これが「累積か週次か」の決め手です。
     *   ★**どの幅でも**、週次は 20 回に遠く届きません。
     */
    for (const r of rows) {
      expect(r.weeklyMean, `★幅 ${r.minDelta}: 週次が ${r.weeklyMean.toFixed(1)} 回（★20 以上ある）`)
        .toBeLessThan(20);
    }
    expect(current!.weeklyMean, '★いまの幅の週次が多すぎる').toBeLessThan(5);
  });

  it('① ★★旧の幅 8 では多すぎる（★戻したら落ちる）', () => {
    const old = rows.find((r) => r.minDelta === 8);
    expect(old, '★幅 8 が候補に無い（★比較できない）').toBeDefined();
    expect(old!.cumulativeMean, '★旧の幅でも帯の中に入ってしまう（★変えた意味が無い）')
      .toBeGreaterThan(30);
    /** ★符号列が何倍 増えるか（★漏れの大きさ） */
    expect(old!.cumulativeMean / current!.cumulativeMean).toBeGreaterThan(1.3);
  });

  it('③ ★★累積の基準は「言った週」— ★毎週 更新すると週次と同じになる', () => {
    /**
     * ★合成の例で、★2 つの数え方が**別物**であることを見ます。
     * ★毎週 +5 ずつ伸びる馬（★幅 13）:
     *   ★週次 … 1 週の伸びは 5 なので ★**一度も言わない**
     *   ★累積 … 3 週で 15 ≥ 13 なので ★**3 週ごとに言う**
     */
    const keys: AbilityKey[] = ['sp', 'st', 'pw', 'gt', 'iq'];
    const at = (n: number): Record<AbilityKey, number> =>
      Object.fromEntries(keys.map((k) => [k, k === 'sp' ? 100 + n * 5 : 100])) as Record<AbilityKey, number>;
    const weeks = Array.from({ length: 31 }, (_, i) => at(i));
    const c = countTells(weeks, 13);
    expect(c.weekly, '★週次が 1 回でも言っている（★1 週 5 では届かないはず）').toBe(0);
    expect(c.cumulative, '★累積が言っていない（★3 週で 15 ≥ 13）').toBe(10);
  });

  it('★閾値そのものの境界（★両側・R-2）', () => {
    const keys: AbilityKey[] = ['sp', 'st', 'pw', 'gt', 'iq'];
    const base = Object.fromEntries(keys.map((k) => [k, 100])) as Record<AbilityKey, number>;
    const just = { ...base, sp: 100 + GROWTH_TELL_MIN };
    const tiny = { ...base, sp: 100 + GROWTH_TELL_MIN - 1 };
    expect(growthTellsOf(base, just), '★ちょうどで言わない').toEqual(['sp']);
    expect(growthTellsOf(base, tiny), '★1 足りないのに言っている').toEqual([]);
  });

  it('★下がった能力は言わない（★D-116 ④・恒久ダメージは物語の層）', () => {
    const keys: AbilityKey[] = ['sp', 'st', 'pw', 'gt', 'iq'];
    const base = Object.fromEntries(keys.map((k) => [k, 200])) as Record<AbilityKey, number>;
    expect(growthTellsOf(base, { ...base, sp: 100 })).toEqual([]);
  });

  it('★数え方が決定論（★同じ標本からは同じ数・A-2 の前提）', () => {
    expect(measure(10, [42])).toEqual(measure(10, [42]));
  });
});
