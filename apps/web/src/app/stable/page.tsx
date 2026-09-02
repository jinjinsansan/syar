import { demoStableRepo, sortStable, conditionView, fatigueColor, type StableHome, type StableHorse } from '../../lib/stable';
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

/** 4 カード共通の外枠（白地・2px 縁・青グロス帯 h38。馬と調教が主役のまま、カードは補助 — R-4） */
function HomeCard({ title, badge, children }: { readonly title: string; readonly badge?: React.ReactNode; readonly children: React.ReactNode }): React.ReactElement {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', borderRadius: 10, overflow: 'hidden', background: '#fff', border: '2px solid var(--a-edge)', boxShadow: 'var(--a-shadow-sm)' }}>
      <div className="a-band" style={{ height: 38, padding: '0 14px', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 15, fontWeight: 900, letterSpacing: '.08em' }}>{title}</span>
        {badge}
      </div>
      <div style={{ padding: '12px 14px 14px', flex: 1, display: 'flex', flexDirection: 'column' }}>{children}</div>
    </div>
  );
}

/** カード内の小さな数値マス（ラベル 10px＋数値） */
function MiniStat({ label, value, unit, color, size = 26 }: { readonly label: string; readonly value: number; readonly unit: string; readonly color: string; readonly size?: number }): React.ReactElement {
  return (
    <span style={{ flex: 1, textAlign: 'center', padding: '8px 6px', borderRadius: 8, background: '#fff', border: '2px solid var(--a-edge)' }}>
      <span style={{ display: 'block', fontSize: 10, fontWeight: 900, color: 'var(--a-ink-2)' }}>{label}</span>
      <span className="a-num" style={{ fontSize: size, color }}>{value}</span> <span style={{ fontSize: 11, fontWeight: 900, color: 'var(--a-ink-2)' }}>{unit}</span>
    </span>
  );
}

/**
 * ★会員ホームの 4 カード（R-4・裁定 Q-WEB-03）— 「今週の予定」板の上。着地は /stable のまま（着地＝何のゲームかの宣言）。
 *   EP と PP は別カプセル（合算しない・憲法 §0.2）。デイリー額は D-075 の較正定数＝サーバー値をそのまま表示。
 */
