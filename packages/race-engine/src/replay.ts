/**
 * §8.8 完全再現 = `seed_reveal` + 介入入力ログ → 同じ着順（O-1）
 *
 * 【P1 で欠けていたもの】
 *   記録用の `InterventionInput[]`（種別＋時刻）から計算用の `InterventionPlan`
 *   （判定に必要な形）へ変換する関数が無く、`auditFailures` は着順を再計算していなかった。
 *   つまり「seed だけで同じレース」は成立していたが、**正典 §8.8 が求める
 *   「seed + 介入ログ → 同じ着順」は成立していなかった**。
 *   これが無いとリプレイ・不正調査・サポート対応の一次資料が機能しない（§8.8 を新設した理由そのもの）。
 *
 * 【変換の考え方】
 *   `InterventionInput` は「いつ何を押したか」の生ログである（§8b.4: クライアントは
 *   入力イベントのみ送り、サーバーが受信時刻とともに記録する）。
 *   判定はサーバー受信時刻を基準に行う（§8b.6）ので、変換もサーバー時刻だけを使う。
 *   クライアント申告時刻は参考記録なので**変換に使わない** — 使うと
 *   クライアントが時刻を詐称して有利な判定を得られてしまう。
 */

import {
  DEFAULT_INTERVENTION_BALANCE,
  resolveIntervention,
  type InterventionBalance,
  type InterventionHorse,
  type InterventionPlan,
  type RunPosition,
} from './intervention.js';
import {
  auditFailures,
  finalSeedToRngSeed,
  type HashProvider,
  type InterventionInput,
  type RaceAuditRecord,
} from './fairness.js';
import { averageSpeedMps, resolveRace, type ResolveRaceParams } from './race.js';
import type { RaceBalance } from './balance.js';
import type { RaceConditions, RaceEntrant, RaceResult } from './types.js';

/** 変換に必要なレース側の文脈（すべてサーバーが持っている値） */
export interface ReplayContext {
  /** レース距離 */
  distance: number;
  /** 平均速度 m/s（残距離 ↔ 経過秒の換算に使う） */
  averageSpeedMps: number;
  /** スタート判定の基準時刻（サーバー時刻ミリ秒）。通常 0 */
  startAtMs: number;
  /** 直線の連打を集計する区間の長さ（秒） */
  driveWindowSec: number;
}

/**
 * 介入がまったく無いときのプラン（AI 代行でも手動でもない「素の走り」）。
 *
 * ★`ctx` は受け取るが使わない。将来コース条件で既定を変える可能性があるため引数に残すが、
 *   **いま使っていないことを明示する**（使っているように見せない）。
 */
export function neutralPlan(_ctx: ReplayContext): InterventionPlan {
  return {
    // タップが無い＝判定窓を大きく外した扱い。スタートボーナスは下限になる
    startErrorMs: Number.POSITIVE_INFINITY,
    // 仕掛けが無い＝仕掛けないままゴールする。残距離0で仕掛けた扱い
    spurtAtMeter: 0,
    driveTapsPerSec: 0,
    position: 'middle',
  };
}

/**
 * 介入入力ログ → 判定用プラン（§8.8 の中核）。
 *
 * ★同じログからは必ず同じプランが出る（決定論）。ログの順序に依存しないよう、
 *   種別ごとに「最初の1件」を採る（連打だけは件数を数える）。
 *   順序依存にすると、DB から取り出す順が変わっただけで再現が壊れる。
 */
export function planFromInputs(
  inputs: readonly InterventionInput[],
  ctx: ReplayContext,
): InterventionPlan {
  const plan = neutralPlan(ctx);
  if (inputs.length === 0) return plan;

  // --- スタート: 最も早い start 入力の、基準時刻からのずれ ---
  const starts = inputs.filter((i) => i.phase === 'start');
  if (starts.length > 0) {
    let earliest = starts[0]?.serverMs ?? ctx.startAtMs;
    for (const s of starts) if (s.serverMs < earliest) earliest = s.serverMs;
    plan.startErrorMs = earliest - ctx.startAtMs;
  }

  // --- 道中: 最後の position 指示を採る（あとから出した指示が有効） ---
  const travels = inputs.filter((i) => i.phase === 'travel');
  if (travels.length > 0) {
    let latest = travels[0];
    for (const t of travels) if (latest !== undefined && t.serverMs >= latest.serverMs) latest = t;
    plan.position = positionOf(latest);
  }

  // --- 仕掛け: 最も早い spurt 入力の時刻を残距離へ換算 ---
  const spurts = inputs.filter((i) => i.phase === 'spurt');
  if (spurts.length > 0) {
    let earliest = spurts[0]?.serverMs ?? 0;
    for (const s of spurts) if (s.serverMs < earliest) earliest = s.serverMs;
    const elapsedSec = Math.max(0, (earliest - ctx.startAtMs) / 1000);
    const traveled = elapsedSec * ctx.averageSpeedMps;
    plan.spurtAtMeter = Math.max(0, ctx.distance - traveled);
  }

  // --- 直線: drive 入力の件数を秒間レートへ ---
  const drives = inputs.filter((i) => i.phase === 'drive');
  if (drives.length > 0 && ctx.driveWindowSec > 0) {
    plan.driveTapsPerSec = drives.length / ctx.driveWindowSec;
  }

  return plan;
}

/**
 * `travel` 入力からポジションを読む。
 *
 * ⚠️ `InterventionInput` は種別と時刻しか持たず、内/外・前/後の別を持たない（正典 §8b.4 の記述どおり）。
 *    ログだけからポジションを一意に復元できないため、**P1 では中団固定**とする。
 *    → `I-REPLAY-POSITION` として登録。§8b.4 のログ形式にポジション指示の内容を含める必要がある。
 */
