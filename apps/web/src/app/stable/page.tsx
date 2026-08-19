import { demoStableRepo, sortStable, conditionView, fatigueColor, type StableHorse } from '../../lib/stable';
import { ClassChip, FatigueBar, PageTitle, Stars } from '../../components/ui';

export const revalidate = 0;

const COL = { name: 230, cls: 132, stars: 112, cond: 118, fatigue: 132, week: 104 } as const;

/**
 * ★牧場ホーム（わたしの馬）— 正本 design/hud-ds/components/stable-home［アーケード］
 *   所有馬一覧＋今週の予定。未指示の行は黄色い地＋左 5px の黄帯。全頭に指示すると「週を進める」が押せる。
 *   ⚠️ 今はデモデータ（ログインと「自分の馬」ビューの導入まで）。画面は `StableRepo` だけを見る。
 */
function WeekBadge({ horse }: { readonly horse: StableHorse }): React.ReactElement {
  const w = horse.week;
  if (w.kind === 'done') return <span className="a-badge open">指示済み</span>;
  if (w.kind === 'todo') return <span className="a-badge soon">未指示</span>;
  return <span className="a-badge done">休養中</span>;
}

function StatCard({ label, value, unit, color }: { readonly label: string; readonly value: string; readonly unit: string; readonly color: string }): React.ReactElement {
  return (
    <div style={{ minWidth: 170, padding: '10px 18px', borderRadius: 10, background: '#fff', border: '2px solid var(--a-edge)', boxShadow: 'var(--a-shadow-sm)' }}>
      <div className="a-lbl">{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 4 }}>
        <span className="a-num" style={{ fontSize: 40, color }}>{value}</span>
        <span style={{ fontSize: 14, fontWeight: 900, color: 'var(--a-ink-2)' }}>{unit}</span>
      </div>
    </div>
  );
}

