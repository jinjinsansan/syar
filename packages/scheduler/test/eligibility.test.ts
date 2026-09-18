/**
 * ★**出走資格**（CL-1）— 指示書 `DEV_INSTRUCTIONS_RACE_CLASS_20260918.md`
 *
 * 【★見ている壊れ方】
 *   ① ★**段の境目がずれる**（3 勝の馬が 2 勝クラスに出る等）→ ★勝ち上がりが止まる／二重に出られる
 *   ② ★**上の段の馬が下の段に出られる**（★「1 勝クラスに 5 勝馬」＝ 賞金の刈り取り）
 *   ③ ★**数え方が壊れたとき黙って `maiden` に落ちる**（★全馬が新馬戦に出られる・R-27）
 *   ④ ★**重賞に未勝利馬が出る**
 */
import { describe, expect, it } from 'vitest';
import { CLASS_BY_WINS, isEligibleFor, isPromotion, raceClassOfWins, selectEligible, winsRangeFor, type RaceClass } from '../src/index.js';

describe('CL-1 戦績クラス（勝利数 → 段）', () => {
  it('★段の境目（0/1/2/3/4 勝。★両側を押さえる・R-2）', () => {
    expect(raceClassOfWins(0)).toBe('maiden');
    expect(raceClassOfWins(1)).toBe('win1');
    expect(raceClassOfWins(2)).toBe('win2');
    expect(raceClassOfWins(3)).toBe('win3');
    // ★4 勝から上はすべてオープン（★段が伸び続けない）
    expect(raceClassOfWins(4)).toBe('open');
    expect(raceClassOfWins(24)).toBe('open'); // ★キャリア上限まで勝っても open
  });

  it('★段は勝利数に対して単調（★勝って下の段に戻らない）', () => {
    const order: RaceClass[] = ['maiden', 'win1', 'win2', 'win3', 'open'];
    let last = -1;
    for (let w = 0; w <= 30; w += 1) {
      const idx = order.indexOf(raceClassOfWins(w));
      expect(idx, `wins=${w}`).toBeGreaterThanOrEqual(last);
      last = idx;
    }
  });

  it('🔴 ★壊れた勝利数は投げる（★黙って maiden に落とさない・R-27）', () => {
    expect(() => raceClassOfWins(-1)).toThrow();
    expect(() => raceClassOfWins(1.5)).toThrow();
    expect(() => raceClassOfWins(Number.NaN)).toThrow();
  });

  it('★表と関数が一致する（★段の定義を 2 か所に持たない・D-052）', () => {
    CLASS_BY_WINS.forEach((cls, wins) => expect(raceClassOfWins(wins)).toBe(cls));
    expect(CLASS_BY_WINS.length).toBe(4); // ★open は表に入れない（上限が無いため）
  });
});

describe('CL-1 出走資格（レースのクラス × 馬の戦績）', () => {
  it('★ちょうど一致でしか出られない（★勝ち上がりが流れる）', () => {
    expect(isEligibleFor('maiden', 0)).toBe(true);
    expect(isEligibleFor('maiden', 1)).toBe(false); // ★1 勝馬は新馬戦に戻れない
    expect(isEligibleFor('win1', 1)).toBe(true);
    expect(isEligibleFor('win1', 0)).toBe(false);
    expect(isEligibleFor('win1', 2)).toBe(false); // ★2 勝馬が 1 勝クラスを刈り取らない
    expect(isEligibleFor('win3', 3)).toBe(true);
  });

  it('★オープンは 4 勝以上（★上限が無い）', () => {
    expect(isEligibleFor('open', 3)).toBe(false);
    expect(isEligibleFor('open', 4)).toBe(true);
    expect(isEligibleFor('open', 20)).toBe(true);
  });

  it('★重賞はオープン馬だけ（★開発側の解釈・報告に明記）', () => {
    expect(isEligibleFor('graded', 0)).toBe(false);
    expect(isEligibleFor('graded', 3)).toBe(false);
    expect(isEligibleFor('graded', 4)).toBe(true);
  });

  it('★どの勝利数でも、出られるクラスはちょうど 1 つ（重賞を除く）', () => {
    const classes: RaceClass[] = ['maiden', 'win1', 'win2', 'win3', 'open'];
    for (let w = 0; w <= 12; w += 1) {
      const n = classes.filter((c) => isEligibleFor(c, w)).length;
      expect(n, `wins=${w}`).toBe(1);
    }
  });
});

