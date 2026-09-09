import type { HorseAt, PositionModel } from './scene.js';

/**
 * Replay steering. Longitudinal positions and finish times stay authoritative;
 * the supplied lanes are preferred paths, with space reserved for nearby horses.
 * Samples are built once so pausing, seeking and frame rate cannot change the path.
 */
export function trafficPositionModel(base: PositionModel, widthM: number): PositionModel {
  const dt = 0.05;
  const samples: number[][] = [];
  const first = base.at(0);
  if (first.length === 0) return base;
  const gates = first.map(h => h.gate);
  const margin = 0.8;
  const gap = Math.min(1.3, (widthM - 2 * margin) / Math.max(1, gates.length - 1));
  let lanes = first.map(h => h.w ?? margin);
  const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
  const end = base.raceSec;
  const finishTimes = gates.map((_, i) => {
    if (base.at(end)[i]!.meters < base.distanceMeter) return Infinity;
    let lo = 0, hi = end;
    for (let n = 0; n < 40; n++) {
      const mid = (lo + hi) / 2;
      if (base.at(mid)[i]!.meters >= base.distanceMeter) hi = mid; else lo = mid;
    }
    return hi;
  });
  // The replay clamps finished horses onto the line, but the screen runs them
  // out at 14 m/s. Steering must see them running out too, or it tries to fit
  // the entire field abreast at the line and pushes horses into the rail.
  const positionsAt = (t: number): readonly HorseAt[] => base.at(t).map((h, i) => ({
    ...h, meters: t >= finishTimes[i]!
      ? base.distanceMeter + (t - finishTimes[i]!) * 14 : h.meters,
  }));
  samples.push([...lanes]);
  for (let step = 1; step <= Math.ceil(end / dt) + 1; step++) {
    const t = step * dt;
    const now = positionsAt(t);
    if (now.every(h => h.meters <= 0)) { samples.push([...lanes]); continue; }
    const ahead = positionsAt(t + 2);
    const lo = lanes.map((w, i) => t >= finishTimes[i]! ? w : Math.max(margin, w - dt * 0.65));
    const hi = lanes.map((w, i) => t >= finishTimes[i]! ? w : Math.min(widthM - margin, w + dt * 0.65));
    // Different response times let horses settle when their own space opens.
    // The starting gate identifies the horse; it does not give outer gates a
    // systematically slower response.
    const next = lanes.map((w, i) => {
      const response = 0.35 + ((gates[i]! * 7) % 11) * 0.025;
      return clamp(w + ((now[i]!.w ?? w) - w) * dt * response, lo[i]!, hi[i]!);
    });
    const constraints: { i: number; j: number; sign: number; distance: number }[] = [];
    for (let i = 0; i < gates.length; i++) for (let j = i + 1; j < gates.length; j++) {
      const delta = now[i]!.meters - now[j]!.meters;
      const predicted = ahead[i]!.meters - ahead[j]!.meters;
      const closest = delta * predicted <= 0 ? 0 : Math.min(Math.abs(delta), Math.abs(predicted));
      if (closest >= 10) continue;
      // Derive every constraint from the same current lateral ordering. Cached
      // pair orderings can form A < B < C < A after an unoccupied lane crossing,
      // making the spacing constraints impossible to satisfy at the finish.
      const sign = lanes[j]! >= lanes[i]! ? 1 : -1;
      const u = clamp((10 - closest) / 6, 0, 1);
      const startGap = Math.min(gap, Math.abs((first[j]!.w ?? 0) - (first[i]!.w ?? 0)));
      const release = clamp(Math.max(now[i]!.meters, now[j]!.meters) / 20, 0, 1);
      const spacing = startGap + (gap - startGap) * release;
      constraints.push({ i, j, sign, distance: spacing * u * u * (3 - 2 * u) });
    }
    for (let pass = 0; pass < 20; pass++) {
      for (const c of constraints) {
        const left = c.sign > 0 ? c.i : c.j;
        const right = c.sign > 0 ? c.j : c.i;
        const missing = c.distance - (next[right]! - next[left]!);
        if (missing <= 0) continue;
        const l = Math.min(missing / 2, next[left]! - lo[left]!);
        const r = Math.min(missing - l, hi[right]! - next[right]!);
        next[left] = next[left]! - Math.min(missing - r, next[left]! - lo[left]!);
        next[right] = next[right]! + r;
      }
    }
    lanes = next;
    samples.push([...lanes]);
  }
  return {
    ...base,
    at(sec: number): readonly HorseAt[] {
      const index = clamp(sec / dt, 0, samples.length - 1);
      const a = Math.floor(index), b = Math.min(samples.length - 1, a + 1);
      const u = index - a;
      return base.at(sec).map((h, i) => ({ ...h, w: samples[a]![i]! * (1 - u) + samples[b]![i]! * u }));
    },
  };
}
