'use client';

import { useEffect, useState } from 'react';
import { readClient } from '../../lib/supabase';
import { parseReplayRunners, replayDisplayProgress, replayProgress, type ReplayRunner } from './race-replay';
import './uma-theme.css';

interface RaceNoticeRow {
  readonly id: string;
  readonly name: string;
  readonly surface: string;
  readonly distance: number;
  readonly scheduled_at: string;
  readonly status: string;
}

interface NoticeData {
  readonly next: RaceNoticeRow | null;
  readonly recent: RaceNoticeRow | null;
  readonly runners: readonly ReplayRunner[];
}

const COLUMNS = 'id, name, surface, distance, scheduled_at, status';
const REFRESH_MS = 15_000;

async function fetchNotice(): Promise<NoticeData> {
  const client = readClient();
  const [next, recent] = await Promise.all([
    client.from('races_public').select(COLUMNS)
      .in('status', ['announced', 'scheduled', 'closed'])
      .order('scheduled_at', { ascending: true }).limit(1),
    client.from('races_public').select(COLUMNS)
      .eq('status', 'settled')
      .order('scheduled_at', { ascending: false }).limit(1),
  ]);
  if (next.error !== null) throw new Error(next.error.message);
  if (recent.error !== null) throw new Error(recent.error.message);
  const lastRace = (recent.data?.[0] ?? null) as RaceNoticeRow | null;
  let runners: readonly ReplayRunner[] = [];
  if (lastRace !== null) {
    const entries = await client.from('race_entries_public')
      .select('gate,horse_name,strategy,finish_pos,finish_time')
      .eq('race_id', lastRace.id).order('gate');
    if (entries.error !== null) throw new Error(entries.error.message);
    runners = parseReplayRunners(((entries.data ?? []) as Record<string, unknown>[])
      .filter((row) => row['finish_pos'] !== null && row['finish_pos'] !== undefined));
  }
  return {
    next: (next.data?.[0] ?? null) as RaceNoticeRow | null,
    recent: lastRace,
    runners,
  };
}

function clock(iso: string): string {
  const timestamp = new Date(iso).getTime();
  if (!Number.isFinite(timestamp)) return '時刻未取得';
  return new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit' }).format(timestamp);
}

function raceLabel(row: RaceNoticeRow): string {
  const surface = row.surface === 'turf' ? '芝' : row.surface === 'dirt' ? 'ダート' : row.surface;
  return `${row.name}・${surface}${row.distance}m`;
}

/** 公開 DB の開催情報だけを表示する。走行位置が公開されるまで走行映像は描かない。 */
export function RaceStrip({ compact = false }: { readonly compact?: boolean }): React.ReactElement {
  const [data, setData] = useState<NoticeData | null>(null);
  const [error, setError] = useState(false);
  const [nowMs, setNowMs] = useState<number | null>(null);
  const [motionReduced, setMotionReduced] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = (): void => { setMotionReduced(media.matches); };
    apply();
    media.addEventListener('change', apply);
    return () => { media.removeEventListener('change', apply); };
  }, []);

  useEffect(() => {
    if (!expanded) return;
    const onKey = (event: KeyboardEvent): void => { if (event.key === 'Escape') setExpanded(false); };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); };
  }, [expanded]);

  useEffect(() => {
    let active = true;
    let loading = false;
    const refresh = (): void => {
      if (loading) return;
      loading = true;
      void fetchNotice().then((fresh) => {
        if (!active) return;
        setData(fresh);
        setError(false);
      }).catch(() => {
        if (active) setError(true);
      }).finally(() => {
        loading = false;
      });
    };
    const onVisible = (): void => { if (document.visibilityState === 'visible') refresh(); };
    refresh();
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, REFRESH_MS);
    const clockTimer = window.setInterval(() => {
      if (document.visibilityState === 'visible') setNowMs(new Date().getTime());
    }, 250);
    setNowMs(new Date().getTime());
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.clearInterval(clockTimer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  const next = data?.next;
  const recent = data?.recent;
  const progress = recent && nowMs !== null && data?.runners.length
    ? replayDisplayProgress(recent.scheduled_at, nowMs) : null;
  const replaying = progress !== null;
  useEffect(() => {
    if (!replaying) setExpanded(false);
  }, [replaying]);
  const replayRows = replaying && recent && data ? data.runners.map((runner) => {
    const raceSec = (motionReduced ? 1 : progress) * Math.max(...data.runners.map((r) => r.finishSec));
    return { runner, position: replayProgress(runner, recent.distance, raceSec) };
  }) : [];
  const status = next?.status === 'announced' ? '出走登録受付中'
    : next?.status === 'scheduled' ? '開催予定'
      : next?.status === 'closed' ? '受付終了・結果待ち'
        : data === null ? '開催情報を読み込み中' : '現在、開催予定のレースはありません';

  return (
    <section aria-label="レースの開催情報" className={`u-race-strip${compact ? ' u-race-strip-compact' : ''}${replaying ? ' u-race-strip-replaying' : ''}${expanded ? ' u-race-strip-expanded' : ''}`}>
      <div className="u-race-strip-main">
        {replaying && recent && data ? <>
          <strong>レース録画 · 結果から再現</strong>
          <span title={raceLabel(recent)}>{raceLabel(recent)}</span>
          <ReplayLanes raceName={recent.name} rows={replayRows} />
        </> : <>
          <strong>{next ? `${clock(next.scheduled_at)} ${status}` : status}</strong>
          {next && <span title={raceLabel(next)}>{raceLabel(next)}</span>}
          {recent && !compact && <span className="u-race-strip-recent">直近確定: {raceLabel(recent)}</span>}
        </>}
      </div>
      {error && <span className="u-race-strip-error">更新できません</span>}
      {replaying && <button type="button" className="u-race-strip-expand" onClick={() => { setExpanded(true); }}>拡大</button>}
      {(replaying ? recent : next) && <a href={`/races/${encodeURIComponent((replaying ? recent : next)!.id)}`} aria-label={`${(replaying ? recent : next)!.name}の詳細を見る`}>詳細</a>}
      {expanded && replaying && recent && <div className="u-race-replay-overlay" role="dialog" aria-modal="true" aria-label={`${recent.name}のレース録画`}>
        <div className="u-race-replay-overlay-head">
          <strong>{recent.name} · レース録画</strong>
          <button type="button" onClick={() => { setExpanded(false); }} aria-label="レース録画を閉じる">閉じる</button>
        </div>
        <p>確定した走破タイムから途中位置を再現しています。ページを戻っても同じ進行位置で続きます。</p>
        <ReplayLanes raceName={recent.name} rows={replayRows} />
        <a href={`/races/${encodeURIComponent(recent.id)}`}>確定結果を見る</a>
      </div>}
    </section>
  );
}

function ReplayLanes({ raceName, rows }: {
  readonly raceName: string;
  readonly rows: readonly { readonly runner: ReplayRunner; readonly position: number }[];
}): React.ReactElement {
  return <div className="u-race-replay" role="img" aria-label={`${raceName}の確定結果から補間した走行映像`}>
    {rows.map(({ runner, position }) => <div key={runner.gate} className="u-race-replay-lane">
      <span className="u-race-replay-name">{runner.gate} {runner.name}</span>
      <span className="u-race-replay-track">
        <span className="u-race-replay-marker" style={{ left: `${position * 100}%` }}>{runner.gate}</span>
      </span>
    </div>)}
  </div>;
}
