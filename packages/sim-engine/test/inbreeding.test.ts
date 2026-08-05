/**
 * 近交係数 F の既知ケース検証 — 指示書 §3.5-2
 *
 * Wright の式:  F = Σ_A Σ_paths (0.5)^(n1 + n2 + 1) × (1 + F_A)
 *   n1 = 父から共通祖先 A までの代数 / n2 = 母から A までの代数
 *   父側経路と母側経路は A 以外の個体を共有してはならない（共有すると血の重複を二重計上する）
 */

import { describe, expect, it } from 'vitest';
import { DEFAULT_BALANCE } from '../src/balance.js';
import { breed } from '../src/breeding.js';
import { calcInbreedCoefficient } from '../src/inbreeding.js';
import { Herd } from './helpers.js';

const DEPTH = 5;

describe('近交係数 F（Wright）', () => {
  it('無関係な配合は F = 0', () => {
    const herd = new Herd();
    const sireSire = herd.add('SS', 'male');
    const sireDam = herd.add('SD', 'female');
    const damSire = herd.add('DS', 'male');
    const damDam = herd.add('DD', 'female');
    const sire = herd.add('S', 'male', sireSire, sireDam);
    const dam = herd.add('D', 'female', damSire, damDam);

    expect(calcInbreedCoefficient(sire, dam, herd.lookup, DEPTH).F).toBe(0);
  });

  it('親子交配は F = 0.25', () => {
    // 導出: 共通祖先は父 A 自身。n1 = 0（A 自身）, n2 = 1（娘 C から A まで1代）
    //       F = (1/2)^(0+1+1) × (1+0) = 1/4
    const herd = new Herd();
    const a = herd.add('A', 'male');
    const b = herd.add('B', 'female');
    const c = herd.add('C', 'female', a, b); // A の娘

    expect(calcInbreedCoefficient(a, c, herd.lookup, DEPTH).F).toBeCloseTo(0.25, 12);
  });

  it('全兄妹交配は F = 0.25', () => {
    // 導出: 共通祖先は父 A と母 B の2頭。どちらも n1 = n2 = 1
    //       F = 2 × (1/2)^(1+1+1) = 2 × 1/8 = 1/4
    const herd = new Herd();
    const a = herd.add('A', 'male');
    const b = herd.add('B', 'female');
    const brother = herd.add('BRO', 'male', a, b);
    const sister = herd.add('SIS', 'female', a, b);

    const result = calcInbreedCoefficient(brother, sister, herd.lookup, DEPTH);
    expect(result.F).toBeCloseTo(0.25, 12);
    expect(result.contributions).toHaveLength(2);
  });

  it('半兄妹交配は F = 0.125', () => {
    // 共通祖先は父 A のみ: F = (1/2)^(1+1+1) = 1/8
    const herd = new Herd();
    const a = herd.add('A', 'male');
    const b1 = herd.add('B1', 'female');
    const b2 = herd.add('B2', 'female');
    const brother = herd.add('BRO', 'male', a, b1);
    const sister = herd.add('SIS', 'female', a, b2);

    expect(calcInbreedCoefficient(brother, sister, herd.lookup, DEPTH).F).toBeCloseTo(0.125, 12);
  });

  it('3×4 クロスは F = 0.015625 (= 1/64)', () => {
    // 「3×4」は仔から見て第3代と第4代に同じ祖先 X が現れる配合。
    // 親から見た代数は n1 = 2（父の第2代）, n2 = 3（母の第3代）なので
    //       F = (1/2)^(2+3+1) × (1+0) = (1/2)^6 = 1/64 = 0.015625
    // これはサラブレッド生産で言われる「3×4 = 1.56%」と一致する。
    //
    // ※ 指示書 §3.5-2 には 3×4 の期待値として 0.0703125 (= 9/128) と書かれているが、
    //   Wright の式から 3×4 単独でこの値は導出できない（下の多重クロスのテストを参照）。
    //   REPORT_P0 §5 に照会事項として記載した。
    const herd = new Herd();
    const x = herd.add('X', 'male');

    // 父 S: S → P1 → X （X は父の2代前）
    const p1 = herd.descendLine('SIRE', x, 1, 'male'); // X の子
    const p1Mate = herd.add('S_MATE', 'female');
    const sire = herd.add('S', 'male', p1, p1Mate);

    // 母 D: D → Q1 → Q2 → X （X は母の3代前）
    const q2 = herd.descendLine('DAM', x, 2, 'male'); // X の孫
    const q2Mate = herd.add('D_MATE', 'female');
    const dam = herd.add('D', 'female', q2, q2Mate);

    const result = calcInbreedCoefficient(sire, dam, herd.lookup, DEPTH);
    expect(result.F).toBeCloseTo(1 / 64, 12);
    expect(result.topAncestorId).toBe('X');
  });

  it('独立した2つのクロスは加算される（2×3 + 4×4 = 0.0703125）', () => {
    // 指示書の 0.0703125 (= 9/128) は「単一の 3×4」からは出ないが、
    // 複数の共通祖先の寄与を足し合わせると厳密に一致する組み合わせが存在する:
    //   祖先 X: n1 = 1, n2 = 2  → (1/2)^4  = 0.0625      （仔から見て 2×3）
    //   祖先 Y: n1 = 3, n2 = 3  → (1/2)^7  = 0.0078125   （仔から見て 4×4）
    //   合計 = 0.0703125
    // 「共通祖先ごと・経路ごとに足し上げる」実装が正しいことの確認。
    const herd = new Herd();

    // --- X 側: X は父の1代前（父の父）かつ母の2代前（母の父の父）
    const x = herd.add('X', 'male');
    const xChild = herd.descendLine('XD', x, 1, 'male'); // X の子。母の父になる

    // --- Y 側: Y は父の3代前かつ母の3代前
    const y = herd.add('Y', 'male');
    const yChildS = herd.descendLine('YS', y, 1, 'female'); // Y の娘（父の母の母になる）
    const yChildD = herd.descendLine('YD', y, 1, 'female'); // Y の娘（母の母の母になる）

    // 父 S = X（父の父）×〔母の母が Y の娘＝ Y は S の3代前〕
    const sireDamSire = herd.add('S_DS', 'male');
    const sireDam = herd.add('S_D', 'female', sireDamSire, yChildS);
    const sire = herd.add('S', 'male', x, sireDam);

    // 母 D = X の子（母の父）×〔母の母が Y の娘＝ Y は D の3代前〕
    const damDamSire = herd.add('D_DS', 'male');
    const damDam = herd.add('D_D', 'female', damDamSire, yChildD);
    const dam = herd.add('D', 'female', xChild, damDam);

    const result = calcInbreedCoefficient(sire, dam, herd.lookup, DEPTH);

    // 経路を実測で確認してから合計を検証する
    const byAncestor = new Map(result.contributions.map((c) => [c.ancestorId, c]));
    expect(byAncestor.get('X')?.contribution).toBeCloseTo(0.0625, 12);
    expect(byAncestor.get('Y')?.contribution).toBeCloseTo(0.0078125, 12);
    expect(result.F).toBeCloseTo(0.0703125, 12);
  });

  it('祖先自身が近交している場合は (1 + F_A) が効く', () => {
    // 全兄妹 C×D の仔 E は F_E = 0.25。その E を共通祖先とする全兄妹交配は
    //   F = 2頭ぶんではなく E 経由: (1/2)^(1+1+1) × (1 + 0.25) = 0.15625
    // （もう1頭の親は無関係な馬にして E だけを共通祖先にする）
    const herd = new Herd();
    const a = herd.add('A', 'male');
    const b = herd.add('B', 'female');
    const c = herd.add('C', 'male', a, b);
    const d = herd.add('D', 'female', a, b);
    const e = herd.add('E', 'male', c, d, { inbreedCoeff: 0.25 });

    const m1 = herd.add('M1', 'female');
    const m2 = herd.add('M2', 'female');
    const sire = herd.add('S', 'male', e, m1);
    const dam = herd.add('D2', 'female', e, m2);

    const result = calcInbreedCoefficient(sire, dam, herd.lookup, DEPTH);
    const eContribution = result.contributions.find((c2) => c2.ancestorId === 'E');
    expect(eContribution?.contribution).toBeCloseTo(0.125 * 1.25, 12);
  });

  it('Wright の排他条件: 経路が共通祖先以外を共有する場合は数えない', () => {
    // 親子交配（父 A × 娘 C）では A の親 P も「両側に現れる祖先」だが、
    // 母側の経路が A を通るため排他条件で除外される。除外しないと F が過大になる。
    const herd = new Herd();
    const p = herd.add('P', 'male');
    const q = herd.add('Q', 'female');
    const a = herd.add('A', 'male', p, q);
    const b = herd.add('B', 'female');
    const c = herd.add('C', 'female', a, b);

    const result = calcInbreedCoefficient(a, c, herd.lookup, DEPTH);
    expect(result.F).toBeCloseTo(0.25, 12);
    // A のみが有効な共通祖先。P / Q は経路が A を共有するので寄与しない
    expect(result.contributions.map((x) => x.ancestorId)).toEqual(['A']);
  });

  /**
   * 【L-1 の棚卸しで追加】本 describe の他のケースはすべて `calcInbreedCoefficient()` を
   * 直接呼ぶ**単体テスト**であり、`breed()` がその結果を実際に使っているかは固定していない。
   * R-1（経路を固定する）に従い、配合本体を通した担保を1本置く。
   */
  it('breed() が算出した F を実際に使っている（経路の固定・R-1）', () => {
    // 3×4 クロス（父の2代前・母の3代前が同一祖先 X）→ F = (1/2)^6 = 0.015625
    const herd = new Herd();
    const x = herd.add('X', 'male');
    const p1 = herd.descendLine('SIRE', x, 1, 'male');
    const p1Mate = herd.add('S_MATE', 'female');
    const sire = herd.add('S', 'male', p1, p1Mate);
    const q2 = herd.descendLine('DAM', x, 2, 'male');
    const q2Mate = herd.add('D_MATE', 'female');
    const dam = herd.add('D', 'female', q2, q2Mate);

    const foal = breed({
      id: 'FOAL',
      sire,
      dam,
      seed: 1,
      generation: 1,
      birthYear: 10,
      lookup: herd.lookup,
      balance: DEFAULT_BALANCE,
      nicks: new Map(),
    });

    // 単体テストと同じ値が、配合を通しても得られること
    expect(foal.inbreedCoeff).toBeCloseTo(1 / 64, 12);
    // F が下流の補正にも渡っていること（§6.5: injuryRateMult = 1 + F × 2.0）
    expect(foal.injuryRateMult).toBeCloseTo(1 + (1 / 64) * 2.0, 12);
    // 血の濃縮の参照先（最大寄与の共通祖先）も記録されていること
    expect(foal.breedingRecord?.topCommonAncestorId).toBe('X');
  });

  it('5代を超える共通祖先は探索しない（正典 §6.5 の打ち切り）', () => {
    const herd = new Herd();
    const x = herd.add('X', 'male');
    const sire = herd.descendLine('S', x, 6, 'male'); // X は6代前
    const dam = herd.descendLine('D', x, 6, 'female');

    expect(calcInbreedCoefficient(sire, dam, herd.lookup, DEPTH).F).toBe(0);
  });
});
