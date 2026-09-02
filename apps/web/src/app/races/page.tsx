import { formatDistance, formatRaceTitle, formatClock, SURFACE_LABEL, CONDITION_LABEL } from '../../lib/format';
import { readClient } from '../../lib/supabase';
import { GradeBadge, PageTitle, ReadError, StatusBadge } from '../../components/ui';
import { ClockNow, Countdown } from '../../components/clock';

/** ★毎回サーバーで取り直す（10分ごとに番組が変わるため） */
export const revalidate = 0;

type Row = Record<string, string | number | null>;

const COL = { time: 70, grade: 186, purse: 130, status: 106 } as const;

/**
 * ★番組表（/races）— 正本 design/hud-ds/components/program-board［アーケード］
 *   未ログインの `/` は LP（components/landing）。ログイン後の着地は `/stable`（牧場ホーム・Q-WEB-03）。ここは出走登録／投票の導線から入る
 *   次の発走を主役（赤グロス帯＋青の大きな時刻＋金の賞金箱）に、直近の一覧を下に置く。
 *   確定済みは残すが地色だけで沈める（不透明度は掛けない＝コントラストの二重掛けを避ける）。
 *   ⚠️ 表示だけ。締切・状態はサーバーの `status`。オッズや結果をここで計算しない（正典 §14.3）
 */
