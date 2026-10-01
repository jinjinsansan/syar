/**
 * ★**レースの間の「番組」のデータ**（★2026-10-01・オーナー依頼 ③・デザイナー依頼 R-28・裁定 `REVIEW_R28_CHANNEL_CANON_VERDICT_20261001.md`）。
 *
 * 【★ここがすること】
 *   ★小窓テレビ（★スマホの常設・PC の大型ビジョン）で ★レースとレースの間に流す番組の ★**中身だけ**を組み立てる。
 *   ★見た目・編成（★何秒ずつ・どの順）は ★デザイナーの回答待ち（R-28 D28-2）。★ここでは決めない。
 *   ★純粋関数（★時刻は引数・DB も画面も触らない・憲法 4）。
 *   ⚠️ ★**2026-10-01 時点で 画面からは まだ呼んでいません**（★R-28 の回答待ち）。★回答が来たら `race-strip.tsx` の待ちの面で呼ぶ。
 *
 * 【★裁定の条件】
 *   ★オッズの札は ★掲示板（`race-strip-ticker.ts` の `tickerBoard`）と ★**同じ関数**を通す（★写さない・D-052）。
 *     ★「大穴」の札・払戻の見込み額・予想を勧める言葉は ★足さない（L-8・2026-09-28 の裁定）。
 *   ★競馬場の説明は ★**コースの数字だけ**から作る（★実在の競馬場の歴史・名物・景色を書かない・D-125 ②・L-9）。
 */
import { PHASE_OFFSET_MS, venueById, type Venue } from '@star/scheduler';
import { tickerBoard, tickerShowsField, type BoardItem, type TickerRace, type TickerRunner } from './race-strip-ticker';

/** ★番組の種類（★デザイナーの編成表がこの中から並べる） */
export type ProgramKind = 'lastResult' | 'entries' | 'odds' | 'favorite' | 'course';

/** ★次のレースの段（★発走時刻からの逆算。★サーバーの `phaseAt` と同じ境目 `PHASE_OFFSET_MS`） */
export type ProgramPhase = 'settling' | 'publishing' | 'onSale' | 'closed' | 'unknown';

export function programPhaseOf(nowMs: number, scheduledAtMs: number): ProgramPhase {
  if (!Number.isFinite(scheduledAtMs)) return 'unknown';
  const t = PHASE_OFFSET_MS.start - (scheduledAtMs - nowMs);
  if (t < 0) return 'unknown';                     // ★1 周より先のレース（★まだ前のレースの周）
  if (t < PHASE_OFFSET_MS.publish) return 'settling';
  if (t < PHASE_OFFSET_MS.salesOpen) return 'publishing';
  if (t < PHASE_OFFSET_MS.salesClose) return 'onSale';
  return 'closed';
}

/** ★出馬表の 1 行（★馬番・馬名。★騎手・斤量は来たら足す） */
export interface ProgramEntry {
  readonly gate: number;
  readonly name: string;
}

/**
 * ★**競馬場の説明**（★数字だけ）。★1 行ずつの文字列。
 *   ⚠️ ★場名のほかに ★固有の言葉を足さない（★D-125 ②: 名前の近さに特徴の一致を重ねない）。
 */
export function courseFacts(venue: Venue, race: { readonly surface: string; readonly distance: number }): readonly string[] {
  const surface = race.surface === 'turf' ? '芝' : race.surface === 'dirt' ? 'ダート' : race.surface;
  const lines = [
    `${venue.name}`,
    `1 周 ${venue.lapM.toLocaleString('ja-JP')}m・${venue.turn === 'left' ? '左' : '右'}回り`,
    `最後の直線 ${venue.homeStretchM}m`,
    `コースの幅 ${venue.widthM}m`,
    `このレース ${surface}${race.distance}m`,
  ];
  /** ★距離が 1 周より長いときだけ（★何周するかは数字から言える） */
  if (race.distance > venue.lapM) lines.push(`${(race.distance / venue.lapM).toFixed(1)} 周`);
  return lines;
}

export interface ProgramInput {
  readonly nowMs: number;
  /** ★次のレース（★無ければ番組は直前の結果だけ） */
  readonly next: (TickerRace & { readonly venueId: string | null }) | null;
  readonly runners: readonly TickerRunner[];
  /** ★直前の結果の 1 行（★掲示板と同じ文） */
  readonly lastResult: string | null;
}

export interface ProgramSegment {
  readonly kind: ProgramKind;
  /** ★掲示板と同じ札（★オッズ・1番人気） */
  readonly board?: readonly BoardItem[];
  readonly entries?: readonly ProgramEntry[];
  readonly lines?: readonly string[];
  readonly text?: string;
}

/**
 * ★**いま流せる番組**（★順は仮・★デザイナーの編成表で並べ替える）。★データが無い番組は ★出さない（★空の枠を見せない）。
 *   ★出馬表・オッズは ★掲示板と同じ条件（`tickerShowsField`・★出走登録の締切の後）だけ（★それより前は出走馬が決まっていない）。
 */
export function programSegments(input: ProgramInput, clock: (iso: string) => string): readonly ProgramSegment[] {
  const out: ProgramSegment[] = [];
  if (input.lastResult !== null) out.push({ kind: 'lastResult', text: input.lastResult });
  const next = input.next;
  if (next === null) return out;
  if (next.venueId !== null) {
    let venue: Venue | null = null;
    try { venue = venueById(next.venueId); } catch { venue = null; }
    if (venue !== null) out.push({ kind: 'course', lines: courseFacts(venue, next) });
  }
  if (tickerShowsField(next.status) && input.runners.length > 0) {
    out.push({
      kind: 'entries',
      entries: [...input.runners].sort((a, b) => a.gate - b.gate).map((r) => ({ gate: r.gate, name: r.name })),
    });
    /** ★オッズの札は ★掲示板と同じ関数（★「1番人気」の条件・上限の書き方を写さない） */
    const odds = tickerBoard(next, input.runners, input.nowMs, clock).filter((b) => b.kind === '単勝');
    if (odds.length > 0) {
      out.push({ kind: 'odds', board: odds });
      const fav = odds.filter((b) => b.badge === '1番人気');
      if (fav.length > 0) out.push({ kind: 'favorite', board: fav });
    }
  }
  return out;
}
