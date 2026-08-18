/**
 * ★**見た目の速度**（背景の流れ・脚の周期）を時間圧縮から切り離す。
 *
 * D-062 の時間圧縮（道中 1.8 倍速・直線 0.7 倍速）をそのまま世界に当てると、
 *   序盤: 背景が 28m/秒で流れ、脚は 4 完歩/秒（「小走り」）
 *   直線: 背景が 12m/秒、脚は 1.7 完歩/秒（スローモーション）
 * になる（実測: `tools/audit-race-motion.mjs`）。オーナー指摘「途中でグングン速くなるのが不自然」の正体。
 *
 * → 背景と脚には **真の走速（レース時計での m/秒）** を使い、順位の推移だけを圧縮する。
 *   実装は「表示時計での注視点の増分 × k」を積分した補正 Δ(d) で表す:
 *     見た目の進行距離 = focusS(d) + Δ(d),  dΔ = (k − 1)·dfocusS,  k = 1/rate（rate = dレース時計/d表示時計）
 *   ★決勝線・審判塔のように世界に固定した物体を映す区間では k → 1（重み w=1）にし、
 *     Δ をその区間で 0 に正規化する（物体と馬の位置が一致する）。
 *
 * ⚠️ 位置・時刻・着順には一切触れない。乱数も使わない（憲法4）。
 */
export interface VisualScrollSample {
  readonly displaySec: number;
  /** そのフレームの注視点（m・真の位置） */
  readonly focusS: number;
  /** dレース時計/d表示時計（時間圧縮の倍率） */
  readonly rate: number;
  /** 0=見た目の速度で流す, 1=真の位置に一致させる（`broadcastV2AnchorWeight`） */
  readonly anchorWeight: number;
}

export interface VisualScroll {
  /** 補正 Δ（m）。見た目の進行距離 = focusS + Δ */
  deltaAt(displaySec: number): number;
}

export function buildVisualScroll(samples: readonly VisualScrollSample[]): VisualScroll {
  if (samples.length === 0) return { deltaAt: () => 0 };
  const times = new Float64Array(samples.length);
  const deltas = new Float64Array(samples.length);
  times[0] = samples[0]!.displaySec;
  deltas[0] = 0;
  for (let i = 1; i < samples.length; i++) {
    const cur = samples[i]!;
    const prev = samples[i - 1]!;
    if (!(cur.displaySec > prev.displaySec)) throw new Error('visual scroll: samples must be increasing in displaySec');
    const rate = cur.rate > 0 && Number.isFinite(cur.rate) ? cur.rate : 1;
    const w = Math.max(0, Math.min(1, cur.anchorWeight));
    const k = w + (1 - w) / rate;
    times[i] = cur.displaySec;
    deltas[i] = deltas[i - 1]! + (k - 1) * (cur.focusS - prev.focusS);
  }
  // ★固定物体の区間で Δ=0 になるよう正規化（最初に w=1 になった点を基準にする）
  const anchorIndex = samples.findIndex((sample) => sample.anchorWeight >= 0.999);
  const base = anchorIndex >= 0 ? deltas[anchorIndex]! : 0;
  for (let i = 0; i < deltas.length; i++) deltas[i] = deltas[i]! - base;
  return {
    deltaAt(displaySec: number): number {
      if (displaySec <= times[0]!) return deltas[0]!;
      const last = times.length - 1;
      if (displaySec >= times[last]!) return deltas[last]!;
      let lo = 0, hi = last;
      while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (times[mid]! <= displaySec) lo = mid; else hi = mid; }
      const t = (displaySec - times[lo]!) / (times[hi]! - times[lo]!);
      return deltas[lo]! + (deltas[hi]! - deltas[lo]!) * t;
    },
  };
}
