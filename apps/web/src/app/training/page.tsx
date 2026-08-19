'use client';

/**
 * ★調教（週送り）— 正本 design/hud-ds/components/training
 *   左に馬の選択（未指示が上）、右に馬カード＋8 メニュー＋指示バー。全頭指示で「週を進める」が有効。
 *   ⚠️ 今はデモデータ。指示の書き込み（spend_training_ep）と週送りはサーバー RPC に繋ぐまで押しても何も起きない。
 *   ⚠️ 疲労の遷移・注意文・警告帯の条件はサーバーが返す前提（ここでは見本の値）。画面で式を作らない。
 */
import { useMemo, useState } from 'react';
import { sortStable, conditionView, fatigueColor, DEMO_HORSES } from '../../lib/stable';
import { TRAINING_MENUS, DEMO_TRAINING_STATS, demoFatigueNote } from '../../lib/game-demo';
import { ClassChip, FatigueBar, Stars } from '../../components/ui';

const WEEK_NO = 32;
const DEFAULT_STATS = [
  { label: 'スピード', value: 500, capRatio: 0.7 }, { label: 'スタミナ', value: 500, capRatio: 0.7 }, { label: 'パワー', value: 500, capRatio: 0.7 },
  { label: '根性', value: 500, capRatio: 0.7 }, { label: '賢さ', value: 500, capRatio: 0.7 },
];

