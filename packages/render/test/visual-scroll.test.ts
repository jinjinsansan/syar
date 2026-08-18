import { describe, expect, it } from 'vitest';
import { buildVisualScroll } from '../src/visual-scroll.js';
import { broadcastV2AnchorWeight, broadcastV2LeadFrameFocusMeters, broadcastV2SectionLabel, broadcastV2ShotAt, CORNER_CUT_M } from '../src/broadcast-v2.js';
import { ovalCourse, segmentStarts } from '../src/course.js';

describe('visual scroll (見た目の速度を時間圧縮から切り離す)', () => {
  it('rate 1.8 の道中では、見た目の進行が真の進行の 1/1.8 になる', () => {
    // 表示 1 秒あたり真の位置が 28.8m 進む（rate 1.8 × 実速 16m/s）
    const samples = Array.from({ length: 101 }, (_, i) => ({
      displaySec: i * 0.1, focusS: i * 2.88, rate: 1.8, anchorWeight: 0,
    }));
    const vs = buildVisualScroll(samples);
    const visualAt = (d: number): number => d / 0.1 * 2.88 + vs.deltaAt(d);
    expect((visualAt(5) - visualAt(4))).toBeCloseTo(16, 1);
  });

  it('固定物体の区間（重み 1）では Δ=0 で、真の位置に一致する', () => {
    const samples = Array.from({ length: 201 }, (_, i) => ({
      displaySec: i * 0.1, focusS: 1400 + i * 1.2, rate: 0.7,
      anchorWeight: i < 100 ? 0 : 1,
    }));
    const vs = buildVisualScroll(samples);
    expect(vs.deltaAt(10)).toBeCloseTo(0, 6);
    expect(vs.deltaAt(15)).toBeCloseTo(0, 6);
    // その手前では 0.7 倍速を打ち消して速く流れる（Δ が単調に増える）
    expect(vs.deltaAt(5)).toBeLessThan(vs.deltaAt(9));
    // 決定論: 同じ入力 → 同じ出力
    expect(buildVisualScroll(samples).deltaAt(7.3)).toBe(vs.deltaAt(7.3));
  });

  it('anchor weight はゴール前 80m で 1、その手前 80m でなだらかに 0→1', () => {
    const course = ovalCourse(1600, { turn: 'left' });
    expect(broadcastV2AnchorWeight(course, 'finish-line', 1550)).toBe(1);
    expect(broadcastV2AnchorWeight(course, 'winner-follow', 1610)).toBe(1);
    expect(broadcastV2AnchorWeight(course, 'homestretch-side', 1300)).toBe(0);
    const mid = broadcastV2AnchorWeight(course, 'homestretch-side', 1480);
    expect(mid).toBeGreaterThan(0.4);
    expect(mid).toBeLessThan(0.6);
    expect(broadcastV2AnchorWeight(course, 'homestretch-side', 1519)).toBeGreaterThan(0.99);
  });
});

describe('Broadcast V2 framing', () => {
  it('馬群が画面に収まれば中点、収まらなければ先頭を進行方向側 78% に置く', () => {
    expect(broadcastV2LeadFrameFocusMeters([100, 104, 108], 10)).toBe(104);
    // 半幅 8m（画面 16m）に 30m の馬群は収まらない → 先頭 130 − 8×0.56
    expect(broadcastV2LeadFrameFocusMeters([100, 115, 130], 8)).toBeCloseTo(130 - 8 * 0.56, 6);
    // ゴール前は先頭を 40% に（前方を空けて決勝線を早く見せる）
    expect(broadcastV2LeadFrameFocusMeters([100, 115, 130], 8, 0.4)).toBeCloseTo(130 + 8 * 0.2, 6);
    // ★連続性: 馬群がじわじわ広がっても注視点は跳ばない（max(中点, 先頭基準)）
    let prev = broadcastV2LeadFrameFocusMeters([100, 100], 8);
    for (let spread = 0.5; spread <= 30; spread += 0.5) {
      const focus = broadcastV2LeadFrameFocusMeters([100 - spread, 100], 8);
      expect(Math.abs(focus - prev)).toBeLessThan(0.6);
      prev = focus;
    }
  });

  it('コーナー専用カットは冒頭 CORNER_CUT_M だけで、以降は横追従に戻る', () => {
    const course = ovalCourse(1600, { turn: 'left' });
    const third = segmentStarts(course).find((b) => b.label.includes('3角'))!;
    const fourth = segmentStarts(course).find((b) => b.label.includes('4角'))!;
    const v2 = { script: 'v2' as const };
    expect(broadcastV2ShotAt(course, third.s + 5, false, undefined, v2).id).toBe('third-corner-rear');
    expect(broadcastV2ShotAt(course, third.s + CORNER_CUT_M + 5, false, undefined, v2).id).toBe('backstretch-side');
    expect(broadcastV2ShotAt(course, fourth.s + 5, false, undefined, v2).id).toBe('fourth-corner-high');
    expect(broadcastV2ShotAt(course, fourth.s + CORNER_CUT_M + 5, false, undefined, v2).id).toBe('homestretch-side');
  });

  it('区間名はショット選択と同じ区間定義から出る', () => {
    const course = ovalCourse(1600, { turn: 'left' });
    expect(broadcastV2SectionLabel(course, 100, 'start-follow')).toBe('スタート後');
    expect(broadcastV2SectionLabel(course, 300, 'backstretch-side')).toBe('向正面');
    expect(broadcastV2SectionLabel(course, 700, 'backstretch-side')).toBe('第3コーナー');
    expect(broadcastV2SectionLabel(course, 1000, 'homestretch-side')).toBe('第4コーナー');
    expect(broadcastV2SectionLabel(course, 1300, 'homestretch-side')).toBe('最後の直線');
    expect(broadcastV2SectionLabel(course, 1550, 'finish-line')).toBe('ゴール前');
    expect(broadcastV2SectionLabel(course, 1620, 'winner-follow')).toBe('レース確定');
  });
});
