/**
 * ★**投票の履歴・投票の控え**（★2026-10-01・デザイナー引き渡し ②・`out/vision/design_handoff_pc_vision_votehistory/README.md` §2）
 *
 * 【★読むもの（★どれも既にある口・★新しい口は作っていません）】
 *   ・★`bets`（★RLS `bets_own` = `user_id = auth.uid()`・`0002`／★`authenticated` に select・`0018`）
 *     ★列: id / race_id / bet_type / selection / amount（★EP）/ odds_at_purchase / status / payout（★PP）/ created_at
 *   ・★`races_public`（★レース名・発走・場・距離・馬場・`cycle_index`）
 *   ・★`race_entries_public`（★馬番 → 馬名・着順。★頭数は行の数）
 *
 * 【★語の決まり（★引き渡し §2-1）】
 *   ★引き渡し §2-1 の禁止語を ★この画面の文に出しません（★外れた控えの札は「確定」）。
 *
 * 【★ポイント（★憲法 2・§9）】
 *   ★使ったのは ★参加ポイント（EP）、★受け取ったのは ★賞金ポイント（PP・`payout`）。
 *   ⚠️ ★**合計・差し引き・的中率を ここで作りません**（★2 つは別のもの・★引き渡し §2-3/§2-4）。
 *   ★返還（`refunded`）は ★EP で全額 戻っています（★`apps/worker/src/payout.ts`・`cancel.ts`）。★PP は 0 です。
 *
 * 【★時刻】
 *   ⚠️ ★`Date.now()` を ここで呼びません（★憲法 4）。★「今月」「今日」の基準は ★呼ぶ側が渡します
 *      （★画面は `components/clock.tsx` の壁時計 1 か所から）。★月と日は ★日本時間で切ります。
 */
import { isOrderedKind } from '@star/betting';
import { bracketOf } from '@star/render';
import { VENUES, slotOfDay } from '@star/scheduler';
import { SURFACE_LABEL } from './format';
import { PAYOUT_KIND_LABEL } from './race-payouts';
import { SignInRequiredError } from './stable-repo';
import { authClient } from './supabase';
import {
  jstMonthStartMs, monthPointsOf, ticketKindOf, voteStateOf,
  type BetStatus, type VoteHistoryData, type VoteItem, type VotePick,
} from './vote-history-view';

/** ★一覧に出す件数（★新しい順） */
export const VOTE_HISTORY_LIST_LIMIT = 100;
/** ★1 回に読む行（★PostgREST の上限 1,000 の内側で ページを送る） */
const PAGE = 1000;

const BET_COLUMNS = 'id, race_id, bet_type, selection, amount, odds_at_purchase, status, payout, created_at';

interface BetRow {
  readonly id: string;
  readonly raceId: string;
  readonly betType: string;
  readonly selection: readonly number[];
  readonly amount: number;
  readonly odds: number;
  readonly status: BetStatus;
  readonly payout: number;
  readonly createdAtMs: number;
}

interface RaceFacts {
  readonly name: string;
  readonly scheduledAtMs: number | null;
  readonly surface: string;
  readonly distance: number;
  readonly courseId: string;
  readonly cycleIndex: number | null;
}

interface EntryFacts { readonly gate: number; readonly horseName: string; readonly finishPos: number | null; }

function toBetRow(r: Record<string, unknown>): BetRow {
  const status = String(r['status']);
  voteStateOf(status);
  const sel = r['selection'];
  if (!Array.isArray(sel) || !sel.every((x) => typeof x === 'number')) throw new Error(`投票の選択が読めません（id=${String(r['id'])}）`);
  return {
    id: String(r['id']),
    raceId: String(r['race_id']),
    betType: String(r['bet_type']),
    selection: sel as number[],
    amount: Number(r['amount']),
    odds: Number(r['odds_at_purchase']),
    status: status as BetStatus,
    payout: Number(r['payout']),
    createdAtMs: Date.parse(String(r['created_at'])),
  };
}

async function requireSession(): Promise<void> {
  const { data } = await authClient().auth.getSession();
  if (data.session === null) throw new SignInRequiredError();
}

/**
 * ★1 回に聞くレースの数（★1 レース 最大 18 頭 × 40 = 720 行 ＜ PostgREST の 1,000 行）。
 *   ⚠️ ★まとめて 100 レースを聞くと ★出走馬が 1,000 行で黙って切れます（★`odds-read.ts` と同じ罠）。
 */
const RACES_PER_QUERY = 40;

/** ★レースと出走馬（★公開の口） */
async function raceFactsOf(raceIds: readonly string[]): Promise<{ races: Map<string, RaceFacts>; entries: Map<string, EntryFacts[]> }> {
  const races = new Map<string, RaceFacts>();
  const entries = new Map<string, EntryFacts[]>();
  const client = authClient();
  const raceRows: Record<string, unknown>[] = [];
  const entryRows: Record<string, unknown>[] = [];
  for (let i = 0; i < raceIds.length; i += RACES_PER_QUERY) {
    const ids = raceIds.slice(i, i + RACES_PER_QUERY);
    const [raceRes, entryRes] = await Promise.all([
      client.from('races_public').select('id, name, scheduled_at, surface, distance, course_id, cycle_index').in('id', ids),
      client.from('race_entries_public').select('race_id, gate, horse_name, finish_pos').in('race_id', ids),
    ]);
    if (raceRes.error !== null) throw new Error(`レースを読めませんでした: ${raceRes.error.message}`);
    if (entryRes.error !== null) throw new Error(`出走馬を読めませんでした: ${entryRes.error.message}`);
    const got = (entryRes.data ?? []) as Record<string, unknown>[];
    // ★上限に当たったら ★黙って欠けた馬名を出さない
    if (got.length >= PAGE) throw new Error('出走馬を読み切れませんでした（行の上限）');
    raceRows.push(...((raceRes.data ?? []) as Record<string, unknown>[]));
    entryRows.push(...got);
  }
  for (const r of raceRows) {
    const at = Date.parse(String(r['scheduled_at']));
    races.set(String(r['id']), {
      name: String(r['name'] ?? ''),
      scheduledAtMs: Number.isFinite(at) ? at : null,
      surface: String(r['surface']),
      distance: Number(r['distance']),
      courseId: String(r['course_id'] ?? ''),
      cycleIndex: typeof r['cycle_index'] === 'number' ? r['cycle_index'] : null,
    });
  }
  for (const e of entryRows) {
    const id = String(e['race_id']);
    const list = entries.get(id) ?? [];
    list.push({ gate: Number(e['gate']), horseName: String(e['horse_name'] ?? ''), finishPos: typeof e['finish_pos'] === 'number' ? e['finish_pos'] : null });
    entries.set(id, list);
  }
  return { races, entries };
}

