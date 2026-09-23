'use client';

/**
 * ★**育成モード／調教（`/train`）**（★R-14・2026-09-17・引き渡し資料 §8-3）
 *
 * 【★この画面が守ること】
 *   ★**素質の数値を出しません**（★正典 §5.5・§12.4）— ★出すのはスタミナと調子のゲージだけ
 *   ★**ゲージ以外に「機械」的表現を増やしません**（★資料 §8-3）
 *   ★停止スイッチを常設／★下端 34px の安全領域
 *
 * ⚠️ ★**ルート名について**: ★既存の `/training`（arcade 版）は生きています。
 *    ★同じ URL を奪わず `/train` に置きました。★切り替えはオーナー判断です（★報告 §3）。
 *
 * ⚠️ ★**週送り・メニューの効果のロジックは既存を流用します**（★資料 §4.3）。
 *    ★この画面はまだ**見た目だけ**で、★`@star/training` には繋いでいません（★次便）。
 *
 * ★**顔アップ枠は表情 3 種**（上機嫌・平常・疲れ）です（★2026-09-23 に焼いた・
 *    `design/art/prompts/train-face-*.txt`）。★どれを出すかは `trainFaceOf` が決めます（★画面で決めない）。
 * ★**全身枠も焼きました**（★待機 `train-body-idle` ／ 調教中 `train-body-run`・騎手なし）。
 * ⚠️ ★走りは ★**1 枚**です（★連番のアニメではない）。★動きは CSS が付けています。
 */

import { useEffect, useRef, useState } from 'react';
import { Backdrop, BigButton, TopBar, useMotionPaused } from '../../components/uma/uma-parts';
import { RaceStrip } from '../../components/uma/race-strip';
import { useStableView } from '../../components/uma/use-stable-view';
import { TRAINING_MENUS } from '../../lib/game-demo';
import { conditionView, sortStable, trainFaceOf } from '../../lib/stable';

/** ★実行してから待機に戻るまで（★資料 §9 の 3200ms） */
const RUN_MS = 3200;

/**
 * ★**メニューは `@star/training` の名簿から引きます**（★D-052・R-30）。
 *
 * ⚠️ ★**2026-09-17 の訂正**: ★最初、★資料 §8-3 の見出し（追い切り／坂路／プール／軽めの調整／
 *    ★休養／馬房で様子見）を ★**画面に 6 件書いていました**。★しかし正典 §7.2 の名簿は
 *    ★**8 件**（`hill`・`wood`・`pool`・`gate`・`partner`・`hard`・`light`・`rest`）で、
 *    ★**画面が別の名簿を持つ**形になっていました。
 *    → ★`TRAINING_MENUS`（★名前も疲労も EP も `MENUS` から出ている）を引きます。
 *    ★資料と正典が食い違うときは ★**正典が上**です（★憲法・§0）。
 */

const CONDITION_STEPS = 5;

