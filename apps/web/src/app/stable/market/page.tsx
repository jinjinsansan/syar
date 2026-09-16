'use client';

/**
 * ★**馬を迎える**（★D12-5・2026-09-16・正典 **D-102**・デザイナーのカード `components/jockey-market`）
 *
 * 【★この画面が守ること】
 *   ★**出るのは★と値段だけ**（★素質の数値は出さない・§5.5）
 *   ★**値段は★だけで決まる**（★同じ★なら値段も同じ＝値段から中身を読めない）
 *   ★**引き直しを煽らない**（★「もう一度探す」を置かない・D-102 ③）
 *   ★**手放すと戻るのは払った額の一部だけ**（★数字で明示）
 *
 * ⚠️ ★帯・口数・値段・戻り額は ★**すべて `@star/scheduler` から引きます**（★画面に表を持たない・D-052）。
 * ⚠️ ★**「購入」ではなく「迎える」**（★金銭を想起させない語・依頼書の指定）。
 */

import { useState } from 'react';
import { LISTED_BANDS, LISTINGS_PER_BAND, priceOfStars, sellBackEP } from '@star/scheduler';
import { Stars } from '../../../components/ui';

export default function MarketPage(): React.ReactElement {
  const [picked, setPicked] = useState<{ readonly band: number; readonly slot: number } | null>(null);
  const price = picked === null ? null : priceOfStars(picked.band);
  const back = price === null ? null : sellBackEP(price);

  return (
    <div style={{ padding: '0 0 28px' }}>
      <div className="a-band" style={{ height: 52, padding: '0 16px' }}>
        <span style={{ fontSize: 18, fontWeight: 900, letterSpacing: '.06em' }}>馬を迎える</span>
      </div>

      <div style={{ padding: '12px 16px 0', fontSize: 11.5, fontWeight: 900, color: 'var(--a-ink-2)', lineHeight: 1.7 }}>
        ★{LISTED_BANDS[0]} 〜 ★{LISTED_BANDS[LISTED_BANDS.length - 1]} の {LISTED_BANDS.length} 帯・帯ごとに {LISTINGS_PER_BAND} 頭。
        <b style={{ color: 'var(--a-ink)' }}>値段は★だけで決まります</b>（同じ★なら中身も同じ確からしさです）。
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '14px 16px 0' }}>
        {LISTED_BANDS.map((band) => (
          <div key={band} style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '14px 14px 16px', borderRadius: 14, background: '#fff', border: '2px solid var(--a-edge)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Stars value={band} size={20} />
              <span>
                <span className="a-num" style={{ fontSize: 20, color: 'var(--a-num-money)' }}>{priceOfStars(band).toLocaleString()}</span>
                <span style={{ fontSize: 11, fontWeight: 900, color: 'var(--a-ink-2)' }}> EP</span>
              </span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {Array.from({ length: LISTINGS_PER_BAND }, (_, slot) => {
                const sel = picked !== null && picked.band === band && picked.slot === slot;
                return (
                  <div
                    key={slot}
                    onClick={() => { setPicked({ band, slot }); }}
                    style={{
                      flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, padding: '10px 6px', borderRadius: 10, cursor: 'pointer',
                      background: 'var(--a-panel-2)',
                      border: sel ? '2px solid #8a5a06' : '1.5px solid var(--a-line)',
                    }}
                  >
                    <div style={{ width: '100%', aspectRatio: '1', borderRadius: 8, background: 'linear-gradient(160deg,#7d94a8,#5f8f45)', opacity: 0.85 }} />
                    {/* ★個体ごとの違いを匂わせない（★同じ型の繰り返し） */}
                    <span style={{ fontSize: 11.5, fontWeight: 900, whiteSpace: 'nowrap' }}>{slot + 1} 頭目</span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* ★引き直しの欲求を先回りして鎮める（★「もう一度探す」は置かない） */}
      <div style={{ margin: '14px 16px 0', padding: '11px 13px', borderRadius: 9, background: '#fff8ea', border: '2px solid #d9b25a' }}>
        <span style={{ fontSize: 11.5, fontWeight: 900, color: '#4a3105', lineHeight: 1.7 }}>
          同じ★の中でどの 1 頭を迎えても、値段は変わりません。時間をおいても違う★は出ません
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
              <Stars value={picked.band} size={20} />
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
