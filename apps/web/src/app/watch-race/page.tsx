'use client';

/**
 * ★**中継の入口（`/watch-race`）**（★R-14・2026-09-17・オーナー判定 **B-1**・引き渡し資料 §4.2 A-3）
 *
 * 【★B-1 の形】
 *   ★「レースを見る」を押す → ★**案内 1 枚**（端末を横にしてください／このまま見る）
 *   → ★**全画面で中継** → ★**終了後は必ずダッシュボードへ戻す**。
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
 * ⚠️ ★**全画面 API は使いません。** ★`/race` 自身が全画面と 90° 回転を持っています（★A-3）。
 *    ★ここで二重に掛けると、★**回転が二重**になります。★この画面は「案内 → 送り出す」だけです。
 */

import { useEffect, useState } from 'react';
import { Backdrop, BigButton, TopBar, useMotionPaused } from '../../components/uma/uma-parts';

/** ★接続先（★B-2 の既定）。★変えるときは報告の §2 も直すこと */
const BROADCAST_HREF = '/race';

export default function WatchRacePage(): React.ReactElement {
  const [paused, toggle] = useMotionPaused();
  /** ★いま縦持ちか（★案内を出すかの判断だけに使う。★JS で回しません） */
  const [portrait, setPortrait] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia('(orientation: portrait)');
    const apply = (): void => { setPortrait(mq.matches); };
    apply();
    mq.addEventListener('change', apply);
    return () => { mq.removeEventListener('change', apply); };
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
      <TopBar title="レースを見る" paused={paused} onToggle={toggle} />

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
            中継は横向きの全画面で流れます。★<b>見なくても結果は残ります</b>。
            終わると<b>ダッシュボードに戻ります</b>。
          </p>
          {/* ★16:9 の枠を先に確保する（★映像を引き伸ばさない・資料 §4.4） */}
          <div aria-hidden style={{
            marginTop: 12, width: '100%', aspectRatio: '16 / 9', borderRadius: 8,
            border: '2px solid rgba(251,247,236,.28)', background: 'var(--u-navy-deep)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 12, fontWeight: 500, color: 'var(--u-ink-light-3)',
          }}>
            中継の画面がここに出ます
          </div>
        </div>
      </div>

      <div style={{
        position: 'relative', flex: '0 0 auto', display: 'flex', flexWrap: 'wrap', gap: 10,
        padding: '10px 14px var(--u-safe-bottom)', width: '100%', maxWidth: 1220, margin: '0 auto',
      }}>
        <BigButton tone="blue" label="このまま見る" sub="全画面で中継がはじまります" href={BROADCAST_HREF} grow="1.4 1 210px" />
        <BigButton tone="ivory" label="ダッシュボード" sub="いつでも戻れます" href="/home" grow="1 1 130px" />
      </div>
    </div>
  );
}
