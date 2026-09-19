/**
 * PP 発行量の監視（正典 §11.2・§4.6）— 純粋 TypeScript
 *
 * 【なぜ最重要なのか】
 *   PP は**景品という現実の価値に繋がる出口**を持ちます。発行量が制御を離れると
 *   経済ではなく法務の問題になります。§11.2 が「最重要」と書いているのはその意味です。
 *
 * 【固定オッズのリスク構造】
 *   パリミュチュエルと違い、**運営が変動リスクを負います**。
 *   高配当が連続すると PP が急膨張しうるので、日次で見る必要があります。
 *
 * 【★R-16 の適用】
 *   `margin_actual` を券種横断の1つの比で見ると、**券種ごとの偏りが打ち消し合って見えなくなります**。
 *   三連単が大きく下振れし単勝が上振れていても、合計では正常に見えます。
 *   → **券種別に出し、券種別に判定する**。
 */

import { MARGIN } from './balance.js';
import { TICKET_KINDS } from './types.js';
import type { TicketKind } from './types.js';

/** 乖離アラートの閾値（正典 §11.2: 理論値から3%以上でアラート） */
export const MARGIN_ALERT_THRESHOLD = 0.03;

/** 1日ぶんの馬券の集計（券種別） */
export interface TicketDayTotals {
  /** 売上（EP） */
  readonly stake: number;
  /** 払戻（PP） */
  readonly payout: number;
  /** 返還（EP・取消/除外分。売上にも払戻にも数えない） */
  readonly refund: number;
}

export interface PointFlowInput {
  /** 券種別の売上・払戻 */
  readonly byKind: Readonly<Partial<Record<TicketKind, TicketDayTotals>>>;
  /** 外部からの EP 流入（D1・§4.6） */
  readonly epInflow: number;
  /** 調教費・出走料など、馬券以外で焼却された EP */
  readonly epBurnedOther: number;
  /** レース賞金として発行した PP（§11.1） */
  readonly ppPrize: number;
  /** 景品交換で消えた PP（§11.3） */
  readonly ppExchanged: number;
}

export interface KindMargin {
  readonly kind: TicketKind;
  readonly stake: number;
  readonly payout: number;
  /** 実際の控除率 = 1 − 払戻/売上 */
  readonly marginActual: number;
  /** 設定値との差（正なら運営の取り分が多い） */
  readonly deviation: number;
  readonly alert: boolean;
}

export interface PointFlowDaily {
  readonly epInflow: number;
  /** 焼却された EP = 馬券の控除ぶん + それ以外 */
  readonly epBurned: number;
  /** 発行した PP = 賞金 + 払戻 */
  readonly ppIssued: number;
  readonly ppExchanged: number;
  /** ★純発行量 = 発行 − 交換。**ゼロ近傍〜微減であることを毎日確認する**（V-11） */
  readonly ppNet: number;
  readonly byKind: readonly KindMargin[];
  /** 券種横断の実控除率（**判定には使わない**。R-16 により打ち消し合うため） */
  readonly marginActualOverall: number;
  /** 1件でも券種がアラートなら true */
  readonly alert: boolean;
}

/**
 * 日次の資金フローを集計する。
 *
 * ⚠️ 売上ゼロの券種は `marginActual` を 0 にせず**判定から外します**。
 *    0 にすると「控除率100%の異常」に見え、売れていない日に毎回アラートが出ます。
 */
export function summarizeDay(input: PointFlowInput): PointFlowDaily {
  const byKind: KindMargin[] = [];
  let stakeTotal = 0;
  let payoutTotal = 0;

  for (const kind of TICKET_KINDS) {
    const t = input.byKind[kind];
    if (t === undefined || t.stake <= 0) continue;
    stakeTotal += t.stake;
    payoutTotal += t.payout;
    const marginActual = 1 - t.payout / t.stake;
    const deviation = marginActual - MARGIN[kind];
    byKind.push({
      kind,
      stake: t.stake,
      payout: t.payout,
      marginActual,
      deviation,
      // ★片側ではなく両側で見る。控除率が**高すぎる**のも異常
      //   （売っていない目が当たり続けている等）で、見逃すと客が損し続ける
      alert: Math.abs(deviation) >= MARGIN_ALERT_THRESHOLD,
    });
  }

  const epBurnedFromBets = stakeTotal - payoutTotal > 0 ? stakeTotal - payoutTotal : 0;
  const ppIssued = input.ppPrize + payoutTotal;

  return {
    epInflow: input.epInflow,
    epBurned: epBurnedFromBets + input.epBurnedOther,
    ppIssued,
    ppExchanged: input.ppExchanged,
    ppNet: ppIssued - input.ppExchanged,
    byKind,
    marginActualOverall: stakeTotal > 0 ? 1 - payoutTotal / stakeTotal : 0,
    alert: byKind.some((k) => k.alert),
  };
}

