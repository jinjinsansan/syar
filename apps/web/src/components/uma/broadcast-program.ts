/**
 * ★**小窓テレビの「中継番組」**（★2026-10-01・オーナー依頼・デザイナー引き渡し R-28 `out/r28/design_handoff_r28/README.md`・裁定 `REVIEW_R28_CHANNEL_CANON_VERDICT_20261001.md`）。
 *
 * 【★ここがすること】
 *   ★いつ（★発走までの秒）・何を（★12 番組のどれ・何ページ目・どの馬）流すかを ★時刻だけから決める（★編成表 §3）。
 *   ★番組の中身（★実況の文・競馬場とコースの言葉）を ★データから組み立てる。
 *   ★純粋関数（★時刻は引数・DB も画面も触らない・憲法 4）。★見た目は `channel-tv.tsx`。
 *
 * 【★裁定の条件】
 *   ★オッズの札は ★掲示板（`race-strip-ticker.ts` の `tickerBoard`）と ★**同じ関数**を通す（★写さない・D-052）。
 *     ★「大穴」の札・払戻の見込み額・予想を勧める言葉は ★足さない（L-8・2026-09-28 の裁定）。
 *   ★競馬場の説明は ★**コースの数字だけ**から作る（★実在の競馬場の歴史・名物・景色を書かない・D-125 ②・L-9）。
 *   ★素質の数値・強さを断定する言葉は ★出さない（§5.5）。
 */
import { PHASE_OFFSET_MS, type Venue } from '@star/scheduler';
import { tickerBoard, tickerShowsField, type BoardItem, type TickerRace, type TickerRunner } from './race-strip-ticker';

/** ★12 番組（★引き渡し §4 の名前）。★`race` は本編（★iframe 側が描く） */
export type ChannelShow =
  | 'ident' | 'result' | 'odds' | 'card' | 'paddock' | 'horse' | 'narr' | 'venue' | 'course' | 'going' | 'closing' | 'race';

/** ★実況の文の種類（★Q5: 9 種類・★文は `narrationText`） */
export type NarrKind = 'fieldSet' | 'favorite' | 'venue' | 'going' | 'starts' | 'closingSoon' | 'own' | 'stretch' | 'field';

/** ★番組表の 1 枠 */
export interface ChannelSlot {
  readonly show: ChannelShow;
  /** ★この枠の秒（★表はページで割る） */
  readonly sec: number;
  /** ★紹介・パドックの何頭目か（★`horseOrder` の並びの何番目・0 始まり） */
  readonly horseIndex?: number;
  readonly narr?: NarrKind;
}

/** ★編成表の段（★引き渡し §3） */
export interface ChannelBlock {
  /** ★1 周（6 分）の頭からの秒 */
  readonly from: number;
  readonly to: number;
  readonly label: '確定' | '公示' | '発売中' | '締切';
  readonly slots: readonly ChannelSlot[];
}

const n = (show: ChannelShow, sec: number, extra: Partial<ChannelSlot> = {}): ChannelSlot => ({ show, sec, ...extra });

/**
 * ★**編成表**（★引き渡し §3 の表そのまま）。★自分の馬が出るときの差し替えは `channelSlotAt`。
 *   ⚠️ ★巡回 2（180〜240）は ★表どおりに並べると 66 秒で ★1 分に入らない → ★240 秒で打ち切る（★紹介の 3 頭目が 2 秒で切れる）。
 */
export const CHANNEL_BLOCKS: readonly ChannelBlock[] = [
  { from: 0, to: 30, label: '確定', slots: [n('result', 30)] },
  { from: 30, to: 60, label: '公示', slots: [n('ident', 6), n('card', 18), n('narr', 6, { narr: 'fieldSet' })] },
  {
    from: 60, to: 180, label: '発売中', slots: [
      n('odds', 18), n('narr', 6, { narr: 'favorite' }), n('card', 18),
      n('horse', 8, { horseIndex: 0 }), n('horse', 8, { horseIndex: 1 }), n('horse', 8, { horseIndex: 2 }),
      n('narr', 6, { narr: 'starts' }),
      n('paddock', 6, { horseIndex: 0 }), n('paddock', 6, { horseIndex: 1 }), n('paddock', 6, { horseIndex: 2 }),
      n('venue', 10), n('course', 10), n('going', 6), n('narr', 4, { narr: 'going' }),
    ],
  },
  {
    from: 180, to: 240, label: '発売中', slots: [
      n('odds', 18), n('narr', 6, { narr: 'venue' }), n('card', 18),
      n('horse', 8, { horseIndex: 3 }), n('horse', 8, { horseIndex: 4 }), n('horse', 8, { horseIndex: 5 }),
    ],
  },
  {
    from: 240, to: 300, label: '発売中', slots: [
      n('paddock', 6, { horseIndex: 3 }), n('paddock', 6, { horseIndex: 4 }), n('paddock', 6, { horseIndex: 5 }),
      n('odds', 18), n('narr', 6, { narr: 'closingSoon' }), n('card', 12), n('narr', 6, { narr: 'stretch' }),
    ],
  },
  { from: 300, to: 360, label: '締切', slots: [n('closing', 60)] },
];