function positionOf(_input: InterventionInput | undefined): RunPosition {
  return 'middle';
}

// ---------------------------------------------------------------------------
// 再計算（§8.8「サーバーが再計算で示せること」）
// ---------------------------------------------------------------------------

export interface ReplayParams {
  conditions: RaceConditions;
  entrants: readonly RaceEntrant[];
  /** `final_seed` を 32bit へ畳んだもの（`finalSeedToRngSeed`） */
  seed: number;
  balance: RaceBalance;
  /** 馬ごとの介入入力ログ */
  interventions: readonly InterventionInput[];
  interventionBalance?: InterventionBalance;
  /** 直線の連打を集計する区間の長さ（秒）。ログの記録条件と一致させること */
  driveWindowSec?: number;
}

/** 介入ログから `interventionMult` を再計算する */
export function interventionMultsFromLog(params: ReplayParams): Map<string, number> {
  const ib = params.interventionBalance ?? DEFAULT_INTERVENTION_BALANCE;
  const speed = averageSpeedMps(
    params.conditions.distance,
    params.conditions.surface,
    params.conditions.trackCondition,
    params.balance,
  );
  const ctx: ReplayContext = {
    distance: params.conditions.distance,
    averageSpeedMps: speed,
    startAtMs: 0,
    driveWindowSec: params.driveWindowSec ?? ib.DRIVE_WINDOW_SEC,
  };

  const byHorse = new Map<string, InterventionInput[]>();
  for (const input of params.interventions) {
    const list = byHorse.get(input.horseId) ?? [];
    list.push(input);
    byHorse.set(input.horseId, list);
  }

  const out = new Map<string, number>();
  for (const entrant of params.entrants) {
    const inputs = byHorse.get(entrant.horseId);
    if (inputs === undefined || inputs.length === 0) continue; // 介入なしは 1（既定）
    const horse: InterventionHorse = {
      iq: entrant.stats.iq,
      gt: entrant.stats.gt,
      st: entrant.stats.st,
      condition: entrant.condition,
      fatigue: entrant.fatigue,
    };
    const plan = planFromInputs(inputs, ctx);
    out.set(entrant.horseId, resolveIntervention(horse, plan, speed, params.conditions.distance, ib).interventionMult);
  }
  return out;
}

/**
 * §8.8 完全再現: `seed + 介入入力ログ → 着順`。
 *
 * ★この関数が `resolveRace` を呼ぶこと自体が要件である。別実装で「同じはず」の計算をすると、
 *   本番と再現がずれても気づけない（それでは監査資料にならない）。
 */
export function replayRace(params: ReplayParams): RaceResult {
  const mults = interventionMultsFromLog(params);
  const args: ResolveRaceParams = {
    conditions: params.conditions,
    entrants: params.entrants,
    seed: params.seed,
    balance: params.balance,
    interventionMults: mults,
  };
  return resolveRace(args);
}

/**
 * §8.8 の完全な監査経路（O-1 の本体）。
 *
 * `auditFailures`（ハッシュ連鎖の検証）だけでは「乱数が事後差し替えされていないこと」しか示せない。
 * 介入があるレースでは **seed + 介入ログ → 同じ着順**まで再計算して初めて
 * 「結果は記録どおりに作られた」と言える（正典 §8.8）。この関数が両方を1つの経路で行う。
 *
 * 返すのは真偽ではなく**理由の配列**（空なら合格）。何を検証したかを呼び出し側が報告できる形にする（R-9）。
 */
export function auditRaceFailures(
  record: RaceAuditRecord,
  hash: HashProvider,
  replay: {
    conditions: RaceConditions;
    entrants: readonly RaceEntrant[];
    balance: RaceBalance;
    /** 保存されている確定着順（horseId を1着から並べたもの） */
    recordedOrder: readonly string[];
    interventionBalance?: InterventionBalance;
    driveWindowSec?: number;
  },
): string[] {
  // (1) ハッシュ連鎖（seed_commit / client_entropy / final_seed / 介入ログの出走馬）
  const failures = auditFailures(record, hash);
  if (record.seedReveal === null) {
    failures.push('seed_reveal が無いため着順の再計算ができない');
    return failures;
  }

  // (2) 着順の再計算。★final_seed から RNG シードを導く経路も本番と同じものを使う
  const params: ReplayParams = {
    conditions: replay.conditions,
    entrants: replay.entrants,
    seed: finalSeedToRngSeed(record.finalSeed),
    balance: replay.balance,
    interventions: record.interventions,
    ...(replay.interventionBalance === undefined
      ? {}
      : { interventionBalance: replay.interventionBalance }),
    ...(replay.driveWindowSec === undefined ? {} : { driveWindowSec: replay.driveWindowSec }),
  };
  for (const m of replayMismatches(params, replay.recordedOrder)) {
    failures.push(`再現した着順が記録と一致しない: ${m}`);
  }
  return failures;
}

/** 再現結果と保存された着順が一致するかを検査する（一致しなければ理由を返す） */
export function replayMismatches(
  params: ReplayParams,
  recordedOrder: readonly string[],
): string[] {
  const replayed = replayRace(params).order.map((o) => o.horseId);
  if (replayed.length !== recordedOrder.length) {
    return [`着順の頭数が違う: 記録${recordedOrder.length} / 再現${replayed.length}`];
  }
  const out: string[] = [];
  for (let i = 0; i < replayed.length; i++) {
    if (replayed[i] !== recordedOrder[i]) {
      out.push(`${i + 1}着が一致しない: 記録=${recordedOrder[i]} / 再現=${replayed[i]}`);
    }
  }
  return out;
}
