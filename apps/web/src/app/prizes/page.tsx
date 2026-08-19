'use client';

/**
 * ★景品交換 — 正本 design/hud-ds/components/prize-exchange
 *   PP で景品と交換。カード 3 列＋右に確認パネル、下に交換履歴。
 *   ⚠️ 今はデモデータ。交換は `exchange_prize` RPC に繋ぐまで動かない。
 *   ⚠️ 憲法: 「交換」（換金・購入と書かない）。PP を金額に換算しない。PP→EP の変換なし。残高の表示は右上 1 か所。
 */
import { useState } from 'react';
import { DEMO_PRIZES, DEMO_PRIZE_HISTORY, DEMO_PP_BALANCE, type Prize } from '../../lib/game-demo';
import { formatPrizePoints } from '../../lib/format';

const CATEGORIES = ['すべて', '雑貨', 'コレクション', '体験', 'ゲーム内'];

function Tag({ prize }: { readonly prize: Prize }): React.ReactElement | null {
  if (prize.tag === 'limited') return <div style={{ position: 'absolute', left: 0, top: 10, display: 'flex', alignItems: 'center', height: 22, padding: '0 10px', background: '#3fd0e0', color: '#0b1416', fontSize: 11, fontWeight: 900, letterSpacing: '.08em' }}>期間限定</div>;
  if (prize.tag === 'few') return <div style={{ position: 'absolute', left: 0, top: 10, display: 'flex', alignItems: 'center', height: 22, padding: '0 10px', background: '#fad728', color: 'var(--ink)', fontSize: 11, fontWeight: 900, letterSpacing: '.08em' }}>残りわずか</div>;
  return null;
}

