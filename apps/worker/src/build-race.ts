/**
 * 出走表とオッズを作る（正典 §10.4・§9.2）
 *
 * 【★較正済みロジックを再利用する】
 *   出走馬の構成は `apps/cli/src/race-field.ts` の `generateRace` に P1 で較正済みです。
 *   ここで組み直すと出走頭数分布（§10.4）が崩れ、V-4/V-6 に波及します。
 */

import { Rng, deriveRng, type HorseRecord } from '@star/sim-engine';
import { DEFAULT_RACE_BALANCE, conditionsFromFrozen, lanePlanForRace, resolveRace, type RaceEntrant } from '@star/race-engine';
import { TICKET_KINDS, placeDepth, type TicketKind } from '@star/betting';
import { frozenCourseOf, selectEligible, type FrozenCourseRecord, type RaceClass } from '@star/scheduler';
import { FIELD_SIZE, generateRace, sortPoolByClass } from '../../cli/src/race-field.js';
import { ODDS_MC_TRIALS, buildOddsRows, winningKeys } from './odds.js';
import type { OddsSpec, RaceEntrantSpec } from './cycle-runner.js';

/** ★オッズ算出用のサブストリーム。§9.2 で本番確定とは別系列 */
const STREAM = { FIELD: 61, ODDS: 62 } as const;

export interface BuiltRace {
  readonly entrants: RaceEntrantSpec[];
  readonly odds: OddsSpec[];
  /**
   * ★**オッズを計算したときの条件そのもの**（Q-P3-32 の是正）。
   *   これを DB に保存します。別経路で組み直すと、
   *   「オッズは芝1600m・実際の走行はダート2400m」が再発します。
   */
  readonly conditions: {
    readonly surface: 'turf' | 'dirt';
    readonly distance: number;
    readonly trackCondition: 'good' | 'yielding' | 'soft' | 'bad';
    readonly courseId: string;
    /**
     * ★**モンテカルロに渡した走路の形そのもの**（★2026-09-15・`races.course_frozen`・指示書 VW-3）。
     *   ★確定・再計算はこれを読みます。★`courseId` から現在の値を引き直しません。
     */
    readonly courseFrozen: FrozenCourseRecord;
  };
  /**
   * ★**出走資格で絞った結果**（★CL-3・指示書 `DEV_INSTRUCTIONS_RACE_CLASS_20260918.md`）。
   *   ★`eligibility` を渡さなかった呼び方では `null`（★従来どおりの振る舞い）。
   *
   * ⚠️ ★**`widenedSteps > 0` は「資格を下の段へ広げた」ことを意味します**（★枯渇）。
   *    ★呼ぶ側が**記録し、警報を出す**こと（★黙って広げない・D-079 ⑦ と同じ形）。
   */
  readonly eligibility: {
    readonly raceClass: RaceClass;
    /** 資格のある馬の数（★広げた後） */
    readonly poolSize: number;
    /** ★下へ広げた段数（0 ＝ 広げていない） */
    readonly widenedSteps: number;
  } | null;
}

/**
 * @param seed 開催全体のマスターシード（サイクル番号ではない）
 * @param trials モンテカルロ試行数。テストでは小さくする
 */
