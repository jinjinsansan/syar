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

  /**
   * ★2026-09-29 オーナー「芝が後退していく」: 表の刻み（0.05 秒）の途中で注視点が 1,150m 跳ぶと、
   *   時間で補間した Δ が数コマ遅れて付いてきて、芝が前へ飛んでから 1,000m 戻っていた。
   */
  it('注視点が表の刻みの途中で跳んでも、画面の毎コマで芝は後ろへ戻らない', () => {
    const JUMP_AT = 1.02;
    const focusAt = (d: number): number => d * 30 + (d >= JUMP_AT ? 1150 : 0);
    const samples = Array.from({ length: 61 }, (_, i) => ({
      displaySec: i * 0.05, focusS: focusAt(i * 0.05), rate: i === 21 ? 40 : 1.8, anchorWeight: 0,
    }));
    const vs = buildVisualScroll(samples);
    let prev = Number.NEGATIVE_INFINITY;
    for (let d = 0; d <= 3; d += 1 / 60) {
      const f = focusAt(d);
      const visual = f + vs.deltaAt(d, f);
      expect(visual, `d=${d.toFixed(3)}`).toBeGreaterThanOrEqual(prev - 1e-6);
      prev = visual;
    }
    // ★跳ばない区間は従来と同じ（★注視点を渡しても渡さなくても同じ値）
    expect(vs.deltaAt(0.52, focusAt(0.52))).toBeCloseTo(vs.deltaAt(0.52), 9);
  });

  /**
   * ★2026-10-01 オーナー「最後の直線で 芝が逆に動く・急に超高速・急に超スロー」:
   *   ★上の網は「後ろへ戻らない（≧）」しか見ず、★跳びの直前に 芝が 3 コマ止まり 跳んだコマで 6 倍に跳ねるのを 素通りしていた
   *   （★本番の見本のレースで実測: d≈44.6・止まって 1.6m/コマ）。★跳びの前後で ★芝の速さが ふだんの 0.5〜1.5 倍に収まること。
   */
  it('注視点が跳ぶ前後で、芝は止まらず 跳ねない（★毎コマの速さが ふだんの 0.5〜1.5 倍）', () => {
    const JUMP_AT = 1.02;
    const focusAt = (d: number): number => d * 30 + (d >= JUMP_AT ? 1150 : 0);
    /** ★跳びの刻み（21）と ★その隣（22）の rate が極端（★本番の実測の形: 跳びの後も 約 0.1 秒 止まった） */
    const samples = Array.from({ length: 61 }, (_, i) => ({
      displaySec: i * 0.05, focusS: focusAt(i * 0.05), rate: i === 21 || i === 22 ? 40 : 1.8, anchorWeight: 0,
    }));
    const vs = buildVisualScroll(samples);
    const normal = 30 / 1.8;
    const step = 1 / 60;
    let prev: number | null = null;
    let checked = 0;
    for (let d = 0.6; d <= 1.6; d += step) {
      const f = focusAt(d);
      const visual = f + vs.deltaAt(d, f);
      if (prev !== null) {
        const speed = (visual - prev) / step;
        expect(speed, `d=${d.toFixed(3)} の芝の速さ`).toBeGreaterThan(normal * 0.5);
        expect(speed, `d=${d.toFixed(3)} の芝の速さ`).toBeLessThan(normal * 1.5);
        checked += 1;
      }
      prev = visual;
    }
    expect(checked, '★コマを 1 つも見ていない').toBeGreaterThan(30);
  });

  /**
   * ★2026-10-02 本番 d=51.75 homestretch-side「急変」（★芝 -0.9m/秒・前のコマ 15.3m/秒）:
   *   ★カメラの切り替わりで 注視点が 8m 跳ぶ（★30m 未満）→ ★Δ が刻みの中で 跳んだ分を打ち消し ★切り替わった後のコマで芝が止まった。
   */
  it('カメラの切り替わりで注視点が数 m 跳んでも、切り替わった後のコマで芝は止まらない（★毎コマ ふだんの 0.5〜1.5 倍）', () => {
    const CUT_AT = 1.02;
    const focusAt = (d: number): number => d * 16 + (d >= CUT_AT ? 8 : 0);
    const make = (withCut: boolean) => buildVisualScroll(Array.from({ length: 61 }, (_, i) => ({
      displaySec: i * 0.05, focusS: focusAt(i * 0.05), rate: 1.09, anchorWeight: 0,
      cut: withCut && i === 21,
    })));
    const speeds = (vs: ReturnType<typeof buildVisualScroll>): number[] => {
      const out: number[] = [];
      const step = 1 / 60;
      let prev: number | null = null;
      for (let d = 0.6; d <= 1.6; d += step) {
        const f = focusAt(d);
        const visual = f + vs.deltaAt(d, f);
        /** ★切り替わったコマ（★画面が変わるので 芝のつながりは見えない）は除く */
        if (prev !== null && !(d - step < CUT_AT && d >= CUT_AT)) out.push((visual - prev) / step);
        prev = visual;
      }
      return out;
    };
    const normal = 16 / 1.09;
    const fixed = speeds(make(true));
    expect(fixed.length, '★コマを見ていない').toBeGreaterThan(30);
    for (const v of fixed) {
      expect(v).toBeGreaterThan(normal * 0.5);
      expect(v).toBeLessThan(normal * 1.5);
    }
    /** ★対照: ★切り替わりを知らせないと ★切り替わった後のコマで 芝が止まる（★本番の形） */
    expect(Math.min(...speeds(make(false)))).toBeLessThan(normal * 0.5);
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
