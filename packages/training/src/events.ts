/**
 * 育成イベント（正典 §7.6）
 *
 * ```
 * 週進行時に低確率で発生するテキストイベント（選択肢付き）。
 *
 * - 「厩務員が言うには、調子が上向いてきたようだ」→ 調子+1
 * - 「気性が荒くなっている」→ 放牧 or 強行の選択（強行は IQ+ だが気性+10）
 * - 「素質が開花した！」（1%）→ potential のうち1形質 +5%
 * ```
 *
 * 【★選択肢の効果は data-driven（指示書 G-5・コーディング標準）】
 *   イベントを増やすのに**コードを書かせない**。表に1行足せば増えます。
 *
 * 【★正典に無いもの（照会します）】
 *   - **発生確率**: 数値があるのは「素質が開花した！」の **1%** だけ。他は「低確率」のみ
 *   - **強行の IQ+ の量**（気性+10 は明記）
 *   - **放牧を選んだときの効果**（休養と同じ扱いか）
 *   - **素質開花がどの形質か**（5能力から1つ？ 非能力形質も含む？）
 *   - **選択肢を選ばなかった場合**（NPC・放置プレイ）の既定
 *
 * 【★調子+1 と §7.4 の順序（実装上の要点）】
 *   §7.4 は**毎週 condition を再判定**します。イベントの「調子+1」を
 *   **再判定より前に**適用すると、**再判定が上書きして効果が消えます**。
 *   → `applyEvents` は**再判定の後**に呼ぶ前提で作り、テストで固定します。
 *     繋ぐ順序を間違えると「イベントが出たのに何も起きない」が静かに成立します。
 */

import type { AbilityKey, Rng } from '@star/sim-engine';
import { ABILITY_KEYS } from '@star/sim-engine';

import { applyTemperDelta } from './temper.js';
/** イベントの効果。★すべて「差分」で持つ（絶対値にすると適用順で結果が変わる） */
export interface EventEffect {
  /** 調子の増減（§7.4 の 0..5 に収める） */
  readonly condition?: number;
  /** 気性の増減（0..100・高いほど気性難） */
  readonly temper?: number;
  /** 疲労の増減 */
  readonly fatigue?: number;
  /** 特定能力の現在値への倍率（1.05 なら +5%） */
  readonly currentMult?: Partial<Record<AbilityKey, number>>;
  /** ★素質のうち**無作為に1形質**への倍率（§7.6「potential のうち1形質 +5%」） */
  readonly potentialMultOneRandom?: number;
  /** ★このイベントは休養と同じ扱いにする（メニューを上書きする） */
  readonly forceRest?: boolean;
}

export interface EventChoice {
  readonly id: string;
  readonly label: string;
  readonly effect: EventEffect;
}

export interface EventDef {
  readonly id: string;
  readonly text: string;
  /** 1週あたりの発生確率 */
  readonly probability: number;
  /** 選択肢。空なら選択なし（効果が自動適用される） */
  readonly choices: readonly EventChoice[];
  /** 選択肢が無い場合の効果 */
  readonly effect?: EventEffect;
  /** ★選択されなかったとき（NPC・放置）の既定の選択肢 id */
  readonly defaultChoice?: string;
}

/**
 * ★「低確率」の既定値（較正定数・**正典に規定なし**）。
 *   §7.6 が数値を与えているのは「素質が開花した！」の 1% だけです。
 *   ここを上げるとイベントが日常になり、テキストの特別感が消えます。
 * ⚠️ **1行で書くこと**（変異試験は行単位で宣言を置換するため）
 */
// prettier-ignore
export const COMMON_EVENT_PROB = 0.02;

/**
 * ★「強行」で得る IQ の倍率（較正定数・**正典に規定なし**）。
 *   §7.6 は「強行は IQ+ だが気性+10」とだけ書いています。
 * ⚠️ **1行で書くこと**
 */
// prettier-ignore
export const PUSH_THROUGH_IQ_MULT = 1.03;

/** 正典 §7.6「素質が開花した！」の発生確率 1%。★正典の写し */
export const AWAKENING_PROB = 0.01;

/** 正典 §7.6「potential のうち1形質 +5%」。★正典の写し */
export const AWAKENING_MULT = 1.05;

/** 正典 §7.6「気性+10」。★正典の写し */
export const PUSH_THROUGH_TEMPER = 10;

/**
 * ★イベント表（data-driven）。**増やすときはここに1行足すだけ**。
 *   テキストは正典 §7.6 の文言をそのまま使います。
 */