/**
 * ★**PP の純発行量の健全さ**（★V-11）。★**3 状態**です（★**M-8'**・2026-09-19）。
 *
 * 【🔴 ★なぜ 2 状態ではいけないか — ★監査 M-8（2026-09-14）】
 *   ★旧: `if (day.ppIssued <= 0) return true;` ＝ ★**発行が 0 の日を「健全」**と答えていました。
 *   → ★★**「経済が存在しない日」を健全と判定する形**（R-16 ／ V-11）。
 *   ✔ ★実測（★DL-1・2026-09-19）: ★`point_flow_daily` は ★**1 か月 0 行**でした。
 *     ★★**その 1 か月、この関数は「健全」と言い続ける形**だったことになります。
 *
 * 【★今日 2 例目です】
 *   ★同じ日に ★`verify-known-red.mjs` が ★**「走らなかった」を「緑」と数えていた**のを見つけました
 *   （★**CI-4**）。★**「無いこと」を「良いこと」と答える**、という同じ形です。
 *
 * 【★3 状態】
 *   ★`'healthy'`     … ★純増が許容比の中
 *   ★`'unhealthy'`   … ★純増が許容比を超えた
 *   ★`'unmeasured'`  … 🔴 ★**発行が無いので測れていない**（★**「健全」ではありません**）
 *
 * ⚠️ ★**絶対額では判定できません。** ★規模が変われば額も変わるので、★発行量に対する比で見ます。
 * @param tolerance 発行量に対する純増の許容比
 */
export type PpNetHealth = 'healthy' | 'unhealthy' | 'unmeasured';

export function ppNetHealth(day: PointFlowDaily, tolerance = 0.05): PpNetHealth {
  /**
   * 🔴 ★**ここが M-8 の核**です。★`true` を返してはいけません。
   *    ★「その日 PP が 1 も出ていない」は ★**経済が回っていない**ということで、
   *    ★V-11 が見たい「還流が釣り合っているか」は ★**測れていません**。
   */
  if (day.ppIssued <= 0) return 'unmeasured';
  return day.ppNet / day.ppIssued <= tolerance ? 'healthy' : 'unhealthy';
}

/**
 * ★**「不健全ではない」か**（★旧 `isPpNetHealthy` の後継）。
 *
 * ⚠️ 🔴 ★**`'unmeasured'` をどちらに倒すかは、★呼ぶ側が決めること**です。
 *    ★この関数は ★**「止めるべきか」だけ**を答えます（★測れていない日で止めはしません）。
 *    ★**「健全だったか」を知りたいなら `ppNetHealth()` を直接 見てください。**
 * ⚠️ ★**旧 `isPpNetHealthy` と同じ真偽値を返します** — ★挙動は 1 ビットも変えていません。
 *    ★変えたのは ★**「健全」と「測れていない」を言い分けられるようになった**ことだけです。
 */
export function isPpNetNotUnhealthy(day: PointFlowDaily, tolerance = 0.05): boolean {
  return ppNetHealth(day, tolerance) !== 'unhealthy';
}

/**
 * @deprecated 🔴 ★**2026-09-19・M-8' で 3 状態にしました。**
 *   ★この名前は ★**「健全か」と読めます**が、★実際は「不健全ではないか」を返します
 *   （★発行 0 の日に `true`）。★**その読み違いが監査 M-8 そのもの**でした。
 *   → ★**`ppNetHealth()`（3 状態）か `isPpNetNotUnhealthy()`（真偽）を使ってください。**
 */
export function isPpNetHealthy(day: PointFlowDaily, tolerance = 0.05): boolean {
  return isPpNetNotUnhealthy(day, tolerance);
}
