'use client';

/**
 * ★記録 — ★**馬物語 UI の骨格**（★2026-09-27・引き渡し資料 `design_handoff_uma_monogatari` §5 / §4.3）
 *   タブ: 戦績／参加ポイント（EP）の履歴／賞金ポイント（PP）の履歴。**EP と PP は別々の表**（合算の行を作らない）。
 *   ★EP の板は ★青緑（`--u-ep`）、★PP の板は ★金（`--u-gold`）の縁で見分けます（★資料 §5.6 のカプセルと同じ色）。
 *
 * 【🔴 ★2026-09-27 に 白い旧い枠から移しました】
 *   ★オーナー指摘「★この白の間違っているデザインはいつ辞めるのですか」。★資料 §5 の骨格（部品 `components/uma/uma-parts.tsx`）で組み、
 *   ★**新しい意匠は作っていません**。★**読み込み・未ログインの扱い・集計の処理は 1 行も変えていません**。
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
import { Backdrop, TopBar, useMotionPaused } from '../../components/uma/uma-parts';
import { RaceStrip } from '../../components/uma/race-strip';

const TABS = [['runs', '戦績'], ['ep', '参加ポイント（EP）'], ['pp', '賞金ポイント（PP）']] as const;
const PERIODS: readonly RecordPeriod[] = ['week', 'all'];

const fmt = (n: number): string => n.toLocaleString('ja-JP');
/** ★時刻の表示（★サーバーの ISO を短く。★画面で「いま」を作らない） */
const clock = (iso: string): string => {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/** ★1 行の外枠（★資料 §5.1: 内側 0 14px・最大 1220px） */
const ROW: React.CSSProperties = { position: 'relative', width: '100%', maxWidth: 1220, margin: '0 auto', padding: '0 14px' };
/** ★紙パネル（★資料 §5.6）。★縁の色で EP / PP を見分ける */
const paper = (edge: string): React.CSSProperties => ({
  border: `2px solid ${edge}`, borderRadius: 12, background: 'var(--u-paper)', color: 'var(--u-ink-dark)', overflow: 'hidden',
});
const paperHead = (edge: string): React.CSSProperties => ({
  display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px 12px', minHeight: 44, padding: '8px 14px',
  background: 'var(--u-navy)', color: 'var(--u-ink-light)', borderBottom: `3px solid ${edge}`,
});

/** 集計カプセル（★資料 §5.6 のカプセルの小型） */
function SumCapsule({ label, value, edge }: { readonly label: string; readonly value: number; readonly edge: string }): React.ReactElement {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, minHeight: 30, padding: '0 12px', borderRadius: 999, border: `2px solid ${edge}`, background: 'var(--u-panel-strong)' }}>
      <span style={{ fontSize: 11 }}>{label}</span>
      <strong style={{ fontSize: 18 }}>{fmt(value)}</strong>
    </span>
  );
}

function Ledger({ title, edge, reasons, summary, rows, unit, empty }: {
  readonly title: string; readonly edge: string; readonly reasons: string; readonly summary: React.ReactNode;
  readonly rows: readonly LedgerRowView[]; readonly unit: 'EP' | 'PP'; readonly empty: string;
}): React.ReactElement {
  return (
    <section aria-label={title} style={paper(edge)}>
      <div style={paperHead(edge)}>
        <strong style={{ fontSize: 16 }}>{title}</strong>
        <span style={{ fontSize: 11 }}>理由: {reasons}</span>
        <span style={{ marginLeft: 'auto', display: 'flex', flexWrap: 'wrap', gap: 8 }}>{summary}</span>
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
          <div key={i} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 12px', minHeight: 48, padding: '8px 14px', borderTop: '1px solid var(--u-rule)' }}>
            <span style={{ fontSize: 13, opacity: .7, minWidth: 86 }}>{clock(r.at)}</span>
            <span style={{
              display: 'inline-flex', alignItems: 'center', minHeight: 24, padding: '0 10px', borderRadius: 6, fontSize: 11,
              background: inc ? '#dff3e5' : '#fff', border: `2px solid ${inc ? 'var(--u-green-deep)' : 'var(--u-rule)'}`,
            }}>{r.reasonLabel}</span>
            {/**
              * 🔴 ★**「内容」は空です。** ★台帳の `ref_id` は種類ごとに指す先が違い
              *    （★`prize` / `payout` は `race_id`、★`prize_exchange` は null）、
              *    ★**1 本の文にできる形になっていません**。★推測で組み立てません（★照会中）。
              */}
            <span style={{ flex: '1 1 60px', fontSize: 13, opacity: .6 }}>—</span>
            {/* 増減: 減は紙色（ink）／増は緑 */}
            <strong style={{ fontSize: 22, color: inc ? 'var(--u-green-deep)' : 'var(--u-ink-dark)' }}>{inc ? `+${fmt(r.delta)}` : `−${fmt(Math.abs(r.delta))}`}</strong>
            <span style={{ fontSize: 12, whiteSpace: 'nowrap' }}>残 <strong style={{ fontSize: 16 }}>{fmt(r.balance)}</strong> {unit}</span>
          </div>
        );
      })}
      {rows.length === 0 && <p style={{ margin: 0, padding: '14px', fontSize: 13, borderTop: '1px solid var(--u-rule)' }}>{empty}</p>}
    </section>
  );
}

