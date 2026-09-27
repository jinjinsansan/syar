'use client';

import { useEffect, useState } from 'react';
import { readClient } from '../../lib/supabase';
import { parseReplayRunners, replayDisplayProgress, replayProgress, type ReplayRunner } from './race-replay';
import { RUN_VIEW_M, runCamera } from './race-camera';
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
      .select('gate,horse_name,strategy,finish_pos,finish_time,horse_id')
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

/**
 * 公開 DB の開催情報を表示する。★確定したレースの録画の時間帯（★発走 +75 秒から 45 秒）は、
 * ★確定した走破タイムから逆算した進行率で ★馬を走らせる（★「大」150px ／ `compact` は「極小」22×16px）。
 */
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

  const leader = leaderOf(replayRows);
  const big = replaying && !compact;

  return (
    <section aria-label="レースの開催情報" className={`u-race-strip${compact ? ' u-race-strip-compact' : ''}${replaying ? ' u-race-strip-replaying' : ''}${big ? ' u-race-strip-big' : ''}${expanded ? ' u-race-strip-expanded' : ''}`}>
      {/* ★「大」150px（★一覧・閲覧の画面）。★同じ枠が伸びます（★§2: 別要素への切替ではない） */}
      {big && <RaceRun rows={replayRows} distance={recent?.distance ?? 0} motionReduced={motionReduced} />}
      <div className="u-race-strip-main">
        {replaying && recent && data ? <>
          {/* ★「極小」22×16px（★フォームの画面）。★先頭の馬 1 頭だけ */}
          {compact && <span className="u-race-run-mini" aria-hidden>
            <span className="u-race-run-horse" style={{ inset: 0 }}><RunningHorse phase={0} motionReduced={motionReduced} /></span>
          </span>}
          <strong>{recent.name} レース中（録画）</strong>
          {!compact && <span title={raceLabel(recent)}>{raceLabel(recent)}</span>}
          {!compact && leader !== null && <span className="u-race-strip-recent">先頭 {leader.gate}番 {leader.name}</span>}
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
        <RaceRun rows={replayRows} distance={recent.distance} motionReduced={motionReduced} tall />
        <ReplayLanes raceName={recent.name} rows={replayRows} />
        <a href={`/races/${encodeURIComponent(recent.id)}`}>確定結果を見る</a>
      </div>}
    </section>
  );
}

/**
 * ★**走る馬の絵**（★2026-09-27・裁定 `REVIEW_ALWAYS_VISIBLE_RACE_20260927.md` ①②）
 *
 * 🔴 ★**`horse-gallop.webp` ではなく、本編と TOP と同じ `horse-jockey-side-v8-pose01〜08` を使います。**
 *   ★確定仕様（`RACE_NOTICE_HANDOFF.md` §2）は `horse-gallop.webp` を指していますが、★その絵は
 *   ★2026-09-17 に TOP で試して ★オーナーが「★絵柄が別系統」と差し戻したものです。
 *   ★2026-09-27 にオーナーへ尋ね、★**side-v8（本編と同じ）**に決まりました。
 * ★コマの送り方は TOP と同じ（★8 枚を重ね、★`u-frame` で 1 枚ずつ見せる）。
 *   ★止めると（`.u-paused` / 動きを減らす設定）★1 枚目だけが残ります（★濁らない）。
 */
export const RUN_FRAMES = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => `/art/horse-jockey-side-v8-pose0${n}.webp`);
const GALLOP_SEC = 0.62;

function RunningHorse({ phase, motionReduced }: { readonly phase: number; readonly motionReduced: boolean }): React.ReactElement {
  return <>
    {RUN_FRAMES.map((src, i) => <span key={src} className="u-race-run-pose" style={{
      backgroundImage: `url('${src}')`,
      opacity: i === 0 ? 1 : 0,
      animation: motionReduced ? 'none' : `u-frame ${GALLOP_SEC}s steps(1,end) ${(i * GALLOP_SEC) / 8 - phase * GALLOP_SEC}s infinite`,
    }} />)}
  </>;
}

/**
 * ★**「大」150px**（★§2）。★芝の上を ★**進行率どおりに**左から右へ走ります（★ゴールは右端の金の線）。
 *   ★奥行きは 3 列（★枠番で振り分け）。★手前ほど大きく・上に重ねます。★馬の上に枠番の札。
 *   ★位置は ★**確定した走破タイムから逆算した進行率**（★`replayProgress`・本編と同じ入口）。★作り物の動きはありません。
 */
export function RaceRun({ rows, distance, motionReduced, tall = false }: {
  readonly rows: readonly { readonly runner: ReplayRunner; readonly position: number }[];
  readonly distance: number;
  readonly motionReduced: boolean;
  readonly tall?: boolean;
}): React.ReactElement {
  const horseH = tall ? 120 : 72;
  const cam = runCamera(rows.map((r) => r.position), distance);
  const span = cam.right - cam.left;
  /** ★芝の縞（★20m ごと）を ★カメラと一緒に流す（★速さが分かる）。★縞 1 枚 ＝ 枠の 1/3 */
  const stripe = ((cam.left * distance) / (RUN_VIEW_M / 3)) % 1;
  const goalX = (1 - cam.left) / span;
  return <div className={`u-race-run${tall ? ' u-race-run-tall' : ''}`} role="img"
    aria-label={`走行（${rows.length}頭・確定した結果から再現）`}
    style={{ backgroundPositionX: `${(-stripe * 50).toFixed(3)}%, 0` }}>
    {goalX <= 1 && <span className="u-race-run-goal" style={{ left: `calc((100% - 8px) * ${goalX.toFixed(4)})` }} />}
    {[...rows].sort((a, b) => depthOf(a.runner.gate) - depthOf(b.runner.gate)).map(({ runner, position }) => {
      const depth = depthOf(runner.gate);
      const h = Math.round(horseH * (0.78 + depth * 0.11));
      const w = Math.round((h * 970) / 576);
      /** ★鼻先（★絵の右端）が進行率の位置。★枠より後ろの馬は ★半分だけ見せて左端に残す（★消さない） */
      const x = (position - cam.left) / span;
      return <span key={runner.gate} className="u-race-run-horse" style={{
        width: w, height: h, bottom: `${(2 - depth) * 12 + 2}%`, zIndex: 1 + depth,
        left: `max(${-Math.round(w / 2)}px, calc((100% - 8px) * ${x.toFixed(4)} - ${w}px))`,
      }}>
        <RunningHorse phase={(runner.gate * 0.37) % 1} motionReduced={motionReduced} />
        <b className="u-race-run-gate">{runner.gate}</b>
      </span>;
    })}
  </div>;
}

/** ★奥行きの列（★0 が奥・2 が手前）。★枠番で決めるので ★毎回同じ列に居ます */
function depthOf(gate: number): number {
  return (gate - 1) % 3;
}

/** ★先頭の馬（★進行率が最大・同じなら着順が上） */
function leaderOf(rows: readonly { readonly runner: ReplayRunner; readonly position: number }[]): ReplayRunner | null {
  let best: { readonly runner: ReplayRunner; readonly position: number } | null = null;
  for (const row of rows) {
    if (best === null || row.position > best.position
      || (row.position === best.position && row.runner.finishPosition < best.runner.finishPosition)) best = row;
  }
  return best?.runner ?? null;
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
