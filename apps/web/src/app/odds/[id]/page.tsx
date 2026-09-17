/**
 * ★**オッズ（`/odds/[id]`）— 実データ**（★R-14・2026-09-17・引き渡し資料 §8-9）
 *
 * 【★この層の仕事】（★正典 §14.3）
 *   ★**読み取りと整形だけ**です。★計算も判定も持ちません。
 *   ★`races_public`・`race_entries_public`・`race_odds_public` から読みます
 *   （★実体テーブルは revoke 済みで、★anon では読めません）。
 *
 * ⚠️ ★**`/races/[id]/odds`（arcade 版）は生きています。** ★同じ URL を奪っていません。
 * ⚠️ ★見せ方は `components/uma/uma-odds-view.tsx`（client）に渡します
 *    — ★停止スイッチが `useState` を使うためです。
 */
import { readClient } from '../../../lib/supabase';
import { ReadError } from '../../../components/ui';
import { UmaOddsView, type OddsViewRow } from '../../../components/uma/uma-odds-view';

/** ★毎回サーバーで取り直す（★オッズは締切まで変わる） */
export const revalidate = 0;

type Row = Record<string, string | number | boolean | null | number[]>;

export default async function UmaOddsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = readClient();
  const [race, entries, odds] = await Promise.all([
    c.from('races_public').select('*').eq('id', id).single(),
    c.from('race_entries_public').select('*').eq('race_id', id).order('gate'),
    c.from('race_odds_public').select('*').eq('race_id', id),
  ]);
  /** ★読み取りの失敗を黙って空にしない（★「レースが無い」に見えてしまう・R-21） */
  if (race.error) return <ReadError message={race.error.message} />;
  if (entries.error) return <ReadError message={entries.error.message} />;
  if (odds.error) return <ReadError message={odds.error.message} />;

  const r = race.data as Row;
  const entryRows = (entries.data ?? []) as Row[];
  const oddsRows = (odds.data ?? []) as Row[];

  /**
   * ★券種ごとに馬番で引けるようにします。
   * ⚠️ ★**ここで確率やオッズを計算しません**（★サーバーが出した値をそのまま使う・§14.3）。
   */
  const winByGate = new Map<number, Row>();
  const placeByGate = new Map<number, Row>();
  for (const o of oddsRows) {
    const sel = o['selection'];
    if (!Array.isArray(sel) || sel.length === 0) continue;
    const gate = Number(sel[0]);
    if (o['bet_type'] === 'win') winByGate.set(gate, o);
    if (o['bet_type'] === 'place') placeByGate.set(gate, o);
  }

  const rows: OddsViewRow[] = entryRows.map((e) => {
    const gate = Number(e['gate']);
    const win = winByGate.get(gate);
    const place = placeByGate.get(gate);
    /**
     * ★複勝は ★**下限と上限**を出します（★資料 §8-9 の「範囲表記」）。
     * ⚠️ ★いまのオッズ表は 1 つの値しか持たないので、★**同じ値を両端に置きます**
     *    （★幅を画面で作らない。★範囲の出どころができたら、そこから引きます）。
     */
    const placeOdds = place === undefined ? null : Number(place['odds']);
    return {
      gate,
      name: String(e['horse_name'] ?? ''),
      popularity: e['popularity'] === null || e['popularity'] === undefined ? null : Number(e['popularity']),
      win: win === undefined ? null : Number(win['odds']),
      winCapped: win === undefined ? false : Boolean(win['capped']),
      placeLow: placeOdds,
      placeHigh: placeOdds,
    };
  });

  return (
    <UmaOddsView
      race={{
        id: String(r['id']),
        name: r['name'] === null || r['name'] === undefined ? null : String(r['name']),
        grade: r['grade'] === null || r['grade'] === undefined ? null : String(r['grade']),
        classRank: Number(r['class_rank']),
        surface: String(r['surface']),
        distance: Number(r['distance']),
        trackCondition: String(r['track_condition']),
        status: String(r['status']),
      }}
      rows={rows}
    />
  );
}
