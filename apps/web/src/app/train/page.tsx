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
 * ⚠️ ★**顔アップ枠は仮です** — ★同じ絵を拡大して顔だけ切り出しています。
 *    ★**表情 3 種のアセット**（上機嫌・平常・疲れ）は**未作成**で、★デザイナー待ちです（★資料 §11）。
 */

import { useEffect, useRef, useState } from 'react';
import {
  Backdrop, BigButton, NoticeBar, TopBar, useMotionPaused,
} from '../../components/uma/uma-parts';

/** ★実行してから待機に戻るまで（★資料 §9 の 3200ms） */
const RUN_MS = 3200;

/** ★6 メニュー（★資料 §8-3。★効果の値は `@star/training` に繋ぐ便で引きます） */
const MENUS = [
  { id: 0, name: '追い切り', caption: '強め・疲れる' },
  { id: 1, name: '坂路', caption: '力を作る' },
  { id: 2, name: 'プール', caption: '疲れを抜く' },
  { id: 3, name: '軽めの調整', caption: '整える' },
  { id: 4, name: '休養', caption: '回復に専念' },
  { id: 5, name: '馬房で様子見', caption: '何もしない' },
] as const;

/** ★選んだメニューの説明（★常に 1〜2 行出す・資料 §8-3） */
const MENU_NOTE: readonly string[] = [
  '強く追います。力は付きますが、疲れが大きく残ります。調子が落ちているときは避けてください。',
  '坂を使って力を作ります。疲れは中くらいです。',
  '水の中で動かします。疲れを抜きながら少しだけ鍛えられます。',
  '軽く流します。仕上げの週や、レースの前後に向いています。',
  '休ませます。疲れがよく抜けます。',
  '何もしません。様子を見たい週に。',
];

const CONDITION_STEPS = 5;

export default function TrainPage(): React.ReactElement {
  const [paused, toggle] = useMotionPaused();
  const [menu, setMenu] = useState(1);
  const [running, setRunning] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => { if (timer.current !== undefined) clearTimeout(timer.current); }, []);
  const run = (): void => {
    if (timer.current !== undefined) clearTimeout(timer.current);
    setRunning(true);
    timer.current = setTimeout(() => { setRunning(false); }, RUN_MS);
  };

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
      <NoticeBar
        kind="soon"
        text="第12R 発走まで 3:20（芝1600m・12頭）"
        actionLabel="投票する"
        actionHref="/vote"
      />

      <div style={{
        position: 'relative', flex: '1 1 auto', minHeight: 0, display: 'flex', flexWrap: 'wrap',
        alignItems: 'stretch', gap: 12, padding: '12px 14px 0',
        width: '100%', maxWidth: 1220, margin: '0 auto', overflow: 'hidden',
      }}>
        {/* ★調教ステージ */}
        <div style={{
          flex: '1 1 340px', minWidth: 0, minHeight: 226, position: 'relative',
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
          border: '2px solid rgba(246,194,28,.45)', borderRadius: 14, background: 'rgba(6,18,30,.28)', overflow: 'hidden',
        }}>
          {/* ★左上の 2 札（選んだメニュー／状態） */}
          <div style={{ position: 'absolute', left: 10, top: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ padding: '5px 9px', border: '2px solid var(--u-gold)', borderRadius: 999, background: 'var(--u-panel-strong)', fontSize: 11 }}>
              {MENUS[menu]!.name}
            </span>
            <span style={{ padding: '5px 9px', border: '2px solid rgba(251,247,236,.35)', borderRadius: 999, background: 'var(--u-panel)', fontSize: 11, fontWeight: 700 }}>
              {running ? '調教中' : '待機中'}
            </span>
          </div>

          {/* ★顔アップ枠（★仮。★表情 3 種は未作成・デザイナー待ち） */}
          <div style={{ position: 'absolute', right: 10, top: 10, width: 96, border: '3px solid var(--u-gold)', borderRadius: 12, background: 'var(--u-panel-strong)', overflow: 'hidden' }}>
            <div style={{
              height: 74, background: "url('/art/uma/chibi-horse.png') no-repeat",
              backgroundSize: '330%', backgroundPosition: '84% 36%',
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
            <span style={{
              position: 'absolute', inset: 0,
              background: "url('/art/uma/chibi-horse.png') no-repeat bottom center/contain",
              filter: 'drop-shadow(0 8px 12px rgba(8,18,8,.45))',
            }} />
          </div>

          {/* ★ゲージ（★スタミナ・調子。★これ以外に機械的な表示を増やさない） */}
          <div style={{
            position: 'absolute', left: 10, right: 10, bottom: 10, display: 'flex', flexDirection: 'column', gap: 5,
            padding: '8px 10px', borderRadius: 10, background: 'rgba(10,35,64,.78)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 62, flex: '0 0 auto', fontSize: 10, letterSpacing: '.08em', color: 'var(--u-ink-light-3)' }}>スタミナ</span>
              <span style={{ flex: '1 1 auto', height: 12, background: 'rgba(251,247,236,.18)', borderRadius: 2, overflow: 'hidden' }}>
                <span style={{ display: 'block', width: '72%', height: '100%', background: 'var(--u-gauge)' }} />
              </span>
              <span className="u-num" style={{ flex: '0 0 auto', width: 42, textAlign: 'right', fontSize: 16 }}>72</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 62, flex: '0 0 auto', fontSize: 10, letterSpacing: '.08em', color: 'var(--u-ink-light-3)' }}>調子</span>
              <span style={{ flex: '1 1 auto', display: 'flex', gap: 3, height: 12 }}>
                {Array.from({ length: CONDITION_STEPS }, (_, i) => (
                  <span key={i} style={{ flex: 1, background: i < 4 ? 'var(--u-gold)' : 'rgba(251,247,236,.2)' }} />
                ))}
              </span>
              <span style={{ flex: '0 0 auto', width: 42, textAlign: 'right', fontSize: 12 }}>◎</span>
            </div>
          </div>
        </div>

        {/* ★メニュー列 */}
        <div style={{ flex: '1 1 320px', minWidth: 0, maxWidth: 460, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(104px,1fr))', gap: 8 }}>
            {MENUS.map((m) => {
              const on = m.id === menu;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => { setMenu(m.id); }}
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
                  <span style={{ display: 'block', fontSize: 10, fontWeight: 500, color: 'var(--u-ink-light-3)' }}>{m.caption}</span>
                </button>
              );
            })}
          </div>
          <div style={{
            padding: '8px 11px', border: '2px solid rgba(251,247,236,.28)', borderRadius: 12,
            background: 'var(--u-panel)', fontSize: 12, fontWeight: 500, lineHeight: 1.6,
          }}>
            {MENU_NOTE[menu]}
          </div>
        </div>
      </div>

      <div style={{
        position: 'relative', flex: '0 0 auto', display: 'flex', flexWrap: 'wrap', gap: 10,
        padding: '10px 14px var(--u-safe-bottom)', width: '100%', maxWidth: 1220, margin: '0 auto',
      }}>
        <BigButton tone="gold" label="この内容で調教する" sub={MENUS[menu]!.name} onClick={run} grow="1.4 1 210px" />
        <BigButton tone="ivory" label="ダッシュボード" sub="いつでも戻れます" href="/home" grow="1 1 130px" />
      </div>
    </div>
  );
}
