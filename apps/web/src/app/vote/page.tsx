'use client';

/**
 * ★**投票モード（`/vote`）**（★R-14・2026-09-17・引き渡し資料 §8-4）
 *
 * 【★この画面がいちばん重い理由】
 *   ★**マークシートの画面が、これまで存在しませんでした**（★資料 §4.3）。
 *   ★`/races/[id]/bet` は arcade 版の別デザインで、★**同じ URL を奪いません**。
 *
 * 【★正典 §9.5 — 自分の馬が出るレース】
 *   ⚠️ ★**投票できません。** ★行は押せず、★主ボタンは灰色、★使う EP は「—」、
 *      ★通知は「レースを見る」だけ、★**理由を必ず併記**します。
 *      ★「押せない」だけにすると、★**なぜ押せないか分かりません**。
 *
 * 【★L-8（ストア審査）】
 *   ★単勝は ★**灰色**。★倍率を大きく・赤く・光らせません。★「儲かる」等を書きません。
 *   ★語は ★**「投票」**（★「馬券」と書かない）。
 */

import { useState } from 'react';
import {
  Backdrop, BigButton, NoticeBar, TopBar, useMotionPaused,
} from '../../components/uma/uma-parts';

/** ★枠色 1〜8（★正典 `--f1`〜`--f8` の写し・★変更禁止） */
const FRAME_COLORS = ['#f5f5f5', '#191919', '#d62828', '#1446b4', '#fad728', '#148c46', '#f08219', '#f596be'] as const;
const DARK_TEXT_FRAMES = new Set([1, 5, 8]);

/** ★1 頭あたりに使う参加ポイント（★資料 §8-4） */
const EP_PER_PICK = 10;

const ROWS = [
  { no: 1, frame: 1, name: 'アオバハヤテ', jockey: '青井 はやと', odds: '3.4', mine: false },
  { no: 2, frame: 1, name: 'コトブキノホシ', jockey: '倉田 みなと', odds: '5.8', mine: false },
  { no: 3, frame: 2, name: 'ライトニングボウ', jockey: '篠崎 れん', odds: '7.2', mine: false },
  { no: 4, frame: 2, name: 'ミライノツバサ', jockey: '辻 さとる', odds: '9.9', mine: false },
  { no: 5, frame: 3, name: 'セイランオー', jockey: '日村 かなた', odds: '12.4', mine: false },
  { no: 6, frame: 3, name: 'ハナカゼマル', jockey: '成田 いずみ', odds: '16.8', mine: false },
  { no: 7, frame: 4, name: 'ハルカゼノオト', jockey: '青井 はやと', odds: '21.5', mine: true },
  { no: 8, frame: 4, name: 'ゲンブノツルギ', jockey: '倉田 みなと', odds: '28.0', mine: false },
  { no: 9, frame: 5, name: 'トキメキステップ', jockey: '篠崎 れん', odds: '35.6', mine: false },
  { no: 10, frame: 6, name: 'ホクトリュウセイ', jockey: '辻 さとる', odds: '48.2', mine: false },
  { no: 11, frame: 7, name: 'シラユキノヒメ', jockey: '日村 かなた', odds: '66.0', mine: false },
  { no: 12, frame: 8, name: 'カガヤキボシ', jockey: '成田 いずみ', odds: '92.3', mine: false },
] as const;

