'use client';

/**
 * ★**ダッシュボード（`/home`）— ログイン後の玄関**（★R-14・2026-09-17・引き渡し資料 §8-2）
 *
 * 【★この画面の役割】
 *   ★**全ページの戻り先**です。★どの画面からも「ダッシュボード」で戻ってきます。
 *   ★中継（レース演出）も ★**終了後は必ずここへ戻します**（★オーナー判定 B-1）。
 *
 * 【★守っていること】
 *   ★EP と PP は ★**別のカプセル**（★合算しない・憲法 §0.2）
 *   ★画面名は ★**B-5 の 6 語**（育成モード／投票モード／マイページ／ポイントを稼ぐ／景品交換／使い方）
 *   ★停止スイッチを常設（★§2-9）／★下端 34px の安全領域（★アプリ化）
 *   ★`a-*`・`.frame` を使わない（★A-2）
 *
 * ⚠️ ★**いまはデモの値です。** ★EP・PP・持ち馬・通知はサーバーに繋ぐまで見本の値を出します
 *    （★`lib/stable.ts` の `demoStableRepo` と同じ立場）。★画面に式を持ちません。
 */

import { useEffect, useRef, useState } from 'react';
import {
  Backdrop, BigButton, ChibiHorse, EpCapsule, NoticeBar, PpCapsule, TopBar, useMotionPaused,
} from '../../components/uma/uma-parts';

/** ★馬をタップしてから待機に戻るまで（★資料 §9 の 2600ms） */
const POKE_MS = 2600;

/** ★デモの持ち馬（★矢印で巡回する 3 頭） */
const DEMO_HORSES = [
  { name: 'ハルカゼノオト', meta: '3歳 牝・鹿毛', condition: 4 },
  { name: 'ミドリノトビラ', meta: '4歳 牝・芦毛', condition: 3 },
  { name: 'ヨアケノランナー', meta: '3歳 牡・栗毛', condition: 5 },
] as const;

/** ★調子の段の数（★5 分割・資料 §8-2） */
const CONDITION_STEPS = 5;