export default async function StablePage() {
  const view = await demoStableRepo.stable();
  const horses = sortStable(view.horses);
  const todo = horses.filter((h) => h.week.kind === 'todo');
  const allDone = todo.length === 0;

  return (
    <div style={{ padding: '22px 0 40px' }}>
      <PageTitle
        title="わたしの馬"
        sub={`所有 ${view.horses.length} 頭`}
        right={(
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 40, padding: '0 16px', borderRadius: 10, background: '#fff', border: '2px solid var(--a-edge)', boxShadow: 'var(--a-shadow-sm)' }}>
            <span className="a-lbl">第</span><span className="a-num" style={{ fontSize: 26, color: 'var(--a-num-time)' }}>{view.weekNo}</span><span className="a-lbl">週</span>
          </span>
        )}
      />
      {view.demo && (
        <p style={{ margin: '8px 0 0', fontSize: 12, fontWeight: 900, color: 'var(--a-ink-3)' }}>※ デモデータ（ログインと「自分の馬」の読み取りビューが入るまで、デザインどおりの見本を表示しています）</p>
      )}

      {/* 今週の予定 */}
      <div className="a-panel strong rise" style={{ marginTop: 14 }}>
        <div className="a-band" style={{ height: 40, padding: '0 18px', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 16, fontWeight: 900, letterSpacing: '.14em' }}>今週の予定</span>
          <span style={{ fontSize: 13, fontWeight: 900 }}>{view.weekRange}　次の週送りで調教が反映されます</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '18px 22px', backgroundImage: 'linear-gradient(#ffffff,#eef6fd)', flexWrap: 'wrap' }}>
          <StatCard label="調教の指示" value={`${todo.length} / ${view.horses.length}`} unit="頭 未指示" color={allDone ? 'var(--a-ink)' : 'var(--a-num-rank)'} />
          <StatCard label="出走登録" value={String(view.entries)} unit="頭" color="var(--a-num-time)" />
          <StatCard label="今週の消費予定" value={view.plannedEP.toLocaleString('ja-JP')} unit="EP" color="var(--a-num-money)" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginLeft: 'auto' }}>
            <a className="a-btn a-btn-gold" href="/training" style={{ height: 48, padding: '0 26px', fontSize: 18 }}>調教を指示する</a>
            <span className={`a-btn${allDone ? '' : ' off'}`} style={{ height: 40, padding: '0 26px', fontSize: 15 }} title={allDone ? '' : '全頭に指示すると押せます'}>週を進める</span>
          </div>
        </div>
        {allDone ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, height: 44, padding: '0 18px', backgroundImage: 'linear-gradient(#eefaf1,#dcf3e3)', borderTop: '2px solid #9fd3ae' }}>
            <span className="a-badge open">全頭指示済み</span>
            <span style={{ fontSize: 14, fontWeight: 900, color: 'var(--a-ink)' }}>全頭の指示が完了しました</span>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, height: 44, padding: '0 18px', backgroundImage: 'linear-gradient(#fffbe8,#fff2c8)', borderTop: '2px solid #e6c979' }}>
            <span className="a-badge soon">未指示あり</span>
            <span style={{ fontSize: 14, fontWeight: 900, color: 'var(--a-ink)' }}>{todo.map((h) => h.name).join('・')} の調教が未指示です。全頭に指示すると「週を進める」が押せます</span>
          </div>
        )}
      </div>

      {/* 所有馬一覧 */}
      <div className="a-panel strong" style={{ marginTop: 18 }}>
        <div className="a-band" style={{ height: 38, padding: '0 18px', gap: 14 }}>
          <span className="a-lbl" style={{ width: COL.name, flex: `0 0 ${COL.name}px`, color: '#fff' }}>馬名</span>
          <span className="a-lbl" style={{ width: COL.cls, flex: `0 0 ${COL.cls}px`, color: '#fff' }}>格</span>
          <span className="a-lbl" style={{ width: COL.stars, flex: `0 0 ${COL.stars}px`, color: '#fff' }}>素質</span>
          <span className="a-lbl" style={{ width: COL.cond, flex: `0 0 ${COL.cond}px`, color: '#fff' }}>調子</span>
          <span className="a-lbl" style={{ width: COL.fatigue, flex: `0 0 ${COL.fatigue}px`, color: '#fff' }}>疲労</span>
          <span className="a-lbl" style={{ flex: 1, minWidth: 150, color: '#fff' }}>次走</span>
          <span className="a-lbl" style={{ width: COL.week, flex: `0 0 ${COL.week}px`, textAlign: 'right', color: '#fff' }}>今週</span>
        </div>
        {horses.map((h) => {
          const cond = conditionView(h.condition);
          const todoRow = h.week.kind === 'todo';
          const rest = h.week.kind === 'rest';
          const rowStyle: React.CSSProperties = { height: 70 };
          if (todoRow) { rowStyle.backgroundImage = 'linear-gradient(#fffbe8,#fff5cf)'; rowStyle.boxShadow = 'inset 5px 0 0 #f6c21c'; }
          return (
            <a key={h.id} href={`/stable/${h.id}`} className={`a-row${rest ? ' done' : ''}`} style={rowStyle}>
              <span style={{ width: COL.name, flex: `0 0 ${COL.name}px`, display: 'flex', flexDirection: 'column', gap: 3 }}>
                <span style={{ fontSize: 19, fontWeight: 900, color: 'var(--a-ink)' }}>{h.name}</span>
                <span style={{ fontSize: 12, fontWeight: 900, color: 'var(--a-ink-3)' }}>{h.sexAge}　{h.week.kind === 'done' ? `今週 ${h.week.menu}` : rest ? '今週 休養' : '今週の指示なし'}</span>
              </span>
              <span style={{ width: COL.cls, flex: `0 0 ${COL.cls}px` }}><ClassChip label={h.classLabel} classRank={h.classRank} /></span>
              <span style={{ width: COL.stars, flex: `0 0 ${COL.stars}px` }}><Stars value={h.stars} size={17} /></span>
              <span style={{ width: COL.cond, flex: `0 0 ${COL.cond}px` }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 900, color: cond.color }}><span style={{ fontSize: 16 }}>{cond.mark}</span>{cond.label}</span></span>
              <span style={{ width: COL.fatigue, flex: `0 0 ${COL.fatigue}px` }}><FatigueBar value={h.fatigue} color={fatigueColor(h.fatigue)} /></span>
              <span style={{ flex: 1, minWidth: 150, fontSize: 14, fontWeight: 900, color: h.nextRace === null ? 'var(--a-ink-3)' : 'var(--a-ink)' }}>{h.nextRace ?? (h.classLabel === '新馬' ? 'デビュー戦 未定' : '未定')}</span>
              <span style={{ width: COL.week, flex: `0 0 ${COL.week}px`, display: 'flex', justifyContent: 'flex-end' }}><WeekBadge horse={h} /></span>
            </a>
          );
        })}
        {horses.length === 0 && (
          <p style={{ color: 'var(--a-ink-2)', fontWeight: 900, padding: '16px 20px', fontSize: 14 }}>まだ所有している馬がいません。セリで 1 頭迎えると牧場が始まります</p>
        )}
      </div>
    </div>
  );
}
