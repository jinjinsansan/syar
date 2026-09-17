'use client';

/**
 * ★アカウント作成（★準備中）— 馬物語テーマ
 *
 * 【★なぜ「準備中」のままか】
 *   認証は D-113（開発期間中はメール＋パスワード）で決まったが、**実装は裁定 §6 の手順 5〜6**。
 *   ★**手順 5（V-19 の書き換え）が先**で、それまで**入力欄を作らない**
 *   （測れないものを効かせない・D-112 ③ と同じ形）。
 *   ★裁定 §0 は「見た目だけ当座で合わせてよい（中身は準備中のまま・入力欄を作らない）」と明記。
 *
 * 【★この画面が旧テーマのまま本番に出ていた】
 *   2026-09-18、オーナー指摘「はじめる ログインを押すと旧デザインが出ますよ？」。
 *   ⚠️ ★**`/design-check` の一覧に `/signup` と `/login` が入っていなかった**ため、
 *      100 点診断も開発側の目も一度も踏んでいなかった。
 *      ★**利用者が TOP から最初に押す 2 か所**を、確認の対象から外していた（同便で一覧に追加）。
 *
 * 【★守っていること】
 *   ⚠️ **参加ポイントを買う・増やす導線をここから絶対に生やさない**（憲法 §0.2）
 *   ★**開発期間中の登録は招待制／許可リストに限る**（D-113 ⑦）ので、その旨を画面に出す
 */

import {
  Backdrop, BigButton, NoticeBar, TopBar, useMotionPaused,
} from '../../components/uma/uma-parts';

/** ★登録後の流れ（★画面で計算しない・文言だけ） */
const STEPS: readonly { readonly n: string; readonly label: string }[] = [
  { n: '1', label: '牧場の名前を決める' },
  { n: '2', label: '最初の馬を迎える' },
  { n: '3', label: '調教を指示する' },
  { n: '4', label: 'レースに登録する' },
  { n: '5', label: '中継を観る' },
];

export default function SignupPage(): React.ReactElement {
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
      <TopBar title="はじめる" backHref="/" paused={paused} onToggle={toggle} />
      <NoticeBar
        kind="soon"
        text="いまは登録なしで、ぜんぶ見られます。"
        sub="登録の受付はもう少しお待ちください"
        actionLabel="中継を観る"
        actionHref="/watch-race"
      />

      <div style={{
        position: 'relative', flex: '1 1 auto', minHeight: 0, overflow: 'auto',
        padding: '12px 14px 18px', width: '100%', maxWidth: 1220, margin: '0 auto',
        display: 'flex', flexDirection: 'column', gap: 12,
      }}>
        {/* ★準備中の説明（★flex:0 0 auto を付けないと縦 flex で潰れて文字が切れる） */}
        <div style={{
          flex: '0 0 auto', borderRadius: 14, padding: '16px 18px',
          background: 'rgba(8,18,8,.55)', border: '2px solid var(--u-edge)',
          color: 'var(--u-ink)', fontSize: 15, fontWeight: 800, lineHeight: 1.9,
        }}>
          アカウントの登録は、いま準備しています。<br />
          それまでは <b>番組表・中継・オッズ・記録を、登録なしでご覧いただけます</b>。
          <div style={{ marginTop: 10, fontSize: 13, fontWeight: 900, color: 'var(--u-gold)' }}>
            ★はじめの間は、お誘いした方だけがご登録いただけます。
          </div>
          <div style={{ marginTop: 6, fontSize: 13, fontWeight: 800, opacity: .9 }}>
            参加ポイントを販売することはありません。
          </div>
        </div>

        {/* ★登録後の流れ（★390 は 1 列／1280 は 5 列） */}
        <div style={{ flex: '0 0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 10 }}>
          {STEPS.map((s) => (
            <div key={s.n} style={{
              flex: '0 0 auto', borderRadius: 12, padding: '12px 14px',
              background: 'rgba(8,18,8,.5)', border: '2px solid var(--u-edge)',
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <span style={{
                flex: '0 0 auto', width: 30, height: 30, borderRadius: '50%',
                background: 'var(--u-gold)', color: '#1a2410',
                display: 'grid', placeItems: 'center', fontSize: 15, fontWeight: 900,
              }}>{s.n}</span>
              <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--u-ink)' }}>{s.label}</span>
            </div>
          ))}
        </div>

        <div style={{ flex: '0 0 auto', display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 2 }}>
          <BigButton tone="gold" label="中継を観る" sub="登録なしで見られます" href="/watch-race" grow="1.2" />
          <BigButton tone="ivory" label="ダッシュボードへ" href="/home" />
        </div>
      </div>
    </div>
  );
}