export default function HomePage(): React.ReactElement {
  const [paused, toggle] = useMotionPaused();
  const [index, setIndex] = useState(0);
  const [running, setRunning] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  /** ★タップで 2.6 秒だけ動く（★終わると待機に戻る） */
  useEffect(() => () => { if (timer.current !== undefined) clearTimeout(timer.current); }, []);
  const poke = (): void => {
    if (timer.current !== undefined) clearTimeout(timer.current);
    setRunning(true);
    timer.current = setTimeout(() => { setRunning(false); }, POKE_MS);
  };

  const horse = DEMO_HORSES[index]!;
  const move = (step: number): void => {
    setIndex((i) => (i + step + DEMO_HORSES.length) % DEMO_HORSES.length);
  };

  return (
    <div
      data-theme="uma"
      className={paused ? 'u-paused' : undefined}
      style={{
        position: 'relative', width: '100%', minHeight: '100dvh', overflow: 'hidden',
        containerType: 'inline-size', background: 'var(--u-navy)',
        display: 'flex', flexDirection: 'column',
      }}
    >
      <Backdrop />

      <TopBar title="" home paused={paused} onToggle={toggle} />

      {/* ★EP / PP（★別のカプセル・合算しない） */}
      <div style={{
        position: 'relative', flex: '0 0 auto', display: 'flex', gap: 10,
        padding: '10px 14px 0', width: '100%', maxWidth: 1220, margin: '0 auto',
      }}>
        <EpCapsule value={1240} />
        <PpCapsule value={380} />
      </div>

      {/* ★中段: 通知 → 馬ステージ → 馬名 */}
      <div style={{
        position: 'relative', flex: '1 1 auto', minHeight: 0, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'flex-end', padding: '76px 14px 0',
        width: '100%', maxWidth: 1220, margin: '0 auto',
      }}>
        <div style={{ position: 'absolute', left: 14, right: 14, top: 6 }}>
          <NoticeBar
            kind="soon"
            text="第12R 発走まで 3:20（芝1600m・12頭）"
            actionLabel="投票する"
            actionHref="/races"
          />
        </div>

        {/* ★馬ステージ（★全幅ブリード） */}
        <div style={{
          flex: '1 1 auto', minHeight: 280, position: 'relative', width: 'calc(100% + 28px)', margin: '0 -14px',
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center', overflow: 'hidden',
        }}>
          <ChibiHorse running={running} onClick={poke} />
          <button type="button" onClick={() => { move(-1); }} aria-label="前の馬" style={arrow('left')}>‹</button>
          <button type="button" onClick={() => { move(1); }} aria-label="次の馬" style={arrow('right')}>›</button>
          <span style={{
            position: 'absolute', right: 24, bottom: 8, padding: '6px 10px',
            border: '2px solid var(--u-gold)', borderRadius: 999, background: 'var(--u-panel-strong)', fontSize: 11,
          }}>タップで動く</span>
        </div>

        {/* ★馬名プレート（★名前・属性・調子・現在位置） */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, width: '100%', maxWidth: 520, marginTop: 6,
          padding: '7px 12px', border: '2px solid rgba(246,194,28,.5)', borderRadius: 12, background: 'rgba(10,35,64,.82)',
        }}>
          <span style={{ minWidth: 0, flex: '1 1 auto' }}>
            <span style={{ display: 'block', fontSize: 16, lineHeight: 1.25, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {horse.name}
            </span>
            <span style={{ display: 'block', marginTop: 2, fontSize: 11, fontWeight: 500, color: 'var(--u-ink-light-3)' }}>
              {horse.meta}
            </span>
          </span>
          <span style={{ flex: '0 0 auto', textAlign: 'right' }}>
            <span style={{ display: 'block', fontSize: 10, letterSpacing: '.1em', color: 'var(--u-ink-light-3)' }}>調子</span>
            <span style={{ display: 'flex', gap: 3, marginTop: 4, height: 14, alignItems: 'flex-end' }}>
              {Array.from({ length: CONDITION_STEPS }, (_, i) => (
                <span key={i} style={{ width: 7, height: '100%', background: i < horse.condition ? 'var(--u-ep)' : 'rgba(251,247,236,.25)' }} />
              ))}
            </span>
          </span>
          <span style={{ flex: '0 0 auto', display: 'flex', gap: 4 }}>
            {DEMO_HORSES.map((h, i) => (
              <span key={h.name} style={{
                width: 9, height: 9, borderRadius: '50%',
                background: i === index ? 'var(--u-gold)' : 'rgba(251,247,236,.3)',
              }} />
            ))}
          </span>
        </div>
      </div>

      {/* ★6 ボタン（★B-5 の 6 語・390 は 2 列×3 段／1280 は 6 列） */}
      <div style={{
        position: 'relative', flex: '0 0 auto', display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10,
        padding: '10px 14px var(--u-safe-bottom)', width: '100%', maxWidth: 1220, margin: '0 auto',
      }}>
        <BigButton tone="gold" label="育成モード" sub="調教・休養・体調" href="/training" grow="1 1 150px" />
        <BigButton tone="blue" label="投票モード" sub="出馬表・マークシート" href="/races" grow="1 1 150px" />
        <BigButton tone="ivory" label="マイページ" sub="厩舎・成績・血統" href="/stable" grow="1 1 150px" />
        <BigButton tone="ivory" label="ポイントを稼ぐ" sub="動画を見る・オファー" href="/earn" grow="1 1 150px" />
        <BigButton tone="ivory" label="景品交換" sub="賞金ポイントで交換" href="/prizes" grow="1 1 150px" />
        <BigButton tone="ivory" label="使い方" sub="はじめての方へ" href="/howto" grow="1 1 150px" />
      </div>
    </div>
  );
}

/** ★持ち馬を巡る矢印（★48×48・当たりは 44px 以上） */
function arrow(side: 'left' | 'right'): React.CSSProperties {
  return {
    position: 'absolute', [side]: 32, bottom: 104, width: 48, height: 48,
    border: '3px solid var(--u-gold)', borderRadius: '50%', background: 'rgba(10,35,64,.86)',
    color: 'var(--u-ink-light)', fontSize: 20, fontWeight: 800,
  } as React.CSSProperties;
}