/** ★表のページ送りの秒（★引き渡し §3「1 ページ 6 秒」・★動きを減らす設定は 9 秒 §5） */
export function tablePageSec(reducedMotion: boolean): number { return reducedMotion ? 9 : 6; }
/** ★1 ページの頭数（★スマホ 6・PC 12） */
export function tablePerPage(size: 'sp' | 'pc'): number { return size === 'pc' ? 12 : 6; }

/** ★いま流す 1 枠（★`channelSlotAt` の答え） */
export interface ChannelNow {
  readonly show: ChannelShow;
  readonly label: ChannelBlock['label'];
  /** ★表のページ（★1 始まり）と 全ページ数 */
  readonly page: number;
  readonly pages: number;
  readonly horseIndex: number | null;
  readonly narr: NarrKind | null;
  /** ★この枠に入ってからの秒（★切り替えの帯を出す 0.45 秒を数える） */
  readonly sinceSec: number;
  /** ★枠が変わると変わる鍵（★切り替えの検出） */
  readonly key: string;
}

/**
 * ★**いま何を流すか**（★1 周の頭からの秒 `t`）。
 *   ★自分の馬が出るなら ★公示の後の実況を「あなたの馬が出走します」に替える（★§3 末尾）。★紹介の並びの先頭に自分の馬を置くのは `horseOrder`。
 */
export function channelSlotAt(t: number, opts: {
  readonly fieldSize: number; readonly size: 'sp' | 'pc'; readonly reducedMotion: boolean; readonly hasOwn: boolean;
}): ChannelNow {
  const cycleSec = PHASE_OFFSET_MS.start / 1000;
  const tt = Math.min(Math.max(t, 0), cycleSec - 0.001);
  const block = CHANNEL_BLOCKS.find((b) => tt >= b.from && tt < b.to) ?? CHANNEL_BLOCKS[CHANNEL_BLOCKS.length - 1]!;
  let at = block.from;
  let index = block.slots.length - 1;
  for (let i = 0; i < block.slots.length; i += 1) {
    if (tt < at + block.slots[i]!.sec) { index = i; break; }
    at += block.slots[i]!.sec;
  }
  const slot = block.slots[index]!;
  const sinceSec = tt - at;
  const isTable = slot.show === 'odds' || slot.show === 'card';
  const pages = isTable ? Math.max(1, Math.ceil(opts.fieldSize / tablePerPage(opts.size))) : 1;
  const page = isTable ? Math.floor(sinceSec / tablePageSec(opts.reducedMotion)) % pages + 1 : 1;
  const narr = slot.narr === 'fieldSet' && opts.hasOwn ? 'own' : slot.narr ?? null;
  return {
    show: slot.show, label: block.label, page, pages,
    horseIndex: slot.horseIndex ?? null, narr, sinceSec,
    key: `${block.from}:${index}:${page}`,
  };
}

/** ★次のレースの発走時刻から ★1 周の頭からの秒（★サーバーの境目 `PHASE_OFFSET_MS` と同じ尺）。★1 周より先・過ぎたら `null` */
export function cycleSecOf(nowMs: number, scheduledAtMs: number): number | null {
  if (!Number.isFinite(scheduledAtMs)) return null;
  const left = scheduledAtMs - nowMs;
  if (left <= 0 || left > PHASE_OFFSET_MS.start) return null;
  return (PHASE_OFFSET_MS.start - left) / 1000;
}

/** ★出走馬（★番組が使う形）。★読めない項目は `null`（★埋めない） */
export interface ChannelRunner extends TickerRunner {
  readonly horseId: string | null;
  /** ★脚質（★DB の値 `nige` など・★言葉は画面の側の表） */
  readonly strategy: string | null;
  readonly weight: number | null;
  readonly popularity: number | null;
  readonly isMine: boolean;
  /** ★戦績（★出走・勝ち）と最近の着順（★新しい順・最大 5） */
  readonly starts: number | null;
  readonly wins: number | null;
  readonly recent: readonly number[] | null;
}

/** ★紹介・パドックの並び（★自分の馬が先頭・あとは馬番の順） */
export function horseOrder<T extends { readonly gate: number; readonly isMine: boolean }>(runners: readonly T[]): readonly T[] {
  return [...runners].sort((a, b) => Number(b.isMine) - Number(a.isMine) || a.gate - b.gate);
}

