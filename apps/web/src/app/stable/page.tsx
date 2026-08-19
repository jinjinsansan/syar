import { demoStableRepo, sortStable, conditionView, fatigueColor, type StableHorse } from '../../lib/stable';
import { ClassChip, FatigueBar, PageTitle, Stars } from '../../components/ui';

export const revalidate = 0;

/**
 * ★牧場ホーム（わたしの馬）— 正本 design/hud-ds/components/stable-home
 *   所有馬一覧＋今週の予定。未指示の馬に黄色いバッジ。全頭に指示すると「週を進める」が押せる。
 *   ⚠️ 今はデモデータ（ログインと「自分の馬」ビューの導入まで）。画面は `StableRepo` だけを見る。
 */
function WeekBadge({ horse }: { readonly horse: StableHorse }): React.ReactElement {
  const w = horse.week;
  const style: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', height: 24, padding: '0 11px', fontSize: 12, fontWeight: 700, letterSpacing: '.06em' };
  if (w.kind === 'done') return <span style={{ ...style, background: 'rgba(95,212,139,.12)', color: '#5fd48b' }}>指示済み</span>;
  if (w.kind === 'todo') return <span style={{ ...style, background: 'rgba(250,215,40,.16)', color: '#fad728' }}>未指示</span>;
  return <span style={{ ...style, background: 'transparent', color: 'var(--paper-45)', border: '1px solid var(--rule)' }}>休養中</span>;
}

