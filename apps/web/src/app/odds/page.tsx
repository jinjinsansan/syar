'use client';

/**
 * ★**オッズ（`/odds`）**（★R-14・2026-09-17・引き渡し資料 §8-9）
 *
 * 【★この画面が守ること】（★正典 §17.1 **L-8**・ストア審査）
 *   ★**赤や金で大きく見せない・点滅させない・拡大しない・効果音を付けない**
 *   ★単勝は ★**灰色の数字**（`#25384a`）。★「当たりやすさ」を煽らない
 *   ★最下部に ★**常設の注記**「数字は投票の集まり方を表したものです。当たりやすさを保証するものではありません。」
 *
 * ⚠️ ★**ルート名について**: ★既存の `/races/[id]/odds`（arcade 版）は生きています。
 *    ★資料 §4.3 は「作り直し」ですが、★**同じ URL を奪うと既存が消えます**。
 *    → ★新しい `/odds` に置き、★**切り替えはオーナー判断**にします（★報告 §3）。
 *
 * ⚠️ ★本番のデータは `components/odds-board.tsx` の構造に乗せます（★資料 §8-9）。
 *    ★いまはデモの値です。★画面で計算しません。
 */

import {
  Backdrop, BigButton, NoticeBar, TopBar, useMotionPaused,
} from '../../components/uma/uma-parts';

/** ★枠色 1〜8（★正典の `--f1`〜`--f8` の写し・★変更禁止） */
const FRAME_COLORS = ['#f5f5f5', '#191919', '#d62828', '#1446b4', '#fad728', '#148c46', '#f08219', '#f596be'] as const;
/** ★白・黄・桃は文字を濃くする（★色だけで意味を運ばない・art-bible §4） */
const DARK_TEXT_FRAMES = new Set([1, 5, 8]);

/** ★デモの出馬表（★本番はサーバーの値） */
const ROWS = [
  { no: 1, frame: 1, name: 'アオバハヤテ', win: '3.4', place: '1.5 - 2.1', rank: 1 },
  { no: 2, frame: 1, name: 'コトブキノホシ', win: '5.8', place: '2.0 - 3.0', rank: 2 },
  { no: 3, frame: 2, name: 'ライトニングボウ', win: '7.2', place: '2.4 - 3.6', rank: 3 },
  { no: 4, frame: 2, name: 'ミライノツバサ', win: '9.9', place: '2.9 - 4.4', rank: 4 },
  { no: 5, frame: 3, name: 'セイランオー', win: '12.4', place: '3.4 - 5.2', rank: 5 },
  { no: 6, frame: 3, name: 'ハナカゼマル', win: '16.8', place: '4.1 - 6.3', rank: 6 },
  { no: 7, frame: 4, name: 'ハルカゼノオト', win: '21.5', place: '5.0 - 7.8', rank: 7 },
  { no: 8, frame: 4, name: 'ゲンブノツルギ', win: '28.0', place: '6.2 - 9.7', rank: 8 },
  { no: 9, frame: 5, name: 'トキメキステップ', win: '35.6', place: '7.4 - 11.8', rank: 9 },
  { no: 10, frame: 6, name: 'ホクトリュウセイ', win: '48.2', place: '9.1 - 14.6', rank: 10 },
  { no: 11, frame: 7, name: 'シラユキノヒメ', win: '66.0', place: '11.5 - 18.9', rank: 11 },
  { no: 12, frame: 8, name: 'カガヤキボシ', win: '92.3', place: '15.0 - 25.4', rank: 12 },
] as const;

export default function OddsPage(): React.ReactElement {
  const [paused, toggle] = useMotionPaused();
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
        kind="soon"
        text="オッズは締切まで変わります。最終の数字は発走時に確定します。"
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
          {/* ★見出し帯 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: 'var(--u-navy)', borderBottom: '3px solid var(--u-gold)' }}>
            <span style={{ flex: '0 0 auto', fontSize: 15 }}>第12R</span>
            <span style={{ minWidth: 0, fontSize: 11, fontWeight: 700, color: 'var(--u-ink-light-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              芝1600m ・ 12頭 ・ 良
            </span>
            <span style={{ marginLeft: 'auto', flex: '0 0 auto', display: 'flex', alignItems: 'baseline', gap: 4 }}>
              <span style={{ fontSize: 10, color: 'var(--u-ink-light-3)' }}>締切まで</span>
              <span className="u-num" style={{ fontSize: 19 }}>2:40</span>
            </span>
          </div>

          {/* ★列見出し */}
          <div style={{ display: 'flex', alignItems: 'center', padding: '4px 10px', background: '#e8eef3', color: 'var(--u-ink-dark-2)', fontSize: 10, letterSpacing: '.06em', borderBottom: '1px solid #cfe0ee' }}>
            <span style={{ width: 74, flex: '0 0 auto' }}>枠・馬番</span>
            <span style={{ flex: '1 1 auto', minWidth: 0 }}>馬名</span>
            <span style={{ width: 54, flex: '0 0 auto', textAlign: 'right' }}>単勝</span>
            <span style={{ width: 78, flex: '0 0 auto', textAlign: 'right' }}>複勝</span>
            <span style={{ width: 40, flex: '0 0 auto', textAlign: 'right' }}>人気</span>
          </div>

          {/* ★行（★1280 で 2 列＝12 頭が 1 画面） */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(330px,1fr))' }}>
            {ROWS.map((r, i) => (
              <div key={r.no} style={{
                display: 'flex', alignItems: 'center', minHeight: 44, padding: '0 10px',
                background: i % 2 === 1 ? 'var(--u-paper-2)' : 'var(--u-paper)',
                borderBottom: '1px solid var(--u-rule)',
              }}>
                <span style={{ width: 74, flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{
                    width: 24, height: 20, borderRadius: 4, border: '2px solid var(--u-ink-dark)',
                    background: FRAME_COLORS[r.frame - 1], display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, color: DARK_TEXT_FRAMES.has(r.frame) ? '#111' : '#fff',
                  }}>{r.frame}</span>
                  <span className="u-num" style={{ fontSize: 19, color: 'var(--u-ink-dark)' }}>{r.no}</span>
                </span>
                <span style={{ flex: '1 1 auto', minWidth: 0, fontSize: 13, color: 'var(--u-ink-dark)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {r.name}
                </span>
                {/* ★単勝は灰色。★大きく・赤く・光らせない（★L-8） */}
                <span className="u-num" style={{ width: 54, flex: '0 0 auto', textAlign: 'right', fontSize: 17, color: 'var(--u-ink-dark-3)' }}>{r.win}</span>
                <span className="u-num" style={{ width: 78, flex: '0 0 auto', textAlign: 'right', fontSize: 15, color: 'var(--u-ink-dark-2)' }}>{r.place}</span>
                <span className="u-num" style={{ width: 40, flex: '0 0 auto', textAlign: 'right', fontSize: 15, color: 'var(--u-ink-dark-2)' }}>{r.rank}</span>
              </div>
            ))}
          </div>

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
