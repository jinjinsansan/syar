/**
 * レース中リアルタイム介入のスコアモデル（正典 §8b）
 *
 * **UI は作らない**（P4）。ここで実装するのは `interventionMult` を決めるモデルと AI 代行だけ。
 *
 * 設計上の絶対条件（正典 §1.5-1 / §8b.3 / §13.1）:
 *   - **ハードキャップ ±10%**。育成が主・操作が従を壊さない
 *   - AI 代行（無操作・切断）の期待値が手動の 93〜97%。「操作しないと大損」にしない
 *
 * ```ts
 * interventionMult = clamp(
 *     1 + startBonus      // -0.04〜+0.03
 *       + spurtBonus      // -0.08〜+0.09
 *       + driveBonus,     // 0〜+0.10 * (GT/1000)
 *     0.90, 1.10 )
 * // 早仕掛けペナルティ: 残り900m超で仕掛けたらスタミナ消費1.6倍、
 * // ゴール前にゲージ0なら interventionMult -0.15(クランプ前に適用)
 * ```
 */

import type { Rng } from '@star/sim-engine';

// ---------------------------------------------------------------------------
// 定数（正典 §8b・§13.1）
// ---------------------------------------------------------------------------

export interface InterventionBalance {
  /** ハードキャップ幅（正典 §13.1 INTERVENTION_CAP = 0.10） */
  INTERVENTION_CAP: number;
  /** AI 代行の期待値目標（手動比・正典 §13.1 AI_PROXY_TARGET = 0.95） */
  AI_PROXY_TARGET: number;

  /** スタートボーナスの範囲（正典 §8b.3: -0.04〜+0.03） */
  START_BONUS_MIN: number;
  START_BONUS_MAX: number;
  /** 仕掛けボーナスの範囲（正典 §8b.3: -0.08〜+0.09） */
  SPURT_BONUS_MIN: number;
  SPURT_BONUS_MAX: number;
  /** 直線の追いボーナス上限（正典 §8b.3: 最大 +0.10 × GT/1000） */
  DRIVE_BONUS_MAX: number;

  /** スタミナゲージ初期値の式（正典 §8b.2） */
  STAMINA_BASE: number;
  STAMINA_ST_DIV: number;
  STAMINA_CONDITION_CENTER: number;
  STAMINA_CONDITION_MULT: number;
  STAMINA_FATIGUE_THRESHOLD: number;
  STAMINA_FATIGUE_DIV: number;
  STAMINA_MIN: number;
  STAMINA_MAX: number;

  /** 毎秒消費とポジション係数（正典 §8b.2） */
  STAMINA_DRAIN_PER_SEC: number;
  STAMINA_POSITION_MULT: { front: number; middle: number; back: number };
  /** 仕掛け中の消費倍率（正典 §13.1 STAMINA_SPURT_DRAIN = 3.0） */
  STAMINA_SPURT_DRAIN: number;
  /** 早仕掛けの残距離しきい値（正典 §13.1 EARLY_SPURT_METER = 900） */
  EARLY_SPURT_METER: number;
  /** 早仕掛け時の消費倍率（正典 §8b.3: 1.6倍） */
  EARLY_SPURT_DRAIN_MULT: number;
  /** ゴール前にゲージ0なら -0.15（クランプ前に適用・正典 §8b.3） */
  EMPTY_GAUGE_PENALTY: number;

  /** タイミング判定のネットワーク猶予（正典 §13.1 LAG_WINDOW_MS = 150） */
  LAG_WINDOW_MS: number;
  /** 連打の秒間上限（正典 §13.1 TAP_RATE_CAP = 15） */
  TAP_RATE_CAP: number;

  /** IQ が判定幅に効く強さ（正典 §8b.3「判定幅は IQ に比例」・解釈で式を補った） */
  IQ_WINDOW_FULL: number;