export const EVENTS: readonly EventDef[] = [
  {
    id: 'condition_up',
    text: '厩務員が言うには、調子が上向いてきたようだ',
    probability: COMMON_EVENT_PROB,
    choices: [],
    effect: { condition: 1 },
  },
  {
    id: 'temper_rough',
    text: '気性が荒くなっている',
    probability: COMMON_EVENT_PROB,
    choices: [
      {
        id: 'turnout',
        label: '放牧する',
        // ★正典は効果を書いていない。「放牧」なので休養と同じ扱いにした（照会）
        effect: { forceRest: true },
      },
      {
        id: 'push_through',
        label: '強行する',
        // ★正典: 「強行は IQ+ だが気性+10」。IQ+ の量は書かれていない（照会）
        effect: { currentMult: { iq: PUSH_THROUGH_IQ_MULT }, temper: PUSH_THROUGH_TEMPER },
      },
    ],
    // ★選ばれなかったとき（NPC・放置）は放牧。★「強行」を既定にすると、
    //   放置しているだけで気性が悪化し続けます
    defaultChoice: 'turnout',
  },
  {
    id: 'awakening',
    text: '素質が開花した！',
    probability: AWAKENING_PROB,
    choices: [],
    effect: { potentialMultOneRandom: AWAKENING_MULT },
  },
];

/** 発生したイベントと、適用される選択肢 */
export interface RolledEvent {
  readonly def: EventDef;
  readonly choice: EventChoice | null;
  readonly effect: EventEffect;
}

/**
 * その週にイベントが起きるかを引く。
 *
 * ★**表の順に1回ずつ判定し、最初に当たったものだけを返します。**
 *   全部判定して複数当てると、1週に3つ起きる週が出ます。
 * ★`chooseFn` が無ければ `defaultChoice` を使います（NPC・放置プレイ）。
 */
export function rollEvent(
  rng: Rng,
  chooseFn?: (def: EventDef) => string | undefined,
): RolledEvent | null {
  for (const def of EVENTS) {
    if (!rng.bool(def.probability)) continue;
    if (def.choices.length === 0) {
      return { def, choice: null, effect: def.effect ?? {} };
    }
    const wanted = chooseFn?.(def) ?? def.defaultChoice;
    const choice = def.choices.find((c) => c.id === wanted) ?? def.choices[0]!;
    return { def, choice, effect: choice.effect };
  }
  return null;
}

export interface EventTarget {
  readonly condition: number;
  readonly temper: number;
  /** ★誕生時の気性。下限の算出に要る（D-049）。現在値からは決められない */
  readonly birthTemper: number;
  readonly fatigue: number;
  readonly current: Readonly<Record<AbilityKey, number>>;
  readonly potential: Readonly<Record<AbilityKey, number>>;
}

export interface EventOutcome {
  readonly condition: number;
  readonly temper: number;
  readonly fatigue: number;
  readonly current: Record<AbilityKey, number>;
  readonly potential: Record<AbilityKey, number>;
  /** ★休養扱いにするか（呼ぶ側がメニューを差し替える） */
  readonly forceRest: boolean;
  /** ★開花した形質（プレイヤーに見せるため） */
  readonly awakenedKey: AbilityKey | null;
}

/**
 * イベントの効果を適用する。
 *
 * ★**§7.4 の調子の再判定より「後」に呼びます。** 前に呼ぶと
 *   再判定が上書きして「調子+1」が消えます（テストで固定）。
 * ★`current ≤ potential` はここでも守ります（開花は potential を上げるので安全側ですが、
 *   `currentMult` は current を上げるため、上限で止める必要があります）。
 */
export function applyEvent(target: EventTarget, effect: EventEffect, rng: Rng): EventOutcome {
  const current = { ...target.current } as Record<AbilityKey, number>;
  const potential = { ...target.potential } as Record<AbilityKey, number>;
  let awakenedKey: AbilityKey | null = null;

  if (effect.potentialMultOneRandom !== undefined) {
    awakenedKey = rng.pick(ABILITY_KEYS);
    potential[awakenedKey] *= effect.potentialMultOneRandom;
  }
  if (effect.currentMult !== undefined) {
    for (const k of ABILITY_KEYS) {
      const m = effect.currentMult[k];
      if (m === undefined) continue;
      // ★不変条件: current は potential を超えない（§7.3・B-4）
      current[k] = Math.min(potential[k], current[k] * m);
    }
  }

  const condition = Math.max(0, Math.min(5, target.condition + (effect.condition ?? 0)));
  // ★気性の変化も下限を通す（D-049）。ここを素の加算のままにすると、
  //   §7.6 の「強行 +10」だけが下限の外側で動き、週送りとイベントで規則が食い違います。
  const temper = applyTemperDelta(target.temper, effect.temper ?? 0, target.birthTemper);
  const fatigue = Math.max(0, Math.min(100, target.fatigue + (effect.fatigue ?? 0)));

  return {
    condition, temper, fatigue, current, potential,
    forceRest: effect.forceRest === true,
    awakenedKey,
  };
}
