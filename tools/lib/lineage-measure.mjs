/**
 * ★**D-121 ③ の測る部品**（★純関数・DB に触らない・`tools/measure-lineage-plateau.mjs` が使う）。
 *   ★裁定 `REVIEW_D121_MEASURE_TOOL_VERDICT_20260923.md`（M-1〜M-4）。
 *
 *   ★物差し: ★**いまの NPC 現役の素質の合計**の中で ★何 % 点か（★Q-2 の模擬と同じ・`REPORT_Q2_LINEAGE_SIM_20260922.md`）。
 *   ★(a) の頭打ち（★直近 K 世代が それまでの最良 ＋ 幅 を上回らない）は ★**参考の列**。★合否の判定にしない（§1）。
 */
import { ABILITY_KEYS } from '../../packages/sim-engine/src/index.ts';

/** ★素質の合計（★能力の全項目の和） */
export function potentialSum(potential) {
  let s = 0;
  for (const k of ABILITY_KEYS) s += Number(potential?.[k] ?? 0);
  return s;
}

/**
 * ★物差し（★昇順の配列）の中で ★何 % 点か（★0〜100）。★同じ値は半分ずつ数える（★中位の % 点）。
 * @param {readonly number[]} sortedRef ★昇順
 * @param {number} value
 */
export function percentileOf(sortedRef, value) {
  if (sortedRef.length === 0) return null;
  let below = 0;
  let equal = 0;
  for (const r of sortedRef) {
    if (r < value) below += 1;
    else if (r === value) equal += 1;
  }
  return ((below + equal / 2) / sortedRef.length) * 100;
}

/** ★分位点（★最近傍・q は 0〜100） */
export function quantile(values, q) {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const i = Math.min(s.length - 1, Math.max(0, Math.ceil((q / 100) * s.length) - 1));
  return s[i];
}

/**
 * ★**自家で生産した馬に、母系の世代を振る**。
 *   ★母が同じ利用者の自家産でなければ 1 世代目。★そうなら 母の世代 ＋ 1。
 * @param {readonly { id: string, userId: string, damId: string | null }[]} bred ★自家で生産した馬（★`foal_drafts.named_horse_id`）
 * @returns {Map<string, number>} ★馬の ID → 世代
 */
export function maternalGenerations(bred) {
  const byId = new Map(bred.map((h) => [h.id, h]));
  const gen = new Map();
  const genOf = (h, depth = 0) => {
    if (gen.has(h.id)) return gen.get(h.id);
    if (depth > 1000) throw new Error('★母系がたどれません（★輪になっている）');
    const dam = h.damId === null ? undefined : byId.get(h.damId);
    const g = dam !== undefined && dam.userId === h.userId ? genOf(dam, depth + 1) + 1 : 1;
    gen.set(h.id, g);
    return g;
  };
  for (const h of bred) genOf(h);
  return gen;
}

/**
 * ★**参考の列 (a)**: ★直近 `k` 世代が続けて、★それより前の最良 ＋ `width` を上回らなかったか。
 * @param {readonly number[]} bestByGen ★世代 1, 2, … の最良の % 点（★抜けた世代は無い前提）
 * @returns {'plateau' | 'rising' | 'undecidable'} ★世代が k ＋ 1 に満たなければ判定できない
 */
export function plateauOf(bestByGen, k, width) {
  if (bestByGen.length < k + 1) return 'undecidable';
  const earlier = Math.max(...bestByGen.slice(0, bestByGen.length - k));
  const recent = bestByGen.slice(bestByGen.length - k);
  return recent.every((v) => v <= earlier + width) ? 'plateau' : 'rising';
}

/**
 * ★**利用者ごとに まとめる**（★ID は返さない・★数だけ）。
 * @param {readonly { id: string, userId: string, damId: string | null, sum: number, inbreed: number, frail: boolean }[]} bred
 * @param {readonly number[]} sortedRef
 * @param {{ k: number, width: number }} opt
 */
export function summarizeUsers(bred, sortedRef, opt) {
  const gen = maternalGenerations(bred);
  const users = new Map();
  for (const h of bred) {
    const u = users.get(h.userId) ?? { byGen: new Map(), inbreed: [], frail: 0, n: 0 };
    const p = percentileOf(sortedRef, h.sum);
    const g = gen.get(h.id);
    u.byGen.set(g, Math.max(u.byGen.get(g) ?? -Infinity, p));
    u.inbreed.push(h.inbreed);
    if (h.frail) u.frail += 1;
    u.n += 1;
    users.set(h.userId, u);
  }
  const out = [];
  for (const u of users.values()) {
    const gens = [...u.byGen.keys()].sort((a, b) => a - b);
    // ★母系で世代が抜けることは無い（★母は自家産の前の世代）。★念のため 1..max を詰めて並べる
    const bestByGen = gens.map((g) => u.byGen.get(g));
    out.push({
      best: Math.max(...bestByGen),
      bestByGen,
      plateau: plateauOf(bestByGen, opt.k, opt.width),
      inbreedMean: u.inbreed.reduce((a, b) => a + b, 0) / u.inbreed.length,
      frailShare: u.frail / u.n,
      horses: u.n,
    });
  }
  return out;
}