export default function TrainPage(): React.ReactElement {
  const [paused, toggle] = useMotionPaused();
  const { view, loading, error, refresh } = useStableView();
  /** ★選んでいるメニューの id（★名簿の並びから引く・★画面で番号を発明しない） */
  const [menuId, setMenuId] = useState<string>(TRAINING_MENUS[0]!.id);
  const spec = TRAINING_MENUS.find((m) => m.id === menuId) ?? TRAINING_MENUS[0]!;
  const [selectedHorse, setSelectedHorse] = useState<string | null>(null);
  const horses = sortStable(view?.horses ?? []);
  const horse = horses.find((candidate) => candidate.id === selectedHorse) ?? horses[0] ?? null;
  const [running, setRunning] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => { if (timer.current !== undefined) clearTimeout(timer.current); }, []);
  const run = (): void => {
    if (timer.current !== undefined) clearTimeout(timer.current);
    setRunning(true);
    timer.current = setTimeout(() => { setRunning(false); }, RUN_MS);
  };

  if (horse === null) return <div data-theme="uma" style={{ minHeight: '100dvh', background: 'var(--u-navy)' }}>
    <Backdrop /><TopBar title="育成モード" paused={paused} onToggle={toggle} /><RaceStrip compact />
    <div role={error ? 'alert' : 'status'} style={{ position: 'relative', padding: 20 }}>
      {loading ? '厩舎を読み込み中…' : error ?? 'まだ持ち馬がいません。'}
      <div style={{ display: 'flex', gap: 12, marginTop: 12 }}><a href="/login">ログイン</a><a href="/setup">最初の1頭を迎える</a><button type="button" onClick={refresh}>再読み込み</button></div>
    </div>
  </div>;
  const cond = conditionView(horse.condition);
  /** ★顔は 3 種。★選ぶ規則は画面に置かない（★`trainFaceOf`・疲労が先） */
  const face = trainFaceOf(horse.condition, horse.fatigue);

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
      <TopBar title="育成モード" paused={paused} onToggle={toggle} />
      <RaceStrip compact />
      <div role="status" style={{ position: 'relative', padding: '6px 14px', color: 'var(--u-gold)', fontSize: 12 }}>
        馬の状態は実データです。調教指示の適用は準備中のため、この画面からは保存できません。
      </div>

      <div style={{
        position: 'relative', flex: '1 1 auto', minHeight: 0, display: 'flex', flexWrap: 'wrap',
        alignItems: 'stretch', gap: 12, padding: '12px 14px 0',
        width: '100%', maxWidth: 1220, margin: '0 auto', overflow: 'hidden',
      }}>
        {horses.length > 1 && <div style={{ width: '100%', display: 'flex', gap: 8, overflowX: 'auto' }}>
          {horses.map((entry) => <button key={entry.id} type="button" onClick={() => { setSelectedHorse(entry.id); }} aria-pressed={entry.id === horse.id}
            style={{ minHeight: 44, flex: '0 0 auto', padding: '5px 10px', border: entry.id === horse.id ? '2px solid var(--u-gold)' : '2px solid var(--u-edge-light)', borderRadius: 8, background: 'var(--u-panel)', color: 'var(--u-ink-light)' }}>{entry.name}</button>)}
        </div>}
        {/* ★調教ステージ */}
        <div style={{
          flex: '1 1 340px', minWidth: 0, minHeight: 226, position: 'relative',
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
          border: '2px solid rgba(246,194,28,.45)', borderRadius: 14, background: 'rgba(6,18,30,.28)', overflow: 'hidden',
        }}>
          {/* ★左上の 2 札（選んだメニュー／状態） */}
          <div style={{ position: 'absolute', left: 10, top: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ padding: '5px 9px', border: '2px solid var(--u-gold)', borderRadius: 999, background: 'var(--u-panel-strong)', fontSize: 11 }}>
              {spec.name}
            </span>
            <span style={{ padding: '5px 9px', border: '2px solid rgba(251,247,236,.35)', borderRadius: 999, background: 'var(--u-panel)', fontSize: 11, fontWeight: 700 }}>
              {running ? '調教中' : `${horse.name}・${cond.label}`}
            </span>
          </div>

          {/* ★顔アップ枠（★表情 3 種・2026-09-23。★どれを出すかは `trainFaceOf` が決める） */}
          <div style={{ position: 'absolute', right: 10, top: 10, width: 96, border: '3px solid var(--u-gold)', borderRadius: 12, background: 'var(--u-panel-strong)', overflow: 'hidden' }}>
            <div style={{
              height: 74, background: `url('/art/uma/train-face-${face}.webp') no-repeat center/cover`,
            }} />
            <div style={{ padding: '4px 6px', textAlign: 'center', fontSize: 11, borderTop: '2px solid rgba(246,194,28,.6)' }}>
              {running ? '張り切っています' : '落ち着いています'}
            </div>
          </div>

          {/* ★馬（★タップでも「この内容で調教する」でも走り出す） */}
          <span style={{ position: 'absolute', left: '12%', right: '12%', bottom: 16, height: 20, borderRadius: '50%', background: 'rgba(8,18,8,.5)', filter: 'blur(6px)' }} />
          {running && (
            <span style={{ position: 'absolute', left: '10%', bottom: 14, width: 60, height: 44, borderRadius: '50%', background: 'rgba(228,226,208,.4)', filter: 'blur(8px)', animation: 'u-dust .95s linear infinite' }} />
          )}
          <div
            onClick={run}
            style={{
              position: 'relative', width: 272, maxWidth: '100%', height: 290, cursor: 'pointer',
              animation: running ? 'u-rush .95s ease-in-out infinite' : 'u-idle 3.4s ease-in-out infinite',
            }}
          >
            {/* ★全身（★待機／調教中の 2 枚・★2026-09-23 に焼いた・騎手は乗っていない） */}
            <span style={{
              position: 'absolute', inset: 0,
              background: `url('/art/uma/train-body-${running ? 'run' : 'idle'}.webp') no-repeat bottom center/contain`,
              filter: 'drop-shadow(0 8px 12px rgba(8,18,8,.45))',
            }} />
          </div>

          {/* ★ゲージ（★スタミナ・調子。★これ以外に機械的な表示を増やさない） */}
          <div style={{
            position: 'absolute', left: 10, right: 10, bottom: 10, display: 'flex', flexDirection: 'column', gap: 5,
            padding: '8px 10px', borderRadius: 10, background: 'rgba(10,35,64,.78)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 62, flex: '0 0 auto', fontSize: 10, letterSpacing: '.08em', color: 'var(--u-ink-light-3)' }}>疲労</span>
              <span style={{ flex: '1 1 auto', height: 12, background: 'rgba(251,247,236,.18)', borderRadius: 2, overflow: 'hidden' }}>
                <span style={{ display: 'block', width: `${Math.max(0, Math.min(100, horse.fatigue))}%`, height: '100%', background: 'var(--u-gauge)' }} />
              </span>
              <span className="u-num" style={{ flex: '0 0 auto', width: 42, textAlign: 'right', fontSize: 16 }}>{horse.fatigue}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 62, flex: '0 0 auto', fontSize: 10, letterSpacing: '.08em', color: 'var(--u-ink-light-3)' }}>調子</span>
              <span style={{ flex: '1 1 auto', display: 'flex', gap: 3, height: 12 }}>
                {Array.from({ length: CONDITION_STEPS }, (_, i) => (
                  <span key={i} style={{ flex: 1, background: i < horse.condition ? 'var(--u-gold)' : 'rgba(251,247,236,.2)' }} />
                ))}
              </span>
              <span style={{ flex: '0 0 auto', width: 42, textAlign: 'right', fontSize: 12 }}>{cond.mark}</span>
            </div>
          </div>
        </div>

        {/* ★メニュー列 */}
        <div style={{ flex: '1 1 320px', minWidth: 0, maxWidth: 460, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(104px,1fr))', gap: 8 }}>
            {TRAINING_MENUS.map((m) => {
              const on = m.id === menuId;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => { setMenuId(m.id); }}
                  style={{
                    minHeight: 52, borderRadius: 10, padding: '6px 8px',
                    border: on ? '3px solid var(--u-gold)' : '3px solid rgba(251,247,236,.3)',
                    backgroundImage: on ? 'linear-gradient(#3c6d99,#123f6b)' : undefined,
                    background: on ? undefined : 'var(--u-panel)',
                    boxShadow: on ? '0 4px 0 var(--u-navy-deep)' : undefined,
                    color: 'var(--u-ink-light)',
                  }}
                >
                  <span style={{ display: 'block', fontSize: 14 }}>{m.name}</span>
                  {/* ★疲労も EP も名簿から（★画面に数を書かない・D-052） */}
                  <span style={{ display: 'block', fontSize: 10, fontWeight: 500, color: 'var(--u-ink-light-3)' }}>
                    疲労 {m.fatigueDelta > 0 ? `+${m.fatigueDelta}` : `−${Math.abs(m.fatigueDelta)}`}
                  </span>
                </button>
              );
            })}
          </div>
          {/* ★説明は常に 1〜2 行（★資料 §8-3）。★主効果・副効果も名簿から */}
          <div style={{
            padding: '8px 11px', border: '2px solid rgba(251,247,236,.28)', borderRadius: 12,
            background: 'var(--u-panel)', fontSize: 12, fontWeight: 500, lineHeight: 1.6,
          }}>
            {spec.main}　／　副効果 {spec.sub}　／　消費 {spec.ep} EP
            {spec.banner !== undefined && (
              <span style={{ display: 'block', marginTop: 4, color: spec.banner.kind === 'bad' ? '#f06a5f' : 'var(--u-gold)' }}>
                {spec.banner.text}
              </span>
            )}
          </div>
        </div>
      </div>

      <div style={{
        position: 'relative', flex: '0 0 auto', display: 'flex', flexWrap: 'wrap', gap: 10,
        padding: '10px 14px var(--u-safe-bottom)', width: '100%', maxWidth: 1220, margin: '0 auto',
      }}>
        <BigButton tone="disabled" label="調教指示は準備中" sub="現在、この画面からの指示は保存されません" grow="1.4 1 210px" />
        <BigButton tone="ivory" label="ダッシュボード" sub="いつでも戻れます" href="/home" grow="1 1 130px" />
      </div>
    </div>
  );
}
