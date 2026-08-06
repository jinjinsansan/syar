/**
 * 馬券の正典値（正典 §9.1・§9.3・§9.4）
 *
 * 【3分類（§16.3）のどれか】
 *   ここは**正典に表として書かれている値の写し**なので、較正定数ではありません。
 *   `betting.test.ts` が**正典との一致を値照合で守ります**（測定条件と同じ扱い）。
 *   ⚠️ 控除率は PP 発行量の主要な調整弁（§11）なので、
 *      勝手に動かすと経済が変わります。変更にはオーナー承認が要ります。
 */

import type { TicketKind } from './types.js';

/** 最小購入単位（正典 §9.1: 全券種 100 EP） */
export const MIN_STAKE = 100;

/**
 * 控除率 margin（正典 §9.3）。還元率 = 1 − margin
 *
 * ⚠️ **1行で書くこと。** 変異試験は行単位で宣言を置換するので、複数行にすると
 *    1行目だけが差し替わってファイルが壊れ、「構文エラーで落ちた」を
 *    「振る舞いが守った」と読み違える（TRACK_CONDITION_CDF で一度潰した形）。
 *    実際この定数を複数行で書いたら、変異試験が **未防御** と報告した。
 */
// prettier-ignore
export const MARGIN: Readonly<Record<TicketKind, number>> = { win: 0.18, place: 0.18, quinella_place: 0.20, quinella: 0.20, exacta: 0.20, trio: 0.23, trifecta: 0.23 };

/** 最高オッズ（正典 §9.4）。到達時は表示にその旨を明示する。★1行で書く（MARGIN 参照） */
// prettier-ignore
export const ODDS_CAP: Readonly<Record<TicketKind, number>> = { win: 500, place: 100, quinella_place: 300, quinella: 2000, exacta: 4000, trio: 10000, trifecta: 100000 };

/**
 * ベット上限（正典 §9.4・すべて EP）。
 * 日次上限は射幸性の抑制と、**バグ・エクスプロイト時の被害上限**を兼ねる。
 * 「初期から必ず入れる」と正典が明記している。
 */
export const BET_LIMITS = {
  /** 1点あたり */
  PER_POINT: 10_000,
  /** 1レース・1券種 */
  PER_RACE_KIND: 30_000,
  /** 1レース合計 */
  PER_RACE_TOTAL: 50_000,
  /** 1日合計 */
  PER_DAY: 500_000,
} as const;

/** 自馬出走レースの上限（正典 §9.5） */
export const OWN_HORSE_RACE_LIMIT = 5_000;

/**
 * 複勝・ワイドが「3着以内」になる最小頭数（正典 §9.1）。
 * これ**未満**（＝7頭以下）は2着までになる。実競馬の慣行を踏襲。
 */
export const PLACE_THREE_MIN_FIELD = 8;

/** 出走頭数に応じた複勝圏（正典 §9.1） */
export function placeDepth(fieldSize: number): number {
  return fieldSize >= PLACE_THREE_MIN_FIELD ? 3 : 2;
}

/** オッズ = (1/p) × (1 − margin)、上限で頭打ち（正典 §9.2・§9.4） */
export function oddsFromProbability(kind: TicketKind, p: number): number {
  if (!Number.isFinite(p) || p <= 0) return ODDS_CAP[kind];
  const raw = (1 / p) * (1 - MARGIN[kind]);
  return Math.min(ODDS_CAP[kind], raw);
}
