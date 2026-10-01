'use client';
/**
 * ★**小窓テレビの中身**（★2026-10-01・デザイナー引き渡し R-28 `ChannelTV.dc.html`・★値は README §1・§4 の確定値）。
 *
 *   ★スマホの小窓（`sp`）と PC の大型ビジョン（`pc`）で ★同じ部品・★寸法だけが違う（★CSS `.u-tv[data-size]`）。
 *   ★何を流すかは ★`broadcast-program.ts`（★時刻から決める・純粋関数）。★ここは描くだけ。
 *   ★本編（`race`）は ★描かない（★`race-strip.tsx` の iframe を この箱の上に重ねる）。
 *
 * ⚠️ ★見本との違い（★デザイナーへの返答に書く）:
 *   ★実況の顔は ★いまの実況（川崎タカシ・イラストの版 `ti`）。★見本の `narrator-a` は ★もう読まない旧い絵（`narrator.ts`）。
 *   ★立ち姿の毛色は ★馬体の画素だけに焼く（`coated-image.ts`・★見本の CSS filter は 黒い膜になった方式）。
 *   ★性齢・騎手・父母は ★公開のデータに まだ無い → ★出さない（★埋めない）。
 */
import type { CSSProperties } from 'react';
import type { Venue } from '@star/scheduler';
import { coatOfHorseId } from '@star/render';
import { useCoatedImage } from './coated-image';
import { horseArt } from './uma-parts';
import { bracketOrNull } from './race-strip-ticker';
import {
  GOING_STEPS, courseLines, goingLabel, surfaceLabel, venueFacts,
  type ChannelNow, type ChannelRunner, type ChannelShow,
} from './broadcast-program';
import type { BoardItem } from './race-strip-ticker';
import { strategyLabel } from '../../lib/strategy-label';
import './channel-tv.css';

/** ★番組名（★上の帯・引き渡し `titles`） */
const SHOW_TITLE: Readonly<Record<ChannelShow, string>> = {
  ident: '発走前ナビ', result: '直前の結果', odds: 'オッズ表 ・ 単勝', card: '出馬表', paddock: 'パドック', horse: '出走馬の紹介',
  narr: '実況席から', venue: '今日の競馬場', course: 'コースの説明', going: '馬場状態', closing: '本馬場入場', race: '',
};
/** ★芝の背景の番組（★README §1「背景」）。★パドックと本編だけ暗幕なし */
const TURF_SHOWS: readonly ChannelShow[] = ['paddock', 'race', 'venue', 'course', 'going'];

/** ★枠の札（★R-20 と同じ色 `--f1`〜`--f8`・★白・黄・桃は黒い字） */
function gateStyle(gate: number, field: number): CSSProperties | undefined {
  const b = bracketOrNull(gate, field);
  return b === null ? undefined : { background: `var(--f${b})`, color: [1, 5, 8].includes(b) ? '#111' : '#fff' };
}

export interface ChannelResultRow { readonly pos: number; readonly gate: number; readonly name: string; readonly time: string | null }

export interface ChannelTvProps {
  readonly size: 'sp' | 'pc';
  readonly now: ChannelNow;
  /** ★上の帯の時刻（★HH:MM） */
  readonly clockText: string;
  /** ★次のレース（★無ければ つなぎだけ） */
  readonly race: { readonly name: string; readonly surface: string; readonly distance: number } | null;
  readonly venue: Venue | null;
  readonly going: string | null;
  readonly runners: readonly ChannelRunner[];
  /** ★紹介・パドックの並び（★`horseOrder`） */
  readonly order: readonly ChannelRunner[];
  readonly odds: readonly BoardItem[];
  readonly result: { readonly raceName: string; readonly rows: readonly ChannelResultRow[]; readonly ownLine: string | null } | null;
  readonly narration: string;
  /** ★下の帯（★段・次のレース・残り時間） */
  readonly footL: string;
  readonly footM: string;
  readonly footR: string;
  /** ★締切の段の「発走まで」 */
  readonly toStart: string;
  /** ★切り替えの帯（★0.45 秒・★動きを減らす設定では出さない） */
  readonly wipe: boolean;
  /** ★本編が この箱の上に重なっているか（★上の帯に「● 中継」） */
  readonly onAir: boolean;
  /** ★拡大したテレビ（★馬の絵を 2 倍の表に） */
  readonly hires?: boolean;
}