  /**
   * ★ゲージが減りはじめる残距離（I-STAMINA-WINDOW）。
   *
   * 【正典の不整合】§8b.2 の数値をレース全体（2000m ≒ 120秒）に当てると、
   *   消費は 120〜576 に達する一方でゲージ上限は 100。**どんな馬でも必ず 0 になり**、
   *   §8b.3 の「ゴール前にゲージ0なら -0.15」が全馬に常時適用される。
   *   介入の巧拙が結果に出なくなるため、そのままでは仕様が成立しない。
   * 【暫定解釈】ゲージは「勝負所（残り800m）以降の余力」を表すものとし、
   *   この窓の内側だけで消費する。QUESTIONS_P1 で照会中。
   */
  /**
   * ★D-017: レース全体での基準消費量。**毎秒ではなく総量**で持つ。
   *   毎秒 = 基準消費量 / レース秒数 なので、距離が変わっても余力の残り方が同じになる。
   *   較正条件（R-7）: 中団・仕掛けなしの典型馬（初期値75）がゴール時に2割残す = 60。
   */
  STAMINA_BASE_DRAIN: number;
  STAMINA_WINDOW_METER: number;
  /**
   * ★「バテ」と判定する残距離（I-STAMINA-EMPTY）。
   *   §8b.3 の -0.15 は**早仕掛けペナルティの一部**として書かれている。
   *   最適に走ればゴール直前でゲージを使い切るのが設計意図（＝余らせるのは走り足りない）
   *   なので、「ゴール前に0」を字義どおり取ると最適プレイも罰されてしまう。
   *   **直線（残り400m）に入る前に尽きた場合**を「バテ」と解釈する。
   */
  STAMINA_EMPTY_METER: number;

  /** AI 代行の入力精度（§8b.5・V-8 の較正対象。1に近いほど上手い） */
  AI_START_SPREAD_RATIO: number;
  AI_SPURT_SPREAD_METER: number;
  AI_DRIVE_MIN_RATIO: number;
  AI_DRIVE_MAX_RATIO: number;

  /**
   * 直線の連打を集計する区間の長さ（秒）。介入ログ→連打レートの換算に使う（§8.8・O-1）。
   * ★正典 §8b は「直線」としか書いておらず秒数を定めていない。
   *   直線400m を平均速度で割った概算（I-DRIVE-WINDOW）。
   */
  DRIVE_WINDOW_SEC: number;
}

export const DEFAULT_INTERVENTION_BALANCE: InterventionBalance = {
  INTERVENTION_CAP: 0.1,
  AI_PROXY_TARGET: 0.95,

  START_BONUS_MIN: -0.04,
  START_BONUS_MAX: 0.03,
  SPURT_BONUS_MIN: -0.08,
  SPURT_BONUS_MAX: 0.09,
  DRIVE_BONUS_MAX: 0.1,

  STAMINA_BASE: 50,
  STAMINA_ST_DIV: 20,
  STAMINA_CONDITION_CENTER: 3,
  STAMINA_CONDITION_MULT: 4,
  STAMINA_FATIGUE_THRESHOLD: 50,
  STAMINA_FATIGUE_DIV: 2,
  STAMINA_MIN: 20,
  STAMINA_MAX: 100,

  STAMINA_DRAIN_PER_SEC: 1.0,
  STAMINA_POSITION_MULT: { front: 1.3, middle: 1.0, back: 0.85 },
  STAMINA_SPURT_DRAIN: 3.0,
  EARLY_SPURT_METER: 900,
  EARLY_SPURT_DRAIN_MULT: 1.6,
  EMPTY_GAUGE_PENALTY: -0.15,

  LAG_WINDOW_MS: 150,
  TAP_RATE_CAP: 15,

  IQ_WINDOW_FULL: 1000,

  STAMINA_BASE_DRAIN: 60,
  STAMINA_WINDOW_METER: 800,
  STAMINA_EMPTY_METER: 400,

  AI_START_SPREAD_RATIO: 1.0,
  AI_SPURT_SPREAD_METER: 190,
  AI_DRIVE_MIN_RATIO: 0.55,
  AI_DRIVE_MAX_RATIO: 0.72,

  DRIVE_WINDOW_SEC: 24,
};

