/**
 * 人気の推定（O-2）
 *
 * 指示書 §5 の定義: **人気は同一レースをモンテカルロした勝率順位**。
 *
 * ★ここを `verify-race.ts` の中に埋め込んでいたため、テストが1本も掛かっておらず、
 *   「同数のときどうするか」という**測定の自由変数が判定を作っていた**（V-6 の PASS が
 *   推定ノイズの産物だった）。モジュールに切り出して経路テストを掛ける。
 *
 * 【タイブレークが本質だった理由】
 *   下位の馬は試行を増やしても大半が0勝で並ぶ。当初これを「入力順（＝枠順）」で割っていたため、
 *   **「最低人気」が実際には「0勝で並んだ中で最も外枠の馬」**になっていた。
 *   その馬は真の最弱とは限らないので、試行回数を増やすほど真の最弱に近づき、
 *   V-6 が 60試行 1.00% → 1200試行 0.30% と単調に動いた。
 *   平均着順で割ると 0勝同士も区別でき、30〜1200試行で 0.23〜0.33% と安定する（R-12）。
 */

/**
 * 人気推定の既定試行数（較正定数・R-12）。
 *
 * ★タイブレークを平均着順にしたことで V-6 は 30〜1200試行で安定するが、
 *   **V-4 は試行回数で約1pp 動く**（60→200 で +1.19pp）ため、これは判定に効く自由変数である。
 *    に登録し、変異試験で防御を要求する。
 */
export const DEFAULT_POPULARITY_TRIALS = 200;

export interface PopularitySample {
  horseId: string;
  /** モンテカルロでの勝利回数 */
  wins: number;
  /** モンテカルロでの平均着順（小さいほど強い） */
  meanRank: number;
  /** 出走表での位置（＝枠順）。最後のタイブレークにのみ使う */
  index: number;
}

/**
 * 人気順（1番人気が先頭）に並べる。
 *
 * 優先順位: 勝利回数（降順） → 平均着順（昇順） → 枠順（昇順・完全同値のときだけ）
 */
export function rankByPopularity(samples: readonly PopularitySample[]): PopularitySample[] {
  return [...samples].sort(
    (a, b) => b.wins - a.wins || a.meanRank - b.meanRank || a.index - b.index,
  );
}

/** 集計器。モンテカルロの各試行の着順を食わせて、最後に `rank()` を呼ぶ */
export class PopularityEstimator {
  private readonly wins = new Map<string, number>();
  private readonly rankSum = new Map<string, number>();
  private readonly index = new Map<string, number>();
  private trials = 0;

  constructor(horseIds: readonly string[]) {
    horseIds.forEach((id, i) => {
      this.wins.set(id, 0);
      this.rankSum.set(id, 0);
      this.index.set(id, i);
    });
  }

  /** 1試行ぶんの着順（1着から並んだ horseId）を加える */
  addTrial(order: readonly string[]): void {
    this.trials += 1;
    order.forEach((id, i) => {
      if (i === 0) this.wins.set(id, (this.wins.get(id) ?? 0) + 1);
      this.rankSum.set(id, (this.rankSum.get(id) ?? 0) + (i + 1));
    });
  }

  rank(): PopularitySample[] {
    const denom = Math.max(1, this.trials);
    const samples: PopularitySample[] = [];
    for (const [horseId, index] of this.index) {
      samples.push({
        horseId,
        wins: this.wins.get(horseId) ?? 0,
        meanRank: (this.rankSum.get(horseId) ?? 0) / denom,
        index,
      });
    }
    return rankByPopularity(samples);
  }
}
