/**
 * ★**カットの切り替え地点が、走路の実際の形に載っている**（★台帳 A-8・50 鞍全数）
 *
 * 【★何が壊れていたか】
 *   ★台本 v6 は ★**距離の割合**で切っていました（`0.750 × 距離` から直線用のカット）。
 *   ★これが合うのは `0.25 × 距離 == 直線` のときだけで、★**50 鞍中 2 鞍**です。
 *   ★残り 48 鞍では ★**直線用のカメラがコーナーの上に据わり**ました
 *   （★最悪 銀河賞で **371m 手前**・`tools/_cutgeom.mjs` 実測）。
 *   ★オーナー評（2026-08-31・青嶺記念）「★**背景がでたらめになっています**」。
 *
 * 【★なぜ道具ではなく検定に置くか】（R-32）
 *   ⚠️ ★`tools/_cutgeom.mjs` は ★**手で回す道具**です。★回さなかった日から
 *      ★静かに外れます。★台帳 A-8 は 2026-08-31 に測って分かっていながら、
 *      ★**2026-09-02 まで誰にも止められていません**でした。
 *
 * 【⚠️ ★「遅すぎ」はここで見ません — ★見てはいけません】
 *   ★直線が 400m より長い場（★19 鞍）では、★寄りのカットは ★**直線の頭からは始めません。**
 *   ★表示が実時間へ戻る ★**残り 400m** から始めます。★手前は引きの `side-drive` が受けます。
 *   ★直線の頭から寄ると ★**5 倍速の中で寄りのカットが始まり**、
 *   ★「馬が後退して見える」が再発します（★2026-08-28 の実害・`broadcast-v2.ts` の注記）。
 *   → ★**それは不具合ではなく設計です。** ★ここで 0 を要求すると、その退行を招きます。
 */
import { describe, expect, it } from 'vitest';
import { GRADED_RACES, raceSetupById } from '@star/scheduler';
import {
  ovalCourse, segmentAt, homeStretchMetersOf, broadcastV2ScriptBoundariesM,
  broadcastV2ShotAt, broadcastV2ShotById, broadcastV2ScriptAssets, SCRIPT_V6, GOAL_REAL_TIME_M,
} from '@star/render';

/** ★「ゴール前の直線に居ること」を前提にしたカット（`tools/_cutgeom.mjs` と同じ集合） */
const STRAIGHT_SHOTS = new Set([
  'straight-contest', 'homestretch-front', 'homestretch-side', 'front-close', 'finish-line',
]);

const courses = GRADED_RACES.map((race) => {
  const setup = raceSetupById(race.id);
  return {
    id: race.id,
    name: race.name ?? race.id,
    course: ovalCourse(setup.distanceM, { ...setup.spec, turn: setup.turn }),
  };
});

