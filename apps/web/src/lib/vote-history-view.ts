/**
 * ★**投票の履歴・投票の控え — 画面の形と純関数**（★2026-10-01・デザイナー引き渡し ②）
 *
 * ★DB に触りません（★読むのは `vote-history.ts`）。★網 `apps/cli/test/vote-history.test.ts` がここを叩きます。
 * ⚠️ ★`Date.now()` を呼びません（★憲法 4）。★「今日」「今月」の基準は ★呼ぶ側が渡します。
 * ⚠️ ★合計・差し引き・的中率を作りません（★EP と PP は別のもの・★引き渡し §2-3/§2-4）。
 */
import type { TicketKind } from '@star/betting';
import { BET_PER_PICK_EP } from './claims';
import { PAYOUT_KIND_LABEL } from './race-payouts';

// ───────────────────────────── ★純関数（★網 `apps/cli/test/vote-history.test.ts`） ─────────────────────────────

/** ★`bets.status` の 4 つ（★`bets_status_known`・`0001`） */
export type BetStatus = 'pending' | 'won' | 'lost' | 'refunded';
/** ★画面の 4 つの札（★引き渡し §2-1） */
export type VoteState = 'wait' | 'hit' | 'settled' | 'void';

export function voteStateOf(status: string): VoteState {
  switch (status) {
    case 'pending': return 'wait';
    case 'won': return 'hit';
    case 'lost': return 'settled';
    case 'refunded': return 'void';
    // ★知らない状態を ★黙って「確定」にしない（★客の控えを勝手に読み替えない）
    default: throw new Error(`投票の状態が不明です: ${status}`);
  }
}

/** ★札の文字（★色だけで伝えない・★外れた控えも「確定」・§2-1） */
export const VOTE_STATE_LABEL: Readonly<Record<VoteState, string>> = {
  wait: '結果待ち', hit: '確定 ・ 的中', settled: '確定', void: '返還',
};
/** ★札の地と字（★引き渡し §2-1 の表） */
export const VOTE_STATE_COLORS: Readonly<Record<VoteState, { readonly bg: string; readonly ink: string }>> = {
  wait: { bg: '#e8eef3', ink: '#25384a' },
  hit: { bg: '#e4efe7', ink: '#1e7a3a' },
  settled: { bg: '#eef2f6', ink: '#4a5a66' },
  void: { bg: '#f6e7cf', ink: '#6b4506' },
};

/** ★DB の `bet_type` → 券種（★DB は 'wide'、コードは 'quinella_place'・`apps/worker/src/payout.ts` と同じ対応） */
const BET_TYPE_TO_KIND: Readonly<Record<string, TicketKind>> = {
  win: 'win', place: 'place', wide: 'quinella_place', quinella: 'quinella', exacta: 'exacta', trio: 'trio', trifecta: 'trifecta',
};

export function ticketKindOf(betType: string): TicketKind {
  const kind = BET_TYPE_TO_KIND[betType];
  if (kind === undefined) throw new Error(`券種が不明です: ${betType}`);
  return kind;
}

/** ★券種名（★`race-payouts.ts` の表 1 か所を使う・D-052） */
export function ticketKindLabel(betType: string): string {
  return PAYOUT_KIND_LABEL[ticketKindOf(betType)];
}

/** ★日本時間の時差（★表示の切り方だけ。★サーバーの TZ にも端末の TZ にも依存させない） */
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const WEEKDAY = ['日', '月', '火', '水', '木', '金', '土'] as const;
const pad2 = (n: number): string => String(n).padStart(2, '0');

function jst(ms: number): Date { return new Date(ms + JST_OFFSET_MS); }

/** ★日本時間の「年-月」（例 `2026-10`） */
export function jstMonthKey(ms: number): string {
  const d = jst(ms);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}`;
}
/** ★日本時間の「年-月-日」 */
export function jstDayKey(ms: number): string {
  const d = jst(ms);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}
/** ★日本時間のその月の 1 日 0:00（★UTC の ms） */
export function jstMonthStartMs(ms: number): number {
  const d = jst(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) - JST_OFFSET_MS;
}
/** ★「10/01（木）」（★今日なら頭に「今日」） */
export function jstDayHeading(ms: number, nowMs: number): string {
  const d = jst(ms);
  const body = `${pad2(d.getUTCMonth() + 1)}/${pad2(d.getUTCDate())}（${WEEKDAY[d.getUTCDay()]!}）`;
  return jstDayKey(ms) === jstDayKey(nowMs) ? `今日 ${body}` : body;
}
/** ★「14:09」 */
export function jstClock(ms: number): string {
  const d = jst(ms);
  return `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
}
/** ★「10/01 14:09:42」 */
export function jstStamp(ms: number): string {
  const d = jst(ms);
  return `${pad2(d.getUTCMonth() + 1)}/${pad2(d.getUTCDate())} ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())}`;
}