// ---------------------------------------------------------------------------
// スタミナゲージ（§8b.2）
// ---------------------------------------------------------------------------

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

/**
 * 初期スタミナゲージ（正典 §8b.2 の式そのまま）
 *
 * `clamp(50 + ST/20 + (condition-3)*4 - max(0, fatigue-50)/2, 20, 100)`
 */
export function initialStamina(
  st: number,
  condition: number,
  fatigue: number,
  balance: InterventionBalance,
): number {
  const raw =
    balance.STAMINA_BASE +
    st / balance.STAMINA_ST_DIV +
    (condition - balance.STAMINA_CONDITION_CENTER) * balance.STAMINA_CONDITION_MULT -
    Math.max(0, fatigue - balance.STAMINA_FATIGUE_THRESHOLD) / balance.STAMINA_FATIGUE_DIV;
  return clamp(raw, balance.STAMINA_MIN, balance.STAMINA_MAX);
}

export type RunPosition = 'front' | 'middle' | 'back';

/** 走行中のスタミナ消費（正典 §8b.2） */
export function drainPerSecond(
  position: RunPosition,
  spurting: boolean,
  earlySpurt: boolean,
  balance: InterventionBalance,
): number {
  let drain = balance.STAMINA_DRAIN_PER_SEC * balance.STAMINA_POSITION_MULT[position];
  if (spurting) drain *= balance.STAMINA_SPURT_DRAIN;
  if (earlySpurt) drain *= balance.EARLY_SPURT_DRAIN_MULT;
  return drain;
}

// ---------------------------------------------------------------------------
// 介入プラン（4局面の入力）
// ---------------------------------------------------------------------------

/**
 * 4局面の操作を「判定に必要な最小の形」で表したもの。
 *
 * ★実際の入力処理（タップ検出・タイミング判定）は P4。ここはスコア側だけなので、
 *   入力を「どれだけ正確だったか」に還元した抽象で受け取る。
 */
export interface InterventionPlan {
  /**
   * スタート判定の誤差（ms）。0 が完璧、正負どちらにもずれる。
   * 判定窓は `150ms × (1 + IQ/1000)`（§8b.6・I-START-CURVE）
   */
  startErrorMs: number;
  /** 仕掛けた残距離（m）。900m 超で早仕掛け（§8b.3） */
  spurtAtMeter: number;
  /** 直線の連打レート（回/秒）。15回で頭打ち（§8b.6） */
  driveTapsPerSec: number;
  /** 道中のポジション取り。スタミナ消費に効く（§8b.2） */
  position: RunPosition;
}

export interface InterventionHorse {
  /** 賢さ。判定幅に効く（§8b.3） */
  iq: number;
  /** 根性。直線の上乗せ幅に効く（§8b.3） */
  gt: number;
  st: number;
  condition: number;
  fatigue: number;
}

export interface InterventionOutcome {
  startBonus: number;
  spurtBonus: number;
  driveBonus: number;
  /** 「バテ」= 直線(残り400m)に入る前にゲージが尽きたか（§8b.3 の -0.15・I-STAMINA-EMPTY） */
  ranEmpty: boolean;
  /** クランプ前の生の倍率（監視・デバッグ用。§8b.8 の分布監視で使う） */
  rawMult: number;
  /** クランプ後（これが §8.7 の finalScore に掛かる） */
  interventionMult: number;
  /** ゴール時点の残スタミナ（負なら途中で尽きている） */
  staminaLeft: number;
}

/**
 * スタート判定（§8b.3）。
 *
 * 判定幅は IQ に比例し、ラグ猶予 ±150ms が加算される（§8b.6・I-START-CURVE）。
 * 誤差0が満点で、判定窓の縁に向かって線形に下限へ落ちる（窓の外は下限で頭打ち）。
 */
