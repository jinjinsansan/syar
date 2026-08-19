'use client';

/**
 * ★投票（馬券・マークシート風）— 正本 design/hud-ds/components/bet-sheet
 *   券種タブ → 馬番グリッド（円を塗る）→ 金額（EP・100 単位）→ 確認。右に「みんなの投票状況」（オッズに影響しない）。
 *   ⚠️ 今はデモデータ。投票は `place_bet` RPC に繋ぐまで動かない。
 *   ⚠️ 憲法: 「購入」と書かない。EP を増やす導線なし。自馬出走レースは投票不可（§9.5）。不的中は静か。
 */
import { useMemo, useState } from 'react';
import { BET_TYPES, DEMO_BET_RACE } from '../../../../lib/game-demo';
import { FrameBadge } from '../../../../components/ui';
import { formatEntryPoints } from '../../../../lib/format';

const AMOUNTS = [100, 500, 1000, 5000];

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

  return (
    <div style={{ padding: '26px 0 40px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 34, fontWeight: 900, margin: 0 }}>投票</h1>
        <span style={{ fontSize: 14, color: 'var(--paper-70)' }}>{race.raceNo}　{race.raceName}　{race.cond}　{race.fieldSize}頭</span>
        <span style={{ marginLeft: 'auto', fontSize: 14, color: 'var(--paper-70)' }}>締切まで <span className="num" style={{ fontSize: 20, color: '#ff4d3d' }}>{race.deadline}</span></span>
      </div>
      <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--paper-45)' }}>※ デモデータ（投票はサーバー RPC に接続するまで動きません）</p>

      {/* 券種タブ */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
        {BET_TYPES.map((t) => {
          const sel = t.key === type.key;
          return (
            <button key={t.key} type="button" onClick={() => switchType(t.key)} style={{
              display: 'flex', alignItems: 'center', height: 38, padding: '0 20px', cursor: 'pointer', fontFamily: 'inherit',
              background: sel ? 'var(--gold)' : 'rgba(7,10,8,.72)', border: `1px solid ${sel ? 'var(--gold)' : 'var(--rule)'}`, color: sel ? 'var(--ink)' : 'var(--paper)', fontSize: 15, fontWeight: sel ? 900 : 700,
            }}>{t.label}</button>
          );
        })}
      </div>

      {blocked && race.ownGate !== null && (
        <div className="panel" style={{ marginTop: 14, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ display: 'flex', alignItems: 'center', padding: '10px 12px', background: 'rgba(214,40,40,.16)', borderLeft: '3px solid #ff6b5c', fontSize: 13 }}>
            このレースには自分の馬（{race.ownGate}番 {race.horses[race.ownGate - 1]?.name}）が出走しているため、投票できません
          </span>
          <a href="/race" style={{ marginLeft: 'auto', fontSize: 13 }}>中継を観る</a>
        </div>
      )}

      <div style={{ display: 'flex', gap: 16, marginTop: 14, alignItems: 'flex-start', opacity: blocked ? .28 : 1, pointerEvents: blocked ? 'none' : 'auto' }}>
        {/* マークシート */}
        <div className="panel" style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', height: 38, borderBottom: '1px solid var(--rule)' }}>
            <span className="lbl" style={{ flex: '0 0 44px', textAlign: 'center' }}>馬番</span>
            <span className="lbl" style={{ flex: 1, minWidth: 120 }}>馬名</span>
            {Array.from({ length: cols }, (_, c) => (
              <span key={c} className="lbl" style={{ flex: '0 0 64px', textAlign: 'center', color: c === 0 && ordered ? 'var(--gold)' : undefined }}>{ordered ? `${c + 1}着` : type.label}</span>
            ))}
          </div>
          {race.horses.map((h, i) => (
            <div key={h.gate} style={{ display: 'flex', alignItems: 'center', height: 38, borderTop: '1px solid var(--rule)', background: i % 2 === 1 ? 'var(--row)' : 'transparent' }}>
              <span style={{ flex: '0 0 44px', display: 'flex', justifyContent: 'center' }}><FrameBadge gate={h.gate} fieldSize={race.fieldSize} w={30} h={22} /></span>
              <span style={{ flex: 1, minWidth: 120, fontSize: 13, color: 'var(--paper-70)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{h.name}</span>
              {Array.from({ length: cols }, (_, c) => {
                const on = ordered ? picks[c] === h.gate : unordered.includes(h.gate);
                const usedElsewhere = ordered ? picks.some((g, cc) => g === h.gate && cc !== c) : (!on && unordered.length >= type.picks);
                return (
                  <span key={c} style={{ flex: '0 0 64px', display: 'flex', justifyContent: 'center' }}>
                    <button type="button" onClick={() => toggle(h.gate, c)} disabled={usedElsewhere} style={{
                      width: 26, height: 26, borderRadius: '50%', cursor: usedElsewhere ? 'default' : 'pointer', padding: 0, fontFamily: 'inherit',
                      border: `2px solid ${on ? 'var(--gold)' : 'rgba(246,242,231,.3)'}`, background: on ? 'var(--gold)' : 'transparent', opacity: usedElsewhere ? .4 : 1,
                      color: on ? 'var(--ink)' : 'transparent', fontSize: 12, fontWeight: 700,
                    }}>{ordered ? c + 1 : unordered.indexOf(h.gate) + 1}</button>
                  </span>
                );
              })}
            </div>
          ))}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, height: 44, padding: '0 16px', borderTop: '1px solid var(--rule)', background: 'rgba(240,204,74,.08)' }}>
            <span className="lbl" style={{ color: 'var(--gold)' }}>選択中</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 16, fontWeight: 900 }}>
              {selection.length === 0 ? <span style={{ fontSize: 13, color: 'var(--paper-45)' }}>あと {type.picks} 頭</span>
                : selection.map((g, i) => (
                  <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {i > 0 && <span style={{ color: 'var(--paper-45)' }}>{sep}</span>}<FrameBadge gate={g} fieldSize={race.fieldSize} w={30} h={22} />
                  </span>
                ))}
            </span>
            <span style={{ marginLeft: 'auto', fontSize: 13, color: 'var(--paper-70)' }}>{complete ? '1 通り' : `あと ${type.picks - selection.length} 頭`}</span>
            <button type="button" onClick={clear} style={{ display: 'flex', alignItems: 'center', height: 28, padding: '0 12px', border: '1px solid var(--rule)', background: 'transparent', color: 'var(--paper-70)', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>マークを消す</button>
          </div>
        </div>

        {/* 右: 金額と投票状況 */}
        <div style={{ width: 352, flex: '0 0 352px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="board">
            <div className="edge" />
            <div style={{ padding: '14px 16px 16px' }}>
              <div className="lbl" style={{ color: 'var(--gold)' }}>投票する額</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
                <button type="button" onClick={() => setAmount((a) => Math.max(100, a - 100))} style={{ width: 40, height: 40, border: '1px solid var(--gold-hair)', background: 'transparent', color: 'var(--paper)', fontSize: 20, fontWeight: 900, cursor: 'pointer', fontFamily: 'inherit' }}>−</button>
                <span style={{ flex: 1, textAlign: 'center' }}><span className="num" style={{ fontSize: 34 }}>{amount.toLocaleString('ja-JP')}</span> <span style={{ fontSize: 13, color: 'var(--paper-70)' }}>EP</span></span>
                <button type="button" onClick={() => setAmount((a) => Math.min(race.capPerBet, a + 100))} style={{ width: 40, height: 40, border: 0, background: 'var(--gold)', color: 'var(--ink)', fontSize: 20, fontWeight: 900, cursor: 'pointer', fontFamily: 'inherit' }}>＋</button>
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                {AMOUNTS.map((v) => {
                  const sel = v === amount;
                  return (
                    <button key={v} type="button" onClick={() => setAmount(v)} style={{ flex: 1, height: 30, cursor: 'pointer', fontFamily: 'inherit', background: sel ? 'rgba(240,204,74,.16)' : 'rgba(7,10,8,.72)', border: `1px solid ${sel ? 'var(--gold-hair)' : 'var(--rule)'}`, color: sel ? 'var(--gold)' : 'var(--paper-70)', fontSize: 13, fontWeight: 700 }}>{v.toLocaleString('ja-JP')}</button>
                  );
                })}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--rule)', fontSize: 12, color: 'var(--paper-70)' }}>
                <span>1 回の上限 <span className="num" style={{ fontSize: 15, color: 'var(--paper)' }}>{race.capPerBet.toLocaleString('ja-JP')}</span> EP</span>
                <span>投票後の残り <span className="num" style={{ fontSize: 15, color: 'var(--paper)' }}>{Math.max(0, race.epBalance - amount).toLocaleString('ja-JP')}</span> EP</span>
              </div>
              <span className={complete && enough ? 'chip-gold' : 'chip-off'} style={{ height: 46, fontSize: 17, justifyContent: 'center', marginTop: 14, width: '100%' }} title="サーバー接続まで押せません">
                <span className="unskew">{type.label}に {formatEntryPoints(amount)} を投票する</span>
              </span>
              {!enough && <div style={{ fontSize: 12, color: '#ff6b5c', marginTop: 6 }}>参加ポイントが足りません</div>}
              <div style={{ fontSize: 12, color: 'var(--paper-45)', marginTop: 10, lineHeight: 1.7 }}>締切後は取消できません。参加ポイントは投票時に引かれ、的中すると賞金ポイント（PP）で払戻されます</div>
            </div>
          </div>
          <div className="panel" style={{ padding: '14px 16px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'baseline' }}><span className="lbl">みんなの投票状況</span><span className="lbl" style={{ marginLeft: 'auto', opacity: .55 }}>単勝の支持</span></div>
            <div style={{ marginTop: 8 }}>
              {race.shares.map(([gate, pct]) => (
                <div key={gate} style={{ display: 'flex', alignItems: 'center', gap: 10, height: 30 }}>
                  <FrameBadge gate={gate} fieldSize={race.fieldSize} w={30} h={22} />
                  <span style={{ flex: 1, height: 8, background: 'rgba(0,0,0,.5)', border: '1px solid var(--rule)' }}><span style={{ display: 'block', width: `${(pct / shareMax) * 100}%`, height: '100%', background: 'rgba(246,242,231,.45)' }} /></span>
                  <span className="num" style={{ width: 34, textAlign: 'right', fontSize: 14, color: 'var(--paper-70)' }}>{pct}%</span>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, padding: '9px 11px', background: 'rgba(63,208,224,.1)', borderLeft: '3px solid #3fd0e0' }}><span style={{ fontSize: 12, lineHeight: 1.6 }}>支持の目安です。<span style={{ color: 'var(--paper)' }}>オッズには影響しません</span></span></div>
          </div>
        </div>
      </div>
    </div>
  );
}