export function buildRace(
  pool: readonly HorseRecord[],
  cycleIndex: number,
  seed: number,
  trials: number = ODDS_MC_TRIALS,
  /**
   * ★B-6（D-050）: 出走馬の調子・疲労（§7.4）。渡さなければ従来どおりの仮定値。
   *   ★**確定処理（pg-store.ts の settleRace）と同じ値を渡すこと。**
   *     片方だけ実データにすると、オッズを計算した馬と実際に走る馬が変わります。
   */
  trainingStates?: ReadonlyMap<string, { condition: number; fatigue: number }>,
  /**
   * ★番組表が決めた条件（§10.3・`conditionsOf` の出力）。
   *   渡すと距離と馬場をそれに合わせ、**使った条件を返り値に載せます**。
   */
  programme?: { readonly surface: 'turf' | 'dirt'; readonly distance: number; readonly courseId: string },
  /**
   * ★**出走資格**（★CL-3・指示書 `DEV_INSTRUCTIONS_RACE_CLASS_20260918.md`）。
   *
   * ★渡すと、★**出走表を作る前にプールを資格で絞ります**（★戦績クラスがちょうど一致する馬だけ）。
   *   ★渡さなければ**従来どおり**（★P1 のゲートを測る経路を 1 ビットも動かさないため）。
   *
   * ⚠️ ★**選抜（`sortPoolByClass` の並べ替えと `classBand` の窓）には触りません** —
   *    ★ここは**その手前に資格の層を足すだけ**です（★D-018・V-4 を守る）。
   */
  eligibility?: { readonly raceClass: RaceClass; readonly winsOf: (h: HorseRecord) => number },
): BuiltRace {
  /**
   * ★**走路の形はここで 1 回だけ作ります**（★2026-09-15・指示書 VW §5-2）。
   *   ① このオブジェクトから条件を作ってモンテカルロに渡し、
   *   ② **同じオブジェクト**を返り値に載せて `createRace` が保存します（★作り直さない・R-30）。
   */
  const programmeFrozen = programme === undefined ? undefined : frozenCourseOf(programme.courseId);
  /**
   * ★**資格の層**（CL-3）。★**選抜の手前**に置きます:
   *   ★プール全体 → ★**資格で絞る（ここ）** → 素質順に並べる → `classBand` の窓 → 出走馬
   *
   * ⚠️ ★足りなければ `selectEligible` が**下の段へ 1 段ずつ広げ、その幅を返します**。
   *    ★**黙って広げません** — ★返り値に載せるので、呼ぶ側が記録して警報を出します。
   */
  const selection =
    eligibility === undefined
      ? null
      : selectEligible(eligibility.raceClass, pool, eligibility.winsOf, FIELD_SIZE.MIN);
  const eligiblePool = selection === null ? pool : selection.pool;
  const sorted = sortPoolByClass(eligiblePool);
  const race = generateRace(
    sorted, cycleIndex, deriveRng(seed, STREAM.FIELD, cycleIndex),
    undefined, undefined, undefined,
    {
      /**
       * ★能力は **`horses.stats`（週送りが育てた現在値）**を使います
       *   （Q-P3-29 の廃止裁定・Q-P3-35 で投入）。
       *
       * 【何が変わったか】
       *   これまで `toEntrant` が `potential × PLACEHOLDER_UNLOCK`（0.55〜0.85 の再抽選）で
       *   能力を作っていました。**育成ループが無かった時代の仮定**です。
       *   確定側（`pg-store.settleRace`）は `horses.stats` を使っていたので、
       *   **オッズを計算した馬と実際に走る馬の能力が違いました**（実測 2.28倍）。
       *
       * 【前提】
       *   ★`horses.stats` が**訓練後の値**であること。週送りが回っていないと誕生時の値
       *     （potential × 0.28〜0.35）になり、想定より大幅に弱い馬でオッズが付きます。
       *     → 週送りはワーカーに繋がっており、staging では開放率 71.3% を実測しています。
       *   ★`unlock_daily` が毎日分布を記録します。ここがずれたら P1 のゲートを測り直します。
       */
      abilityOf: (h: HorseRecord) => h.stats,
      ...(trainingStates === undefined ? {} : { trainingStateOf: (h: HorseRecord) => trainingStates.get(h.id) }),
      ...(programme === undefined || programmeFrozen === undefined
        ? {}
        : { programme: { surface: programme.surface, distance: programme.distance, courseShape: programmeFrozen.courseShape } }),
    },
  );
  /**
   * ★番組表を渡さない呼び方（`tools/verify-build.mjs` など・本番のワーカーは使いません）は、
   *   ★**これまでと同じ模型**（`DEFAULT_OVAL` ＝ スターパークと同じ値・直線は `generateRace` の抽選）を
   *   ★**凍結して保存**します。★オッズと確定が同じ形を読むことは、こちらの経路でも崩しません。
   */
  const courseFrozen: FrozenCourseRecord = programmeFrozen
    ?? { ...frozenCourseOf('star-park'), courseShape: race.conditions.courseShape };
  const oddsConditions = conditionsFromFrozen(courseFrozen, race.conditions);

  // 馬番を 1..n に振る（馬券は馬番で買う）
  const numbered: RaceEntrant[] = race.entrants.map((e, i) => ({ ...e, horseId: `H${i + 1}` }));
  const depth = placeDepth(numbered.length);

  // --- §9.2 モンテカルロ（★本番確定とは別系列） ---
  const counts = new Map<TicketKind, Map<string, number>>(
    TICKET_KINDS.map((k) => [k, new Map<string, number>()]),
  );
  const rng: Rng = deriveRng(seed, STREAM.ODDS, cycleIndex);
  /**
   * ★**距離ロスの下ごしらえは試行の前に 1 回だけ**（★ES 便 ES-6・2026-09-16）。
   *   ★全試行が同じ `oddsConditions` なので、★試行ごとに作り直していた分（1 回 4〜7µs × 試行数）を省きます。
   *   ★`resolveRace` は条件と一致するかを確かめてから使います（★結果は作り直す場合と 1 ビットも同じ）。
   */
  const lanePlan = lanePlanForRace(oddsConditions);
  for (let t = 0; t < trials; t += 1) {
    const sim = resolveRace({
      // ★凍結した走路の形から作った条件（★確定も同じ関数で作る・pg-store.ts）
      conditions: oddsConditions,
      entrants: numbered,
      seed: rng.nextUint32(),
      balance: DEFAULT_RACE_BALANCE,
      lanePlan,
    });
    const order = sim.order.map((r) => Number(r.horseId.replace(/^H/, '')));
    for (const kind of TICKET_KINDS) {
      const m = counts.get(kind)!;
      for (const key of winningKeys(kind, order, depth)) m.set(key, (m.get(key) ?? 0) + 1);
    }
  }

  // 人気順（§9.2: モンテカルロ勝率順位）
  const winCounts = counts.get('win')!;
  const ranked = [...winCounts.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => Number(k));

  const entrants: RaceEntrantSpec[] = race.entrants.map((e, i) => ({
    // ★DB の horse_id は元の馬の UUID。馬番は gate で表す
    horseId: e.horseId,
    gate: i + 1,
    weightKg: e.weightKg,
    strategy: e.strategy,
    popularity: ranked.indexOf(i + 1) >= 0 ? ranked.indexOf(i + 1) + 1 : undefined,
    /**
     * ★**モンテカルロに渡した出走馬そのもの**を凍結して返す（0016）。
     *
     * 【なぜ要るか】
     *   確定側はこれまで `horses` を**もう一度読んで**いました。
     *   2回読む以上、その間に馬の状態が動けば食い違います。
     *   ★調子・疲労だけの問題ではありません。**能力（`stats`）も週送りで動きます。**
     *     生成は2周先なので、間に週が進めば能力そのものがずれます。
     *   → **オッズを計算した入力を保存し、確定はそれを使う**（読むのは1回だけ）。
     *
     * ★`numbered[i]` は `resolveRace` に実際に渡した値です。
     *   ここで組み直すと「保存したものと計算に使ったものが違う」が起きるので、
     *   **必ず MC に渡した配列から取ること。**
     *   `horseId` だけは馬番に振り替えてあるので、元の UUID に戻します。
     */
    snapshot: { ...numbered[i]!, horseId: e.horseId },
  }));

  return {
    entrants,
    odds: buildOddsRows(counts, trials) as OddsSpec[],
    // ★オッズを計算したときの条件をそのまま返す（Q-P3-32）
    conditions: {
      surface: race.conditions.surface,
      distance: race.conditions.distance,
      trackCondition: race.conditions.trackCondition,
      courseId: courseFrozen.venueId,
      // ★モンテカルロに渡したものと**同じ参照**（★作り直さない）
      courseFrozen,
    },
    // ★資格で絞った結果（★呼ぶ側が記録・警報に使う。★渡されなければ null）
    eligibility:
      selection === null || eligibility === undefined
        ? null
        : { raceClass: eligibility.raceClass, poolSize: selection.pool.length, widenedSteps: selection.widenedSteps },
  };
}
