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

import { useState } from 'react';
import {
  Backdrop, BigButton, EpCapsule, OwnHorseFigure, PpCapsule, TopBar, useMotionPaused,
} from '../../components/uma/uma-parts';
import { RaceStrip } from '../../components/uma/race-strip';
import { FoalInvite } from '../../components/uma/foal-invite';
import { useStableView } from '../../components/uma/use-stable-view';
import { NoHorseCard } from '../../components/uma/no-horse-card';

/** ★調子の段の数（★5 分割・資料 §8-2） */
const CONDITION_STEPS = 5;

export default function HomePage(): React.ReactElement {
  const [paused, toggle] = useMotionPaused();
  const { view, loading, error, needsSetup, needsLogin, refresh } = useStableView();
  const [index, setIndex] = useState(0);
  /** ★ダッシュボードの馬は ★ずっと歩く（★2026-09-29・オーナー「常時表示される馬はずっと歩いているように」・★旧はタップで 2.6 秒だけ）。★止めるのは 停止スイッチと「動きを減らす」（CSS） */

  const horses = view?.horses ?? [];
  const horse = horses[index % horses.length] ?? null;
  const move = (step: number): void => {
    if (horses.length > 0) setIndex((i) => (i + step + horses.length) % horses.length);
  };

  return (
    <div
      data-theme="uma" data-page-body
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

      {/*
        ★**まだ無償の 1 頭を受け取っていない人にだけ出す案内**（★2026-09-24・案 A）。
        ⚠️ ★段階はこの部品が読みます（★玄関は何も知りません）。★該当しなければ何も描きません。
      */}
      <FoalInvite />

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
          {/* ★**その馬の姿**（★育成・レースと同じ毛色・★見本の絵ではない・2026-09-28 オーナー指示） */}
          {horse ? <><OwnHorseFigure horseId={horse.id} running style={{ marginBottom: 36 }} />
          {/* ★馬を替える矢印は ★2 頭以上の時だけ・★下の角に置いて 馬に被せない（★2026-09-29・オーナー「モバイルで△が馬に被る・1 頭の時は不要」） */}
          {horses.length > 1 && <>
            <button type="button" onClick={() => { move(-1); }} aria-label="前の馬" style={arrow('left')}>‹</button>
            <button type="button" onClick={() => { move(1); }} aria-label="次の馬" style={arrow('right')}>›</button>
          </>}</> : !loading && (
            /** ★馬がいない・入れない（★2026-10-01・オーナー「馬がいない状態を UI で工夫して」）。★育成モードと同じカード */
            <NoHorseCard needsLogin={needsLogin} needsSetup={needsSetup} error={view === null ? error : null} onRetry={refresh} />
          )}
        </div>

        {/* ★馬名プレート（★名前・属性・調子・現在位置） */}
        {/* ★馬がいないときは 名前の板を出さない（★旧: 真ん中と 2 か所に「持ち馬はまだいません」） */}
        {(horse !== null || loading) && <div style={{
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
        <BigButton tone="gold" label="育成モード" sub="今週の調教をする" href="/train" grow="1 1 150px" />
        <BigButton tone="blue" label="投票モード" sub="出馬表・マークシート" href="/vote" grow="1 1 150px" />
        <BigButton tone="ivory" label="マイページ" sub="厩舎と成績" href="/mypage" grow="1 1 150px" />
        {/*
          ★副題は ★レビュー側の暫定の語（★2026-09-28）。★「受け取り機能は準備中」は ★嘘でした（★毎日の受け取りは 09-25 に繋いだ・0091 で 2,000 EP）。
          ★デザイナーが語を返したら差し替える（★簿 HOME-EARN-SUBTITLE-PROVISIONAL）。
        */}
        <BigButton tone="ivory" label="ポイントを稼ぐ" sub="毎日の受け取りができます" href="/earn" grow="1 1 150px" />
        <BigButton tone="ivory" label="景品交換" sub="賞金ポイントで交換" href="/exchange" grow="1 1 150px" />
        <BigButton tone="ivory" label="使い方" sub="はじめての方へ" href="/howto" grow="1 1 150px" />
      </div>
    </div>
  );
}

/** ★持ち馬を巡る矢印（★48×48・当たりは 44px 以上） */
function arrow(side: 'left' | 'right'): React.CSSProperties {
  return {
    position: 'absolute', [side]: 10, bottom: 6, width: 48, height: 48,
    border: '3px solid var(--u-gold)', borderRadius: '50%', background: 'rgba(10,35,64,.86)',
    color: 'var(--u-ink-light)', fontSize: 20, fontWeight: 800,
  } as React.CSSProperties;
}
