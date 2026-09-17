'use client';

/**
 * ★**マイページ（`/mypage`）**（★R-14・2026-09-17・引き渡し資料 §8-6）
 *
 * 【★この画面の役割】
 *   ★既存の `/stable`・`/stable/[horseId]`・`/records` の ★**3 画面ぶんを 1 画面に集約**します。
 *   ★詳細は ★**`/stable/[horseId]` へ送る**形にして、★既存を活かします（★資料 §4.3）。
 *
 * 【★守っていること】
 *   ★EP と PP は ★**別のカプセル**（★合算しない・憲法 §0.2）
 *   ★**素質の数値を出しません**（★正典 §5.5・§12.4）— ★出すのは成績と調子だけ
 *   ★停止スイッチを常設／★下端 34px の安全領域
 *
 * ⚠️ ★**ルート名について**: ★既存の `/stable` は生きています。★同じ URL を奪わず `/mypage` に置きました。
 *    ★切り替えはオーナー判断です（★報告 §3）。
 */

import { useState } from 'react';
import {
  Backdrop, BigButton, EpCapsule, NoticeBar, PpCapsule, TopBar, useMotionPaused,
} from '../../components/uma/uma-parts';
import { DEMO_HORSES, sortStable } from '../../lib/stable';
import { DEMO_RUNS } from '../../lib/game-demo';

/**
 * ★**厩舎の馬は `lib/stable.ts` から引きます**（★D-052・R-30）。
 *
 * ⚠️ ★**2026-09-17 の訂正**: ★最初、★馬名・性齢・毛色・成績を ★**画面に 3 行書いていました**。
 *    ★既に `DEMO_HORSES` が ★**同じ厩舎**を持っており、★**2 か所に別の名簿**ができていました。
 *    ★実データに繋ぐときも、★画面は `StableRepo` だけを見る約束です（★`lib/stable.ts` の冒頭）。
 */
/** ★毛色の色（★`story.tsx` の COATS と同じ値・資料 §6） */
const COAT_COLOR: Readonly<Record<string, string>> = { 鹿毛: '#86502f', 栗毛: '#b37442', 芦毛: '#d5d3c9' };
/** ★性齢から毛色を読めないので、★並び順で色を割り当てます（★実データでは `coat` が来ます） */
const COAT_BY_INDEX = ['#86502f', '#d5d3c9', '#b37442'] as const;

const CONDITION_STEPS = 5;