describe('CL-1 勝ち上がり（流量の測定に使う）', () => {
  it('★段が変わる勝利数だけ true', () => {
    expect(isPromotion(0)).toBe(true); // 0 → 1 勝で win1 へ
    expect(isPromotion(1)).toBe(true);
    expect(isPromotion(2)).toBe(true);
    expect(isPromotion(3)).toBe(true); // 3 → 4 勝で open へ
    expect(isPromotion(4)).toBe(false); // ★open の中で勝っても段は動かない
    expect(isPromotion(9)).toBe(false);
  });
});

describe('CL-3 資格で絞る（★枯渇したら下へ広げる・黙って広げない）', () => {
  const horses = (wins: number[]): { w: number }[] => wins.map((w) => ({ w }));
  const winsOf = (h: { w: number }): number => h.w;

  it('★足りていれば広げない（widenedSteps = 0）', () => {
    const pool = horses([1, 1, 1, 1, 1, 1, 1, 1, 0, 5]);
    const r = selectEligible('win1', pool, winsOf, 8);
    expect(r.pool.length).toBe(8);
    expect(r.widenedSteps).toBe(0);
    expect(r.pool.every((h) => h.w === 1)).toBe(true); // ★0 勝も 5 勝も入らない
  });

  it('🔴 ★足りなければ下へ 1 段ずつ広げ、広げた幅を返す', () => {
    // ★2 勝が 2 頭しかいない。1 勝を足しても 5 頭 → さらに 0 勝まで広げて 9 頭
    const pool = horses([2, 2, 1, 1, 1, 0, 0, 0, 0, 4, 4]);
    const r = selectEligible('win2', pool, winsOf, 8);
    expect(r.widenedSteps).toBe(2);
    expect(r.pool.length).toBe(9);
    // ★上の段（4 勝 = open）は入れない（★賞金の刈り取りを作らない）
    expect(r.pool.some((h) => h.w >= 4)).toBe(false);
  });

  it('★新馬戦は下へ広げようがない（widenedSteps は 0 のまま・頭数が足りなくても）', () => {
    const r = selectEligible('maiden', horses([0, 0, 1, 2]), winsOf, 8);
    expect(r.widenedSteps).toBe(0);
    expect(r.pool.length).toBe(2); // ★足りないことは呼ぶ側が扱う（★黙って上の段を混ぜない）
  });

  it('★重賞はオープン馬から。足りなければ下へ広げる', () => {
    const r = selectEligible('graded', horses([4, 5, 3, 3, 3, 3, 3, 3, 3]), winsOf, 8);
    expect(r.widenedSteps).toBe(1);
    expect(r.pool.length).toBe(9);
  });
});

describe('CL-4 必要な勝利数の範囲（★DB に書く形。★SQL に段の定義を写さない）', () => {
  it('★段ごとの範囲', () => {
    expect(winsRangeFor('maiden')).toEqual({ min: 0, max: 0 });
    expect(winsRangeFor('win1')).toEqual({ min: 1, max: 1 });
    expect(winsRangeFor('win2')).toEqual({ min: 2, max: 2 });
    expect(winsRangeFor('win3')).toEqual({ min: 3, max: 3 });
    // ★オープンと重賞は上限なし
    expect(winsRangeFor('open')).toEqual({ min: 4, max: null });
    expect(winsRangeFor('graded')).toEqual({ min: 4, max: null });
  });

  it('🔴 ★範囲と述語が一致する（★二重帳簿にしない・D-052）', () => {
    const classes: RaceClass[] = ['maiden', 'win1', 'win2', 'win3', 'open', 'graded'];
    for (const c of classes) {
      const { min, max } = winsRangeFor(c);
      for (let w = 0; w <= 8; w += 1) {
        const inRange = w >= min && (max === null || w <= max);
        expect(inRange, `${c} wins=${w}`).toBe(isEligibleFor(c, w));
      }
    }
  });
});
