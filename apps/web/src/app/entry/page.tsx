'use client';

/**
 * ★出走登録 — 正本 design/hud-ds/components/race-entry［アーケード］
 *   馬タブ → 出走できるレース一覧 → 確認パネル（脚質・斤量・出走料・登録）。
 *   ⚠️ 今はデモデータ。登録・取消はサーバー RPC に繋ぐまで動かない。可否（格・締切）はサーバー判断を表示するだけ。
 *   ⚠️ §9.5: 自馬が出走するレースの馬券は投票できない旨を登録前から常時表示。
 */
import { useMemo, useState } from 'react';
import { DEMO_HORSES, conditionView, fatigueColor, sortStable } from '../../lib/stable';
import { DEMO_ENTRY_RACES, STRATEGY_OPTIONS, entryCandidates } from '../../lib/game-demo';
import { Capsule, ClassChip, FatigueBar, PageTitle, Pill, TabButton } from '../../components/ui';

const WEEK_NO = 32;
const EP_BALANCE = 4200;

/** 一覧の列幅（固定列は flex:0 0 <幅>） */
const COL = { time: 70, no: 42, cls: 112, heads: 54, fee: 88, deadline: 104, state: 126 } as const;

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
    <div style={{ padding: '22px 0 40px' }}>
      <PageTitle
        title="出走登録"
        sub="出走料は参加ポイント（EP）から支払われます"
        right={<Capsule label="週" value={String(WEEK_NO)} />}
      />
      <p style={{ margin: '8px 0 0', fontSize: 12, fontWeight: 900, color: 'var(--a-ink-3)' }}>※ デモデータ（登録と取消はサーバー RPC に接続するまで動きません）</p>

      {/* 馬タブ（休養中の馬はタブに出さず末尾に理由） */}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, marginTop: 14, flexWrap: 'wrap' }}>
        {horses.map((h) => <TabButton key={h.id} label={h.name} selected={h.id === horseId} onClick={() => setHorseId(h.id)} />)}
        {restCount > 0 && <span style={{ fontSize: 12, fontWeight: 900, color: 'var(--a-ink-3)', marginLeft: 10, paddingBottom: 6 }}>休養中の {restCount} 頭は選べません</span>}
      </div>

      {/* 選択中の馬（タブと接続） */}
      {horse !== null && cond !== null && (
        <div className="a-panel strong rise" style={{ borderRadius: '0 10px 10px 10px', marginTop: -2 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 24, padding: '16px 20px', backgroundImage: 'linear-gradient(#ffffff,#eef6fd)', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <ClassChip label={horse.classLabel} classRank={horse.classRank} h={28} font={14} />
              <span style={{ fontSize: 28, fontWeight: 900 }}>{horse.name}</span>
              <span style={{ fontSize: 14, fontWeight: 900, color: 'var(--a-ink-2)' }}>{horse.sexAge}</span>
            </div>
            <div style={{ width: 2, height: 44, background: 'var(--a-line)' }} className="hide-narrow" />
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span className="a-lbl">疲労</span><FatigueBar value={horse.fatigue} width={110} color={fatigueColor(horse.fatigue)} />
              {horse.fatigue > 60 && <Pill tone="yellow">出走は可能・注意</Pill>}
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 22, fontSize: 13, fontWeight: 900, color: 'var(--a-ink-2)', whiteSpace: 'nowrap' }}>
              <span>調子 <span style={{ color: cond.color }}>{cond.mark} {cond.label}</span></span>
              <span>今週の指示 <span style={{ color: horse.week.kind === 'done' ? 'var(--a-ink)' : 'var(--a-ink-3)' }}>{horse.week.kind === 'done' ? horse.week.menu : '未指示'}</span></span>
            </div>
          </div>
        </div>
      )}

      {/* レース一覧 */}
      <div className="a-panel strong" style={{ marginTop: 16 }}>
        <div className="a-band" style={{ height: 38, padding: '0 18px', gap: 14 }}>
          <span className="a-lbl" style={{ width: COL.time, flex: `0 0 ${COL.time}px`, color: '#fff' }}>発走</span>
          <span className="a-lbl" style={{ width: COL.no, flex: `0 0 ${COL.no}px`, color: '#fff' }}>R</span>
          <span className="a-lbl" style={{ width: COL.cls, flex: `0 0 ${COL.cls}px`, color: '#fff' }}>格</span>
          <span className="a-lbl" style={{ flex: 1, minWidth: 160, color: '#fff' }}>コース</span>
          <span className="a-lbl" style={{ width: COL.heads, flex: `0 0 ${COL.heads}px`, textAlign: 'right', color: '#fff' }}>頭数</span>
          <span className="a-lbl" style={{ width: COL.fee, flex: `0 0 ${COL.fee}px`, textAlign: 'right', color: '#fff' }}>出走料</span>
          <span className="a-lbl" style={{ width: COL.deadline, flex: `0 0 ${COL.deadline}px`, textAlign: 'right', color: '#fff' }}>締切</span>
          <span className="a-lbl" style={{ width: COL.state, flex: `0 0 ${COL.state}px`, textAlign: 'right', color: '#fff' }}>状態</span>
        </div>
        {races.map((r, i) => {
          const sel = r.id === raceId;
          const disabled = r.state !== 'ok';
          // 格違い・締切後は地 #e7edf3 だけで沈める（不透明度は掛けない）
          const bg = sel ? 'linear-gradient(#fffdf2,#fff3cf)' : disabled ? '#e7edf3' : i % 2 === 1 ? 'var(--a-panel-2)' : '#fff';
          return (
            <div key={r.id} onClick={() => { if (!disabled) setRaceId(r.id); }} style={{
              display: 'flex', alignItems: 'center', height: 64, padding: '0 18px', gap: 14, borderTop: '1px solid var(--a-line)', color: 'var(--a-ink)',
              cursor: disabled ? 'default' : 'pointer', background: bg, boxShadow: sel ? 'inset 5px 0 0 #f2b012' : undefined,
            }}>
              <span className="a-num" style={{ width: COL.time, flex: `0 0 ${COL.time}px`, fontSize: 26, color: 'var(--a-num-time)' }}>{r.time}</span>
              <span className="a-num" style={{ width: COL.no, flex: `0 0 ${COL.no}px`, fontSize: 17, color: 'var(--a-ink-2)' }}>{r.raceNo}</span>
              <span style={{ width: COL.cls, flex: `0 0 ${COL.cls}px` }}><ClassChip label={r.classLabel} classRank={r.classRank} h={24} font={12} /></span>
              <span style={{ flex: 1, minWidth: 160, fontSize: 15, fontWeight: 900, whiteSpace: 'nowrap' }}>{r.course}<span style={{ marginLeft: 10, fontSize: 13, color: 'var(--a-ink-3)' }}>馬場 {r.going}</span></span>
              <span className="a-num" style={{ width: COL.heads, flex: `0 0 ${COL.heads}px`, textAlign: 'right', fontSize: 17, color: 'var(--a-ink-2)' }}>{r.heads}頭</span>
              <span style={{ width: COL.fee, flex: `0 0 ${COL.fee}px`, textAlign: 'right', fontSize: 12, fontWeight: 900, color: 'var(--a-ink-2)' }}><span className="a-num" style={{ fontSize: 21, color: 'var(--a-num-money)' }}>{r.feeEP}</span> EP</span>
              <span style={{ width: COL.deadline, flex: `0 0 ${COL.deadline}px`, textAlign: 'right', fontSize: 12, fontWeight: 900, color: 'var(--a-ink-2)', whiteSpace: 'nowrap' }}>{r.deadline === null ? '—' : `締切 ${r.deadline}`}</span>
              <span style={{ width: COL.state, flex: `0 0 ${COL.state}px`, display: 'flex', justifyContent: 'flex-end' }}>
                {sel ? <Pill tone="gold">選択中</Pill>
                  : r.state === 'ok' ? <Pill tone="green">登録できます</Pill>
                    : <Pill tone="grey">{r.state === 'class' ? '格が違います' : '締切後'}</Pill>}
              </span>
            </div>
          );
        })}
        {races.every((r) => r.state !== 'ok') && (
          <div style={{ padding: '14px 18px', borderTop: '1px solid var(--a-line)' }}>
            <div style={{ fontSize: 14, fontWeight: 900, color: 'var(--a-ink-2)' }}>今週は出走できるレースがありません</div>
          </div>
        )}
      </div>

      {/* 確認パネル */}
      {race !== null && horse !== null && (
        <div className="a-panel strong" style={{ marginTop: 16 }}>
          <div className="a-band" style={{ height: 40, padding: '0 18px', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 16, fontWeight: 900, letterSpacing: '.12em' }}>登録の確認</span>
            {race.deadline !== null && <span style={{ fontSize: 13, fontWeight: 900 }}>登録締切まで {race.deadline}</span>}
          </div>
          <div style={{ display: 'flex', gap: 24, padding: '18px 20px', backgroundImage: 'linear-gradient(#ffffff,#eef6fd)', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 360 }}>
              <div style={{ fontSize: 26, fontWeight: 900 }}>{race.raceNo}　{race.classLabel}　{race.course}</div>
              <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
                <span className="a-chip" style={{ height: 30, padding: '0 14px', fontSize: 14 }}>発走 {race.time}</span>
                <span className="a-chip" style={{ height: 30, padding: '0 14px', fontSize: 14 }}>馬場 {race.going}</span>
                <span className="a-chip" style={{ height: 30, padding: '0 14px', fontSize: 14 }}>{race.heads} 頭</span>
              </div>
              <div style={{ marginTop: 18 }}><span className="a-lbl">脚質</span>
                <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                  {STRATEGY_OPTIONS.map((s) => {
                    const sel = s.key === strategy;
                    return (
                      <button key={s.key} type="button" onClick={() => setStrategy(s.key)} style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center', height: 42, padding: '0 22px', cursor: 'pointer', fontFamily: 'inherit', borderRadius: 10,
                        border: sel ? '3px solid var(--a-edge)' : '2px solid var(--a-edge-soft)',
                        backgroundImage: sel ? 'var(--a-gloss-blue)' : 'linear-gradient(#fff,#e9eff5)',
                        color: sel ? '#fff' : 'var(--a-ink-2)', fontSize: 16, fontWeight: 900,
                        boxShadow: sel ? 'var(--a-shadow-sm)' : 'inset 0 -2px 3px rgba(16,36,58,.1)',
                      }}>{s.label}</button>
                    );
                  })}
                </div>
                <div style={{ fontSize: 12, fontWeight: 900, color: 'var(--a-ink-3)', marginTop: 10, lineHeight: 1.7 }}>脚質は今回のレースにだけ適用されます。馬の適性から外れた指示は道中で崩れやすくなります</div>
              </div>
            </div>
            <div style={{ width: 2, alignSelf: 'stretch', background: 'var(--a-line)' }} className="hide-narrow" />
            <div style={{ width: 340, flex: '0 0 340px', display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: 44, borderBottom: '1px solid var(--a-line)' }}><span className="a-lbl">斤量</span><span><span className="a-num" style={{ fontSize: 30, color: 'var(--a-ink)' }}>{race.weightKg.toFixed(1)}</span> <span style={{ fontSize: 12, fontWeight: 900, color: 'var(--a-ink-2)' }}>kg</span></span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: 44, borderBottom: '1px solid var(--a-line)' }}><span className="a-lbl">出走料</span><span><span className="a-num" style={{ fontSize: 30, color: 'var(--a-num-money)' }}>{race.feeEP}</span> <span style={{ fontSize: 12, fontWeight: 900, color: 'var(--a-ink-2)' }}>EP</span></span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: 44, borderBottom: '1px solid var(--a-line)' }}><span className="a-lbl">登録後の残り</span><span><span className="a-num" style={{ fontSize: 30, color: 'var(--a-num-time)' }}>{(EP_BALANCE - race.feeEP).toLocaleString('ja-JP')}</span> <span style={{ fontSize: 12, fontWeight: 900, color: 'var(--a-ink-2)' }}>EP</span></span></div>
              {/* §9.5 憲法の明示 — 登録前から常時表示し、登録後も残す */}
              <div style={{ marginTop: 12, padding: '11px 13px', borderRadius: 8, background: '#eaf3fb', border: '2px solid #9fc0dc' }}><span style={{ fontSize: 13, fontWeight: 900, color: 'var(--a-ink)', lineHeight: 1.6 }}>この馬が出走するレースの馬券は投票できません</span></div>
              <span className={`a-btn a-btn-gold${enough ? '' : ' off'}`} style={{ height: 52, marginTop: 12, fontSize: 18, ...(enough ? {} : { opacity: .4 }) }} title="サーバー接続まで押せません">登録する（{race.feeEP} EP）</span>
              {!enough && <div style={{ fontSize: 12, fontWeight: 900, color: 'var(--a-red-d)', marginTop: 6 }}>参加ポイントが足りません</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
