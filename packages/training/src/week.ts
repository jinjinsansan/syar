/**
 * 週送りの合成器（正典 §7.1〜§7.6）— **1頭の1週ぶんを進める唯一の経路**
 *
 * 【★なぜこれを作るか】
 *   G-1〜G-5 で部品（成長・調子・故障・イベント・引退）は揃いましたが、
 *   **それらを繋ぐ順序はどこにも書かれていませんでした。**
 *   結果として `verify-v7.ts` と `verify-v14.ts` が**それぞれ自前の週ループ**を持ち、
 *   さらに B-1 の通し試験で**3本目**を書こうとしていました。
 *
 *   ★3本あると、**較正したループと通したループが別物**になります。
 *     V-7 が 0.0013 を決めた根拠は「V-7 のループでの 29.9%」であって、
 *     B-1 が回すループでの値ではありません。**同じ関数を通らせて初めて同じ主張になります。**
 *
 * 【★実際に食い違っていた点（発見）】
 *   `verify-v7.ts` / `verify-v14.ts` の週ループは **§7.6 のイベントを一度も引いていません**。
 *   つまり V-7a（故障 29.9%）も V-14 も、**イベントが無い世界で測った数字**です。
 *   イベントは調子・気性・疲労・素質を動かすので、故障確率にも成長にも効きます。
 *
 *   → `enableEvents` に**既定値を置きません**。呼ぶ側が必ず書きます。
 *     既定値を置くと、この食い違いがまた**呼び出し側から見えなくなります**。
 *
 * 【★順序（この順でなければならない理由）】
 *   ```
 *   ① 育成可能か（§7.1: 78週まではここで終わり）
 *   ② 休養中ならメニューを rest に強制
 *   ③ 故障判定（§7.5）… 当たったらその週は成長しない
 *   ④ 成長（§7.3）
 *   ⑤ 疲労（§7.2 のメニュー疲労 − 自然回復 D-046）
 *   ⑥ 調子の再判定（§7.4）
 *   ⑦ イベント（§7.6）… ★⑥より後。前に置くと再判定が「調子+1」を上書きする
 *   ⑧ 引退判定（§7.1: 260週 / 致命的故障）
 *   ```
 *   ★③で故障したら④〜⑦を飛ばします。故障した週に調教の成果が出るのはおかしく、
 *     かつ `applyInjury` が potential を削った直後に `grow` を呼ぶと
 *     不変条件の検査（D-045）に引っかかります。
 *
 * 【★EP はここで引き落としません】
 *   消費額（`epSpent`）を**返すだけ**です。台帳への記帳はサーバー側の責務（憲法③）で、
 *   ここでやると純ロジックが DB に依存し、`sim-engine` と同じ土俵から外れます。
 */

import type { AbilityKey, GrowthType, Rng, Sex } from '@star/sim-engine';
import { ABILITY_KEYS } from '@star/sim-engine';
import { LIFECYCLE_WEEKS, canTrain, lifeStageAt, type LifeStage } from '@star/scheduler';
import { MENUS, type MenuId } from './menus.js';
import { epCost, fatigueDelta, grow } from './growth.js';
import { nextCondition, weeklyFatigue } from './condition.js';
import {
  applyInjury,
  injuryProbability,
  rollSeverity,
  type InjurySeverity,
  type PermanentLoss,
} from './injury.js';
import { applyEvent, rollEvent, type EventDef } from './events.js';
import {
  decideRetirement,
  shouldRetire,
  type RetirementDecision,
  type RetirementReason,
} from './retirement.js';

/**
 * 乱数の用途 ID。
 * ★`verify-v7.ts` / `verify-v14.ts` が使っていた 61〜63 を**そのまま引き継ぎます**
 *   （変えると較正済みの数字が再現しなくなります）。イベントは 64 を新規に取ります。
 */
export const TRAIN_STREAM = { GROWTH: 61, CONDITION: 62, INJURY: 63, EVENT: 64 } as const;

/** 一生変わらない性質（週ごとに渡し直さないもの） */
export interface HorseTraits {
  readonly sex: Sex;
  readonly growth: GrowthType;
  /** インブリード由来の故障率倍率（§6.5） */
  readonly injuryRateMult: number;
}

/**
 * 週をまたいで持ち越す状態。**DB の1行と1対1**に対応させます。
 * ★ここに無いものは持ち越されません（＝DB に列が要らない）。
 */
