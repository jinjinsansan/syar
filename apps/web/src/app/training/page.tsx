'use client';

/**
 * ★調教（週送り）— 正本 design/hud-ds/components/training［アーケード］
 *   左に馬の選択（未指示が上）、右に馬カード＋8 メニュー＋指示バー。全頭指示で「週を進める」が有効。
 *   ⚠️ 今はデモデータ。指示の書き込み（spend_training_ep）と週送りはサーバー RPC に繋ぐまで押しても何も起きない。
 *   ⚠️ 疲労の遷移・注意文・警告帯の条件はサーバーが返す前提（ここでは見本の値）。画面で式を作らない。
 */
import { useMemo, useState } from 'react';
import { sortStable, conditionView, DEMO_HORSES } from '../../lib/stable';
import { TRAINING_MENUS, DEMO_TRAINING_STATS, demoFatigueNote } from '../../lib/game-demo';
import { Capsule, ClassChip, FatigueBar, PageTitle, Pill, StatBar, Stars } from '../../components/ui';

const WEEK_NO = 32;
const DEFAULT_STATS = [
  { label: 'スピード', value: 500, capRatio: 0.7 }, { label: 'スタミナ', value: 500, capRatio: 0.7 }, { label: 'パワー', value: 500, capRatio: 0.7 },
  { label: '根性', value: 500, capRatio: 0.7 }, { label: '賢さ', value: 500, capRatio: 0.7 },
];

/** 疲労の数値色（18px は large text 扱いにならないため黄は濃い #8a5a06）: ≤30 緑／≤60 #8a5a06／>60 赤 */
function fatigueNumColor(f: number): string {
  return f <= 30 ? '#1e7a3a' : f <= 60 ? '#8a5a06' : '#a81a13';
}

function WeekPill({ kind }: { readonly kind: 'todo' | 'done' | 'rest' }): React.ReactElement {
  if (kind === 'todo') return <Pill tone="yellow">未指示</Pill>;
  if (kind === 'done') return <Pill tone="green">指示済み</Pill>;
  return <Pill tone="grey">休養中</Pill>;
}

