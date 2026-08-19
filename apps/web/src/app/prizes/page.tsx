'use client';

/**
 * ★景品交換 — 正本 design/hud-ds/components/prize-exchange［アーケード］
 *   PP で景品と交換。カード 3 列＋右に確認パネル（金縁・金帯）、下に交換履歴。
 *   ⚠️ 今はデモデータ。交換は `exchange_prize` RPC に繋ぐまで動かない。
 *   ⚠️ 憲法: 「交換」（換金・購入と書かない）。PP を金額に換算しない。PP→EP の変換なし。残高の表示は右上 1 か所。
 */
import { useState } from 'react';
import { DEMO_PRIZES, DEMO_PRIZE_HISTORY, DEMO_PP_BALANCE, type Prize } from '../../lib/game-demo';
import { formatPrizePoints } from '../../lib/format';
import { PageTitle, Pill } from '../../components/ui';

const CATEGORIES = ['すべて', '雑貨', 'コレクション', '体験', 'ゲーム内'];
const HIST = { at: 100, delta: 120, state: 110 } as const;
const STRIPES = 'repeating-linear-gradient(135deg, rgba(16,36,58,.05) 0 8px, rgba(16,36,58,0) 8px 16px)';

/** 写真枠のプレースホルダ（地 #e6eef5＋斜線＋中央に「景品写真」） */
function Photo({ height, children, style }: { readonly height: number; readonly children?: React.ReactNode; readonly style?: React.CSSProperties }): React.ReactElement {
  return (
    <div style={{ position: 'relative', height, background: '#e6eef5', overflow: 'hidden', ...style }}>
      <div style={{ position: 'absolute', inset: 0, background: STRIPES }} />
      <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 11, fontWeight: 400, letterSpacing: '.14em', color: 'var(--a-ink-3)' }}>景品写真</div>
      {children}
    </div>
  );
}

/** 写真枠の左上タグ（左端に密着・角丸 0 6px 6px 0） */
function Tag({ prize }: { readonly prize: Prize }): React.ReactElement | null {
  const base: React.CSSProperties = { position: 'absolute', left: 0, top: 10, display: 'flex', alignItems: 'center', height: 24, padding: '0 11px', borderRadius: '0 6px 6px 0', fontSize: 11, fontWeight: 900, letterSpacing: '.08em' };
  if (prize.tag === 'limited') return <div style={{ ...base, backgroundImage: 'var(--a-gloss-blue)', border: '2px solid var(--a-edge)', borderLeft: 0, color: '#fff' }}>期間限定</div>;
  if (prize.tag === 'few') return <div style={{ ...base, backgroundImage: 'var(--a-gloss-yellow)', border: '2px solid #a9741a', borderLeft: 0, color: '#4a3105' }}>残りわずか</div>;
  return null;
}

