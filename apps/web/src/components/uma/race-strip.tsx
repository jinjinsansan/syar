'use client';

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { usePathname } from 'next/navigation';
import { readClient } from '../../lib/supabase';
import { canPlayRealRace } from '../../lib/race-real-access';
import { StaleBuildNotice } from './stale-build-notice';
import { LABEL_ENTRY_CLOSE, LABEL_SALES_CLOSE, salesCloseAtMs, salesClosedAt, salesLeftText } from '../../lib/sales-close';
import { CLAIM_SALES_CLOSED } from '../../lib/claims';
import { parseReplayRunners, replayDisplayProgress, replayProgress, replayResultShowing, replayWindowNear, replayWindowOver, type ReplayRunner } from './race-replay';
import { RUN_VIEW_M, runCamera } from './race-camera';
import { INTRO_STAGES, stripEmbedsOn, stripSizeOf } from './race-strip-sizes';
import { STRIP_EMBED_FAILED_NOTE, STRIP_EMBED_GIVE_UP_SEC, STRIP_EMBED_LEAD_SEC, isStripEmbedMessage, stripControlMessage, stripEmbedLog, stripEmbedUrl } from './race-strip-embed';
import { BOARD_ITEM_SEC, boardText, bracketOrNull, raceLine, tickerBoard, tickerShowsField, type BoardItem, type TickerRunner } from './race-strip-ticker';
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
  readonly next: (RaceNoticeRow & { readonly entry_deadline_at: string | null }) | null;
  readonly recent: RaceNoticeRow | null;
  readonly runners: readonly ReplayRunner[];
  /** ★次のレースの出走馬と単勝（★締切の後だけ読む・★流れる 1 行 `race-strip-ticker.ts`） */
  readonly nextField: readonly TickerRunner[];
}

const COLUMNS = 'id, name, surface, distance, scheduled_at, status';
const REFRESH_MS = 15_000;

