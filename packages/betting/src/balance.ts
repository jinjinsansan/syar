/**
 * 馬券の正典値（正典 §9.1・§9.3・§9.4）
 *
 * 【3分類（§16.3）のどれか】
 *   ここは**正典に表として書かれている値の写し**なので、較正定数ではありません。
 *   `betting.test.ts` が**正典との一致を値照合で守ります**（測定条件と同じ扱い）。
 *   ⚠️ 控除率は PP 発行量の主要な調整弁（§11）なので、
 *      勝手に動かすと経済が変わります。変更にはオーナー承認が要ります。
 */

import { TICKET_KINDS, type TicketKind } from './types.js';

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

/**
 * ★モンテカルロ推定量のバイアスを打ち消した確率（正典 D-013）
 *
 * 【なぜ必要か】
 *   `p̂ = c/M`（c 〜 Binomial(M, p)）は **p の不偏推定量**ですが、
 *   オッズが使うのは `1/p̂` で、**1/x が凸なので `1/p̂` は不偏ではありません**。
 *
 *     E[1/p̂] ≈ (1/p) · ( 1 + (1−p)/(M·p) )
 *
 *   角括弧の中は**必ず 1 より大きい**ので、オッズは系統的に高く付きます。
 *   A-3 で10シードすべてが払戻率 82% を上回り、**下振れが1つも無かった**のは
 *   偶然ではなく、この恒等式の帰結です（実測 +1.36pt / 予測 +1.10pt）。
 *
 * 【★これは測定を通すための調整ではありません】
 *   運営が意図する控除率は §9.3 の `MARGIN` です。補正前のオッズは
 *   **推定量のバイアスのぶんだけ、意図より客に有利**に付いていました。
 *   補正は**オッズを設計意図に一致させる**もので、本番として正しい実装です。
 *
 * 【式】
 *   割り戻し `odds = (1/p̂)(1−margin) / (1 + (1−p̂)/(M·p̂))` は、
 *   分母を p̂ に畳むと **p_eff = p̂ + (1−p̂)/M** と等価になります。
 *   こちらの形なら補正が**確率の側に1か所だけ**閉じ、券種ごとに散りません。
 *   （等価であることは `settle.test.ts` が両式を突き合わせて守ります）
 *
 * ★M を上げるのでもゲート幅を広げるのでもなく**導出式で打ち消す**のが D-013 の方針です。
 *   稀な目ほど補正が大きく、裾に寄与が集中していた実測とも整合します。
 */
export function debiasedProbability(pHat: number, trials: number): number {
  if (!Number.isFinite(trials) || trials <= 0) {
    throw new Error(`debiasedProbability: 試行数 M が不正です (${trials})`);
  }
  return pHat + (1 - pHat) / trials;
}

/**
 * ★D-035: 発売する最小確率。**これ未満の目は売らない。**
 *
 *     p_min = (1 − margin) / ODDS_CAP
 *
 * 【なぜ「上限で頭打ち」ではなく「売らない」なのか】
 *   上限は**払戻を減らす方向にしか働きません**。上限に当たる目を売ると、
 *   客は当たっても**黙って切り詰められた配当**を受け取ります。
 *   実測（二項分布の厳密計算）で、券種によっては還元率が設定 margin より
 *   **7〜13pt 低く**なっていました。**払えない配当を売らないほうが客に有利です。**
 *
 * 【★これが3つの効果を同時に閉じます】
 *   ③ 上限の切り詰めが消える … 売る目がすべて上限の内側にある
 *   ② c ≧ 1 の打ち切りが消える … 売る下限が p_min に固定されるので、
 *      M·p_min = λ* を十分大きく取れば c の条件付けが無視できる
 *   ① 凸性は `debiasedProbability` で既に消えている
 *   残るのは margin ちょうどです。
 *
 *   ★②と③が正面衝突していたのは、どちらも「稀な目」に効くからでした。
 *     稀な目の扱いを**1箇所で**決めれば両方閉じます。
 */
export function minSellableProbability(kind: TicketKind): number {
  return (1 - MARGIN[kind]) / ODDS_CAP[kind];
}

/**
 * ★打ち切りを無視できるとみなす M·p_min（正典 D-035 の設計余裕）。
 *
 * ⚠️ **1行で書くこと**（MARGIN 参照）。
 * ⚠️ これは較正定数です。大きくすると必要な試行数がそのまま比例して増え、
 *    レース生成の所要時間に直結します（本番機で λ*=30 → 1レース 137秒）。
 */
// prettier-ignore
export const LAMBDA_STAR = 30;

/**
 * ★券種ごとに必要なモンテカルロ試行数（正典 D-035）。
 *
 *     M ≧ λ* × ODDS_CAP / (1 − margin) = λ* / p_min
 *
 * MC は1回の試行で全券種の的中目を同時に数えるので、**M は券種で共有**します。
 * したがって実際に使うのは全券種の最大値（`requiredOddsTrials()`）です。
 */
export function requiredOddsTrialsFor(kind: TicketKind): number {
  return Math.ceil(LAMBDA_STAR / minSellableProbability(kind));
}

/**
 * 全券種を満たす試行数。★律速は三連単（上限 100,000倍）です。
 * ⚠️ 正典 §9.2 の 10,000 では足りません（三連単で −20.90pt）。§9.2 の改訂が要ります。
 */
export function requiredOddsTrials(): number {
  return Math.max(...TICKET_KINDS.map(requiredOddsTrialsFor));
}

/**
 * オッズ = (1/p_eff) × (1 − margin)、上限で頭打ち（正典 §9.2・§9.4・D-013）
 *
 * ★`trials` は必須です。既定値を持たせません —
 *   補正量は M に依存するので、**呼ぶ側が「どの M で推定したか」を必ず宣言する**必要があります。
 *   既定値があると、別の M で推定した確率に誤った補正が当たっても型でも実行時でも気づけません。
 */
export function oddsFromProbability(kind: TicketKind, p: number, trials: number): number {
  if (!Number.isFinite(p) || p <= 0) return ODDS_CAP[kind];
  const raw = (1 / debiasedProbability(p, trials)) * (1 - MARGIN[kind]);
  return Math.min(ODDS_CAP[kind], raw);
}
