'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { readClient } from '../../lib/supabase';
import { parseReplayRunners, replayDisplayProgress, replayProgress, type ReplayRunner } from './race-replay';
import { RUN_VIEW_M, runCamera } from './race-camera';
import { stripSizeOf } from './race-strip-sizes';
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

interface FocusRow extends RaceNoticeRow {
  readonly entry_deadline_at: string | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * ★**その画面のレース自身**（★`text` の画面: 出馬表・そのレースのオッズ）。
 *   ★§3「★他レースの通知もこの画面では出さない（集中を切らない）」→ ★このレースの 1 行だけを読みます。
 */
async function fetchFocus(raceId: string): Promise<FocusRow | null> {
  if (!UUID.test(raceId)) return null;
  const { data, error } = await readClient().from('races_public')
    .select(`${COLUMNS}, entry_deadline_at`).eq('id', raceId).limit(1);
  if (error !== null) throw new Error(error.message);
  return (data?.[0] ?? null) as FocusRow | null;
}

/** ★`/races/<id>`・`/races/<id>/bet`・`/odds/<id>` の `<id>` */
function focusRaceIdOf(pathname: string): string | null {
  const m = /^\/(?:races|odds)\/([^/?#]+)/.exec(pathname);
  return m === null ? null : decodeURIComponent(m[1]!);
}

/** ★§3: ★締切だけ ／ ★発走したら「発走しました」の文字だけ（★走行は出さない） */
function focusLine(row: FocusRow, nowMs: number): string {
  const startMs = new Date(row.scheduled_at).getTime();
  if (row.status === 'settled') return 'このレースは結果が確定しました';
  if (row.status === 'cancelled') return 'このレースは取りやめになりました';
  if (Number.isFinite(startMs) && nowMs >= startMs) return '発走しました・結果をお待ちください';
  if (row.status === 'closed') return `締切ました・発走 ${clock(row.scheduled_at)}`;
  return row.entry_deadline_at === null ? `発走 ${clock(row.scheduled_at)}` : `締切 ${clock(row.entry_deadline_at)}・発走 ${clock(row.scheduled_at)}`;
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
 * ★確定した走破タイムから逆算した進行率で ★馬を走らせる（★「大」150px ／「極小」22×16px）。
 *
 * 🔴 ★**大きさは引数で受け取りません。** ★居る画面を ★表（`race-strip-sizes.ts`・★正本）で引きます（★裁定 ⑤）。
 *   ★画面ごとに `compact` を渡していた頃は、★どの画面が何を出すかが ★各ページに散っていました。
 */
export function RaceStrip(): React.ReactElement | null {
  const pathname = usePathname() ?? '/';
  const size = stripSizeOf(pathname);
  const compact = size === 'mini';
  const focusId = size === 'text' ? focusRaceIdOf(pathname) : null;
  const [focus, setFocus] = useState<FocusRow | null>(null);
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

  /**
   * ★**横にしたら その場で全画面**（★③ 段 A・裁定 §6・仕様 §4 の読み替え）。
   *   ★同じ録画を ★同じ進行位置のまま ★全画面の重ね表示にします（★ページは移らない ＝ ★入力は残る）。
   *   ★本編エンジンは起動しません（★段 B・簿 STRIP-LANDSCAPE-STAGE-B）。★音は付けません（★§5: 常設は常に無音）。
   *   🔴 ★引き金は ★**触る端末で・縦 → 横に変わったとき**だけ（★条件 3）。★PC はいつも横なので ★自動では開きません（★「拡大」で開く）。
   *   ★縦に戻したら ★自動で開いたものだけ閉じます（★手で開いたものは閉じない）。
   */
  const replayingRef = useRef(false);
  const autoOpenedRef = useRef(false);
  useEffect(() => {
    if (size !== 'big' && size !== 'mini') return undefined;
    const land = window.matchMedia('(orientation: landscape)');
    const touch = window.matchMedia('(pointer: coarse)');
    let wasLandscape = land.matches;
    const onChange = (): void => {
      const step = autoExpandOf(wasLandscape, land.matches, touch.matches);
      wasLandscape = land.matches;
      if (step === 'open' && replayingRef.current) { autoOpenedRef.current = true; setExpanded(true); }
      if (step === 'close' && autoOpenedRef.current) { autoOpenedRef.current = false; setExpanded(false); }
    };
    land.addEventListener('change', onChange);
    return () => { land.removeEventListener('change', onChange); };
  }, [size]);

  useEffect(() => {
    if (!expanded) return;
    const onKey = (event: KeyboardEvent): void => { if (event.key === 'Escape') setExpanded(false); };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); };
  }, [expanded]);

  useEffect(() => {
    /** ★出さない画面では ★読みにも行きません */
    if (size === 'hidden') return undefined;
    let active = true;
    let loading = false;
    const refresh = (): void => {
      if (loading) return;
      loading = true;
      const job = size === 'text'
        ? (focusId === null ? Promise.resolve(null) : fetchFocus(focusId)).then((row) => { if (active) setFocus(row); })
        : fetchNotice().then((fresh) => { if (active) setData(fresh); });
      void job.then(() => {
        if (!active) return;
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
  }, [size, focusId]);

  const next = data?.next;
  const recent = data?.recent;
  const progress = recent && nowMs !== null && data?.runners.length
    ? replayDisplayProgress(recent.scheduled_at, nowMs) : null;
  const replaying = progress !== null;
  useEffect(() => {
    replayingRef.current = replaying;
    if (!replaying) { setExpanded(false); autoOpenedRef.current = false; }
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
  const big = replaying && size === 'big';

  if (size === 'hidden') return null;
  /** ★`text`: ★その画面のレースの 1 行だけ（★走行・拡大・他のレースは出さない） */
  if (size === 'text') {
    if (focus === null && !error) return null;
    return (
      <section aria-label="このレースの開催情報" className="u-race-strip u-race-strip-compact">
        <div className="u-race-strip-main">
          {focus !== null && <strong>{nowMs === null ? `発走 ${clock(focus.scheduled_at)}` : focusLine(focus, nowMs)}</strong>}
        </div>
        {error && <span className="u-race-strip-error">更新できません</span>}
      </section>
    );
  }

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
          {/* ★「本編」と名乗らない（★条件 1）。★録画・結果から再現 */}
          <strong>{recent.name} · 録画・結果から再現</strong>
          <button type="button" onClick={() => { autoOpenedRef.current = false; setExpanded(false); }} aria-label="レース録画を閉じる">閉じる</button>
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

/**
 * ★横向きの自動拡大の判定（★③ 段 A・条件 3）。★**縦 → 横** かつ ★**触る端末**でだけ `open`、★**横 → 縦** で `close`。
 *   ★PC（★触る端末でない）は ★どちらも返さない（★「拡大」を手で押す）。
 */
export function autoExpandOf(wasLandscape: boolean, isLandscape: boolean, coarsePointer: boolean): 'open' | 'close' | null {
  if (!coarsePointer || wasLandscape === isLandscape) return null;
  return isLandscape ? 'open' : 'close';
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
