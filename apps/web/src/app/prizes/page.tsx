'use client';

/**
 * ★景品交換 — 正本 design/hud-ds/components/prize-exchange［アーケード］
 *   PP で景品と交換。カード 3 列＋右に確認パネル（金縁・金帯）、下に交換履歴。
 *   ⚠️ 憲法: 「交換」（換金・購入と書かない）。PP を金額に換算しない。PP→EP の変換なし。残高の表示は右上 1 か所。
 *
 * ★**2026-09-19・UI-4 で本番データに繋ぎました。**
 *   ★一覧 … `prize_catalog_public`（`active and stock > 0` で絞った行だけ）
 *   ★残高 … `users.prize_points`／★履歴 … `prize_exchanges`（RLS で本人の行だけ）
 *   ★交換 … `exchange_prize(p_prize_id, p_client_token)`
 *
 * 🔴 ★**デモにあって、サーバーに列が無かったもの**（★UI1-8 の「毛色」と同じ形。★作りません）
 *   ① ★**分類（`category`）** … ★分類タブを出していません
 *   ② ★**期限（`until`）** … ★「◯◯まで」を出していません
 *   ③ ★**在庫（`stock`）と「残りわずか」の印（`tag`）** … ★`prize_catalog_public` は在庫を返しません。
 *      ★正典 §11.3 は ★**「在庫切れは交換画面に出さない」**＝ ★**選ばせてから断らない**と定めており、
 *      ★ビューが `stock > 0` で絞っています。→ ★**出ている ＝ 交換できる**。
 *      ⚠️ ★残り数を出すかは ★**煽りの設計**に関わるので、★勝手に決めません（★照会中）。
 */
import { useEffect, useState } from 'react';
import {
  loadPrizeScreen, exchangePrize, PRIZE_STATUS_LABEL,
  type PrizeScreenData,
} from '../../lib/prize-screen';
import { formatPrizePoints } from '../../lib/format';
import { PageTitle, Pill } from '../../components/ui';

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

