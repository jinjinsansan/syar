'use client';

/**
 * ★**使い方（`/howto`）— はじめての方へ**（★R-14・2026-09-17・引き渡し資料 §8-8）
 *
 * 【★この画面が伝えること】
 *   ★4 ステップ（育てる → 投票する → 見る → 交換する）と、★**2 種類のポイント**。
 *
 * 【★守っていること】
 *   ★**「自分の馬が出るレースには投票できません」**を ★**理由ごと**書く（★正典 §9.5）
 *   ★**PP は現金・暗号資産に換えられない**と明記（★資料 §2-5）
 *   ★EP は ★**無償でのみ受け取れる**（★憲法 §0.2）
 *   ★**EP と PP を合算した数字を出さない**（★「2 つは別のポイントです」と画面で言う）
 *
 * ⚠️ ★カードには **`flex:0 0 auto`** を付けます（★縦 flex の中で潰れて文字が切れるため・資料 §8-8）。
 */

import {
  Backdrop, BigButton, NoticeBar, TopBar, useMotionPaused,
} from '../../components/uma/uma-parts';

/** ★4 ステップ（★資料 §8-8 の本文をそのまま） */
const STEPS = [
  {
    n: 1, title: '馬を育てる',
    body: '育成モードで週に 1 回、調教のメニューを選びます。強くするだけでなく、体力と調子を見ながら休ませるのも大事です。',
  },
  {
    n: 2, title: 'レースに投票する',
    body: '出馬表から馬を選んでマークシートに印を付けます。使うのは参加ポイントだけ。自分の馬が出るレースには投票できません。',
  },
  {
    n: 3, title: 'レースを見る',
    body: '数分おきに開催されています。自分の馬が走るときは、勝負所で仕掛けの合図が出ます。見なくても結果は残ります。',
  },
  {
    n: 4, title: '景品と交換する',
    body: 'レースの結果でたまった賞金ポイントは、景品交換でゲーム内の品と交換できます。',
  },
] as const;

export default function HowToPage(): React.ReactElement {
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
      <TopBar title="使い方" paused={paused} onToggle={toggle} />
      <NoticeBar
        kind="soon"
        text="レースは数分おきに開催されています。読みながら参加して大丈夫です。"
        actionLabel="レースを見る"
        actionHref="/watch-race"
      />

      <div style={{
        position: 'relative', flex: '1 1 auto', minHeight: 0, overflow: 'auto',
        padding: '10px 14px 0', width: '100%', maxWidth: 1220, margin: '0 auto',
        display: 'flex', flexDirection: 'column', gap: 10,
      }}>
        {/* ★4 ステップ（★390 は 1 列／1280 は 4 列） */}
        <div style={{ flex: '0 0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(270px,1fr))', gap: 10 }}>
          {STEPS.map((s) => (
            <div key={s.n} style={{
              flex: '0 0 auto', padding: 10, borderRadius: 12, background: 'var(--u-paper)',
              border: '3px solid rgba(251,247,236,.22)', boxShadow: 'var(--u-shadow-card)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="u-num" style={{
                  flex: '0 0 auto', width: 34, height: 34, borderRadius: 8, border: '2px solid var(--u-ink-dark)',
                  backgroundImage: 'linear-gradient(#ffe483,#f6c21c)', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', fontSize: 20, color: 'var(--u-ink-dark)',
                }}>{s.n}</span>
                <span style={{ fontSize: 16, color: 'var(--u-ink-dark)' }}>{s.title}</span>
              </div>
              <p style={{ margin: '6px 0 0', fontSize: 12, fontWeight: 500, lineHeight: 1.7, color: 'var(--u-ink-dark-3)' }}>
                {s.body}
              </p>
            </div>
          ))}
        </div>

        {/* ★2 種類のポイント（★合算しない・現金に換えられないことを明記） */}
        <div style={{
          flex: '0 0 auto', border: '2px solid var(--u-gold)', borderRadius: 12,
          background: 'rgba(251,247,236,.96)', overflow: 'hidden',
        }}>
          <div style={{ padding: '7px 10px', background: 'var(--u-navy)', borderBottom: '3px solid var(--u-gold)', fontSize: 14 }}>
            2 種類のポイント（ここだけ覚えてください）
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 200px', minWidth: 0, padding: 10, borderRight: '1px solid var(--u-rule)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ flex: '0 0 auto', width: 11, height: 11, borderRadius: '50%', border: '3px solid var(--u-green-deep)' }} />
                <span style={{ fontSize: 14, color: 'var(--u-ink-dark)' }}>参加ポイント（EP）</span>
              </div>
              <p style={{ margin: '5px 0 0', fontSize: 12, fontWeight: 500, lineHeight: 1.7, color: 'var(--u-ink-dark-3)' }}>
                投票・出走登録などゲーム内のやりとり全部に使います。<b>無償でのみ受け取れます</b>（動画・アンケート・オファー・毎日のログイン）。
              </p>
            </div>
            <div style={{ flex: '1 1 200px', minWidth: 0, padding: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ flex: '0 0 auto', width: 11, height: 11, border: '3px solid var(--u-gold-ink)', transform: 'rotate(45deg)' }} />
                <span style={{ fontSize: 14, color: 'var(--u-ink-dark)' }}>賞金ポイント（PP）</span>
              </div>
              <p style={{ margin: '5px 0 0', fontSize: 12, fontWeight: 500, lineHeight: 1.7, color: 'var(--u-ink-dark-3)' }}>
                レースの結果で増えます。景品交換だけに使えます。<b>現金や暗号資産には換えられません</b>。
              </p>
            </div>
          </div>
          <div style={{ padding: '6px 10px', background: 'var(--u-paper-2)', fontSize: 11, fontWeight: 500, color: 'var(--u-ink-dark-2)' }}>
            2 つは別のポイントです。合計や差し引きの表示は画面に出しません。
          </div>
        </div>
      </div>

      <div style={{
        position: 'relative', flex: '0 0 auto', display: 'flex', flexWrap: 'wrap', gap: 10,
        padding: '10px 14px var(--u-safe-bottom)', width: '100%', maxWidth: 1220, margin: '0 auto',
      }}>
        <BigButton tone="gold" label="育成モードへ" sub="まずは 1 回、調教してみる" href="/training" grow="1.4 1 210px" />
        <BigButton tone="ivory" label="ダッシュボード" sub="いつでも戻れます" href="/home" grow="1 1 130px" />
      </div>
    </div>
  );
}
