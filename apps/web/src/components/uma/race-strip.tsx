'use client';

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { usePathname } from 'next/navigation';
import { readClient } from '../../lib/supabase';
import { canPlayRealRace } from '../../lib/race-real-access';
import { StaleBuildNotice } from './stale-build-notice';
import { LABEL_ENTRY_CLOSE, LABEL_SALES_CLOSE, salesCloseAtMs, salesClosedAt, salesLeftText } from '../../lib/sales-close';
import { CLAIM_LIVE_PENDING, CLAIM_SALES_CLOSED, CLAIM_SETTLE_CHECKING } from '../../lib/claims';
import { SETTLE_AFTER_START_MS } from '@star/scheduler';
import { parseReplayRunners, replayDisplayProgress, replayProgress, replayResultShowing, replayWindowNear, replayWindowOver, type ReplayRunner } from './race-replay';
import { INTRO_STAGES, stripEmbedsOn, stripSizeOf, stripTvModeOf, stripVisionOn } from './race-strip-sizes';
import { STRIP_EMBED_FAILED_NOTE, STRIP_EMBED_GIVE_UP_SEC, STRIP_EMBED_LEAD_SEC, isStripEmbedMessage, stripControlMessage, stripEmbedLog, stripEmbedUrl } from './race-strip-embed';
import { BOARD_ITEM_SEC, boardText, bracketOrNull, raceLine, tickerBoard, tickerShowsField, type BoardItem, type TickerRunner } from './race-strip-ticker';
import { StripChannel } from './strip-channel';
import { fetchFieldProfiles, fetchMyGates, type FieldProfile } from './channel-feed';
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
  /** ★`track_condition`・`course_id` は ★小窓テレビの番組（★馬場状態・競馬場・R-28） */
  readonly next: (RaceNoticeRow & { readonly entry_deadline_at: string | null; readonly track_condition: string | null; readonly course_id: string | null }) | null;
  readonly recent: RaceNoticeRow | null;
  readonly runners: readonly ReplayRunner[];
  /** ★次のレースの出走馬と単勝（★締切の後だけ読む・★流れる 1 行 `race-strip-ticker.ts`） */
  readonly nextField: readonly TickerRunner[];
}

const COLUMNS = 'id, name, surface, distance, scheduled_at, status';
/** ★② 締めるが遅れていると見なすまでの余裕（★SETTLE_AFTER_START_MS の後・ワーカーの見回りの間隔ぶん・0098） */
const SETTLE_CHECK_GRACE_MS = 60_000;
const REFRESH_MS = 15_000;