/** ★日時（★サーバーの ISO を短く。★画面で「いま」を作らない） */
const clock = (iso: string): string => {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

export default function PrizesPage(): React.ReactElement {
  const [data, setData] = useState<PrizeScreenData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [exchangeError, setExchangeError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  /**
   * ★**冪等キー**。⚠️ ★**押すたびに作り直さないこと** — ★作り直すと ★**二重交換**になります
   *    （★`exchange_prize` は `(user_id, client_token)` で再送を見分けています）。
   *    ★1 回通ったら ★**次の交換用に作り直します**（★連続して交換できなくなるため）。
   */
  const [clientToken, setClientToken] = useState(() => crypto.randomUUID());

  const reload = (): void => {
    setLoadError(null);
    loadPrizeScreen()
      .then((d) => { setData(d); })
      // 🔴 ★失敗を空にしない（★「景品が無い」に見えてしまう・R-16・UI1-9）
      .catch((e: unknown) => { setData(null); setLoadError(e instanceof Error ? e.message : String(e)); });
  };
  useEffect(() => { reload(); }, []);

  const prizes = data?.prizes ?? [];
  const history = data?.history ?? [];
  const balance = data?.ppBalance ?? 0;
  const selected = prizes.find((p) => p.id === selectedId) ?? null;
  const usedTotal = history.filter((h) => h.status !== 'cancelled').reduce((s, h) => s + h.costPP, 0);

  const submit = async (): Promise<void> => {
    if (selected === null || busy) return;
    setBusy(true); setExchangeError(null); setDone(false);
    try {
      const r = await exchangePrize({ prizeId: selected.id, clientToken });
      if (r.ok) {
        setDone(true);
        setClientToken(crypto.randomUUID());
        // ★残高・在庫・履歴はサーバーが動いた。★画面で引き算せずに読み直す（BT-0）
        reload();
      } else {
        // 🔴 ★**原文をそのまま**（★在庫切れも PP 不足も `exchange_prize` が判定しています）
        setExchangeError(r.failure.message);
      }
    } catch (e) {
      setExchangeError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

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

      {/* 🔴 ★読み込み中と失敗を必ず出す（★UI1-9） */}
      {loadError !== null && (
        <div className="a-panel" style={{ marginTop: 14, padding: '14px 16px', fontSize: 14, fontWeight: 900, color: 'var(--a-red-d)' }}>
          景品を読めませんでした: {loadError}
        </div>
      )}
      {data === null && loadError === null && (
        <div className="a-panel" style={{ marginTop: 14, padding: '14px 16px', fontSize: 14, fontWeight: 900, color: 'var(--a-ink-2)' }}>読み込んでいます…</div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
        <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 900, color: 'var(--a-ink-3)' }}>交換すると賞金ポイントが減り、履歴に残ります</span>
      </div>

      {data !== null && (
      <div style={{ display: 'flex', gap: 16, marginTop: 14, alignItems: 'flex-start' }}>
        {/* 景品カード 3 列 */}
        <div className="a-cards c3 pz-cards" style={{ flex: 1, minWidth: 0, gap: 14 }}>
          {prizes.map((p) => {
            const sel = p.id === selectedId;
            /** ⚠️ ★これは ★**押せるかの見せ方**だけ。★最終判定は `exchange_prize` です */
            const short = balance < p.costPP;
            return (
              <div key={p.id} onClick={() => setSelectedId(p.id)} style={{ display: 'flex', flexDirection: 'column', cursor: 'pointer', borderRadius: 10, overflow: 'hidden', background: sel ? 'linear-gradient(#fffdf2,#fff3cf)' : '#fff', border: sel ? '3px solid #8a5a06' : '2px solid var(--a-edge)', boxShadow: 'var(--a-shadow-sm)' }}>
                <Photo height={136} style={{ borderBottom: '2px solid var(--a-line)' }}>
                  {sel && <div style={{ position: 'absolute', right: 10, top: 10, display: 'flex', alignItems: 'center', height: 24, padding: '0 11px', borderRadius: 6, backgroundImage: 'var(--a-gloss-gold)', border: '2px solid #8a5a06', color: '#4a3105', fontSize: 11, fontWeight: 900 }}>選択中</div>}
                </Photo>
                <div style={{ padding: '12px 14px 14px' }}>
                  <div style={{ fontSize: 18, fontWeight: 900, marginTop: 5, lineHeight: 1.35 }}>{p.name}</div>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--a-line)' }}>
                    <span><span className="a-lbl" style={{ display: 'block', fontSize: 11 }}>必要</span><span className="a-num" style={{ fontSize: 30, color: 'var(--a-num-money)' }}>{p.costPP.toLocaleString('ja-JP')}</span> <span style={{ fontSize: 12, fontWeight: 900, color: 'var(--a-ink-2)' }}>PP</span></span>
                  </div>
                  {short && <div style={{ marginTop: 10, padding: '8px 10px', borderRadius: 8, background: '#ffeceb', border: '2px solid var(--a-red-d)', fontSize: 12, fontWeight: 900, color: 'var(--a-red-d)' }}>賞金ポイントが足りません</div>}
                </div>
              </div>
            );
          })}
          {prizes.length === 0 && <p style={{ gridColumn: '1 / -1', fontSize: 14, fontWeight: 900, color: 'var(--a-ink-2)', margin: 0 }}>交換できる景品を準備中です</p>}
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
                <div style={{ marginTop: 14, borderTop: '2px solid var(--a-line)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: 44 }}><span className="a-lbl">必要</span><span><span className="a-num" style={{ fontSize: 30, color: 'var(--a-num-money)' }}>{selected.costPP.toLocaleString('ja-JP')}</span> <span style={{ fontSize: 12, fontWeight: 900, color: 'var(--a-ink-2)' }}>PP</span></span></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: 44, borderTop: '1px solid var(--a-line)' }}><span className="a-lbl">交換後の残り</span><span><span className="a-num" style={{ fontSize: 26, color: 'var(--a-ink-2)' }}>{Math.max(0, balance - selected.costPP).toLocaleString('ja-JP')}</span> <span style={{ fontSize: 12, fontWeight: 900, color: 'var(--a-ink-2)' }}>PP</span></span></div>
                </div>
                <div style={{ marginTop: 12, padding: '11px 13px', borderRadius: 8, background: '#eaf3fb', border: '2px solid #9fc0dc' }}><span style={{ fontSize: 12, fontWeight: 900, color: 'var(--a-ink)', lineHeight: 1.7 }}>交換した景品は取消できません。発送先はアカウント設定の住所になります</span></div>
                <button
                  type="button"
                  className={`a-btn a-btn-gold${balance >= selected.costPP && !busy ? '' : ' off'}`}
                  style={{ width: '100%', height: 54, marginTop: 12, fontSize: 18, cursor: 'pointer', fontFamily: 'inherit' }}
                  onClick={() => { void submit(); }}
                  disabled={balance < selected.costPP || busy}
                >{busy ? '送っています…' : 'この景品と交換する'}</button>
                {balance < selected.costPP && <div style={{ fontSize: 12, fontWeight: 900, color: 'var(--a-red-d)', marginTop: 6 }}>賞金ポイントが足りません</div>}
                {/* 🔴 ★失敗を握り潰さない（★在庫切れも PP 不足も RPC の文言をそのまま） */}
                {exchangeError !== null && <div style={{ fontSize: 12, fontWeight: 900, color: 'var(--a-red-d)', marginTop: 8 }}>{exchangeError}</div>}
                {done && <div style={{ fontSize: 12, fontWeight: 900, color: 'var(--a-green-d)', marginTop: 8 }}>交換を受け付けました（履歴に残ります）</div>}
                <div style={{ fontSize: 12, fontWeight: 900, color: 'var(--a-ink-3)', marginTop: 10, lineHeight: 1.7 }}>賞金ポイントは景品との交換にのみ使えます。参加ポイント（EP）には変換できません</div>
              </>
            )}
          </div>
        </div>
      </div>
      )}

      {/* 交換履歴 */}
      {data !== null && (
      <div className="a-panel strong" style={{ marginTop: 20 }}>
        <div className="a-band hide-narrow" style={{ height: 44, padding: '0 16px', gap: 14 }}>
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
        {history.map((h) => (
          <div key={h.id} className="a-row" style={{ height: 44, padding: '0 16px', gap: 12 }}>
            <span className="a-num" style={{ width: HIST.at, flex: `0 0 ${HIST.at}px`, fontSize: 14, color: 'var(--a-ink-3)' }}>{clock(h.at)}</span>
            <span style={{ flex: 1, minWidth: 200, fontSize: 15, fontWeight: 900, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{h.prizeName}</span>
            <span className="a-num" style={{ width: HIST.delta, flex: `0 0 ${HIST.delta}px`, textAlign: 'right', fontSize: 22, color: 'var(--a-ink)' }}>−{formatPrizePoints(h.costPP).replace(' PP', '')}</span>
            {/* ⚠️ ★状態は 3 つあります（`0007` の `exchange_status_known`）。★2 つに丸めない */}
            <span style={{ width: HIST.state, flex: `0 0 ${HIST.state}px`, textAlign: 'right' }}>
              {h.status === 'fulfilled' ? <Pill tone="green">{PRIZE_STATUS_LABEL[h.status]}</Pill>
                : h.status === 'cancelled' ? <Pill tone="red">{PRIZE_STATUS_LABEL[h.status]}</Pill>
                : <Pill tone="yellow">{PRIZE_STATUS_LABEL[h.status] ?? h.status}</Pill>}
            </span>
          </div>
        ))}
        {history.length === 0 && <p style={{ padding: '14px 16px', margin: 0, fontSize: 14, fontWeight: 900, color: 'var(--a-ink-2)' }}>まだ交換した景品はありません</p>}
      </div>
      )}
    </div>
  );
}
