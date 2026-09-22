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
 * ★EP・PP・持ち馬は本人の公開可能なデータを読みます。
 */

import { useEffect, useRef, useState } from 'react';
import {
  Backdrop, BigButton, ChibiHorse, EpCapsule, PpCapsule, TopBar, useMotionPaused,
} from '../../components/uma/uma-parts';
import { RaceStrip } from '../../components/uma/race-strip';
import { useStableView } from '../../components/uma/use-stable-view';

/** ★馬をタップしてから待機に戻るまで（★資料 §9 の 2600ms） */
const POKE_MS = 2600;

/** ★調子の段の数（★5 分割・資料 §8-2） */
const CONDITION_STEPS = 5;

export default function HomePage(): React.ReactElement {
  const [paused, toggle] = useMotionPaused();
  const { view, loading, error, needsSetup, needsLogin, refresh } = useStableView();
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

  const horses = view?.horses ?? [];
  const horse = horses[index % horses.length] ?? null;
  const move = (step: number): void => {
    if (horses.length > 0) setIndex((i) => (i + step + horses.length) % horses.length);
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
        {view && <><EpCapsule value={view.home.epBalance} /><PpCapsule value={view.home.ppBalance} /></>}
        {!view && loading && <span>厩舎を読み込み中…</span>}
      </div>

      <RaceStrip />

      {/* ★中段: 馬ステージ → 馬名 */}
      <div style={{
        position: 'relative', flex: '1 1 auto', minHeight: 0, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'flex-end', padding: '10px 14px 0',
        width: '100%', maxWidth: 1220, margin: '0 auto',
      }}>
        {/* ★馬ステージ（★全幅ブリード） */}
        <div style={{
          flex: '1 1 auto', minHeight: 280, position: 'relative', width: 'calc(100% + 28px)', margin: '0 -14px',
          display: 'flex', alignItems: horse ? 'flex-end' : 'center', justifyContent: 'center', overflow: 'hidden',
        }}>
          {horse ? <><ChibiHorse running={running} onClick={poke} />
          <button type="button" onClick={() => { move(-1); }} aria-label="前の馬" style={arrow('left')}>‹</button>
          <button type="button" onClick={() => { move(1); }} aria-label="次の馬" style={arrow('right')}>›</button>
          <span style={{
            position: 'absolute', right: 24, bottom: 8, padding: '6px 10px',
            border: '2px solid var(--u-gold)', borderRadius: 999, background: 'var(--u-panel-strong)', fontSize: 11,
          }}>タップで動く</span></> : view ? <span>持ち馬はまだいません</span> : !loading && (
            <div role={needsSetup || needsLogin ? 'status' : 'alert'} style={{
              width: '100%', maxWidth: 520, padding: '24px 22px', borderRadius: 16,
              border: '2px solid var(--u-gold)', background: 'rgba(8,18,8,.84)',
              color: 'var(--u-ink)', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 14,
            }}>
              <strong style={{ fontSize: 22, lineHeight: 1.4 }}>
                {needsSetup ? '牧場をはじめましょう' : needsLogin ? 'ログインして牧場を見る' : '厩舎を読み込めませんでした'}
              </strong>
              <span style={{ fontSize: 14, lineHeight: 1.7 }}>
                {needsSetup ? 'メール確認とログインができました。牧場名を決めて、最初の馬を迎えましょう。' : needsLogin ? 'アカウントにログインすると、持ち馬やポイントを確認できます。' : error}
              </span>
              {needsSetup ? <BigButton tone="gold" label="牧場の初回設定へ" href="/setup" grow="0 0 auto" />
                : needsLogin ? <BigButton tone="gold" label="ログインへ" href="/login" grow="0 0 auto" />
                  : <button type="button" onClick={refresh} style={{ minHeight: 48, borderRadius: 10, border: '2px solid var(--u-gold)', background: 'var(--u-gold)', color: '#172514', fontSize: 16, fontWeight: 900 }}>もう一度読み込む</button>}
            </div>
          )}
        </div>

        {/* ★馬名プレート（★名前・属性・調子・現在位置） */}
        {(view || loading) && <div style={{
          display: 'flex', alignItems: 'center', gap: 10, width: '100%', maxWidth: 520, marginTop: 6,
          padding: '7px 12px', border: '2px solid rgba(246,194,28,.5)', borderRadius: 12, background: 'rgba(10,35,64,.82)',
        }}>
          <span style={{ minWidth: 0, flex: '1 1 auto' }}>
            <span style={{ display: 'block', fontSize: 16, lineHeight: 1.25, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {horse?.name ?? (loading ? '読み込み中' : '持ち馬はまだいません')}
            </span>
            <span style={{ display: 'block', marginTop: 2, fontSize: 11, fontWeight: 500, color: 'var(--u-ink-light-3)' }}>
              {horse ? `${horse.sexAge}・${horse.classLabel}` : ''}
            </span>
          </span>
          <span style={{ flex: '0 0 auto', textAlign: 'right' }}>
            <span style={{ display: 'block', fontSize: 10, letterSpacing: '.1em', color: 'var(--u-ink-light-3)' }}>調子</span>
            <span style={{ display: 'flex', gap: 3, marginTop: 4, height: 14, alignItems: 'flex-end' }}>
              {Array.from({ length: CONDITION_STEPS }, (_, i) => (
                <span key={i} style={{ width: 7, height: '100%', background: horse && i < horse.condition ? 'var(--u-ep)' : 'rgba(251,247,236,.25)' }} />
              ))}
            </span>
          </span>
          <span style={{ flex: '0 0 auto', display: 'flex', gap: 4 }}>
            {horses.map((h, i) => (
              <span key={h.id} style={{
                width: 9, height: 9, borderRadius: '50%',
                background: i === index ? 'var(--u-gold)' : 'rgba(251,247,236,.3)',
              }} />
            ))}
          </span>
        </div>}
      </div>

      {/* ★6 ボタン（★B-5 の 6 語・390 は 2 列×3 段／1280 は 6 列） */}
      <div style={{
        position: 'relative', flex: '0 0 auto', display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10,
        padding: '10px 14px var(--u-safe-bottom)', width: '100%', maxWidth: 1220, margin: '0 auto',
      }}>
        {/*
          ⚠️ ★行き先は ★**馬物語 UI の新しいルート**です（★`/training`・`/races`・`/stable`・`/prizes` は
             ★arcade 版が生きており、★**同じ URL を奪うと既存が消えます**。★切り替えはオーナー判断・報告 §3）。
        */}
        <BigButton tone="gold" label="育成モード" sub="持ち馬の状態を確認" href="/train" grow="1 1 150px" />
        <BigButton tone="blue" label="投票モード" sub="出馬表・マークシート" href="/vote" grow="1 1 150px" />
        <BigButton tone="ivory" label="マイページ" sub="厩舎・持ち馬の状態" href="/mypage" grow="1 1 150px" />
        <BigButton tone="ivory" label="ポイントを稼ぐ" sub="受け取り機能は準備中" href="/earn" grow="1 1 150px" />
        <BigButton tone="ivory" label="景品交換" sub="賞金ポイントで交換" href="/exchange" grow="1 1 150px" />
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
