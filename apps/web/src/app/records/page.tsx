import { DEMO_RUNS, DEMO_EP_LEDGER, DEMO_PP_LEDGER, type LedgerRow } from '../../lib/game-demo';
import { ClassChip, PageTitle, TabButton } from '../../components/ui';

export const revalidate = 0;

/**
 * ★記録 — 正本 design/hud-ds/components/records［アーケード］
 *   タブ: 戦績／参加ポイント（EP）の履歴／賞金ポイント（PP）の履歴。**EP と PP は別々の表**（合算の行を作らない）。
 *   EP 板＝縁 3px 濃紺＋青グロス帯／PP 板＝縁 3px #8a5a06＋金グロス帯。板の縁と帯の色で一目で区別する。
 *   ⚠️ 今はデモデータ。実データは ep_ledger / pp_ledger（RLS: 本人の行だけ）と race_entries から。期間の絞り込みはサーバー側。
 */
const TABS = [['runs', '戦績'], ['ep', '参加ポイント（EP）'], ['pp', '賞金ポイント（PP）']] as const;
const PERIODS = [['week', '今週'], ['month', '今月'], ['all', '全期間']] as const;
const INC_REASONS = new Set(['返還', '賞金', '払戻']);

/** 履歴の列幅（正本: 日時100・理由96・内容 flex(min 200)・増減120 右・残高132 右） */
const LCOL = { at: 100, reason: 96, descMin: 200, delta: 120, balance: 132 } as const;
/** 戦績の列幅（正本: 週44・日付46・レース150・格112・馬 flex(min 170)・条件130・着38・賞金110） */
const RCOL = { week: 44, date: 46, race: 150, cls: 112, horseMin: 170, cond: 130, place: 38, prize: 110 } as const;

const fmt = (n: number): string => n.toLocaleString('ja-JP');

/** 集計カプセル（h30・角丸 8・2px 縁・ラベル 11px＋数字 19px） */
function SumCapsule({ label, value, bg, border, labelColor, numColor }: {
  readonly label: string; readonly value: number; readonly bg: string; readonly border: string; readonly labelColor: string; readonly numColor: string;
}): React.ReactElement {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 7, height: 30, padding: '0 12px', borderRadius: 8, backgroundImage: bg, border: `2px solid ${border}` }}>
      <span style={{ fontSize: 11, fontWeight: 900, color: labelColor }}>{label}</span>
      <span className="a-num" style={{ fontSize: 19, color: numColor }}>{fmt(value)}</span>
    </span>
  );
}

