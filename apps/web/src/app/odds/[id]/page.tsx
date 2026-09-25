/**
 * ★**オッズ（`/odds/[id]`）— 実データ**（★R-14・2026-09-17・引き渡し資料 §8-9）
 *
 * 【★この層の仕事】（★正典 §14.3）
 *   ★**読み取りと整形だけ**です。★計算も判定も持ちません。
 *   ★`races_public`・`race_entries_public`・`race_odds_public` から読みます
 *   （★実体テーブルは revoke 済みで、★anon では読めません）。
 *
 * ✅ ★**2026-09-25: ★`/races/[id]/odds`（arcade 版）は消して、ここへ転送しました**
 *    （★裁定 `REVIEW_DISCOVERY_AXES_20260925.md` §6 の手順。★同じ役割の画面を 2 つ残さない）。
 *    ★転送は `next.config.mjs` の `SUPERSEDED_SCREENS`（★`/races/:id/odds` → `/odds/:id`）。
 * ⚠️ ★見せ方は `components/uma/uma-odds-view.tsx`（client）に渡します
 *    — ★停止スイッチが `useState` を使うためです。
 */
import { readClient } from '../../../lib/supabase';
import { ReadError } from '../../../components/ui';
import { UmaOddsView, type OddsViewRow } from '../../../components/uma/uma-odds-view';
import { DEMO_ODDS_RACE, demoOddsRows } from '../../../lib/odds-demo';

/** ★毎回サーバーで取り直す（★オッズは締切まで変わる） */
export const revalidate = 0;

type Row = Record<string, string | number | boolean | null | number[]>;

export default async function UmaOddsPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  /**
   * ★**見た目を確かめるための見本**（★2026-09-17・オーナー指示
   *   ★「★ログイン認証なしで開発サーバーで見れるようにしてください」）。
   *
   * ⚠️ ★`?demo=1` のときだけです。★実データの経路には ★**1 行も混ざりません**
   *    （★ここで打ち切るので、★下の読み取りは走りません）。
   * ⚠️ ★見本でも ★**画面でオッズを計算しません**（★書かれた数字をそのまま出す・§14.3）。
   */
  const sp = await searchParams;
  if (sp['demo'] === '1') {
    const rows: OddsViewRow[] = demoOddsRows().map((r) => ({
      gate: r.gate, name: r.name, popularity: r.popularity,
      win: r.win, winCapped: false, placeLow: r.placeLow, placeHigh: r.placeHigh,
    }));
    return <UmaOddsView race={{ ...DEMO_ODDS_RACE, id }} rows={rows} />;
  }

  const c = readClient();
  const [race, entries, odds] = await Promise.all([
    c.from('races_public').select('*').eq('id', id).single(),
    c.from('race_entries_public').select('*').eq('race_id', id).order('gate'),
    c.from('race_odds_public').select('*').eq('race_id', id),
  ]);
  /** ★読み取りの失敗を黙って空にしない（★「レースが無い」に見えてしまう・R-21） */
  /**
   * ⚠️ ★`theme="uma"` を渡します（★2026-09-17）。★渡さないと ★**裸の 1 行**になり、
   *    ★アーケードの共通帯の中に出て、★デザイナーの画面が丸ごと消えます
   *    （★配信されている HTML で確認: `data-theme="uma"` が **0 回**でした）。
   */
  if (race.error) return <ReadError message={race.error.message} theme="uma" />;
  if (entries.error) return <ReadError message={entries.error.message} theme="uma" />;
  if (odds.error) return <ReadError message={odds.error.message} theme="uma" />;

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