export interface TrainingState {
  /** 週齢（0 = 誕生） */
  readonly ageWeeks: number;
  readonly potential: Readonly<Record<AbilityKey, number>>;
  readonly current: Readonly<Record<AbilityKey, number>>;
  readonly durability: number;
  readonly temper: number;
  readonly fatigue: number;
  readonly condition: number;
  /** この週齢に達するまで休養（§7.5）。休養していないなら -1 */
  readonly restUntilWeek: number;
  /** 致命的故障を負ったか（§7.5） */
  readonly careerEnded: boolean;
  /** 引退済みなら、その決定（§7.1） */
  readonly retirement: RetirementDecision | null;
}

/** その週に何が起きたかの記録。★B-1 はこれを週ごとに残します */
export interface WeekLog {
  /** 進める**前**の週齢（この記録が指す週） */
  readonly week: number;
  readonly stage: LifeStage;
  /** 実際に行ったメニュー（休養強制・イベントによる差し替えを反映した後） */
  readonly menu: MenuId;
  /** ★消費した EP。記帳は呼ぶ側（G-6） */
  readonly epSpent: number;
  readonly resting: boolean;
  /** その週の故障確率（0 なら判定していない） */
  readonly injuryProb: number;
  readonly injury: {
    readonly severity: InjurySeverity;
    readonly restWeeks: number | null;
    readonly careerEnding: boolean;
    readonly permanentLoss: PermanentLoss;
  } | null;
  readonly event: {
    readonly id: string;
    readonly text: string;
    readonly choiceId: string | null;
    readonly awakenedKey: AbilityKey | null;
    readonly forceRest: boolean;
  } | null;
  /** 能力の増減（成長＋イベント）。★0 の形質も含める（「動かなかった」も記録） */
  readonly gain: Record<AbilityKey, number>;
  readonly fatigue: number;
  readonly condition: number;
  /** この週に引退したなら、その決定 */
  readonly retired: RetirementDecision | null;
}

export interface AdvanceWeekInput {
  readonly state: TrainingState;
  readonly traits: HorseTraits;
  /** その週に選んだメニュー。休養中・育成不可なら無視されます */
  readonly menu: MenuId;
  /**
   * ★イベント（§7.6）を引くか。**既定値はありません。**
   *   V-7 / V-14 の較正は `false` で測った数字です。
   */
  readonly enableEvents: boolean;
  /** 用途 ID から乱数を作る。★時刻・グローバル乱数を使わない（憲法④） */
  readonly rngFor: (stream: number) => Rng;
  /** イベントの選択肢をプレイヤーが選ぶ場合。無ければ既定の選択肢 */
  readonly chooseEvent?: (def: EventDef) => string | undefined;
  /** 功労馬として引退させるか（§7.1・条件は照会中 Q-P3-18/19） */
  readonly preferHonored?: boolean;
}

export interface AdvanceWeekResult {
  readonly state: TrainingState;
  readonly log: WeekLog;
}

/** 誕生直後の状態を作る（★週齢 0） */
export function initialState(input: {
  readonly potential: Readonly<Record<AbilityKey, number>>;
  readonly current: Readonly<Record<AbilityKey, number>>;
  readonly durability: number;
  readonly temper: number;
}): TrainingState {
  return {
    ageWeeks: 0,
    potential: input.potential,
    current: input.current,
    durability: input.durability,
    temper: input.temper,
    fatigue: 0,
    // ★§7.4 の中央値。0 にすると生まれた瞬間が絶不調になります
    condition: 3,
    restUntilWeek: -1,
    careerEnded: false,
    retirement: null,
  };
}

const zeroGain = (): Record<AbilityKey, number> =>
  Object.fromEntries(ABILITY_KEYS.map((k) => [k, 0])) as Record<AbilityKey, number>;

/**
 * 1頭の1週を進める。
 *
 * ★**引退した馬は進めません**（黙って進めると、引退後も年を取り続けます）。
 */