export function ChannelTv(p: ChannelTvProps): React.ReactElement {
  const show = p.onAir ? 'race' : p.now.show;
  const turf = TURF_SHOWS.includes(show);
  const field = p.runners.length;
  return (
    <div className="u-tv" data-size={p.size} data-show={show}>
      {turf ? <>
        <div className="u-tv-bg-turf" aria-hidden />
        <div className="u-tv-bg-pano" aria-hidden />
        {show !== 'paddock' && show !== 'race' && <div className="u-tv-bg-dim" aria-hidden />}
      </> : <div className="u-tv-bg-navy" aria-hidden />}

      {show !== 'race' && <div className="u-tv-body">
        {show === 'ident' && <Ident race={p.race} />}
        {show === 'result' && p.result !== null && <Result result={p.result} field={Math.max(field, ...p.result.rows.map((r) => r.gate))} />}
        {(show === 'odds' || show === 'card') && p.race !== null
          && <Table kind={show} size={p.size} now={p.now} runners={p.runners} odds={p.odds} race={p.race} />}
        {show === 'paddock' && p.now.horseIndex !== null && p.order[p.now.horseIndex] !== undefined
          && <Paddock horse={p.order[p.now.horseIndex]!} index={p.now.horseIndex} field={field} hires={p.hires === true} />}
        {show === 'horse' && p.now.horseIndex !== null && p.order[p.now.horseIndex] !== undefined
          && <HorseCard horse={p.order[p.now.horseIndex]!} field={field} hires={p.hires === true} />}
        {show === 'narr' && <Narr text={p.narration} />}
        {show === 'venue' && p.venue !== null && <VenueShow venue={p.venue} />}
        {show === 'course' && p.venue !== null && p.race !== null && <CourseShow venue={p.venue} race={p.race} />}
        {show === 'going' && <GoingShow going={p.going} venue={p.venue} race={p.race} />}
        {show === 'closing' && <Closing toStart={p.toStart} runners={p.runners} />}
      </div>}

      <div className="u-tv-head">
        <span className="u-tv-logo">馬物語ch</span>
        <span className="u-tv-title">{p.onAir ? (p.race === null ? '' : `${p.race.name}`) : SHOW_TITLE[show]}</span>
        {p.onAir && <span className="u-tv-onair"><i aria-hidden />中継</span>}
        <span className="u-tv-clock u-num">{p.clockText}</span>
      </div>
      <div className="u-tv-foot">
        <span className="u-tv-foot-l">{p.footL}</span>
        <span className="u-tv-foot-m">{p.footM}</span>
        <span className="u-tv-foot-r u-num">{p.footR}</span>
      </div>
      {p.wipe && <div className="u-tv-wipe" aria-hidden />}
    </div>
  );
}

function Ident({ race }: { readonly race: ChannelTvProps['race'] }): React.ReactElement {
  return <div className="u-tv-ident">
    <div className="u-tv-ident-plate">馬物語チャンネル</div>
    <div className="u-tv-ident-sub">発走前ナビ</div>
    {race !== null && <div className="u-tv-ident-next">このあと<span>{race.name}</span></div>}
  </div>;
}