async function fetchNotice(): Promise<NoticeData> {
  const client = readClient();
  const [next, recent] = await Promise.all([
    client.from('races_public').select(`${COLUMNS}, entry_deadline_at`)
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
  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    const timer = window.setInterval(() => {
      if (reduce.matches || hostRef.current?.closest('.u-paused') != null || document.visibilityState !== 'visible') return;
      setStep((s) => s + 1);
    }, BOARD_ITEM_SEC * 1000);
    return () => { window.clearInterval(timer); };
  }, []);
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
      <span key={step} ref={bodyRef} className="u-race-strip-board-item" aria-hidden
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

function raceLabel(row: RaceNoticeRow): string {
  const surface = row.surface === 'turf' ? '芝' : row.surface === 'dirt' ? 'ダート' : row.surface;
  return `${row.name}・${surface}${row.distance}m`;
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
  const size = stripSizeOf(pathname, { intro });
  /** ★この面で 本編を流すか（★表 `race-strip-sizes.ts` が正本・★決裁 ④: /home と観戦の面だけ） */
  const embedsHere = stripEmbedsOn(pathname);
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
  const lastWinner = data?.runners.find((runner) => runner.finishPosition === 1) ?? null;
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
  const status = next?.status === 'announced' ? '出走登録受付中'
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
  const [embed, setEmbed] = useState<{ readonly id: string; readonly live: boolean; readonly sinceMs: number } | null>(null);
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
  useEffect(() => {
    /** ★本編を読むのは ★表で決めた面だけ（★それ以外の「大」は簡易版の走行・「極小」「文字」は読まない） */
    if (!embedsHere || motionReduced || canPlay !== true) { setEmbed(null); return; }
    if (openSoon && recentId !== null && embeddedIdRef.current !== recentId) {
      embeddedIdRef.current = recentId;
      setEmbedNote(null);
      setEmbed({ id: recentId, live: false, sinceMs: nowRef.current ?? 0 });
    }
  }, [embedsHere, motionReduced, canPlay, openSoon, recentId]);
  /** ★録画の窓が閉じても ★まだ始まっていなければ ★やめる（★読み込みが遅い端末で 小窓を待たせない） */
  useEffect(() => {
    const e = embedRef.current;
    if (!windowOver || e === null || e.live) return;
    console.warn(`[race-strip] ${stripEmbedLog('late', null, Math.round(((nowRef.current ?? e.sinceMs) - e.sinceMs) / 1000))}`);
    setEmbedNote(STRIP_EMBED_FAILED_NOTE);
    setEmbed(null);
  }, [windowOver]);
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
  useEffect(() => {
    replayingRef.current = watchable;
    if (!watchable) { setExpanded(false); autoOpenedRef.current = false; }
  }, [watchable]);

  const leader = leaderOf(replayRows);
  /**
   * ★「大」の箱: ★本編を流す面（/home・観戦）は ★本編が流れている間だけ・★それ以外の「大」は ★録画の窓の間 簡易版の走行
   *   （★決裁 ④・レビュー側の決定 2026-09-28。★オーナーは /home で簡易版を「間違っているレース映像」と言ったので ★/home では出さない）。
   */
  const big = size === 'big' && (embedsHere ? embedLive : replaying);
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
    <section ref={sectionRef} aria-label="レースの開催情報" className={`u-race-strip${compact ? ' u-race-strip-compact' : ''}${replaying ? ' u-race-strip-replaying' : ''}${big || (resulting && size === 'big') ? ' u-race-strip-big' : ''}${resulting ? ' u-race-strip-result' : ''}${expanded ? ' u-race-strip-expanded' : ''}`}>
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
      {big && !embedsHere && <div className="u-race-strip-stage">
        <RaceRun rows={replayRows} distance={recent?.distance ?? 0} motionReduced={motionReduced} />
      </div>}
      {embed !== null && <div className={`u-race-strip-stage${big || expanded ? '' : ' u-race-strip-stage-offscreen'}${embedLive ? ' u-race-strip-stage-live' : ''}${expanded ? ' u-race-strip-stage-full' : ''}`}
        {...(expanded && recent ? { role: 'dialog', 'aria-modal': true, 'aria-label': `${recent.name}のレース録画` } : {})}>
        {/* ★本編（★`playing` まで 見えないまま読み込む・★触れない） */}
        <iframe ref={iframeRef} className="u-race-strip-embed" data-live={embedLive ? 'true' : 'false'}
          src={stripEmbedUrl(embed.id)} title="レースの録画（確定した結果から再現）" tabIndex={-1} />
        {/* ★映像の左上に「録画」札を 1 つ（★DOM・★本編の長い札は小窓では消した・★R-19 回答 Q1） */}
        {big && embedLive && !expanded && <span className="u-race-strip-stage-rec" aria-hidden>録画</span>}
        {expanded && <div className="u-race-strip-stage-head">
          {/* ★「本編」と名乗らない（★条件 1）。★録画・結果から再現 */}
          <strong>{recent?.name ?? ''} · 録画・結果から再現</strong>
          <button type="button" onClick={() => { autoOpenedRef.current = false; setExpanded(false); }} aria-label="レース録画を閉じる">閉じる</button>
        </div>}
        {expanded && !embedLive && <p className="u-race-strip-stage-wait" role="status">録画の用意をしています…</p>}
      </div>}
      {resulting && size === 'big' && winner !== null && <div className="u-race-result-box" role="status">
        <span className="u-race-result-place">1着</span>
        <span className="u-race-result-name">{winner.gate}番 {winner.name}</span>
      </div>}
      <div className="u-race-strip-main">
        {resulting && recent && winner !== null ? <>
          <strong>{recent.name} 確定</strong>
          <span>1着 {winner.gate}番 {winner.name}</span>
        </> : (replaying || embedLive) && recent && data ? <>
          {/* ★「極小」22×16px（★フォームの画面）。★先頭の馬 1 頭だけ */}
          {compact && <span className="u-race-run-mini" aria-hidden>
            <span className="u-race-run-horse" style={{ inset: 0 }}><RunningHorse phase={0} motionReduced={motionReduced} /></span>
          </span>}
          {/*
            ★「大」（★掲示板のある帯）は ★左端に「● 録画」の札を 1 つ（★動かさない・★R-20 Q1・★R-18 回答 🟡 #8 の「（録画）」をこの札で満たす）。
            ★レース名は ★掲示板の札が持つ。★「極小」は いまどおり「レース中（録画）」。
          */}
          {/* ★頭の語は 次のレースの札と揃える（★「いま:」／「次:」・2026-09-28 オーナー「録画 19:18 発走というのは？」・レビュー側「両方に頭を」） */}
          {tickerOn && <span className="u-race-strip-recbadge"><span className="u-race-strip-chiphead">いま:</span><i aria-hidden />録画</span>}
          {!tickerOn && <strong>{recent.name} レース中</strong>}
          {/* ★「（録画）」は ★別の枠にして ★縮めない（★極小でも必ず残す・R-18 回答 🟡 #8・生中継に見せない） */}
          {!tickerOn && <span className="u-race-strip-rec">（録画）</span>}
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
      {watchable && <button type="button" className="u-race-strip-expand" onClick={() => { setExpanded(true); }}>拡大</button>}
      {/* ★本編を流さない面は ★録画の間「観る」で 観戦の面へ（★決裁 ④「文字帯＋『観る』リンク」・★賭けの入口ではない） */}
      {replaying && !embedsHere && <a href="/watch-race" aria-label="いま走っているレースを観戦の画面で観る">観る</a>}
      {(replaying ? recent : next) && <a href={`/races/${encodeURIComponent((replaying ? recent : next)!.id)}`} aria-label={`${(replaying ? recent : next)!.name}の詳細を見る`}>詳細</a>}
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
