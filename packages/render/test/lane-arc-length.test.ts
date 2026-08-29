/**
 * ★**走線に沿った長さ**（`laneArcLengthAt` / `sAtLaneArcLength`）— 残件 A-2 の候補 (b′)
 *
 * 【★この検査が生まれた理由 — 実際に踏んだ穴】
 *   ⚠️ ★`laneArcLengthAt` の末尾が **`out + (s - acc)`** でした。
 *      ★走路の終わりから先（接線方向の延長）を足すつもりでしたが、
 *      ★**`s` が走路の内側で終わったときにも実行され、負の値を足していました。**
 *      ★1600m の走路で `s=1500` が **1400 相当**（100m 短く）返ります。
 *   ★実害: (b′) を入れた瞬間に注視点が **−410m** ずれ、
 *      ★`race-video-invariants.test.ts` が **329 コマ**で割れました（2026-08-29）。
 *   ★裁定 §7 の「★**①の不変条件を先に測れ**（ここが割れたら他は無意味）」が、これを捕まえました。
 *
 * 【★何を守るか】
 *   ★**往復**（`s → 長さ → s`）が一致すること。★これ 1 本で、上の壊れ方は全部落ちます。
 *   ★片道だけを見ると「それらしい数字」が返るので気づけません（R-22 の家族）。
 */
import { describe, it, expect } from 'vitest';
import { DISTANCE_MENU } from '@star/scheduler';
import { laneArcLengthAt, ovalCourse, posOf, sAtLaneArcLength } from '../src/course.js';

/** ★走路の幅は `lane.ts` の `TRACK_WIDTH_M` と同じ 20m（`ovalCourse` の既定） */
const LANES = [0, 2.2, 5, 10, 15, 20] as const;

describe('★走線に沿った長さ', () => {
  it('★往復が一致する（走路の内側・境目・外側すべて）', () => {
    for (const dist of DISTANCE_MENU) {
      const course = ovalCourse(dist, { turn: 'left' });
      /** ★走路の**外**（前後の延長）も見ること。★元の壊れ方はそこの処理が原因でした */
      const samples = [-30, 0, 1, dist * 0.25, dist * 0.5, dist * 0.75, dist - 1, dist, dist + 30];
      for (const s of samples) {
        for (const w of LANES) {
          const back = sAtLaneArcLength(course, laneArcLengthAt(course, s, w), w);
          expect(back, `${dist}m s=${s} w=${w} の往復が一致しない`).toBeCloseTo(s, 6);
        }
      }
    }
  });

  it('★中心線では長さがそのまま `s`（曲がっても伸び縮みしない）', () => {
    const course = ovalCourse(1600, { turn: 'left' });
    for (const s of [0, 300, 600, 900, 1200, 1600]) {
      expect(laneArcLengthAt(course, s, course.widthM / 2)).toBeCloseTo(s, 9);
    }
  });

  it('★内は短く、外は長い（コーナーを含む区間で）', () => {
    const course = ovalCourse(1600, { turn: 'left' });
    // ★s=600 から 700 はコーナーの中
    const len = (w: number) => laneArcLengthAt(course, 700, w) - laneArcLengthAt(course, 600, w);
    expect(len(0)).toBeLessThan(len(10));
    expect(len(10)).toBeLessThan(len(20));
    // ★中心線は 100m ちょうど
    expect(len(10)).toBeCloseTo(100, 9);
  });

  it('★直線では走線によらず同じ（`s` と一致する伸び）', () => {
    const course = ovalCourse(1600, { turn: 'left' });
    // ★1200m 以降はゴール前の直線
    const len = (w: number) => laneArcLengthAt(course, 1300, w) - laneArcLengthAt(course, 1250, w);
    for (const w of LANES) expect(len(w), `w=${w}`).toBeCloseTo(50, 9);
  });

  /**
   * ★**実装と `posOf` が離れていないこと**（R-30: 同じ量を 2 か所で持たない）。
   *   ★`laneArcLengthAt` の比は `posOf` の半径から導いたものなので、
   *   ★`posOf` を細かく刻んで足した長さと一致するはずです。
   */
  it('★`posOf` を刻んで足した長さと一致する', () => {
    const course = ovalCourse(1600, { turn: 'left' });
    for (const w of LANES) {
      const step = 0.05;
      let sum = 0;
      for (let s = 500; s < 900; s += step) {
        const a = posOf(course, s, w);
        const b = posOf(course, s + step, w);
        sum += Math.hypot(b.x - a.x, b.y - a.y);
      }
      const closed = laneArcLengthAt(course, 900, w) - laneArcLengthAt(course, 500, w);
      // ★刻みの弦は弧より僅かに短いので、0.1% の幅で見る
      expect(closed, `w=${w}`).toBeCloseTo(sum, 0);
      expect(Math.abs(closed / sum - 1), `w=${w} のずれ`).toBeLessThan(0.001);
    }
  });

  /**
   * ★**検出器が鈍っていないこと**（R-14）。
   *   ★元の壊れ方（末尾で負を足す）を再現した式が、★この検査で落ちること。
   */
  it('★検出器が鈍っていないこと（元の壊れ方を再現すると往復が合わない）', () => {
    const course = ovalCourse(1600, { turn: 'left' });
    /** ★`Math.max(0, …)` を外した版（＝直す前） */
    const broken = (s: number, w: number): number => {
      const off = w - course.widthM / 2;
      if (s <= 0) return s;
      let acc = 0, out = 0;
      for (const seg of course.segments) {
        if (s <= acc) return out;
        const covered = Math.min(seg.length, s - acc);
        const sgn = seg.turn === 'right' ? -1 : 1;
        const ratio = seg.type === 'corner' && seg.radius !== undefined && seg.radius > 0
          ? (seg.radius + off * sgn) / seg.radius : 1;
        out += covered * ratio;
        acc += seg.length;
      }
      return out + (s - acc);           // ★ここが元の壊れ方
    };
    expect(broken(1500, 2.2)).not.toBeCloseTo(laneArcLengthAt(course, 1500, 2.2), 3);
    expect(laneArcLengthAt(course, 1500, 2.2) - broken(1500, 2.2)).toBeCloseTo(100, 6);
  });
});
