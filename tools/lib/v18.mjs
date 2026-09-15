/**
 * ★**V-18 の測り方（1 か所）**（正典 §13.2 / D-071 / D-090）
 *
 * 【★なぜ切り出すか】
 *   ★2026-08-31 現在、V-18 を測る必要がある場所が **3 つ**になりました:
 *     ① `tools/verify-v18.mjs`（★重い版・2000 レース × 44 通り。手で回す）
 *     ② ★**検定（CI）**（★正典 **R-32**: 正典のゲートは検定の中に置く）
 *     ③ ★半径を振ったときの地図（指示書 §4-2）
 *   ⚠️ ★**同じ量を 3 か所で持てば必ず離れます**（D-052）。★この案件で実際に:
 *      ★②b を 2 通りに実装して **0.567 対 0.216** と食い違いました（台帳 B-5・2026-08-31）。
 *   → ★**測り方はここだけ**にします。
 *
 * ⚠️ ★中身は `verify-v18.mjs` から **1 行も変えずに**移しました。
 *    ★`spec` を省いたときの値は 2026-08-30 以前と完全に同じです。
 *
 * 【★本番の条件（2026-09-15・指示書 VW §7-1・R-30 / R-31）】
 *   ★`opts.frozen`（凍結した走路の形）を渡すと、★条件を **`conditionsFromFrozen`**（ワーカーの確定と同じ関数）で作ります。
 *   ★本番の番組に現れる（場 × 距離）の組は `productionV18Combos()` から取ります。
 *
 * ⚠️ ★**この道具は DB を触りません**（読取専用・R-24 の分類は `classification.mjs`）。
 */
import { readFileSync } from 'node:fs';
import {
  DEFAULT_RACE_BALANCE, resolveRace, laneExtraM, HORSE_LENGTH_M, conditionsFromFrozen,
} from '@star/race-engine';
import { RACES_PER_DAY, productionRaceOf } from '@star/scheduler';

/**
 * ★正典 §13.2 の帯。★**直書きしないこと** — ★ここから引きます。
 *   ★②a: 4〜12 馬身（★上限 12 は D-090 で「残す」と決定・段階①の完了時に見直し）
 *   ★①: |ρ| ≤ 0.10
 *   ★②b: 枠間の平均差 ≤ 1 馬身（D-090・`packages/race-engine/test/lane-reveal.test.ts`）
 */
export const V18_BAND = Object.freeze({ rhoMax: 0.10, lengthsMin: 4, lengthsMax: 12, gateBiasMax: 1 });

export const V18_DEFAULT_FIELD = 12;
export const V18_STRATEGIES = Object.freeze(['nige', 'senko', 'sashi', 'oikomi']);

/**
 * ★出走馬の池。★**画面と同じものを読みます**（R-30）。
 * ⚠️ ★実行時の作業ディレクトリに依存させません（★検定から呼ぶと cwd が違いえます）。
 */
export function loadV18Pool() {
  return JSON.parse(readFileSync(new URL('../../apps/web/src/lib/watch-pool.json', import.meta.url), 'utf8'));
}

/** スピアマンの順位相関 */
export function spearman(xs, ys) {
  const n = xs.length;
  const rank = (v) => {
    const idx = v.map((x, i) => [x, i]).sort((a, b) => a[0] - b[0]);
    const r = new Array(n);
    for (let i = 0; i < n;) {
      let j = i;
      while (j + 1 < n && idx[j + 1][0] === idx[i][0]) j++;
      const avg = (i + j) / 2 + 1;
      for (let k = i; k <= j; k++) r[idx[k][1]] = avg;
      i = j + 1;
    }
    return r;
  };
  const rx = rank(xs), ry = rank(ys);
  const mx = rx.reduce((a, b) => a + b, 0) / n;
  const my = ry.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = rx[i] - mx, dy = ry[i] - my;
    sxy += dx * dy; sxx += dx * dx; syy += dy * dy;
  }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : 0;
}

/**
 * ★`spec` と `opts.frozen` から、★エンジンに渡す条件と距離ロスの走路を決める。
 * ⚠️ ★両方を渡したら投げます（★どちらが使われたか分からない形を作らない・R-27）。
 */
function courseOf(dist, spec, opts, raceId) {
  if (opts.frozen !== undefined && spec !== undefined) {
    throw new Error('measureV18: spec と opts.frozen を同時に渡さないこと');
  }
  if (opts.frozen !== undefined) {
    const conditions = conditionsFromFrozen(opts.frozen, {
      raceId, distance: dist, surface: 'turf', trackCondition: 'good',
    });
    return { conditions, laneSpec: conditions.course };
  }
  return {
    conditions: {
      raceId, distance: dist, surface: 'turf',
      trackCondition: 'good', courseShape: 'oval', baseWeightKg: 55,
      /** ★競馬場の走路の形。★省くと `DEFAULT_OVAL`（＝従来と同じ） */
      course: spec,
    },
    laneSpec: spec,
  };
}

/**
 * ★**1 つの（距離・走路の形）を測る。**
 *
 * ⚠️ ★`spec` を省くと `DEFAULT_OVAL`。★**省いたときの値は 2026-08-30 以前と完全に同じ**です。
 * ★`spec` を渡すと、★**その競馬場の走路**で着順まで判定します（B案 ②）。
 *
 * @param opts.races ★レース数。★**判定には 2000。** ⚠️ ★減らすと相関の雑音が増えます
 * @param opts.laneModel ★走る場所の作り方（★検定の対照で使う。★本番は既定のみ）
 * @param opts.frozen ★凍結した走路の形（★本番の条件。`spec` と同時に渡さない）
 */