export function startBonusOf(
  errorMs: number,
  iq: number,
  balance: InterventionBalance,
): number {
  const iqWindow = (iq / balance.IQ_WINDOW_FULL) * balance.LAG_WINDOW_MS;
  const window = balance.LAG_WINDOW_MS + iqWindow;
  // ★猶予幅の内側を一律満点にすると、AI 代行がほぼ常に満点を取り V-8/V-9 の較正余地が消える。
  //   誤差0を頂点に猶予幅で下限へ落ちる連続関数にし、猶予幅の意味は「IQ で判定が緩む」に残す。
  const t = clamp(Math.abs(errorMs) / window, 0, 1);
  return balance.START_BONUS_MAX + t * (balance.START_BONUS_MIN - balance.START_BONUS_MAX);
}

/**
 * 仕掛け判定（§8b.3）。
 *
 * 最適点は「直線に入る手前」＝残り 400〜900m（I-SPURT-CURVE）。早すぎる（900m超）と早仕掛けで、
 * 遅すぎる（400m未満）と仕掛けきれない。
 */
export function spurtBonusOf(
  spurtAtMeter: number,
  balance: InterventionBalance,
): number {
  const best = balance.EARLY_SPURT_METER * 0.55; // 残り 495m 付近が最適
  const spread = balance.EARLY_SPURT_METER * 0.5;
  const t = clamp(Math.abs(spurtAtMeter - best) / spread, 0, 1);
  return balance.SPURT_BONUS_MAX + t * (balance.SPURT_BONUS_MIN - balance.SPURT_BONUS_MAX);
}

/** 直線の追い（§8b.3: 最大 +0.10 × GT/1000。連打は秒間15回で頭打ち） */
export function driveBonusOf(
  tapsPerSec: number,
  gt: number,
  balance: InterventionBalance,
): number {
  const effective = clamp(tapsPerSec, 0, balance.TAP_RATE_CAP) / balance.TAP_RATE_CAP;
  return balance.DRIVE_BONUS_MAX * (gt / 1000) * effective;
}

/**
 * 介入倍率の確定計算（正典 §8b.3）。
 *
 * ★早仕掛けペナルティ（-0.15）は**クランプ前**に適用する（正典の明記事項）。
 *   クランプ後に引くと下限 0.90 を割り、±10% のハードキャップが壊れる。
 */
