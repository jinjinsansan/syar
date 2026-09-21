'use client';

/**
 * ★**ポイントを稼ぐ（`/earn`）**（★R-14・2026-09-17・引き渡し資料 §8-7）
 *
 * 【★この画面が守ること】（★憲法 §0.2・正典 §17.1 L-8）
 *   ★**受け取れるのは参加ポイントだけ**。★**賞金ポイントは稼げません**（レースの結果だけで増えます）
 *   ★**現金が手に入ると読める見せ方をしない** — ★獲得は**広告視聴・アンケート・オファー・ログイン**のみ
 *   ★**「購入」「チャージ」「換金」「課金」を書かない**
 *
 * ⚠️ ★**接続先（広告 SDK・オファー壁）は未定**です（★資料 §8-7）。
 *    ★画面だけ先に置き、★提供元が決まってから繋ぎます。★いまのボタンは押しても何も起きません。
 */

import {
  Backdrop, BigButton, TopBar, useMotionPaused,
} from '../../components/uma/uma-parts';
import { RaceStrip } from '../../components/uma/race-strip';

/** ★受け取り方（★資料 §8-7 の 4 つ。★どれも利用者がお金を払わない形） */
const WAYS = [
  { icon: '▶', title: '動画を見る', note: '提供元の接続を準備中です' },
  { icon: '☑', title: 'アンケートに答える', note: '提供元の接続を準備中です' },
  { icon: '★', title: 'オファーを試す', note: '提供元の接続を準備中です' },
  { icon: '◎', title: '毎日のログイン', note: '受け取り機能を準備中です' },
] as const;

export default function EarnPage(): React.ReactElement {
  const [paused, toggle] = useMotionPaused();
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
      <TopBar title="ポイントを稼ぐ" paused={paused} onToggle={toggle} />
      <RaceStrip />
      <div role="status" style={{ position: 'relative', padding: '6px 14px', color: 'var(--u-gold)', fontSize: 12 }}>
        参加ポイントの受け取り機能は準備中です。ここには確定した報酬額を表示していません。
      </div>

      {/* ★EP のカプセル＋常設の注記（★PP は稼げないと明言） */}
      <div style={{
        position: 'relative', flex: '0 0 auto', display: 'flex', flexWrap: 'wrap', gap: 8,
        padding: '10px 14px 0', width: '100%', maxWidth: 1220, margin: '0 auto',
      }}>
        <div style={{
          flex: '1 1 220px', minWidth: 0, maxWidth: 430, padding: '7px 12px',
          border: '2px solid var(--u-ep)', borderRadius: 12, background: 'rgba(8,26,22,.82)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ flex: '0 0 auto', width: 11, height: 11, borderRadius: '50%', border: '3px solid var(--u-ep)' }} />
            <span style={{ fontSize: 11, letterSpacing: '.08em', color: 'var(--u-ep-ink)', whiteSpace: 'nowrap' }}>参加ポイント</span>
            <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'baseline', gap: 5 }}>
              <span className="u-num" style={{ fontSize: 18, color: 'var(--u-ep-num)' }}>残高はダッシュボードで確認</span>
              <span style={{ fontSize: 11, color: 'var(--u-ep-ink)' }}>EP</span>
            </span>
          </div>
          <div style={{ marginTop: 2, fontSize: 10, fontWeight: 500, color: '#a9d8cb' }}>
            ゲーム内で使う（無償でのみ受け取れます）
          </div>
        </div>
        <div style={{
          flex: '1 1 220px', minWidth: 0, maxWidth: 430, padding: '7px 12px',
          border: '2px solid rgba(251,247,236,.28)', borderRadius: 12, background: 'var(--u-panel)',
          fontSize: 11, fontWeight: 500, lineHeight: 1.55, color: '#e6edf3',
        }}>
          ここで受け取れるのは<b>参加ポイントだけ</b>です。<b>賞金ポイントは稼げません</b>（レースの結果だけで増えます）。
        </div>
      </div>

      {/* ★受け取り方 4 つ（★390 は 1 列／1280 は 4 列） */}
      <div style={{
        position: 'relative', flex: '1 1 auto', minHeight: 0, overflow: 'auto',
        padding: '10px 14px 0', width: '100%', maxWidth: 1220, margin: '0 auto',
      }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(290px,1fr))', gap: 10 }}>
          {WAYS.map((w) => (
            <div key={w.title} style={{
              flex: '0 0 auto', padding: 10, borderRadius: 12, background: 'var(--u-paper)',
              border: '3px solid rgba(251,247,236,.22)', boxShadow: 'var(--u-shadow-card)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{
                  flex: '0 0 auto', width: 38, height: 38, borderRadius: 8,
                  border: '2px solid var(--u-ink-dark)',
                  backgroundImage: 'linear-gradient(#e4e8ec,#d3dae1)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 17, color: 'var(--u-ink-dark)',
                }}>{w.icon}</span>
                <span style={{ flex: '1 1 auto', minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 15, color: 'var(--u-ink-dark)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {w.title}
                  </span>
                  <span style={{ display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--u-ink-dark-2)', lineHeight: 1.5 }}>
                    {w.note}
                  </span>
                </span>
                <span style={{ fontSize: 11, color: 'var(--u-ink-dark-2)' }}>準備中</span>
              </div>
              {/* ★接続先が未定なので、押しても何も起きません（★`button` で口だけ用意） */}
              <button
                type="button"
                disabled
                title="提供元が決まるまで利用できません"
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', minHeight: 44,
                  marginTop: 8, borderRadius: 8, border: '2px solid #c3ccd4',
                  backgroundImage: 'linear-gradient(#e7e9ec,#dfe3e8)',
                  color: 'var(--u-ink-dark-2)', fontSize: 14,
                }}
              >
                利用準備中
              </button>
            </div>
          ))}
        </div>
      </div>

      <div style={{
        position: 'relative', flex: '0 0 auto', display: 'flex', flexWrap: 'wrap', gap: 10,
        padding: '10px 14px var(--u-safe-bottom)', width: '100%', maxWidth: 1220, margin: '0 auto',
      }}>
        <BigButton tone="disabled" label="受け取り機能は準備中" sub="提供元が決まるまで利用できません" grow="1.4 1 210px" />
        <BigButton tone="ivory" label="ダッシュボード" sub="いつでも戻れます" href="/home" grow="1 1 130px" />
      </div>
    </div>
  );
}