function Result({ result, field }: { readonly result: NonNullable<ChannelTvProps['result']>; readonly field: number }): React.ReactElement {
  return <>
    <div className="u-tv-rowhead"><span className="u-tv-tag u-tv-tag-settled">確定</span><span className="u-tv-m">{result.raceName}</span></div>
    <div className="u-tv-podium">
      {result.rows.map((r) => <div key={r.pos} className={`u-tv-podium-row${r.pos === 1 ? ' u-tv-podium-first' : ''}`}>
        <span className="u-tv-pos u-num">{r.pos}<small>着</small></span>
        <span className="u-tv-gate u-num" style={gateStyle(r.gate, field)}>{r.gate}</span>
        <span className="u-tv-name">{r.name}</span>
        {r.time !== null && <span className="u-tv-time u-num">{r.time}</span>}
      </div>)}
      {/* ★自分の馬が出ていれば その馬の着順を 1 行（★§3） */}
      {result.ownLine !== null && <div className="u-tv-ownline">{result.ownLine}</div>}
    </div>
  </>;
}

function Table({ kind, size, now, runners, odds, race }: {
  readonly kind: 'odds' | 'card'; readonly size: 'sp' | 'pc'; readonly now: ChannelNow;
  readonly runners: readonly ChannelRunner[]; readonly odds: readonly BoardItem[]; readonly race: NonNullable<ChannelTvProps['race']>;
}): React.ReactElement {
  const per = size === 'pc' ? 12 : 6;
  const sorted = [...runners].sort((a, b) => a.gate - b.gate);
  const pages = Math.max(1, Math.ceil(sorted.length / per));
  const page = Math.min(now.page, pages);
  const rows = sorted.slice((page - 1) * per, page * per);
  const oddsByGate = new Map(odds.map((b) => [b.no, b]));
  return <>
    <div className="u-tv-rowhead">
      <span className="u-tv-tag">{kind === 'odds' ? '単勝' : '出馬表'}</span>
      <span className="u-tv-s u-tv-grow">{race.name} ・ {runners.length}頭</span>
      <span className="u-tv-page u-num">{page} / {pages}</span>
    </div>
    <div className="u-tv-table" key={`${kind}:${page}`}>
      {rows.map((r, i) => {
        const o = oddsByGate.get(r.gate);
        return <div key={r.gate} className={`u-tv-trow${i % 2 ? ' u-tv-trow-alt' : ''}`}>
          <span className="u-tv-gate u-num" style={gateStyle(r.gate, runners.length)}>{r.gate}</span>
          <span className="u-tv-name">{r.name}</span>
          {kind === 'odds' && o?.badge === '1番人気' && <span className="u-tv-fav">1番人気</span>}
          {kind === 'odds'
            ? <>{r.popularity !== null && <span className="u-tv-c1">{r.popularity}人気</span>}
              <span className="u-tv-c2 u-num">{o?.num ?? '—'}</span></>
            : <>{strategyLabel(r.strategy) !== null && <span className="u-tv-c1">{strategyLabel(r.strategy)}</span>}
              <span className="u-tv-c2 u-num">{r.weight === null ? '' : r.weight.toFixed(1)}</span></>}
        </div>;
      })}
    </div>
  </>;
}

/**
 * ★立ち姿 1 枚（★毛色は 馬体の画素だけ・★歩きの 8 コマは使わない・§6）。
 * 🔴 ★2026-10-01: ★見本の `train-body-idle`（★細身の別の絵柄）は ★ホームの馬と違う馬に見えた（オーナー指摘）→ ★ホーム・育成と同じ立ち姿 `horse-stand`。
 */
function StandingHorse({ horseId, sex, className, hires }: { readonly horseId: string | null; readonly sex: 'male' | 'female'; readonly className: string; readonly hires: boolean }): React.ReactElement {
  const url = useCoatedImage(horseArt(sex, 'stand', hires), coatOfHorseId(horseId ?? 'unknown'));
  return <div className={className} style={url === null ? undefined : { backgroundImage: `url('${url}')` }} />;
}

