/**
 * ★発走の見せ方（速さを立ち上げる）を留める
 *
 * 【なぜ要るか（2026-08-22 の実害）】
 *   以前は表示位置を「**距離 × k(t)**」で圧縮していました。実測で 2 つの実害:
 *     ① 見た目の速さが **0 → 25.0 m/s まで行き過ぎてから 18.0 m/s へ戻る**
 *        （★実際の馬は加速したあと減速しません。オーナー評「ゲートの出だし…馬が飛ぶ」）
 *     ② **着差が縮む** — 実際 5 馬身の差が発走 0.2 秒で **0.66 馬身**にしか見えない
 *        （旧コメントは「着差の見え方は変わらない」としていたが**誤り**。
 *          全馬に同じ係数を掛ければ差も同じだけ縮む）
 *   → **同じ距離を引く**形に変更。速さは単調に上がり、着差はそのまま。
 */
import { describe, it, expect } from 'vitest';
import { broadcastV2StartLagM } from '../src/broadcast-v2.js';

const V = 15.6;
const shown = (t: number) => Math.max(0, V * t - broadcastV2StartLagM(t, V));

describe('★発走の立ち上がり', () => {
  it('★★見た目の速さが単調に上がる（行き過ぎて戻らない）', () => {
    let prev = 0, worstDrop = 0;
    for (let t = 0.1; t <= 3.0; t += 0.05) {
      const v = (shown(t) - shown(t - 0.05)) / 0.05;
      worstDrop = Math.max(worstDrop, prev - v);
      prev = v;
    }
    // ★旧実装では 25.0 → 18.0 m/s と 7 m/s も落ちていた
    expect(worstDrop, `見た目の速さが ${worstDrop.toFixed(1)} m/s 落ちています`).toBeLessThan(0.2);
  });

  it('★★着差が縮まない（掛け算ではなく引き算だから）', () => {
    for (const t of [0.2, 0.5, 1.0, 2.0, 3.0]) {
      const lag = broadcastV2StartLagM(t, V);
      const a = V * t, b = V * t - 5 * 2.4;      // 5 馬身差
      expect(((a - lag) - (b - lag)) / 2.4).toBeCloseTo(5, 6);
    }
  });

  it('★発走の瞬間は遅れ 0（ゲートの位置から始まる）', () => {
    expect(broadcastV2StartLagM(0, V)).toBe(0);
    expect(broadcastV2StartLagM(-1, V)).toBe(0);
  });

  it('★★立ち上がりが終わったら遅れは一定（それ以上ずれない）', () => {
    const a = broadcastV2StartLagM(3.0, V);
    for (const t of [3.5, 5, 20, 60]) {
      expect(broadcastV2StartLagM(t, V)).toBeCloseTo(a, 6);
    }
  });

  it('★遅れは前へ進むだけ（表示位置が後戻りしない）', () => {
    let prev = -1;
    for (let t = 0; t <= 4; t += 0.05) {
      const m = shown(t);
      expect(m, `表示位置が ${t.toFixed(2)} 秒で後戻りしています`).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = m;
    }
  });
});
