'use client';

/**
 * ★**景品交換（`/exchange`）**（★R-14・2026-09-17・引き渡し資料 §8-5）
 *
 * 【★この画面が守ること】（★憲法 §0.2・正典 §17.1 L-8）
 *   ★**参加ポイント（EP）をこの画面に出しません**（★使うのは賞金ポイントだけ）
 *   ★常設の注記: ★**「賞金ポイントは現金や暗号資産には換えられません。景品はゲーム内で受け取る品だけです。」**
 *   ★**発送はしません**（★住所入力・発送状況の画面を作らない・★オーナー判定）
 *   ★語は ★**「景品交換」**（★「商品交換」と書かない）・★**「換金」「購入」を書かない**
 *
 * ⚠️ ★**ルート名について**: ★既存の `/prizes`（arcade 版）は生きています。
 *    ★同じ URL を奪うと既存が消えるので、★新しい `/exchange` に置きました。
 *    ★切り替えはオーナー判断です（★報告 §3）。
 */

import { useEffect, useState } from 'react';
import {
  Backdrop, BigButton, TopBar, useMotionPaused,
} from '../../components/uma/uma-parts';
import { RaceStrip } from '../../components/uma/race-strip';
import { exchangePrize, loadPrizeScreen, PRIZE_STATUS_LABEL, type PrizeScreenData } from '../../lib/prize-screen';

