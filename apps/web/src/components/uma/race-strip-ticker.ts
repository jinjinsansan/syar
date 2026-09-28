/**
 * ★**帯の掲示板の札**（★2026-09-28・オーナー指示「レースがない時間は ★出走馬の名前・オッズ・発走 N 分前を流す」
 *   → オーナー選択 A＋C「流れて止まる・盛り上げ」→ ★デザイナー回答 R-20「着順掲示板の見た目・札の頭に見出し」）
 *
 * 【★中身の決まり（★レビュー側への照会 `QUESTIONS_STRIP_TICKER_20260928.md` の暫定の既定・デザイナー R-20 が追認）】
 *   ★① 受付中は ★馬名を出さない（★途中の顔ぶれを「この馬が出る」と読ませない）
 *   ★② オッズは ★締切の後だけ（★それまでデータが無い・`pg-store.ts` が `closed → scheduled` で書く）・★**馬番順**（★人気順にしない）
 *   ★③ 「あと N 分」は ★切り上げ・★1 分未満は「まもなく発走」（★残り秒）・★発走の後は「結果を待っています」
 *
 * 【★R-20 の札の形】 ★［見出し］＋ 本文（★馬番の札・文・★強調する数字＋単位・★札）。
 *   ★見出しは ★動かさず 語だけ入れ替え、★本文だけを流す（★帯の `StripBoard`）。
 *
 * 【★この層が守ること】
 *   ★純関数（★時刻は引数・憲法 4）。★時計の文字は ★帯の `clock` を渡してもらう（★時計を 2 つ持たない）。
 *   ★枠は ★`bracketOf`（`@star/render`・★唯一の出どころ）。★「中継」「購入」「買う」を使わない（★網 `user-visible-words`）。
 */
import { bracketOf } from '@star/render';

export interface TickerRace {
  readonly name: string;
  readonly surface: string;
  readonly distance: number;
  readonly scheduled_at: string;
  readonly status: string;
  readonly entry_deadline_at: string | null;
}

export interface TickerRunner {
  readonly gate: number;
  readonly name: string;
  /** ★単勝（★締切の前は `null`） */
  readonly winOdds: number | null;
  readonly capped: boolean;
}

/** ★締切の後（★出走表とオッズがそろう段） */
export function tickerShowsField(status: string): boolean {
  return status === 'closed' || status === 'scheduled';
}

/** ★発走までの文（★切り上げ・★1 分未満は「まもなく」・★過ぎたら結果待ち）。★読み上げの文にも使う */
export function tickerCountdown(scheduledAt: string, nowMs: number, clock: (iso: string) => string): string {
  const at = new Date(scheduledAt).getTime();
  if (!Number.isFinite(at)) return '発走時刻を読み込み中';
  const left = at - nowMs;
  if (left <= 0) return '発走しました・結果を待っています';
  if (left < 60_000) return `まもなく発走（${clock(scheduledAt)}）`;
  return `発走まで あと ${Math.ceil(left / 60_000)} 分（${clock(scheduledAt)}）`;
}

/**
 * ★**掲示板の 1 枚**（★R-20）。
 *   ★`kind` 見出し ／ ★`bracket` 枠（1〜8・★馬番の札の色）と ★`no` 馬番 ／ ★`text` 文 ／ ★`num` 強調する数字 ＋ ★`tail` 単位
 *   ★`tone`: ★`hot` ＝ 発走 1 分前（★見出しだけ金でゆっくり明暗）・★`alert` ＝ 締切 1 分前（★見出しを橙・動きなし）
 *   ★`badge`: ★単勝の最も低い 1 頭に「1番人気」・★単勝 `LONGSHOT_ODDS` 倍以上に「大穴」（★締切の後だけ・★オッズが在る馬だけ）
 */
export interface BoardItem {
  readonly kind: string;
  readonly bracket: number | null;
  readonly no: number | null;
  readonly text: string | null;
  readonly num: string | null;
  readonly tail: string | null;
  readonly tone: 'plain' | 'hot' | 'alert';
  readonly badge: '1番人気' | '大穴' | null;
}

/** ★「大穴」の札を付ける単勝（倍）。★暫定（★デザイナー R-20 は形だけ決めた・値はレビュー側） */
export const LONGSHOT_ODDS = 50;

/** ★1 枚の秒（★R-20 Q4: 入る 0.32 秒 ＋ 止まる 2.36 秒 ＋ 抜ける 0.32 秒） */
export const BOARD_ITEM_SEC = 3;

const card = (kind: string, rest: Partial<Omit<BoardItem, 'kind'>> = {}): BoardItem => ({
  kind, bracket: null, no: null, text: null, num: null, tail: null, tone: 'plain', badge: null, ...rest,
});

