'use client';

/**
 * ★投票（馬券・マークシート風）— 正本 design/hud-ds/components/bet-sheet［アーケード］
 *   券種タブ（グロス）→ 馬番グリッド（32px の真円を金で塗る）→ 金額（EP・100 単位）→ 確認。右に「みんなの投票状況」（オッズに影響しない）。
 *   ⚠️ 今はデモデータ。投票は `place_bet` RPC に繋ぐまで動かない。
 *   ⚠️ 憲法: 「購入」と書かない。EP を増やす導線なし。自馬出走レースは投票不可（§9.5）。不的中は静か。
 */
import { useMemo, useState } from 'react';
import { BET_TYPES, DEMO_BET_RACE } from '../../../../lib/game-demo';
import { FrameBadge } from '../../../../components/ui';
import { formatEntryPoints } from '../../../../lib/format';

const AMOUNTS = [100, 500, 1000, 5000];
const MARK_COL = 70;

/** 券種タブ（選択中: 赤グロス＋下辺を白くして板と繋ぐ／未選択: 白→灰で沈む） */
function TypeTab({ label, selected, onClick }: { readonly label: string; readonly selected: boolean; readonly onClick: () => void }): React.ReactElement {
  return (
    <button type="button" onClick={onClick} style={{
      display: 'flex', alignItems: 'center', height: 42, padding: '0 20px', cursor: 'pointer', fontFamily: 'inherit',
      borderRadius: '10px 10px 0 0', border: '2px solid var(--a-edge)', borderBottom: selected ? '2px solid #fff' : '2px solid var(--a-edge)',
      backgroundImage: selected ? 'var(--a-gloss-red)' : 'linear-gradient(#fff,#e3ecf3)', color: selected ? '#fff' : 'var(--a-ink-2)',
      fontSize: 16, fontWeight: 900, boxShadow: selected ? 'var(--a-inset)' : 'inset 0 -3px 4px rgba(16,36,58,.12)', position: 'relative', zIndex: selected ? 2 : 1,
    }}>{label}</button>
  );
}

