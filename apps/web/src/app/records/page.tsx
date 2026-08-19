import { DEMO_RUNS, DEMO_EP_LEDGER, DEMO_PP_LEDGER, type LedgerRow } from '../../lib/game-demo';
import { ClassChip } from '../../components/ui';

export const revalidate = 0;

/**
 * ★記録 — 正本 design/hud-ds/components/records
 *   タブ: 戦績／参加ポイント（EP）の履歴／賞金ポイント（PP）の履歴。**EP と PP は別々の表**（合算の行を作らない）。
 *   ⚠️ 今はデモデータ。実データは ep_ledger / pp_ledger（RLS: 本人の行だけ）と race_entries から。期間の絞り込みはサーバー側。
 */
const TABS = [['runs', '戦績'], ['ep', '参加ポイント（EP）'], ['pp', '賞金ポイント（PP）']] as const;
const PERIODS = [['week', '今週'], ['month', '今月'], ['all', '全期間']] as const;
const INC_REASONS = new Set(['返還', '賞金', '払戻']);

function Ledger({ title, gold, reasons, summary, rows, unit, empty }: {
  readonly title: string; readonly gold?: boolean; readonly reasons: string; readonly summary: React.ReactNode;
  readonly rows: readonly LedgerRow[]; readonly unit: 'EP' | 'PP'; readonly empty: string;
}): React.ReactElement {
  return (
    <div className="panel" style={{ marginTop: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', height: 44, padding: '0 16px', gap: 14, borderBottom: '1px solid var(--rule)', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 17, fontWeight: 900, color: gold ? 'var(--gold)' : 'var(--paper)' }}>{title}</span>
        <span style={{ fontSize: 12, color: 'var(--paper-45)' }}>理由: {reasons}</span>
        <span style={{ marginLeft: 'auto', fontSize: 13, color: 'var(--paper-70)' }}>{summary}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', height: 34, padding: '0 16px', gap: 12 }}>
        <span className="lbl" style={{ flex: '0 0 96px' }}>日時</span><span className="lbl" style={{ flex: '0 0 88px' }}>理由</span><span className="lbl" style={{ flex: 1, minWidth: 180 }}>内容</span>
        <span className="lbl" style={{ flex: '0 0 104px', textAlign: 'right' }}>増減</span><span className="lbl" style={{ flex: '0 0 118px', textAlign: 'right' }}>残高</span>
      </div>
      {rows.map((r, i) => {
        const inc = INC_REASONS.has(r.reason);
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', height: 40, padding: '0 16px', gap: 12, borderTop: '1px solid var(--rule)', background: i % 2 === 1 ? 'var(--row)' : 'transparent' }}>
            <span className="num" style={{ flex: '0 0 96px', fontSize: 13, color: 'var(--paper-45)' }}>{r.at}</span>
            <span style={{ flex: '0 0 88px' }}><span style={{ display: 'inline-flex', alignItems: 'center', height: 22, padding: '0 9px', fontSize: 11, color: inc ? '#5fd48b' : 'var(--paper-70)', border: `1px solid ${inc ? 'rgba(95,212,139,.4)' : 'var(--rule)'}` }}>{r.reason}</span></span>
            <span style={{ flex: 1, minWidth: 180, fontSize: 13, color: 'var(--paper-70)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.desc}</span>
            <span className="num" style={{ flex: '0 0 104px', textAlign: 'right', fontSize: 18, color: r.delta > 0 ? '#5fd48b' : 'var(--paper)' }}>{r.delta > 0 ? `+${r.delta.toLocaleString('ja-JP')}` : `−${Math.abs(r.delta).toLocaleString('ja-JP')}`}</span>
            <span style={{ flex: '0 0 118px', textAlign: 'right', fontSize: 12, color: 'var(--paper-45)' }}>残 <span className="num" style={{ fontSize: 14, color: 'var(--paper-70)' }}>{r.balance.toLocaleString('ja-JP')}</span> {unit}</span>
          </div>
        );
      })}
      {rows.length === 0 && <p style={{ padding: '14px 16px', fontSize: 14, color: 'var(--paper-70)' }}>{empty}</p>}
    </div>
  );
}

export default async function RecordsPage({ searchParams }: { searchParams: Promise<{ tab?: string; period?: string }> }) {
  const { tab, period } = await searchParams;
  const activeTab = TABS.find(([k]) => k === tab)?.[0] ?? 'runs';
  const activePeriod = PERIODS.find(([k]) => k === period)?.[0] ?? 'month';
  const wins = DEMO_RUNS.filter((r) => r.place === 1).length;
  const prize = DEMO_RUNS.reduce((s, r) => s + r.prizePP, 0);
  const epSpent = DEMO_EP_LEDGER.filter((r) => r.delta < 0).reduce((s, r) => s - r.delta, 0);
  const epRefund = DEMO_EP_LEDGER.filter((r) => r.reason === '返還').reduce((s, r) => s + r.delta, 0);
  const ppGain = DEMO_PP_LEDGER.filter((r) => r.delta > 0).reduce((s, r) => s + r.delta, 0);
  const ppExch = DEMO_PP_LEDGER.filter((r) => r.reason === '景品交換').reduce((s, r) => s - r.delta, 0);

  return (
    <div style={{ padding: '26px 0 40px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 16 }}><h1 style={{ fontSize: 34, fontWeight: 900, margin: 0 }}>記録</h1><span style={{ fontSize: 14, color: 'var(--paper-70)' }}>参加ポイントと賞金ポイントは別々に記録されます</span><a href="/prizes" style={{ marginLeft: 'auto', fontSize: 13 }}>景品交換 →</a></div>
      <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--paper-45)' }}>※ デモデータ（ログイン後は本人の台帳だけを表示します）</p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
        {TABS.map(([k, label]) => {
          const sel = k === activeTab;
          return <a key={k} href={`/records?tab=${k}&period=${activePeriod}`} style={{ display: 'flex', alignItems: 'center', height: 38, padding: '0 20px', background: sel ? 'var(--gold)' : 'rgba(7,10,8,.72)', border: `1px solid ${sel ? 'var(--gold)' : 'var(--rule)'}`, color: sel ? 'var(--ink)' : 'var(--paper)', fontSize: 15, fontWeight: sel ? 900 : 700 }}>{label}</a>;
        })}
        <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
          {PERIODS.map(([k, label]) => {
            const sel = k === activePeriod;
            return <a key={k} href={`/records?tab=${activeTab}&period=${k}`} style={{ display: 'flex', alignItems: 'center', height: 30, padding: '0 14px', background: sel ? 'rgba(240,204,74,.16)' : 'rgba(7,10,8,.72)', border: `1px solid ${sel ? 'var(--gold-hair)' : 'var(--rule)'}`, fontSize: 13, color: sel ? 'var(--gold)' : 'var(--paper-70)' }}>{label}</a>;
          })}
        </div>
      </div>

      {activeTab === 'runs' && (
        <div className="panel" style={{ marginTop: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', height: 38, padding: '0 16px', gap: 10, borderBottom: '1px solid var(--rule)' }}>
            <span className="lbl" style={{ flex: '0 0 44px' }}>週</span><span className="lbl" style={{ flex: '0 0 44px' }}>日付</span><span className="lbl" style={{ flex: '0 0 110px' }}>レース</span><span className="lbl" style={{ flex: '0 0 96px' }}>格</span>
            <span className="lbl" style={{ flex: 1, minWidth: 140 }}>馬</span><span className="lbl" style={{ flex: '0 0 130px' }}>条件</span><span className="lbl" style={{ flex: '0 0 34px', textAlign: 'center' }}>着</span><span className="lbl" style={{ flex: '0 0 88px', textAlign: 'right' }}>賞金</span>
          </div>
          {DEMO_RUNS.map((r, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', height: 42, padding: '0 16px', gap: 10, borderTop: '1px solid var(--rule)', background: i % 2 === 1 ? 'var(--row)' : 'transparent' }}>
              <span className="num" style={{ flex: '0 0 44px', fontSize: 14, color: 'var(--paper-45)' }}>{r.week}週</span>
              <span className="num" style={{ flex: '0 0 44px', fontSize: 13, color: 'var(--paper-45)' }}>{r.date}</span>
              <span style={{ flex: '0 0 110px', fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.race}</span>
              <span style={{ flex: '0 0 96px' }}><ClassChip label={r.classLabel} classRank={r.classRank} h={22} font={11} /></span>
              <span style={{ flex: 1, minWidth: 140, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.horse}</span>
              <span style={{ flex: '0 0 130px', fontSize: 13, color: 'var(--paper-70)', whiteSpace: 'nowrap' }}>{r.cond}</span>
              <span className="num" style={{ flex: '0 0 34px', textAlign: 'center', fontSize: r.place === 1 ? 21 : 18, color: r.place === 1 ? 'var(--gold)' : 'var(--paper)' }}>{r.place}</span>
              <span style={{ flex: '0 0 88px', textAlign: 'right', fontSize: 12, color: r.prizePP > 0 ? 'var(--paper)' : 'var(--paper-45)' }}><span className="num" style={{ fontSize: 16 }}>{r.prizePP.toLocaleString('ja-JP')}</span> PP</span>
            </div>
          ))}
          {DEMO_RUNS.length === 0 && <p style={{ padding: '14px 16px', fontSize: 14, color: 'var(--paper-70)' }}>まだ出走記録がありません</p>}
          <div style={{ display: 'flex', alignItems: 'center', gap: 26, height: 46, padding: '0 16px', borderTop: '1px solid var(--rule)', background: 'rgba(240,204,74,.06)' }}>
            <span style={{ fontSize: 13, color: 'var(--paper-70)' }}>今月 <span className="num" style={{ fontSize: 19, color: 'var(--paper)' }}>{DEMO_RUNS.length}</span> 戦 <span className="num" style={{ fontSize: 19, color: 'var(--gold)' }}>{wins}</span> 勝</span>
            <span style={{ fontSize: 13, color: 'var(--paper-70)' }}>獲得賞金 <span className="num" style={{ fontSize: 19, color: 'var(--gold)' }}>{prize.toLocaleString('ja-JP')}</span> PP</span>
            <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--paper-45)' }}>勝率 {DEMO_RUNS.length > 0 ? Math.round((wins / DEMO_RUNS.length) * 100) : 0}%</span>
          </div>
        </div>
      )}
      {activeTab === 'ep' && (
        <Ledger title="参加ポイント（EP）の履歴" reasons="調教／出走料／投票／返還" unit="EP" rows={DEMO_EP_LEDGER} empty="この期間の参加ポイントの動きはありません"
          summary={<>今月の消費 <span className="num" style={{ fontSize: 18, color: 'var(--paper)' }}>{epSpent.toLocaleString('ja-JP')}</span> EP　返還 <span className="num" style={{ fontSize: 18, color: '#5fd48b' }}>{epRefund.toLocaleString('ja-JP')}</span> EP</>} />
      )}
      {activeTab === 'pp' && (
        <Ledger title="賞金ポイント（PP）の履歴" gold reasons="賞金／払戻／景品交換" unit="PP" rows={DEMO_PP_LEDGER} empty="この期間の賞金ポイントの動きはありません"
          summary={<>今月の獲得 <span className="num" style={{ fontSize: 18, color: 'var(--gold)' }}>{ppGain.toLocaleString('ja-JP')}</span> PP　交換 <span className="num" style={{ fontSize: 18, color: 'var(--paper)' }}>{ppExch.toLocaleString('ja-JP')}</span> PP</>} />
      )}
    </div>
  );
}
