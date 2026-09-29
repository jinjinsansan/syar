/**
 * ★**続けて投票**（★2026-09-29・オーナー「毎回たずねる」・レビュー側の裁定）
 *
 * ★前のレースの投票が確定したら、★**同じ券種・同じ額で このレースにも投票できる**ことを出します。
 * ★馬は ★**本人が選び直します**（★自動では 1 EP も使わない）。
 *
 * 🔴 【★中立にする（★裁定）】
 *   ★当たったときだけ出すと ★追い賭けの誘導になる → ★**確定したら 当たり外れに関係なく 同じ強さで**出す。
 *   → ★この層は ★当たり外れを ★**受け取りません**（`LastBet.settled` は「確定したか」だけ）。
 *   ★回数の上限は ★当たりの連続ではなく ★**続けて投票した回数**。
 *
 * ⚠️ ★PP には触れません（★払戻を次の賭けに回さない・憲法の第 3 原則）。★使うのは参加ポイント（EP）だけ。
 */
import { REPEAT_BET_MAX } from './claims';

/** ★前の投票（★確定したかだけ・★当たり外れは持たない） */
export interface LastBet {
  readonly id: string;
  readonly raceId: string;
  readonly betType: string;
  readonly amount: number;
  readonly settled: boolean;
}

export type RepeatOffer =
  | { readonly kind: 'none' }
  | { readonly kind: 'offer'; readonly betType: string; readonly amount: number }
  | { readonly kind: 'short'; readonly amount: number }
  | { readonly kind: 'limit' };

export function repeatOfferOf(input: {
  readonly last: LastBet | null;
  readonly currentRaceId: string | null;
  readonly salesClosed: boolean;
  readonly epBalance: number;
  /** ★いま続けて投票した回数（★`readRepeatStreak`） */
  readonly streak: number;
  /** ★この画面で出せる券種（★それ以外の券種の続きは出さない） */
  readonly betTypes: readonly string[];
  /** ★この画面の 1 口の額（★前の投票が別の額なら「同じ額」と言えないので出さない） */
  readonly stakeEP: number;
}): RepeatOffer {
  const { last, currentRaceId } = input;
  if (last === null || currentRaceId === null || !last.settled || last.raceId === currentRaceId) return { kind: 'none' };
  if (input.salesClosed || !input.betTypes.includes(last.betType) || last.amount !== input.stakeEP) return { kind: 'none' };
  if (input.streak >= REPEAT_BET_MAX) return { kind: 'limit' };
  if (input.epBalance < last.amount) return { kind: 'short', amount: last.amount };
  return { kind: 'offer', betType: last.betType, amount: last.amount };
}

/**
 * ★続けて投票した回数は ★その端末のその窓だけで数えます（★sessionStorage）。
 * ⚠️ ★これは ★押しやすさの上限で、★お金の上限ではありません（★1 レースの上限は サーバーの `my_bet_allowance`）。
 *    ★読めない・書けない環境では 0 から数えます（★上限が効かない側に倒れるが、★自動で使う EP は無い）。
 */
const STREAK_KEY = 'star.vote.repeatStreak';
/** ★DOM の型に頼らない（★網がこのファイルを Node の型検査で読む） */
interface SessionStore { getItem(key: string): string | null; setItem(key: string, value: string): void }
const store = (): SessionStore | undefined => (globalThis as { sessionStorage?: SessionStore }).sessionStorage;

export function readRepeatStreak(): number {
  try {
    const n = Number(store()?.getItem(STREAK_KEY) ?? '0');
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  } catch { return 0; }
}

/** ★続けて投票で買えたら +1、★自分で選び直して買ったら 0 に戻す */
export function nextRepeatStreak(current: number, viaRepeat: boolean): number {
  return viaRepeat ? current + 1 : 0;
}

export function writeRepeatStreak(n: number): void {
  try { store()?.setItem(STREAK_KEY, String(n)); } catch { /* ★書けない環境では数えない */ }
}