export default function PrizesPage(): React.ReactElement {
  const [category, setCategory] = useState('すべて');
  const [selectedId, setSelectedId] = useState<string | null>(DEMO_PRIZES[0]?.id ?? null);
  const list = DEMO_PRIZES.filter((p) => category === 'すべて' || p.category === category);
  const selected = DEMO_PRIZES.find((p) => p.id === selectedId) ?? null;
  const balance = DEMO_PP_BALANCE;
  const stockText = (p: Prize): string => p.until !== null ? `${p.category === '体験' ? '受付' : '期間'} ${p.until} まで` : `在庫 ${p.stock ?? 0}`;

  return (
    <div style={{ padding: '26px 0 40px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 34, fontWeight: 900, margin: 0 }}>景品交換</h1>
        <span style={{ fontSize: 14, color: 'var(--paper-70)' }}>賞金ポイント（PP）で景品と交換できます</span>
        <div className="board" style={{ marginLeft: 'auto', display: 'flex', alignItems: 'baseline', gap: 8, padding: '8px 18px' }}>
          <span className="lbl">交換に使える</span><span className="num plate" style={{ fontSize: 30 }}>{balance.toLocaleString('ja-JP')}</span><span style={{ fontSize: 13, color: 'var(--paper-70)' }}>PP</span>
        </div>
      </div>
      <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--paper-45)' }}>※ デモデータ（交換はサーバー RPC に接続するまで動きません）</p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
        {CATEGORIES.map((c) => {
          const sel = c === category;
          return <button key={c} type="button" onClick={() => setCategory(c)} style={{ display: 'flex', alignItems: 'center', height: 34, padding: '0 16px', cursor: 'pointer', fontFamily: 'inherit', background: sel ? 'var(--gold)' : 'rgba(7,10,8,.72)', border: `1px solid ${sel ? 'var(--gold)' : 'var(--rule)'}`, color: sel ? 'var(--ink)' : 'var(--paper)', fontSize: 14, fontWeight: sel ? 900 : 700 }}>{c}</button>;
        })}
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--paper-45)' }}>交換すると賞金ポイントが減り、履歴に残ります</span>
      </div>

      <div style={{ display: 'flex', gap: 16, marginTop: 14, alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
          {list.map((p) => {
            const sel = p.id === selectedId;
            const short = balance < p.pp;
            return (
              <div key={p.id} onClick={() => setSelectedId(p.id)} style={{ position: 'relative', display: 'flex', flexDirection: 'column', cursor: 'pointer', background: sel ? 'rgba(240,204,74,.1)' : 'rgba(6,10,8,.72)', border: `1px solid ${sel ? 'var(--gold)' : 'var(--hair)'}`, opacity: short ? .45 : 1 }}>
                <div style={{ position: 'relative', height: 132, background: '#1b241d', borderBottom: '1px solid var(--rule)', overflow: 'hidden' }}>
                  <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', fontSize: 11, color: 'rgba(255,255,255,.5)', fontWeight: 400 }}>景品写真</div>
                  <Tag prize={p} />
                  {sel && <div style={{ position: 'absolute', right: 10, top: 10, display: 'flex', alignItems: 'center', height: 22, padding: '0 10px', background: 'var(--gold)', color: 'var(--ink)', fontSize: 11, fontWeight: 900 }}>選択中</div>}
                </div>
                <div style={{ padding: '12px 14px 14px' }}>
                  <div style={{ fontSize: 11, color: 'var(--paper-45)', letterSpacing: '.08em' }}>{p.category}</div>
                  <div style={{ fontSize: 17, fontWeight: 900, marginTop: 5, lineHeight: 1.35 }}>{p.name}</div>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--rule)' }}>
                    <span><span className="lbl" style={{ display: 'block' }}>必要</span><span className="num" style={{ fontSize: 24, color: 'var(--gold)' }}>{p.pp.toLocaleString('ja-JP')}</span> <span style={{ fontSize: 12, color: 'var(--paper-70)' }}>PP</span></span>
                    <span style={{ marginLeft: 'auto', fontSize: 12, color: p.tag === 'few' ? '#fad728' : 'var(--paper-45)' }}>{stockText(p)}</span>
                  </div>
                  {short && <div style={{ fontSize: 12, color: 'var(--paper-45)', marginTop: 8 }}>賞金ポイントが足りません</div>}
                </div>
              </div>
            );
          })}
          {list.length === 0 && <p style={{ gridColumn: '1 / -1', fontSize: 14, color: 'var(--paper-70)' }}>交換できる景品を準備中です</p>}
        </div>
        <div className="board" style={{ width: 330, flex: '0 0 330px' }}>
          <div className="edge" />
          <div style={{ padding: '16px 18px 18px' }}>
            <div className="lbl" style={{ color: 'var(--gold)' }}>交換の確認</div>
            {selected === null ? (
              <p style={{ fontSize: 14, color: 'var(--paper-70)', marginTop: 12 }}>左の一覧から景品を選んでください</p>
            ) : (
              <>
                <div style={{ height: 120, marginTop: 12, background: '#1b241d', border: '1px solid var(--rule)', position: 'relative' }}><div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', fontSize: 11, color: 'rgba(255,255,255,.5)', fontWeight: 400 }}>景品写真</div></div>
                <div style={{ fontSize: 19, fontWeight: 900, marginTop: 12 }}>{selected.name}</div>
                <div style={{ fontSize: 12, color: 'var(--paper-45)', marginTop: 4 }}>{selected.category}　{stockText(selected)}</div>
                <div style={{ marginTop: 14, borderTop: '1px solid var(--rule)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', height: 36 }}><span className="lbl">必要</span><span><span className="num" style={{ fontSize: 24, color: 'var(--gold)' }}>{selected.pp.toLocaleString('ja-JP')}</span> <span style={{ fontSize: 12, color: 'var(--paper-70)' }}>PP</span></span></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', height: 36, borderTop: '1px solid var(--rule)' }}><span className="lbl">交換後の残り</span><span><span className="num" style={{ fontSize: 20, color: 'var(--paper-70)' }}>{Math.max(0, balance - selected.pp).toLocaleString('ja-JP')}</span> <span style={{ fontSize: 12, color: 'var(--paper-70)' }}>PP</span></span></div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, padding: '10px 12px', background: 'rgba(63,208,224,.1)', borderLeft: '3px solid #3fd0e0' }}><span style={{ fontSize: 12, lineHeight: 1.7 }}>交換した景品は取消できません。発送先はアカウント設定の住所になります</span></div>
                <span className={balance >= selected.pp ? 'chip-gold' : 'chip-off'} style={{ height: 46, fontSize: 17, justifyContent: 'center', marginTop: 12, width: '100%' }} title="サーバー接続まで押せません"><span className="unskew">この景品と交換する</span></span>
                {balance < selected.pp && <div style={{ fontSize: 12, color: '#ff6b5c', marginTop: 6 }}>賞金ポイントが足りません</div>}
                <div style={{ fontSize: 12, color: 'var(--paper-45)', marginTop: 10, lineHeight: 1.7 }}>賞金ポイントは景品との交換にのみ使えます。参加ポイント（EP）には変換できません</div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* 交換履歴 */}
      <div className="panel" style={{ marginTop: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', height: 44, padding: '0 16px', gap: 14, borderBottom: '1px solid var(--rule)' }}>
          <span style={{ fontSize: 17, fontWeight: 900 }}>交換履歴</span>
          <span style={{ marginLeft: 'auto', fontSize: 13, color: 'var(--paper-70)' }}>交換に使った合計 <span className="num" style={{ fontSize: 18, color: 'var(--paper)' }}>{DEMO_PRIZE_HISTORY.reduce((s, h) => s + h.pp, 0).toLocaleString('ja-JP')}</span> PP</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', height: 34, padding: '0 16px', gap: 12 }}><span className="lbl" style={{ flex: '0 0 96px' }}>日時</span><span className="lbl" style={{ flex: 1, minWidth: 200 }}>景品</span><span className="lbl" style={{ flex: '0 0 110px', textAlign: 'right' }}>増減</span><span className="lbl" style={{ flex: '0 0 96px', textAlign: 'right' }}>状態</span></div>
        {DEMO_PRIZE_HISTORY.map((h, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', height: 40, padding: '0 16px', gap: 12, borderTop: '1px solid var(--rule)', background: i % 2 === 1 ? 'var(--row)' : 'transparent' }}>
            <span className="num" style={{ flex: '0 0 96px', fontSize: 13, color: 'var(--paper-45)' }}>{h.at}</span>
            <span style={{ flex: 1, minWidth: 200, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{h.name}</span>
            <span className="num" style={{ flex: '0 0 110px', textAlign: 'right', fontSize: 17 }}>−{formatPrizePoints(h.pp).replace(' PP', '')}</span>
            <span style={{ flex: '0 0 96px', textAlign: 'right' }}><span style={{ display: 'inline-flex', alignItems: 'center', height: 22, padding: '0 9px', fontSize: 11, color: h.state === 'shipped' ? '#5fd48b' : '#fad728', border: `1px solid ${h.state === 'shipped' ? 'rgba(95,212,139,.4)' : 'rgba(250,215,40,.4)'}` }}>{h.state === 'shipped' ? '発送済み' : '準備中'}</span></span>
          </div>
        ))}
        {DEMO_PRIZE_HISTORY.length === 0 && <p style={{ padding: '14px 16px', fontSize: 14, color: 'var(--paper-70)' }}>まだ交換した景品はありません</p>}
      </div>
    </div>
  );
}
