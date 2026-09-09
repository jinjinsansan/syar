/** Distance-driven gait, continuous from the held gate pose, including when seeking. */
export function raceGaitPhase(travelM: number, gate: number, strideM: number): number {
  const cycles = Math.max(0, travelM) / Math.max(0.1, strideM);
  const u = Math.min(1, cycles);
  const spread = u * u * (3 - 2 * u);
  const offset = ((gate * 0.37 + 0.5) % 1) - 0.5;
  return ((3.5 / 8 + cycles + offset * spread) % 1 + 1) % 1;
}

/** Scale only the lift above the cropped feet; keep the ground and body anchor fixed. */
export function scaledHorseLift(lift: number, feetFromAnchor: number, amount = 1): number {
  const factor = Number.isFinite(amount) ? Math.max(0, Math.min(2, amount)) : 1;
  if (factor === 1) return lift;
  return feetFromAnchor + (lift - feetFromAnchor) * factor;
}
