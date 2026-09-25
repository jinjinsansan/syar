'use client';

/**
 * ★記録 — 正本 design/hud-ds/components/records［アーケード］
 *   タブ: 戦績／参加ポイント（EP）の履歴／賞金ポイント（PP）の履歴。**EP と PP は別々の表**（合算の行を作らない）。
 *   EP 板＝縁 3px 濃紺＋青グロス帯／PP 板＝縁 3px #8a5a06＋金グロス帯。板の縁と帯の色で一目で区別する。
 *
 * ★**2026-09-19・UI-4 で本番データに繋ぎました。**
 *   ★戦績 … `my_runs`（`0046`）／★台帳 … `ep_ledger` / `pp_ledger`（RLS で本人の行だけ）
 *   ★期間の絞り込み … `world_state_public.week_started_at`（`0048`）。★画面は時計を持ちません。
 *
 * 🔴 ★**出していないもの（★源がありません・照会中）**
 *   ① ★**1 走あたりの賞金 PP** … `pp_ledger.ref_id` は `race_id` で、同じレースに 2 頭出すと分けられない
 *   ② ★**「今月」** … 正典にゲーム内の「月」が無い（1 週 ＝ 4 時間）
 *   ⚠️ ★どちらも ★**推測で埋めていません**。
 */
import { useEffect, useState } from 'react';
import {
  loadRecordsScreen, PERIOD_LABEL,
  type RecordsScreenData, type RecordPeriod, type LedgerRowView,
} from '../../lib/records-screen';
import { SignInRequiredError } from '../../lib/stable-repo';
import { ClassChip, PageTitle, TabButton } from '../../components/ui';

const TABS = [['runs', '戦績'], ['ep', '参加ポイント（EP）'], ['pp', '賞金ポイント（PP）']] as const;
const PERIODS: readonly RecordPeriod[] = ['week', 'all'];

/** 履歴の列幅（正本: 日時100・理由96・内容 flex(min 200)・増減120 右・残高132 右） */
const LCOL = { at: 100, reason: 96, descMin: 200, delta: 120, balance: 132 } as const;
/** 戦績の列幅（★賞金 110 は出していない。★頭数を着の右に置いた） */
const RCOL = { week: 44, date: 60, race: 150, cls: 112, horseMin: 170, cond: 130, place: 38, field: 70 } as const;

const fmt = (n: number): string => n.toLocaleString('ja-JP');
/** ★時刻の表示（★サーバーの ISO を短く。★画面で「いま」を作らない） */
const clock = (iso: string): string => {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

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
  readonly rows: readonly LedgerRowView[]; readonly unit: 'EP' | 'PP'; readonly empty: string;
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
        /**
         * 🔴 ★**増えたか減ったかは `delta` の符号で決めます。**
         *    ★旧は `INC_REASONS = new Set(['返還','賞金','払戻'])` という
         *    ★**理由の語の一覧**を画面が持っていました — ★台帳が符号を持っているのに、です。
         *    ★理由が 1 つ増えるたびに ★**画面も直さないと色がずれます**（D-052）。
         */
        const inc = r.delta > 0;
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', height: 44, padding: '0 16px', gap: 12, borderTop: '1px solid var(--a-line)', background: i % 2 === 1 ? 'var(--a-panel-2)' : '#fff' }}>
            <span className="a-num rc-led-at" style={{ width: LCOL.at, flex: `0 0 ${LCOL.at}px`, fontSize: 14, color: 'var(--a-ink-3)' }}>{clock(r.at)}</span>
            <span className="rc-led-reason" style={{ width: LCOL.reason, flex: `0 0 ${LCOL.reason}px` }}>
              <span style={{
                display: 'inline-flex', alignItems: 'center', height: 24, padding: '0 10px', borderRadius: 6, fontSize: 11, fontWeight: 900,
                backgroundImage: inc ? 'var(--a-gloss-green)' : 'linear-gradient(#fff,#e9eff5)',
                border: `2px solid ${inc ? 'var(--a-green-d)' : 'var(--a-edge-soft)'}`, color: inc ? '#fff' : 'var(--a-ink-2)',
              }}>{r.reasonLabel}</span>
            </span>
            {/**
              * 🔴 ★**「内容」は空です。** ★台帳の `ref_id` は種類ごとに指す先が違い
              *    （★`prize` / `payout` は `race_id`、★`prize_exchange` は null）、
              *    ★**1 本の文にできる形になっていません**。★推測で組み立てません（★照会中）。
              */}
            <span className="rc-led-desc" style={{ flex: 1, minWidth: LCOL.descMin, fontSize: 14, fontWeight: 900, color: 'var(--a-ink-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>—</span>
            {/* 増減: 減は紙色（ink）／増は緑。PP でも増減に金は使わない（金は板の縁・帯・集計だけ） */}
            <span className="a-num rc-led-delta" style={{ width: LCOL.delta, flex: `0 0 ${LCOL.delta}px`, textAlign: 'right', fontSize: 24, color: inc ? 'var(--a-green-d)' : 'var(--a-ink)' }}>{inc ? `+${fmt(r.delta)}` : `−${fmt(Math.abs(r.delta))}`}</span>
            <span className="rc-led-balance" style={{ width: LCOL.balance, flex: `0 0 ${LCOL.balance}px`, textAlign: 'right', fontSize: 12, fontWeight: 900, color: 'var(--a-ink-3)', whiteSpace: 'nowrap' }}>残 <span className="a-num" style={{ fontSize: 17, color: 'var(--a-ink-2)' }}>{fmt(r.balance)}</span> {unit}</span>
          </div>
        );
      })}
      {rows.length === 0 && <p style={{ margin: 0, padding: '14px 16px', fontSize: 13, fontWeight: 900, color: 'var(--a-ink-2)', borderTop: '1px solid var(--a-line)' }}>{empty}</p>}
    </div>
  );
}