export default function PrizesPage(): React.ReactElement {
  const [category, setCategory] = useState('すべて');
  const [selectedId, setSelectedId] = useState<string | null>(DEMO_PRIZES[0]?.id ?? null);
  const list = DEMO_PRIZES.filter((p) => category === 'すべて' || p.category === category);
  const selected = DEMO_PRIZES.find((p) => p.id === selectedId) ?? null;
  const balance = DEMO_PP_BALANCE;
  const stockText = (p: Prize): string => p.until !== null ? `${p.category === '体験' ? '受付' : '期間'} ${p.until} まで` : `在庫 ${p.stock ?? 0}`;
  const usedTotal = DEMO_PRIZE_HISTORY.reduce((s, h) => s + h.pp, 0);

  return (
    <div style={{ padding: '22px 0 40px' }}>
      <PageTitle
        title="景品交換"
        sub="賞金ポイント（PP）で景品と交換できます"
        right={
          <span style={{ display: 'flex', alignItems: 'center', gap: 10, height: 52, padding: '0 20px', borderRadius: 10, backgroundImage: 'var(--a-gloss-gold)', border: '3px solid #8a5a06', boxShadow: 'var(--a-shadow-sm)' }}>
            <span style={{ fontSize: 12, fontWeight: 900, letterSpacing: '.1em', color: '#4a3105' }}>交換に使える</span>
            <span className="a-num" style={{ fontSize: 36, color: '#4a3105' }}>{balance.toLocaleString('ja-JP')}</span>
            <span style={{ fontSize: 13, fontWeight: 900, color: '#4a3105' }}>PP</span>
          </span>
        }
      />
      <p style={{ margin: '8px 0 0', fontSize: 12, fontWeight: 900, color: 'var(--a-ink-3)' }}>※ デモデータ（交換はサーバー RPC に接続するまで動きません）</p>

      {/* 分類タブ */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
        {CATEGORIES.map((c) => {
          const sel = c === category;
          return (
            <button key={c} type="button" onClick={() => setCategory(c)} style={{ display: 'flex', alignItems: 'center', height: 36, padding: '0 18px', cursor: 'pointer', fontFamily: 'inherit', borderRadius: 8, border: `2px solid ${sel ? 'var(--a-edge)' : 'var(--a-edge-soft)'}`, backgroundImage: sel ? 'var(--a-gloss-blue)' : 'linear-gradient(#fff,#e9eff5)', color: sel ? '#fff' : 'var(--a-ink-2)', fontSize: 14, fontWeight: 900, boxShadow: sel ? 'var(--a-inset)' : 'none' }}>{c}</button>
          );
        })}
        <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 900, color: 'var(--a-ink-3)' }}>交換すると賞金ポイントが減り、履歴に残ります</span>
      </div>

      <div style={{ display: 'flex', gap: 16, marginTop: 14, alignItems: 'flex-start' }}>
        {/* 景品カード 3 列 */}
        <div style={{ flex: 1, minWidth: 0, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
          {list.map((p) => {
            const sel = p.id === selectedId;
            const short = balance < p.pp;
            return (
              <div key={p.id} onClick={() => setSelectedId(p.id)} style={{ display: 'flex', flexDirection: 'column', cursor: 'pointer', borderRadius: 10, overflow: 'hidden', background: sel ? 'linear-gradient(#fffdf2,#fff3cf)' : '#fff', border: sel ? '3px solid #8a5a06' : '2px solid var(--a-edge)', boxShadow: 'var(--a-shadow-sm)' }}>
                <Photo height={136} style={{ borderBottom: '2px solid var(--a-line)' }}>
                  <Tag prize={p} />
                  {sel && <div style={{ position: 'absolute', right: 10, top: 10, display: 'flex', alignItems: 'center', height: 24, padding: '0 11px', borderRadius: 6, backgroundImage: 'var(--a-gloss-gold)', border: '2px solid #8a5a06', color: '#4a3105', fontSize: 11, fontWeight: 900 }}>選択中</div>}
                </Photo>
                <div style={{ padding: '12px 14px 14px' }}>
                  <div style={{ fontSize: 11, fontWeight: 900, color: 'var(--a-ink-3)', letterSpacing: '.08em' }}>{p.category}</div>
                  <div style={{ fontSize: 18, fontWeight: 900, marginTop: 5, lineHeight: 1.35 }}>{p.name}</div>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--a-line)' }}>
                    <span><span className="a-lbl" style={{ display: 'block', fontSize: 11 }}>必要</span><span className="a-num" style={{ fontSize: 30, color: 'var(--a-num-money)' }}>{p.pp.toLocaleString('ja-JP')}</span> <span style={{ fontSize: 12, fontWeight: 900, color: 'var(--a-ink-2)' }}>PP</span></span>
                    <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 900, color: p.tag === 'few' ? '#8a5a06' : 'var(--a-ink-3)' }}>{stockText(p)}</span>
                  </div>
                  {short && <div style={{ marginTop: 10, padding: '8px 10px', borderRadius: 8, background: '#ffeceb', border: '2px solid var(--a-red-d)', fontSize: 12, fontWeight: 900, color: 'var(--a-red-d)' }}>賞金ポイントが足りません</div>}
                </div>
              </div>
            );
          })}
          {list.length === 0 && <p style={{ gridColumn: '1 / -1', fontSize: 14, fontWeight: 900, color: 'var(--a-ink-2)', margin: 0 }}>交換できる景品を準備中です</p>}
        </div>

        {/* 交換の確認（金縁・金帯＝PP の画面） */}
        <div className="a-panel strong" style={{ width: 334, flex: '0 0 334px', borderColor: '#8a5a06' }}>
          <div className="a-band a-band-gold" style={{ height: 40, padding: '0 16px', borderBottom: '2px solid #8a5a06' }}><span style={{ fontSize: 16, fontWeight: 900, letterSpacing: '.1em' }}>交換の確認</span></div>
          <div style={{ padding: '14px 16px 16px', backgroundImage: 'linear-gradient(#fffdf2,#fff8e6)' }}>
            {selected === null ? (
              <p style={{ fontSize: 14, fontWeight: 900, color: 'var(--a-ink-2)', margin: 0 }}>左の一覧から景品を選んでください</p>
            ) : (
              <>
                <Photo height={124} style={{ borderRadius: 8, border: '2px solid var(--a-line)' }} />
                <div style={{ fontSize: 20, fontWeight: 900, marginTop: 12 }}>{selected.name}</div>
                <div style={{ fontSize: 12, fontWeight: 900, color: 'var(--a-ink-3)', marginTop: 4 }}>{selected.category}　{stockText(selected)}</div>
                <div style={{ marginTop: 14, borderTop: '2px solid var(--a-line)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: 44 }}><span className="a-lbl">必要</span><span><span className="a-num" style={{ fontSize: 30, color: 'var(--a-num-money)' }}>{selected.pp.toLocaleString('ja-JP')}</span> <span style={{ fontSize: 12, fontWeight: 900, color: 'var(--a-ink-2)' }}>PP</span></span></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: 44, borderTop: '1px solid var(--a-line)' }}><span className="a-lbl">交換後の残り</span><span><span className="a-num" style={{ fontSize: 26, color: 'var(--a-ink-2)' }}>{Math.max(0, balance - selected.pp).toLocaleString('ja-JP')}</span> <span style={{ fontSize: 12, fontWeight: 900, color: 'var(--a-ink-2)' }}>PP</span></span></div>
                </div>
                <div style={{ marginTop: 12, padding: '11px 13px', borderRadius: 8, background: '#eaf3fb', border: '2px solid #9fc0dc' }}><span style={{ fontSize: 12, fontWeight: 900, color: 'var(--a-ink)', lineHeight: 1.7 }}>交換した景品は取消できません。発送先はアカウント設定の住所になります</span></div>
                <span className={balance >= selected.pp ? 'a-btn a-btn-gold' : 'a-btn a-btn-gold off'} style={{ width: '100%', height: 54, marginTop: 12, fontSize: 18, pointerEvents: 'none', ...(balance >= selected.pp ? {} : { opacity: .4 }) }} title="サーバー接続まで押せません">この景品と交換する</span>
                {balance < selected.pp && <div style={{ fontSize: 12, fontWeight: 900, color: 'var(--a-red-d)', marginTop: 6 }}>賞金ポイントが足りません</div>}
                <div style={{ fontSize: 12, fontWeight: 900, color: 'var(--a-ink-3)', marginTop: 10, lineHeight: 1.7 }}>賞金ポイントは景品との交換にのみ使えます。参加ポイント（EP）には変換できません</div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* 交換履歴 */}
      <div className="a-panel strong" style={{ marginTop: 20 }}>
        <div className="a-band" style={{ height: 44, padding: '0 16px', gap: 14 }}>
          <span style={{ fontSize: 17, fontWeight: 900 }}>交換履歴</span>
          <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 7, height: 30, padding: '0 12px', borderRadius: 8, background: '#fff', border: '2px solid var(--a-edge)' }}>
            <span style={{ fontSize: 11, fontWeight: 900, color: 'var(--a-ink-2)' }}>交換に使った合計</span>
            <span className="a-num" style={{ fontSize: 19, color: 'var(--a-ink)' }}>{usedTotal.toLocaleString('ja-JP')}</span>
            <span style={{ fontSize: 11, fontWeight: 900, color: 'var(--a-ink-2)' }}>PP</span>
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', height: 34, padding: '0 16px', gap: 12, backgroundImage: 'linear-gradient(#fff,#e3ecf3)', borderBottom: '2px solid var(--a-line)' }}>
          <span className="a-lbl" style={{ width: HIST.at, flex: `0 0 ${HIST.at}px` }}>日時</span>
          <span className="a-lbl" style={{ flex: 1, minWidth: 200 }}>景品</span>
          <span className="a-lbl" style={{ width: HIST.delta, flex: `0 0 ${HIST.delta}px`, textAlign: 'right' }}>増減（PP）</span>
          <span className="a-lbl" style={{ width: HIST.state, flex: `0 0 ${HIST.state}px`, textAlign: 'right' }}>状態</span>
        </div>
        {DEMO_PRIZE_HISTORY.map((h, i) => (
          <div key={i} className="a-row" style={{ height: 44, padding: '0 16px', gap: 12 }}>
            <span className="a-num" style={{ width: HIST.at, flex: `0 0 ${HIST.at}px`, fontSize: 14, color: 'var(--a-ink-3)' }}>{h.at}</span>
            <span style={{ flex: 1, minWidth: 200, fontSize: 15, fontWeight: 900, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{h.name}</span>
            <span className="a-num" style={{ width: HIST.delta, flex: `0 0 ${HIST.delta}px`, textAlign: 'right', fontSize: 22, color: 'var(--a-ink)' }}>−{formatPrizePoints(h.pp).replace(' PP', '')}</span>
            <span style={{ width: HIST.state, flex: `0 0 ${HIST.state}px`, textAlign: 'right' }}>{h.state === 'shipped' ? <Pill tone="green">発送済み</Pill> : <Pill tone="yellow">準備中</Pill>}</span>
          </div>
        ))}
        {DEMO_PRIZE_HISTORY.length === 0 && <p style={{ padding: '14px 16px', margin: 0, fontSize: 14, fontWeight: 900, color: 'var(--a-ink-2)' }}>まだ交換した景品はありません</p>}
      </div>
    </div>
  );
}