/** ★馬場状態（★`races.track_condition`・★4 段の並び） */
export const GOING_STEPS: readonly { readonly id: string; readonly label: string }[] = [
  { id: 'good', label: '良' }, { id: 'yielding', label: '稍重' }, { id: 'soft', label: '重' }, { id: 'bad', label: '不良' },
];
export function goingLabel(id: string | null): string | null {
  return GOING_STEPS.find((g) => g.id === id)?.label ?? null;
}
export const surfaceLabel = (s: string): string => (s === 'turf' ? '芝' : s === 'dirt' ? 'ダート' : s);

/**
 * ★**競馬場の数字の札 3 つと 1 文**（★引き渡し §4-8・★数字だけから作る 1 文）。
 *   ⚠️ ★場名のほかに 固有の言葉を足さない（★D-125 ②: 名前の近さに特徴の一致を重ねない）。
 */
export function venueFacts(venue: Venue): { readonly stats: readonly { readonly k: string; readonly v: string; readonly u: string }[]; readonly sentence: string } {
  const turn = venue.turn === 'left' ? '左' : '右';
  return {
    stats: [
      { k: '1 周', v: venue.lapM.toLocaleString('ja-JP'), u: 'm' },
      { k: '最後の直線', v: String(venue.homeStretchM), u: 'm' },
      { k: '回り', v: turn, u: '' },
    ],
    sentence: `1 周 ${venue.lapM.toLocaleString('ja-JP')}m の${turn}回り。最後の直線は ${venue.homeStretchM}m。`,
  };
}

/** ★1 周を ★ホームの直線・角 2 つ・向こう正面・角 2 つ に分けた長さ（★角は `(1 周 − 直線 2 本) ÷ 4`・`course.ts` の作りと同じ） */
function sectionsOf(venue: Venue): { readonly stretch: number; readonly corner: number } {
  return { stretch: venue.homeStretchM, corner: (venue.lapM - venue.homeStretchM * 2) / 4 };
}

/**
 * ★**コースの説明の 3 行**（★引き渡し §4-9・Q1 への答え）。★距離と 1 周の長さだけから。
 *   ★周回: 1 周未満／1 周とすこし（1.0〜1.3）／2 周近く（1.3〜2.0）／2 周以上。
 *   ★コーナー: ★ゴールから戻りながら 角の中ほどを何回またぐか。★発走の位置: ★ゴールから距離ぶん戻った所。
 */
export function courseLines(venue: Venue, distance: number): readonly string[] {
  const laps = distance / venue.lapM;
  const lapText = laps < 1 ? `1 周未満（約 ${laps.toFixed(1)} 周）`
    : laps < 1.3 ? `1 周とすこし（約 ${laps.toFixed(1)} 周）`
      : laps < 2 ? `2 周近く（約 ${laps.toFixed(1)} 周）` : `2 周以上（約 ${laps.toFixed(1)} 周）`;
  return [lapText, `コーナーは ${cornersPassed(venue, distance)} つ`, `スタートは${startSideOf(venue, distance)}`];
}

function startSideOf(venue: Venue, distance: number): string {
  const { stretch, corner } = sectionsOf(venue);
  const back = distance % venue.lapM;
  if (back <= stretch) return 'ホームの直線';
  if (back <= stretch + corner * 2) return '3〜4 コーナー';
  if (back <= stretch * 2 + corner * 2) return '向こう正面';
  return '1〜2 コーナー';
}

function cornersPassed(venue: Venue, distance: number): number {
  const { stretch, corner } = sectionsOf(venue);
  const mids = [stretch + corner * 0.5, stretch + corner * 1.5, stretch * 2 + corner * 2.5, stretch * 2 + corner * 3.5];
  let count = 0;
  for (let lapStart = 0; lapStart < distance; lapStart += venue.lapM) {
    for (const m of mids) if (lapStart + m <= distance) count += 1;
  }
  return count;
}

/** ★実況の 1 枚の上限（★引き渡し §7「全角 36 文字・2 行まで」） */
export const NARR_MAX_CHARS = 36;

export interface NarrContext {
  readonly race: { readonly name: string; readonly surface: string; readonly distance: number };
  readonly venue: Venue | null;
  readonly going: string | null;
  readonly runners: readonly ChannelRunner[];
}

/** ★1番人気（★掲示板と同じ規則: 単勝が最も低い 1 頭・同じなら馬番の小さいほう） */
function favoriteOf(runners: readonly ChannelRunner[]): ChannelRunner | null {
  const priced = [...runners].sort((a, b) => a.gate - b.gate).filter((r) => r.winOdds !== null);
  if (priced.length === 0) return null;
  return priced.reduce((best, r) => ((r.winOdds as number) < (best.winOdds as number) ? r : best));
}

