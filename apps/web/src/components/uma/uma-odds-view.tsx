'use client';

/**
 * ★**オッズの表示部分**（★R-14・2026-09-17・引き渡し資料 §8-9）
 *
 * 【★なぜ部品に切り出すか】
 *   ★`/odds/[id]` は ★**サーバー部品**（`readClient()` で実データを読む）ですが、
 *   ★停止スイッチは `useState` を使うので ★**client でなければ動きません**。
 *   → ★**読むのはサーバー・見せるのは client**に分けます。
 *
 * 【★この部品がしないこと】（★正典 §14.3）
 *   ⚠️ ★**計算も判定もしません。** ★オッズも人気も**サーバーが出した値**をそのまま出します。
 *   ★整形は `lib/format.ts` の 1 か所から引きます（★画面で式を作らない・D-052）。
 */

import { formatDistance, formatOdds, formatRaceTitle, SURFACE_LABEL, CONDITION_LABEL } from '../../lib/format';
import {
  Backdrop, BigButton, NoticeBar, TopBar, useMotionPaused,
} from './uma-parts';

/** ★枠色 1〜8（★正典 `--f1`〜`--f8` の写し・★変更禁止） */
const FRAME_COLORS = ['#f5f5f5', '#191919', '#d62828', '#1446b4', '#fad728', '#148c46', '#f08219', '#f596be'] as const;
const DARK_TEXT_FRAMES = new Set([1, 5, 8]);

export interface OddsViewRace {
  readonly id: string;
  readonly name: string | null;
  readonly grade: string | null;
  readonly classRank: number;
  readonly surface: string;
  readonly distance: number;
  readonly trackCondition: string;
  readonly status: string;
}

export interface OddsViewRow {
  readonly gate: number;
  readonly name: string;
  readonly popularity: number | null;
  /** ★単勝（★サーバーの値。★無ければ `null`） */
  readonly win: number | null;
  readonly winCapped: boolean;
  /** ★複勝（★範囲で出す。★無ければ `null`） */
  readonly placeLow: number | null;
  readonly placeHigh: number | null;
}

/** ★枠は馬番から（★8 枠に均等割り・正典 §9.1 の慣行） */
function frameOf(gate: number, fieldSize: number): number {
  const perFrame = Math.ceil(fieldSize / 8);
  return Math.min(8, Math.max(1, Math.ceil(gate / perFrame)));
}

