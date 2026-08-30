/**
 * ★**重賞 50 鞍と競馬場 10 場**（2026-08-30・オーナー指示「50 箇所に広げる」）
 *
 * 【★この検査が守るもの】
 *   ① ★**50 鞍あり、格の内訳が B案（9 / 14 / 27）である**
 *   ② ⚠️ ★**`(競馬場, 馬場, 距離)` が 50 通りすべて違う** — ★これが「種類豊富」の実体
 *   ③ ★10 場すべてが使われている（★作ったのに出番が無い場を残さない）
 *   ④ ★どの月にもレースがある（★年間カレンダーが途切れない）
 *   ⑤ ★`ovalCourse` が受け取れる形になっている（★実際に作って確かめる）
 *
 * ⚠️ ★**名前が実在レース名でないことは、この検査では守れません。**
 *    ★実在名の一覧をここに書くこと自体が §0.1 違反だからです
 *    （`name-blocklist.ts` の註記と同じ理由）。★名前はオーナー・レビュー側の確認対象です。
 */
import { describe, it, expect } from 'vitest';
import {
  GRADED_RACES, GRADED_COUNT_BY_GRADE, gradedRaceById, raceLookKey, type Grade,
} from '../src/graded-races.js';
import { VENUES, venueById } from '../src/venues.js';

describe('★競馬場 10 場', () => {
  it('★10 場ある', () => {
    expect(VENUES.length).toBe(10);
  });

  it('★id と名前が一意', () => {
    expect(new Set(VENUES.map((v) => v.id)).size).toBe(VENUES.length);
    expect(new Set(VENUES.map((v) => v.name)).size).toBe(VENUES.length);
  });

  it('⚠️ ★**同じ形の場が 2 つない**（★あるとその 2 場は「同じ画」になります）', () => {
    const shapes = VENUES.map((v) => `${v.lapM}/${v.homeStretchM}/${v.turn}`);
    expect(new Set(shapes).size, '★1周・直線・回りが同じ場がある').toBe(VENUES.length);
  });

  it('★左回りと右回りが両方ある', () => {
    expect(VENUES.some((v) => v.turn === 'left')).toBe(true);
    expect(VENUES.some((v) => v.turn === 'right')).toBe(true);
  });

  it('★`ovalCourse` の前提を満たしている（★直線が 1 周より長くない）', () => {
    /**
     * ⚠️ ★`@star/scheduler` は **依存ゼロ**のパッケージなので、★ここから `@star/render` を引きません。
     *    ★**実際に `ovalCourse` を作って確かめるほうは `apps/cli/test/venue-course.test.ts`** にあります
     *    （★両方のパッケージを引ける場所）。★ここは前提の式だけを見ます。
     */
    for (const v of VENUES) {
      expect(v.homeStretchM * 2, `★${v.name} の直線が 1 周より長い`).toBeLessThan(v.lapM);
      expect(v.widthM, `★${v.name} の幅`).toBeGreaterThan(0);
    }
  });

  it('★知らない id は投げる（★黙って既定の場へ落とさない・R-27）', () => {
    expect(() => venueById('banana')).toThrow();
    expect(venueById('star-park').name).toBe('スターパーク競馬場');
  });
});

