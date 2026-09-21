'use client';

/**
 * ★**中継の入口（`/watch-race`）**（★R-14・2026-09-17・オーナー判定 **B-1**・引き渡し資料 §4.2 A-3）
 *
 * 【★B-1 の形】
 *   ★「レースを見る」を押す → ★**案内 1 枚**（端末を横にしてください／演出デモを見る）
 *   → ★**全画面の演出デモ** → ★**終了後はダッシュボードへ戻す**。
 *   ★中継中は通知を出しません（★ゲージと仕掛けの合図を隠さない・C-6・V-16）。
 *
 * 【★B-2 の判断（★根拠は `REPORT_UMA_UI_20260917.md` §2）】
 *   ★接続先は ★**`/race`**（既定）。★理由:
 *     ① ★現ナビが「中継（デモ）」として繋いでいるのが `/race`
 *     ② ★`/race-next` は ★**作った側が「4 回壊した」と書いて分けた第 2 便**で、★本線ではない
 *     ③ ★`/watch` は ★**開発用**（★冒頭に「実際に動くところを見るための画面」と明記）
 *   ⚠️ ★**`race/page.tsx`（401 KiB）は 1 行も触りません**（★資料 §4.1）。
 *      ★ここがするのは ★**入口と出口のラッパーだけ**です。
 *
 * ⚠️ ★`/race` は実レースの ID を受け取らず、固定プールで走るデモです。
 *    実レースの開催情報は RaceStrip と詳細ページで表示します。
 * ⚠️ ★**全画面 API は使いません。** ★`/race` 自身が全画面と 90° 回転を持っています（★A-3）。
 *    ★ここで二重に掛けると、★**回転が二重**になります。★この画面は「案内 → 送り出す」だけです。
 */

import { useEffect, useState } from 'react';
import { Backdrop, BigButton, TopBar, useMotionPaused } from '../../components/uma/uma-parts';
import { RaceStrip } from '../../components/uma/race-strip';
import { authClient } from '../../lib/supabase';

/**
 * ★接続先（★B-2 の既定）。★変えるときは報告の §2 も直すこと。
 *
 * ★`?return=/home` は ★**出口の指定**です（★2026-09-17・B-1 の「★終了後は必ずダッシュボードへ」）。
 *   ★`/race` 側は ★**完全一致の名簿**でだけ受け取ります（★`race/page.tsx` の `RETURN_ROUTES`）。
 *   ⚠️ ★ここを変えたら ★**名簿にも足す**こと。★名簿に無い行き先は ★**黙って無視**され、
 *      ★これまでどおり `/race` の中のメニューへ戻ります（★出口が消えたように見えます）。
 */
const BROADCAST_HREF = '/race?return=/home';
const GUEST_BROADCAST_HREF = '/race?return=/watch-race';

export default function WatchRacePage(): React.ReactElement {
  const [paused, toggle] = useMotionPaused();
  /** ★いま縦持ちか（★案内を出すかの判断だけに使う。★JS で回しません） */
  const [portrait, setPortrait] = useState(true);
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(orientation: portrait)');
    const apply = (): void => { setPortrait(mq.matches); };
    apply();
    mq.addEventListener('change', apply);
    return () => { mq.removeEventListener('change', apply); };
  }, []);
  useEffect(() => {
    let active = true;
    void authClient().auth.getSession().then(({ data }) => {
      if (active) setSignedIn(data.session !== null);
    }).catch(() => { if (active) setSignedIn(false); });
    return () => { active = false; };
  }, []);

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
      <TopBar title="レースを見る" backHref={signedIn ? '/home' : '/'} paused={paused} onToggle={toggle} />
      <RaceStrip />

      <div style={{
        position: 'relative', flex: '1 1 auto', minHeight: 0, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 14,
        padding: '10px 14px 0', width: '100%', maxWidth: 1220, margin: '0 auto',
      }}>
        {/* ★案内 1 枚（★B-1）。★「このまま見る」も必ず出す（★横にできない人を締め出さない） */}
        <div style={{
          width: '100%', maxWidth: 560, padding: 16, borderRadius: 12,
          border: '2px solid var(--u-gold)', background: 'var(--u-panel-strong)',
        }}>
          <div style={{ fontSize: 16 }}>
            {portrait ? '端末を横にすると大きく見られます' : '横向きになっています'}
          </div>
          <p style={{ margin: '8px 0 0', fontSize: 12, fontWeight: 500, lineHeight: 1.7, color: 'var(--u-ink-light-3)' }}>
            上の帯は実際の開催情報です。全画面の映像は現在、演出確認用のデモです。
            実レースの着順は開催情報の「詳細」から確認できます。
          </p>
          {/* ★本編の入口でも使う既存の絵。映像は次の画面で自動再生する。 */}
          <div style={{
            position: 'relative', marginTop: 12, width: '100%', aspectRatio: '16 / 9', borderRadius: 8,
            border: '2px solid rgba(251,247,236,.28)', background: 'var(--u-navy-deep)', overflow: 'hidden',
          }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/lp/hero.jpg" alt="" style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' }} />
            <span style={{ position: 'absolute', left: 10, bottom: 10, padding: '5px 9px', borderRadius: 6, background: 'var(--u-panel-strong)', fontSize: 12 }}>
              レース演出 · デモ
            </span>
          </div>
        </div>
      </div>

      <div style={{
        position: 'relative', flex: '0 0 auto', display: 'flex', flexWrap: 'wrap', gap: 10,
        padding: '10px 14px var(--u-safe-bottom)', width: '100%', maxWidth: 1220, margin: '0 auto',
      }}>
        <BigButton tone="blue" label="レース演出を観る" sub="ログイン不要・映像はデモ" href={signedIn ? BROADCAST_HREF : GUEST_BROADCAST_HREF} grow="1.4 1 210px" />
        <BigButton tone="ivory" label={signedIn ? 'ダッシュボード' : 'トップへ戻る'} sub="いつでも戻れます" href={signedIn ? '/home' : '/'} grow="1 1 130px" />
      </div>
    </div>
  );
}
