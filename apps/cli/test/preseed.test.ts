/**
 * N-2 / N-4: プリシードの検証（正典 §10.5・合格基準2〜4）
 *
 * ★フルスケール（50世代 × 現役2400）は 4〜5秒かかるので、テストは縮小スケールで回す。
 *   縮小しても壊れてはいけない性質だけをここに置き、**水準そのものは
 *   `npm run preseed` の実測を報告書に載せる**（R-12: 測定条件で判定を動かさない）。
 */

import { ALLOW_ALL_NAMES, DISTANCE_BIAS_CENTER, NPC_STABLES } from '@star/sim-engine';
import { describe, expect, it } from 'vitest';
import {
  FULL_PEDIGREE_ANCESTORS,
  PEDIGREE_GENERATIONS,
  auditPedigrees,
  lineConcentration,
} from '../src/pedigree-audit.js';
import {
  DEFAULT_PRESEED_OPTIONS,
  NPC_FOLLOW_TOP_RATIO,
  mateScore,
  npcTargetFrom,
  policyFit,
  preseedNicks,
  runPreseed,
  stableScore,
  type PreseedResult,
} from '../src/preseed.js';

/** 縮小スケール。厩舎数は 40 のまま（枠割りの挙動を変えないため） */
function smallRun(seed: number, generations = 14): PreseedResult {
  return runPreseed({
    ...DEFAULT_PRESEED_OPTIONS,
    seed,
    generations,
    stallions: 80,
    mares: 160,
    nicks: preseedNicks(seed, NPC_STABLES),
    blocklist: ALLOW_ALL_NAMES,
  });
}

describe('§10.5 プリシードの再現性（合格基準4）', () => {
  it('★同じシードから同じ血統プールが出る', () => {
    const a = smallRun(42);
    const b = smallRun(42);
    expect(b.world.all.size).toBe(a.world.all.size);
    expect(b.world.stallionIds).toEqual(a.world.stallionIds);
    expect(b.world.mareIds).toEqual(a.world.mareIds);
    // 血統プールの同一性は「ID が同じ」だけでは足りない。**遺伝子まで一致**することを見る
    const gene = (r: PreseedResult, id: string): string =>
      JSON.stringify(r.world.all.get(id)?.record.genotype);
    for (const id of a.world.stallionIds) expect(gene(b, id)).toBe(gene(a, id));
    // 馬名も同じでなければ「同じプール」とは言えない
    const names = (r: PreseedResult): string[] =>
      r.world.stallionIds.map((id) => r.world.all.get(id)?.name ?? '');
    expect(names(b)).toEqual(names(a));
  });

  it('★シードが違えば違うプールになる（シードが効いていないことの検出）', () => {
    const a = smallRun(42);
    const c = smallRun(7);
    const names = (r: PreseedResult): string => r.world.stallionIds.map((id) => r.world.all.get(id)?.name).join();
    expect(names(c)).not.toBe(names(a));
  });
});

describe('§10.5 プリシードの構造', () => {
  const run = smallRun(42);

  it('★毎年きちんと産駒が生まれる（種付け相手が枯れない）', () => {
    // 引退年齢4 と繁殖年齢6 のずれで、プールを入れ替えた年に産駒が 0 になる欠陥があった。
    // 生産が止まると 50世代回しても血統が伸びない ＝ プリシードの目的そのものが達成されない。
    for (const y of run.years) {
      expect(y.foals, `year ${y.year} の産駒数`).toBeGreaterThan(0);
    }
  });

  it('★世代が実際に進んでいる（同じ創始世代を回しているだけではない）', () => {
    const gens = run.world.activeIds.map((id) => run.world.all.get(id)!.record.generation);
    expect(Math.max(...gens)).toBeGreaterThanOrEqual(2);
  });

  it('★現役プールがデビュー〜引退のコホートぶんに保たれる', () => {
    const last = run.years[run.years.length - 1]!;
    // mares 160 × 3コホート = 480 前後。半分を割るなら生産か引退のどちらかが壊れている
    expect(last.active).toBeGreaterThan(240);
  });

  it('★厩舎方針が選抜スコアに効く（STABLE_EMPHASIS_WEIGHT）', () => {
    const h = run.world.all.get(run.world.stallionIds[0]!)!.record;
    const balanced = NPC_STABLES.find((s) => s.emphasis === null)!;
    const spFocused = NPC_STABLES.find((s) => s.emphasis === 'sp')!;
    const stFocused = NPC_STABLES.find((s) => s.emphasis === 'st')!;
    // 重視する能力が違えば同じ馬でも評価が変わる（＝厩舎ごとに選ぶ馬が変わる）
    expect(stableScore(h, spFocused)).not.toBeCloseTo(stableScore(h, balanced), 6);
    expect(stableScore(h, spFocused)).not.toBeCloseTo(stableScore(h, stFocused), 6);
    // バランス型は素の合計と一致する
    expect(stableScore(h, balanced)).toBeCloseTo(
      Object.values(h.potential).reduce((a, b) => a + b, 0),
      6,
    );
  });
});

