/**
 * ★**続けて投票**（★2026-09-29・オーナー「毎回たずねる」・レビュー側の裁定・デザイナー R-22 の指摘で出すときを差し替え）
 *
 * 🔴 【★出すのは ★投票を受け付けた直後だけ（★結果の後には出さない）】
 *   ★結果が決まった後に出すと、★当たり外れで見た目を同じにしても ★「結果を見て、もう一度」の流れが残る（★追い賭け）。
 *   ★受け付けた直後なら ★**結果を見る前の決め**。→ ★この仕組みは ★結果（当たり外れ・払戻・確定したか）を ★一切読まない。
 *
 * 【★流れ】
 *   ① 投票を受け付けた直後に「次のレースも同じ券種・同じ額で投票できます」［次のレースも］［やめる］
 *   ② ［次のレースも］→ ★予定（券種と どのレースの後か）を この窓に置く（★EP は 1 も使わない）
 *   ③ 次のレースが発売になったら ★券種だけ予定どおりにして「馬を選んで『投票する』を押してください」
 *   ④ ★馬は本人が選び、★「投票する」を押すまで買わない（★自動では買わない）
 *   ★続けて 3 回まで（★続けて投票した回数・★自分で選び直して買えば 0）。★参加ポイントが足りなければ「足りない」と出す。
 *
 * ⚠️ ★PP には触れません（★払戻を次の賭けに回さない・憲法の第 3 原則）。★使うのは参加ポイント（EP）だけ。
 */
import { REPEAT_BET_MAX } from './claims';

/** ★受け付けた直後に何を出すか */
export type AfterAcceptOffer =
  | { readonly kind: 'offer'; readonly betType: string; readonly amount: number }
  | { readonly kind: 'short'; readonly amount: number }
  | { readonly kind: 'limit' };

export function offerAfterAccept(input: {
  /** ★いま受け付けた投票の券種と額 */
  readonly betType: string;
  readonly amount: number;
  /** ★受け付けた後の残高（★次も同じ額を払えるか） */
  readonly epBalance: number;
  /** ★受け付けた投票を数えた後の 続けた回数 */
  readonly streak: number;
}): AfterAcceptOffer {
  if (input.streak >= REPEAT_BET_MAX) return { kind: 'limit' };
  if (input.epBalance < input.amount) return { kind: 'short', amount: input.amount };
  return { kind: 'offer', betType: input.betType, amount: input.amount };
}

/** ★予定（★［次のレースも］を押したとき・★どのレースの後か と 券種） */
export interface RepeatPlan {
  readonly afterRaceId: string;
  readonly betType: string;
}

/** ★いま発売中のレースに 予定を当ててよいか（★予定を作ったレースの次・★締切前・★画面にある券種） */
export function planAppliesTo(plan: RepeatPlan | null, input: {
  readonly currentRaceId: string | null;
  readonly salesClosed: boolean;
  readonly betTypes: readonly string[];
}): boolean {
  return plan !== null && input.currentRaceId !== null && plan.afterRaceId !== input.currentRaceId
    && !input.salesClosed && input.betTypes.includes(plan.betType);
}

/** ★予定どおりに買えたら +1、★自分で選び直して買ったら 0 に戻す */
export function nextRepeatStreak(current: number, viaPlan: boolean): number {
  return viaPlan ? current + 1 : 0;
}

/**
 * ★続けた回数と予定は ★その端末のその窓だけに置きます（★sessionStorage）。
 * ⚠️ ★これは ★押しやすさの上限で、★お金の上限ではありません（★1 レースの上限は サーバーの `my_bet_allowance`）。
 *    ★読めない・書けない環境では 0 から数え、予定も無し（★自動で使う EP は無い）。
 */
const STREAK_KEY = 'star.vote.repeatStreak';
const PLAN_KEY = 'star.vote.repeatPlan';
/** ★DOM の型に頼らない（★網がこのファイルを Node の型検査で読む） */
interface SessionStore { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void }
const store = (): SessionStore | undefined => (globalThis as { sessionStorage?: SessionStore }).sessionStorage;

export function readRepeatStreak(): number {
  try {
    const n = Number(store()?.getItem(STREAK_KEY) ?? '0');
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  } catch { return 0; }
}

export function writeRepeatStreak(n: number): void {
  try { store()?.setItem(STREAK_KEY, String(n)); } catch { /* ★書けない環境では数えない */ }
}

export function readRepeatPlan(): RepeatPlan | null {
  try {
    const raw = store()?.getItem(PLAN_KEY);
    if (raw === null || raw === undefined) return null;
    const v = JSON.parse(raw) as Partial<RepeatPlan>;
    return typeof v.afterRaceId === 'string' && typeof v.betType === 'string' ? { afterRaceId: v.afterRaceId, betType: v.betType } : null;
  } catch { return null; }
}

export function writeRepeatPlan(plan: RepeatPlan | null): void {
  try {
    if (plan === null) store()?.removeItem(PLAN_KEY);
    else store()?.setItem(PLAN_KEY, JSON.stringify(plan));
  } catch { /* ★書けない環境では予定を置かない */ }
}