export default function TrainingPage(): React.ReactElement {
  const horses = useMemo(() => sortStable(DEMO_HORSES), []);
  const [selectedHorse, setSelectedHorse] = useState<string | null>(horses.find((h) => h.week.kind === 'todo')?.id ?? null);
  const [selectedMenu, setSelectedMenu] = useState<string | null>('hill');
  const horse = horses.find((h) => h.id === selectedHorse) ?? null;
  const menu = TRAINING_MENUS.find((m) => m.id === selectedMenu) ?? null;
  const todo = horses.filter((h) => h.week.kind === 'todo');
  const allDone = todo.length === 0;
  const stats = horse === null ? DEFAULT_STATS : (DEMO_TRAINING_STATS[horse.id] ?? DEFAULT_STATS);
  const note = horse === null ? null : demoFatigueNote(horse.fatigue);
  const cond = horse === null ? null : conditionView(horse.condition);
  const selectable = horses.filter((h) => h.week.kind !== 'rest');
  const canInstruct = horse !== null && menu !== null;

  return (
    <div style={{ padding: '22px 0 40px' }}>
      <PageTitle
        title="調教"
        sub="1 週に 1 回、各馬にメニューを指示します"
        right={(
          <span style={{ display: 'inline-flex', gap: 10 }}>
            <Capsule label="週" value={String(WEEK_NO)} />
            <Capsule label="未指示" value={String(todo.length)} color={todo.length > 0 ? 'var(--a-num-rank)' : 'var(--a-ink)'} />
          </span>
        )}
      />
      <p style={{ margin: '8px 0 0', fontSize: 12, fontWeight: 900, color: 'var(--a-ink-3)' }}>※ デモデータ（指示の保存と週送りはサーバー RPC に接続するまで動きません）</p>

      <div style={{ display: 'flex', gap: 16, marginTop: 14, alignItems: 'flex-start' }}>
        {/* 左: 馬の選択 */}
        <div className="a-panel strong" style={{ width: 290, flex: '0 0 290px' }}>
          <div className="a-band" style={{ height: 38, padding: '0 14px', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 15, fontWeight: 900, letterSpacing: '.1em' }}>馬を選ぶ</span>
            <span style={{ fontSize: 12, fontWeight: 900 }}>{horses.length} 頭</span>
          </div>
          {horses.map((h) => {
            const sel = h.id === selectedHorse;
            const rest = h.week.kind === 'rest';
            return (
              <div key={h.id} onClick={() => { if (!rest) setSelectedHorse(h.id); }} style={{
                display: 'flex', flexDirection: 'column', gap: 6, padding: '12px 14px', borderTop: '1px solid var(--a-line)', cursor: rest ? 'default' : 'pointer',
                background: sel ? 'linear-gradient(#fffdf2,#fff3cf)' : rest ? '#e7edf3' : '#fff', boxShadow: sel ? 'inset 5px 0 0 #f2b012' : undefined,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 16, fontWeight: 900 }}>{h.name}</span>
                  <span style={{ marginLeft: 'auto' }}><WeekPill kind={h.week.kind} /></span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <ClassChip label={h.classLabel} classRank={h.classRank} />
                  <span style={{ marginLeft: 'auto' }}><FatigueBar value={h.fatigue} width={60} color={fatigueNumColor(h.fatigue)} /></span>
                </div>
                {h.week.kind === 'done' && <div style={{ fontSize: 12, fontWeight: 900, color: 'var(--a-ink-3)' }}>今週 {h.week.menu}</div>}
              </div>
            );
          })}
          {selectable.length === 0 && <p style={{ margin: 0, padding: 14, borderTop: '1px solid var(--a-line)', fontSize: 14, fontWeight: 900, color: 'var(--a-ink-2)' }}>指示できる馬がいません</p>}
        </div>

        {/* 右 */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="a-panel strong">
            <div className="a-band" style={{ height: 38, padding: '0 16px', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 15, fontWeight: 900, letterSpacing: '.1em' }}>選択中の馬</span>
              <span style={{ fontSize: 12, fontWeight: 900 }}>現在値は素質による上限まで伸びます</span>
            </div>
            {horse !== null && cond !== null ? (
              <div style={{ display: 'flex', gap: 22, padding: '16px 20px', backgroundImage: 'linear-gradient(#ffffff,#eef6fd)', flexWrap: 'wrap' }}>
                <div style={{ width: 280, flex: '0 0 280px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <ClassChip label={horse.classLabel} classRank={horse.classRank} h={28} font={14} />
                    <span style={{ fontSize: 26, fontWeight: 900 }}>{horse.name}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 10 }}><span className="a-lbl">素質</span><Stars value={horse.stars} size={19} /></div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 10 }}>
                    <span className="a-lbl">調子</span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 900, color: cond.color }}><span style={{ fontSize: 17 }}>{cond.mark}</span>{cond.label}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 10 }}><span className="a-lbl">疲労</span><FatigueBar value={horse.fatigue} width={118} color={fatigueNumColor(horse.fatigue)} /></div>
                  {note !== null && (
                    <div style={{ marginTop: 10, padding: '8px 10px', borderRadius: 8, background: '#fff6d6', border: '2px solid #e6c979', fontSize: 12, fontWeight: 900, color: '#8a5a06', lineHeight: 1.6 }}>{note}</div>
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 280, borderLeft: '2px solid var(--a-line)', paddingLeft: 20 }}>
                  {stats.map((s) => (
                    <StatBar key={s.label} label={s.label} value={s.value} cap={Math.round(s.capRatio * 1000)} />
                  ))}
                </div>
              </div>
            ) : (
              <div style={{ padding: '18px 22px', backgroundImage: 'linear-gradient(#ffffff,#eef6fd)', fontSize: 14, fontWeight: 900, color: 'var(--a-ink-2)' }}>指示できる馬がいません</div>
            )}
          </div>

          {/* メニュー 4×2 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginTop: 14 }}>
            {TRAINING_MENUS.map((m) => {
              const sel = m.id === selectedMenu;
              const fatColor = m.fatigueDelta < 0 ? 'var(--a-green-d)' : m.fatigueDelta >= 20 ? '#a9741a' : 'var(--a-ink)';
              const showBanner = m.banner !== undefined && (m.banner.kind === 'bad' || (horse !== null && horse.fatigue > 50));
              const bandClass = sel ? 'a-band a-band-gold' : m.banner?.kind === 'bad' ? 'a-band a-band-red' : 'a-band';
              const bandStyle: React.CSSProperties = !sel && m.banner?.kind === 'warn' ? { backgroundImage: 'var(--a-gloss-yellow)', color: '#4a3105' } : {};
              return (
                <div key={m.id} onClick={() => setSelectedMenu(m.id)} style={{
                  display: 'flex', flexDirection: 'column', cursor: 'pointer', borderRadius: 10, overflow: 'hidden', background: '#fff',
                  border: sel ? '3px solid #8a5a06' : '2px solid var(--a-edge)', boxShadow: 'var(--a-shadow-sm)',
                }}>
                  <div className={bandClass} style={{ height: 34, padding: '0 12px', justifyContent: 'space-between', ...bandStyle }}>
                    <span style={{ fontSize: 16, fontWeight: 900 }}>{m.name}</span>
                    {sel && <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: '.1em' }}>選択中</span>}
                  </div>
                  {showBanner && m.banner !== undefined && (
                    <div style={{ display: 'flex', alignItems: 'center', height: 24, padding: '0 12px', background: m.banner.kind === 'bad' ? '#ffe6e4' : '#fff6d6', borderBottom: `1px solid ${m.banner.kind === 'bad' ? '#e8a9a4' : '#e6c979'}` }}>
                      <span style={{ fontSize: 11, fontWeight: 900, color: m.banner.kind === 'bad' ? 'var(--a-red-d)' : '#8a5a06' }}>{m.banner.text}</span>
                    </div>
                  )}
                  <div style={{ padding: '10px 12px 12px' }}>
                    <div style={{ fontSize: 13, fontWeight: 900, color: 'var(--a-green-d)', minHeight: 19 }}>{m.main}</div>
                    <div style={{ fontSize: 12, fontWeight: 900, color: m.sub === '—' ? 'var(--a-ink-3)' : 'var(--a-blue-d)', marginTop: 4 }}>副効果 {m.sub}</div>
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--a-line)' }}>
                      <span><span className="a-lbl" style={{ display: 'block', fontSize: 11 }}>疲労</span><span className="a-num" style={{ fontSize: 28, color: fatColor }}>{m.fatigueDelta > 0 ? `+${m.fatigueDelta}` : `−${Math.abs(m.fatigueDelta)}`}</span></span>
                      <span style={{ marginLeft: 'auto', textAlign: 'right' }}><span className="a-lbl" style={{ display: 'block', fontSize: 11 }}>消費</span><span className="a-num" style={{ fontSize: 28, color: 'var(--a-num-money)' }}>{m.ep}</span> <span style={{ fontSize: 11, fontWeight: 900, color: 'var(--a-ink-2)' }}>EP</span></span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* 指示バー */}
          <div className="a-panel" style={{ marginTop: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 24, padding: '14px 18px', backgroundImage: 'linear-gradient(#ffffff,#eef6fd)', flexWrap: 'wrap' }}>
              {horse !== null && menu !== null ? (
                <>
                  <div style={{ flex: '0 0 auto' }}><span className="a-lbl" style={{ display: 'block' }}>指示の内容</span><span style={{ fontSize: 19, fontWeight: 900, whiteSpace: 'nowrap' }}>{horse.name}　—　{menu.name}</span></div>
                  <div style={{ display: 'flex', gap: 22, fontSize: 13, fontWeight: 900, color: 'var(--a-ink-2)', whiteSpace: 'nowrap' }}>
                    <span>疲労 <span className="a-num" style={{ fontSize: 22, color: '#a9741a' }}>{horse.fatigue} → {Math.max(0, horse.fatigue + menu.fatigueDelta)}</span></span>
                    <span>消費 <span className="a-num" style={{ fontSize: 22, color: 'var(--a-num-money)' }}>{menu.ep}</span> EP</span>
                  </div>
                </>
              ) : (
                <span style={{ fontSize: 14, fontWeight: 900, color: 'var(--a-ink-2)' }}>馬とメニューを選んでください</span>
              )}
              <div style={{ display: 'flex', gap: 10, marginLeft: 'auto' }}>
                <span className={canInstruct ? 'a-btn a-btn-gold' : 'a-btn a-btn-gold off'} style={{ height: 48, padding: '0 22px', fontSize: 17, whiteSpace: 'nowrap' }} title="サーバー接続まで押せません">
                  {horse?.week.kind === 'done' ? '指示を変更する' : 'この馬に指示する'}{menu !== null ? `（${menu.ep} EP）` : ''}
                </span>
                <span className={allDone ? 'a-btn' : 'a-btn off'} style={{ height: 48, padding: '0 18px', fontSize: 15, whiteSpace: 'nowrap' }} title={allDone ? 'サーバー接続まで押せません' : '全頭に指示すると押せます'}>週を進める</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