/** ★今月の 2 つの数（★合算しない・★差し引きを作らない） */
export interface MonthPoints {
  /** ★今月 投票に使った参加ポイント（★返還は 戻っているので数えない） */
  readonly usedEP: number;
  /** ★今月 受け取った賞金ポイント（★`payout`・的中だけが 0 でない） */
  readonly receivedPP: number;
}

/** ★月は ★投票を受け付けた時刻（`created_at`）の日本時間で切ります */
export function monthPointsOf(
  bets: readonly { readonly createdAtMs: number; readonly status: string; readonly amountEP: number; readonly payoutPP: number }[],
  nowMs: number,
): MonthPoints {
  const month = jstMonthKey(nowMs);
  let usedEP = 0;
  let receivedPP = 0;
  for (const b of bets) {
    if (jstMonthKey(b.createdAtMs) !== month) continue;
    if (b.status !== 'refunded') usedEP += b.amountEP;
    receivedPP += b.payoutPP;
  }
  return { usedEP, receivedPP };
}

/**
 * ★**受付番号**（★引き渡し §2-6 ②「無ければ投票の ID を 4 桁ずつ区切って出す」）。
 *   ★専用の受付番号の列は ★無い（★`bets` は `id bigserial` だけ）ので ★`id` を出します。
 *   ★12 桁に満たなければ ★頭を 0 で埋め、★4 桁ごとに「-」（例 `12345` → `0000-0001-2345`）。
 */
export function receiptNoOf(betId: string): string {
  if (!/^\d+$/.test(betId)) throw new Error(`投票の番号が不正です: ${betId}`);
  const width = Math.max(12, Math.ceil(betId.length / 4) * 4);
  const padded = betId.padStart(width, '0');
  return padded.match(/.{4}/g)!.join('-');
}

// ───────────────────────────── ★画面の形 ─────────────────────────────

/** ★選んだ馬 1 頭 */
export interface VotePick {
  readonly gate: number;
  /** ★枠（1〜8）。★頭数が分からなければ null（★色を推測しない） */
  readonly frame: number | null;
  readonly horseName: string;
  /** ★着順（★確定前は null） */
  readonly finishPos: number | null;
}

export interface VoteItem {
  /** ★`bets.id`（★文字列で持つ・bigserial） */
  readonly betId: string;
  readonly raceId: string;
  readonly createdAtMs: number;
  readonly status: BetStatus;
  readonly state: VoteState;
  readonly kindLabel: string;
  /** ★「7」／「1-5」／「1→5」（★順序のある券種は →） */
  readonly selectionText: string;
  readonly picks: readonly VotePick[];
  readonly amountEP: number;
  readonly payoutPP: number;
  readonly oddsAtPurchase: number;
  /** ★「第12R」（★R 番号は `slotOfDay()` が唯一の出どころ・EF-5） */
  readonly raceNo: string;
  readonly raceName: string;
  /** ★「芝1600m」 */
  readonly course: string;
  /** ★場の短い名（★`@star/scheduler` の `VENUES`）。★分からなければ null */
  readonly venue: string | null;
  readonly raceScheduledAtMs: number | null;
}

export interface VoteHistoryData {
  readonly items: readonly VoteItem[];
  readonly month: MonthPoints;
  /** ★一覧を ★上限で切ったか（★切ったなら画面で そう言う） */
  readonly truncated: boolean;
}

/** ★EP の内訳（★「1 口 × 100 EP」。★1 口の額は claims.ts の 1 か所） */
export function stakeBreakdownOf(amountEP: number): string {
  if (amountEP % BET_PER_PICK_EP !== 0) return `${amountEP.toLocaleString('ja-JP')} EP`;
  return `${(amountEP / BET_PER_PICK_EP).toLocaleString('ja-JP')} 口 × ${BET_PER_PICK_EP.toLocaleString('ja-JP')} EP`;
}
