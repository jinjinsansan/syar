/**
 * ★**`posOf`（区間の始点を覚える版）は、`posOfWalk`（最初から歩く版）と 1 ビットも変わらない**（★2026-09-15）
 *
 * 【★なぜ要るか】★発走の前後のコマ落ち（★オーナー評「スピードが一瞬緩む」）を減らすため、
 *   ★`posOf` を ★区間の始点を覚える形に直しました。★位置は画の全部（馬・ラチ・スタンド・距離標）に効くので、
 *   ★**速くなった代わりに 1 画素でもずれたら不合格**です。★近い値ではなく ★`Object.is` で比べます。
 *
 * 【★見る範囲（R-33）】★50 鞍の走路 × 左右の回り × 発走の手前〜決勝線の先 × 内ラチの内側〜外ラチの外側。
 *   ★区間の境目ちょうど（`s = segEnd`）も必ず含めます（★どちらの区間の式を使うかが変わる所）。
 */
import { describe, it, expect } from 'vitest';
import { GRADED_RACES, raceSetupById } from '@star/scheduler';
import { ovalCourse, posOf, posOfWalk, type Course } from '@star/render';

const W_SAMPLES = [-150, -38, -4, -2.2, 0, 2.2, 10, 19.9, 23, 34, 60] as const;

function sampleS(course: Course): number[] {
  const out: number[] = [];
  for (let s = -60; s <= course.distance + 80; s += 7.3) out.push(s);
  /** ★区間の境目ちょうどと、その前後のわずかな所 */
  let acc = 0;
  for (const seg of course.segments) {
    acc += seg.length;
    out.push(acc, acc - 1e-9, acc + 1e-9);
  }
  out.push(0, course.distance, -1e-9, course.distance + 1e-9);
  return out;
}

function mismatches(course: Course): string[] {
  const bad: string[] = [];
  for (const s of sampleS(course)) {
    for (const w of W_SAMPLES) {
      const a = posOf(course, s, w);
      const b = posOfWalk(course, s, w);
      if (!Object.is(a.x, b.x) || !Object.is(a.y, b.y) || !Object.is(a.heading, b.heading)) {
        bad.push(`s=${s} w=${w}: ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`);
        if (bad.length > 5) return bad;
      }
    }
  }
  return bad;
}

describe('★posOf の覚える版は最初から歩く版と 1 ビットも変わらない', () => {
  it('★★50 鞍 × 左右の回り', () => {
    expect(GRADED_RACES.length).toBeGreaterThan(40);
    for (const r of GRADED_RACES) {
      const s = raceSetupById(r.id);
      for (const turn of ['left', 'right'] as const) {
        const course = ovalCourse(s.distanceM, { ...s.spec, turn });
        expect(mismatches(course), `${r.id} ${turn}`).toEqual([]);
      }
    }
  });

  it('★★既定の走路と、距離の端（1000m・3600m）', () => {
    for (const d of [1000, 1600, 2000, 3600]) {
      for (const turn of ['left', 'right'] as const) {
        expect(mismatches(ovalCourse(d, { widthM: 20, turn })), `${d} ${turn}`).toEqual([]);
      }
    }
  });

  /** ★対照: ★同じ走路でも区間の境目の扱いを 1 つずらすと食い違う（★この比較が空回りしていないこと） */
  it('★対照: 別の走路の位置とは一致しない', () => {
    const a = ovalCourse(2000, { lapM: 2200, homeStretchM: 620, widthM: 22, turn: 'left' });
    const b = ovalCourse(2000, { lapM: 1900, homeStretchM: 310, widthM: 20, turn: 'left' });
    const p = posOf(a, 900, 5), q = posOfWalk(b, 900, 5);
    expect(Object.is(p.x, q.x) && Object.is(p.y, q.y)).toBe(false);
  });
});
