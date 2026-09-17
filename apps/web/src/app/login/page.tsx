'use client';

/**
 * ★ログイン（★準備中）— 馬物語テーマ
 *
 * 【★なぜ「準備中」のままか】
 *   D-113（開発期間中はメール＋パスワード）は決まったが、**実装は裁定 §6 の手順 6**。
 *   ★**手順 5（V-19 の書き換え）が先**なので、**入力欄をまだ作らない**。
 *   ★裁定 §0「見た目だけ当座で合わせてよい（中身は準備中のまま・入力欄を作らない）」。
 *
 * 【★この画面が旧テーマのまま本番に出ていた】
 *   2026-09-18、オーナー指摘。`/design-check` の一覧に無かったため一度も見られていなかった
 *   （同便で一覧に追加した）。詳しくは `/signup` の註記。
 */

import {
  Backdrop, BigButton, NoticeBar, TopBar, useMotionPaused,
} from '../../components/uma/uma-parts';

export default function LoginPage(): React.ReactElement {
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
      <TopBar title="ログイン" backHref="/" paused={paused} onToggle={toggle} />
      <NoticeBar
        kind="soon"
        text="いまは登録なしで、ぜんぶ見られます。"
        sub="ログインの受付はもう少しお待ちください"
        actionLabel="中継を観る"
        actionHref="/watch-race"
      />

      <div style={{
        position: 'relative', flex: '1 1 auto', minHeight: 0, overflow: 'auto',
        padding: '12px 14px 18px', width: '100%', maxWidth: 1220, margin: '0 auto',
        display: 'flex', flexDirection: 'column', gap: 12,
      }}>
        <div style={{
          flex: '0 0 auto', borderRadius: 14, padding: '16px 18px',
          background: 'rgba(8,18,8,.55)', border: '2px solid var(--u-edge)',
          color: 'var(--u-ink)', fontSize: 15, fontWeight: 800, lineHeight: 1.9,
        }}>
          ログインは、いま準備しています。<br />
          それまでは <b>番組表・中継・オッズ・記録を、登録なしでご覧いただけます</b>。
        </div>

        <div style={{ flex: '0 0 auto', display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 2 }}>
          <BigButton tone="gold" label="中継を観る" sub="登録なしで見られます" href="/watch-race" grow="1.2" />
          <BigButton tone="ivory" label="ダッシュボードへ" href="/home" />
          <BigButton tone="ivory" label="トップへ戻る" href="/" />
        </div>
      </div>
    </div>
  );
}
