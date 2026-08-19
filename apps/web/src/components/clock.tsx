'use client';

/**
 * ★表示用の時計（DOM 画面の「現在 15:37」「締切まで 2:24」）。
 *
 *   ⚠️ ここは**表示だけ**。レースの生成・確定・オッズ・締切の判定はサーバー（正典 §14.3・憲法 §0 サーバー権威）。
 *   憲法「`Date.now()` を直接呼ばない」は**シミュレーションの決定論**のためのもの。壁時計を見せる UI は
 *   ここ 1 か所に閉じ込め、他の場所からは呼ばない（テストは `now` を注入した純関数 `formatCountdown` を叩く）。
 */
import { useEffect, useState } from 'react';

/** 残り時間の表記（m:ss）。0 以下は "0:00" */
export function formatCountdown(untilMs: number, nowMs: number): string {
  const s = Math.max(0, Math.floor((untilMs - nowMs) / 1000));
  const m = Math.floor(s / 60), r = s % 60;
  return `${m}:${r < 10 ? '0' : ''}${r}`;
}

/** 発走までの状態（表示だけの分類。サーバーの status が優先） */
export function countdownPhase(untilMs: number, nowMs: number, closeBeforeMs: number): 'open' | 'soon' | 'live' {
  const left = untilMs - nowMs;
  if (left <= 0) return 'live';
  if (left <= closeBeforeMs) return 'soon';
  return 'open';
}

function useNow(tickMs: number): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    // ★表示用の壁時計はこの 1 か所だけ
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), tickMs);
    return () => clearInterval(id);
  }, [tickMs]);
  return now;
}

/** 現在時刻（HH:MM・日本時間） */
export function ClockNow(): React.ReactElement {
  const now = useNow(10_000);
  const text = now === null ? '--:--' : new Date(now).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo' });
  return <span className="num" style={{ fontSize: 16, color: 'var(--paper-70)' }}>現在 {text}</span>;
}

/** 締切までのカウントダウン（`untilIso` まで）。過ぎたら `after` を出す */
export function Countdown({ untilIso, after, size = 20, color = 'var(--bad)' }: {
  readonly untilIso: string; readonly after: string; readonly size?: number; readonly color?: string;
}): React.ReactElement {
  const now = useNow(1000);
  const until = Date.parse(untilIso);
  if (now === null) return <span className="num" style={{ fontSize: size, color }}>--:--</span>;
  if (until - now <= 0) return <span style={{ fontSize: 13, color: 'var(--paper-70)' }}>{after}</span>;
  return <span className="num" style={{ fontSize: size, color }}>{formatCountdown(until, now)}</span>;
}