export default function RecordsView({ tab }: { readonly tab: string }): React.ReactElement {
  const activeTab = TABS.find(([k]) => k === tab)?.[0] ?? 'runs';
  const [period, setPeriod] = useState<RecordPeriod>('week');
  const [data, setData] = useState<RecordsScreenData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  /**
   * 🔴 ★**未ログインを「読めなかった」と扱わない**（★2026-09-25）。
   *   ★それまで ★`permission denied for view my_runs` が ★**そのまま画面に出ていました**
   *   （★`/mypage` から来られます）。★`/entry` と ★**同じ欠陥**でした。
   */
  const [needsLogin, setNeedsLogin] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoadError(null);
    setNeedsLogin(false);
    loadRecordsScreen(period)
      .then((d) => { if (alive) setData(d); })
      // 🔴 ★失敗を空にしない（★「記録が無い」に見えてしまう・R-16・UI1-9）
      .catch((e: unknown) => {
        if (!alive) return;
        setData(null);
        // ★未ログインは ★**DB の文を出さず**、★そう言います
        if (e instanceof SignInRequiredError) { setNeedsLogin(true); return; }
        setLoadError(e instanceof Error ? e.message : String(e));
      });
    return () => { alive = false; };
  }, [period]);

  const runs = data?.runs ?? [];
  const wins = runs.filter((r) => r.place === 1).length;
  const ep = data?.ep ?? [];
  const pp = data?.pp ?? [];
  const epSpent = ep.filter((r) => r.delta < 0).reduce((s, r) => s - r.delta, 0);
  const epRefund = ep.filter((r) => r.reason === 'refund').reduce((s, r) => s + r.delta, 0);
  const ppGain = pp.filter((r) => r.delta > 0).reduce((s, r) => s + r.delta, 0);
  const ppExch = pp.filter((r) => r.reason === 'prize_exchange').reduce((s, r) => s - r.delta, 0);
  /** ★獲得賞金は ★**台帳から**（★1 走あたりには割れないが、合計は正しく出せる） */
  const prizeTotal = pp.filter((r) => r.reason === 'prize').reduce((s, r) => s + r.delta, 0);
  const pl = PERIOD_LABEL[period];

  return (
    <div style={{ padding: '22px 0 40px' }}>
      <PageTitle
        title="記録"
        sub="参加ポイントと賞金ポイントは別々に記録されます"
        right={
          <span style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 12, fontWeight: 900, color: 'var(--a-ink-3)' }}>
            {/* ★2026-09-25: ★`/prizes` は消して `/exchange` へ送りました（★裁定 §3）。★直接 新版へ */}
            <a className="rc-exch" href="/exchange" style={{ fontSize: 13, fontWeight: 900 }}>景品交換 →</a>
          </span>
        }
      />

      {/* タブ（h42・選択中は青グロス＋下辺白で板と繋ぐ）＋右端の期間チップ（h34・選択中は金グロス） */}
      <div className="rc-tabs" style={{ display: 'flex', alignItems: 'flex-end', gap: 6, marginTop: 14 }}>
        {TABS.map(([k, label]) => <TabButton key={k} label={label} selected={k === activeTab} href={`/records?tab=${k}`} />)}
        <span className="rc-periods" style={{ display: 'flex', gap: 6, marginLeft: 'auto', paddingBottom: 4 }}>
          {PERIODS.map((k) => {
            const sel = k === period;
            return (
              <button key={k} type="button" onClick={() => { setPeriod(k); }} style={{
                display: 'flex', alignItems: 'center', height: 34, padding: '0 16px', borderRadius: 8, fontSize: 13, fontWeight: 900,
                cursor: 'pointer', fontFamily: 'inherit',
                border: `2px solid ${sel ? '#8a5a06' : 'var(--a-edge-soft)'}`, backgroundImage: sel ? 'var(--a-gloss-gold)' : 'linear-gradient(#fff,#e9eff5)', color: sel ? '#4a3105' : 'var(--a-ink-2)',
              }}>{PERIOD_LABEL[k]}</button>
            );
          })}
        </span>
      </div>

      {/* 🔴 ★読み込み中と失敗を必ず出す（★UI1-9） */}
      {needsLogin && (
        <p role="status" style={{ padding: '14px 16px', fontSize: 12.5, fontWeight: 900, color: 'var(--a-ink-2)' }}>
          戦績を見るには、<a href="/login">ログイン</a>してください。
        </p>
      )}
      {loadError !== null && (
        <div className="a-panel" style={{ marginTop: 14, padding: '14px 16px', fontSize: 14, fontWeight: 900, color: 'var(--a-red-d)' }}>
          記録を読めませんでした: {loadError}
        </div>
      )}
      {data === null && loadError === null && (
        <div className="a-panel" style={{ marginTop: 14, padding: '14px 16px', fontSize: 14, fontWeight: 900, color: 'var(--a-ink-2)' }}>読み込んでいます…</div>
      )}

      {data !== null && activeTab === 'runs' && (
        <div className="a-panel strong" style={{ borderRadius: '0 10px 10px 10px', marginTop: -2 }}>
          <div className="a-band hide-narrow" style={{ height: 38, padding: '0 16px', gap: 12 }}>
            <span className="a-lbl" style={{ width: RCOL.week, flex: `0 0 ${RCOL.week}px`, color: '#fff' }}>週</span>
            <span className="a-lbl" style={{ width: RCOL.date, flex: `0 0 ${RCOL.date}px`, color: '#fff' }}>日付</span>
            <span className="a-lbl" style={{ width: RCOL.race, flex: `0 0 ${RCOL.race}px`, color: '#fff' }}>レース</span>
            <span className="a-lbl" style={{ width: RCOL.cls, flex: `0 0 ${RCOL.cls}px`, color: '#fff' }}>格</span>
            <span className="a-lbl" style={{ flex: 1, minWidth: RCOL.horseMin, color: '#fff' }}>馬</span>
            <span className="a-lbl" style={{ width: RCOL.cond, flex: `0 0 ${RCOL.cond}px`, color: '#fff' }}>条件</span>
            <span className="a-lbl" style={{ width: RCOL.place, flex: `0 0 ${RCOL.place}px`, textAlign: 'center', color: '#fff' }}>着</span>
            <span className="a-lbl" style={{ width: RCOL.field, flex: `0 0 ${RCOL.field}px`, textAlign: 'right', color: '#fff' }}>頭数</span>
          </div>
          {runs.map((r) => (
            <div key={r.raceId} style={{ display: 'flex', alignItems: 'center', height: 48, padding: '0 16px', gap: 12, borderTop: '1px solid var(--a-line)', background: '#fff' }}>
              {/* ⚠️ ★`0046` より前のレースは週が null。★「0 週」と偽らず「—」 */}
              <span className="a-num rc-run-week" style={{ width: RCOL.week, flex: `0 0 ${RCOL.week}px`, fontSize: 14, color: 'var(--a-ink-3)' }}>{r.gameWeek === null ? '—' : `${r.gameWeek}週`}</span>
              <span className="a-num rc-run-date" style={{ width: RCOL.date, flex: `0 0 ${RCOL.date}px`, fontSize: 14, color: 'var(--a-ink-3)' }}>{clock(r.at)}</span>
              <span className="rc-run-race" style={{ width: RCOL.race, flex: `0 0 ${RCOL.race}px`, fontSize: 15, fontWeight: 900, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.raceName}</span>
              <span className="rc-run-cls" style={{ width: RCOL.cls, flex: `0 0 ${RCOL.cls}px` }}><ClassChip label={r.classLabel} classRank={r.classRank} h={24} font={12} /></span>
              <span className="rc-run-horse" style={{ flex: 1, minWidth: RCOL.horseMin, fontSize: 15, fontWeight: 900, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.horseName}</span>
              <span className="rc-run-cond" style={{ width: RCOL.cond, flex: `0 0 ${RCOL.cond}px`, fontSize: 13, fontWeight: 900, color: 'var(--a-ink-2)', whiteSpace: 'nowrap' }}>{r.cond}</span>
              {/* 着順: 1着は 28px 赤、それ以外は 22px 紙色 */}
              <span className="a-num rc-run-place" style={{ width: RCOL.place, flex: `0 0 ${RCOL.place}px`, textAlign: 'center', fontSize: r.place === 1 ? 28 : 22, color: r.place === 1 ? 'var(--a-num-rank)' : 'var(--a-ink)' }}>{r.place}</span>
              <span className="rc-run-field" style={{ width: RCOL.field, flex: `0 0 ${RCOL.field}px`, textAlign: 'right', fontSize: 12, fontWeight: 900, color: 'var(--a-ink-3)' }}><span className="a-num" style={{ fontSize: 17, color: 'var(--a-ink-2)' }}>{r.fieldSize}</span> 頭</span>
            </div>
          ))}
          {runs.length === 0 && <p style={{ margin: 0, padding: '14px 16px', fontSize: 13, fontWeight: 900, color: 'var(--a-ink-2)', borderTop: '1px solid var(--a-line)' }}>まだ出走記録がありません</p>}
          {/* 集計行: 勝ち鞍は赤・賞金は金・勝率は補助（主指標にしない） */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 26, height: 52, padding: '0 16px', borderTop: '2px solid var(--a-line)', background: 'var(--a-ivory)' }}>
            <span style={{ fontSize: 14, fontWeight: 900, color: 'var(--a-ink-2)' }}>{pl} <span className="a-num" style={{ fontSize: 26, color: 'var(--a-ink)' }}>{runs.length}</span> 戦 <span className="a-num" style={{ fontSize: 26, color: 'var(--a-num-rank)' }}>{wins}</span> 勝</span>
            {/* ★合計は台帳から（★1 走あたりには割れない） */}
            <span style={{ fontSize: 14, fontWeight: 900, color: 'var(--a-ink-2)' }}>獲得賞金 <span className="a-num" style={{ fontSize: 26, color: 'var(--a-num-money)' }}>{fmt(prizeTotal)}</span> PP</span>
            <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 900, color: 'var(--a-ink-3)' }}>勝率 {runs.length > 0 ? Math.round((wins / runs.length) * 100) : 0}%</span>
          </div>
          {/* 🔴 ★出していない列を、黙って消さずに言う */}
          <p style={{ margin: 0, padding: '10px 16px', fontSize: 12, fontWeight: 900, color: 'var(--a-ink-3)', borderTop: '1px solid var(--a-line)' }}>
            ※ 1 走ごとの賞金は表示していません（サーバー側の源が未確定のため・合計のみ上に出しています）
          </p>
        </div>
      )}
      {data !== null && activeTab === 'ep' && (
        <Ledger title="参加ポイント（EP）の履歴" reasons="配布／調教／出走料／投票／返還ほか" unit="EP" rows={ep} empty="この期間の参加ポイントの動きはありません"
          summary={<>
            <SumCapsule label={`${pl}の消費`} value={epSpent} bg="linear-gradient(#fff,#fff)" border="var(--a-edge)" labelColor="var(--a-ink-2)" numColor="var(--a-ink)" />
            <SumCapsule label="返還" value={epRefund} bg="var(--a-gloss-green)" border="var(--a-green-d)" labelColor="#fff" numColor="#fff" />
          </>} />
      )}
      {data !== null && activeTab === 'pp' && (
        <Ledger title="賞金ポイント（PP）の履歴" gold reasons="賞金／払戻／景品交換" unit="PP" rows={pp} empty="この期間の賞金ポイントの動きはありません"
          summary={<>
            <SumCapsule label={`${pl}の獲得`} value={ppGain} bg="linear-gradient(#fff,#fff)" border="#8a5a06" labelColor="#4a3105" numColor="var(--a-num-money)" />
            <SumCapsule label="交換" value={ppExch} bg="linear-gradient(#fff,#fff)" border="var(--a-edge-soft)" labelColor="var(--a-ink-2)" numColor="var(--a-ink)" />
          </>} />
      )}
    </div>
  );
}