async function fetchNotice(): Promise<NoticeData> {
  const client = readClient();
  /**
   * ★2026-09-29（★0098・レビュー側 B 条件 1）: ★走っている間も status は scheduled のまま（★② 締めるまで）。
   *   → ★「次」は ★発走時刻がまだ先のもの・★「直近」は ★発走時刻を過ぎたもの（★settled か scheduled）を ★時刻で分ける。
   */
  const nowIso = new Date().toISOString();
  const [next, recent] = await Promise.all([
    client.from('races_public').select(`${COLUMNS}, entry_deadline_at, track_condition, course_id`)
      .in('status', ['announced', 'scheduled', 'closed'])
      .gt('scheduled_at', nowIso)
      .order('scheduled_at', { ascending: true }).limit(1),
    client.from('races_public').select(COLUMNS)
      .in('status', ['settled', 'scheduled'])
      .lte('scheduled_at', nowIso)
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
    const rows = ((entries.data ?? []) as Record<string, unknown>[])
      .filter((row) => row['finish_pos'] !== null && row['finish_pos'] !== undefined);
    runners = parseReplayRunners(rows);
  }
  const nextRace = (next.data?.[0] ?? null) as NoticeData['next'];
  return {
    next: nextRace,
    recent: lastRace,
    runners,
    nextField: nextRace !== null && tickerShowsField(nextRace.status) ? await fetchField(nextRace.id) : [],
  };
}

/**
 * ★**次のレースの出走馬と単勝**（★締切の後だけ・★流れる 1 行）。★馬名か馬番が欠けた行は ★流さない（★埋めない）。
 *   ★単勝が無い馬は `null`（★「—」で埋めず ★オッズの欄ごと出さない）。
 */
async function fetchField(raceId: string): Promise<readonly TickerRunner[]> {
  const client = readClient();
  const [entries, odds] = await Promise.all([
    client.from('race_entries_public').select('gate,horse_name').eq('race_id', raceId).order('gate'),
    client.from('race_odds_public').select('selection, odds, capped').eq('race_id', raceId).eq('bet_type', 'win'),
  ]);
  if (entries.error !== null) throw new Error(entries.error.message);
  if (odds.error !== null) throw new Error(odds.error.message);
  const winByGate = new Map<number, { readonly odds: number; readonly capped: boolean }>();
  for (const o of (odds.data ?? []) as Record<string, unknown>[]) {
    const sel = Array.isArray(o['selection']) ? (o['selection'] as unknown[]) : [];
    const g = Number(sel[0]);
    const v = Number(o['odds']);
    if (sel.length === 1 && Number.isInteger(g) && Number.isFinite(v) && v > 0) winByGate.set(g, { odds: v, capped: o['capped'] === true });
  }
  const field: TickerRunner[] = [];
  for (const e of (entries.data ?? []) as Record<string, unknown>[]) {
    const gate = Number(e['gate']);
    const name = typeof e['horse_name'] === 'string' ? e['horse_name'] : '';
    if (!Number.isInteger(gate) || gate < 1 || name === '') continue;
    const w = winByGate.get(gate);
    field.push({ gate, name, winOdds: w?.odds ?? null, capped: w?.capped ?? false });
  }
  return field;
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
  /**
   * ★2026-09-29: ★「締切 03:06」は ★出走登録の締切（発走 18 分前）で、★投票の締切（発走 1 分前）と読み違えた（★レビュー側）。
   *   ★登録の締切までは ★両方を出し、★過ぎたら ★発売の締切だけ（★投票の画面で知りたいのは いつまで買えるか）。★時刻は `sales-close.ts` の 1 か所から。
   */
  const salesClose = Number.isFinite(startMs) ? new Date(salesCloseAtMs(startMs)).toISOString() : null;
  if (row.status === 'closed' || (salesClose !== null && salesClosedAt(startMs, nowMs))) return `${CLAIM_SALES_CLOSED}・発走 ${clock(row.scheduled_at)}`;
  const sales = salesClose === null ? '' : `${LABEL_SALES_CLOSE} ${clock(salesClose)}・`;
  const entryOpen = row.entry_deadline_at !== null && nowMs < new Date(row.entry_deadline_at).getTime();
  return entryOpen && row.entry_deadline_at !== null
    ? `${LABEL_ENTRY_CLOSE} ${clock(row.entry_deadline_at)}・${sales}発走 ${clock(row.scheduled_at)}`
    : `${sales}発走 ${clock(row.scheduled_at)}`;
}

function clock(iso: string): string {
  const timestamp = new Date(iso).getTime();
  if (!Number.isFinite(timestamp)) return '時刻未取得';
  return new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit' }).format(timestamp);
}

/**
 * ★掲示板の全部の札（★録画中は ★頭に ★先頭の札・★最後に 直近確定）。
 */
function boardItemsOf(
  next: NonNullable<NoticeData['next']>, data: NoticeData, recent: RaceNoticeRow | null | undefined, nowMs: number,
  leaderCard: BoardItem | null,
): readonly BoardItem[] {
  return [
    ...(leaderCard === null ? [] : [leaderCard]),
    ...tickerBoard(next, data.nextField, nowMs, clock),
    ...(recent ? [boardCard('確定', raceLine(recent))] : []),
  ];
}

function boardCard(kind: string, text: string, rest: Partial<BoardItem> = {}): BoardItem {
  return { kind, bracket: null, no: null, text, num: null, tail: null, tone: 'plain', badge: null, ...rest };
}

/**
 * ★**掲示板**（★2026-09-28・オーナー選択 A＋C → ★デザイナー回答 R-20「着順掲示板の見た目」）。
 *   ★［見出し］は ★動かさず 語だけ入れ替え、★本文だけが ★右から入って止まり 左へ抜ける（★1 枚 3 秒）。
 *   ★札を ★`step` で数え、★本文の `key` を変えて ★CSS の動きを 1 枚ごとに頭から（★同じ要素の中で・★帯は差し替えない）。
 *   ★停止スイッチ（`.u-paused`）・「動きを減らす」の間は ★札を送らない（★資料 §5-7・★いまの札のまま止める）。
 *   ★読み上げは ★全部の札の文を 1 つにして渡す（★送るたびに読み上げない）。
 */
function StripBoard({ items, label }: { readonly items: readonly BoardItem[]; readonly label: string }): React.ReactElement {
  const [step, setStep] = useState(0);
  const hostRef = useRef<HTMLSpanElement | null>(null);
  /**
   * 🔴 ★**次の札へは ★本文の動きが終わった時に送る**（★2026-10-01・デザイナー引き渡し「PC 表示 大型ビジョン案」§1-4 🔴「掲示板の欄が空」）。
   *   ★旧: ★`setInterval(3 秒)` で送り、★本文は ★CSS の 3 秒（`both`）で ★最後の姿 ＝ ★左へ抜けて透明 のまま止まる。
   *   ★2 つの時計が別々なので、★タイマーが遅れると（★重い処理・★別の iframe の読み込み・★タブの間引き）
   *   ★次の札が来るまで ★見出しだけ残って ★本文が空になる（★オーナーのスクリーンショット「単勝 ＋ 空」）。
   *   → ★本文の `animationend` で送る（★時計は CSS の 1 つだけ・★遅れても空のまま待たない）。
   *   ★停止スイッチ・「動きを減らす」の間は ★動きが無い（`animation: none`）ので ★送らない（★旧と同じ）。
   *   ★隠れたタブで終わったら ★見えた時に 1 枚送る（★旧はタブ復帰で そのまま次の刻みを待った）。
   */
  const advance = (): void => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (reduce.matches || hostRef.current?.closest('.u-paused') != null || document.visibilityState !== 'visible') return;
    setStep((s) => s + 1);
  };
  const missedRef = useRef(false);
  useEffect(() => {
    const onBoardVisible = (): void => {
      if (document.visibilityState !== 'visible' || !missedRef.current) return;
      missedRef.current = false;
      setStep((s) => s + 1);
    };
    document.addEventListener('visibilitychange', onBoardVisible);
    return () => { document.removeEventListener('visibilitychange', onBoardVisible); };
  }, []);
  const onItemEnd = (event: React.AnimationEvent<HTMLSpanElement>): void => {
    if (event.animationName !== 'u-board-slide' || event.target !== event.currentTarget) return;
    if (document.visibilityState !== 'visible') { missedRef.current = true; return; }
    advance();
  };
  const item = items.length === 0 ? null : items[step % items.length]!;
  /** ★長い札は ★止まっている間に ★はみ出したぶんだけ左へ送る（★最後まで読ませる・★「…」で切らない・R-20 Q4） */
  const bodyRef = useRef<HTMLSpanElement | null>(null);
  const itemKey = item === null ? '' : boardText(item);
  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (el === null) return;
    el.style.setProperty('--board-shift', `${Math.max(0, el.scrollWidth - el.clientWidth)}px`);
  }, [step, itemKey]);
  return <span ref={hostRef} className="u-race-strip-board" aria-label={`${label}: ${items.map(boardText).join('、')}`}>
    {item !== null && <>
      <span className={`u-board-kind u-board-${item.tone}`} aria-hidden>{item.kind}</span>
      <span key={step} ref={bodyRef} className="u-race-strip-board-item" aria-hidden onAnimationEnd={onItemEnd}
        style={{ '--board-sec': `${BOARD_ITEM_SEC}s` } as React.CSSProperties}>
        {item.no !== null && <b className="u-board-gate" style={item.bracket === null ? undefined : { background: `var(--f${item.bracket})`, color: [1, 5, 8].includes(item.bracket) ? '#111' : '#fff' }}>{item.no}</b>}
        {item.text !== null && <span className="u-board-text">{item.text}</span>}
        {item.num !== null && <span className="u-board-numset"><span className="u-board-num">{item.num}</span>{item.tail !== null && <span className="u-board-unit">{item.tail}</span>}</span>}
        {item.num === null && item.tail !== null && <span className="u-board-unit">{item.tail}</span>}
        {item.badge !== null && <b className="u-board-badge">{item.badge}</b>}
      </span>
    </>}
  </span>;
}

/**
 * ★**大型ビジョンの 1 段目**（★PC・§1-4）。★本編が流れている（★録画の窓の）間は ★赤い点 ＋「中継 レース名」＋ 条件、
 *   ★それ以外は ★灰色の点 ＋ ★帯の状態の語（★「開催予定」など）＋ ★右端に 発売締切までの残り（★帯の `salesLeftText`）。
 *   ★赤い点を ★待ち時間に出さない（★流れていないのに 中継中に見せない）。
 */
function VisionHead({ air, next, status, runners, left }: {
  readonly air: RaceNoticeRow | null;
  readonly next: RaceNoticeRow | null;
  readonly status: string;
  readonly runners: number;
  readonly left: string | null;
}): React.ReactElement {
  const surface = (row: RaceNoticeRow): string => (row.surface === 'turf' ? '芝' : row.surface === 'dirt' ? 'ダート' : row.surface);
  return <div className="u-vision-head">
    <i className={`u-vision-dot${air !== null ? ' u-vision-dot-live' : ''}`} aria-hidden />
    <span className="u-vision-label">{air !== null ? `中継 ${air.name}` : status}</span>
    <span className="u-vision-cond">
      {air !== null ? `${surface(air)}${air.distance}m${runners > 0 ? ` ・ ${runners}頭` : ''}` : next !== null ? `次 ${surface(next)}${next.distance}m` : ''}
    </span>
    {air === null && left !== null && <span className="u-vision-left">{left}</span>}
  </div>;
}

/** ★名前に距離が入っているときは足さない（★`raceLine` と同じ 1 か所で決める） */
function raceLabel(row: RaceNoticeRow): string {
  return raceLine(row, '・');
}

/**
 * ★**帯の状態を 画面と分け合う**（★2026-09-27・裁定 §6-1 の (c)・`/watch-race` の出口）。
 *   ★画面が ★自分で開催情報を読み直さない（★同じ物を 2 回読まない・★帯と画面で食い違わない）。
 *   ★帯は ★1 画面に 1 本（★網 `race-strip-sizes.test.ts` ⑥）なので、★状態は 1 つで足ります。
 */