export function measureV18(dist, spec, opts = {}) {
  const RACES = opts.races ?? 2000;
  const FIELD = opts.field ?? V18_DEFAULT_FIELD;
  const POOL = opts.pool ?? loadV18Pool();
  const STRATS = V18_STRATEGIES;
  const gates = [];
  const places = [];
  const spreads = [];
  for (let r = 0; r < RACES; r++) {
    const seed = r * 2654435761 + dist;
    /**
     * ⚠️ ★**枠に入れる馬を混ぜます。**
     *    最初は `POOL` の順にそのまま枠 1〜12 へ入れ、脚質も `(i + r) % 4` で振っていました。
     *    → ★**枠と「馬の能力・脚質」が相関**し、
     *      **距離ロスを入れる前から 枠と着順の相関が 0.102** と出ました。
     *    ★**道具が作った相関でした。** 測っていたのはエンジンではありません。
     */
    const startIdx = (r * 13) % Math.max(1, POOL.length - FIELD);
    const picked = POOL.slice(startIdx, startIdx + FIELD);
    const order = picked.map((_, i) => i);
    /**
     * ⚠️ ★**最初は「弱いハッシュの剰余」でシャッフルしていました。**
     *    混ぜが足りず、★**枠と馬の能力が均されず**、相関 0.078 が出ました。
     *    ★**測っていたのはエンジンではなく、私のシャッフルでした**（道具に裏切られた3件目）。
     * → ★**まともな擬似乱数**（mulberry32）で Fisher-Yates。
     */
    let st = (seed ^ 0x6d2b79f5) >>> 0;
    const rnd = () => {
      st = (st + 0x6d2b79f5) >>> 0;
      let t = st;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    const entrants = order.map((src, i) => {
      const h = picked[src];
      return {
        horseId: String(i + 1), stats: h.stats, surfaceAptitude: h.surfaceAptitude,
        distanceCenter: h.distanceCenter, distanceRange: h.distanceRange,
        strategyAptitude: h.strategyAptitude, heavyAptitude: h.heavyAptitude,
        strategy: STRATS[(src + r) % 4], condition: 3, fatigue: 20,
        weightKg: 55, gate: i + 1, age: 4, skillGenes: h.skillGenes,
      };
    });
    const { conditions, laneSpec } = courseOf(dist, spec, opts, `v18-${dist}-${r}`);
    const res = resolveRace({ conditions, entrants, seed, balance: DEFAULT_RACE_BALANCE });
    for (const e of res.order) {
      gates.push(Number(e.horseId));
      places.push(e.finishPosition);
    }
    const extras = entrants.map((e) =>
      laneExtraM(e.gate, FIELD, dist, seed, laneSpec, 10, undefined, opts.laneModel));
    spreads.push(Math.max(...extras) - Math.min(...extras));
  }
  const rho = spearman(gates, places);
  const meanSpread = spreads.reduce((a, b) => a + b, 0) / spreads.length;
  const lengths = meanSpread / HORSE_LENGTH_M;
  return {
    rho, meanSpread, lengths,
    ok1: Math.abs(rho) <= V18_BAND.rhoMax,
    ok2: lengths >= V18_BAND.lengthsMin && lengths <= V18_BAND.lengthsMax,
  };
}

/**
 * ★**V-18 ②b — 枠順由来の内外差（馬身）**（正典 D-090）。
 *
 * ⚠️ ★定義と seed の作り方は `packages/race-engine/test/lane-reveal.test.ts` の `gateBiasLengths` と**同じ**です
 *    （★多数シードで枠ごとに平均 → 枠間の最大 − 最小）。★1 レースごとに出して平均しないこと（台帳 B-5）。
 *    ★`DEFAULT_OVAL`・1600m で検査側と同じ 0.216 が出ることを報告書で確かめています。
 * ★1000 本で落ち着きます（★検査側の註記の実測）。
 */
export function gateBiasV18(dist, spec, opts = {}) {
  const SEEDS = opts.seeds ?? 1000;
  const FIELD = opts.field ?? V18_DEFAULT_FIELD;
  const { laneSpec } = courseOf(dist, spec, opts, `v18b-${dist}`);
  const sum = new Array(FIELD).fill(0);
  for (let r = 0; r < SEEDS; r += 1) {
    const seed = r * 2654435761 + dist;
    for (let g = 1; g <= FIELD; g += 1) {
      sum[g - 1] += laneExtraM(g, FIELD, dist, seed, laneSpec, 10, undefined, opts.laneModel);
    }
  }
  const mean = sum.map((s) => s / SEEDS);
  const lengths = (Math.max(...mean) - Math.min(...mean)) / HORSE_LENGTH_M;
  return { lengths, ok: lengths <= V18_BAND.gateBiasMax };
}

/**
 * ★**本番の番組に現れる（場 × 距離）の組**（★1 週分の `productionRaceOf` から・R-30）。
 *   ★並びは場の id → 距離の順。★`frozen` はその組の凍結した走路の形です。
 */
export function productionV18Combos() {
  const combos = new Map();
  for (let i = 0; i < RACES_PER_DAY * 7; i += 1) {
    const p = productionRaceOf(i);
    const key = `${p.courseFrozen.venueId}/${p.programme.distance}`;
    if (!combos.has(key)) combos.set(key, { venueId: p.courseFrozen.venueId, distance: p.programme.distance, frozen: p.courseFrozen });
  }
  return [...combos.values()].sort((a, b) => a.venueId.localeCompare(b.venueId) || a.distance - b.distance);
}