export default async function ProgramPage() {
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
    <div style={{ padding: '22px 0 40px' }}>
      <PageTitle title="番組表" sub="10分ごとに1レース" right={<ClockNow />} />

      {next !== undefined && (
        <div className="a-panel strong rise" style={{ marginTop: 14 }}>
          <div className="a-band a-band-red" style={{ height: 40, padding: '0 18px', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 16, fontWeight: 900, letterSpacing: '.14em' }}>次の発走</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, fontWeight: 900 }}>
              <span className="dot blink" style={{ width: 9, height: 9, background: '#fff' }} />
              {next['status'] === 'closed' ? '投票は締め切りました' : '投票締切まで'}
              {next['status'] !== 'closed' && <Countdown untilIso={String(next['scheduled_at'])} after="締切" size={24} color="#fff" />}
            </span>
          </div>
          <div className="pb-next" style={{ display: 'flex', alignItems: 'center', gap: 26, padding: '20px 22px', backgroundImage: 'linear-gradient(#ffffff,#eef6fd)', flexWrap: 'wrap' }}>
            <div className="pb-next-time" style={{ textAlign: 'center' }}>
              <div className="a-lbl">発走時刻</div>
              <div className="a-num" style={{ fontSize: 64, color: 'var(--a-num-time)', textShadow: '0 2px 0 #fff, 0 3px 0 var(--a-edge-soft)' }}>{formatClock(String(next['scheduled_at']))}</div>
            </div>
            <div className="hide-narrow" style={{ width: 3, alignSelf: 'stretch', background: 'var(--a-line)', borderRadius: 2 }} />
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <GradeBadge label={formatRaceTitle(Number(next['class_rank']), next['grade'] as string | null)} h={28} />
                <span style={{ fontSize: 34, fontWeight: 900, color: 'var(--a-ink)' }}>{String(next['name'] ?? '')}</span>
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
                <span className="a-chip" style={{ height: 28, padding: '0 12px', fontSize: 13 }}>{SURFACE_LABEL[String(next['surface'])]} {formatDistance(Number(next['distance']))}</span>
                <span className="a-chip" style={{ height: 28, padding: '0 12px', fontSize: 13 }}>馬場 {CONDITION_LABEL[String(next['track_condition'])]}</span>
                <StatusBadge status={String(next['status'])} />
              </div>
            </div>
            <div className="pb-next-purse" style={{ marginLeft: 'auto', textAlign: 'center', padding: '8px 18px', borderRadius: 10, backgroundImage: 'var(--a-gloss-gold)', border: '2px solid #8a5a06', boxShadow: 'var(--a-shadow-sm)' }}>
              <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: '.12em', color: '#4a3105' }}>1着賞金</div>
              <div style={{ marginTop: 2 }}>
                <span className="a-num" style={{ fontSize: 38, color: '#4a3105' }}>{Number(next['purse']).toLocaleString('ja-JP')}</span>
                <span style={{ fontSize: 13, fontWeight: 900, color: '#4a3105', marginLeft: 6 }}>PP</span>
              </div>
            </div>
            <div className="pb-next-cta" style={{ display: 'flex', flexDirection: 'column', gap: 10, marginLeft: 20 }}>
              <a className="a-btn a-btn-gold" href={`/races/${String(next['id'])}`} style={{ height: 48, padding: '0 26px', fontSize: 18 }}>出馬表</a>
              <a className="a-btn" href={`/races/${String(next['id'])}/odds`} style={{ height: 40, padding: '0 26px', fontSize: 15 }}>オッズ</a>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, height: 38, padding: '0 22px', background: 'var(--a-ivory)', borderTop: '2px solid var(--a-line)' }}>
            <span style={{ fontSize: 13, fontWeight: 900, color: 'var(--a-ink-2)' }}>締切後はオッズが確定し、確定後に着順と払戻が出ます</span>
          </div>
        </div>
      )}

      <div className="a-panel strong" style={{ marginTop: 18 }}>
        <div className="a-band hide-narrow" style={{ height: 38, padding: '0 18px', gap: 14 }}>
          <span className="a-lbl" style={{ width: COL.time, flex: `0 0 ${COL.time}px`, color: '#fff' }}>発走</span>
          <span className="a-lbl" style={{ width: COL.grade, flex: `0 0 ${COL.grade}px`, color: '#fff' }}>格</span>
          <span className="a-lbl" style={{ flex: 1, minWidth: 170, color: '#fff' }}>コース</span>
          <span className="a-lbl" style={{ width: COL.purse, flex: `0 0 ${COL.purse}px`, textAlign: 'right', color: '#fff' }}>1着賞金</span>
          <span className="a-lbl" style={{ width: COL.status, flex: `0 0 ${COL.status}px`, textAlign: 'right', color: '#fff' }}>状態</span>
        </div>
        {races.map((r) => {
          const done = r['status'] === 'settled' || r['status'] === 'cancelled';
          const top = Number(r['class_rank']) >= 5;
          return (
            <a key={String(r['id'])} href={`/races/${String(r['id'])}`} className={`a-row pb-row${done ? ' done' : ''}`} style={{ height: 58 }}>
              <span className="a-num pb-cell-time" style={{ width: COL.time, flex: `0 0 ${COL.time}px`, fontSize: 26, color: 'var(--a-num-time)' }}>{formatClock(String(r['scheduled_at']))}</span>
              <span className="pb-cell-grade" style={{ width: COL.grade, flex: `0 0 ${COL.grade}px`, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className={`a-chip${top ? ' gold' : ''}`} style={{ height: 24, padding: '0 10px', fontSize: 12 }}>{formatRaceTitle(Number(r['class_rank']), r['grade'] as string | null)}</span>
                {r['grade'] ? <span style={{ fontSize: 14, fontWeight: 900, color: 'var(--a-ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{String(r['name'] ?? '')}</span> : null}
              </span>
              <span className="pb-cell-course" style={{ flex: 1, minWidth: 170, fontSize: 15, fontWeight: 900, color: 'var(--a-ink)', whiteSpace: 'nowrap' }}>
                {SURFACE_LABEL[String(r['surface'])]} {formatDistance(Number(r['distance']))}
                <span style={{ marginLeft: 10, fontSize: 13, color: 'var(--a-ink-3)' }}>馬場 {CONDITION_LABEL[String(r['track_condition'])]}</span>
              </span>
              <span className="pb-cell-purse" style={{ width: COL.purse, flex: `0 0 ${COL.purse}px`, textAlign: 'right', fontSize: 13, fontWeight: 900, color: 'var(--a-ink-2)' }}>
                <span className="a-num" style={{ fontSize: 21, color: 'var(--a-num-money)' }}>{Number(r['purse']).toLocaleString('ja-JP')}</span> PP
              </span>
              <span className="pb-cell-status" style={{ width: COL.status, flex: `0 0 ${COL.status}px`, display: 'flex', justifyContent: 'flex-end' }}><StatusBadge status={String(r['status'])} /></span>
            </a>
          );
        })}
        {races.length === 0 && (
          <p style={{ color: 'var(--a-ink-2)', fontWeight: 900, padding: '16px 20px' }}>次の番組を編成中です。</p>
        )}
      </div>
    </div>
  );
}