export interface StripState {
  readonly replaying: boolean;
  readonly nextAt: string | null;
  /** ★直前に確定したレースの 1 行（★「いま走っていません」に添える・R-18 回答 §3-6）。★着順は記録の値 */
  readonly lastResult: string | null;
}
const IDLE_STATE: StripState = { replaying: false, nextAt: null, lastResult: null };
let stripState: StripState = IDLE_STATE;
const stripListeners = new Set<() => void>();
function publishStripState(next: StripState): void {
  if (next.replaying === stripState.replaying && next.nextAt === stripState.nextAt && next.lastResult === stripState.lastResult) return;
  stripState = next;
  stripListeners.forEach((listener) => { listener(); });
}
export function useStripState(): StripState {
  return useSyncExternalStore(
    (listener) => { stripListeners.add(listener); return () => { stripListeners.delete(listener); }; },
    () => stripState,
    () => IDLE_STATE,
  );
}
const EXPAND_EVENT = 'race-strip:expand';
/** ★画面から ★帯の拡大（★段 A）を頼む。★録画の窓の外なら ★何も起きない */
export function requestStripExpand(): void {
  window.dispatchEvent(new CustomEvent(EXPAND_EVENT));
}

/**
 * ★**導入中か**（★初回導入の道で ★帯を出さないため・R-18 回答 🔴 #2）。
 *   🔴 ★帯は ★ログインの口を使いません（★誰の馬かを知らない・網 `race-strip-notice.test.ts`）。
 *   ★そこで ★**画面が** サーバーの段階（`fetchOnboardingState` の stage）を読んで ★ここへ渡します。★帯は推測しません。
 *   ★渡されるまで（null）は ★導入の道では出しません（`stripSizeOf`）。
 */
let introState: boolean | null = null;
const introListeners = new Set<() => void>();
export function reportOnboardingStage(stage: string | null): void {
  const next = stage === null ? null : INTRO_STAGES.includes(stage);
  if (next === introState) return;
  introState = next;
  introListeners.forEach((listener) => { listener(); });
}

/**
 * ★**PC の幅か**（★`(min-width: 1024px)`・★CSS の `@media` と同じ境目）。
 *   ★サーバーと 最初の描画は ★偽（★スマホの形）→ ★描いた後に ★幅を見て ビジョンへ（★スマホの見た目は 1 画素も変えない）。
 */
const WIDE_QUERY = '(min-width: 1024px)';
function useWideScreen(): boolean {
  return useSyncExternalStore(
    (listener) => {
      const media = window.matchMedia(WIDE_QUERY);
      media.addEventListener('change', listener);
      return () => { media.removeEventListener('change', listener); };
    },
    () => window.matchMedia(WIDE_QUERY).matches,
    () => false,
  );
}

/**
 * 公開 DB の開催情報を表示する。★確定したレースの録画の時間帯（★発走 +75 秒から 45 秒）は、
 * ★確定した走破タイムから逆算した進行率で ★馬を走らせる（★「大」150px ／「極小」22×16px）。
 *
 * 🔴 ★**大きさは引数で受け取りません。** ★居る画面を ★表（`race-strip-sizes.ts`・★正本）で引きます（★裁定 ⑤）。
 *   ★画面ごとに `compact` を渡していた頃は、★どの画面が何を出すかが ★各ページに散っていました。
 */
export function RaceStrip(): React.ReactElement | null {
  /** ★古い版の知らせは ★帯の上の 1 か所だけ（★全画面に散らさない・`stale-build.ts`・2026-09-28） */
  return <><StaleBuildNotice /><RaceStripBody /></>;
}