export default function VotePage(): React.ReactElement {
  const [paused, toggle] = useMotionPaused();
  const [picks, setPicks] = useState<readonly number[]>([]);
  /**
   * ★**自分の馬がこのレースに出走しているか**（★本番はサーバーの出走登録から）。
   * ★デモでは 7 番が自馬なので `true`。★両方の見え方を確かめられるよう、★切り替えも置きます。
   */
  const [ownHorseRuns, setOwnHorseRuns] = useState(true);

  const toggleRow = (no: number): void => {
    if (ownHorseRuns) return; // ★§9.5: 触っても変わらない
    setPicks((p) => (p.includes(no) ? p.filter((x) => x !== no) : [...p, no]));
  };
  const useEp = ownHorseRuns ? '—' : String(picks.length * EP_PER_PICK);

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
      <TopBar title="投票モード" paused={paused} onToggle={toggle} />

      {/* ★自馬が出走しているときは、★投票の導線を出さない（★§9.5） */}
      {ownHorseRuns ? (
        <NoticeBar
          kind="own"
          text="第12R に自分の馬が出走しています"
          sub="自分の馬が出るレースは投票できません（レースは観戦できます）"
          actionLabel="レースを見る"
          actionHref="/watch-race"
        />
      ) : (
        <NoticeBar
          kind="soon"
          text="第12R 発走まで 3:20（芝1600m・12頭）"
          actionLabel="レースを見る"
          actionHref="/watch-race"
        />
      )}

      <div style={{
        position: 'relative', flex: '1 1 auto', minHeight: 0, display: 'flex', flexWrap: 'wrap', gap: 12,
        padding: '10px 14px 0', width: '100%', maxWidth: 1220, margin: '0 auto', overflow: 'auto',
      }}>
        {/* ★出馬表 */}
        <div style={{
          flex: '2 1 330px', minWidth: 0, alignSelf: 'flex-start',
          border: '2px solid rgba(246,194,28,.45)', borderRadius: 12,
          background: 'rgba(251,247,236,.96)', overflow: 'hidden',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: 'var(--u-navy)', borderBottom: '3px solid var(--u-gold)' }}>
            <span style={{ fontSize: 15 }}>出馬表</span>
            <span style={{ minWidth: 0, fontSize: 11, fontWeight: 700, color: 'var(--u-ink-light-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              第12R ・ 芝1600m ・ 12頭
            </span>
            <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'baseline', gap: 4 }}>
              <span style={{ fontSize: 10, color: 'var(--u-ink-light-3)' }}>発走まで</span>
              <span className="u-num" style={{ fontSize: 19 }}>3:20</span>
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', padding: '4px 10px', background: '#e8eef3', color: 'var(--u-ink-dark-2)', fontSize: 10, letterSpacing: '.06em', borderBottom: '1px solid #cfe0ee' }}>
            <span style={{ width: 78, flex: '0 0 auto' }}>枠・馬番</span>
            <span style={{ flex: '1 1 auto', minWidth: 0 }}>馬名 ／ 騎手</span>
            <span style={{ width: 52, flex: '0 0 auto', textAlign: 'right' }}>単勝</span>
            <span style={{ width: 34, flex: '0 0 auto', textAlign: 'center' }}>印</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))' }}>
            {ROWS.map((r, i) => {
              const on = picks.includes(r.no);
              return (
                <button
                  key={r.no}
                  type="button"
                  onClick={() => { toggleRow(r.no); }}
                  disabled={ownHorseRuns}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6, minHeight: 46, padding: '0 10px', textAlign: 'left',
                    border: 'none', borderBottom: '1px solid var(--u-rule)',
                    background: ownHorseRuns ? '#eceff1' : on ? '#fff4cf' : i % 2 === 1 ? 'var(--u-paper-2)' : 'var(--u-paper)',
                    opacity: ownHorseRuns ? 0.72 : 1,
                    cursor: ownHorseRuns ? 'not-allowed' : 'pointer',
                  }}
                >
                  <span style={{ width: 78, flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{
                      width: 26, height: 22, borderRadius: 4, border: '2px solid var(--u-ink-dark)',
                      background: FRAME_COLORS[r.frame - 1], display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 11, color: DARK_TEXT_FRAMES.has(r.frame) ? '#111' : '#fff',
                    }}>{r.frame}</span>
                    <span className="u-num" style={{ fontSize: 19, color: 'var(--u-ink-dark)' }}>{r.no}</span>
                  </span>
                  <span style={{ flex: '1 1 auto', minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 14, color: 'var(--u-ink-dark)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {r.name}{r.mine ? '（自分の馬）' : ''}
                    </span>
                    <span style={{ display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--u-ink-dark-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {r.jockey}
                    </span>
                  </span>
                  {/* ★単勝は灰色。★大きく・赤く・光らせない（★L-8） */}
                  <span className="u-num" style={{ width: 52, flex: '0 0 auto', textAlign: 'right', fontSize: 16, color: 'var(--u-ink-dark-2)' }}>{r.odds}</span>
                  <span style={{
                    width: 34, flex: '0 0 auto', height: 30, borderRadius: '50%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    border: on ? '3px solid var(--u-blue)' : '2px solid #c3ccd4',
                    background: on ? 'var(--u-blue)' : '#fff', color: '#fff', fontSize: 13,
                  }}>{on ? '◯' : ''}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ★集計列 */}
        <div style={{ flex: '1 1 250px', minWidth: 0, maxWidth: 420, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ padding: '8px 11px', border: '2px solid rgba(251,247,236,.28)', borderRadius: 12, background: 'var(--u-panel)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, letterSpacing: '.08em', color: 'var(--u-ink-light-3)' }}>マークシート</span>
              <span style={{ marginLeft: 'auto', fontSize: 12 }}>{ownHorseRuns ? '選べません' : `${picks.length} 頭を選択中`}</span>
            </div>
            <div style={{ marginTop: 6, display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontSize: 11, color: 'var(--u-ink-light-3)' }}>使う参加ポイント</span>
              <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'baseline', gap: 5 }}>
                <span className="u-num" style={{ fontSize: 24, color: 'var(--u-ep-num)' }}>{useEp}</span>
                <span style={{ fontSize: 11, color: 'var(--u-ep-ink)' }}>EP</span>
              </span>
            </div>
            <div style={{ marginTop: 4, fontSize: 10, fontWeight: 500, color: '#a9d8cb' }}>
              参加ポイントは無償で受け取れます（有償での取得はありません）
            </div>
          </div>
          <div style={{ padding: '8px 11px', border: '2px solid rgba(251,247,236,.28)', borderRadius: 12, background: 'var(--u-panel)', fontSize: 12, fontWeight: 500, lineHeight: 1.6 }}>
            {ownHorseRuns
              ? '自分の馬が出走しているため、このレースには投票できません（正典 §9.5）。レースは観戦できます。'
              : `1 頭につき ${EP_PER_PICK} EP を使います。出走登録の出走料とは別枠です。`}
          </div>
          {/* ★デモの切り替え（★両方の見え方を確かめるため。★本番はサーバーが決めます） */}
          <button
            type="button"
            onClick={() => { setOwnHorseRuns((v) => !v); setPicks([]); }}
            style={{
              minHeight: 44, borderRadius: 8, border: '2px solid rgba(251,247,236,.28)',
              background: 'transparent', color: 'var(--u-ink-light-3)', fontSize: 11,
            }}
          >
            （デモ）自馬の出走を{ownHorseRuns ? '無し' : '有り'}にする
          </button>
        </div>
      </div>

      <div style={{
        position: 'relative', flex: '0 0 auto', display: 'flex', flexWrap: 'wrap', gap: 10,
        padding: '10px 14px var(--u-safe-bottom)', width: '100%', maxWidth: 1220, margin: '0 auto',
      }}>
        {ownHorseRuns ? (
          <BigButton tone="disabled" label="投票はできません" sub="自分の馬が出走しているため" grow="1.4 1 210px" />
        ) : (
          <BigButton
            tone="blue"
            label="投票する（マークシート）"
            sub={`${picks.length} 頭 ／ ${picks.length * EP_PER_PICK} EP を使います`}
            grow="1.4 1 210px"
          />
        )}
        <BigButton tone="ivory" label="レースを見る" sub="横向きの全画面で流れます" href="/watch-race" grow="1 1 130px" />
      </div>
    </div>
  );
}