/**
 * ★**実況の文**（★Q5: ★9 種類）。★文が組めない（★データが無い）ときは `null`（★`narrationFor` が別の文に替える）。
 *   ⚠️ ★予想を勧める語（狙い目・荒れる）・払戻の見込み・素質は ★書かない（L-8・§5.5）。
 */
export function narrationText(kind: NarrKind, ctx: NarrContext): string | null {
  const fav = favoriteOf(ctx.runners);
  const mine = ctx.runners.find((r) => r.isMine) ?? null;
  const course = `${surfaceLabel(ctx.race.surface)}${ctx.race.distance}m`;
  switch (kind) {
    case 'fieldSet': return ctx.runners.length > 0 ? `出走表が決まりました。${ctx.runners.length}頭が出走します。` : null;
    case 'own': return mine !== null ? `あなたの馬、${mine.gate}番${mine.name}が出走します。` : null;
    case 'favorite': return fav !== null && fav.winOdds !== null ? `1番人気は${fav.gate}番${fav.name}、単勝${fav.winOdds.toFixed(1)}倍です。` : null;
    case 'venue': return ctx.venue !== null ? `今日の舞台は${ctx.venue.name}、${course}です。` : `このレースは${course}です。`;
    case 'going': { const g = goingLabel(ctx.going); return g !== null ? `馬場状態は${g}です。` : null; }
    case 'starts': {
      const r = [...ctx.runners].sort((a, b) => a.gate - b.gate).find((x) => x.starts !== null) ?? null;
      if (r === null || r.starts === null) return null;
      return r.starts === 0 ? `${r.gate}番${r.name}は今日が初出走です。` : `${r.gate}番${r.name}は今日が${r.starts + 1}戦目です。`;
    }
    case 'closingSoon': return 'まもなく投票の締切です。';
    case 'stretch': return ctx.venue !== null ? `最後の直線は${ctx.venue.homeStretchM}m。${ctx.venue.turn === 'left' ? '左' : '右'}回りのコースです。` : null;
    case 'field': return ctx.runners.length > 0 ? `${ctx.race.name}、${ctx.runners.length}頭の争いです。` : null;
  }
}

/** ★実況の文が組めないときの代わり（★順に試す） */
const NARR_FALLBACK: readonly NarrKind[] = ['field', 'venue', 'stretch', 'going', 'favorite'];

/** ★1 枚の文（★36 字を超える分は切る・★超えない文だけを作っている） */
export function narrationFor(kind: NarrKind, ctx: NarrContext): string {
  for (const k of [kind, ...NARR_FALLBACK]) {
    const t = narrationText(k, ctx);
    if (t !== null) return [...t].slice(0, NARR_MAX_CHARS).join('');
  }
  return [...`${ctx.race.name}をお送りしています。`].slice(0, NARR_MAX_CHARS).join('');
}

/**
 * ★**オッズの札**（★掲示板と同じ関数 `tickerBoard` の「単勝」の札・★「1番人気」の条件を写さない）。
 *   ★出走馬が決まる前（`tickerShowsField` が偽）は 空。
 */
export function oddsBoard(race: TickerRace, runners: readonly TickerRunner[], nowMs: number, clock: (iso: string) => string): readonly BoardItem[] {
  if (!tickerShowsField(race.status)) return [];
  return tickerBoard(race, runners, nowMs, clock).filter((b) => b.kind === '単勝');
}

/**
 * ★**番組が出せるか**（★データが無い番組は ★出さない＝空の枠を見せない・`resolveShow` が代わりを選ぶ）。
 */
export interface ShowData {
  readonly fieldReady: boolean;
  readonly horses: number;
  readonly venue: boolean;
  readonly going: boolean;
  readonly result: boolean;
}
export function showAvailable(now: ChannelNow, d: ShowData): boolean {
  switch (now.show) {
    case 'odds': case 'card': return d.fieldReady;
    case 'paddock': case 'horse': return d.fieldReady && now.horseIndex !== null && now.horseIndex < d.horses;
    case 'venue': case 'course': return d.venue;
    case 'going': return d.going;
    case 'result': return d.result;
    default: return true;
  }
}

/**
 * ★**出せない番組の代わり**（★出走馬が決まっていれば実況、まだなら つなぎ）。★結果が無い確定の段も つなぎ。
 *   ★`narr` の代わりは 文が組める種類を `narrationFor` が選ぶ。
 */
export function resolveShow(now: ChannelNow, d: ShowData): ChannelNow {
  if (showAvailable(now, d)) return now;
  if (now.show === 'paddock' || now.show === 'horse') return { ...now, show: 'card', horseIndex: null, page: 1, pages: 1, key: `${now.key}:card` };
  if (now.show === 'result' && d.venue) return { ...now, show: 'venue', key: `${now.key}:venue` };
  return { ...now, show: d.fieldReady ? 'narr' : 'ident', narr: d.fieldReady ? 'field' : null, key: `${now.key}:alt` };
}