/**
 * ★**パドック**（★2026-10-02 オーナー「馬番の数字がゼッケンではないのにボディにあるため違和感」「パドックの時は馬を歩かせたい」・案 A）。
 *   ★馬は ★ホームと同じ 歩きの 8 コマ（★毛色は絵に焼く）・★その場で歩き ★芝が後ろへ流れる（★馬は右向き → 芝は左へ）。
 *   ★馬番は ★胴に乗せない（★ゼッケンに見えない札だった）→ ★左上に ★枠の色の札 ＋ 馬名。★斤量は右下に小さく。
 *   ★停止スイッチ・「動きを減らす」では ★立ち姿で止める（★CSS で歩きを隠す）。
 */
function Paddock({ horse, index, field, hires }: { readonly horse: ChannelRunner; readonly index: number; readonly field: number; readonly hires: boolean }): React.ReactElement {
  return <div className="u-tv-paddock">
    <WalkingHorse horseId={horse.horseId} sex={horse.sex === 'female' ? 'female' : 'male'} hires={hires} />
    <div className="u-tv-paddock-id">
      <span className="u-tv-paddock-gate u-num" style={gateStyle(horse.gate, field)}>{horse.gate}</span>
      <span className="u-tv-l">{horse.name}</span>
    </div>
    <span className="u-tv-paddock-count">パドック {index + 1} / {field}</span>
    {horse.weight !== null && <span className="u-tv-paddock-weight u-tv-s">斤量 {horse.weight.toFixed(1)}</span>}
  </div>;
}

/** ★歩く馬（★歩きの 8 コマ ＋ 止めるとき用の立ち姿。★どちらを見せるかは CSS） */
function WalkingHorse({ horseId, sex, hires }: { readonly horseId: string | null; readonly sex: 'male' | 'female'; readonly hires: boolean }): React.ReactElement {
  const coat = coatOfHorseId(horseId ?? 'unknown');
  const walk = useCoatedImage(horseArt(sex, 'walk', hires), coat);
  const stand = useCoatedImage(horseArt(sex, 'stand', hires), coat);
  return <div className="u-tv-paddock-horse">
    {/* ⚠️ ★`800% 100%` と ★`u-walk` ＋ `steps(8, jump-none)` は ★対（★ホームの OwnHorseFigure と同じ） */}
    <span className="u-tv-paddock-walk" style={walk === null ? undefined : { backgroundImage: `url('${walk}')` }} />
    <span className="u-tv-paddock-stand" style={stand === null ? undefined : { backgroundImage: `url('${stand}')` }} />
  </div>;
}

function HorseCard({ horse, field, hires }: { readonly horse: ChannelRunner; readonly field: number; readonly hires: boolean }): React.ReactElement {
  const strategy = strategyLabel(horse.strategy);
  return <div className="u-tv-horse">
    <div className="u-tv-horse-thumb">
      <StandingHorse horseId={horse.horseId} sex={horse.sex === 'female' ? 'female' : 'male'} className="u-tv-horse-art" hires={hires} />
      <span className="u-tv-gate u-num u-tv-horse-gate" style={gateStyle(horse.gate, field)}>{horse.gate}</span>
    </div>
    <div className="u-tv-horse-info">
      <div className="u-tv-l u-tv-name">{horse.name}</div>
      <div className="u-tv-chips">
        {horse.isMine && <span className="u-tv-chip u-tv-chip-own">あなたの馬</span>}
        {strategy !== null && <span className="u-tv-chip">{strategy}</span>}
        {horse.weight !== null && <span className="u-tv-chip">斤量 {horse.weight.toFixed(1)}</span>}
      </div>
      {horse.starts !== null && (horse.starts === 0
        ? <div className="u-tv-chips"><span className="u-tv-chip u-tv-chip-new">初出走</span></div>
        : <div className="u-tv-record"><small>戦績</small><b className="u-num">{horse.starts}</b><small>戦</small><b className="u-num">{horse.wins ?? 0}</b><small>勝</small></div>)}
      {horse.recent !== null && horse.recent.length > 0 && <div className="u-tv-recent"><small>最近</small>
        {horse.recent.map((pos, i) => <span key={i} className={`u-tv-recent-box u-num${pos === 1 ? ' u-tv-recent-win' : ''}`}>{pos}</span>)}
      </div>}
    </div>
  </div>;
}

