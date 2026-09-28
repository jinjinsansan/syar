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
 * ★**流す項目**（★順に並べ、★帯は ` ／ ` でつないで繰り返し流す）。
 *   ★受付中: ★レース・発走まで・締切（★馬名なし）
 *   ★締切後: ★レース・発走まで・★各馬（★馬番順・★単勝）
 */
export function tickerItems(
  race: TickerRace, runners: readonly TickerRunner[], nowMs: number, clock: (iso: string) => string,
): readonly string[] {
  const surface = race.surface === 'turf' ? '芝' : race.surface === 'dirt' ? 'ダート' : race.surface;
  const items = [`次のレース ${race.name}・${surface}${race.distance}m`, tickerCountdown(race.scheduled_at, nowMs, clock)];
  if (!tickerShowsField(race.status)) {
    items.push(race.entry_deadline_at === null ? '出走登録受付中' : `出走登録受付中・締切 ${clock(race.entry_deadline_at)}`);
    return items;
  }
  const byGate = [...runners].sort((a, b) => a.gate - b.gate);
  if (byGate.length === 0) return items;
  items.push(`出走 ${byGate.length} 頭`);
  for (const r of byGate) {
    /** ★「倍」は数の直後（★上限なら「12.0倍（上限）」） */
    items.push(r.winOdds === null ? `${r.gate}番 ${r.name}`
      : `${r.gate}番 ${r.name} 単勝 ${formatOdds(r.winOdds, r.capped).replace(/^(\d+(?:\.\d+)?)/, '$1倍')}`);
  }
  return items;
}
