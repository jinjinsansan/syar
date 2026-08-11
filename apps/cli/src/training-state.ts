/**
 * ★B-6（D-050）: 出走馬の「いまの調子・疲労」を、**実際の週ループから**作る
 *
 * 【なぜ要るか】
 *   `race-field.ts` は出走馬の `fatigue` を**全馬 0** で作っていました。
 *   `fatigue` は `fatigueCoef` と `initialStamina` の両方に入るので、
 *   **疲労という分散源が丸ごと欠けた世界**で P1 のゲート（V-4/V-5/V-6/V-8/V-13）が
 *   較正されていたことになります。
 *
 * 【★仮定値を別の仮定値に置き換えない】
 *   ここで「疲労は 0〜60 の一様分布」などと**新しい分布を発明**すると、
 *   配線したつもりで**別の仮定値に差し替えただけ**になります。
 *   → **`advanceWeek`（較正済みの週ループ）を実際に回して**、
 *     その馬が現役期間に取った (調子, 疲労) をそのまま使います。
 *
 * 【★測定条件（R-14: 判定を作るので固定する）】
 *   - 方針は **バランス型**。V-7 / V-14 / V-15 の錨と同一です
 *   - 標本は **デビュー(104週)〜引退(260週)** の週。調教期間(78〜104)は出走しません
 *   - **イベント有り**（B-1 が通す経路と同じ）
 *   - レースごとに標本を1つずつ進めます。★1頭に1つ固定すると、
 *     同じ馬がどのレースでも同じ調子になり、**現実より分散が小さくなります**
 *
 * 【★致命的故障で引退した馬】
 *   標本が短くなるだけで、除外はしません（現実にも早期引退はあります）。
 *   ★標本が空になった馬は `undefined` を返し、呼ぶ側が従来の仮定値に落ちます。
 *     この頭数を `stats()` で出します（黙って仮定値に落ちるのを防ぐため）。
 */

import { deriveRng, type HorseRecord, type Rng } from '@star/sim-engine';
import {
  DEFAULT_MENU, advanceWeek, initialState,
  type HorseTraits, type MenuId, type TrainingState,
} from '@star/training';
import { LIFECYCLE_WEEKS } from '@star/scheduler';

/** ★B-6 の測定条件。判定を作るので固定する（R-14） */
export const B6_SAMPLING = {
  /** 標本を採る方針。V-7 / V-14 / V-15 と同一 */
  policy: 'balanced' as const,
  /** 標本を採り始める週齢（デビュー） */
  fromWeek: LIFECYCLE_WEEKS.raceableFrom,
  /** イベント（§7.6）を引くか。B-1 が通す経路と同じ */
  events: true,
  /** 乱数の用途 ID。★他と重ならない 70 番台 */
  stream: 70,
} as const;

/** ★V-7 / V-14 / V-15 / B-1 と**同一**のバランス型方針 */
function chooseMenu(week: number, fatigue: number): MenuId {
  if (fatigue >= 70) return 'rest';
  const cycle = week % 4;
  if (cycle === 0) return 'hard';
  if (cycle === 1) return 'hill';
  if (cycle === 2) return 'wood';
  return DEFAULT_MENU;
}

export interface ConditionFatigue {
  readonly condition: number;
  readonly fatigue: number;
}

export interface TrainingStateSampler {
  /** その馬の、いまのレースにおける調子・疲労。標本が無ければ undefined */
  readonly stateOf: (horse: HorseRecord) => ConditionFatigue | undefined;
  /** 次のレースへ進める（★レースごとに1つずつ標本を進める） */
  readonly advance: () => void;
  /** 実測の要約。★黙って仮定値に落ちていないことの確認に使う */
  readonly stats: () => {
    /** ★同じ時点にいる馬どうしの散らばり。0 に近いとレース内の分散源にならない */
    readonly withinRaceSdFatigue: number;
    readonly withinRaceSdCondition: number;
    readonly horses: number;
    readonly withSamples: number;
    readonly meanSamples: number;
    readonly meanFatigue: number;
    readonly meanCondition: number;
    readonly sdFatigue: number;
    readonly sdCondition: number;
  };
}

/**
 * 母集団の各馬について、現役期間の (調子, 疲労) を実際に回して集める。
 *
 * @param seed 乱数の種。★レースの seed と同じものを渡すこと（再現性のため）
 */