export function advanceWeek(input: AdvanceWeekInput): AdvanceWeekResult {
  const { state, traits, enableEvents, rngFor } = input;
  if (state.retirement !== null) {
    throw new Error(`advanceWeek: 引退済みの馬は進められません（週齢 ${state.ageWeeks}）`);
  }

  const week = state.ageWeeks;
  const stage = lifeStageAt(week);
  const before = { ...state.current } as Record<AbilityKey, number>;

  let potential = { ...state.potential } as Record<AbilityKey, number>;
  let current = { ...state.current } as Record<AbilityKey, number>;
  let { durability, temper, fatigue, condition, restUntilWeek, careerEnded } = state;

  let menu: MenuId = input.menu;
  let epSpent = 0;
  let injuryProb = 0;
  let injuryLog: WeekLog['injury'] = null;
  let eventLog: WeekLog['event'] = null;
  const resting = week < restUntilWeek;

  // ── ① 育成可能か（§7.1）────────────────────────────────
  //    ★78週までは放牧場で自動経過。EP も故障も成長もありません。
  if (!canTrain(week)) {
    menu = 'rest';
  } else {
    // ── ② 休養中ならメニューを強制（§7.5）──────────────────
    if (resting) menu = 'rest';
    epSpent = epCost(menu);

    // ── ③ 故障判定（§7.5）────────────────────────────────
    injuryProb = injuryProbability({
      menu,
      fatigue,
      durability,
      injuryRateMult: traits.injuryRateMult,
      ageWeeks: week,
    });
    const injRng = rngFor(TRAIN_STREAM.INJURY);
    if (injRng.bool(injuryProb)) {
      const severity = rollSeverity(injRng);
      const r = applyInjury({ potential, current, durability }, severity, injRng);
      potential = r.potential;
      current = r.current;
      durability = r.durability;
      careerEnded = r.careerEnding;
      // ★致命的なら休養に入れない（引退するので、休養明けが来ない）
      if (!r.careerEnding && r.restWeeks !== null) restUntilWeek = week + r.restWeeks;
      injuryLog = {
        severity,
        restWeeks: r.restWeeks,
        careerEnding: r.careerEnding,
        permanentLoss: r.permanentLoss,
      };
    } else {
      // ── ④ 成長（§7.3）──────────────────────────────────
      current = grow(
        {
          menu,
          ageWeeks: week,
          growth: traits.growth,
          temper,
          condition,
          current,
          potential,
        },
        rngFor(TRAIN_STREAM.GROWTH),
      );
      // ── ⑤ 疲労（§7.2 + D-046）───────────────────────────
      fatigue = weeklyFatigue(fatigue, fatigueDelta(menu));
      // ── ⑥ 調子の再判定（§7.4）──────────────────────────
      condition = nextCondition(fatigue, rngFor(TRAIN_STREAM.CONDITION));
      // ── ⑦ イベント（§7.6）★⑥より後 ───────────────────
      if (enableEvents) {
        const evRng = rngFor(TRAIN_STREAM.EVENT);
        const rolled = rollEvent(evRng, input.chooseEvent);
        if (rolled !== null) {
          const out = applyEvent(
            { condition, temper, fatigue, current, potential },
            rolled.effect,
            evRng,
          );
          condition = out.condition;
          temper = out.temper;
          fatigue = out.fatigue;
          current = out.current;
          potential = out.potential;
          if (out.forceRest) {
            // ★メニューを休養に「差し替えた」ことにする。EP は既に払っているので戻しません
            //   （正典に返金の規定が無いため。照会 Q-P3-12〜16）
            menu = 'rest';
          }
          eventLog = {
            id: rolled.def.id,
            text: rolled.def.text,
            choiceId: rolled.choice?.id ?? null,
            awakenedKey: out.awakenedKey,
            forceRest: out.forceRest,
          };
        }
      }
      // ★メニューによる気性の変化（§7.2 の temperDelta）
      temper = Math.max(0, Math.min(100, temper + MENUS[menu].temperDelta));
    }
  }

  // ── ⑧ 引退判定（§7.1・§7.5）──────────────────────────
  const nextAge = week + 1;
  const reason: RetirementReason | null = shouldRetire(nextAge, careerEnded);
  let retirement: RetirementDecision | null = null;
  if (reason !== null) {
    retirement = decideRetirement(
      // ★`decideRetirement` は sex しか見ません。HorseRecord 全体を要求されるので最小で渡す
      { sex: traits.sex } as Parameters<typeof decideRetirement>[0],
      reason,
      input.preferHonored ?? false,
    );
  }

  const gain = zeroGain();
  for (const k of ABILITY_KEYS) gain[k] = current[k] - before[k];

  return {
    state: {
      ageWeeks: nextAge,
      potential,
      current,
      durability,
      temper,
      fatigue,
      condition,
      restUntilWeek,
      careerEnded,
      retirement,
    },
    log: {
      week,
      stage,
      menu,
      epSpent,
      resting,
      injuryProb,
      injury: injuryLog,
      event: eventLog,
      gain,
      fatigue,
      condition,
      retired: retirement,
    },
  };
}

/** 引退までの上限週数。★無限ループ防止（260週 + 余裕） */
export const MAX_LIFE_WEEKS = LIFECYCLE_WEEKS.retireAt + 1;
