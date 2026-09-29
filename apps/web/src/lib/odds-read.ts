/**
 * ★**オッズを読む 1 か所**（★2026-09-29・レビュー側）
 *
 * 【🔴 ★なぜ】
 *   ★`race_odds_public` は 1 レースで ★数千行（★15 頭で 3,635 行）。★読む口（PostgREST）は ★既定で 1,000 行で切る。
 *   ★券種で絞らずに読むと ★**単勝の行が 1 行も来ない**ことがある（★本番 R12423・13 頭で /odds の単勝が全部「—」）。
 *   ★しかも ★黙って欠ける ＝ ★「オッズが無い」と「読めていない」が ★画面で同じ顔になる。
 *
 * 【★決まり】
 *   ① ★画面が要る券種だけを読む（`betTypes`・★空は受けない）。
 *   ② ★行の総数（`count: 'exact'`）と ★届いた行数を比べ、★足りなければ ★投げる（★読み切れていないと言う・★黙って欠かさない）。
 *   ★網 `odds-read.test.ts`: ★`race_odds_public` を券種で絞らずに読む所が 0 件。
 */
import { readClient } from './supabase';

export interface OddsReadRow {
  readonly bet_type: string;
  readonly selection: unknown;
  readonly odds: number;
  readonly capped: boolean;
}

export class OddsIncompleteError extends Error {}

/** ★届いた行数と 総数から ★読み切れたかを言う（★総数が分からなければ 読み切れていない扱い） */
export function oddsReadComplete(received: number, total: number | null): boolean {
  return total !== null && received >= total;
}

export async function readRaceOdds(raceId: string, betTypes: readonly string[]): Promise<readonly OddsReadRow[]> {
  if (betTypes.length === 0) throw new Error('★券種を 1 つ以上 渡してください（★絞らずに読むと 1,000 行で切れる）');
  const res = await readClient().from('race_odds_public')
    .select('bet_type, selection, odds, capped', { count: 'exact' })
    .eq('race_id', raceId).in('bet_type', [...betTypes]);
  if (res.error !== null) throw new Error(`race_odds_public を読めませんでした: ${res.error.message}`);
  const rows = (res.data ?? []) as OddsReadRow[];
  if (!oddsReadComplete(rows.length, res.count)) {
    throw new OddsIncompleteError(`オッズを読み切れていません（${rows.length} 行／全 ${res.count ?? '？'} 行・券種 ${betTypes.join('・')}）`);
  }
  return rows;
}