export function buildTrainingStateSampler(
  pool: readonly HorseRecord[],
  seed: number,
  /**
   * ★true にすると全馬の位相を揃えます（＝最初に外した版）。
   *   **比較のためだけ**にあります。既定は false。
   */
  SYNCHRONIZED = false,
): TrainingStateSampler {
  const samples = new Map<string, ConditionFatigue[]>();
  /**
   * ★馬ごとの位相のずれ。
   *
   * 【なぜ要るか — これを入れずに一度測って外しました】
   *   最初、標本の位置を**全馬で共有する1つのカーソル**で進めていました。
   *   バランス型の方針はメニューが `week % 4` の周期で、疲労も同じ周期で上下します。
   *   → **全馬が同じ位相に並び、レース内の調子・疲労の差がほぼ消えました。**
   *
   *   結果として V-4（1番人気の勝率）が 31.29% → 34.02% に**上がりました**。
   *   ★分散源を足したのに1番人気が強くなるのは不自然で、そこで気づきました。
   *     「疲労を入れたら V-4 が上がった」と報告するところでした。
   *
   *   現実には、馬は生まれた週も デビューの週も違うので位相はばらばらです。
   *   → 馬ごとに決まったずれを与えます（乱数ではなく添字から決めるので再現します）。
   */
  const phase = new Map<string, number>();

  pool.forEach((horse, idx) => {
    // ★素数を掛けて散らす。添字そのものだと隣接する馬が近い位相になる
    phase.set(horse.id, (idx * 37) % 149);
    const traits: HorseTraits = {
      sex: horse.sex, growth: horse.growth,
      injuryRateMult: horse.injuryRateMult, birthTemper: horse.temper,
    };
    let state: TrainingState = {
      ...initialState({
        potential: horse.potential, current: horse.stats,
        durability: horse.durability, temper: horse.temper,
      }),
      ageWeeks: LIFECYCLE_WEEKS.trainableFrom,
    };
    const list: ConditionFatigue[] = [];
    while (state.retirement === null) {
      const week = state.ageWeeks;
      // ★出走しうる週だけを標本にする（調教期間の値は出走に使われない）
      if (week >= B6_SAMPLING.fromWeek) {
        list.push({ condition: state.condition, fatigue: state.fatigue });
      }
      const r = advanceWeek({
        state, traits, menu: chooseMenu(week, state.fatigue),
        enableEvents: B6_SAMPLING.events,
        rngFor: (stream: number): Rng => deriveRng(seed, stream, idx * 1000 + week),
      });
      state = r.state;
    }
    samples.set(horse.id, list);
  });

  let cursor = 0;
  return {
    stateOf: (horse) => {
      const list = samples.get(horse.id);
      if (list === undefined || list.length === 0) return undefined;
      // ★馬ごとの位相を足す。共有カーソルだけだと全馬が同じ調教サイクルに並ぶ
      const off = SYNCHRONIZED ? 0 : (phase.get(horse.id) ?? 0);
      return list[(cursor + off) % list.length];
    },
    advance: () => { cursor += 1; },
    stats: () => {
      const lists = [...samples.values()];
      const withSamples = lists.filter((l) => l.length > 0).length;
      const all = lists.flat();
      const mean = (a: number[]): number =>
        a.length === 0 ? 0 : a.reduce((x, y) => x + y, 0) / a.length;
      const sd = (a: number[]): number => {
        if (a.length < 2) return 0;
        const m = mean(a);
        return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / (a.length - 1));
      };
      // ★同じ標本位置にいる馬どうしの散らばり（＝レース内の分散源）
      const atCursor = lists
        .filter((l) => l.length > 0)
        .map((l, i) => l[((SYNCHRONIZED ? 0 : (i * 37) % 149)) % l.length]!);
      return {
        withinRaceSdFatigue: sd(atCursor.map((x) => x.fatigue)),
        withinRaceSdCondition: sd(atCursor.map((x) => x.condition)),
        horses: lists.length,
        withSamples,
        meanSamples: mean(lists.map((l) => l.length)),
        meanFatigue: mean(all.map((x) => x.fatigue)),
        meanCondition: mean(all.map((x) => x.condition)),
        sdFatigue: sd(all.map((x) => x.fatigue)),
        sdCondition: sd(all.map((x) => x.condition)),
      };
    },
  };
}
