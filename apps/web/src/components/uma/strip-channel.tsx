'use client';
/**
 * ★**常設帯の小窓テレビ**（★2026-10-01・R-28）。★帯（`race-strip.tsx`）が もう持っている値と、★出走馬の詳しい形（`channel-feed.ts`）から
 *   ★いま流す番組（`broadcast-program.ts`）を決めて ★`ChannelTv` に渡す。★新しい時計は持たない（★帯の `nowMs`）。
 */
import { useEffect, useRef, useState } from 'react';
import { venueById, type Venue } from '@star/scheduler';
import { formatRaceTime } from '../../lib/format';
import { salesCloseAtMs } from '../../lib/sales-close';
import { ChannelTv, type ChannelResultRow } from './channel-tv';
import {
  channelSlotAt, cycleSecOf, horseOrder, narrationFor, oddsBoard, ownRecentLine, resolveShow,
  type ChannelRunner,
} from './broadcast-program';
import type { FieldProfile } from './channel-feed';
import type { ReplayRunner } from './race-replay';
import { raceLine, type TickerRunner } from './race-strip-ticker';

export interface StripChannelRace {
  readonly id: string;
  readonly name: string;
  readonly surface: string;
  readonly distance: number;
  readonly scheduled_at: string;
  readonly status: string;
  readonly entry_deadline_at: string | null;
  readonly track_condition?: string | null;
  readonly course_id?: string | null;
}

export interface StripChannelProps {
  readonly size: 'sp' | 'pc';
  readonly nowMs: number;
  readonly next: StripChannelRace | null;
  readonly recent: { readonly name: string; readonly status: string } | null;
  /** ★直前のレースの着順（★確定してから・`race-strip.tsx` の `lastWinner` と同じ条件） */
  readonly recentRunners: readonly ReplayRunner[];
  readonly recentId: string | null;
  /**
   * ★自分の馬の馬番（★`<レース ID>:<馬番>`・`fetchMyGates` の 1 か所から・★わからなければ null）。
   *   ★自分の馬の言葉は ★ここに在るときだけ出す（★条件 3）。
   */
  readonly myGates: ReadonlySet<string> | null;
  readonly field: readonly TickerRunner[];
  readonly profiles: ReadonlyMap<number, FieldProfile> | null;
  readonly reducedMotion: boolean;
  /** ★本編が この箱の上に重なっている（★上の帯に「● 中継」） */
  readonly onAir: boolean;
  /**
   * ★**拡大したテレビ**（★PC の大きさで描いて 画面いっぱいへ拡げる）では ★馬の絵を 2 倍の表に（★2026-10-02 オーナー
   *   「拡大した時の馬の紹介の馬が 引き伸ばした感じで 小窓よりクオリティが悪い」: ★1 倍の絵（1 コマ 544px）を 2〜4 倍に引き伸ばしていた）。
   */
  readonly hires?: boolean;
}

const hhmm = (ms: number): string => {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
const mss = (sec: number): string => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
const clockOf = (iso: string): string => hhmm(new Date(iso).getTime());

function venueOf(id: string | null | undefined): Venue | null {
  if (id === null || id === undefined) return null;
  try { return venueById(id); } catch { return null; }
}

export function StripChannel(p: StripChannelProps): React.ReactElement {
  const next = p.next;
  const startMs = next === null ? Number.NaN : new Date(next.scheduled_at).getTime();
  const t = cycleSecOf(p.nowMs, startMs);
  const venue = venueOf(next?.course_id);
  const going = next?.track_condition ?? null;
  const runners: ChannelRunner[] = p.field.map((r) => {
    const pr = p.profiles?.get(r.gate) ?? null;
    return {
      ...r,
      horseId: pr?.horseId ?? null, strategy: pr?.strategy ?? null, weight: pr?.weight ?? null, popularity: pr?.popularity ?? null,
      isMine: next !== null && p.myGates?.has(`${next.id}:${r.gate}`) === true, starts: pr?.starts ?? null, wins: pr?.wins ?? null, recent: pr?.recent ?? null,
    };
  });
  const order = horseOrder(runners);
  const fieldReady = runners.length > 0;
  const settled = p.recent?.status === 'settled' && p.recentRunners.length > 0;
  const raw = channelSlotAt(t ?? 0, { fieldSize: runners.length, size: p.size, reducedMotion: p.reducedMotion, hasOwn: runners.some((r) => r.isMine) });
  const now = t === null ? { ...raw, show: 'ident' as const, key: 'none' }
    : resolveShow(raw, { fieldReady, horses: order.length, venue: venue !== null, going: going !== null, result: settled });

  /** ★切り替えの帯（★番組が変わった瞬間から 0.45 秒・★表のページ送りでは出さない） */
  const lastShow = useRef<string | null>(null);
  const [wipeKey, setWipeKey] = useState(0);
  const showKey = `${now.show}:${now.horseIndex ?? ''}:${now.narr ?? ''}`;
  useEffect(() => {
    if (lastShow.current !== null && lastShow.current !== showKey && !p.reducedMotion) setWipeKey((k) => k + 1);
    lastShow.current = showKey;
  }, [showKey, p.reducedMotion]);

  const raceForTv = next === null ? null : { name: next.name, surface: next.surface, distance: next.distance };
  const top3 = [...p.recentRunners].sort((a, b) => a.finishPosition - b.finishPosition).slice(0, 3);
  const result = settled && p.recent !== null ? {
    raceName: p.recent.name,
    rows: top3.map((r): ChannelResultRow => ({ pos: r.finishPosition, gate: r.gate, name: r.name, time: r.finishPosition === 1 ? formatRaceTime(r.finishSec) : null })),
    ownLine: ownRecentLine(p.recentRunners, p.recentId, p.myGates),
  } : null;
  const narration = next === null ? '' : narrationFor(now.narr ?? 'field', { race: raceForTv!, venue, going, runners });
  const left = Number.isFinite(startMs) ? Math.max(0, (startMs - p.nowMs) / 1000) : null;
  /** ★締切は ★`sales-close.ts` の 1 か所（★写さない） */
  const toClose = Number.isFinite(startMs) ? (salesCloseAtMs(startMs) - p.nowMs) / 1000 : null;
  const footR = p.onAir ? ''
    : now.label === '締切' || (toClose !== null && toClose <= 0) ? (left === null ? '' : mss(left))
      : toClose === null ? '' : `締切まで ${mss(toClose)}`;
  const footL = p.onAir ? '中継' : now.label;
  /** ★名前が距離で終わるなら足さない（★掲示板と同じ `raceLine`） */
  const footM = next === null ? '' : now.label === '確定' ? `次 ${next.name} ${clockOf(next.scheduled_at)} 発走` : raceLine(next, ' ');

  return <ChannelTv
    size={p.size} now={now} clockText={hhmm(p.nowMs)} race={raceForTv} venue={venue} going={going}
    runners={runners} order={order}
    odds={next === null ? [] : oddsBoard(next, p.field, p.nowMs, clockOf)}
    result={result} narration={narration}
    footL={footL} footM={footM} footR={footR} toStart={left === null ? '' : mss(left)}
    wipe={wipeKey > 0 && !p.reducedMotion && now.sinceSec < 0.45}
    onAir={p.onAir}
    hires={p.hires === true}
  />;
}