export default function ExchangePage(): React.ReactElement {
  const [paused, toggle] = useMotionPaused();
  const [data, setData] = useState<PrizeScreenData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [clientToken, setClientToken] = useState(() => crypto.randomUUID());
  const reload = (): void => {
    void loadPrizeScreen().then((fresh) => { setData(fresh); setError(null); })
      .catch((cause: unknown) => { setError(cause instanceof Error ? cause.message : String(cause)); });
  };
  useEffect(() => { reload(); }, []);
  const items = data?.prizes ?? [];
  const item = items.find((candidate) => candidate.id === picked) ?? items[0] ?? null;
  const balance = data?.ppBalance ?? null;
  const enough = item !== null && balance !== null && balance >= item.costPP;
  const submit = async (): Promise<void> => {
    if (item === null || busy || !enough) return;
    /**
     * 🔴 ★**「取り消せません」を先に言います**（★2026-09-25・簿 `ONE-WAY-DOORS`）。
     *   ★交換は ★**性質として戻せません**（★出口に触るので、戻す経路も作りません）。
     * ⚠️ ★**何を・いくつ・残りいくつ**を出します（★押す前に読める形で）。
     */
    if (!window.confirm(
      `${item.name}\n賞金ポイント ${item.costPP.toLocaleString('ja-JP')} PP`
      + `\n交換後の残り ${(balance - item.costPP).toLocaleString('ja-JP')} PP\n\n`
      + '交換は取り消せません。この内容でよろしいですか？',
    )) return;
    setBusy(true);
    try {
      const result = await exchangePrize({ prizeId: item.id, clientToken });
      if (result.ok) {
        setClientToken(crypto.randomUUID());
        setPicked(null);
        reload();
      } else setError(result.failure.message);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally { setBusy(false); }
  };

  return (
    <div
      data-theme="uma"
      className={paused ? 'u-paused' : undefined}
      style={{
        position: 'relative', width: '100%', minHeight: '100dvh', overflow: 'hidden',
        containerType: 'inline-size', background: 'var(--u-navy)', display: 'flex', flexDirection: 'column',
      }}
    >
      <Backdrop />
      <TopBar title="景品交換" paused={paused} onToggle={toggle} />
      <RaceStrip />
      {error && <div role="alert" style={{ position: 'relative', padding: '6px 14px', color: 'var(--u-red)', fontSize: 12 }}>
        {error}　<a href="/login">ログイン</a>　<button type="button" onClick={reload}>再読み込み</button>
      </div>}

      {/* ★PP のカプセル＋常設の注記（★EP はこの画面に出さない） */}
      <div style={{
        position: 'relative', flex: '0 0 auto', display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'stretch',
        padding: '10px 14px 0', width: '100%', maxWidth: 1220, margin: '0 auto',
      }}>
        <div style={{
          flex: '1 1 200px', minWidth: 0, maxWidth: 430, padding: '7px 12px',
          border: '2px solid var(--u-gold)', borderRadius: 12, background: 'rgba(30,22,4,.82)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 11, height: 11, border: '3px solid var(--u-gold)', transform: 'rotate(45deg)' }} />
            <span style={{ fontSize: 11, letterSpacing: '.08em', color: '#f7e6b5', whiteSpace: 'nowrap' }}>賞金ポイント</span>
            <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'baseline', gap: 5 }}>
              <span className="u-num" style={{ fontSize: 27, color: '#fff3cd' }}>{balance === null ? '—' : balance.toLocaleString('ja-JP')}</span>
              <span style={{ fontSize: 11, color: '#f7e6b5' }}>PP</span>
            </span>
          </div>
          <div style={{ marginTop: 3, fontSize: 10, fontWeight: 500, color: '#dcc78a' }}>景品との交換だけに使えます</div>
        </div>
        <div style={{
          flex: '1 1 200px', minWidth: 0, maxWidth: 430, padding: '7px 12px',
          border: '2px solid rgba(251,247,236,.28)', borderRadius: 12, background: 'var(--u-panel)',
          fontSize: 11, fontWeight: 500, lineHeight: 1.55, color: '#e6edf3',
        }}>
          賞金ポイントは<b>現金や暗号資産には換えられません</b>。景品は<b>ゲーム内で受け取る品だけ</b>です。
        </div>
      </div>

      {/* ★景品カード（★390 は 2 列／1280 は 7 列） */}
      <div style={{
        position: 'relative', flex: '1 1 auto', minHeight: 0, overflow: 'auto',
        padding: '10px 14px 0', width: '100%', maxWidth: 1220, margin: '0 auto',
      }}>
        {showHistory && <section style={{ marginBottom: 10, padding: 12, border: '2px solid var(--u-gold)', borderRadius: 12, background: 'var(--u-panel)' }}>
          <h2 style={{ margin: '0 0 8px', fontSize: 15 }}>交換の履歴</h2>
          {data?.history.length === 0 && <p>まだ交換の記録はありません。</p>}
          {data?.history.map((entry) => <div key={entry.id} style={{ padding: '6px 0', borderTop: '1px solid var(--u-edge-light)', fontSize: 12 }}>
            {entry.prizeName} · {entry.costPP.toLocaleString('ja-JP')} PP · {PRIZE_STATUS_LABEL[entry.status] ?? entry.status}
          </div>)}
        </section>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(148px,1fr))', gap: 10 }}>
          {data && items.length === 0 && <p>現在、交換できる景品はありません。</p>}
          {!data && !error && <p>景品を読み込み中…</p>}
          {items.map((it) => {
            const on = it.id === picked;
            const canAfford = balance !== null && balance >= it.costPP;
            return (
              <button
                key={it.id}
                type="button"
                onClick={() => { setPicked(it.id); }}
                style={{
                  display: 'block', textAlign: 'left', padding: 10, borderRadius: 12,
                  background: on ? '#fff4cf' : 'var(--u-paper)',
                  border: on ? '3px solid var(--u-gold)' : '3px solid rgba(251,247,236,.22)',
                  boxShadow: on ? '0 5px 0 var(--u-gold-ink)' : 'var(--u-shadow-card)',
                  opacity: canAfford ? 1 : 0.6,
                }}
              >
                {/* ★景品の画像は公開データに無いため、名前を主に表示する */}
                <span style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', height: 76, borderRadius: 6,
                  background: 'repeating-linear-gradient(135deg,#efe7cf 0 8px,#f8f3e4 8px 16px)',
                  border: '1px solid #cfd8e0', fontSize: 10, fontWeight: 700, color: 'var(--u-ink-dark-2)',
                }}>ゲーム内の品</span>
                <span style={{ display: 'block', marginTop: 6, fontSize: 14, color: 'var(--u-ink-dark)' }}>{it.name}</span>
                <span style={{ display: 'block', marginTop: 1, fontSize: 10, fontWeight: 700, color: 'var(--u-ink-dark-2)' }}>ゲーム内の品</span>
                <span style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
                  <span className="u-num" style={{ fontSize: 21, color: 'var(--u-gold-ink)' }}>{it.costPP.toLocaleString('ja-JP')}</span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--u-gold-ink)' }}>PP</span>
                  {/* ★在庫は色＋文字（★色だけで意味を運ばない） */}
                  <span style={{
                    padding: '1px 6px', borderRadius: 999, fontSize: 10, fontWeight: 700,
                    background: '#e4efe7', color: 'var(--u-green-deep)',
                  }}>交換受付中</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div style={{
        position: 'relative', flex: '0 0 auto', display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center',
        padding: '10px 14px var(--u-safe-bottom)', width: '100%', maxWidth: 1220, margin: '0 auto',
      }}>
        <div style={{
          flex: '1 1 180px', minWidth: 0, padding: '6px 10px',
          border: '2px solid rgba(251,247,236,.28)', borderRadius: 12, background: 'var(--u-panel)',
        }}>
          <div style={{ fontSize: 11, color: 'var(--u-ink-light-3)' }}>選択中</div>
          <div style={{ fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item?.name ?? '景品を選んでください'}</div>
          <div style={{ marginTop: 2, fontSize: 11, fontWeight: 500, color: '#f7e6b5' }}>
            {item ? `${item.costPP.toLocaleString('ja-JP')} PP` : '—'}
          </div>
        </div>
        <BigButton
          tone={enough && !busy ? 'gold' : 'disabled'}
          label="この景品と交換する"
          sub={item === null ? '景品を選んでください' : enough ? `${item.costPP.toLocaleString('ja-JP')} PP を使います` : balance === null ? '残高を読み込み中' : `あと ${Math.max(0, item.costPP - balance).toLocaleString('ja-JP')} PP`}
          onClick={() => { void submit(); }}
          grow="1.4 1 210px"
        />
        <BigButton tone="ivory" label={showHistory ? '景品の一覧' : '交換の履歴'} sub="受け取りの記録" onClick={() => { setShowHistory((value) => !value); }} grow="1 1 120px" />
      </div>
    </div>
  );
}