export default function MyPage(): React.ReactElement {
  const [paused, toggle] = useMotionPaused();
  /**
   * ⚠️ ★型を明示します。★`HORSES` は `as const` なので、★`useState(HORSES[0]!.id)` だと
   *    ★状態の型が **`'h1'` だけ**に狭まり、★**他の馬を選べなくなります**（★型検査が捕まえました）。
   */
  /** ★厩舎は `lib/stable.ts` の並び（★未指示 → 指示済み → 休養中）で出します */
  const horses = sortStable(DEMO_HORSES);
  const [selected, setSelected] = useState<string>(horses[0]!.id);
  const horse = horses.find((h) => h.id === selected) ?? horses[0]!;
  /** ★成績は出走の記録から数えます（★画面に数を書かない） */
  const record = [
    { label: '出走', value: DEMO_RUNS.length, gold: false },
    { label: '1着', value: DEMO_RUNS.filter((r) => r.place === 1).length, gold: true },
    { label: '2着', value: DEMO_RUNS.filter((r) => r.place === 2).length, gold: false },
    { label: '3着', value: DEMO_RUNS.filter((r) => r.place === 3).length, gold: false },
  ];

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
      <TopBar title="マイページ" paused={paused} onToggle={toggle} />
      <NoticeBar
        kind="soon"
        text="第12R 発走まで 3:20（芝1600m・12頭）"
        actionLabel="投票する"
        actionHref="/vote"
      />

      <div style={{
        position: 'relative', flex: '0 0 auto', display: 'flex', gap: 10,
        padding: '10px 14px 0', width: '100%', maxWidth: 1220, margin: '0 auto',
      }}>
        <EpCapsule value={1240} />
        <PpCapsule value={380} />
      </div>

      <div style={{
        position: 'relative', flex: '1 1 auto', minHeight: 0, overflow: 'auto',
        padding: '10px 14px 0', width: '100%', maxWidth: 1220, margin: '0 auto',
        display: 'flex', flexWrap: 'wrap', gap: 10, alignContent: 'flex-start',
      }}>
        {/* ★厩舎の馬（★1 頭 1 行） */}
        <div style={{
          flex: '1 1 330px', minWidth: 0, border: '2px solid rgba(246,194,28,.45)', borderRadius: 12,
          background: 'rgba(251,247,236,.96)', overflow: 'hidden',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', background: 'var(--u-navy)', borderBottom: '3px solid var(--u-gold)' }}>
            <span style={{ fontSize: 14 }}>厩舎の馬</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--u-ink-light-3)', whiteSpace: 'nowrap' }}>{horses.length} 頭</span>
          </div>
          {horses.map((h, hi) => (
            <div
              key={h.id}
              onClick={() => { setSelected(h.id); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, minHeight: 46, padding: '7px 10px',
                borderBottom: '1px solid var(--u-rule)', cursor: 'pointer',
                background: h.id === selected ? '#fff4cf' : undefined,
              }}
            >
              <span style={{ flex: '0 0 auto', width: 30, height: 30, borderRadius: '50%', background: COAT_BY_INDEX[hi % COAT_BY_INDEX.length], border: '3px solid var(--u-ink-dark)' }} />
              <span style={{ flex: '1 1 auto', minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 14, color: 'var(--u-ink-dark)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{h.name}</span>
                <span style={{ display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--u-ink-dark-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{h.sexAge}・{h.classLabel}</span>
              </span>
              <span style={{ flex: '0 0 auto', textAlign: 'right' }}>
                <span style={{ display: 'block', fontSize: 9, letterSpacing: '.08em', color: 'var(--u-ink-dark-2)' }}>賞金</span>
                <span className="u-num" style={{ display: 'block', fontSize: 16, color: 'var(--u-ink-dark)' }}>{h.prizePP.toLocaleString('ja-JP')}</span>
              </span>
              <span style={{ flex: '0 0 auto', display: 'flex', gap: 2, alignItems: 'flex-end', height: 14 }}>
                {Array.from({ length: CONDITION_STEPS }, (_, i) => (
                  <span key={i} style={{ width: 6, height: '100%', background: i < h.condition ? 'var(--u-gauge)' : '#d7dbe0' }} />
                ))}
              </span>
              <a href={`/stable/${h.id}`} onClick={(e) => { e.stopPropagation(); }} style={{
                flex: '0 0 auto', minHeight: 44, display: 'flex', alignItems: 'center', padding: '0 10px',
                border: '2px solid var(--u-navy)', borderRadius: 8, backgroundImage: 'linear-gradient(#ffffff,#e6eef6)',
                color: 'var(--u-ink-dark)', fontSize: 12,
              }}>詳細</a>
            </div>
          ))}
        </div>

        {/* ★成績＋血統表 */}
        <div style={{ flex: '1 1 250px', minWidth: 0, maxWidth: 430, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ padding: '8px 11px', border: '2px solid rgba(251,247,236,.28)', borderRadius: 12, background: 'var(--u-panel)' }}>
            <div style={{ fontSize: 11, letterSpacing: '.08em', color: 'var(--u-ink-light-3)' }}>これまでの成績</div>
            <div style={{ display: 'flex', marginTop: 6 }}>
              {record.map((r, i) => (
                <div key={r.label} style={{
                  flex: 1, textAlign: 'center',
                  borderLeft: i === 0 ? undefined : '1px solid rgba(251,247,236,.14)',
                }}>
                  <div style={{ fontSize: 10, color: 'var(--u-ink-light-3)' }}>{r.label}</div>
                  <div className="u-num" style={{ marginTop: 2, fontSize: 24, color: r.gold ? 'var(--u-gold)' : 'var(--u-ink-light)' }}>{r.value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* ★血統表（★紙パネル・角丸なし・2 代） */}
          <div style={{ border: '1px solid var(--u-rule-2)', background: 'var(--u-paper-3)', overflow: 'hidden' }}>
            <div style={{ padding: '6px 9px', background: 'var(--u-navy)', borderBottom: '3px solid var(--u-gold)' }}>
              <div style={{ fontSize: 10, letterSpacing: '.08em', color: 'var(--u-ink-light-3)' }}>血統表</div>
              <div style={{ fontSize: 14 }}>{horse.name}</div>
            </div>
            <div style={{ display: 'flex' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                {['父 ／ カゼノタカラ', '母 ／ ハルノシズク'].map((t) => (
                  <div key={t} style={{ minHeight: 44, display: 'flex', alignItems: 'center', padding: '0 8px', fontSize: 12, color: 'var(--u-ink-dark)', borderBottom: '1px solid var(--u-rule-2)' }}>{t}</div>
                ))}
              </div>
              <div style={{ width: 2, background: 'var(--u-rule-2)' }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                {['父の父 ／ タカラブネ', '父の母 ／ ミネノヒカリ', '母の父 ／ シズカナウミ'].map((t) => (
                  <div key={t} style={{ minHeight: 44, display: 'flex', alignItems: 'center', padding: '0 8px', fontSize: 11, color: 'var(--u-ink-dark-2)', background: 'var(--u-paper-2)', borderBottom: '1px solid var(--u-rule-2)' }}>{t}</div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div style={{
        position: 'relative', flex: '0 0 auto', display: 'flex', flexWrap: 'wrap', gap: 10,
        padding: '10px 14px var(--u-safe-bottom)', width: '100%', maxWidth: 1220, margin: '0 auto',
      }}>
        <BigButton tone="gold" label="育成モードへ" sub="今週の調教がまだです" href="/train" grow="1.4 1 210px" />
        <BigButton tone="ivory" label="ダッシュボード" sub="いつでも戻れます" href="/home" grow="1 1 130px" />
      </div>
    </div>
  );
}