function Badge({ kind }: { readonly kind: 'todo' | 'done' | 'rest' }): React.ReactElement {
  const s: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', height: 20, padding: '0 8px', fontSize: 11, fontWeight: 700 };
  if (kind === 'todo') return <span style={{ ...s, background: 'rgba(250,215,40,.16)', color: '#fad728' }}>未指示</span>;
  if (kind === 'done') return <span style={{ ...s, background: 'rgba(95,212,139,.12)', color: '#5fd48b' }}>指示済み</span>;
  return <span style={{ ...s, color: 'var(--paper-45)', border: '1px solid var(--rule)' }}>休養中</span>;
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

  return (
    <div style={{ padding: '26px 0 40px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 34, fontWeight: 900, margin: 0 }}>調教</h1>
        <span style={{ fontSize: 14, color: 'var(--paper-70)' }}>1 週に 1 回、各馬にメニューを指示します</span>
        <span style={{ marginLeft: 'auto', fontSize: 14, color: 'var(--paper-70)' }}>第 <span className="num" style={{ fontSize: 19, color: 'var(--paper)' }}>{WEEK_NO}</span> 週　残り <span className="num" style={{ fontSize: 19, color: todo.length > 0 ? '#fad728' : 'var(--paper)' }}>{todo.length}</span> 頭</span>
      </div>
      <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--paper-45)' }}>※ デモデータ（指示の保存と週送りはサーバー RPC に接続するまで動きません）</p>

      <div style={{ display: 'flex', gap: 16, marginTop: 16, alignItems: 'flex-start' }}>
        {/* 左: 馬の選択 */}
        <div className="panel" style={{ width: 284, flex: '0 0 284px' }}>
          <div style={{ display: 'flex', alignItems: 'center', height: 34, padding: '0 14px' }}><span className="lbl">馬を選ぶ</span><span className="lbl" style={{ marginLeft: 'auto', opacity: .55 }}>{horses.length} 頭</span></div>
          {horses.map((h) => {
            const sel = h.id === selectedHorse;
            const rest = h.week.kind === 'rest';
            return (
              <div key={h.id} onClick={() => { if (!rest) setSelectedHorse(h.id); }} style={{
                display: 'flex', flexDirection: 'column', gap: 6, padding: '12px 14px', borderTop: '1px solid var(--rule)', cursor: rest ? 'default' : 'pointer',
                background: sel ? 'rgba(240,204,74,.12)' : 'transparent', boxShadow: sel ? 'inset 3px 0 0 var(--gold)' : undefined, opacity: rest ? .4 : 1,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><span style={{ fontSize: 15, fontWeight: 900 }}>{h.name}</span><span style={{ marginLeft: 'auto' }}><Badge kind={h.week.kind} /></span></div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><ClassChip label={h.classLabel} classRank={h.classRank} h={22} font={11} /><span style={{ marginLeft: 'auto' }}><FatigueBar value={h.fatigue} width={56} color={fatigueColor(h.fatigue)} /></span></div>
                {h.week.kind === 'done' && <div style={{ fontSize: 11, color: 'var(--paper-45)' }}>今週 {h.week.menu}</div>}
              </div>
            );
          })}
          {selectable.length === 0 && <p style={{ padding: '14px', fontSize: 14, color: 'var(--paper-70)' }}>指示できる馬がいません</p>}
        </div>

        {/* 右 */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {horse !== null && cond !== null ? (
            <div className="board">
              <div className="edge" />
              <div style={{ display: 'flex', gap: 26, padding: '18px 22px', flexWrap: 'wrap' }}>
                <div style={{ width: 290, flex: '0 0 290px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}><ClassChip label={horse.classLabel} classRank={horse.classRank} h={22} font={11} /><span style={{ fontSize: 26, fontWeight: 900 }}>{horse.name}</span></div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 10 }}><span className="lbl">素質</span><Stars value={horse.stars} size={17} /></div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}><span className="lbl">調子</span><span style={{ fontSize: 14, color: cond.color }}>{cond.mark} {cond.label}</span></div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 10 }}><span className="lbl">疲労</span><FatigueBar value={horse.fatigue} width={120} color={fatigueColor(horse.fatigue)} /></div>
                  {note !== null && <div style={{ fontSize: 12, color: '#fad728', marginTop: 8 }}>{note}</div>}
                </div>
                <div style={{ flex: 1, minWidth: 280, borderLeft: '1px solid var(--rule)', paddingLeft: 24 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline' }}><span className="lbl">現在値</span><span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--paper-45)' }}>縦の目盛 = 素質による上限</span></div>
                  <div style={{ marginTop: 4 }}>
                    {stats.map((s) => (
                      <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 12, height: 30 }}>
                        <span style={{ width: 66, flex: '0 0 66px', fontSize: 13, color: 'var(--paper-70)' }}>{s.label}</span>
                        <span style={{ position: 'relative', flex: 1, height: 12, background: 'rgba(0,0,0,.5)', border: '1px solid var(--rule)' }}>
                          <span style={{ display: 'block', width: `${s.value / 10}%`, height: '100%', background: 'var(--gold)' }} />
                          <span style={{ position: 'absolute', left: `${Math.round(s.capRatio * 100)}%`, top: -4, width: 2, height: 18, background: 'var(--paper-45)' }} />
                        </span>
                        <span className="num" style={{ width: 46, flex: '0 0 46px', textAlign: 'right', fontSize: 18 }}>{s.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="panel" style={{ padding: '18px 22px', fontSize: 14, color: 'var(--paper-70)' }}>指示できる馬がいません</div>
          )}

          {/* メニュー 4×2 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginTop: 14 }}>
            {TRAINING_MENUS.map((m) => {
              const sel = m.id === selectedMenu;
              const fatColor = m.fatigueDelta < 0 ? '#5fd48b' : m.fatigueDelta >= 20 ? '#fad728' : 'var(--paper)';
              const showBanner = m.banner !== undefined && (m.banner.kind === 'bad' || (horse !== null && horse.fatigue > 50));
              return (
                <div key={m.id} onClick={() => setSelectedMenu(m.id)} style={{
                  position: 'relative', display: 'flex', flexDirection: 'column', cursor: 'pointer',
                  background: sel ? 'rgba(240,204,74,.1)' : 'rgba(6,10,8,.72)', border: `1px solid ${sel ? 'var(--gold)' : 'var(--hair)'}`,
                }}>
                  {showBanner && m.banner !== undefined && (
                    <div style={{ display: 'flex', alignItems: 'center', height: 24, padding: '0 12px', background: m.banner.kind === 'bad' ? 'rgba(214,40,40,.22)' : 'rgba(250,215,40,.16)' }}>
                      <span style={{ fontSize: 11, letterSpacing: '.06em', color: m.banner.kind === 'bad' ? '#ff6b5c' : '#fad728' }}>{m.banner.text}</span>
                    </div>
                  )}
                  <div style={{ padding: '12px 14px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center' }}><span style={{ fontSize: 18, fontWeight: 900 }}>{m.name}</span>{sel && <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 900, background: 'var(--gold)', color: 'var(--ink)', padding: '2px 8px' }}>選択中</span>}</div>
                    <div style={{ fontSize: 13, color: '#5fd48b', marginTop: 10, minHeight: 19 }}>{m.main}</div>
                    <div style={{ fontSize: 12, color: m.sub === '—' ? 'var(--paper-45)' : '#3fd0e0', marginTop: 4 }}>副効果 {m.sub}</div>
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--rule)' }}>
                      <span><span className="lbl" style={{ display: 'block' }}>疲労</span><span className="num" style={{ fontSize: 19, color: fatColor }}>{m.fatigueDelta > 0 ? `+${m.fatigueDelta}` : `−${Math.abs(m.fatigueDelta)}`}</span></span>
                      <span style={{ marginLeft: 'auto', textAlign: 'right' }}><span className="lbl" style={{ display: 'block' }}>消費</span><span className="num" style={{ fontSize: 22 }}>{m.ep}</span> <span style={{ fontSize: 12, color: 'var(--paper-70)' }}>EP</span></span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* 指示バー */}
          <div className="panel" style={{ display: 'flex', alignItems: 'center', gap: 20, marginTop: 14, padding: '14px 18px', flexWrap: 'wrap' }}>
            {horse !== null && menu !== null ? (
              <>
                <div><span className="lbl" style={{ display: 'block' }}>指示の内容</span><span style={{ fontSize: 17, fontWeight: 900 }}>{horse.name}　—　{menu.name}</span></div>
                <div style={{ display: 'flex', gap: 20, marginLeft: 24, fontSize: 13, color: 'var(--paper-70)' }}>
                  <span>疲労 <span className="num" style={{ fontSize: 17, color: '#fad728' }}>{horse.fatigue} → {Math.max(0, horse.fatigue + menu.fatigueDelta)}</span></span>
                  <span>消費 <span className="num" style={{ fontSize: 17, color: 'var(--paper)' }}>{menu.ep}</span> EP</span>
                </div>
              </>
            ) : (
              <span style={{ fontSize: 14, color: 'var(--paper-70)' }}>馬とメニューを選んでください</span>
            )}
            <div style={{ display: 'flex', gap: 10, marginLeft: 'auto' }}>
              <span className={horse !== null && menu !== null ? 'chip-gold' : 'chip-off'} style={{ height: 40, fontSize: 16 }} title="サーバー接続まで押せません">
                <span className="unskew">{horse?.week.kind === 'done' ? '指示を変更する' : 'この馬に指示する'}{menu !== null ? `（${menu.ep} EP）` : ''}</span>
              </span>
              <span className={allDone ? 'chip-glass' : 'chip-off'} style={{ height: 40 }} title={allDone ? '' : '全頭に指示すると押せます'}><span className="unskew">週を進める</span></span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
