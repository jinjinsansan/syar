import type React from 'react';
import { BET_TYPE_LABEL, formatDistance, formatOdds, formatRaceTitle, SURFACE_LABEL } from '../../../../lib/format';
import { readClient } from '../../../../lib/supabase';
import { FrameBadge, PageTitle, ReadError, StatusBadge, TabButton } from '../../../../components/ui';
import { Countdown } from '../../../../components/clock';

export const revalidate = 0;

type Row = Record<string, string | number | boolean | null | number[]>;

const TABS: readonly { readonly key: string; readonly label: string; readonly types: readonly string[] }[] = [
  { key: 'win', label: '単勝・複勝', types: ['win', 'place'] },
  { key: 'quinella_place', label: 'ワイド', types: ['quinella_place'] },
  { key: 'quinella', label: '馬連', types: ['quinella'] },
  { key: 'exacta', label: '馬単', types: ['exacta'] },
  { key: 'trio', label: '三連複', types: ['trio'] },
  { key: 'trifecta', label: '三連単', types: ['trifecta'] },
];

/**
 * ★オッズ — 正本 design/hud-ds/components/odds-board（オッズ［アーケード］。明るい筐体風）
 *   単勝・複勝は人気順（オッズ昇順）に支持の目安バーつき。下に馬連の上位組み合わせと「読み方」。他の券種はタブで切替。
 *   ⚠️ オッズの計算はサーバー側（`race_odds_public`）。画面側で式を作らない。**「購入」「投票する」の導線は置かない**（憲法 §0.2）。
 *   ⚠️ 支持率（%）はデータに無いので出さない。バーは「1 番人気を 100% とした相対の目安」（表示だけ）。
 *   ⚠️ 最終更新時刻・自馬の判定・複勝の範囲もデータ（公開ビュー）に無いので出さない（複勝は単一値のまま）。
 */