describe('§10.5 能力分布の追従（N-3）', () => {
  it('★NPC目標は上位30%平均より 5〜12% 低い', () => {
    // 較正定数（0.92 / 0.3）を閾値に使わない。リテラルで押さえる（D-018 の教訓）
    const scores = Array.from({ length: 1000 }, (_, i) => i + 1);
    const sorted = scores.slice().sort((a, b) => b - a);
    const n = Math.ceil(sorted.length * NPC_FOLLOW_TOP_RATIO);
    const topMean = sorted.slice(0, n).reduce((a, b) => a + b, 0) / n;
    const target = npcTargetFrom(scores);
    const gap = 1 - target / topMean;
    expect(gap).toBeGreaterThan(0.05);
    expect(gap).toBeLessThan(0.12);
  });

  it('★上位だけを見る（全体平均ではない）', () => {
    // 全体平均で追従すると、上位プレイヤーから見て NPC が弱すぎる
    const scores = [100, 100, 100, 100, 100, 100, 100, 1000, 1000, 1000];
    const overall = scores.reduce((a, b) => a + b, 0) / scores.length;
    expect(npcTargetFrom(scores)).toBeGreaterThan(overall);
  });

  it('空集合でも落ちない', () => {
    expect(npcTargetFrom([])).toBe(0);
  });
});

describe('§10.5 N-4 血統表と系統の分散', () => {
  // ★① 世代交代は「引退4歳 → 繁殖6歳」で約8年かかる。20年では血統が2〜3代しか伸びず、
  //     5代の充填を測れない（実測 11/62）。44年 ≒ 5世代ぶんまで回してから測る。
  //   ★② **縮小スケールで測ってはいけない**。種牡馬80（1厩舎2枠）だと系統集中が
  //     出荷構成よりずっと速く進み、最大系統シェアが 75% になる（出荷構成では 28%）。
  //     ここで閾値を 0.8 に緩めれば通るが、それは**測定条件で判定を動かす**（R-12）。
  //     系統の集中は**出荷する頭数構成でしか意味を持たない**ので、この節だけ実寸で回す（約4秒）。
  const run = runPreseed({
    ...DEFAULT_PRESEED_OPTIONS,
    seed: 42,
    generations: 44,
    nicks: preseedNicks(42, NPC_STABLES),
    blocklist: ALLOW_ALL_NAMES,
  });
  const lookup = (id: string) => run.world.all.get(id)?.record;
  const audit = auditPedigrees(run.world.activeIds, run.world.stallionIds, lookup);

  it('5代の枠数は 62（2+4+8+16+32）', () => {
    let slots = 0;
    for (let g = 1; g <= PEDIGREE_GENERATIONS; g += 1) slots += 2 ** g;
    expect(slots).toBe(FULL_PEDIGREE_ANCESTORS);
  });

  it('★血統がある程度埋まっている（プリシードが効いている）', () => {
    // 出荷構成（種牡馬200・繁殖800）44世代での値。50世代の実測値は報告書に載せる
    expect(audit.meanFilled).toBeGreaterThan(40);
    expect(audit.meanFilled).toBeLessThanOrEqual(FULL_PEDIGREE_ANCESTORS);
  });

  it('★1頭の5代血統に複数の系統が現れる（ニックス §6.6 が意味を持つ）', () => {
    // ★R-16: 種牡馬プールの「系統の本数」は厩舎ごとに枠を切った時点で構造的に保証されるので、
    //   それを測っても検証にならない。保証されないのは**1頭の中で混ざっているか**。
    expect(audit.meanLines).toBeGreaterThan(3);
  });

  it('★系統が実質的に分散している（合格基準3・2026-08-06 改訂）', () => {
    // ★改訂（レビュー側 F-3）: **最大シェアの上限は撤廃**。有効系統数で見る。
    //   ニックスが sire_line × bms_line の組で効くので、実質5系統あれば25通りが成立する。
    //   判定線は **y50**（正典 §10.5 のプリシードは50世代。y100 は仕様の倍で
    //   サービス開始時点の状態ではなく、ライブ運用の監視項目）。
    expect(audit.stallionLines.effective).toBeGreaterThan(2);
  });

  it('★有効系統数は本数と違い、偏りで下がる', () => {
    const even = lineConcentration(['A', 'B', 'C', 'D']);
    const skewed = lineConcentration(['A', 'A', 'A', 'B', 'C', 'D']);
    expect(even.count).toBe(4);
    expect(skewed.count).toBe(4); // 本数は同じ
    expect(skewed.effective).toBeLessThan(even.effective); // 有効数は下がる
    expect(skewed.topShare).toBeGreaterThan(even.topShare);
  });
});