export function resolveIntervention(
  horse: InterventionHorse,
  plan: InterventionPlan,
  /** 平均速度 m/s（§8.7 の averageSpeed。残距離を秒に換算するのに使う） */
  averageSpeedMps: number,
  /** レース距離 m。★D-017 で消費がレース時間に対する割合になったので必要 */
  distanceMeter: number,
  balance: InterventionBalance,
): InterventionOutcome {
  const startBonus = startBonusOf(plan.startErrorMs, horse.iq, balance);
  const spurtBonus = spurtBonusOf(plan.spurtAtMeter, balance);
  const driveBonus = driveBonusOf(plan.driveTapsPerSec, horse.gt, balance);

  const stamina0 = initialStamina(horse.st, horse.condition, horse.fatigue, balance);
  const earlySpurt = plan.spurtAtMeter > balance.EARLY_SPURT_METER;

  // ★D-017: 毎秒消費 = (基準消費量 / レース秒数) × ポジション係数 × ペース係数。
  //   **レース全体での総消費が距離によらず一定**になるので、2000m でも 3200m でも
  //   同じ「余力の残り方」になる（旧実装は絶対値 1.0/秒で、2000m だと必ずゲージ0になった）。
  const raceSec = distanceMeter / averageSpeedMps;
  const unit = balance.STAMINA_BASE_DRAIN / raceSec; // 1秒あたりの基準消費
  const spurtStart = Math.min(Math.max(0, plan.spurtAtMeter), distanceMeter);
  const cruiseMeter = Math.max(0, distanceMeter - spurtStart);

  const cruiseRate = unit * balance.STAMINA_POSITION_MULT[plan.position];
  const spurtRate =
    cruiseRate * balance.STAMINA_SPURT_DRAIN * (earlySpurt ? balance.EARLY_SPURT_DRAIN_MULT : 1);
  const cruiseUsed = (cruiseMeter / averageSpeedMps) * cruiseRate;
  const spurtUsed = (spurtStart / averageSpeedMps) * spurtRate;
  const staminaLeft = stamina0 - cruiseUsed - spurtUsed;

  // 「バテ」= 直線（残り400m）に入る前にゲージが尽きること（I-STAMINA-EMPTY）
  let emptyAtMeter: number | null = null;
  if (staminaLeft <= 0) {
    if (cruiseUsed >= stamina0) {
      const sec = stamina0 / cruiseRate;
      emptyAtMeter = distanceMeter - sec * averageSpeedMps;
    } else {
      const sec = (stamina0 - cruiseUsed) / spurtRate;
      emptyAtMeter = spurtStart - sec * averageSpeedMps;
    }
  }
  const ranEmpty = emptyAtMeter !== null && emptyAtMeter > balance.STAMINA_EMPTY_METER;

  const rawMult =
    1 + startBonus + spurtBonus + driveBonus + (ranEmpty ? balance.EMPTY_GAUGE_PENALTY : 0);
  const interventionMult = clamp(
    rawMult,
    1 - balance.INTERVENTION_CAP,
    1 + balance.INTERVENTION_CAP,
  );

  return {
    startBonus,
    spurtBonus,
    driveBonus,
    ranEmpty,
    rawMult,
    interventionMult,
    staminaLeft,
  };
}

// ---------------------------------------------------------------------------
// AI 代行（§8b.5）
// ---------------------------------------------------------------------------

/**
 * AI 代行のプラン（正典 §8b.5）。
 *
 * > スタート=IQ 基準の標準判定 / 仕掛け=適正区間で自動発動 / 直線=GT 比例の平均的な追い
 *
 * ★「操作しないと大損」にしないため、AI は**中立に上手い**。乱数で少しだけブレる
 *   （毎回同じだと「AI が最適」になり、手動する意味が消える）。精度定数は V-8 で較正する（I-AI-QUALITY）。
 */
export function aiProxyPlan(
  horse: InterventionHorse,
  rng: Rng,
  balance: InterventionBalance,
): InterventionPlan {
  // スタート: IQ が高いほど誤差が小さい（§8b.5「IQ 基準の標準判定」）。
  // ★判定窓のほうも IQ で広がるので、誤差の散らばりを窓に比例させると IQ が相殺されて
  //   効かなくなる。誤差は IQ で**縮む**ようにする（最初これを比例で書いて相殺させた）。
  const spread =
    balance.LAG_WINDOW_MS *
    balance.AI_START_SPREAD_RATIO *
    (1 - horse.iq / (2 * balance.IQ_WINDOW_FULL));
  return {
    startErrorMs: rng.gaussian(0, spread),
    // 仕掛け: 適正区間の中央付近を狙うが上手い手動ほど正確ではない
    spurtAtMeter:
      balance.EARLY_SPURT_METER * 0.55 + rng.gaussian(0, balance.AI_SPURT_SPREAD_METER),
    // 直線: 秒間上限の 5.5〜7.2 割程度（人間の平均的な追い）
    driveTapsPerSec:
      balance.TAP_RATE_CAP * rng.range(balance.AI_DRIVE_MIN_RATIO, balance.AI_DRIVE_MAX_RATIO),
    position: 'middle',
  };
}

/** 手動最適プレイ（V-8 の分母）。理論上の最良入力 */
export function optimalPlan(balance: InterventionBalance): InterventionPlan {
  return {
    startErrorMs: 0,
    spurtAtMeter: balance.EARLY_SPURT_METER * 0.55,
    driveTapsPerSec: balance.TAP_RATE_CAP,
    position: 'middle',
  };
}
