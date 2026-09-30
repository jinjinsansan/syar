/**
 * ★**レース後の払戻（100 EP あたり）**（★2026-09-30・デザイナー R-25 D25-4・オーナー「まず単勝・複勝…を見せるべき」）。
 *
 * 【★この層が 決めないこと】
 *   ★① ★払戻を計算しません。★オッズは発走前にサーバーが決めた値（`race_odds_public`）を ★そのまま読みます（★§9.2）。
 *     ★100 EP あたりの払戻 ＝ ★`grossPayout(100, オッズ×10, 1)`（★確定の式と同じ関数・`@star/betting`）。
 *   ★② ★当たった組は ★着順（`finish_pos`・サーバーが決めた値）から ★`winningSelections` で引くだけ。
 * 【★読み方】
 *   ★`race_odds_public` は 1 レースで数千行（★1,000 行で切れる・`odds-read.ts`）。
 *   → ★当たった組だけを ★`selection` の包含（@> と <@・★jsonb なので JSON の文字列で渡す）で読み、★着順どおりの券種は ★並びまで一致する行だけを採る。
 *   ★人気は ★その券種で ★オッズがより低い組の数 ＋ 1（★`count` だけを読む）。
 * ⚠️ ★発売しなかった組（★オッズの行が無い）は ★`payoutPer100: null`（★画面は「発売なし」・★0 と書かない）。
 * ⚠️ ★払戻は ★**PP（賞金ポイント）**で払う（★§3・`settle.ts`）。★買うのは EP。
 */
import { TICKET_KINDS, grossPayout, isOrderedKind, oddsTenthsFromNumber, winningSelections, type TicketKind } from '@star/betting';
import { readClient } from './supabase';

export interface PayoutLine {
  readonly kind: TicketKind;
  /** ★組（★着順どおりの券種は その並び・★他は小さい順） */
  readonly horses: readonly number[];
  readonly ordered: boolean;
  /** ★100 EP あたりの払戻（PP）。★発売しなかった組は null */
  readonly payoutPer100: number | null;
  /** ★人気（★同じオッズは同じ順位）。★発売しなかった組は null */
  readonly popularity: number | null;
}

/** ★画面の並び（★左の列: 単勝・複勝・馬連 ／ ★右の列: ワイド・馬単・3連複・3連単） */
export const PAYOUT_ORDER: readonly TicketKind[] = ['win', 'place', 'quinella', 'quinella_place', 'exacta', 'trio', 'trifecta'];

export const PAYOUT_KIND_LABEL: Readonly<Record<TicketKind, string>> = {
  win: '単勝', place: '複勝', quinella: '馬連', quinella_place: 'ワイド', exacta: '馬単', trio: '3連複', trifecta: '3連単',
};

export async function loadRacePayouts(raceId: string, order: readonly number[], fieldSize: number): Promise<readonly PayoutLine[]> {
  if (order.length < 3) throw new Error(`着順が 3 着まで揃っていません（${order.length} 頭）`);
  if (TICKET_KINDS.length !== PAYOUT_ORDER.length) throw new Error('★券種が増えた: 払戻の並び（PAYOUT_ORDER）を直してください');
  const read = readClient();
  const lines = PAYOUT_ORDER.flatMap((kind) => winningSelections(kind, order, fieldSize).map((horses) => ({ kind, horses })));
  return Promise.all(lines.map(async ({ kind, horses }): Promise<PayoutLine> => {
    const res = await read.from('race_odds_public').select('selection, odds')
      .eq('race_id', raceId).eq('bet_type', kind)
      .contains('selection', JSON.stringify(horses)).containedBy('selection', JSON.stringify(horses));
    if (res.error !== null) throw new Error(`払戻のオッズを読めませんでした（${kind}）: ${res.error.message}`);
    const hit = ((res.data ?? []) as { selection: unknown; odds: unknown }[]).find((r) => {
      const sel = Array.isArray(r.selection) ? (r.selection as unknown[]).map(Number) : [];
      return sel.length === horses.length && sel.every((g, i) => g === horses[i]);
    });
    const ordered = isOrderedKind(kind);
    if (hit === undefined) return { kind, horses, ordered, payoutPer100: null, popularity: null };
    const odds = Number(hit.odds);
    const cheaper = await read.from('race_odds_public').select('odds', { count: 'exact', head: true })
      .eq('race_id', raceId).eq('bet_type', kind).lt('odds', odds);
    if (cheaper.error !== null || cheaper.count === null) throw new Error(`人気を数えられませんでした（${kind}）`);
    return { kind, horses, ordered, payoutPer100: grossPayout(100, oddsTenthsFromNumber(odds), 1), popularity: cheaper.count + 1 };
  }));
}
