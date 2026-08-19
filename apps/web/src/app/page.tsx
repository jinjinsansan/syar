import { formatDistance, formatRaceTitle, formatClock, SURFACE_LABEL, CONDITION_LABEL } from '../lib/format';
import { readClient } from '../lib/supabase';
import { GradeBadge, PageTitle, ReadError, StatusBadge } from '../components/ui';
import { ClockNow, Countdown } from '../components/clock';

/** ★毎回サーバーで取り直す（10分ごとに番組が変わるため） */
export const revalidate = 0;

type Row = Record<string, string | number | null>;

/**
 * ★番組表（トップ）— 正本 design/hud-ds/components/program-board
 *   次の発走を主役に、直近の一覧を下に置く。確定済みは残すが沈める（過去を消さない）。
 *   ⚠️ 表示だけ。締切・状態はサーバーの `status`。オッズや結果をここで計算しない（正典 §14.3）
 */
export default async function Home() {
  const c = readClient();
  // 直近 24 レース（新しい順に取り、時刻順に並べ直す）。古い方から 20 件を取ると過去だけになる
  const { data, error } = await c
    .from('races_public')
    .select('*')
    .order('scheduled_at', { ascending: false })
    .limit(24);
  if (error) return <ReadError message={error.message} />;
  const all = ((data ?? []) as Row[]).slice().reverse();
  const firstLive = all.findIndex((r) => r['status'] === 'scheduled' || r['status'] === 'closed');
  // 確定済みは直近 6 件だけ残して沈める（過去を消さない・並びは時刻順）
  const races = firstLive < 0 ? all.slice(-6) : all.slice(Math.max(0, firstLive - 6));
  const next = races.find((r) => r['status'] === 'scheduled' || r['status'] === 'closed');

  return (
    <div style={{ padding: '28px 40px 40px' }}>
      <PageTitle title="番組表" sub="10分ごとに1レース" right={<ClockNow />} />

      {next !== undefined && (
        <div className="board rise" style={{ position: 'relative', marginTop: 18, overflow: 'hidden' }}>
          <div className="edge" />
          <div style={{ display: 'flex', alignItems: 'center', gap: 34, padding: '22px 26px', flexWrap: 'wrap' }}>
            <div>
              <div className="lbl" style={{ color: 'var(--gold)' }}>次の発走</div>
              <div className="num plate" style={{ fontSize: 64, marginTop: 4 }}>{formatClock(String(next['scheduled_at']))}</div>
            </div>
            <div style={{ width: 1, height: 88, background: 'var(--rule)' }} className="hide-narrow" />
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <GradeBadge label={formatRaceTitle(Number(next['class_rank']), next['grade'] as string | null)} />
                <span style={{ fontSize: 30, fontWeight: 900 }}>{String(next['name'] ?? '')}</span>
              </div>
              <div style={{ display: 'flex', gap: 22, marginTop: 10, fontSize: 15, color: 'var(--paper-70)', flexWrap: 'wrap' }}>
                <span>{SURFACE_LABEL[String(next['surface'])]} {formatDistance(Number(next['distance']))}</span>
                <span>馬場 {CONDITION_LABEL[String(next['track_condition'])]}</span>
                <span><StatusBadge status={String(next['status'])} /></span>
              </div>
            </div>
            <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
              <div className="lbl">賞金</div>
              <div style={{ fontSize: 15, marginTop: 2 }}>
                <span className="num" style={{ fontSize: 28, color: 'var(--gold)' }}>{Number(next['purse']).toLocaleString('ja-JP')}</span> PP
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginLeft: 26 }}>
              <a className="chip-gold" href={`/races/${String(next['id'])}`} style={{ height: 40 }}><span className="unskew">出馬表</span></a>
              <a className="chip-glass" href={`/races/${String(next['id'])}/odds`}><span className="unskew">オッズ</span></a>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, height: 38, padding: '0 26px', background: 'rgba(255,77,61,.12)', borderTop: '1px solid var(--rule)' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, color: 'var(--bad)', fontSize: 12, letterSpacing: '.1em' }}>
              <span className="dot blink" style={{ background: 'var(--bad)' }} />発走まで
            </span>
            <Countdown untilIso={String(next['scheduled_at'])} after="発走時刻になりました" />
            <span style={{ fontSize: 13, color: 'var(--paper-70)' }}>締切後はオッズが確定し、確定後に着順と払戻が出ます</span>
          </div>
        </div>
      )}

      <div className="panel" style={{ marginTop: 26 }}>
        <div style={{ display: 'flex', alignItems: 'center', height: 34, padding: '0 20px', gap: 18 }}>
          <span className="lbl" style={{ width: 66 }}>発走</span>
          <span className="lbl" style={{ width: 190 }}>格</span>
          <span className="lbl" style={{ flex: 1 }}>コース</span>
          <span className="lbl" style={{ width: 130, textAlign: 'right' }}>賞金</span>
          <span className="lbl" style={{ width: 96, textAlign: 'right' }}>状態</span>
        </div>
        {races.map((r) => {
          const done = r['status'] === 'settled' || r['status'] === 'cancelled';
          return (
            <a key={String(r['id'])} href={`/races/${String(r['id'])}`} className={`row-link${done ? ' done' : ''}`}>
              <span className="num" style={{ width: 66, fontSize: 22 }}>{formatClock(String(r['scheduled_at']))}</span>
              <span style={{ width: 190, fontSize: 15 }}>
                {formatRaceTitle(Number(r['class_rank']), r['grade'] as string | null)}
                {r['grade'] ? <span style={{ color: 'var(--gold)', marginLeft: 8 }}>{String(r['name'] ?? '')}</span> : null}
              </span>
              <span style={{ flex: 1, fontSize: 15, color: 'var(--paper-70)' }}>
                {SURFACE_LABEL[String(r['surface'])]} {formatDistance(Number(r['distance']))}
                <span style={{ marginLeft: 10, opacity: .7 }}>馬場 {CONDITION_LABEL[String(r['track_condition'])]}</span>
              </span>
              <span style={{ width: 130, textAlign: 'right', fontSize: 14 }}>
                <span className="num" style={{ fontSize: 17 }}>{Number(r['purse']).toLocaleString('ja-JP')}</span> PP
              </span>
              <span style={{ width: 96, display: 'flex', justifyContent: 'flex-end' }}><StatusBadge status={String(r['status'])} /></span>
            </a>
          );
        })}
        {races.length === 0 && (
          <p style={{ color: 'var(--paper-70)', padding: '16px 20px' }}>次の番組を編成中です。</p>
        )}
      </div>
    </div>
  );
}
