'use client';

/**
 * ★**馬を迎える**（★D12-5・2026-09-16・正典 **D-102**・デザイナーのカード `components/jockey-market`）
 *
 * 【★この画面が守ること】
 *   🔴 ★**出るのは値段だけ**（★2026-09-18・**D-114 ②**・T-10・AL-2。
 *     ★旧は「★と値段」でしたが、★**素質の段は画面に出しません**）
 *   ★**同じ値段の中ではどの 1 頭を迎えても同じ**（★値段から中身を読めない）
 *   ★**引き直しを煽らない**（★「もう一度探す」を置かない・D-102 ③）
 *   ★**手放すと戻るのは払った額の一部だけ**（★数字で明示）
 *
 * ⚠️ ★口数と戻り額は ★**`@star/scheduler` から引きます**（★画面に表を持たない・D-052）。
 * ⚠️ ★**値段は見本の値**です（`DEMO_MARKET_PRICES_EP`）— ★本番は `horse_market_listing.price_ep` を読みます。
 *    ★画面で `priceOfStars(段)` を計算していましたが、★**段を画面に渡す口**になるのでやめました。
 * 🔴 ★**T-11 でこの画面ごと変わります**（★候補＝走った実績のある馬・★値段＝§10.5 の式）。★見た目はデザイナー便。
 * ⚠️ ★**「購入」ではなく「迎える」**（★金銭を想起させない語・依頼書の指定）。
 */

import { useState } from 'react';
import { LISTINGS_PER_TIER, sellBackEP } from '@star/scheduler';
import { DEMO_MARKET_PRICES_EP, DEMO_MARKET_STOCK_BY_BAND } from '../../../lib/game-demo';