function RaceStripBody(): React.ReactElement | null {
  const pathname = usePathname() ?? '/';
  const intro = useSyncExternalStore(
    (listener) => { introListeners.add(listener); return () => { introListeners.delete(listener); }; },
    () => introState,
    () => null,
  );
  /** ★PC の幅か（★1024px 以上で ★大型ビジョン・デザイナー引き渡し「PC 表示 大型ビジョン案 2a」§1-1） */
  const wide = useWideScreen();
  const size = stripSizeOf(pathname, { intro, wide });
  /** ★この面で 本編を流すか（★表 `race-strip-sizes.ts` が正本・★決裁 ④: /home と観戦の面だけ） */
  const embedsHere = stripEmbedsOn(pathname, { wide });
  /**
   * ★**大型ビジョン**（★PC・§1-4）: ★同じ帯（★同じデータ・★同じ本編の iframe）を ★枠・柱・見出しの行・16:9 の画面で囲むだけ。
   *   🔴 ★中身は ★小窓・全画面と ★同じ物（★オーナー決定）。★別の録画・別のレースは出さない。★新しい読み込みは無い。
   */
  const vision = stripVisionOn(pathname, { intro, wide });
  /**
   * ★**小窓テレビ**（★2026-10-01・R-28）: ★PC の大型ビジョン（`pc`）・★スマホ（`full`・幅いっぱいの 16:9・★全ての画面で同じ大きさ）。
   *   ★帯を単独では出さない（★「次」と掲示板は テレビの上下の帯へ・README §1）。★表 `race-strip-sizes.ts` が正本。
   */
  const tvMode = stripTvModeOf(pathname, { intro, wide });
  const compact = size === 'mini';
  const focusId = size === 'text' && tvMode === null ? focusRaceIdOf(pathname) : null;
  const [focus, setFocus] = useState<FocusRow | null>(null);
  const [data, setData] = useState<NoticeData | null>(null);
  const [error, setError] = useState(false);
  const [nowMs, setNowMs] = useState<number | null>(null);
  const [motionReduced, setMotionReduced] = useState(false);
  const [expanded, setExpanded] = useState(false);
  /**
   * ★**拡大・小窓に戻す の出入口は ここ 1 か所**（★2026-10-01・オーナー「スマホで拡大したら 横向きの全画面に・小窓に戻すボタン・バグが出ないように」）。
   *   ★拡大: ★ブラウザの全画面（★`requestFullscreen`）＋ ★触る端末は 横向きに固定（★`screen.orientation.lock`）。
   *     ★使えない端末（★iPhone の Safari など）は ★従来どおり 画面いっぱいの重ね表示（★縦なら 90 度回す・CSS）。
   *     ★全画面の要求は ★押した操作の中で呼ぶ（★ブラウザの決まり）。★iframe は作り直さない（★同じ箱を広げるだけ）。
   *   ★戻す: ★全画面と向きの固定を外してから 小窓へ。★全画面を外から抜けたとき（`fullscreenchange`）も ★ここを通る。
   */
  const enteredFullscreenRef = useRef(false);
  const expandedRef = useRef(false);
  expandedRef.current = expanded;
  const openExpanded = (): void => {
    setExpanded(true);
    const root = document.documentElement;
    if (typeof root.requestFullscreen !== 'function' || document.fullscreenElement !== null) return;
    root.requestFullscreen().then(() => {
      enteredFullscreenRef.current = true;
      const orientation = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
      if (window.matchMedia('(pointer: coarse)').matches && typeof orientation.lock === 'function') {
        orientation.lock('landscape').catch(() => undefined);
      }
    }, () => undefined);
  };
  const closeExpanded = (): void => {
    autoOpenedRef.current = false;
    setExpanded(false);
    if (enteredFullscreenRef.current || document.fullscreenElement !== null) {
      enteredFullscreenRef.current = false;
      try { screen.orientation.unlock(); } catch { /* ★固定していない端末 */ }
      if (document.fullscreenElement !== null) document.exitFullscreen().catch(() => undefined);
    }
  };
  const closeExpandedRef = useRef(closeExpanded);
  closeExpandedRef.current = closeExpanded;

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = (): void => { setMotionReduced(media.matches); };
    apply();
    media.addEventListener('change', apply);
    return () => { media.removeEventListener('change', apply); };
  }, []);

  /**
   * ★**横にしたら その場で全画面**（★仕様 §4 の読み替え）。
   *   ★2026-09-28 から ★帯の中の ★同じ iframe（本編）を ★画面いっぱいに広げる（★読み直さない ＝ 同じ進行位置・★ページは移らない ＝ ★入力は残る）。
   *   ★音は付けません（★§5: 常設は常に無音）。★段 B の簿（STRIP-LANDSCAPE-STAGE-B）は 同日に消した（★理由はコミット本文）。
   *   ★**途中で来た人は ★録画の頭から見る**（★本編に「途中から始める」口は無い）。★生中継ではなく「録画」と出しているので ★これでよい
   *   （★レビュー側の判定 2026-09-28。★「同じ位置から」を求められたら ★口は無いところから作る）。
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
      /** ★すでに拡大していれば 記録しない（★「拡大」→ 横向きの固定 → 回転、で 自動で開いたものと取り違えない・2026-10-01） */
      if (step === 'open' && replayingRef.current && !expandedRef.current) { autoOpenedRef.current = true; setExpanded(true); }
      if (step === 'close' && autoOpenedRef.current) { autoOpenedRef.current = false; setExpanded(false); }
    };
    land.addEventListener('change', onChange);
    return () => { land.removeEventListener('change', onChange); };
  }, [size]);

  useEffect(() => {
    if (!expanded) return;
    const onKey = (event: KeyboardEvent): void => { if (event.key === 'Escape') closeExpandedRef.current(); };
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
      const job = size === 'text' && tvMode === null
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
    /**
     * ★⑥ タブ復帰（★仕様 §5）: ★戻った瞬間に ★時計を今に合わせ ★読み直す（★止まっていた時間をそのまま延長しない）。
     */
    const onVisible = (): void => {
      if (document.visibilityState !== 'visible') return;
      setNowMs(new Date().getTime());
      refresh();
    };
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
  /** ★状態を画面へ（★走行を出す画面だけ）・★画面からの拡大の頼みを受ける */
  const nextAt = next?.scheduled_at ?? null;
  /**
   * ★1 着の 1 行は ★確定してから（★2026-09-29・0098）: ★発走時刻から着順が見えるので ★映像より先に勝ち馬を出さない（★ネタバレ）。
   */
  const lastWinner = recent?.status === 'settled' ? data?.runners.find((runner) => runner.finishPosition === 1) ?? null : null;
  const lastResult = recent && lastWinner !== null ? `${recent.name} 1着 ${lastWinner.gate}番 ${lastWinner.name}` : null;
  useEffect(() => {
    if (size !== 'big' && size !== 'mini') return undefined;
    publishStripState({ replaying, nextAt, lastResult });
    return undefined;
  }, [size, replaying, nextAt, lastResult]);
  useEffect(() => {
    if (size !== 'big' && size !== 'mini') return undefined;
    const onExpand = (): void => { if (replayingRef.current) setExpanded(true); };
    window.addEventListener(EXPAND_EVENT, onExpand);
    return () => { window.removeEventListener(EXPAND_EVENT, onExpand); publishStripState(IDLE_STATE); };
  }, [size]);
  const replayRows = replaying && recent && data ? data.runners.map((runner) => {
    const raceSec = (motionReduced ? 1 : progress) * Math.max(...data.runners.map((r) => r.finishSec));
    return { runner, position: replayProgress(runner, recent.distance, raceSec) };
  }) : [];
  /**
   * ★待ちの 2 つ（★0098・条件 4・条件 2）: ★発走を過ぎたのに着順が見えない（① の遅れ）／★確定が遅れている（② の遅れ・食い違い）。
   *   ★エラーにしない。★待っていると分かる・止まったと分かる言い方（`claims.ts`）。
   */
  const recentStartMs = recent ? new Date(recent.scheduled_at).getTime() : Number.NaN;
  const livePending = recent?.status === 'scheduled' && nowMs !== null && Number.isFinite(recentStartMs)
    && nowMs >= recentStartMs && !data?.runners.length;
  const settleChecking = recent?.status === 'scheduled' && nowMs !== null && Number.isFinite(recentStartMs)
    && nowMs >= recentStartMs + SETTLE_AFTER_START_MS + SETTLE_CHECK_GRACE_MS;
  const status = settleChecking ? CLAIM_SETTLE_CHECKING
    : livePending ? CLAIM_LIVE_PENDING
    : next?.status === 'announced' ? '出走登録受付中'
    : next?.status === 'scheduled' ? '開催予定'
      : next?.status === 'closed' ? '受付終了・結果待ち'
        : data === null ? '開催情報を読み込み中' : '現在、開催予定のレースはありません';

  /**
   * ★**本編を小窓で流す**（★2026-09-28・オーナー依頼「パドックからリプレイまで」・★約束は `race-strip-embed.ts`）。
   *   ★「大」の帯で ★新しい確定レースが見えたら ★本編を ★見えない iframe で開き、★`playing` が来たら ★差し替える。
   *   ★それまでは ★今の帯・今の走行（side-v8）を出したまま（★「用意しています」で待たせない）。★1 レースにつき 1 回・★頭から（★案 A）。
   *   ⚠️ ★2026-09-28 に直した: ★最初は ★録画の窓（45 秒）が開いてから読み始め、★本編の用意（★実測 24〜27 秒）が ★間に合わず
   *      ★オーナーの画面では ★簡易版のままでした。★確定は ★窓の 75 秒前から見えるので、★見えた時点で読み始めます。
   *   ★動きを減らす設定では ★開きません。★`ended` / `error` / ★打ち切り秒 / ★「大」でなくなった / ★窓が閉じても始まらない で ★閉じます。
   */
  const [embed, setEmbed] = useState<{ readonly id: string; readonly startAt: string; readonly live: boolean; readonly sinceMs: number } | null>(null);
  /**
   * ★**この人に本編を出せるか**（★2026-09-28・レビュー側の決定 (b)）。★`null` は まだ分からない（★分かるまで開かない）。
   *   🔴 ★未ログインは ★本編が「ログインしてください」で止まると ★先に分かっている → ★開かない（★文字の帯だけ・★エラーを出さない）。
   *   ★判定は 本編の読む層と ★同じ 1 か所（`canPlayRealRace`）。★画面を移るたびに 読み直す（★ログインは画面を移って戻る）。
   */
  const [canPlay, setCanPlay] = useState<boolean | null>(null);
  useEffect(() => {
    if (!embedsHere) return undefined;
    let cancelled = false;
    canPlayRealRace().then((ok) => { if (!cancelled) setCanPlay(ok); }, () => { if (!cancelled) setCanPlay(false); });
    return () => { cancelled = true; };
  }, [embedsHere, pathname]);
  /**
   * ★**出せなかった理由の 1 行**（★2026-09-28）。★黙って簡易版に戻ると ★原因を誰も見られない（★オーナーの画面で実際にそうなった）。
   *   ★本編の知らせた理由 か ★「間に合わなかった（N 秒）」を ★次のレースを読み始めるまで出します。
   */
  const [embedNote, setEmbedNote] = useState<string | null>(null);
  const embedRef = useRef(embed);
  embedRef.current = embed;
  /** ★待った秒は ★帯の時計（`nowMs`）で測る（★時計を 2 つ持たない） */
  const nowRef = useRef(nowMs);
  nowRef.current = nowMs;
  const embeddedIdRef = useRef<string | null>(null);
  const recentId = recent?.id ?? null;
  const windowOver = recent === null || recent === undefined || nowMs === null || !data?.runners.length
    ? true : replayWindowOver(recent.scheduled_at, nowMs);
  /** ★本編を開いてよい時間（★窓が開く 40 秒前から 窓が閉じるまで・★レビュー側の決定 4） */
  const openSoon = !windowOver && recent !== null && recent !== undefined && nowMs !== null
    && replayWindowNear(recent.scheduled_at, nowMs, STRIP_EMBED_LEAD_SEC * 1000);
  /**
   * ★**先読み**（★2026-09-29・0098・オーナー「発走時刻に 小窓も本格的な画面も 同じものが流れないとおかしい」）:
   *   ★次のレースの発走 STRIP_EMBED_LEAD_SEC 秒前から ★本編を開く（★本編は発走まで待ち・★発走時刻に着順が見えたら 時計の位置から流す）。
   */
  const nextId = next?.id ?? null;
  const nextStartAt = next?.scheduled_at ?? null;
  const nextStartMs = nextStartAt === null ? Number.NaN : new Date(nextStartAt).getTime();
  const preOpen = nextId !== null && nowMs !== null && Number.isFinite(nextStartMs)
    && nextStartMs > nowMs && nextStartMs - nowMs <= STRIP_EMBED_LEAD_SEC * 1000;
  /**
   * ★**小窓テレビ**（★2026-10-01・R-28）: ★PC の大型ビジョン（`pc`）・★スマホのホーム（`full`・幅いっぱいの 16:9）・★スマホのほかの画面（`s`・S 型 98px）。
   *   ★帯を単独では出さない（★「次」と掲示板は テレビの上下の帯へ・README §1）。★`text` の画面（★そのレースの 1 行）は 従来どおり。
   */
  /** ★出走馬の詳しい形（★1 レースにつき 1 回だけ読む・★締切の後＝出走馬が決まってから） */
  const [profiles, setProfiles] = useState<{ readonly id: string; readonly map: ReadonlyMap<number, FieldProfile> } | null>(null);
  const fieldReady = (data?.nextField.length ?? 0) > 0;
  const profilesId = profiles?.id ?? null;
  useEffect(() => {
    if (tvMode === null || nextId === null || !fieldReady || profilesId === nextId) return undefined;
    let cancelled = false;
    fetchFieldProfiles(nextId).then((map) => { if (!cancelled) setProfiles({ id: nextId, map }); }, () => undefined);
    return () => { cancelled = true; };
  }, [tvMode, nextId, fieldReady, profilesId]);
  /**
   * ★**自分の馬の馬番**（★次と直前のレース・★2026-10-01 オーナー決定・裁定 R28 第 1 段 §1）。★帯は ログインの口に触れない（★`fetchMyGates` の 1 か所）。
   *   ★わからない間は 空（★自分の馬の言葉を出さない）。
   */
  const [myGates, setMyGates] = useState<{ readonly key: string; readonly set: ReadonlySet<string> } | null>(null);
  const recentIdForMine = recent?.id ?? null;
  const mineKey = `${nextId ?? ''}|${recentIdForMine ?? ''}|${fieldReady ? 1 : 0}`;
  useEffect(() => {
    if (tvMode === null) return undefined;
    let cancelled = false;
    fetchMyGates([nextId ?? '', recentIdForMine ?? '']).then((set) => { if (!cancelled) setMyGates({ key: mineKey, set }); }, () => undefined);
    return () => { cancelled = true; };
  }, [tvMode, mineKey, nextId, recentIdForMine]);
  useEffect(() => {
    /** ★本編を読むのは ★表で決めた面だけ（★「大」の面・★「極小」「文字」は読まない） */
    if (!embedsHere || motionReduced || canPlay !== true) { setEmbed(null); return; }
    const target = preOpen && nextId !== null && nextStartAt !== null ? { id: nextId, startAt: nextStartAt }
      : openSoon && recentId !== null && recent ? { id: recentId, startAt: recent.scheduled_at } : null;
    if (target !== null && embeddedIdRef.current !== target.id) {
      embeddedIdRef.current = target.id;
      setEmbedNote(null);
      setEmbed({ ...target, live: false, sinceMs: nowRef.current ?? 0 });
    }
  }, [embedsHere, motionReduced, canPlay, openSoon, recentId, preOpen, nextId, nextStartAt]);
  /** ★開いたレースの窓が閉じても ★まだ始まっていなければ ★やめる（★先読みしたレースは まだ窓の前なので 閉じない） */
  const embedWindowOver = embed === null || nowMs === null ? false : replayWindowOver(embed.startAt, nowMs);
  useEffect(() => {
    const e = embedRef.current;
    if (!embedWindowOver || e === null || e.live) return;
    console.warn(`[race-strip] ${stripEmbedLog('late', null, Math.round(((nowRef.current ?? e.sinceMs) - e.sinceMs) / 1000))}`);
    setEmbedNote(STRIP_EMBED_FAILED_NOTE);
    setEmbed(null);
  }, [embedWindowOver]);
  const embedId = embed?.id ?? null;
  useEffect(() => {
    if (embedId === null) return undefined;
    const onMessage = (event: MessageEvent): void => {
      if (event.origin !== window.origin || !isStripEmbedMessage(event.data)) return;
      if (event.data.raceId !== embedId) return;
      if (event.data.type === 'playing') { setEmbed((e) => (e === null ? e : { ...e, live: true })); return; }
      if (event.data.type === 'error') {
        console.warn(`[race-strip] ${stripEmbedLog('error', event.data.detail, 0)}`);
        setEmbedNote(STRIP_EMBED_FAILED_NOTE);
      }
      setEmbed(null);
    };
    window.addEventListener('message', onMessage);
    const giveUp = window.setTimeout(() => { setEmbed(null); }, STRIP_EMBED_GIVE_UP_SEC * 1000);
    return () => { window.removeEventListener('message', onMessage); window.clearTimeout(giveUp); };
  }, [embedId]);
  const embedLive = embed?.live === true;
  /**
   * ★**「拡大」で見られるか**（★本編を読み込み中 か 流れている間・★録画の窓の中 か 本編が流れている間）。
   *   ★見られなくなったら ★拡大を閉じる（★横向きで自動で開いたものも）。
   */
  const watchable = embed !== null && (replaying || embedLive);
  /**
   * ★**拡大で 本編の箱を全画面にするのは ★本編が流れているときだけ**（★テレビのある面）。
   *   🔴 ★2026-10-02 オーナー「小窓では本馬場入場カウントダウンなのに 拡大すると『中継の準備をしています』」:
   *   ★発走前に本編を先読みしている間（`embed` は在るが まだ流れていない）に拡大すると ★空の本編の箱が全画面になっていた。
   *   ★テレビのある面は ★本編が流れ出すまで ★拡大したテレビ（`channelFullEl`）を出す。★流れ出したら ★同じ iframe の箱が全画面へ（★読み直さない）。
   *   ★テレビの無い面は 従来どおり（★本編の箱 ＋「用意をしています」）。
   */
  const stageFull = expanded && (embedLive || tvMode === null);
  /**
   * ★**停止スイッチで ★本編も止める**（★資料 §5-7・2026-09-28）。★停止は ★画面の状態（`.u-paused`）なので ★帯は DOM で見る。
   *   ★帯の時計（`nowMs`・250ms）ごとに見て、★変わったときだけ ★iframe へ知らせる。
   */
  const sectionRef = useRef<HTMLElement | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [sitePaused, setSitePaused] = useState(false);
  useEffect(() => { setSitePaused(sectionRef.current?.closest('.u-paused') != null); }, [nowMs]);
  useEffect(() => {
    if (!embedLive) return;
    iframeRef.current?.contentWindow?.postMessage(stripControlMessage(sitePaused ? 'pause' : 'resume'), window.origin);
  }, [sitePaused, embedLive]);
  /** ★拡大したら 本編に知らせる（★札・テロップを出す・★小さいままでは出さない） */
  useEffect(() => {
    if (embed === null) return;
    iframeRef.current?.contentWindow?.postMessage(stripControlMessage(stageFull ? 'expand' : 'shrink'), window.origin);
  }, [stageFull, embedLive, embed]);
  useEffect(() => {
    replayingRef.current = watchable;
    /**
     * ★2026-10-01: ★レースが終わっても ★手で開いた拡大は閉じない（★本編が無くなったら ★テレビの番組を全画面で出す）。
     *   ★横向きで自動で開いたものだけ 閉じる（★条件 3）。
     */
    if (!watchable && autoOpenedRef.current) { autoOpenedRef.current = false; closeExpandedRef.current(); }
  }, [watchable]);
  /** ★全画面を抜けたら（★端末の戻る・Esc・ブラウザの操作）★小窓に戻す（★状態をずらさない） */
  useEffect(() => {
    const onChange = (): void => { if (document.fullscreenElement === null && enteredFullscreenRef.current) { enteredFullscreenRef.current = false; closeExpandedRef.current(); } };
    document.addEventListener('fullscreenchange', onChange);
    return () => { document.removeEventListener('fullscreenchange', onChange); };
  }, []);
  /** ★拡大した全画面のテレビの倍率（★画面の大きさから・★縦持ちで全画面に入れない端末は 90 度回す） */
  const [fullTv, setFullTv] = useState<{ readonly scale: number; readonly rotate: boolean; readonly land: boolean; readonly stageW: number | null; readonly portrait: boolean }>({ scale: 1, rotate: false, land: false, stageW: null, portrait: false });
  useEffect(() => {
    if (!expanded) return undefined;
    const fit = (): void => {
      const coarse = window.matchMedia('(pointer: coarse)').matches;
      /**
       * ★**横に持った携帯は 見出しの 64px を取らない**（★2026-10-02 オーナー「iPhone 実機で 拡大して横向きにしても 画面中央で横向きになるだけ」）。
       *   ★iPhone は ★全画面（Fullscreen API）に入れない ＋ ★横では高さが 330px 前後しか無い → ★64px を引くと 6 割の大きさで真ん中に出ていた。
       *   ★横の携帯は ★高さを全部使い、★「小窓に戻す」は ★映像の上に重ねる（★CSS `.u-tv-full-land`）。
       */
      const land = coarse && window.innerWidth > window.innerHeight;
      const vw = window.innerWidth, vh = window.innerHeight - (land ? 0 : 64);
      const rotate = vh > vw && coarse;
      /**
       * ★**拡大した本編の横幅も ここで決める**（★2026-10-02 オーナー iPhone 実機「拡大画面でレース前の TV は画面いっぱい・レースが始まると急に小さくなる」）。
       *   ★旧: ★CSS の `100dvh` で決めていた → ★`dvh` を知らない Safari では ★宣言ごと無効になり ★幅 100%（約 300px）に落ちた。
       *   ★テレビ（上の `scale`）は JS で決めていたので 大きいままだった。★本編も JS で決める（★CSS の値は 予備として残す）。
       *   ★縦（高さ ≧ 幅）では ★CSS が 90 度回すので ★幅は 高さ側で決める（★CSS の `orientation: portrait` と同じ境目）。
       */
      const H = window.innerHeight, W = window.innerWidth, head = land ? 0 : 64;
      /** ★回すかも ★ここで決める（★幅と回転を 同じ判定で・★CSS は `u-stage-rot` を見る） */
      const portrait = H >= W;
      const stageW = portrait ? Math.min(H - head, W * 16 / 9) : Math.min(W, (H - head) * 16 / 9);
      setFullTv({ land, rotate, portrait, scale: rotate ? Math.min(vh / 406, vw / 228) : Math.min(vw / 406, vh / 228), stageW: Math.floor(stageW) });
    };
    fit();
    window.addEventListener('resize', fit);
    return () => { window.removeEventListener('resize', fit); };
  }, [expanded]);

  const leader = leaderOf(replayRows);
  /**
   * ★「大」の箱: ★本編を流す面（/home・観戦）は ★本編が流れている間だけ・★それ以外の「大」は ★録画の窓の間 簡易版の走行
   *   （★決裁 ④・レビュー側の決定 2026-09-28。★オーナーは /home で簡易版を「間違っているレース映像」と言ったので ★/home では出さない）。
   */
  /** ★「大」の箱は ★本編が流れているときだけ（★簡易版の走行は出さない・2026-09-29） */
  const big = size === 'big' && embedsHere && embedLive;
  /**
   * ★④ **結果の一時強調**（★仕様 §2）: ★録画が終わった直後の 7 秒、★枠を EP 色にして ★1 着を大きく出し、★帯へ戻る。
   *   ★出すのは ★直近の 1 本だけ（★「同時は最新のみ・積み上げない」）。★着順は ★記録の値（`finishPosition`）。
   */
  const winner = data?.runners.find((runner) => runner.finishPosition === 1) ?? null;
  /** ⚠️ ★本編を流している間は ★出さない（★着順を 映像より先に明かさない） */
  const resulting = !replaying && !embedLive && recent !== null && recent !== undefined && nowMs !== null && winner !== null
    && replayResultShowing(recent.scheduled_at, nowMs);

  /** ★流れる 1 行を出すか（★「大」で ★次のレースが読めていれば ★いつも）・★録画中に頭へ置く 1 項目 */
  const tickerOn = size === 'big' && next !== null && next !== undefined && data !== null && nowMs !== null;
  /**
   * ★［先頭］の札（★R-20「(13) R12290 ・ ○○」）。★確定タイムから逆算した位置の先頭（★本編が流れている間は ★映像と食い違うので出さない）。
   */
  const leaderCard = replaying && !embedLive && recent && data && leader !== null
    ? boardCard('先頭', `${recent.name} ・ ${leader.name}`, { no: leader.gate, bracket: bracketOrNull(leader.gate, data.runners.length) })
    : null;

  /** ★ビジョンの 1 段目に出す ★いま流れているレース（★本編の iframe の レース ID で引く・★先読みした次のレースも） */
  const airRace: RaceNoticeRow | null = embedLive && embed !== null
    ? (embed.id === next?.id ? next : embed.id === recent?.id ? recent ?? null : null)
    : replaying && recent ? recent : null;

  /** ★小窓テレビの中身（★時計は帯の `nowMs`・★本編が上に重なっている間は 上の帯に「● 中継」） */
  /**
   * ★**拡大したテレビ**（★本編が無い間・★2026-10-01）: ★同じ番組を ★PC の大きさで描いて 画面いっぱいに拡げる。
   *   ★本編がある間は ★本編の箱（`stageEl`）が全画面になる（★こちらは出さない）。
   */
  const channelFullEl = expanded && !stageFull && tvMode !== null && nowMs !== null ? <div className={`u-tv-full${fullTv.land ? ' u-tv-full-land' : ''}${fullTv.rotate ? ' u-tv-full-rot' : ''}`} role="dialog" aria-modal aria-label="中継番組">
    <div className="u-tv-full-head">
      <strong>馬物語ch</strong>
      <button type="button" onClick={closeExpanded} aria-label="小窓に戻す">小窓に戻す</button>
    </div>
    <div className={`u-tv-full-screen${fullTv.rotate ? ' u-tv-full-rotate' : ''}`} style={{ '--tv-full-scale': String(fullTv.scale) } as React.CSSProperties}>
      <StripChannel
        size="pc" nowMs={nowMs} next={next ?? null}
        recent={recent ? { name: recent.name, status: recent.status } : null}
        recentRunners={data?.runners ?? []} recentId={recent?.id ?? null} field={data?.nextField ?? []}
        myGates={myGates !== null && myGates.key === mineKey ? myGates.set : null}
        profiles={profiles !== null && profiles.id === nextId ? profiles.map : null}
        reducedMotion={motionReduced} onAir={false} hires />
    </div>
  </div> : null;
  const channelEl = tvMode !== null && nowMs !== null ? <StripChannel
    size={tvMode === 'pc' ? 'pc' : 'sp'} nowMs={nowMs} next={next ?? null}
    recent={recent ? { name: recent.name, status: recent.status } : null}
    recentRunners={data?.runners ?? []} recentId={recent?.id ?? null} field={data?.nextField ?? []}
    myGates={myGates !== null && myGates.key === mineKey ? myGates.set : null}
    profiles={profiles !== null && profiles.id === nextId ? profiles.map : null}
    reducedMotion={motionReduced} onAir={big} /> : null;
  /** ★本編の箱（★1 つだけ作る・★ビジョンでも スマホのテレビでも 同じ要素） */
  const stageEl = <>{embed !== null && <div className={`u-race-strip-stage${big || stageFull ? '' : ' u-race-strip-stage-offscreen'}${embedLive ? ' u-race-strip-stage-live' : ''}${stageFull && fullTv.stageW !== null ? (fullTv.portrait ? ' u-stage-js u-stage-rot' : ' u-stage-js') : ''}${stageFull ? ' u-race-strip-stage-full' : ''}`}
        {...(stageFull && recent ? { role: 'dialog', 'aria-modal': true, 'aria-label': `${recent.name}のレース中継` } : {})}
        style={stageFull && fullTv.stageW !== null ? { '--stage-w': `${fullTv.stageW}px` } as React.CSSProperties : undefined}>
        {/* ★本編（★`playing` まで 見えないまま読み込む・★触れない） */}
        <iframe ref={iframeRef} className="u-race-strip-embed" data-live={embedLive ? 'true' : 'false'}
          src={stripEmbedUrl(embed.id)} title="レースの中継" tabIndex={-1} />
        {/* ★映像の左上に「録画」札を 1 つ（★DOM・★本編の長い札は小窓では消した・★R-19 回答 Q1） */}
        {big && embedLive && !stageFull && <span className="u-race-strip-stage-rec" aria-hidden>中継</span>}
        {stageFull && <div className="u-race-strip-stage-head">
          {/* ★「本編」と名乗らない（★条件 1）。★録画・結果から再現 */}
          <strong>{recent?.name ?? ''} · 中継</strong>
          <button type="button" onClick={closeExpanded} aria-label="小窓に戻す">小窓に戻す</button>
        </div>}
        {stageFull && !embedLive && <p className="u-race-strip-stage-wait" role="status">中継の用意をしています…</p>}
      </div>}</>;
  if (size === 'hidden') return null;
  /** ★`text`: ★その画面のレースの 1 行だけ（★走行・拡大・他のレースは出さない） */
  if (size === 'text' && tvMode === null) {
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

  /**
   * ★**スマホの小窓テレビ**（★R-28 D28-1・README §2）: ★全ての画面で 幅いっぱいの 16:9（★2026-10-01 オーナー「全てのページで同じサイズに」・★S 型はやめた）。
   *   ★閉じる・小さくする口は 作らない（★出し入れしない）。★本編が流れていれば ★押すと全画面（★いまの「拡大」と同じ）。
   */
  if (tvMode === 'full') {
    return (
      <section ref={sectionRef} aria-label="レースの開催情報" className={`u-race-strip u-tvstrip u-tvstrip-${tvMode}${expanded ? ' u-race-strip-expanded' : ''}`}>
        <div className="u-tvstrip-screen"
          {...(!expanded ? { role: 'button', tabIndex: 0, 'aria-label': '小窓を全画面で観る', onClick: openExpanded,
            onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') openExpanded(); } } : {})}>
          {channelEl}
          {stageEl}
        </div>
        {/* ★「拡大」は ★画面の外（★下の段の右）。★画面に重ねると 番組の文字に被る（★2026-10-02 オーナー「拡大ボタンが色々な文字の上に被っています」） */}
        {!expanded && <button type="button" className="u-tvstrip-expand" onClick={(e) => { e.stopPropagation(); openExpanded(); }}>拡大</button>}
        {channelFullEl}
        {error && <span className="u-race-strip-error">更新できません</span>}
        {size === 'big' && embedNote !== null && <span className="u-race-strip-error" role="status">{embedNote}</span>}
        {(replaying ? recent : next) && <a href={`/races/${encodeURIComponent((replaying ? recent : next)!.id)}`} aria-label={`${(replaying ? recent : next)!.name}の詳細を見る`}>詳細</a>}
      </section>
    );
  }

  return (
    <section ref={sectionRef} aria-label="レースの開催情報" className={`u-race-strip${compact ? ' u-race-strip-compact' : ''}${replaying ? ' u-race-strip-replaying' : ''}${big || (resulting && size === 'big') ? ' u-race-strip-big' : ''}${resulting ? ' u-race-strip-result' : ''}${expanded ? ' u-race-strip-expanded' : ''}${vision ? ' u-race-strip-vision' : ''}`}>
      {/*
        ★**大型ビジョンの 1 段目**（★PC だけ・§1-4「赤い点 ＋ 中継 ＋ 条件」）。★中身は ★帯が もう持っている値だけ（★新しい読み込みは無い）。
        ⚠️ ★見本の右端「残り 600m」は ★出さない: ★帯が持つ進み具合は ★確定タイムからの逆算で、★流れている本編の位置と食い違う（★先頭の札を本編の間は出さないのと同じ理由）。
      */}
      {vision && channelEl === null && <VisionHead air={airRace} next={next ?? null} status={status}
        runners={airRace !== null && airRace.id === recent?.id ? data?.runners.length ?? 0 : 0}
        left={next && next.status === 'scheduled' && nowMs !== null ? salesLeftText(next.scheduled_at, nowMs) : null} />}
      {/* ★「大」150px（★一覧・閲覧の画面）。★同じ枠が伸びます（★§2: 別要素への切替ではない） */}
      {/*
        ★同じ箱のまま ★窓の前は画面の外に置く（★箱を差し替えると iframe が作り直され ★読み込みが最初からになる）。
      */}
      {/*
        ★**簡易版の走行（side-v8 の横並び）は 出しません**（★2026-09-28・オーナー「間違っているレース映像が未だに流れています」）。
        ★本編の用意ができるまでは ★箱を出さず（★文字の行と電光掲示板だけ）、★できたら ★本編だけを出す。
        ★「拡大」は ★同じ iframe を ★画面いっぱいに広げる（★読み直さない・★同じ進行位置のまま・★ページは移らない）。
      */}
      {/*
        ★**本編を流さない「大」の面は 簡易版の走行**（★side-v8・確定タイムから逆算した進行率・約 450KB・★決裁 ④）。
        ★本編の箱（下）とは ★別の要素（★1 つの面では どちらか一方しか出ない）。
      */}
      {stageEl}
      {resulting && size === 'big' && winner !== null && channelEl === null && <div className="u-race-result-box" role="status">
        <span className="u-race-result-place">1着</span>
        <span className="u-race-result-name">{winner.gate}番 {winner.name}</span>
      </div>}
      {/*
        ★**ビジョンの待ち時間**（★PC だけ・§1-4「画面の中に、直前の結果と次の発走」）。★本編が流れていない間 ★16:9 の画面を空けない。
        ★直前の結果は ★確定してから（★`lastResult`・★映像より先に勝ち馬を出さない）。★字は小窓の決まり（★11〜14px）。
      */}
      {/* ★**小窓テレビ**（★R-28・PC）: ★待ち時間の画面を ★中継番組に。★本編は この上に重なる（★同じ升） */}
      {vision && channelEl !== null && <div className="u-vision-tv">{channelEl}</div>}
      {vision && channelEl === null && !big && !(resulting && winner !== null) && <div className="u-vision-wait">
        {(replaying || embedLive) && recent
          ? <span className="u-vision-wait-row"><small>いま</small><b>{recent.name} レース中</b></span>
          : lastResult !== null && <span className="u-vision-wait-row"><small>直前の結果</small><b>{lastResult}</b></span>}
        {next
          ? <span className="u-vision-wait-row"><small>次の発走</small><b><span className="u-num u-vision-wait-time">{clock(next.scheduled_at)}</span> {next.name}</b></span>
          : <span className="u-vision-wait-row"><b>{status}</b></span>}
      </div>}
      <div className="u-race-strip-main">
        {resulting && recent && winner !== null ? <>
          <strong>{recent.name} 確定</strong>
          <span>1着 {winner.gate}番 {winner.name}</span>
        </> : (replaying || embedLive) && recent && data ? <>
          {/* ★「極小」22×16px（★フォームの画面）。★先頭の馬 1 頭だけ */}
          {/*
            ★「大」（★掲示板のある帯）は ★左端に「● 録画」の札を 1 つ（★動かさない・★R-20 Q1・★R-18 回答 🟡 #8 の「（録画）」をこの札で満たす）。
            ★レース名は ★掲示板の札が持つ。★「極小」は いまどおり「レース中（録画）」。
          */}
          {/* ★頭の語は 次のレースの札と揃える（★「いま:」／「次:」・2026-09-28 オーナー「録画 19:18 発走というのは？」・レビュー側「両方に頭を」） */}
          {tickerOn && <span className="u-race-strip-recbadge"><span className="u-race-strip-chiphead">いま:</span><i aria-hidden />中継</span>}
          {!tickerOn && <strong>{recent.name} レース中</strong>}
          {/* ★「（録画）」は ★別の枠にして ★縮めない（★極小でも必ず残す・R-18 回答 🟡 #8・生中継に見せない） */}
          {!tickerOn && <span className="u-race-strip-rec">（中継）</span>}
          {/* ★「大」は ★レース名と先頭を ★流れる 1 行に入れる（★下）。★ここに並べると 1 行に入らない */}
          {!compact && !tickerOn && <span title={raceLabel(recent)}>{raceLabel(recent)}</span>}
          {!compact && !tickerOn && leader !== null && <span className="u-race-strip-recent">先頭 {leader.gate}番 {leader.name}</span>}
        </> : tickerOn ? null : <>
          <strong>{next ? `${clock(next.scheduled_at)} ${status}` : status}</strong>
          {/* ★発売締切までの残り（★極小の「残り時間」・★発売中のレースだけ・★過ぎたら「投票は締め切りました」・2026-09-29） */}
          {next && next.status === 'scheduled' && nowMs !== null && salesLeftText(next.scheduled_at, nowMs) !== null
            && <span className="u-race-strip-recent">{salesLeftText(next.scheduled_at, nowMs)}</span>}
          {next && <span title={raceLabel(next)}>{raceLabel(next)}</span>}
          {recent && !compact && <span className="u-race-strip-recent">直近確定: {raceLabel(recent)}</span>}
        </>}
        {/*
          ★**流れる 1 行**（★2026-09-28・オーナー指示「ずっと動いているように」・★中身は暫定 `race-strip-ticker.ts`）。
          ★「大」の帯では ★待ち時間も・録画中も・結果の強調中も ★**同じ要素のまま**流し続けます（★差し替えると頭から流れ直す）。
          ★同じ文を 2 つ並べて ★切れ目なく繰り返す。★流す秒は ★頭数だけで決める（★数字の変化で速さが揺れて跳ばない）。
          ★停止スイッチ・「動きを減らす」では ★流さない（★CSS・資料 §5-7）。
        */}
        {/*
          ★**次のレースの名前と発走時刻は ★いつも出す**（★2026-09-28・オーナー「次のレースが何のタイトルのレースか？何時発走なのか？は常に出るように」）。
          ★掲示板の左に ★止まった札（★「● 録画」札と同じ形・★動かさない）。★掲示板は流れるので ★見たい時に無いことがあった。
        */}
        {tickerOn && next && <span className="u-race-strip-nextchip">
          <span className="u-race-strip-chiphead">次:</span>
          <span className="u-race-strip-nextchip-name">{next.name}</span>
          <span className="u-race-strip-nextchip-time">{clock(next.scheduled_at)}</span>
          <span className="u-race-strip-nextchip-unit">発走</span>
        </span>}
        {tickerOn && next && data && nowMs !== null
          && <StripBoard items={boardItemsOf(next, data, recent, nowMs, leaderCard)} label={`${next.name} ${status}`} />}
      </div>
      {error && <span className="u-race-strip-error">更新できません</span>}
      {/* ★録画を出せなかった理由（★黙って簡易版に戻らない） */}
      {size === 'big' && embedNote !== null && <span className="u-race-strip-error" role="status">{embedNote}</span>}
      {(watchable || tvMode !== null) && !expanded && <button type="button" className="u-race-strip-expand" onClick={openExpanded}>拡大</button>}
      {channelFullEl}
      {/* ★本編を流さない面は ★録画の間「観る」で 観戦の面へ（★決裁 ④「文字帯＋『観る』リンク」・★賭けの入口ではない） */}
      {replaying && !embedsHere && <a href="/watch-race" aria-label="いま走っているレースを観戦の画面で観る">観る</a>}
      {(replaying ? recent : next) && <a href={`/races/${encodeURIComponent((replaying ? recent : next)!.id)}`} aria-label={`${(replaying ? recent : next)!.name}の詳細を見る`}>詳細</a>}
    </section>
  );
}

/**
 * ★横向きの自動拡大の判定（★③ 段 A・条件 3）。★**縦 → 横** かつ ★**触る端末**でだけ `open`、★**横 → 縦** で `close`。
 *   ★PC（★触る端末でない）は ★どちらも返さない（★「拡大」を手で押す）。
 */
export function autoExpandOf(wasLandscape: boolean, isLandscape: boolean, coarsePointer: boolean): 'open' | 'close' | null {
  if (!coarsePointer || wasLandscape === isLandscape) return null;
  return isLandscape ? 'open' : 'close';
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