export function UmaOddsView({ race, rows }: {
  readonly race: OddsViewRace;
  readonly rows: readonly OddsViewRow[];
}): React.ReactElement {
  const [paused, toggle] = useMotionPaused();
  const fieldSize = rows.length;
  const title = formatRaceTitle(race.classRank, race.grade);

  return (
    <div
      data-theme="uma"
      className={paused ? 'u-paused' : undefined}
      style={{
        position: 'relative', width: '100%', minHeight: '100dvh', overflow: 'hidden',
        containerType: 'inline-size', background: 'var(--u-navy)', display: 'flex', flexDirection: 'column',
      }}
    >
      <Backdrop />
      <TopBar title="オッズ" paused={paused} onToggle={toggle} />
      <NoticeBar
        kind={race.status === 'closed' ? 'closing' : 'soon'}
        text={race.status === 'closed'
          ? '投票は締め切りました。最終の数字です。'
          : 'オッズは締切まで変わります。最終の数字は発走時に確定します。'}
        actionLabel="投票する"
        actionHref="/vote"
      />

      <div style={{
        position: 'relative', flex: '1 1 auto', minHeight: 0, overflow: 'auto',
        padding: '10px 14px 0', width: '100%', maxWidth: 1220, margin: '0 auto',
      }}>
        <div style={{
          border: '2px solid rgba(246,194,28,.45)', borderRadius: 12,
          background: 'rgba(251,247,236,.96)', overflow: 'hidden',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: 'var(--u-navy)', borderBottom: '3px solid var(--u-gold)' }}>
            <span style={{ flex: '0 0 auto', fontSize: 15 }}>{race.name ?? title}</span>
            <span style={{ minWidth: 0, fontSize: 11, fontWeight: 700, color: 'var(--u-ink-light-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {SURFACE_LABEL[race.surface]}{formatDistance(race.distance)} ・ {fieldSize}頭 ・ {CONDITION_LABEL[race.trackCondition]}
            </span>
            <span style={{ marginLeft: 'auto', flex: '0 0 auto', fontSize: 11, fontWeight: 700, color: 'var(--u-ink-light-3)' }}>{title}</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', padding: '4px 10px', background: '#e8eef3', color: 'var(--u-ink-dark-2)', fontSize: 10, letterSpacing: '.06em', borderBottom: '1px solid #cfe0ee' }}>
            <span style={{ width: 74, flex: '0 0 auto' }}>枠・馬番</span>
            <span style={{ flex: '1 1 auto', minWidth: 0 }}>馬名</span>
            <span style={{ width: 54, flex: '0 0 auto', textAlign: 'right' }}>単勝</span>
            <span style={{ width: 78, flex: '0 0 auto', textAlign: 'right' }}>複勝</span>
            <span style={{ width: 40, flex: '0 0 auto', textAlign: 'right' }}>人気</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(330px,1fr))' }}>
            {rows.map((r, i) => {
              const frame = frameOf(r.gate, fieldSize);
              return (
                <div key={r.gate} style={{
                  display: 'flex', alignItems: 'center', minHeight: 44, padding: '0 10px',
                  background: i % 2 === 1 ? 'var(--u-paper-2)' : 'var(--u-paper)',
                  borderBottom: '1px solid var(--u-rule)',
                }}>
                  <span style={{ width: 74, flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{
                      width: 24, height: 20, borderRadius: 4, border: '2px solid var(--u-ink-dark)',
                      background: FRAME_COLORS[frame - 1], display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 11, color: DARK_TEXT_FRAMES.has(frame) ? '#111' : '#fff',
                    }}>{frame}</span>
                    <span className="u-num" style={{ fontSize: 19, color: 'var(--u-ink-dark)' }}>{r.gate}</span>
                  </span>
                  <span style={{ flex: '1 1 auto', minWidth: 0, fontSize: 13, color: 'var(--u-ink-dark)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {r.name}
                  </span>
                  {/* ★単勝は灰色。★大きく・赤く・光らせない（★L-8） */}
                  <span className="u-num" style={{ width: 54, flex: '0 0 auto', textAlign: 'right', fontSize: 17, color: 'var(--u-ink-dark-3)' }}>
                    {r.win === null ? '—' : formatOdds(r.win, r.winCapped)}
                  </span>
                  <span className="u-num" style={{ width: 78, flex: '0 0 auto', textAlign: 'right', fontSize: 15, color: 'var(--u-ink-dark-2)' }}>
                    {r.placeLow === null || r.placeHigh === null ? '—' : `${r.placeLow.toFixed(1)} - ${r.placeHigh.toFixed(1)}`}
                  </span>
                  <span className="u-num" style={{ width: 40, flex: '0 0 auto', textAlign: 'right', fontSize: 15, color: 'var(--u-ink-dark-2)' }}>
                    {r.popularity ?? '—'}
                  </span>
                </div>
              );
            })}
          </div>

          {rows.length === 0 && (
            <p style={{ margin: 0, padding: '14px 10px', fontSize: 12, fontWeight: 700, color: 'var(--u-ink-dark-2)' }}>
              このレースの出馬表はまだ出ていません。
            </p>
          )}

          {/* ★常設の注記（★L-8） */}
          <div style={{ padding: '8px 10px', borderTop: '1px solid var(--u-rule)', background: 'var(--u-paper-2)', fontSize: 11, fontWeight: 700, color: 'var(--u-ink-dark-2)' }}>
            数字は投票の集まり方を表したものです。当たりやすさを保証するものではありません。
          </div>
        </div>
      </div>

      <div style={{
        position: 'relative', flex: '0 0 auto', display: 'flex', flexWrap: 'wrap', gap: 10,
        padding: '10px 14px var(--u-safe-bottom)', width: '100%', maxWidth: 1220, margin: '0 auto',
      }}>
        <BigButton tone="blue" label="投票モードへ" sub="マークシートで選ぶ" href="/vote" grow="1.4 1 210px" />
        <BigButton tone="ivory" label="レースを見る" sub="横向きの全画面で流れます" href="/watch-race" grow="1 1 130px" />
      </div>
    </div>
  );
}