export default function MarketPage(): React.ReactElement {
  // ⚠️ ★選んだものを ★**値段と枠**で持ちます（★旧は `band`＝素質の段でした・D-114 ②）
  const [picked, setPicked] = useState<{ readonly priceEP: number; readonly slot: number } | null>(null);
  const price = picked === null ? null : picked.priceEP;
  const back = price === null ? null : sellBackEP(price);

  return (
    <div style={{ padding: '0 0 28px' }}>
      <div className="a-band" style={{ height: 52, padding: '0 16px' }}>
        <span style={{ fontSize: 18, fontWeight: 900, letterSpacing: '.06em' }}>馬を迎える</span>
      </div>

      <div style={{ padding: '12px 16px 0', fontSize: 11.5, fontWeight: 900, color: 'var(--a-ink-2)', lineHeight: 1.7 }}>
        {DEMO_MARKET_PRICES_EP.length} つの値段・それぞれ {LISTINGS_PER_TIER} 頭。
        <b style={{ color: 'var(--a-ink)' }}>同じ値段の中なら、どの 1 頭を迎えても同じです</b>。
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '14px 16px 0' }}>
        {DEMO_MARKET_PRICES_EP.map((priceEP, rowIndex) => {
          /**
           * ★**残っている口数**（★`null` は満口。★本番はサーバーが数えます）。
           * ⚠️ ★**下限を割ると 0 口になります**（★正典 D-102 ⑤）。★そのときも ★**帯は広げない・消さない**。
           */
          const stock = DEMO_MARKET_STOCK_BY_BAND[rowIndex] ?? LISTINGS_PER_TIER;
          return (
          <div key={priceEP} style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '14px 14px 16px', borderRadius: 14, background: '#fff', border: '2px solid var(--a-edge)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              {/* ⚠️ ★**★（素質の段）を取りました**。★見出しは値段だけです（D-114 ②） */}
              <span />
              <span>
                <span className="a-num" style={{ fontSize: 20, color: 'var(--a-num-money)' }}>{priceEP.toLocaleString()}</span>
                <span style={{ fontSize: 11, fontWeight: 900, color: 'var(--a-ink-2)' }}> EP</span>
              </span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {Array.from({ length: LISTINGS_PER_TIER }, (_, slot) => {
                /**
                 * ★**居ない枠は「今は　いません」の静かな空欄**（★デザイナーの回答・2026-09-16）。
                 * ⚠️ ★**「残り 0」という数字を出しません** — ★数えさせると「補充を待つ」煽りになります。
                 * ⚠️ ★**枠そのものは残します**（★枡を詰めて帯を広げない・D-102 ⑤）。
                 */
                if (slot >= stock) {
                  return (
                    <div
                      key={slot}
                      style={{
                        flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4,
                        padding: '10px 6px', borderRadius: 10, minHeight: 96,
                        background: 'var(--a-ivory)', border: '1.5px dashed var(--a-edge-soft)',
                      }}
                    >
                      <span style={{ fontSize: 11, fontWeight: 900, color: 'var(--a-ink-3)', textAlign: 'center', lineHeight: 1.5 }}>
                        今は<br />いません
                      </span>
                    </div>
                  );
                }
                const sel = picked !== null && picked.priceEP === priceEP && picked.slot === slot;
                return (
                  <div
                    key={slot}
                    onClick={() => { setPicked({ priceEP, slot }); }}
                    style={{
                      position: 'relative',
                      flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, padding: '10px 6px', borderRadius: 10, cursor: 'pointer',
                      background: 'var(--a-panel-2)',
                      border: sel ? '2px solid #8a5a06' : '1.5px solid var(--a-line)',
                    }}
                  >
                    {/* ★欠けている帯の先頭にだけ、残りの口数を控えめに（★満口の帯には出さない） */}
                    {slot === 0 && stock < LISTINGS_PER_TIER && (
                      <span style={{ position: 'absolute', right: 5, top: 5, display: 'flex', alignItems: 'center', height: 16, padding: '0 6px', borderRadius: 5, backgroundImage: 'var(--a-gloss-yellow)', border: '1px solid #a9741a', fontSize: 9, fontWeight: 900, color: '#4a3105' }}>
                        残り{stock}
                      </span>
                    )}
                    <div style={{ width: '100%', aspectRatio: '1', borderRadius: 8, background: 'linear-gradient(160deg,#7d94a8,#5f8f45)', opacity: 0.85 }} />
                    {/* ★個体ごとの違いを匂わせない（★同じ型の繰り返し） */}
                    <span style={{ fontSize: 11.5, fontWeight: 900, whiteSpace: 'nowrap' }}>{slot + 1} 頭目</span>
                  </div>
                );
              })}
            </div>
          </div>
          );
        })}
      </div>

      {/* ★引き直しの欲求を先回りして鎮める（★「もう一度探す」は置かない） */}
      <div style={{ margin: '14px 16px 0', padding: '11px 13px', borderRadius: 9, background: '#fff8ea', border: '2px solid #d9b25a' }}>
        <span style={{ fontSize: 11.5, fontWeight: 900, color: '#4a3105', lineHeight: 1.7 }}>
同じ値段の中でどの 1 頭を迎えても、得するものは変わりません。時間をおいても違う値段は出ません
        </span>
      </div>

      {/* ★迎える確認（★戻る額を必ず数字で出す） */}
      {picked !== null && price !== null && back !== null && (
        <div className="a-panel" style={{ margin: '16px 16px 0', borderWidth: 3 }}>
          <div className="a-band" style={{ height: 38, padding: '0 14px' }}>
            <span style={{ fontSize: 14, fontWeight: 900 }}>迎える確認</span>
          </div>
          <div style={{ padding: '14px 14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {/* ⚠️ ★**★を取りました**（D-114 ②） */}
              <span style={{ marginLeft: 'auto' }}>
                <span className="a-num" style={{ fontSize: 22, color: 'var(--a-num-money)' }}>{price.toLocaleString()}</span>
                <span style={{ fontSize: 11, fontWeight: 900, color: 'var(--a-ink-2)' }}> EP</span>
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '10px 12px', borderRadius: 8, background: '#ffeceb', border: '2px solid #a81a13' }}>
              <span style={{ fontSize: 12, fontWeight: 900, color: '#a81a13', lineHeight: 1.65 }}>
                この馬を手放すと戻るのは<span style={{ fontSize: 15 }}> {back.toLocaleString()} EP</span> です
              </span>
            </div>
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', minHeight: 48, borderRadius: 10, backgroundImage: 'var(--a-gloss-gold)', border: '2px solid #8a5a06', fontSize: 15, fontWeight: 900, color: '#4a3105' }}>
              この馬を迎える（{price.toLocaleString()} EP）
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
