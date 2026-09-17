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
  Backdrop, BigButton, NoticeBar, TopBar, useMotionPaused,
} from '../../components/uma/uma-parts';

/** ★受け取り方（★資料 §8-7 の 4 つ。★どれも利用者がお金を払わない形） */
const WAYS = [
  { icon: '▶', title: '動画を見る', note: '30 秒の動画を最後まで見ると受け取れます', gain: '+10', left: '今日あと 3 回', done: false },
  { icon: '☑', title: 'アンケートに答える', note: '3〜5 問。答えた時点で受け取れます', gain: '+30', left: '今日あと 1 回', done: false },
  { icon: '★', title: 'オファーを試す', note: '提供元のアプリやサービスを試すと受け取れます', gain: '+50〜', left: '件数は日替わり', done: false },
  { icon: '◎', title: '毎日のログイン', note: '1 日 1 回・7 日続くとおまけが付きます', gain: '+5', left: '今日は受け取り済み', done: true },
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
      <NoticeBar
        kind="soon"
        text="第12R 発走まで 3:20。受け取った参加ポイントはすぐ投票に使えます。"
        actionLabel="投票する"
        actionHref="/vote"
      />

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
              <span className="u-num" style={{ fontSize: 25, color: 'var(--u-ep-num)' }}>1,240</span>
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
                  backgroundImage: w.done ? 'linear-gradient(#e4e8ec,#d3dae1)' : 'var(--u-gold-plate)',
                  backgroundSize: '240% 100%', animation: w.done ? undefined : 'u-sheen 6s linear infinite',
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
                <span style={{ flex: '0 0 auto', textAlign: 'right' }}>
                  <span style={{ display: 'flex', alignItems: 'baseline', gap: 3, justifyContent: 'flex-end' }}>
                    <span className="u-num" style={{ fontSize: 21, color: 'var(--u-green-deep)' }}>{w.gain}</span>
                    <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--u-green-deep)' }}>EP</span>
                  </span>
                  <span style={{
                    display: 'inline-block', marginTop: 3, padding: '1px 6px', borderRadius: 999, fontSize: 10, fontWeight: 700,
                    background: w.done ? '#e7e9ec' : '#e4efe7', color: w.done ? 'var(--u-ink-dark-2)' : 'var(--u-green-deep)',
                  }}>{w.left}</span>
                </span>
              </div>
              {/* ★接続先が未定なので、押しても何も起きません（★`button` で口だけ用意） */}
              <button
                type="button"
                disabled={w.done}
                title="提供元が決まるまで押せません"
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', minHeight: 44,
                  marginTop: 8, borderRadius: 8, border: w.done ? '2px solid #c3ccd4' : '2px solid var(--u-navy)',
                  backgroundImage: w.done ? 'linear-gradient(#e7e9ec,#dfe3e8)' : 'linear-gradient(#5fa9ee 0%,#1a6fd4 46%,#0f56ab 100%)',
                  color: w.done ? 'var(--u-ink-dark-2)' : '#fff', fontSize: 14,
                  pointerEvents: w.done ? 'none' : undefined,
                }}
              >
                {w.done ? 'また明日' : 'はじめる'}
              </button>
            </div>
          ))}
        </div>
      </div>

      <div style={{
        position: 'relative', flex: '0 0 auto', display: 'flex', flexWrap: 'wrap', gap: 10,
        padding: '10px 14px var(--u-safe-bottom)', width: '100%', maxWidth: 1220, margin: '0 auto',
      }}>
        <BigButton tone="green" label="動画を見て +10 EP" sub="30 秒 ／ 今日はあと 3 回" grow="1.4 1 210px" />
        <BigButton tone="ivory" label="ダッシュボード" sub="いつでも戻れます" href="/home" grow="1 1 130px" />
      </div>
    </div>
  );
}