describe('★重賞 50 鞍', () => {
  it('★50 鞍ある', () => {
    expect(GRADED_RACES.length).toBe(50);
  });

  it('★格の内訳は B案（G1 9 / G2 14 / G3 27）', () => {
    /**
     * ⚠️ ★正典 §10.3 の**週次頻度**（G1=3/G2=8/G3=20）とは別の量です。
     *    ★あれは「枠が週に何本あるか」、★こちらは「名前つきのレースが何鞍あるか」。
     *    ★B案はオーナー判断（2026-08-30）。★理由は `graded-races.ts` の註記に書いています。
     */
    const count: Record<Grade, number> = { G1: 0, G2: 0, G3: 0 };
    for (const r of GRADED_RACES) count[r.grade] += 1;
    expect(count).toEqual(GRADED_COUNT_BY_GRADE);
    expect(count.G1 + count.G2 + count.G3).toBe(GRADED_RACES.length);
  });

  it('★id と名前が一意', () => {
    expect(new Set(GRADED_RACES.map((r) => r.id)).size).toBe(GRADED_RACES.length);
    expect(new Set(GRADED_RACES.map((r) => r.name)).size).toBe(GRADED_RACES.length);
  });

  it('⚠️ ★**50 鞍すべてが違う画になる**（競馬場 × 馬場 × 距離 が全部違う）', () => {
    /**
     * 【★なぜこれが本体か】
     *   ★重賞は週 31 鞍（§10.3）、★1 週 = リアル 4 時間（§7.1）。
     *   → ★50 を使い回すと ★**同じレースはリアル約 6.4 時間ごとに再来**します。
     *   ★「飽きない」を作るのは名前の数ではなく、★**1 鞍ごとの見え方の違い**です。
     *   ⚠️ ★同じ組が 2 つあると、★その 2 鞍は**区別がつきません**。
     */
    const keys = GRADED_RACES.map(raceLookKey);
    const dup = keys.filter((k, i) => keys.indexOf(k) !== i);
    expect(dup, `★同じ（競馬場/馬場/距離）の鞍がある: ${[...new Set(dup)].join(', ')}`).toEqual([]);
  });

  it('★10 場すべてに出番がある', () => {
    const used = new Set(GRADED_RACES.map((r) => r.venueId));
    for (const v of VENUES) {
      expect(used.has(v.id), `★${v.name} に 1 鞍も無い`).toBe(true);
    }
  });

  it('★その競馬場に在る馬場でしか組まれていない', () => {
    for (const r of GRADED_RACES) {
      const v = venueById(r.venueId);
      expect(v.surfaces, `★${r.name}: ${v.name} に ${r.surface} が無い`).toContain(r.surface);
    }
  });

  it('★距離は 1000〜3600m・100m 刻み', () => {
    for (const r of GRADED_RACES) {
      expect(r.distanceM, `★${r.name} の距離`).toBeGreaterThanOrEqual(1000);
      expect(r.distanceM, `★${r.name} の距離`).toBeLessThanOrEqual(3600);
      expect(r.distanceM % 100, `★${r.name} の距離が 100m 刻みでない`).toBe(0);
    }
  });

  it('★距離が散っている（★1 つの距離に固まっていない）', () => {
    const kinds = new Set(GRADED_RACES.map((r) => r.distanceM));
    expect(kinds.size, '★距離の種類が少なすぎる').toBeGreaterThanOrEqual(8);
  });

  it('★どの月にもレースがある（★年間カレンダーが途切れない）', () => {
    for (let m = 1; m <= 12; m += 1) {
      expect(GRADED_RACES.some((r) => r.month === m), `★${m} 月に 1 鞍も無い`).toBe(true);
    }
  });

  it('★芝とダートが両方ある（★芝のほうが多い）', () => {
    const turf = GRADED_RACES.filter((r) => r.surface === 'turf').length;
    const dirt = GRADED_RACES.length - turf;
    expect(dirt, '★ダートが 1 鞍も無い').toBeGreaterThan(0);
    expect(turf, '★芝がダートより少ない（実際の重賞は芝が多い）').toBeGreaterThan(dirt);
  });

  it('★2 歳・3 歳・3 歳以上・牝馬限定が揃っている', () => {
    expect(GRADED_RACES.some((r) => r.age === '2')).toBe(true);
    expect(GRADED_RACES.some((r) => r.age === '3')).toBe(true);
    expect(GRADED_RACES.some((r) => r.age === '3+')).toBe(true);
    expect(GRADED_RACES.some((r) => r.fillies)).toBe(true);
    /** ★牝馬限定は G1 にもある（★牝馬の路線が頂点まで通っていること） */
    expect(GRADED_RACES.some((r) => r.fillies && r.grade === 'G1')).toBe(true);
  });

  it('★三冠が 3 歳・芝で、距離が伸びていく', () => {
    /** ★クラシック三冠（正典 §10.3 が名指しで挙げている路線） */
    const crown = ['g1-seikan', 'g1-tenkyu', 'g1-ginga'].map(gradedRaceById);
    for (const r of crown) {
      expect(r.age).toBe('3');
      expect(r.surface).toBe('turf');
      expect(r.grade).toBe('G1');
    }
    expect(crown[1]!.distanceM).toBeGreaterThan(crown[0]!.distanceM);
    expect(crown[2]!.distanceM).toBeGreaterThan(crown[1]!.distanceM);
    /** ★開催順に並んでいる */
    expect(crown[1]!.month).toBeGreaterThan(crown[0]!.month);
    expect(crown[2]!.month).toBeGreaterThan(crown[1]!.month);
  });

  it('★ダート路線に G1 がある（★ダートが頂点まで通っていること）', () => {
    expect(GRADED_RACES.some((r) => r.surface === 'dirt' && r.grade === 'G1')).toBe(true);
  });

  it('★知らない id は投げる（R-27）', () => {
    expect(() => gradedRaceById('banana')).toThrow();
    expect(gradedRaceById('g1-ousei').name).toBe('桜星賞');
  });

  it('★既存のデモのレースが残っている（★桜星賞は動かさない）', () => {
    const ousei = gradedRaceById('g1-ousei');
    expect(ousei.name).toBe('桜星賞');
    expect(ousei.venueId).toBe('star-park');
    expect(ousei.distanceM).toBe(1600);
  });
});