function toItem(b: BetRow, race: RaceFacts | undefined, field: readonly EntryFacts[]): VoteItem {
  const kind = ticketKindOf(b.betType);
  const fieldSize = field.length;
  const picks = b.selection.map((gate): VotePick => {
    const e = field.find((x) => x.gate === gate);
    return {
      gate,
      frame: fieldSize > 0 && gate >= 1 && gate <= fieldSize ? bracketOf(gate, fieldSize) : null,
      horseName: e?.horseName ?? '',
      finishPos: e?.finishPos ?? null,
    };
  });
  const venue = race === undefined ? null : (VENUES.find((v) => v.id === race.courseId)?.name.replace(/競馬場$/, '') ?? null);
  return {
    betId: b.id,
    raceId: b.raceId,
    createdAtMs: b.createdAtMs,
    status: b.status,
    state: voteStateOf(b.status),
    kindLabel: PAYOUT_KIND_LABEL[kind],
    selectionText: b.selection.join(isOrderedKind(kind) ? '→' : '-'),
    picks,
    amountEP: b.amount,
    payoutPP: b.payout,
    oddsAtPurchase: b.odds,
    raceNo: race?.cycleIndex === null || race === undefined ? '' : `第${slotOfDay(race.cycleIndex) + 1}R`,
    raceName: race?.name ?? '',
    course: race === undefined ? '' : `${SURFACE_LABEL[race.surface] ?? race.surface}${race.distance}m`,
    venue,
    raceScheduledAtMs: race?.scheduledAtMs ?? null,
  };
}

/**
 * ★**投票の履歴**（★新しい順に `VOTE_HISTORY_LIST_LIMIT` 件 ＋ ★今月の 2 つの数）。
 * ⚠️ ★今月の数は ★一覧の件数で切らず ★今月ぶんを全部 読みます（★1 日の上限があるので 月に数千行まで）。
 */
export async function loadVoteHistory(nowMs: number): Promise<VoteHistoryData> {
  await requireSession();
  const client = authClient();
  const listRes = await client.from('bets').select(BET_COLUMNS)
    .order('created_at', { ascending: false }).order('id', { ascending: false })
    .limit(VOTE_HISTORY_LIST_LIMIT + 1);
  if (listRes.error !== null) throw new Error(`投票の履歴を読めませんでした: ${listRes.error.message}`);
  const all = ((listRes.data ?? []) as Record<string, unknown>[]).map(toBetRow);
  const truncated = all.length > VOTE_HISTORY_LIST_LIMIT;
  const rows = all.slice(0, VOTE_HISTORY_LIST_LIMIT);

  /** ★今月ぶん（★ページを送る。★読み切れなかったら投げる＝黙って少なく出さない） */
  const monthRows: { createdAtMs: number; status: string; amountEP: number; payoutPP: number }[] = [];
  const since = new Date(jstMonthStartMs(nowMs)).toISOString();
  for (let from = 0; ; from += PAGE) {
    const res = await client.from('bets').select('id, status, amount, payout, created_at')
      .gte('created_at', since).order('id', { ascending: true }).range(from, from + PAGE - 1);
    if (res.error !== null) throw new Error(`今月の投票を読めませんでした: ${res.error.message}`);
    const page = (res.data ?? []) as Record<string, unknown>[];
    for (const r of page) {
      monthRows.push({ createdAtMs: Date.parse(String(r['created_at'])), status: String(r['status']), amountEP: Number(r['amount']), payoutPP: Number(r['payout']) });
    }
    if (page.length < PAGE) break;
  }

  const { races, entries } = await raceFactsOf([...new Set(rows.map((b) => b.raceId))]);
  return {
    items: rows.map((b) => toItem(b, races.get(b.raceId), entries.get(b.raceId) ?? [])),
    month: monthPointsOf(monthRows, nowMs),
    truncated,
  };
}

/** ★投票の控え 1 枚（★本人のでなければ RLS で 0 行 → null） */
export async function loadVoteTicket(betId: string): Promise<VoteItem | null> {
  if (!/^\d+$/.test(betId)) return null;
  await requireSession();
  const res = await authClient().from('bets').select(BET_COLUMNS).eq('id', betId).limit(1);
  if (res.error !== null) throw new Error(`投票の控えを読めませんでした: ${res.error.message}`);
  const row = ((res.data ?? []) as Record<string, unknown>[])[0];
  if (row === undefined) return null;
  const b = toBetRow(row);
  const { races, entries } = await raceFactsOf([b.raceId]);
  return toItem(b, races.get(b.raceId), entries.get(b.raceId) ?? []);
}
