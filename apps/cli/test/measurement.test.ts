/**
 * 測定条件が正典 §13.2/§13.3 と一致していること
 *
 * ★これらは**判定を通すために動かせる値**（LONGSHOT_RANKS を 3→5 にすれば V-6 が上がる、
 *   試行数を減らせば V-4 が動く、頭数分布を狭めれば勝率が機械的に上がる）。
 *   「理由付きの免除」にすると変えても何も落ちないので、**正典との一致を照合する**。
 *
 * ★較正定数と扱いが違う理由: 較正定数はゲームの挙動を決めるので振る舞いで守る（R-14）。
 *   測定条件は「どう測るか」なので、正典に固定して値照合で守るのが適切。
 *   R-14 は較正定数についての規則であって、文書化された測定条件の照合を禁じない。
 */

import { FIELD_SIZE } from '../src/race-field.js';
import { describe, expect, it } from 'vitest';
import * as MC from '../src/measurement.js';

describe('測定条件が正典と一致している（§13.2 / §13.3）', () => {
  it('V-6 は下位3ランクの平均で測る（D-022）', () => {
    expect(MC.LONGSHOT_RANKS).toBe(3);
  });

  it('人気推定の試行数は 500', () => {
    expect(MC.POPULARITY_TRIALS).toBe(500);
  });

  it('検証の母集団は 40世代 × 繁殖牝馬400頭', () => {
    expect(MC.POOL_GENERATIONS).toBe(40);
    expect(MC.POOL_MARES).toBe(400);
  });

  it('受け入れ判定のシードは 8 本（★2026-09-19・VP-4 ダッシュ で 4 → 8）', () => {
    expect(MC.VERIFY_RACES).toBe(60_000);
    /**
     * 🔴 ★**2026-09-19・VP-4' で 4 → 8 本**（★裁定 `REVIEW_VP9_FINAL_VERDICT_20260919.md`）。
     *
     *   ✔ ★D-028 の「4 シード × 60,000 で**最大 0.22pt しか動かず**」は ★**合成 400 頭で取った根拠**でした。
     *   🔴 ✔ ★配備の集団では ★**シード間のレンジが A で 1.42pp（6.5 倍）**。
     *   → ★**足りないのはレース数ではなくシード数**でした
     *     （★シード間 SD 0.41〜0.47pp は二項 SE 0.13pp の 3 倍で、★レースを増やしても縮まない）。
     *   ✔ ★実例: ★A→B の差は **4 シードで +0.64pp（2.8σ）→ 8 シードで +0.20pp（1.02σ）**。
     *
     * ⚠️ ★**元の 4 本は先頭に置いてあります**（★過去の値と突き合わせられるように）。
     */
    expect([...MC.VERIFY_SEEDS]).toEqual([42, 7, 2026, 31337, 1, 99, 12345, 65537]);
    expect(MC.VERIFY_SEEDS.slice(0, 4), '★元の 4 本が先頭に無い（★過去と突き合わせられなくなる）')
      .toEqual([42, 7, 2026, 31337]);
    /** ★対照: ★シードが重複していない（★同じ標本を 2 回数えない） */
    expect(new Set(MC.VERIFY_SEEDS).size).toBe(MC.VERIFY_SEEDS.length);
  });

  it('出走頭数は 8〜18頭（正典 §10.4）', () => {
    expect(FIELD_SIZE.MIN).toBe(8);
    expect(FIELD_SIZE.MAX).toBe(18);
  });
});
