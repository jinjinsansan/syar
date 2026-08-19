'use client';

/**
 * ★出走登録 — 正本 design/hud-ds/components/race-entry
 *   馬タブ → 出走できるレース一覧 → 確認パネル（脚質・斤量・出走料・登録）。
 *   ⚠️ 今はデモデータ。登録・取消はサーバー RPC に繋ぐまで動かない。可否（格・締切）はサーバー判断を表示するだけ。
 *   ⚠️ §9.5: 自馬が出走するレースの馬券は投票できない旨を登録前から常時表示。
 */
import { useMemo, useState } from 'react';
import { DEMO_HORSES, conditionView, fatigueColor, sortStable } from '../../lib/stable';
import { DEMO_ENTRY_RACES, STRATEGY_OPTIONS, entryCandidates } from '../../lib/game-demo';
import { ClassChip, FatigueBar } from '../../components/ui';

const WEEK_NO = 32;
const EP_BALANCE = 4200;

export default function EntryPage(): React.ReactElement {
  const horses = useMemo(() => entryCandidates(sortStable(DEMO_HORSES)), []);
  const [horseId, setHorseId] = useState(horses[0]?.id ?? '');
  const [raceId, setRaceId] = useState<string | null>(DEMO_ENTRY_RACES.find((r) => r.state === 'ok')?.id ?? null);
  const [strategy, setStrategy] = useState('sashi');
  const horse = horses.find((h) => h.id === horseId) ?? null;
  const race = DEMO_ENTRY_RACES.find((r) => r.id === raceId) ?? null;
  // 登録できる → 格違い → 締切後 の順（消さない）
  const order = { ok: 0, class: 1, closed: 2 } as const;
  const races = [...DEMO_ENTRY_RACES].sort((a, b) => order[a.state] - order[b.state] || a.time.localeCompare(b.time));
  const cond = horse === null ? null : conditionView(horse.condition);
  const restCount = DEMO_HORSES.length - horses.length;
  const enough = race === null ? false : EP_BALANCE >= race.feeEP;

  return (
    <div style={{ padding: '26px 0 40px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 34, fontWeight: 900, margin: 0 }}>出走登録</h1>
        <span style={{ fontSize: 14, color: 'var(--paper-70)' }}>出走料は参加ポイント（EP）から支払われます</span>
        <span style={{ marginLeft: 'auto', fontSize: 14, color: 'var(--paper-70)' }}>第 <span className="num" style={{ fontSize: 19, color: 'var(--paper)' }}>{WEEK_NO}</span> 週</span>
      </div>
      <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--paper-45)' }}>※ デモデータ（登録と取消はサーバー RPC に接続するまで動きません）</p>

      {/* 馬タブ */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
        {horses.map((h) => {
          const sel = h.id === horseId;
          return (
            <button key={h.id} type="button" onClick={() => setHorseId(h.id)} style={{
              display: 'flex', alignItems: 'center', height: 36, padding: '0 18px', cursor: 'pointer', fontFamily: 'inherit',
              background: sel ? 'var(--gold)' : 'rgba(7,10,8,.72)', border: `1px solid ${sel ? 'var(--gold)' : 'var(--rule)'}`,
              color: sel ? 'var(--ink)' : 'var(--paper)', fontSize: 14, fontWeight: sel ? 900 : 700,
            }}>{h.name}</button>
          );
        })}
        {restCount > 0 && <span style={{ fontSize: 12, color: 'var(--paper-45)', marginLeft: 8 }}>休養中の {restCount} 頭は選べません</span>}
      </div>

      {/* 選択中の馬 */}
      {horse !== null && cond !== null && (
        <div className="board rise" style={{ marginTop: 14 }}>
          <div className="edge" />
          <div style={{ display: 'flex', alignItems: 'center', gap: 30, padding: '16px 22px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}><ClassChip label={horse.classLabel} classRank={horse.classRank} h={22} font={11} /><span style={{ fontSize: 26, fontWeight: 900 }}>{horse.name}</span><span style={{ fontSize: 13, color: 'var(--paper-70)' }}>{horse.sexAge}</span></div>
            <div style={{ width: 1, height: 44, background: 'var(--rule)' }} className="hide-narrow" />
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span className="lbl">疲労</span><FatigueBar value={horse.fatigue} width={110} color={fatigueColor(horse.fatigue)} />
              {horse.fatigue > 60 && <span style={{ fontSize: 13, color: '#fad728' }}>疲労 {horse.fatigue}（出走は可能・注意）</span>}
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 24, fontSize: 13, color: 'var(--paper-70)' }}>
              <span>調子 <span style={{ color: cond.color }}>{cond.mark} {cond.label}</span></span>
              <span>今週の指示 <span style={{ color: horse.week.kind === 'done' ? 'var(--paper)' : 'var(--paper-45)' }}>{horse.week.kind === 'done' ? horse.week.menu : '未指示'}</span></span>
            </div>
          </div>
        </div>
      )}

      {/* レース一覧 */}
      <div className="panel" style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', height: 34, padding: '0 18px', gap: 14 }}>
          <span className="lbl" style={{ flex: '0 0 60px' }}>発走</span><span className="lbl" style={{ flex: '0 0 40px' }}>R</span><span className="lbl" style={{ flex: '0 0 112px' }}>格</span>
          <span className="lbl" style={{ flex: 1, minWidth: 150 }}>コース</span><span className="lbl" style={{ flex: '0 0 52px', textAlign: 'right' }}>頭数</span>
          <span className="lbl" style={{ flex: '0 0 82px', textAlign: 'right' }}>出走料</span><span className="lbl" style={{ flex: '0 0 96px', textAlign: 'right' }}>登録締切</span><span className="lbl" style={{ flex: '0 0 112px', textAlign: 'right' }}>状態</span>
        </div>
        {races.map((r, i) => {
          const sel = r.id === raceId;
          const disabled = r.state !== 'ok';
          return (
            <div key={r.id} onClick={() => { if (!disabled) setRaceId(r.id); }} style={{
              display: 'flex', alignItems: 'center', height: 58, padding: '0 18px', gap: 14, borderTop: '1px solid var(--rule)', cursor: disabled ? 'default' : 'pointer',
              background: sel ? 'rgba(240,204,74,.12)' : i % 2 === 1 ? 'var(--row)' : 'transparent', boxShadow: sel ? 'inset 3px 0 0 var(--gold)' : undefined, opacity: disabled ? .45 : 1,
            }}>
              <span className="num" style={{ flex: '0 0 60px', fontSize: 21 }}>{r.time}</span>
              <span className="num" style={{ flex: '0 0 40px', fontSize: 15, color: 'var(--paper-70)' }}>{r.raceNo}</span>
              <span style={{ flex: '0 0 112px' }}><ClassChip label={r.classLabel} classRank={r.classRank} h={22} font={11} /></span>
              <span style={{ flex: 1, minWidth: 150, fontSize: 14, color: 'var(--paper-70)', whiteSpace: 'nowrap' }}>{r.course}<span style={{ marginLeft: 10, opacity: .7 }}>馬場 {r.going}</span></span>
              <span className="num" style={{ flex: '0 0 52px', textAlign: 'right', fontSize: 15, color: 'var(--paper-70)' }}>{r.heads}頭</span>
              <span style={{ flex: '0 0 82px', textAlign: 'right', fontSize: 12 }}><span className="num" style={{ fontSize: 16 }}>{r.feeEP}</span> EP</span>
              <span style={{ flex: '0 0 96px', textAlign: 'right', fontSize: 12, color: 'var(--paper-70)' }}>{r.deadline === null ? '—' : `締切 ${r.deadline}`}</span>
              <span style={{ flex: '0 0 112px', display: 'flex', justifyContent: 'flex-end' }}>
                {sel ? <span style={{ display: 'inline-flex', alignItems: 'center', height: 24, padding: '0 11px', background: 'var(--gold)', color: 'var(--ink)', fontSize: 12, fontWeight: 900 }}>選択中</span>
                  : r.state === 'ok' ? <span style={{ display: 'inline-flex', alignItems: 'center', height: 24, padding: '0 11px', background: 'rgba(95,212,139,.12)', color: '#5fd48b', fontSize: 12 }}>登録できます</span>
                    : <span style={{ display: 'inline-flex', alignItems: 'center', height: 24, padding: '0 11px', color: 'var(--paper-45)', fontSize: 12, border: '1px solid var(--rule)' }}>{r.state === 'class' ? '格が違います' : '締切後'}</span>}
              </span>
            </div>
          );
        })}
        {races.every((r) => r.state !== 'ok') && <p style={{ padding: '14px 18px', fontSize: 14, color: 'var(--paper-70)' }}>今週は出走できるレースがありません</p>}
      </div>

      {/* 確認パネル */}
      {race !== null && horse !== null && (
        <div className="board" style={{ marginTop: 16 }}>
          <div className="edge" />
          <div style={{ display: 'flex', gap: 30, padding: '18px 22px', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 360 }}>
              <div className="lbl" style={{ color: 'var(--gold)' }}>登録の確認</div>
              <div style={{ fontSize: 22, fontWeight: 900, marginTop: 8 }}>{race.raceNo}　{race.classLabel}　{race.course}</div>
              <div style={{ display: 'flex', gap: 20, marginTop: 8, fontSize: 13, color: 'var(--paper-70)', flexWrap: 'wrap' }}>
                <span>発走 <span className="num" style={{ fontSize: 16, color: 'var(--paper)' }}>{race.time}</span></span><span>馬場 {race.going}</span><span>{race.heads} 頭</span>
                {race.deadline !== null && <span>登録締切まで <span className="num" style={{ fontSize: 16, color: '#fad728' }}>{race.deadline}</span></span>}
              </div>
              <div style={{ marginTop: 16 }}><span className="lbl">脚質</span>
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  {STRATEGY_OPTIONS.map((s) => {
                    const sel = s.key === strategy;
                    return (
                      <button key={s.key} type="button" onClick={() => setStrategy(s.key)} style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center', height: 38, padding: '0 20px', cursor: 'pointer', fontFamily: 'inherit',
                        background: sel ? 'rgba(63,208,224,.16)' : 'rgba(7,10,8,.72)', border: `1px solid ${sel ? 'rgba(63,208,224,.55)' : 'var(--rule)'}`,
                        color: sel ? '#3fd0e0' : 'var(--paper)', fontSize: 15, fontWeight: sel ? 900 : 700,
                      }}>{s.label}</button>
                    );
                  })}
                </div>
                <div style={{ fontSize: 12, color: 'var(--paper-45)', marginTop: 8 }}>脚質は今回のレースにだけ適用されます。馬の適性から外れた指示は道中で崩れやすくなります</div>
              </div>
            </div>
            <div style={{ width: 1, alignSelf: 'stretch', background: 'var(--rule)' }} className="hide-narrow" />
            <div style={{ width: 330, flex: '0 0 330px', display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', height: 34, borderBottom: '1px solid var(--rule)' }}><span className="lbl">斤量</span><span><span className="num" style={{ fontSize: 24 }}>{race.weightKg.toFixed(1)}</span> <span style={{ fontSize: 13, color: 'var(--paper-70)' }}>kg</span></span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', height: 34, borderBottom: '1px solid var(--rule)' }}><span className="lbl">出走料</span><span><span className="num" style={{ fontSize: 24 }}>{race.feeEP}</span> <span style={{ fontSize: 13, color: 'var(--paper-70)' }}>EP</span></span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', height: 34, borderBottom: '1px solid var(--rule)' }}><span className="lbl">登録後の残り</span><span><span className="num" style={{ fontSize: 20, color: 'var(--paper-70)' }}>{(EP_BALANCE - race.feeEP).toLocaleString('ja-JP')}</span> <span style={{ fontSize: 13, color: 'var(--paper-70)' }}>EP</span></span></div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, padding: '10px 12px', background: 'rgba(63,208,224,.1)', borderLeft: '3px solid #3fd0e0' }}><span style={{ fontSize: 12, lineHeight: 1.6 }}>この馬が出走するレースの馬券は投票できません</span></div>
              <span className={enough ? 'chip-gold' : 'chip-off'} style={{ height: 44, fontSize: 17, justifyContent: 'center', marginTop: 12 }} title="サーバー接続まで押せません"><span className="unskew">登録する（{race.feeEP} EP）</span></span>
              {!enough && <div style={{ fontSize: 12, color: '#ff6b5c', marginTop: 6 }}>参加ポイントが足りません</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
