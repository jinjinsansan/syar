import { BET_TYPE_LABEL, formatDistance, formatOdds, formatRaceTitle, SURFACE_LABEL } from '../../../../lib/format';
import { readClient } from '../../../../lib/supabase';
import { EdgePanel, FrameBadge, ReadError, StatusBadge } from '../../../../components/ui';
import { Countdown } from '../../../../components/clock';

export const revalidate = 0;

type Row = Record<string, string | number | boolean | null | number[]>;

const TABS: readonly { readonly key: string; readonly label: string; readonly types: readonly string[] }[] = [
  { key: 'win', label: '単勝・複勝', types: ['win', 'place'] },
  { key: 'quinella', label: '馬連', types: ['quinella'] },
  { key: 'exacta', label: '馬単', types: ['exacta'] },
  { key: 'trio', label: '三連複', types: ['trio'] },
  { key: 'trifecta', label: '三連単', types: ['trifecta'] },
];

/**
 * ★オッズ — 正本 design/hud-ds/components/odds-board
 *   単勝・複勝は人気順（オッズ昇順）に支持の目安バーつき。右に馬連の上位 10 組。他の券種はタブで切替。
 *   ⚠️ オッズの計算はサーバー側（`race_odds_public`）。画面側で式を作らない。**「購入」「投票する」の導線は置かない**（憲法 §0.2）。
 *   ⚠️ 支持率（%）はデータに無いので出さない。バーは「1 番人気を 100% とした相対の目安」（表示だけ）。
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
  const quinella = byType('quinella').slice(0, 10);
  const comboRows = tab.key === 'win' ? [] : byType(tab.key === 'quinella' ? 'quinella' : tab.key).slice(0, 30);
  const sep = tab.key === 'exacta' || tab.key === 'trifecta' ? '→' : '−';

  const Combo = ({ sel }: { readonly sel: number[] }) => (
    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      {sel.map((g, i) => (
        <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {i > 0 && <span style={{ fontSize: 13, color: 'var(--paper-45)' }}>{sep}</span>}
          <FrameBadge gate={g} fieldSize={fieldSize} w={28} h={20} font={14} />
        </span>
      ))}
    </span>
  );

  return (
    <div style={{ padding: '26px 40px 40px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 32, fontWeight: 900, margin: 0 }}>オッズ</h1>
        <span style={{ fontSize: 15, color: 'var(--paper-70)' }}>
          <a href={`/races/${id}`}>{String(r['name'] ?? gradeLabel)}</a>　{gradeLabel}　{SURFACE_LABEL[String(r['surface'])]} {formatDistance(Number(r['distance']))}　{fieldSize}頭
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 20 }}>
          <StatusBadge status={String(r['status'])} />
          {r['status'] === 'scheduled'
            ? <span style={{ fontSize: 13, color: 'var(--paper-70)' }}>発走まで <Countdown untilIso={String(r['scheduled_at'])} after="まもなく発走" /></span>
            : settled ? <span className="badge off">確定オッズ</span> : null}
        </div>
      </div>

      {/* 券種タブ */}
      <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
        {TABS.map((t) => (
          <a key={t.key} href={`/races/${id}/odds?type=${t.key}`} className={t.key === tab.key ? 'chip-gold' : 'chip-glass'}>
            <span className="unskew">{t.label}</span>
          </a>
        ))}
      </div>

      {tab.key === 'win' ? (
        <div style={{ display: 'flex', gap: 20, marginTop: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          {/* 単勝・複勝 */}
          <EdgePanel style={{ flex: 1, minWidth: 560 }}>
            <div style={{ display: 'flex', alignItems: 'center', height: 34, padding: '0 18px', gap: 14 }}>
              <span className="lbl" style={{ width: 62 }}>人気</span>
              <span className="lbl" style={{ width: 30 }}>枠</span>
              <span className="lbl" style={{ width: 186 }}>馬名</span>
              <span className="lbl" style={{ flex: 1 }}>支持の目安</span>
              <span className="lbl" style={{ width: 88, textAlign: 'right' }}>単勝</span>
              <span className="lbl" style={{ width: 88, textAlign: 'right' }}>複勝</span>
            </div>
            {win.map((o, i) => {
              const gate = Number((o['selection'] as number[])[0]);
              const top3 = i < 3;
              const w = topWin === undefined ? 0 : Math.max(4, Math.round((topWin / Number(o['odds'])) * 100));
              const pl = place.get(gate);
              return (
                <div key={gate} style={{
                  display: 'flex', alignItems: 'center', height: 44, padding: '0 18px', gap: 14, borderTop: '1px solid var(--rule)',
                  background: i === 0 ? 'rgba(240,204,74,.12)' : i % 2 === 1 ? 'var(--row)' : 'transparent',
                  boxShadow: i === 0 ? 'inset 3px 0 0 var(--gold)' : undefined,
                }}>
                  <span style={{ width: 62, fontSize: 12, color: 'var(--paper-45)' }}>{i + 1}番人気</span>
                  <span style={{ width: 30, display: 'flex' }}><FrameBadge gate={gate} fieldSize={fieldSize} w={30} h={22} /></span>
                  <span style={{ width: 186, fontSize: 16, fontWeight: i === 0 ? 900 : 700 }}>{nameOf.get(gate) ?? `${gate}番`}</span>
                  <span style={{ flex: 1, height: 12, background: 'rgba(255,255,255,.07)' }}>
                    <span style={{ display: 'block', height: 12, width: `${w}%`, background: top3 ? 'var(--gold)' : 'rgba(240,204,74,.42)' }} />
                  </span>
                  <span className="num" style={{ width: 88, textAlign: 'right', fontSize: top3 ? 22 : 19, color: top3 ? 'var(--gold)' : 'var(--paper)' }}>
                    {formatOdds(Number(o['odds']), Boolean(o['capped']))}
                  </span>
                  <span className="num" style={{ width: 88, textAlign: 'right', fontSize: 15, color: 'var(--paper-70)' }}>
                    {pl ? formatOdds(Number(pl['odds']), Boolean(pl['capped'])) : '—'}
                  </span>
                </div>
              );
            })}
            {win.length === 0 && <p style={{ padding: '14px 18px', color: 'var(--paper-70)', fontSize: 14 }}>オッズはまだ出ていません。</p>}
            <div className="mono" style={{ display: 'flex', alignItems: 'center', gap: 16, height: 38, padding: '0 18px', borderTop: '1px solid var(--rule)', fontSize: 12, color: 'var(--paper-45)' }}>
              <span>バーは 1 番人気を 100% とした相対の目安</span><span>上限に達したオッズは「（上限）」と表示</span>
            </div>
          </EdgePanel>
          {/* 馬連 上位 10 組 */}
          <EdgePanel style={{ width: 330 }}>
            <div style={{ display: 'flex', alignItems: 'center', height: 34, padding: '0 16px' }}>
              <span className="lbl">馬連 人気順</span><span className="lbl" style={{ marginLeft: 'auto', opacity: .55 }}>上位10組</span>
            </div>
            {quinella.map((o, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', height: 38, padding: '0 16px', gap: 12, borderTop: '1px solid var(--rule)', background: i % 2 === 1 ? 'var(--row)' : 'transparent' }}>
                <span style={{ width: 26, fontSize: 12, color: 'var(--paper-45)' }}>{i + 1}</span>
                <Combo sel={o['selection'] as number[]} />
                <span className="num" style={{ marginLeft: 'auto', fontSize: i < 3 ? 20 : 17, color: i < 3 ? 'var(--gold)' : 'var(--paper)' }}>{formatOdds(Number(o['odds']), Boolean(o['capped']))}</span>
              </div>
            ))}
            {quinella.length === 0 && <p style={{ padding: '14px 16px', color: 'var(--paper-70)', fontSize: 14 }}>—</p>}
            <div className="mono" style={{ display: 'flex', alignItems: 'center', height: 38, padding: '0 16px', borderTop: '1px solid var(--rule)', fontSize: 12, color: 'var(--paper-45)' }}>
              <a href={`/races/${id}/odds?type=quinella`}>すべて表示</a>
            </div>
          </EdgePanel>
        </div>
      ) : (
        <EdgePanel style={{ marginTop: 16, maxWidth: 720 }}>
          <div style={{ display: 'flex', alignItems: 'center', height: 34, padding: '0 16px' }}>
            <span className="lbl">{BET_TYPE_LABEL[tab.key] ?? tab.label} 人気順</span><span className="lbl" style={{ marginLeft: 'auto', opacity: .55 }}>上位 {comboRows.length} 組</span>
          </div>
          {comboRows.map((o, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', height: 38, padding: '0 16px', gap: 12, borderTop: '1px solid var(--rule)', background: i % 2 === 1 ? 'var(--row)' : 'transparent' }}>
              <span style={{ width: 26, fontSize: 12, color: 'var(--paper-45)' }}>{i + 1}</span>
              <Combo sel={o['selection'] as number[]} />
              <span className="num" style={{ marginLeft: 'auto', fontSize: i < 3 ? 20 : 17, color: i < 3 ? 'var(--gold)' : 'var(--paper)' }}>{formatOdds(Number(o['odds']), Boolean(o['capped']))}</span>
            </div>
          ))}
          {comboRows.length === 0 && <p style={{ padding: '14px 16px', color: 'var(--paper-70)', fontSize: 14 }}>この券種のオッズはまだ出ていません。</p>}
        </EdgePanel>
      )}
    </div>
  );
}
