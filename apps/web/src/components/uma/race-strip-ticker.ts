/**
 * ★**帯の「流れる 1 行」**（★2026-09-28・オーナー指示「レースがない時間は ★出走馬の名前・オッズ・発走 N 分前を ★1 行で流す」）
 *
 * 【⚠️ ★中身は暫定】
 *   ★オーナーは「レビュー側と相談して決めて」と言い、★その後「進めてください」と指示しました。
 *   ★レビュー側のセッションが居なかったので ★照会 `QUESTIONS_STRIP_TICKER_20260928.md` を出し、★**控えめな既定**で作っています:
 *   ★① 受付中は ★馬名を流さない（★途中の顔ぶれを「この馬が出る」と読ませない）
 *   ★② オッズは ★締切の後だけ（★それまでデータが無い・`pg-store.ts` が `closed → scheduled` で書く）・★**馬番順**（★人気順にしない）
 *   ★③ 「あと N 分」は ★切り上げ・★1 分未満は「まもなく発走」・★発走の後は「結果を待っています」
 *
 * 【★この層が守ること】
 *   ★純関数（★時刻は引数・憲法 4）。★時計の文字は ★帯の `clock` を渡してもらう（★時計を 2 つ持たない）。
 *   ★オッズの字は ★`formatOdds`（★上限の明示・§9.4）。★「中継」「購入」「買う」を使わない（★網 `user-visible-words`）。
 */
import { formatOdds } from '../../lib/format';

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

/** ★発走までの文（★切り上げ・★1 分未満は「まもなく」・★過ぎたら結果待ち） */
export function tickerCountdown(scheduledAt: string, nowMs: number, clock: (iso: string) => string): string {
  const at = new Date(scheduledAt).getTime();
  if (!Number.isFinite(at)) return '発走時刻を読み込み中';
  const left = at - nowMs;
  if (left <= 0) return '発走しました・結果を待っています';
  if (left < 60_000) return `まもなく発走（${clock(scheduledAt)}）`;
  return `発走まで あと ${Math.ceil(left / 60_000)} 分（${clock(scheduledAt)}）`;
}

/**
 * ★**電光掲示板の 1 枚**（★2026-09-28・オーナー選択 A＋C＋D「流れて止まる・盛り上げ・電光掲示板の見た目」）。
 *   ★`tone`: ★`hot` ＝ 発走 1 分前（★金で点滅）・★`alert` ＝ 締切 1 分前（★赤）・★`plain`。
 *   ★`badge`: ★単勝の最も低い馬に「1番人気」・★単勝 `LONGSHOT_ODDS` 倍以上に「大穴」（★締切の後だけ・★オッズが在る馬だけ）。
 */
export interface BoardItem {
  readonly text: string;
  readonly tone: 'plain' | 'hot' | 'alert';
  readonly badge: '1番人気' | '大穴' | null;
}

/** ★「大穴」の札を付ける単勝（倍）。★暫定（★デザイナー・レビュー側で変える） */
export const LONGSHOT_ODDS = 50;

export function tickerBoard(
  race: TickerRace, runners: readonly TickerRunner[], nowMs: number, clock: (iso: string) => string,
): readonly BoardItem[] {
  const plain = (text: string): BoardItem => ({ text, tone: 'plain', badge: null });
  const surface = race.surface === 'turf' ? '芝' : race.surface === 'dirt' ? 'ダート' : race.surface;
  const postLeft = new Date(race.scheduled_at).getTime() - nowMs;
  const items: BoardItem[] = [
    plain(`次のレース ${race.name}・${surface}${race.distance}m`),
    { text: tickerCountdown(race.scheduled_at, nowMs, clock), tone: postLeft > 0 && postLeft < 60_000 ? 'hot' : 'plain', badge: null },
  ];
  if (!tickerShowsField(race.status)) {
    if (race.entry_deadline_at === null) { items.push(plain('出走登録受付中')); return items; }
    const closeLeft = new Date(race.entry_deadline_at).getTime() - nowMs;
    items.push(closeLeft > 0 && closeLeft <= 60_000
      ? { text: `出走登録受付中・まもなく締切（${clock(race.entry_deadline_at)}）`, tone: 'alert', badge: null }
      : plain(`出走登録受付中・締切 ${clock(race.entry_deadline_at)}`));
    return items;
  }
  const byGate = [...runners].sort((a, b) => a.gate - b.gate);
  if (byGate.length === 0) return items;
  items.push(plain(`出走 ${byGate.length} 頭`));
  const priced = byGate.filter((r) => r.winOdds !== null);
  /** ★1番人気は ★1 頭だけ（★同じ倍率なら 馬番の小さいほう） */
  const favGate = priced.length === 0 ? null
    : priced.reduce((best, r) => ((r.winOdds as number) < (best.winOdds as number) ? r : best)).gate;
  for (const r of byGate) {
    /** ★「倍」は数の直後（★上限なら「12.0倍（上限）」） */
    const text = r.winOdds === null ? `${r.gate}番 ${r.name}`
      : `${r.gate}番 ${r.name} 単勝 ${formatOdds(r.winOdds, r.capped).replace(/^(\d+(?:\.\d+)?)/, '$1倍')}`;
    const badge = r.gate === favGate ? '1番人気' : r.winOdds !== null && r.winOdds >= LONGSHOT_ODDS ? '大穴' : null;
    items.push({ text, tone: 'plain', badge });
  }
  return items;
}

/**
 * ★**流す項目の文だけ**（★読み上げ・★網の対照）。★電光掲示板の 1 枚 1 枚と ★同じ文。
 *   ★受付中: ★レース・発走まで・締切（★馬名なし）
 *   ★締切後: ★レース・発走まで・★各馬（★馬番順・★単勝）
 */
export function tickerItems(
  race: TickerRace, runners: readonly TickerRunner[], nowMs: number, clock: (iso: string) => string,
): readonly string[] {
  return tickerBoard(race, runners, nowMs, clock).map((b) => b.text);
}

/** ★1 枚の秒（★右から滑り込む 0.35 秒 ＋ 止まる 2.2 秒 ＋ 左へ抜ける 0.35 秒） */
export const BOARD_ITEM_SEC = 2.9;