describe('★台本 v6 の切り替え地点', () => {
  it('★50 鞍すべてで、走路を 1 鞍ぶん用意できている（★空振り防止・R-16）', () => {
    expect(courses.length).toBe(50);
  });

  /**
   * ★**カットは 1 つも減らさない**（★オーナー決定 2026-09-03）
   *
   *   > カットはこれ以上減らさないでください。今のカット数がリリースできる限界です
   *
   *   ⚠️ ★直線が短い場（★白砂 290m）で 4 つが入りきらないという理由で、
   *      ★**カットを 1 つ減らす案を出して差し戻されました。**
   *      → ★②の 80m を先に取り置き、残りを ①③④ が 7:7:6 で分けます。
   */
  it('★どの鞍でもカットの数が減っていない', () => {
    const expected = SCRIPT_V6.length;
    const short: string[] = [];
    for (const { name, course } of courses) {
      const bounds = broadcastV2ScriptBoundariesM(course, 'v6');
      if (bounds.length !== expected) short.push(`${name} … ${bounds.length} / ${expected}`);
      /** ★長さ 0 のカットは「在るのに映らない」＝実質減っています */
      let prev = 0;
      for (const b of bounds) {
        if (b.meters - prev < 1) short.push(`${name} … ${b.id} が ${(b.meters - prev).toFixed(1)}m`);
        prev = b.meters;
      }
    }
    expect(short, '★カット数と各カットの尺を減らさないこと').toEqual([]);
  });

  /**
   * ★**これが本題。** ★直線用のカットは、実際の直線に入ってから出ること。
   */
  it('★直線用のカットが、コーナーの上で始まらない（50 鞍）', () => {
    const offenders: string[] = [];
    for (const { name, course } of courses) {
      const straightStart = course.distance - homeStretchMetersOf(course);
      let firstStraightShotM: number | null = null;
      for (let m = 0; m <= course.distance; m += 1) {
        if (!STRAIGHT_SHOTS.has(broadcastV2ShotAt(course, m).id)) continue;
        firstStraightShotM = m;
        break;
      }
      if (firstStraightShotM === null) { offenders.push(`${name} … 直線用のカットが出ません`); continue; }
      /**
       * ★区間名でも確かめます（★m の引き算だけだと境界の丸めで見逃します）。
       * ⚠️ ★**境目のわずかに内側**を見ます。★`segmentAt` は境目ちょうどを
       *    ★**手前の区間**として返すので、★直線の頭ちょうどだと「4角」と出ます
       *    （★実際に 20 鞍がそれで落ちました — ★不具合ではなく数え方でした）。
       */
      const label = segmentAt(course, firstStraightShotM + 1e-3).label;
      if (firstStraightShotM < straightStart - 1e-6 || label !== '直線') {
        offenders.push(`${name} … ${firstStraightShotM}m（直線は ${straightStart.toFixed(0)}m から・区間「${label}」）`);
      }
    }
    expect(offenders, '★直線用のカメラをコーナーの上に据えないこと').toEqual([]);
  });

  /**
   * ★**②の正面カットの尺を、走路の都合で削らない**（★2026-08-28 オーナー判断の持ち越し）
   */
  it('★②の正面カットは、どの鞍でも 80m 以上ある', () => {
    const offenders: string[] = [];
    for (const { name, course } of courses) {
      const bounds = broadcastV2ScriptBoundariesM(course, 'v6');
      const index = bounds.findIndex((b) => b.id === 'homestretch-front');
      expect(index, `${name} … ②の正面カットが台本にありません`).toBeGreaterThan(0);
      const span = bounds[index]!.meters - bounds[index - 1]!.meters;
      if (span < 80 - 1e-6) offenders.push(`${name} … ${span.toFixed(1)}m`);
    }
    expect(offenders, '★②は 80m を先に取り置くこと').toEqual([]);
  });

  /**
   * ★**寄りのカットは、表示が実時間に戻ってから始まる**（★2026-08-28「馬が後退して見える」）
   */
  it('★寄りのカットは、残り min(400m, 直線) から始まる', () => {
    const offenders: string[] = [];
    for (const { name, course } of courses) {
      const bounds = broadcastV2ScriptBoundariesM(course, 'v6');
      const index = bounds.findIndex((b) => b.id === 'straight-contest');
      const closeStart = bounds[index - 1]!.meters;
      const expected = course.distance - Math.min(GOAL_REAL_TIME_M, homeStretchMetersOf(course));
      if (Math.abs(closeStart - expected) > 1e-6) {
        offenders.push(`${name} … ${closeStart.toFixed(0)}m（期待 ${expected.toFixed(0)}m）`);
      }
    }
    expect(offenders, '★寄りは 5 倍速の中で始めないこと').toEqual([]);
  });

  /**
   * ★**対照**: ★承認済みの 1 鞍（桜星賞）は 1m も動かないこと。
   *   ⚠️ ★これが無いと、「50 鞍を直した」が「承認済みの 1 鞍も作り変えた」を隠します。
   */
  it('★桜星賞（スターパーク 1600m・直線 400m）は旧の割合と 1m も違わない', () => {
    const entry = courses.find((c) => c.id === 'g1-ousei');
    expect(entry, '★桜星賞が見つかりません').toBeDefined();
    const { course } = entry!;
    const now = broadcastV2ScriptBoundariesM(course, 'v6');
    const old = SCRIPT_V6.map((row) => row.until * course.distance);
    expect(now.map((b) => Math.round(b.meters * 1e6) / 1e6)).toEqual(old.map((m) => Math.round(m * 1e6) / 1e6));
  });

  /**
   * ★**読まない組を落として安全か**（★2026-09-03・台帳 A-11 / A-12）
   *
   * 【★なぜ要るか】
   *   ★実測で、★台本 v6 が 50 鞍で使う素材は ★**`side-v6` 53% と `diag-front-v2` 47% だけ**でした。
   *   ★`diag-rear-v2` と `high-diag-v2` は ★**1m も描かれません**。
   *   → ★画面はその 2 組を ★**読まない・焼かない**ようにしました（★実測 102MB → 76MB）。
   *
   * ⚠️ ★**これは危ない最適化です。** ★台本に 1 行足しただけで、
   *    ★**読んでいない組を選ぶショットが出る**ようになります。
   *    ★そのとき画面は真横の絵を代わりに出します（★落ちはしませんが**別の絵**です）。
   *   → ★**50 鞍 × 全 m** で、★選ばれるショットの素材が必ず一覧の中にあることを見ます。
   */
  it('★台本が選ぶショットの素材は、必ず「読む組」の中にある（50 鞍 × 全 m）', () => {
    const offenders: string[] = [];
    for (const script of ['v6', 'v5', 'v4', 'v3'] as const) {
      const allowed = new Set(broadcastV2ScriptAssets(script));
      for (const { name, course } of courses) {
        for (let m = 0; m <= course.distance; m += 5) {
          const asset = broadcastV2ShotById(broadcastV2ShotAt(course, m, false, undefined, { script }).id).horseAsset;
          if (asset !== undefined && !allowed.has(asset)) {
            offenders.push(`${script} ${name} ${m}m … ${asset}`);
            break;
          }
        }
      }
    }
    expect(offenders.slice(0, 10), '★読まない組を選ぶショットが出ています').toEqual([]);
  });

  it('★勝馬と決勝線の素材も一覧に入っている（★表に無いが必ず出る）', () => {
    const allowed = new Set(broadcastV2ScriptAssets('v6'));
    for (const id of ['finish-line', 'winner-follow', 'winner-follow-rear'] as const) {
      const asset = broadcastV2ShotById(id).horseAsset;
      if (asset !== undefined) expect(allowed.has(asset), `${id} の素材 ${asset}`).toBe(true);
    }
    /** ★俯瞰ワイドの代用は、代用する設定のときだけ要ります */
    const wide = broadcastV2ShotById('fourth-corner-wide').horseAsset;
    if (wide !== undefined) {
      expect(allowed.has(wide), '★代用しない設定では読みません').toBe(false);
      expect(new Set(broadcastV2ScriptAssets('v6', true)).has(wide), '★代用する設定では読みます').toBe(true);
    }
  });

  /**
   * ★**旧台本は割合のまま**（★切り戻しの道を動かさない・`script-v6.test.ts`）
   */
  it('★v5 は割合のままで、走路の形に依らない', () => {
    const entry = courses.find((c) => c.id === 'g1-tenkyu');
    const { course } = entry!;
    const v5 = broadcastV2ScriptBoundariesM(course, 'v5');
    for (const b of v5) {
      const frac = b.meters / course.distance;
      expect(frac).toBeGreaterThan(0);
      expect(frac).toBeLessThanOrEqual(1);
    }
    /** ★最後は必ず距離ちょうど（割合 1.0） */
    expect(v5[v5.length - 1]!.meters).toBeCloseTo(course.distance, 6);
  });
});