export default async function StablePage() {
  const view = await demoStableRepo.stable();
  const horses = sortStable(view.horses);
  const todo = horses.filter((h) => h.week.kind === 'todo');
  const allDone = todo.length === 0;

  return (
    <div style={{ padding: '28px 0 40px' }}>
      <PageTitle
        title="わたしの馬"
        sub={`所有 ${view.horses.length} 頭`}
        right={<span style={{ fontSize: 14, color: 'var(--paper-70)' }}>第 <span className="num" style={{ fontSize: 19, color: 'var(--paper)' }}>{view.weekNo}</span> 週　—　次の週送りで調教が反映されます</span>}
      />
      {view.demo && (
        <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--paper-45)' }}>※ デモデータ（ログインと「自分の馬」の読み取りビューが入るまで、デザインどおりの見本を表示しています）</p>
      )}

      {/* 今週の予定 */}
      <div className="board rise" style={{ marginTop: 18 }}>
        <div className="edge" />
        <div style={{ display: 'flex', alignItems: 'center', gap: 30, padding: '20px 26px', flexWrap: 'wrap' }}>
          <div>
            <div className="lbl" style={{ color: 'var(--gold)' }}>今週の予定</div>
            <div style={{ fontSize: 26, fontWeight: 900, marginTop: 6 }}>第 {view.weekNo} 週</div>
            <div style={{ fontSize: 13, color: 'var(--paper-70)', marginTop: 4 }}>{view.weekRange}</div>
          </div>
          <div style={{ width: 1, height: 78, background: 'var(--rule)' }} className="hide-narrow" />
          <div style={{ display: 'flex', gap: 34, flexWrap: 'wrap' }}>
            <div><div className="lbl">調教の指示</div><div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 6 }}><span className="num" style={{ fontSize: 30, color: allDone ? 'var(--paper)' : '#fad728' }}>{todo.length}</span><span style={{ fontSize: 14, color: 'var(--paper-70)' }}>/ {view.horses.length} 頭 未指示</span></div></div>
            <div><div className="lbl">出走登録</div><div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 6 }}><span className="num" style={{ fontSize: 30 }}>{view.entries}</span><span style={{ fontSize: 14, color: 'var(--paper-70)' }}>頭</span></div></div>
            <div><div className="lbl">今週の消費予定</div><div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 6 }}><span className="num" style={{ fontSize: 30 }}>{view.plannedEP.toLocaleString('ja-JP')}</span><span style={{ fontSize: 14, color: 'var(--paper-70)' }}>EP</span></div></div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginLeft: 'auto' }}>
            <span className="chip-gold" style={{ height: 40, fontSize: 16 }} title="調教画面は準備中"><span className="unskew">調教を指示する</span></span>
            <span className={allDone ? 'chip-glass' : 'chip-off'} style={{ height: 36 }} title={allDone ? '' : '全頭に指示すると押せます'}><span className="unskew">週を進める</span></span>
          </div>
        </div>
        {allDone ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, height: 38, padding: '0 26px', background: 'rgba(95,212,139,.1)', borderTop: '1px solid var(--rule)' }}>
            <span style={{ fontSize: 12, letterSpacing: '.08em', color: '#5fd48b' }}>全頭指示済み</span>
            <span style={{ fontSize: 13, color: 'var(--paper-70)' }}>全頭の指示が完了しました</span>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, height: 38, padding: '0 26px', background: 'rgba(250,215,40,.1)', borderTop: '1px solid var(--rule)' }}>
            <span style={{ fontSize: 12, letterSpacing: '.08em', color: '#fad728' }}>未指示あり</span>
            <span style={{ fontSize: 13, color: 'var(--paper-70)' }}>{todo.map((h) => h.name).join('・')} の調教が未指示です。全頭に指示すると「週を進める」が押せます</span>
          </div>
        )}
      </div>

      {/* 所有馬一覧 */}
      <div className="panel" style={{ marginTop: 26 }}>
        <div style={{ display: 'flex', alignItems: 'center', height: 34, padding: '0 20px', gap: 16 }}>
          <span className="lbl" style={{ width: 216 }}>馬名</span>
          <span className="lbl" style={{ width: 132 }}>格</span>
          <span className="lbl" style={{ width: 104 }}>素質</span>
          <span className="lbl" style={{ width: 104 }}>調子</span>
          <span className="lbl" style={{ width: 112 }}>疲労</span>
          <span className="lbl" style={{ flex: 1 }}>次走</span>
          <span className="lbl" style={{ width: 88, textAlign: 'right' }}>今週</span>
        </div>
        {horses.map((h) => {
          const cond = conditionView(h.condition);
          const todoRow = h.week.kind === 'todo';
          return (
            <a key={h.id} href={`/stable/${h.id}`} className="row-link" style={{ height: 64, boxShadow: todoRow ? 'inset 3px 0 0 #fad728' : undefined }}>
              <span style={{ width: 216, display: 'flex', flexDirection: 'column', gap: 3 }}>
                <span style={{ fontSize: 17, fontWeight: 900 }}>{h.name}</span>
                <span style={{ fontSize: 12, color: 'var(--paper-45)' }}>{h.sexAge}　{h.week.kind === 'done' ? `今週 ${h.week.menu}` : h.week.kind === 'rest' ? '今週 休養' : '今週の指示なし'}</span>
              </span>
              <span style={{ width: 132 }}><ClassChip label={h.classLabel} classRank={h.classRank} /></span>
              <span style={{ width: 104 }}><Stars value={h.stars} /></span>
              <span style={{ width: 104 }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: cond.color }}><span style={{ fontSize: 15 }}>{cond.mark}</span>{cond.label}</span></span>
              <span style={{ width: 112 }}><FatigueBar value={h.fatigue} color={fatigueColor(h.fatigue)} /></span>
              <span style={{ flex: 1, fontSize: 14, color: h.nextRace === null ? 'var(--paper-45)' : 'var(--paper-70)' }}>{h.nextRace ?? (h.classLabel === '新馬' ? 'デビュー戦 未定' : '未定')}</span>
              <span style={{ width: 88, display: 'flex', justifyContent: 'flex-end' }}><WeekBadge horse={h} /></span>
            </a>
          );
        })}
        {horses.length === 0 && (
          <p style={{ color: 'var(--paper-70)', padding: '16px 20px', fontSize: 14 }}>まだ所有している馬がいません。セリで 1 頭迎えると牧場が始まります</p>
        )}
      </div>
    </div>
  );
}