export default function RecordsView({ tab }: { readonly tab: string }): React.ReactElement {
  const [paused, toggle] = useMotionPaused();
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

  return <div data-theme="uma" data-page-body className={paused ? 'u-paused' : undefined} style={{
    position: 'relative', width: '100%', minHeight: '100dvh', overflow: 'hidden',
    containerType: 'inline-size', background: 'var(--u-navy)', color: 'var(--u-ink-light)',
    display: 'flex', flexDirection: 'column', paddingBottom: 'var(--u-safe-bottom)',
  }}>
    <Backdrop />
    <TopBar title="記録" backHref="/mypage" paused={paused} onToggle={toggle} />
    <RaceStrip />

    <div style={{ ...ROW, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginTop: 10 }}>
      <span style={{ fontSize: 12, opacity: .85 }}>参加ポイントと賞金ポイントは別々に記録されます</span>
      {/* ★2026-09-25: ★`/prizes` は消して `/exchange` へ送りました（★裁定 §3）。★直接 新版へ */}
      <a href="/exchange" style={{ marginLeft: 'auto', minHeight: 44, display: 'flex', alignItems: 'center', padding: '0 14px', border: '2px solid var(--u-gold)', borderRadius: 10 }}>景品交換 →</a>
    </div>

    <main style={{ ...ROW, flex: '1 1 auto', display: 'flex', flexDirection: 'column', gap: 12, marginTop: 10 }}>
      {/* タブ＋期間（★選択中は金） */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
        <nav aria-label="記録の種類" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {TABS.map(([k, label]) => {
            const sel = k === activeTab;
            return <a key={k} href={`/records?tab=${k}`} aria-current={sel ? 'page' : undefined} style={{
              minHeight: 44, display: 'flex', alignItems: 'center', padding: '0 14px', borderRadius: 10, fontSize: 14,
              border: sel ? '3px solid var(--u-navy)' : '2px solid rgba(251,247,236,.4)',
              background: sel ? 'var(--u-gold-plate)' : 'var(--u-panel)', color: sel ? 'var(--u-ink-dark)' : 'var(--u-ink-light)',
            }}>{label}</a>;
          })}
        </nav>
        <span style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
          {PERIODS.map((k) => {
            const sel = k === period;
            return (
              <button key={k} type="button" aria-pressed={sel} onClick={() => { setPeriod(k); }} style={{
                minHeight: 44, padding: '0 14px', borderRadius: 999, fontSize: 13,
                border: `2px solid ${sel ? 'var(--u-gold)' : 'rgba(251,247,236,.4)'}`,
                background: sel ? 'rgba(246,194,28,.22)' : 'var(--u-panel)', color: 'var(--u-ink-light)',
              }}>{PERIOD_LABEL[k]}</button>
            );
          })}
        </span>
      </div>

      {/* 🔴 ★読み込み中と失敗を必ず出す（★UI1-9） */}
      {needsLogin && (
        <p role="status" style={{ margin: 0, padding: '12px 14px', borderRadius: 12, background: 'var(--u-panel)', fontSize: 13 }}>
          戦績を見るには、<a href="/login" style={{ color: 'var(--u-gold)', textDecoration: 'underline' }}>ログイン</a>してください。
        </p>
      )}
      {loadError !== null && (
        <div role="alert" style={{ padding: '12px 14px', borderRadius: 12, border: '2px solid var(--u-red)', background: 'var(--u-panel-strong)', fontSize: 13 }}>
          記録を読めませんでした: {loadError}
        </div>
      )}
      {data === null && loadError === null && !needsLogin && (
        <p style={{ margin: 0, fontSize: 13 }}>読み込んでいます…</p>
      )}

      {data !== null && activeTab === 'runs' && (
        <section aria-label="戦績" style={paper('rgba(246,194,28,.45)')}>
          <div style={paperHead('var(--u-gold)')}><strong style={{ fontSize: 16 }}>戦績</strong><span style={{ fontSize: 11 }}>{pl}</span></div>
          {runs.map((r) => (
            <div key={r.raceId} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 12px', minHeight: 56, padding: '8px 14px', borderTop: '1px solid var(--u-rule)' }}>
              {/* ⚠️ ★`0046` より前のレースは週が null。★「0 週」と偽らず「—」 */}
              <span style={{ fontSize: 12, opacity: .7, minWidth: 44 }}>{r.gameWeek === null ? '—' : `${r.gameWeek}週`}</span>
              <span style={{ fontSize: 12, opacity: .7, minWidth: 86 }}>{clock(r.at)}</span>
              {/*
                ★**録画への入口**（★2026-09-27・段 2 D・裁定 Q-RACE-6 / Q-RACE-10）。
                ★入口は ★**自分の馬の記録からだけ**張ります（★D-122「空の店に客を送らない」）。★ここは `my_runs` ＝ ★自分の馬の確定した出走だけです。
              */}
              <a href={`/race?race=${encodeURIComponent(r.raceId)}&return=/records`} style={{
                minHeight: 44, display: 'flex', alignItems: 'center', fontSize: 15, color: '#1a4f8a', textDecoration: 'underline',
              }}>{r.raceName}</a>
              <span style={{ display: 'inline-flex', alignItems: 'center', minHeight: 24, padding: '0 10px', borderRadius: 999, border: '2px solid var(--u-navy)', fontSize: 11 }}>{r.classLabel}</span>
              <strong style={{ flex: '1 1 120px', fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.horseName}</strong>
              <span style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{r.cond}</span>
              {/* 着順: 1着は赤で大きく */}
              <strong style={{ fontSize: r.place === 1 ? 28 : 22, color: r.place === 1 ? '#c0392b' : 'var(--u-ink-dark)', minWidth: 32, textAlign: 'center' }}>{r.place}</strong>
              <span style={{ fontSize: 12 }}>着 ／ {r.fieldSize} 頭</span>
            </div>
          ))}
          {runs.length === 0 && <p style={{ margin: 0, padding: '14px', fontSize: 13, borderTop: '1px solid var(--u-rule)' }}>まだ出走記録がありません</p>}
          {/* 集計行 */}
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px 24px', minHeight: 52, padding: '8px 14px', borderTop: '2px solid var(--u-rule)', background: '#f3eedd' }}>
            <span style={{ fontSize: 14 }}>{pl} <strong style={{ fontSize: 24 }}>{runs.length}</strong> 戦 <strong style={{ fontSize: 24, color: '#c0392b' }}>{wins}</strong> 勝</span>
            {/* ★合計は台帳から（★1 走あたりには割れない） */}
            <span style={{ fontSize: 14 }}>獲得賞金 <strong style={{ fontSize: 24, color: 'var(--u-gold-ink)' }}>{fmt(prizeTotal)}</strong> PP</span>
            <span style={{ marginLeft: 'auto', fontSize: 12, opacity: .75 }}>勝率 {runs.length > 0 ? Math.round((wins / runs.length) * 100) : 0}%</span>
          </div>
          {/* 🔴 ★出していない列を、黙って消さずに言う */}
          <p style={{ margin: 0, padding: '10px 14px', fontSize: 12, opacity: .75, borderTop: '1px solid var(--u-rule)' }}>
            ※ 1 走ごとの賞金は表示していません（サーバー側の源が未確定のため・合計のみ上に出しています）
          </p>
        </section>
      )}
      {data !== null && activeTab === 'ep' && (
        <Ledger title="参加ポイント（EP）の履歴" edge="var(--u-ep)" reasons="配布／調教／出走料／投票／返還ほか" unit="EP" rows={ep} empty="この期間の参加ポイントの動きはありません"
          summary={<>
            <SumCapsule label={`${pl}の消費`} value={epSpent} edge="var(--u-ep)" />
            <SumCapsule label="返還" value={epRefund} edge="var(--u-ep)" />
          </>} />
      )}
      {data !== null && activeTab === 'pp' && (
        <Ledger title="賞金ポイント（PP）の履歴" edge="var(--u-gold)" reasons="賞金／払戻／景品交換" unit="PP" rows={pp} empty="この期間の賞金ポイントの動きはありません"
          summary={<>
            <SumCapsule label={`${pl}の獲得`} value={ppGain} edge="var(--u-gold)" />
            <SumCapsule label="交換" value={ppExch} edge="var(--u-gold)" />
          </>} />
      )}
    </main>
  </div>;
}