function HomeCards({ home, ownedCount, todoCount }: { readonly home: StableHome; readonly ownedCount: number; readonly todoCount: number }): React.ReactElement {
  return (
    <div className="a-cards" style={{ marginTop: 14 }}>
      {/* ① アカウント */}
      <HomeCard
        title="アカウント"
        badge={home.notices > 0 ? (
          <span style={{ display: 'flex', alignItems: 'center', height: 22, padding: '0 9px', borderRadius: 6, backgroundImage: 'var(--a-gloss-red)', border: '2px solid var(--a-red-d)', fontSize: 11, fontWeight: 900 }}>お知らせ {home.notices}</span>
        ) : undefined}
      >
        <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--a-ink)' }}>{home.stableName}</div>
        <div style={{ fontSize: 12, fontWeight: 900, color: 'var(--a-ink-3)', marginTop: 3 }}>{home.displayName}</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2, padding: '7px 10px', borderRadius: 8, background: '#fff', border: '2px solid var(--a-edge)' }}>
            <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: '.06em', color: 'var(--a-ink-2)' }}>参加ポイント</span>
            <span><span className="a-num" style={{ fontSize: 22, color: 'var(--a-blue-d)' }}>{home.epBalance.toLocaleString('ja-JP')}</span> <span style={{ fontSize: 10, fontWeight: 900, color: 'var(--a-ink-2)' }}>EP</span></span>
          </span>
          <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2, padding: '7px 10px', borderRadius: 8, backgroundImage: 'var(--a-gloss-gold)', border: '2px solid #8a5a06' }}>
            <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: '.06em', color: '#4a3105' }}>賞金ポイント</span>
            <span><span className="a-num" style={{ fontSize: 22, color: '#4a3105' }}>{home.ppBalance.toLocaleString('ja-JP')}</span> <span style={{ fontSize: 10, fontWeight: 900, color: '#4a3105' }}>PP</span></span>
          </span>
        </div>
        {home.dailyClaimed ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 12, padding: '9px 11px', borderRadius: 8, background: '#eefaf1', border: '2px solid var(--a-green-d)' }}>
            <span style={{ width: 22, height: 22, borderRadius: 5, backgroundImage: 'var(--a-gloss-green)', border: '2px solid var(--a-green-d)', color: '#fff', fontSize: 12, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✓</span>
            <span style={{ fontSize: 12, fontWeight: 900, color: 'var(--a-green-d)' }}>今日の {home.dailyEP} EP 受取済み</span>
          </div>
        ) : (
          <span className="a-btn a-btn-gold" style={{ width: '100%', height: 38, marginTop: 12, fontSize: 13, whiteSpace: 'nowrap' }}>今日の {home.dailyEP} EP を受け取る</span>
        )}
      </HomeCard>

      {/* ② わたしの牧場（現役 0 頭なら再付与ボタンに切り替え — D-074） */}
      <HomeCard title="わたしの牧場">
        {ownedCount === 0 ? (
          <>
            <div style={{ fontSize: 13, fontWeight: 900, color: 'var(--a-ink-2)', lineHeight: 1.7 }}>現役の馬がいません。新しい 1 頭を無償で迎えられます</div>
            <a className="a-btn a-btn-gold" href="/setup" style={{ width: '100%', height: 40, marginTop: 'auto', fontSize: 13, whiteSpace: 'nowrap' }}>新しい 1 頭を迎える</a>
          </>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 8 }}>
              <MiniStat label="所有" value={ownedCount} unit="頭" color="var(--a-ink)" />
              <MiniStat label="今週の未指示" value={todoCount} unit="頭" color={todoCount > 0 ? 'var(--a-num-rank)' : 'var(--a-ink)'} />
            </div>
            <div style={{ marginTop: 12, padding: '9px 11px', borderRadius: 8, background: 'var(--a-ivory)', border: '2px solid var(--a-line)' }}>
              <span style={{ display: 'block', fontSize: 10, fontWeight: 900, letterSpacing: '.06em', color: 'var(--a-ink-2)' }}>次走</span>
              {home.nextRun !== null ? (
                <span style={{ fontSize: 14, fontWeight: 900, color: 'var(--a-ink)' }}>{home.nextRun.race}　{home.nextRun.horse}</span>
              ) : (
                <span style={{ fontSize: 14, fontWeight: 900, color: 'var(--a-ink-3)' }}>出走予定はありません</span>
              )}
            </div>
            <a className="a-btn" href="#horses" style={{ width: '100%', height: 40, marginTop: 12, fontSize: 13, whiteSpace: 'nowrap' }}>わたしの馬を見る</a>
          </>
        )}
      </HomeCard>

      {/* ③ 開催状況（数字は青／締切は赤。0 件でも欄を消さない） */}
      <HomeCard title="開催状況">
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12 }}>
          <span>
            <span style={{ display: 'block', fontSize: 10, fontWeight: 900, letterSpacing: '.06em', color: 'var(--a-ink-2)' }}>次の発走</span>
            <span className="a-num" style={{ fontSize: 34, color: 'var(--a-num-time)' }}>{home.nextStartAt ?? '—'}</span>
          </span>
          <span style={{ marginLeft: 'auto', textAlign: 'right' }}>
            <span style={{ display: 'block', fontSize: 10, fontWeight: 900, letterSpacing: '.06em', color: 'var(--a-ink-2)' }}>締切まで</span>
            <span className="a-num" style={{ fontSize: 26, color: 'var(--a-num-rank)' }}>{home.closesIn ?? '—'}</span>
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <MiniStat label="自馬の出走予定" value={home.myEntries} unit="件" color={home.myEntries > 0 ? 'var(--a-num-time)' : 'var(--a-ink-3)'} size={24} />
          <MiniStat label="投票中の馬券" value={home.pendingBets} unit="件" color={home.pendingBets > 0 ? 'var(--a-num-time)' : 'var(--a-ink-3)'} size={24} />
        </div>
        <a className={`a-btn a-btn-blue${home.liveOpen ? '' : ' off'}`} href="/race" style={{ width: '100%', height: 40, marginTop: 12, fontSize: 13, whiteSpace: 'nowrap' }} title={home.liveOpen ? '' : '発走 3 分前から観られます'}>中継を観る</a>
      </HomeCard>

      {/* ④ ショートカット（先頭「調教」だけ金＝毎日の起点） */}
      <HomeCard title="ショートカット">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <a className="a-btn a-btn-gold" href="/training" style={{ width: '100%', height: 38, fontSize: 14, whiteSpace: 'nowrap' }}>調教</a>
          <a className="a-btn" href="/entry" style={{ width: '100%', height: 38, fontSize: 14, whiteSpace: 'nowrap' }}>出走登録</a>
          <a className="a-btn" href="/races" style={{ width: '100%', height: 38, fontSize: 14, whiteSpace: 'nowrap' }}>番組表</a>
          <a className="a-btn" href="/records" style={{ width: '100%', height: 38, fontSize: 14, whiteSpace: 'nowrap' }}>記録</a>
          <a className="a-btn" href="/prizes" style={{ width: '100%', height: 38, fontSize: 14, whiteSpace: 'nowrap' }}>景品交換</a>
        </div>
      </HomeCard>
    </div>
  );
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

      {/* 会員ホームの 4 カード（R-4）— 馬と調教が主役のまま、カードは補助 */}
      <HomeCards home={view.home} ownedCount={view.horses.length} todoCount={todo.length} />

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
      <div id="horses" className="a-panel strong" style={{ marginTop: 18 }}>
        <div className="a-band hide-narrow" style={{ height: 38, padding: '0 18px', gap: 14 }}>
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
            <a key={h.id} href={`/stable/${h.id}`} className={`a-row sh-row${rest ? ' done' : ''}`} style={rowStyle}>
              <span className="sh-name" style={{ width: COL.name, flex: `0 0 ${COL.name}px`, display: 'flex', flexDirection: 'column', gap: 3 }}>
                <span style={{ fontSize: 19, fontWeight: 900, color: 'var(--a-ink)' }}>{h.name}</span>
                <span style={{ fontSize: 12, fontWeight: 900, color: 'var(--a-ink-3)' }}>{h.sexAge}　{h.week.kind === 'done' ? `今週 ${h.week.menu}` : rest ? '今週 休養' : '今週の指示なし'}</span>
              </span>
              <span className="sh-cls" style={{ width: COL.cls, flex: `0 0 ${COL.cls}px` }}><ClassChip label={h.classLabel} classRank={h.classRank} /></span>
              <span className="sh-stars" style={{ width: COL.stars, flex: `0 0 ${COL.stars}px` }}><Stars value={h.stars} size={17} /></span>
              <span className="sh-cond" style={{ width: COL.cond, flex: `0 0 ${COL.cond}px` }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 900, color: cond.color }}><span style={{ fontSize: 16 }}>{cond.mark}</span>{cond.label}</span></span>
              <span className="sh-fatigue" style={{ width: COL.fatigue, flex: `0 0 ${COL.fatigue}px` }}><FatigueBar value={h.fatigue} color={fatigueColor(h.fatigue)} /></span>
              <span className="sh-next" style={{ flex: 1, minWidth: 150, fontSize: 14, fontWeight: 900, color: h.nextRace === null ? 'var(--a-ink-3)' : 'var(--a-ink)' }}>{h.nextRace ?? (h.classLabel === '新馬' ? 'デビュー戦 未定' : '未定')}</span>
              <span className="sh-week" style={{ width: COL.week, flex: `0 0 ${COL.week}px`, display: 'flex', justifyContent: 'flex-end' }}><WeekBadge horse={h} /></span>
            </a>
          );
        })}
        {/* ★空状態の文言はカードの「セリで…」から改めている: セリは作らない（裁定 Q-WEB-01）。再付与は D-074 */}
        {horses.length === 0 && (
          <p style={{ color: 'var(--a-ink-2)', fontWeight: 900, padding: '16px 20px', fontSize: 14 }}>まだ所有している馬がいません。新しい 1 頭を無償で迎えると牧場が始まります</p>
        )}
      </div>
    </div>
  );
}
