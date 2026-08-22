/**
 * ★**2D 馬群描画の限界テスト専用の純粋関数**
 *   （`DEV_INSTRUCTIONS_P4_2D_LIMIT_TEST_20260822.md`）
 *
 * 【★これは通常のレースでは使われません】
 *   ⚠️ この関数群は **`tools/render-2d-pack-limit.mjs` からのみ**呼ばれます。
 *      `/race` の描画経路・台本・既定値からは**一切参照されません**。
 *      （`packages/render/test/pack-limit.test.ts` が「漏れていないこと」を機械で見ています）
 *
 * 【なぜ純粋関数として切り出すか】
 *   ★密集化は**表示座標の変換**であって、レースの位置でも着順でもありません。
 *     ここを純粋関数にしておけば、**レース結果に触れていないことを型と検査で示せます**
 *     — 入力は「その時刻の位置」、出力は「その時刻の**描画用**位置」だけです。
 *
 * ⚠️ 乱数・時刻を使いません。すべてシードと馬番のハッシュで決まります（憲法 4）。
 */

/** 表示用の馬 1 頭（走路上の位置と横位置だけ） */
export interface PackHorse {
  readonly gate: number;
  /** 走路上の位置（m） */
  readonly s: number;
  /** 内ラチからの距離（m） */
  readonly w: number;
}

export interface PackDensifyOptions {
  /** 上位何頭を「馬群」とみなすか */
  readonly topN: number;
  /** その上位馬を収めたい前後の距離（m） */
  readonly targetSpanM: number;
  /** 横に何列に散らすか（重なり過ぎ・並び過ぎを避ける） */
  readonly lateralColumns: number;
  /** 列の間隔（m） */
  readonly lateralStepM: number;
  /** ★同じ点に完全に重ならないための最小間隔（m） */
  readonly minSeparationM: number;
  readonly phaseSeed: number;
  readonly integrate: {
    readonly horseBlurPx: number;
    readonly backgroundBlurPx: number;
    readonly horseMaskThreshold: number;
    readonly grade: { readonly brightness: number; readonly saturation: number; readonly hueDeg: number };
  };
}

/**
 * ★検証の固定条件。
 *   指示書 §6 の「上位 8 頭を 5〜7m」に対し、**中央の 6.0m** を狙います。
 */
export const PACK_LIMIT_TEST: PackDensifyOptions = {
  topN: 8,
  targetSpanM: 6.0,
  lateralColumns: 3,
  lateralStepM: 1.9,
  minSeparationM: 0.55,
  phaseSeed: 20260822,
  integrate: {
    horseBlurPx: 1.6,
    backgroundBlurPx: 3.2,
    horseMaskThreshold: 26,
    /**
     * ⚠️ ★`tint` は使いません。**画を単色に置き換えてしまい、セピア写真になりました**
     *    （実測・v3 の 1 コマ目）。色を「揃える」つもりが「奪う」処理でした。
     *    夕方の光へ寄せるのは**わずかな色相回り**で足ります。
     */
    grade: { brightness: 1.02, saturation: 0.94, hueDeg: 5 },
  },
};

/** 馬番とシードから 0〜1 を決める（乱数ではない・同じ入力なら同じ値） */
function hash01(gate: number, seed: number): number {
  let h = (gate * 374761393 + seed * 668265263) | 0;
  h = (h ^ (h >>> 13)) | 0;
  h = Math.imul(h, 1274126177) | 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967296;
}

/**
 * ★**馬群を前後に詰める**（表示座標の変換）
 *
 *   上位 `topN` 頭の先頭〜最後尾が `targetSpanM` に収まるよう、
 *   **先頭からの距離を一律に縮めます**。
 *
 * ⚠️ ★**順序は変えません。** 先頭からの距離に同じ係数を掛けるだけなので、
 *    誰が前かは元のままです（＝着順に一切触れていない、を式で示せる形）。
 * ⚠️ ★完全に同じ点へ重ならないよう、詰めたあとに最小間隔を確保します。
 *    重なると「馬群」ではなく「画像が 1 枚に潰れた」絵になります。
 */
export function packDensify(
  horses: readonly PackHorse[], opts: PackDensifyOptions,
): readonly PackHorse[] {
  if (horses.length === 0) return horses;
  const sorted = [...horses].sort((a, b) => b.s - a.s);
  const lead = sorted[0]!.s;
  const nth = sorted[Math.min(opts.topN, sorted.length) - 1]!;
  const span = lead - nth.s;
  const k = span > 1e-6 ? Math.min(1, opts.targetSpanM / span) : 1;

  /**
   * ★横位置は**列に置き直します**（元の `w` に足しません）。
   *
   * ⚠️ ★最初は元の `w` に列のずれを**足して**いました。元の `w` が 16m 広がっているので、
   *    合計で **6 列・16.5m** に散り、指示書の「2〜4 列」から外れました。
   *    詰めた馬群を作るのが目的なので、**横も作り直す**のが正しい形です。
   *   基準は馬群の**平均の横位置**にして、レースが取った内外はおおむね保ちます。
   */
  const meanW = horses.reduce((sum, h) => sum + h.w, 0) / horses.length;
  /** 先頭からの距離を k 倍にし、そのあと最小間隔を後ろ向きに確保する */
  const out: PackHorse[] = [];
  let prevS = Number.POSITIVE_INFINITY;
  for (const [index, horse] of sorted.entries()) {
    let s = lead - (lead - horse.s) * k;
    if (s > prevS - opts.minSeparationM) s = prevS - opts.minSeparationM;
    prevS = s;
    /**
     * ★横は**列に振り分けます**。
     *   ⚠️ 元の `w` をそのまま使うと、詰めた結果 2 頭が同じ (s, w) に来ることがあります。
     *      列に配ると必ず横にずれるので、重なっても**奥行きのある重なり**になります。
     */
    const column = Math.floor(hash01(horse.gate, opts.phaseSeed + 101) * opts.lateralColumns);
    const centre = (opts.lateralColumns - 1) / 2;
    const jitter = (hash01(horse.gate, opts.phaseSeed + 211) - 0.5) * opts.lateralStepM * 0.45;
    out.push({
      gate: horse.gate,
      s,
      w: meanW + (column - centre) * opts.lateralStepM + jitter,
      // index は使わないが、並びの安定を明示するために参照しておく
      ...(index < 0 ? {} : {}),
    });
  }
  return out;
}

/**
 * ★**走行位相を馬ごとに散らす**
 *
 * ⚠️ ★現行は `馬番 × 0.37` の**等間隔**です。等間隔だと、馬番が近い馬どうしで
 *    同じ見え方が**周期的に並びます**。ハッシュで散らします。
 */
export function packPhaseOffsets(fieldSize: number, seed: number): ReadonlyMap<number, number> {
  const out = new Map<number, number>();
  for (let gate = 1; gate <= fieldSize; gate += 1) out.set(gate, hash01(gate, seed));
  return out;
}

/**
 * ★**完歩長の個体差**（±4%）。脚の回る速さが馬ごとに少しずれます。
 *
 * ⚠️ ★**平均速度も着順も変えません。** 変えるのは「同じ距離を進む間に脚が何回転するか」だけで、
 *    位置そのものには一切触れていません。
 */
export function packStrideScale(fieldSize: number, seed: number): ReadonlyMap<number, number> {
  const out = new Map<number, number>();
  for (let gate = 1; gate <= fieldSize; gate += 1) {
    out.set(gate, 1 + (hash01(gate, seed + 977) - 0.5) * 0.08);
  }
  return out;
}