describe('D-025 厩舎方針に沿った配合相手の選択', () => {
  const base = (over: Partial<Record<string, unknown>> = {}) =>
    ({
      potential: { sp: 500, st: 500, pw: 500, gt: 500, iq: 500 },
      surfaceAptitude: { turf: 50, dirt: 50 },
      distanceCenter: 2000,
      heavyAptitude: 55,
      ...over,
    }) as never;

  const sprintTurf = NPC_STABLES.find((s) => s.distance === 'sprint' && s.surface === 'turf')!;
  const stayerDirt = NPC_STABLES.find((s) => s.distance === 'stayer' && s.surface === 'dirt')!;

  it('★厩舎ごとに評価が逆転する（同じ馬でも厩舎が違えば順位が変わる）', () => {
    // これが D-025 の目的そのもの。逆転しないなら 40厩舎が同じ馬を選び系統が集約する
    const sprinter = base({ distanceCenter: 1300, surfaceAptitude: { turf: 80, dirt: 30 } });
    const stayer = base({ distanceCenter: 2900, surfaceAptitude: { turf: 30, dirt: 80 } });
    expect(policyFit(sprinter, sprintTurf)).toBeGreaterThan(policyFit(stayer, sprintTurf));
    expect(policyFit(stayer, stayerDirt)).toBeGreaterThan(policyFit(sprinter, stayerDirt));
  });

  it('★方針適合が配合評価に実際に効く（POLICY_FIT_WEIGHT）', () => {
    const fits = base({ distanceCenter: 1300, surfaceAptitude: { turf: 85, dirt: 20 } });
    const misses = base({ distanceCenter: 2900, surfaceAptitude: { turf: 20, dirt: 85 } });
    // 能力は同じなので、差がつくのは方針適合のぶんだけ。5%以上の差を要求する
    const ratio = mateScore(fits, sprintTurf) / mateScore(misses, sprintTurf);
    expect(ratio).toBeGreaterThan(1.05);
    // 重みが 0 なら能力合計と一致してしまう（＝ D-025 以前の無差別選択）
    expect(mateScore(fits, sprintTurf)).not.toBeCloseTo(stableScore(fits, sprintTurf), 3);
  });

  it('★距離の適合は離れるほど下がり、DISTANCE_FIT_SPAN 離れると負になる', () => {
    const target = DISTANCE_BIAS_CENTER[sprintTurf.distance];
    const at = policyFit(base({ distanceCenter: target, surfaceAptitude: { turf: 50, dirt: 50 } }), sprintTurf);
    const near = policyFit(base({ distanceCenter: target + 500, surfaceAptitude: { turf: 50, dirt: 50 } }), sprintTurf);
    // 閾値に DISTANCE_FIT_SPAN 自身を使わない（自己検出の回避・D-018 の教訓）。リテラル 1400 で押さえる
    const far = policyFit(base({ distanceCenter: target + 1400, surfaceAptitude: { turf: 50, dirt: 50 } }), sprintTurf);
    expect(at).toBeGreaterThan(near);
    expect(near).toBeGreaterThan(far);
    expect(far).toBeLessThan(0);
  });

  it('★道悪巧者志向の厩舎だけが heavy_aptitude を見る', () => {
    const heavy = NPC_STABLES.find((s) => s.heavy && s.surface === 'both')!;
    const dry = NPC_STABLES.find((s) => !s.heavy && s.surface === 'both')!;
    const mudder = base({ distanceCenter: DISTANCE_BIAS_CENTER[heavy.distance], heavyAptitude: 85 });
    const nonMudder = base({ distanceCenter: DISTANCE_BIAS_CENTER[heavy.distance], heavyAptitude: 25 });
    expect(policyFit(mudder, heavy)).toBeGreaterThan(policyFit(nonMudder, heavy));
    if (dry.distance === heavy.distance) {
      expect(policyFit(mudder, dry)).toBeCloseTo(policyFit(nonMudder, dry), 6);
    }
  });
});