export default async function OddsPage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ type?: string }>;
}) {
  const { id } = await params;
  const { type } = await searchParams;
  const tab = TABS.find((t) => t.key === type) ?? TABS[0]!;
  const c = readClient();
  const [race, entries, odds] = await Promise.all([
    c.from('races_public').select('*').eq('id', id).single(),
    c.from('race_entries_public').select('*').eq('race_id', id).order('gate'),
    c.from('race_odds_public').select('*').eq('race_id', id).order('odds'),
  ]);
  if (race.error) return <ReadError message={race.error.message} />;
  if (odds.error) return <ReadError message={odds.error.message} />;
  const r = race.data as Row;
  const rows = (entries.data ?? []) as Row[];
  const fieldSize = rows.length;
  const nameOf = new Map(rows.map((e) => [Number(e['gate']), String(e['horse_name'])]));
  const all = (odds.data ?? []) as Row[];
  const byType = (t: string): Row[] => all.filter((o) => o['bet_type'] === t);
  const gradeLabel = formatRaceTitle(Number(r['class_rank']), r['grade'] as string | null);
  const settled = r['status'] === 'settled' || r['status'] === 'closed';

  const win = byType('win');
  const place = new Map(byType('place').map((o) => [Number((o['selection'] as number[])[0]), o]));
  const topWin = win[0] === undefined ? undefined : Number(win[0]['odds']);
  const quinella = byType('quinella').slice(0, 12);
  const comboRows = tab.key === 'win' ? [] : byType(tab.key === 'quinella' ? 'quinella' : tab.key).slice(0, 30);
  const sep = tab.key === 'exacta' || tab.key === 'trifecta' ? '→' : '−';

  // 表示だけ: データに存在する券種のタブだけ出す（薄いタブを置かない）。何も無ければ現在のタブだけ
  const providedTabs = TABS.filter((t) => t.types.some((bt) => all.some((o) => o['bet_type'] === bt)));
  const visibleTabs = providedTabs.length === 0 ? [tab] : providedTabs.some((t) => t.key === tab.key) ? providedTabs : [...providedTabs, tab];

  const condition = `${String(r['name'] ?? gradeLabel)}　${gradeLabel}　${SURFACE_LABEL[String(r['surface'])]} ${formatDistance(Number(r['distance']))}　${fieldSize}頭`;

  const Combo = ({ sel, joiner }: { readonly sel: number[]; readonly joiner: string }) => (
    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      {sel.map((g, i) => (
        <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {i > 0 && <span style={{ fontSize: 13, fontWeight: 900, color: 'var(--a-ink-3)' }}>{joiner}</span>}
          <FrameBadge gate={g} fieldSize={fieldSize} w={32} h={24} font={16} />
        </span>
      ))}
    </span>
  );

  /** 組み合わせ券種の 3 列グリッド（セル h44・オッズ昇順で左→右→下。最有力の 1 通りだけ赤） */
  const ComboGrid = ({ list, joiner, empty }: { readonly list: readonly Row[]; readonly joiner: string; readonly empty: string }) => (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)' }}>
        {list.map((o, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, height: 44, padding: '0 14px', borderTop: '1px solid var(--a-line)', background: i % 2 === 1 ? 'var(--a-panel-2)' : '#fff' }}>
            <Combo sel={o['selection'] as number[]} joiner={joiner} />
            <span className="a-num" style={{ marginLeft: 'auto', fontSize: 24, color: i === 0 ? 'var(--a-num-rank)' : 'var(--a-num-time)' }}>{formatOdds(Number(o['odds']), Boolean(o['capped']))}</span>
          </div>
        ))}
      </div>
      {list.length === 0 && <p style={{ margin: 0, padding: '14px 16px', borderTop: '1px solid var(--a-line)', color: 'var(--a-ink-2)', fontSize: 14, fontWeight: 900 }}>{empty}</p>}
    </>
  );

  const Guide = (): React.ReactElement => (
    <div className="a-panel" style={{ width: 330, flex: '0 0 330px' }}>
      <div style={{ display: 'flex', alignItems: 'center', height: 34, padding: '0 14px', backgroundImage: 'linear-gradient(#fff,#e3ecf3)', borderBottom: '2px solid var(--a-line)' }}>
        <span className="a-lbl">読み方</span>
      </div>
      <div style={{ padding: '12px 14px 14px', display: 'flex', flexDirection: 'column', gap: 9, fontSize: 13, fontWeight: 900, color: 'var(--a-ink-2)', lineHeight: 1.65 }}>
        <span><span style={{ color: 'var(--a-num-rank)' }}>赤の数字</span>は人気 1〜3 位。<span style={{ color: 'var(--a-num-time)' }}>青の数字</span>はそれ以外</span>
        <span>支持の目安バーは 1 番人気を 100% とした相対の長さ。<span style={{ color: 'var(--a-ink)' }}>オッズと同じ順です</span></span>
        <span>並びは人気順（オッズ昇順）。<span style={{ color: 'var(--a-ink)' }}>馬番順ではありません</span></span>
        <span>上限に達したオッズは「（上限）」と表示します</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, margin: '0 14px 14px', padding: '10px 12px', borderRadius: 8, background: '#eaf3fb', border: '2px solid #9fc0dc' }}>
        <span style={{ fontSize: 12, fontWeight: 900, color: 'var(--a-ink)', lineHeight: 1.6 }}>オッズは<span style={{ color: 'var(--a-red-d)' }}>賞金ポイント（PP）の払戻倍率</span>です。参加ポイント（EP）で投票します</span>
      </div>
    </div>
  );

  const headerRight = r['status'] === 'scheduled'
    ? (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, height: 44, padding: '0 18px', borderRadius: 10, backgroundImage: 'var(--a-gloss-red)', border: '2px solid var(--a-red-d)', boxShadow: 'var(--a-shadow-sm)' }}>
        <span style={{ fontSize: 12, fontWeight: 900, letterSpacing: '.1em', color: '#fff' }}>締切まで</span>
        <Countdown untilIso={String(r['scheduled_at'])} after="まもなく発走" size={30} color="#fff" />
      </span>
    )
    : settled
      ? (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, height: 44, padding: '0 18px', borderRadius: 10, backgroundImage: 'linear-gradient(#ffffff,#e6edf4)', border: '2px solid var(--a-edge-soft)', boxShadow: 'var(--a-shadow-sm)' }}>
          <span style={{ fontSize: 12, fontWeight: 900, letterSpacing: '.1em', color: 'var(--a-ink-3)' }}>締切</span>
          <StatusBadge status={String(r['status'])} />
        </span>
      )
      : <StatusBadge status={String(r['status'])} />;

  return (
    <div style={{ padding: '22px 0 40px' }}>
      <PageTitle title={settled ? '確定オッズ' : 'オッズ'} sub={condition} right={headerRight} />

      {/* 券種タブ（データにある券種だけ） */}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, marginTop: 14, flexWrap: 'wrap' }}>
        {visibleTabs.map((t) => (
          <TabButton key={t.key} label={t.label} selected={t.key === tab.key} href={`/races/${id}/odds?type=${t.key}`} />
        ))}
      </div>

      {tab.key === 'win' ? (
        <>
          {/* 単勝・複勝（人気順） */}
          <div className="a-panel strong" style={{ borderRadius: '0 10px 10px 10px', marginTop: -2 }}>
            <div className="a-band" style={{ height: 38, padding: '0 18px', gap: 14 }}>
              <span className="a-lbl" style={{ width: 52, flex: '0 0 52px', color: '#fff' }}>人気</span>
              <span className="a-lbl" style={{ width: 44, flex: '0 0 44px', textAlign: 'center', color: '#fff' }}>枠</span>
              <span className="a-lbl" style={{ flex: '0 0 196px', color: '#fff' }}>馬名</span>
              <span className="a-lbl" style={{ flex: 1, minWidth: 120, color: '#fff' }}>支持の目安</span>
              <span className="a-lbl" style={{ width: 88, flex: '0 0 88px', textAlign: 'right', color: '#fff' }}>単勝</span>
              <span className="a-lbl" style={{ width: 126, flex: '0 0 126px', textAlign: 'right', color: '#fff' }}>複勝</span>
            </div>
            {win.map((o, i) => {
              const gate = Number((o['selection'] as number[])[0]);
              const top3 = i < 3;
              const w = topWin === undefined ? 0 : Math.max(4, Math.round((topWin / Number(o['odds'])) * 100));
              const pl = place.get(gate);
              return (
                <div key={gate} style={{
                  display: 'flex', alignItems: 'center', height: 50, padding: '0 18px', gap: 14, borderTop: '1px solid var(--a-line)',
                  background: i % 2 === 1 ? 'var(--a-panel-2)' : '#fff',
                }}>
                  <span style={{ width: 52, flex: '0 0 52px', display: 'flex', alignItems: 'baseline', gap: 3 }}>
                    <span className="a-num" style={{ fontSize: top3 ? 30 : 24, color: top3 ? 'var(--a-num-rank)' : 'var(--a-num-time)' }}>{i + 1}</span>
                    <span style={{ fontSize: 11, fontWeight: 900, color: 'var(--a-ink-3)' }}>人気</span>
                  </span>
                  <span style={{ width: 44, flex: '0 0 44px', display: 'flex', justifyContent: 'center' }}><FrameBadge gate={gate} fieldSize={fieldSize} w={38} h={28} font={19} /></span>
                  <span style={{ flex: '0 0 196px', display: 'flex', alignItems: 'center', gap: 8, fontSize: 17, fontWeight: 900, color: 'var(--a-ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {nameOf.get(gate) ?? `${gate}番`}
                  </span>
                  <span style={{ flex: 1, minWidth: 120, height: 16, borderRadius: 8, background: '#e3ecf3', border: '2px solid var(--a-edge-soft)', overflow: 'hidden' }}>
                    <span style={{ display: 'block', height: '100%', width: `${w}%`, backgroundImage: top3 ? 'linear-gradient(#f28d84,#d62f26)' : 'linear-gradient(#8fb3d0,#4d7ca8)' }} />
                  </span>
                  <span className="a-num" style={{ width: 88, flex: '0 0 88px', textAlign: 'right', fontSize: top3 ? 32 : 26, color: top3 ? 'var(--a-num-rank)' : 'var(--a-num-time)' }}>
                    {formatOdds(Number(o['odds']), Boolean(o['capped']))}
                  </span>
                  <span className="a-num" style={{ width: 126, flex: '0 0 126px', textAlign: 'right', fontSize: 18, color: 'var(--a-ink-2)' }}>
                    {pl ? formatOdds(Number(pl['odds']), Boolean(pl['capped'])) : '—'}
                  </span>
                </div>
              );
            })}
            {win.length === 0 && <p style={{ margin: 0, padding: '14px 18px', borderTop: '1px solid var(--a-line)', color: 'var(--a-ink-2)', fontSize: 14, fontWeight: 900 }}>オッズ算出中です</p>}
            <div style={{ display: 'flex', alignItems: 'center', gap: 20, height: 42, padding: '0 18px', borderTop: '2px solid var(--a-line)', background: 'var(--a-ivory)', fontSize: 12, fontWeight: 900, color: 'var(--a-ink-2)' }}>
              <span>締切で確定します</span><span>バーは 1 番人気を 100% とした相対の目安</span><span>上限に達したオッズは「（上限）」と表示</span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 16, marginTop: 16, alignItems: 'flex-start' }}>
            {/* 馬連 人気上位の組み合わせ */}
            <div className="a-panel strong" style={{ flex: 1, minWidth: 0 }}>
              <div className="a-band" style={{ height: 38, padding: '0 16px', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 15, fontWeight: 900, letterSpacing: '.1em' }}>馬連（人気上位の組み合わせ）</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 12, fontWeight: 900 }}>
                  <span>{quinella.length} 通りを表示</span>
                  <a href={`/races/${id}/odds?type=quinella`} style={{ color: '#fff' }}>すべて表示 →</a>
                </span>
              </div>
              <ComboGrid list={quinella} joiner="−" empty="オッズ算出中です" />
            </div>
            <Guide />
          </div>
        </>
      ) : (
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
          <div className="a-panel strong" style={{ flex: 1, minWidth: 0, borderRadius: '0 10px 10px 10px', marginTop: -2 }}>
            <div className="a-band" style={{ height: 38, padding: '0 16px', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 15, fontWeight: 900, letterSpacing: '.1em' }}>{BET_TYPE_LABEL[tab.key] ?? tab.label}（人気順）</span>
              <span style={{ fontSize: 12, fontWeight: 900 }}>上位 {comboRows.length} 通りを表示</span>
            </div>
            <ComboGrid list={comboRows} joiner={sep} empty="この券種のオッズはまだ出ていません（オッズ算出中です）" />
            <div style={{ display: 'flex', alignItems: 'center', gap: 20, height: 42, padding: '0 18px', borderTop: '2px solid var(--a-line)', background: 'var(--a-ivory)', fontSize: 12, fontWeight: 900, color: 'var(--a-ink-2)' }}>
              <span>締切で確定します</span><span>オッズ昇順（単勝表と同じ規則）で左→右→下に並びます</span><span>上限に達したオッズは「（上限）」と表示</span>
            </div>
          </div>
          <Guide />
        </div>
      )}
    </div>
  );
}
