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
import { RaceStrip, requestStripExpand, useStripState } from '../../components/uma/race-strip';
import { authClient } from '../../lib/supabase';
import { watchExitOf } from '../../lib/watch-exit';

/**
 * ★**出口は ★状態で分けます**（★2026-09-27・裁定 §6-1 の (c)・`lib/watch-exit.ts`）。
 *   ★未ログイン → ★デモの中継（★「デモ」と明示）／★ログイン済みで録画の窓 → ★その実レースを帯の拡大で
 *   ／★窓の外 → ★「いま走っていません」＋次の発走（★デモに送らない）。
 * ★デモの戻り先 `?return=/watch-race` は ★`/race` の ★完全一致の名簿（`RETURN_ROUTES`）に在ります（★網が見る）。
 */
function clockOf(iso: string | null): string | null {
  if (iso === null) return null;
  const ms = new Date(iso).getTime();
  return Number.isFinite(ms)
    ? new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit' }).format(ms) : null;
}

export default function WatchRacePage(): React.ReactElement {
  const [paused, toggle] = useMotionPaused();
  const strip = useStripState();
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

  const exit = watchExitOf(signedIn, strip.replaying, strip.nextAt);
  const nextClock = exit.kind === 'idle' ? clockOf(exit.nextAt) : null;

  return (
    <div
      data-theme="uma" data-page-body
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
            {exit.kind === 'demo'
              ? '上の帯は実際の開催情報です。下の映像は演出確認用のデモです。実レースの着順は開催情報の「詳細」から確認できます。'
              : exit.kind === 'expand'
                ? 'いまレース中です（確定した結果からの録画）。下のボタンか、端末を横にすると大きく見られます。'
                : `いま走っているレースはありません。${nextClock === null ? '' : `次の発走は ${nextClock} です。`}${strip.lastResult === null ? '' : `直前のレース: ${strip.lastResult}。`}レース中は上の帯に走行が出ます。`}
          </p>
          {/* ★本編の入口でも使う既存の絵。★デモへ送るときだけ出す（★「デモ」と明示） */}
          {exit.kind === 'demo' && <div style={{
            position: 'relative', marginTop: 12, width: '100%', aspectRatio: '16 / 9', borderRadius: 8,
            border: '2px solid rgba(251,247,236,.28)', background: 'var(--u-navy-deep)', overflow: 'hidden',
          }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/lp/hero.jpg" alt="" style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' }} />
            <span style={{ position: 'absolute', left: 10, bottom: 10, padding: '5px 9px', borderRadius: 6, background: 'var(--u-panel-strong)', fontSize: 12 }}>
              レース演出 · デモ
            </span>
          </div>}
        </div>
      </div>

      <div style={{
        position: 'relative', flex: '0 0 auto', display: 'flex', flexWrap: 'wrap', gap: 10,
        padding: '10px 14px var(--u-safe-bottom)', width: '100%', maxWidth: 1220, margin: '0 auto',
      }}>
        {exit.kind === 'demo' && <BigButton tone="blue" label="レース演出を観る" sub="ログイン不要・映像はデモ" href={exit.href} grow="1.4 1 210px" />}
        {exit.kind === 'expand' && <BigButton tone="blue" label="いま走っているレースを見る" sub="録画・結果から再現" onClick={requestStripExpand} grow="1.4 1 210px" />}
        <BigButton tone="ivory" label={signedIn ? 'ダッシュボード' : 'トップへ戻る'} sub="いつでも戻れます" href={signedIn ? '/home' : '/'} grow="1 1 130px" />
      </div>
    </div>
  );
}