/** ★レース名 ・ 馬場距離（★R-20 の表「R12291 ・ 芝1600m」） */
export function raceLine(race: Pick<TickerRace, 'name' | 'surface' | 'distance'>): string {
  const surface = race.surface === 'turf' ? '芝' : race.surface === 'dirt' ? 'ダート' : race.surface;
  return `${race.name} ・ ${surface}${race.distance}m`;
}

/** ★残り秒を「0:48」の形に（★1 分未満の札だけ） */
function secondsLeft(ms: number): string {
  return `0:${String(Math.max(0, Math.ceil(ms / 1000))).padStart(2, '0')}`;
}

/** ★馬番 → 枠（★頭数が分からない・欠けているときは ★枠の色を付けない） */
export function bracketOrNull(gate: number, fieldSize: number): number | null {
  try { return bracketOf(gate, fieldSize); } catch { return null; }
}

export function tickerBoard(
  race: TickerRace, runners: readonly TickerRunner[], nowMs: number, clock: (iso: string) => string,
): readonly BoardItem[] {
  const items: BoardItem[] = [card('次のレース', { text: raceLine(race) })];
  const at = new Date(race.scheduled_at).getTime();
  const postLeft = at - nowMs;
  if (!Number.isFinite(at)) items.push(card('発走', { text: '発走時刻を読み込み中' }));
  else if (postLeft <= 0) items.push(card('発走', { text: '発走しました・結果を待っています' }));
  else if (postLeft < 60_000) items.push(card('まもなく発走', { tone: 'hot', text: race.name, num: secondsLeft(postLeft) }));
  else items.push(card('発走', { text: 'あと', num: String(Math.ceil(postLeft / 60_000)), tail: `分（${clock(race.scheduled_at)}）` }));

  if (!tickerShowsField(race.status)) {
    if (race.entry_deadline_at === null) { items.push(card('締切', { text: '出走登録受付中' })); return items; }
    const closeLeft = new Date(race.entry_deadline_at).getTime() - nowMs;
    items.push(closeLeft > 0 && closeLeft <= 60_000
      ? card('締切', { tone: 'alert', text: '出走登録の締切まで', num: secondsLeft(closeLeft) })
      : card('締切', { text: '出走登録', num: clock(race.entry_deadline_at) }));
    return items;
  }
  const byGate = [...runners].sort((a, b) => a.gate - b.gate);
  if (byGate.length === 0) return items;
  items.push(card('出走', { num: String(byGate.length), tail: '頭' }));
  const field = Math.max(byGate.length, byGate[byGate.length - 1]!.gate);
  const priced = byGate.filter((r) => r.winOdds !== null);
  /** ★1番人気は ★1 頭だけ（★同じ倍率なら 馬番の小さいほう） */
  const favGate = priced.length === 0 ? null
    : priced.reduce((best, r) => ((r.winOdds as number) < (best.winOdds as number) ? r : best)).gate;
  for (const r of byGate) {
    const badge = r.gate === favGate ? '1番人気' : r.winOdds !== null && r.winOdds >= LONGSHOT_ODDS ? '大穴' : null;
    items.push(card('単勝', {
      bracket: bracketOrNull(r.gate, field), no: r.gate, text: r.name,
      /** ★上限なら「157.7 倍（上限）」（★§9.4・`formatOdds` と同じ桁） */
      ...(r.winOdds === null ? {} : { num: r.winOdds.toFixed(1), tail: r.capped ? '倍（上限）' : '倍' }),
      badge,
    }));
  }
  return items;
}

/** ★1 枚を ★1 本の文に（★読み上げ・★網の対照）。★見出しを頭に置く */
export function boardText(b: BoardItem): string {
  return [b.kind, b.no === null ? null : `${b.no}番`, b.text, b.num === null ? null : `${b.num}${b.tail ?? ''}`,
    b.num === null ? b.tail : null, b.badge].filter((s): s is string => s !== null && s !== '').join(' ');
}

/**
 * ★**流す項目の文だけ**（★読み上げ・★網の対照）。★掲示板の 1 枚 1 枚と ★同じ中身。
 *   ★受付中: ★レース・発走まで・締切（★馬名なし）
 *   ★締切後: ★レース・発走まで・★各馬（★馬番順・★単勝）
 */
export function tickerItems(
  race: TickerRace, runners: readonly TickerRunner[], nowMs: number, clock: (iso: string) => string,
): readonly string[] {
  return tickerBoard(race, runners, nowMs, clock).map(boardText);
}