function Ledger({ title, gold, reasons, summary, rows, unit, empty }: {
  readonly title: string; readonly gold?: boolean; readonly reasons: string; readonly summary: React.ReactNode;
  readonly rows: readonly LedgerRow[]; readonly unit: 'EP' | 'PP'; readonly empty: string;
}): React.ReactElement {
  return (
    <div className="a-panel strong" style={{ marginTop: 14, borderColor: gold ? '#8a5a06' : undefined }}>
      <div className={`a-band${gold ? ' a-band-gold' : ''}`} style={{ height: 44, padding: '0 16px', gap: 14, borderBottom: gold ? '2px solid #8a5a06' : undefined }}>
        <span style={{ fontSize: 17, fontWeight: 900 }}>{title}</span>
        <span style={{ fontSize: 12, fontWeight: 900 }}>理由: {reasons}</span>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>{summary}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', height: 34, padding: '0 16px', gap: 12, backgroundImage: 'linear-gradient(#fff,#e3ecf3)', borderBottom: '2px solid var(--a-line)' }}>
        <span className="a-lbl" style={{ width: LCOL.at, flex: `0 0 ${LCOL.at}px` }}>日時</span>
        <span className="a-lbl" style={{ width: LCOL.reason, flex: `0 0 ${LCOL.reason}px` }}>理由</span>
        <span className="a-lbl" style={{ flex: 1, minWidth: LCOL.descMin }}>内容</span>
        <span className="a-lbl" style={{ width: LCOL.delta, flex: `0 0 ${LCOL.delta}px`, textAlign: 'right' }}>増減</span>
        <span className="a-lbl" style={{ width: LCOL.balance, flex: `0 0 ${LCOL.balance}px`, textAlign: 'right' }}>残高（{unit}）</span>
      </div>
      {rows.map((r, i) => {
        const inc = INC_REASONS.has(r.reason);
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', height: 44, padding: '0 16px', gap: 12, borderTop: '1px solid var(--a-line)', background: i % 2 === 1 ? 'var(--a-panel-2)' : '#fff' }}>
            <span className="a-num" style={{ width: LCOL.at, flex: `0 0 ${LCOL.at}px`, fontSize: 14, color: 'var(--a-ink-3)' }}>{r.at}</span>
            <span style={{ width: LCOL.reason, flex: `0 0 ${LCOL.reason}px` }}>
              <span style={{
                display: 'inline-flex', alignItems: 'center', height: 24, padding: '0 10px', borderRadius: 6, fontSize: 11, fontWeight: 900,
                backgroundImage: inc ? 'var(--a-gloss-green)' : 'linear-gradient(#fff,#e9eff5)',
                border: `2px solid ${inc ? 'var(--a-green-d)' : 'var(--a-edge-soft)'}`, color: inc ? '#fff' : 'var(--a-ink-2)',
              }}>{r.reason}</span>
            </span>
            <span style={{ flex: 1, minWidth: LCOL.descMin, fontSize: 14, fontWeight: 900, color: 'var(--a-ink-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.desc}</span>
            {/* 増減: 減は紙色（ink）／増は緑。PP でも増減に金は使わない（金は板の縁・帯・集計だけ） */}
            <span className="a-num" style={{ width: LCOL.delta, flex: `0 0 ${LCOL.delta}px`, textAlign: 'right', fontSize: 24, color: r.delta > 0 ? 'var(--a-green-d)' : 'var(--a-ink)' }}>{r.delta > 0 ? `+${fmt(r.delta)}` : `−${fmt(Math.abs(r.delta))}`}</span>
            <span style={{ width: LCOL.balance, flex: `0 0 ${LCOL.balance}px`, textAlign: 'right', fontSize: 12, fontWeight: 900, color: 'var(--a-ink-3)', whiteSpace: 'nowrap' }}>残 <span className="a-num" style={{ fontSize: 17, color: 'var(--a-ink-2)' }}>{fmt(r.balance)}</span> {unit}</span>
          </div>
        );
      })}
      {rows.length === 0 && <p style={{ margin: 0, padding: '14px 16px', fontSize: 13, fontWeight: 900, color: 'var(--a-ink-2)', borderTop: '1px solid var(--a-line)' }}>{empty}</p>}
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
    <div style={{ padding: '22px 0 40px' }}>
      <PageTitle
        title="記録"
        sub="参加ポイントと賞金ポイントは別々に記録されます"
        right={
          <span style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 12, fontWeight: 900, color: 'var(--a-ink-3)' }}>
            <span>※ デモデータ（ログイン後は本人の台帳だけを表示します）</span>
            <a href="/prizes" style={{ fontSize: 13, fontWeight: 900 }}>景品交換 →</a>
          </span>
        }
      />

      {/* タブ（h42・選択中は青グロス＋下辺白で板と繋ぐ）＋右端の期間チップ（h34・選択中は金グロス） */}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, marginTop: 14 }}>
        {TABS.map(([k, label]) => <TabButton key={k} label={label} selected={k === activeTab} href={`/records?tab=${k}&period=${activePeriod}`} />)}
        <span style={{ display: 'flex', gap: 6, marginLeft: 'auto', paddingBottom: 4 }}>
          {PERIODS.map(([k, label]) => {
            const sel = k === activePeriod;
            return (
              <a key={k} href={`/records?tab=${activeTab}&period=${k}`} style={{
                display: 'flex', alignItems: 'center', height: 34, padding: '0 16px', borderRadius: 8, fontSize: 13, fontWeight: 900, textDecoration: 'none',
                border: `2px solid ${sel ? '#8a5a06' : 'var(--a-edge-soft)'}`, backgroundImage: sel ? 'var(--a-gloss-gold)' : 'linear-gradient(#fff,#e9eff5)', color: sel ? '#4a3105' : 'var(--a-ink-2)',
              }}>{label}</a>
            );
          })}
        </span>
      </div>

      {activeTab === 'runs' && (
        <div className="a-panel strong" style={{ borderRadius: '0 10px 10px 10px', marginTop: -2 }}>
          <div className="a-band hide-narrow" style={{ height: 38, padding: '0 16px', gap: 12 }}>
            <span className="a-lbl" style={{ width: RCOL.week, flex: `0 0 ${RCOL.week}px`, color: '#fff' }}>週</span>
            <span className="a-lbl" style={{ width: RCOL.date, flex: `0 0 ${RCOL.date}px`, color: '#fff' }}>日付</span>
            <span className="a-lbl" style={{ width: RCOL.race, flex: `0 0 ${RCOL.race}px`, color: '#fff' }}>レース</span>
            <span className="a-lbl" style={{ width: RCOL.cls, flex: `0 0 ${RCOL.cls}px`, color: '#fff' }}>格</span>
            <span className="a-lbl" style={{ flex: 1, minWidth: RCOL.horseMin, color: '#fff' }}>馬</span>
            <span className="a-lbl" style={{ width: RCOL.cond, flex: `0 0 ${RCOL.cond}px`, color: '#fff' }}>条件</span>
            <span className="a-lbl" style={{ width: RCOL.place, flex: `0 0 ${RCOL.place}px`, textAlign: 'center', color: '#fff' }}>着</span>
            <span className="a-lbl" style={{ width: RCOL.prize, flex: `0 0 ${RCOL.prize}px`, textAlign: 'right', color: '#fff' }}>賞金</span>
          </div>
          {DEMO_RUNS.map((r, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', height: 48, padding: '0 16px', gap: 12, borderTop: '1px solid var(--a-line)', background: i % 2 === 1 ? 'var(--a-panel-2)' : '#fff' }}>
              <span className="a-num" style={{ width: RCOL.week, flex: `0 0 ${RCOL.week}px`, fontSize: 14, color: 'var(--a-ink-3)' }}>{r.week}週</span>
              <span className="a-num" style={{ width: RCOL.date, flex: `0 0 ${RCOL.date}px`, fontSize: 14, color: 'var(--a-ink-3)' }}>{r.date}</span>
              <span style={{ width: RCOL.race, flex: `0 0 ${RCOL.race}px`, fontSize: 15, fontWeight: 900, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.race}</span>
              <span style={{ width: RCOL.cls, flex: `0 0 ${RCOL.cls}px` }}><ClassChip label={r.classLabel} classRank={r.classRank} h={24} font={12} /></span>
              <span style={{ flex: 1, minWidth: RCOL.horseMin, fontSize: 15, fontWeight: 900, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.horse}</span>
              <span style={{ width: RCOL.cond, flex: `0 0 ${RCOL.cond}px`, fontSize: 13, fontWeight: 900, color: 'var(--a-ink-2)', whiteSpace: 'nowrap' }}>{r.cond}</span>
              {/* 着順: 1着は 28px 赤、それ以外は 22px 紙色 */}
              <span className="a-num" style={{ width: RCOL.place, flex: `0 0 ${RCOL.place}px`, textAlign: 'center', fontSize: r.place === 1 ? 28 : 22, color: r.place === 1 ? 'var(--a-num-rank)' : 'var(--a-ink)' }}>{r.place}</span>
              <span style={{ width: RCOL.prize, flex: `0 0 ${RCOL.prize}px`, textAlign: 'right', fontSize: 12, fontWeight: 900, color: 'var(--a-ink-2)' }}><span className="a-num" style={{ fontSize: 20, color: r.prizePP > 0 ? 'var(--a-num-money)' : 'var(--a-ink-3)' }}>{fmt(r.prizePP)}</span> PP</span>
            </div>
          ))}
          {DEMO_RUNS.length === 0 && <p style={{ margin: 0, padding: '14px 16px', fontSize: 13, fontWeight: 900, color: 'var(--a-ink-2)', borderTop: '1px solid var(--a-line)' }}>まだ出走記録がありません</p>}
          {/* 集計行: 勝ち鞍は赤・賞金は金・勝率は補助（主指標にしない） */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 26, height: 52, padding: '0 16px', borderTop: '2px solid var(--a-line)', background: 'var(--a-ivory)' }}>
            <span style={{ fontSize: 14, fontWeight: 900, color: 'var(--a-ink-2)' }}>今月 <span className="a-num" style={{ fontSize: 26, color: 'var(--a-ink)' }}>{DEMO_RUNS.length}</span> 戦 <span className="a-num" style={{ fontSize: 26, color: 'var(--a-num-rank)' }}>{wins}</span> 勝</span>
            <span style={{ fontSize: 14, fontWeight: 900, color: 'var(--a-ink-2)' }}>獲得賞金 <span className="a-num" style={{ fontSize: 26, color: 'var(--a-num-money)' }}>{fmt(prize)}</span> PP</span>
            <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 900, color: 'var(--a-ink-3)' }}>勝率 {DEMO_RUNS.length > 0 ? Math.round((wins / DEMO_RUNS.length) * 100) : 0}%</span>
          </div>
        </div>
      )}
      {activeTab === 'ep' && (
        <Ledger title="参加ポイント（EP）の履歴" reasons="調教／出走料／投票／返還" unit="EP" rows={DEMO_EP_LEDGER} empty="この期間の参加ポイントの動きはありません"
          summary={<>
            <SumCapsule label="今月の消費" value={epSpent} bg="linear-gradient(#fff,#fff)" border="var(--a-edge)" labelColor="var(--a-ink-2)" numColor="var(--a-ink)" />
            <SumCapsule label="返還" value={epRefund} bg="var(--a-gloss-green)" border="var(--a-green-d)" labelColor="#fff" numColor="#fff" />
          </>} />
      )}
      {activeTab === 'pp' && (
        <Ledger title="賞金ポイント（PP）の履歴" gold reasons="賞金／払戻／景品交換" unit="PP" rows={DEMO_PP_LEDGER} empty="この期間の賞金ポイントの動きはありません"
          summary={<>
            <SumCapsule label="今月の獲得" value={ppGain} bg="linear-gradient(#fff,#fff)" border="#8a5a06" labelColor="#4a3105" numColor="var(--a-num-money)" />
            <SumCapsule label="交換" value={ppExch} bg="linear-gradient(#fff,#fff)" border="var(--a-edge-soft)" labelColor="var(--a-ink-2)" numColor="var(--a-ink)" />
          </>} />
      )}
    </div>
  );
}