function Narr({ text }: { readonly text: string }): React.ReactElement {
  return <div className="u-tv-narr">
    <div className="u-tv-narr-who">
      {/* ★口パク（★2026-10-02 オーナー「アニメの唇がおかしい」）: ★閉じた顔の上に ★開けた口の顔を 点滅させる（★止める設定では 閉じたまま） */}
      <div className="u-tv-narr-face" aria-hidden><span className="u-tv-narr-mouth" /></div>
      <div className="u-tv-narr-name">実況 川崎 タカシ</div>
    </div>
    <div className="u-tv-narr-bubble"><div className="u-tv-narr-text">{text}</div></div>
  </div>;
}

function VenueShow({ venue }: { readonly venue: Venue }): React.ReactElement {
  const f = venueFacts(venue);
  return <>
    <div className="u-tv-l">{venue.name}</div>
    <div className="u-tv-venue-stats">
      {f.stats.map((s) => <div key={s.k} className="u-tv-venue-stat"><small>{s.k}</small><span><b className="u-num">{s.v}</b>{s.u}</span></div>)}
    </div>
    <div className="u-tv-venue-line u-tv-s">{f.sentence}</div>
  </>;
}

function CourseShow({ venue, race }: { readonly venue: Venue; readonly race: NonNullable<ChannelTvProps['race']> }): React.ReactElement {
  return <div className="u-tv-course">
    <div className="u-tv-oval">
      <div className="u-tv-oval-goal" /><span className="u-tv-oval-goal-l">ゴール</span>
      <div className="u-tv-oval-start" /><span className="u-tv-oval-start-l">スタート</span>
      <span className="u-tv-oval-turn u-tv-s">{venue.turn === 'left' ? '← 左回り' : '右回り →'}</span>
    </div>
    <div className="u-tv-course-info">
      <div className="u-tv-l">{surfaceLabel(race.surface)} {race.distance}m</div>
      {courseLines(venue, race.distance).map((l) => <div key={l} className="u-tv-course-line u-tv-s"><i aria-hidden />{l}</div>)}
    </div>
  </div>;
}

function GoingShow({ going, venue, race }: { readonly going: string | null; readonly venue: Venue | null; readonly race: ChannelTvProps['race'] }): React.ReactElement {
  const label = goingLabel(going);
  return <>
    <div className="u-tv-s u-tv-sub">{venue?.name ?? ''}{race !== null ? ` ・ ${surfaceLabel(race.surface)}` : ''}</div>
    <div className="u-tv-going">
      {/* ★天気の札を左に足す枠（★データが来たら・README §4-10） */}
      <div className="u-tv-going-big"><small>馬場状態</small><b>{label ?? '—'}</b></div>
      <div className="u-tv-going-steps">
        {GOING_STEPS.map((g) => <div key={g.id} className={`u-tv-going-step${g.id === going ? ' u-tv-going-on' : ''}`}><i /><small>{g.label}</small></div>)}
      </div>
    </div>
  </>;
}

function Closing({ toStart, runners }: { readonly toStart: string; readonly runners: readonly ChannelRunner[] }): React.ReactElement {
  const sorted = [...runners].sort((a, b) => a.gate - b.gate);
  return <>
    <div className="u-tv-rowhead"><span className="u-tv-tag u-tv-tag-closed">締切</span><span className="u-tv-m">投票は締め切りました</span></div>
    <div className="u-tv-closing">
      <div className="u-tv-m u-tv-sub">本馬場入場</div>
      <div className="u-tv-closing-left"><small>発走まで</small><b className="u-num">{toStart}</b></div>
    </div>
    <div className="u-tv-gates">
      {sorted.map((r) => <span key={r.gate} className="u-num" style={gateStyle(r.gate, sorted.length)}>{r.gate}</span>)}
    </div>
  </>;
}