export default function BetPage(): React.ReactElement {
  const race = DEMO_BET_RACE;
  const [typeKey, setTypeKey] = useState('trifecta');
  const type = BET_TYPES.find((t) => t.key === typeKey) ?? BET_TYPES[0]!;
  /** picks[col] = gate。順不同の券種は列 0 に複数入れる */
  const [picks, setPicks] = useState<(number | null)[]>([7, 3, 4]);
  const [unordered, setUnordered] = useState<number[]>([]);
  const [amount, setAmount] = useState(1000);
  const ordered = type.ordered;
  const cols = ordered ? type.picks : 1;
  const selection: number[] = ordered ? picks.slice(0, type.picks).filter((g): g is number => g !== null) : unordered;
  const complete = selection.length === type.picks;
  const blocked = race.ownGate !== null;
  const enough = race.epBalance >= amount;
  const sep = ordered ? '→' : '−';
  const shareMax = useMemo(() => Math.max(...race.shares.map(([, p]) => p)), [race.shares]);

  const toggle = (gate: number, col: number): void => {
    if (ordered) {
      setPicks((prev) => {
        const next = [...prev];
        while (next.length < type.picks) next.push(null);
        // 同じ馬を別の着に置けない
        if (next.some((g, c) => g === gate && c !== col)) return prev;
        next[col] = next[col] === gate ? null : gate;
        return next;
      });
    } else {
      setUnordered((prev) => prev.includes(gate) ? prev.filter((g) => g !== gate) : prev.length < type.picks ? [...prev, gate] : prev);
    }
  };
  const clear = (): void => { setPicks([]); setUnordered([]); };
  const switchType = (key: string): void => { setTypeKey(key); clear(); };

  const badge = (g: number): React.ReactElement => <FrameBadge gate={g} fieldSize={race.fieldSize} w={32} h={24} font={16} />;

  return (
    <div style={{ padding: '22px 0 40px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <h1 className="a-band" style={{ height: 46, padding: '0 22px', borderRadius: 10, border: '2px solid var(--a-edge)', fontSize: 26, fontWeight: 900, letterSpacing: '.06em', textShadow: '0 2px 0 rgba(0,0,0,.3)', margin: 0 }}>投票</h1>
        <span style={{ fontSize: 15, fontWeight: 900, color: 'var(--a-ink)' }}>{race.raceNo}　{race.raceName}　{race.cond}　{race.fieldSize}頭</span>
        <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 10, height: 44, padding: '0 18px', borderRadius: 10, backgroundImage: 'var(--a-gloss-red)', border: '2px solid var(--a-red-d)', boxShadow: 'var(--a-shadow-sm)' }}>
          <span style={{ fontSize: 12, fontWeight: 900, letterSpacing: '.1em', color: '#fff' }}>締切まで</span>
          <span className="a-num" style={{ fontSize: 30, color: '#fff' }}>{race.deadline}</span>
        </span>
      </div>
      <p style={{ margin: '8px 0 0', fontSize: 12, fontWeight: 900, color: 'var(--a-ink-3)' }}>※ デモデータ（投票はサーバー RPC に接続するまで動きません）</p>

      {/* 券種タブ */}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, marginTop: 14, flexWrap: 'wrap' }}>
        {BET_TYPES.map((t) => <TypeTab key={t.key} label={t.label} selected={t.key === type.key} onClick={() => switchType(t.key)} />)}
      </div>

      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        {/* マークシート */}
        <div className="a-panel strong" style={{ flex: 1, minWidth: 0, borderRadius: '0 10px 10px 10px', marginTop: -2 }}>
          <div style={{ display: 'flex', alignItems: 'center', height: 40, backgroundImage: 'linear-gradient(#fff8e1,#ffefc0)', borderBottom: '2px solid #e6c979', opacity: blocked ? .3 : 1 }}>
            <span className="a-lbl" style={{ width: 56, flex: '0 0 56px', textAlign: 'center' }}>馬番</span>
            <span className="a-lbl" style={{ flex: 1, minWidth: 130 }}>馬名</span>
            {Array.from({ length: cols }, (_, c) => (
              <span key={c} style={{ width: MARK_COL, flex: `0 0 ${MARK_COL}px`, textAlign: 'center', fontSize: 13, fontWeight: 900, color: c === 0 && ordered ? 'var(--a-red-d)' : 'var(--a-ink-2)' }}>{ordered ? `${c + 1}着` : type.label}</span>
            ))}
          </div>
          <div style={{ opacity: blocked ? .3 : 1, pointerEvents: blocked ? 'none' : 'auto' }}>
            {race.horses.map((h, i) => (
              <div key={h.gate} style={{ display: 'flex', alignItems: 'center', height: 44, borderTop: '1px solid var(--a-line)', background: i % 2 === 1 ? 'var(--a-panel-2)' : '#fff' }}>
                <span style={{ width: 56, flex: '0 0 56px', display: 'flex', justifyContent: 'center' }}><FrameBadge gate={h.gate} fieldSize={race.fieldSize} w={38} h={28} font={19} /></span>
                <span style={{ flex: 1, minWidth: 130, fontSize: 15, fontWeight: 900, color: 'var(--a-ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{h.name}</span>
                {Array.from({ length: cols }, (_, c) => {
                  const on = ordered ? picks[c] === h.gate : unordered.includes(h.gate);
                  const usedElsewhere = ordered ? picks.some((g, cc) => g === h.gate && cc !== c) : (!on && unordered.length >= type.picks);
                  return (
                    <span key={c} style={{ width: MARK_COL, flex: `0 0 ${MARK_COL}px`, display: 'flex', justifyContent: 'center' }}>
                      <button type="button" onClick={() => toggle(h.gate, c)} disabled={usedElsewhere} style={{
                        width: 32, height: 32, borderRadius: '50%', cursor: usedElsewhere ? 'default' : 'pointer', padding: 0, fontFamily: 'inherit',
                        border: `3px solid ${on ? '#8a5a06' : '#a9bccd'}`,
                        backgroundImage: on ? 'var(--a-gloss-gold)' : 'linear-gradient(#fff,#eef4fa)',
                        boxShadow: on ? '0 2px 0 #8a5a06' : 'inset 0 1px 0 #fff',
                        opacity: usedElsewhere ? .35 : 1,
                        color: on ? '#4a3105' : 'transparent', fontSize: 15, fontWeight: 900,
                      }}>{ordered ? c + 1 : unordered.indexOf(h.gate) + 1}</button>
                    </span>
                  );
                })}
              </div>
            ))}
          </div>
          {blocked && race.ownGate !== null ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '12px 16px', borderTop: '2px solid var(--a-line)' }}>
              <span style={{ display: 'flex', alignItems: 'center', padding: '12px 14px', borderRadius: 8, backgroundImage: 'linear-gradient(#ffeceb,#ffdcd9)', border: '2px solid var(--a-red-d)', fontSize: 14, fontWeight: 900, color: 'var(--a-red-d)' }}>
                このレースには自分の馬（{race.ownGate}番 {race.horses[race.ownGate - 1]?.name}）が出走しているため、投票できません
              </span>
              <a className="a-btn a-btn-blue" href="/race" style={{ marginLeft: 'auto', height: 38, padding: '0 20px', fontSize: 14 }}>中継を観る</a>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, height: 52, padding: '0 16px', backgroundImage: 'var(--a-gloss-gold)', borderTop: '2px solid #8a5a06' }}>
              <span style={{ fontSize: 12, fontWeight: 900, letterSpacing: '.12em', color: '#4a3105' }}>選択中</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {selection.length === 0 ? <span style={{ fontSize: 14, fontWeight: 900, color: '#4a3105' }}>あと {type.picks} 頭</span>
                  : selection.map((g, i) => (
                    <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {i > 0 && <span style={{ fontSize: 16, fontWeight: 900, color: '#4a3105' }}>{sep}</span>}{badge(g)}
                    </span>
                  ))}
              </span>
              <span style={{ fontSize: 14, fontWeight: 900, color: '#4a3105' }}>{complete ? '1 通り' : `あと ${type.picks - selection.length} 頭`}</span>
              <button type="button" onClick={clear} className="a-btn" style={{ marginLeft: 'auto', height: 32, padding: '0 14px', fontSize: 13 }}>マークを消す</button>
            </div>
          )}
        </div>

        {/* 右: 金額と投票状況 */}
        <div style={{ width: 352, flex: '0 0 352px', display: 'flex', flexDirection: 'column', gap: 14, marginTop: 14, opacity: blocked ? .3 : 1, pointerEvents: blocked ? 'none' : 'auto' }}>
          <div className="a-panel strong">
            <div className="a-band" style={{ height: 38, padding: '0 16px', fontSize: 15, fontWeight: 900, letterSpacing: '.1em' }}>投票する額</div>
            <div style={{ padding: '14px 16px 16px', backgroundImage: 'linear-gradient(#ffffff,#eef6fd)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <button type="button" className="a-btn" onClick={() => setAmount((a) => Math.max(100, a - 100))} style={{ width: 46, height: 46, fontSize: 24 }}>−</button>
                <span style={{ flex: 1, textAlign: 'center', padding: '6px 0', borderRadius: 10, background: '#fff', border: '2px solid var(--a-edge)' }}>
                  <span className="a-num" style={{ fontSize: 38, color: 'var(--a-num-money)' }}>{amount.toLocaleString('ja-JP')}</span> <span style={{ fontSize: 13, fontWeight: 900, color: 'var(--a-ink-2)' }}>EP</span>
                </span>
                <button type="button" className="a-btn a-btn-gold" onClick={() => setAmount((a) => Math.min(race.capPerBet, a + 100))} style={{ width: 46, height: 46, fontSize: 24 }}>＋</button>
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                {AMOUNTS.map((v) => {
                  const sel = v === amount;
                  return (
                    <button key={v} type="button" onClick={() => setAmount(v)} className={`a-chip${sel ? ' gold' : ''}`} style={{ flex: 1, justifyContent: 'center', height: 32, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', color: sel ? '#4a3105' : 'var(--a-ink-2)' }}>{v.toLocaleString('ja-JP')}</button>
                  );
                })}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, paddingTop: 10, borderTop: '2px solid var(--a-line)', fontSize: 12, fontWeight: 900, color: 'var(--a-ink-2)' }}>
                <span>1 回の上限 <span className="a-num" style={{ fontSize: 16, color: 'var(--a-ink)' }}>{race.capPerBet.toLocaleString('ja-JP')}</span> EP</span>
                <span>投票後の残り <span className="a-num" style={{ fontSize: 16, color: 'var(--a-num-time)' }}>{Math.max(0, race.epBalance - amount).toLocaleString('ja-JP')}</span> EP</span>
              </div>
              <span className={`a-btn a-btn-gold${complete && enough ? '' : ' off'}`} style={{ width: '100%', height: 52, marginTop: 14, fontSize: 17 }} title="サーバー接続まで押せません">
                {type.label}に {formatEntryPoints(amount)} を投票する
              </span>
              {!enough && <div style={{ fontSize: 12, fontWeight: 900, color: 'var(--a-red-d)', marginTop: 6 }}>参加ポイントが足りません</div>}
              <div style={{ fontSize: 12, fontWeight: 900, color: 'var(--a-ink-3)', marginTop: 10, lineHeight: 1.7 }}>締切後は取消できません。参加ポイントは投票時に引かれ、的中すると賞金ポイント（PP）で払戻されます</div>
            </div>
          </div>
          <div className="a-panel">
            <div style={{ display: 'flex', alignItems: 'center', height: 34, padding: '0 14px', backgroundImage: 'linear-gradient(#fff,#e3ecf3)', borderBottom: '2px solid var(--a-line)' }}>
              <span className="a-lbl">みんなの投票状況</span><span className="a-lbl" style={{ marginLeft: 'auto', color: 'var(--a-ink-3)' }}>単勝の支持</span>
            </div>
            <div style={{ padding: '10px 14px 14px' }}>
              {race.shares.map(([gate, pct]) => (
                <div key={gate} style={{ display: 'flex', alignItems: 'center', gap: 10, height: 34 }}>
                  {badge(gate)}
                  <span style={{ flex: 1, height: 12, borderRadius: 6, background: '#e3ecf3', border: '2px solid var(--a-edge-soft)', overflow: 'hidden' }}><span style={{ display: 'block', width: `${(pct / shareMax) * 100}%`, height: '100%', backgroundImage: 'linear-gradient(#8fb3d0,#5d87ab)' }} /></span>
                  <span className="a-num" style={{ width: 38, textAlign: 'right', fontSize: 16, color: 'var(--a-ink-2)' }}>{pct}%</span>
                </div>
              ))}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, padding: '10px 12px', borderRadius: 8, background: '#eaf3fb', border: '2px solid #9fc0dc' }}>
                <span style={{ fontSize: 12, fontWeight: 900, lineHeight: 1.6, color: 'var(--a-ink)' }}>支持の目安です。<span style={{ color: 'var(--a-red-d)' }}>オッズには影響しません</span></span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
