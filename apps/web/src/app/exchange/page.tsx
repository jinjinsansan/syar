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

import { useState } from 'react';
import {
  Backdrop, BigButton, NoticeBar, TopBar, useMotionPaused,
} from '../../components/uma/uma-parts';

/** ★デモの賞金ポイント（★本番はサーバーの値） */
const PP_BALANCE = 380;

/**
 * ★景品 8 件（★資料 §8-5・★すべてゲーム内の品）。
 * ⚠️ ★**発送する品はありません**（★オーナー判定）。
 */
const ITEMS = [
  { id: 1, name: 'オリジナル壁紙', note: 'スマホ・PC 用', cost: 120, stock: null },
  { id: 2, name: '馬名の変更チケット', note: '1 頭ぶん', cost: 300, stock: null },
  { id: 3, name: '蹄鉄のアイコン', note: 'プロフィールに付く', cost: 250, stock: null },
  { id: 4, name: '厩舎の飾り（旗）', note: '牧場の画面に出る', cost: 450, stock: 12 },
  { id: 5, name: 'メンコ', note: '出走時の見た目', cost: 600, stock: null },
  { id: 6, name: '厩舎の背景（夕暮れ）', note: '牧場の画面に出る', cost: 800, stock: 5 },
  { id: 7, name: '限定カラーの勝負服', note: '出走時の見た目', cost: 900, stock: 3 },
  { id: 8, name: '称号「厩舎の常連」', note: 'プロフィールに付く', cost: 1500, stock: null },
] as const;

export default function ExchangePage(): React.ReactElement {
  const [paused, toggle] = useMotionPaused();
  const [picked, setPicked] = useState(1);
  const item = ITEMS.find((i) => i.id === picked)!;
  const enough = PP_BALANCE >= item.cost;

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
      <NoticeBar
        kind="soon"
        text="第12R 発走まで 3:20（芝1600m・12頭）"
        actionLabel="投票する"
        actionHref="/vote"
      />

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
              <span className="u-num" style={{ fontSize: 27, color: '#fff3cd' }}>{PP_BALANCE.toLocaleString('ja-JP')}</span>
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(148px,1fr))', gap: 10 }}>
          {ITEMS.map((it) => {
            const on = it.id === picked;
            const canAfford = PP_BALANCE >= it.cost;
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
                {/* ★景品の絵はまだ未作成（★資料 §11 の「新規に必要なアセット」3 件目） */}
                <span style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', height: 76, borderRadius: 6,
                  background: 'repeating-linear-gradient(135deg,#efe7cf 0 8px,#f8f3e4 8px 16px)',
                  border: '1px solid #cfd8e0', fontSize: 10, fontWeight: 700, color: 'var(--u-ink-dark-2)',
                }}>ゲーム内の品</span>
                <span style={{ display: 'block', marginTop: 6, fontSize: 14, color: 'var(--u-ink-dark)' }}>{it.name}</span>
                <span style={{ display: 'block', marginTop: 1, fontSize: 10, fontWeight: 700, color: 'var(--u-ink-dark-2)' }}>{it.note}</span>
                <span style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
                  <span className="u-num" style={{ fontSize: 21, color: 'var(--u-gold-ink)' }}>{it.cost.toLocaleString('ja-JP')}</span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--u-gold-ink)' }}>PP</span>
                  {/* ★在庫は色＋文字（★色だけで意味を運ばない） */}
                  <span style={{
                    padding: '1px 6px', borderRadius: 999, fontSize: 9, fontWeight: 700,
                    background: it.stock === null ? '#e4efe7' : '#f6e7cf',
                    color: it.stock === null ? 'var(--u-green-deep)' : '#8a5a06',
                  }}>{it.stock === null ? '在庫あり' : `のこり ${it.stock}`}</span>
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
          <div style={{ fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</div>
          <div style={{ marginTop: 2, fontSize: 11, fontWeight: 500, color: '#f7e6b5' }}>
            {item.cost.toLocaleString('ja-JP')} PP
          </div>
        </div>
        <BigButton
          tone={enough ? 'gold' : 'disabled'}
          label="この景品と交換する"
          sub={enough ? `${item.cost.toLocaleString('ja-JP')} PP を使います` : `あと ${(item.cost - PP_BALANCE).toLocaleString('ja-JP')} PP`}
          grow="1.4 1 210px"
        />
        <BigButton tone="ivory" label="交換の履歴" sub="受け取り済みの品" href="/records" grow="1 1 120px" />
      </div>
    </div>
  );
}
