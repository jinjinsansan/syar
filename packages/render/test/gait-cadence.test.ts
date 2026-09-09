/**
 * ★**表示秒あたりの歩調**（★2026-09-10・F-G4）
 *
 * ★指示書 §3 F-G4:
 *   ★「本編の位相入力は単なる距離ではなく `easedAt.meters + gaitDelta`。
 *   ★`gaitDelta` には `visual-scroll.ts` の時計圧縮補正がある。
 *   ★**2 倍のレース時計だから脚も必ず 2 倍、と短絡しない。**」
 *
 * 【★測って分かったこと】
 *   ★`buildVisualScroll` の定義から、★**見た目の進行距離は表示秒あたり実馬の速さ**になる。
 *   ★つまり時間圧縮が 2 倍でも ★**脚は 2 倍にならない**。★この性質をここで固定する
 *   （★前便で開発側が「2 倍速だから脚も 2 倍」と述べたのは誤りだった）。
 *
 * 【★では何が歩調を決めていたか】
 *   ★`完歩/秒 = 実馬の速さ ÷ 1 完歩`。★1 完歩が素材と合っていなければ蹄が滑る。
 *   ★検証台（★オーナーが目で決めた画面）は ★16.0m/s・1 完歩 5.60m・**2.86 完歩/秒**。
 *   ★本編は ★`BROADCAST_STRIDE_M = 7`（★前の素材の値）で ★**2.29 完歩/秒**だった。
 */
import { describe, it, expect } from 'vitest';
import { buildVisualScroll, type VisualScrollSample } from '../src/visual-scroll.js';
import { raceGaitPhase } from '../src/race-motion.js';
import { DEFORMED_HORSE_CALIBRATION, LEGACY_HORSE_CALIBRATION } from '../src/horse-ground.js';

/** ★実馬の速さ [m/レース秒]・★検証台の画面と同じ値 */
const REAL_MPS = 16;

/**
 * ★圧縮率 `rate` で `seconds` 表示秒ぶんの標本を作る。
 *   ★`rate = dレース秒 / d表示秒`。★注視点は実馬の速さで進む。
 */
function samplesAt(rate: number, seconds: number, step = 0.05): VisualScrollSample[] {
  const out: VisualScrollSample[] = [];
  for (let i = 0; i * step <= seconds; i += 1) {
    const displaySec = i * step;
    out.push({ displaySec, focusS: REAL_MPS * displaySec * rate, rate, anchorWeight: 0 });
  }
  return out;
}

describe('時間圧縮は脚の速さを変えない', () => {
  it.each([1, 1.8, 2, 5.2])('圧縮 %s 倍でも、見た目の進行は表示秒あたり実馬の速さ', (rate) => {
    const samples = samplesAt(rate, 4);
    const scroll = buildVisualScroll(samples);
    const visualAt = (d: number): number => REAL_MPS * d * rate + scroll.deltaAt(d);
    for (const d of [1, 2, 3]) {
      const perSec = visualAt(d + 1) - visualAt(d);
      expect(perSec).toBeCloseTo(REAL_MPS, 6);
    }
  });

  it('圧縮しない場合と 2 倍の場合で、1 表示秒あたりの完歩数が変わらない', () => {
    const cadence = (rate: number): number => {
      const scroll = buildVisualScroll(samplesAt(rate, 4));
      const visualAt = (d: number): number => REAL_MPS * d * rate + scroll.deltaAt(d);
      const stride = DEFORMED_HORSE_CALIBRATION.strideM;
      let cycles = 0;
      let previous = raceGaitPhase(visualAt(1), 3, stride);
      for (let i = 1; i <= 200; i += 1) {
        const phase = raceGaitPhase(visualAt(1 + i / 200), 3, stride);
        cycles += ((phase - previous) + 1) % 1;
        previous = phase;
      }
      return cycles;
    };
    expect(cadence(2)).toBeCloseTo(cadence(1), 3);
  });
});

describe('歩調は 1 完歩の値で決まる', () => {
  it('検証台の画面と同じ 2.86 完歩/秒になる', () => {
    expect(REAL_MPS / DEFORMED_HORSE_CALIBRATION.strideM).toBeCloseTo(2.86, 2);
  });

  it('前の素材の値（7m）では 2.29 完歩/秒で、地面より 20% 遅い', () => {
    expect(REAL_MPS / LEGACY_HORSE_CALIBRATION.strideM).toBeCloseTo(2.29, 2);
    /** ★脚 1 回転あたり地面が余計に流れる割合（★＝蹄の滑り） */
    const slip = LEGACY_HORSE_CALIBRATION.strideM / DEFORMED_HORSE_CALIBRATION.strideM - 1;
    expect(slip).toBeCloseTo(0.25, 2);
  });

  it('位相は 1 完歩ぶん進むとちょうど 1 周する', () => {
    const stride = DEFORMED_HORSE_CALIBRATION.strideM;
    for (const gate of [1, 6, 12]) {
      /** ★発走直後は個体差を開くので、★十分に進んだ所で測る */
      const base = 200;
      expect(raceGaitPhase(base + stride, gate, stride))
        .toBeCloseTo(raceGaitPhase(base, gate, stride), 9);
    }
  });
});
