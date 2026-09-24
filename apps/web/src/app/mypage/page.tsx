'use client';

import { useState } from 'react';
import { Backdrop, BigButton, ChibiHorse, EpCapsule, PpCapsule, TopBar, useMotionPaused } from '../../components/uma/uma-parts';
import { RaceStrip } from '../../components/uma/race-strip';
import { SignOutButton } from '../../components/uma/sign-out';
import { useStableView } from '../../components/uma/use-stable-view';
import { conditionView, sortStable } from '../../lib/stable';

const CONDITION_STEPS = 5;

export default function MyPage(): React.ReactElement {
  const [paused, toggle] = useMotionPaused();
  const { view, loading, error, refresh } = useStableView();
  const [selected, setSelected] = useState<string | null>(null);
  const horses = sortStable(view?.horses ?? []);
  const horse = horses.find((candidate) => candidate.id === selected) ?? horses[0] ?? null;

  return <div data-theme="uma" className={paused ? 'u-paused' : undefined} style={{
    position: 'relative', width: '100%', minHeight: '100dvh', overflow: 'hidden',
    containerType: 'inline-size', background: 'var(--u-navy)', display: 'flex', flexDirection: 'column',
  }}>
    <Backdrop />
    <TopBar title="マイページ" paused={paused} onToggle={toggle} />
    <RaceStrip />

    <div style={{ position: 'relative', display: 'flex', gap: 10, padding: '10px 14px 0', width: '100%', maxWidth: 1220, margin: '0 auto' }}>
      {view && <><EpCapsule value={view.home.epBalance} /><PpCapsule value={view.home.ppBalance} /></>}
      {!view && <span>{loading ? '厩舎を読み込み中…' : '厩舎を取得できませんでした'}</span>}
    </div>
    {error && <div role="alert" style={{ position: 'relative', padding: '8px 14px', fontSize: 12 }}>
      {error}　<a href="/login">ログイン</a>　<button type="button" onClick={refresh}>再読み込み</button>
    </div>}

    <main style={{ position: 'relative', flex: '1 1 auto', minHeight: 0, overflow: 'auto', padding: '12px 14px 0', width: '100%', maxWidth: 1220, margin: '0 auto', display: 'flex', flexWrap: 'wrap', gap: 12, alignContent: 'flex-start' }}>
      <section aria-label="厩舎の馬" style={{ flex: '1 1 330px', minWidth: 0, border: '2px solid rgba(246,194,28,.45)', borderRadius: 12, background: 'var(--u-paper)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '9px 12px', background: 'var(--u-navy)', borderBottom: '3px solid var(--u-gold)' }}>
          <strong>厩舎の馬</strong><span style={{ fontSize: 11 }}>{view ? `${horses.length} 頭` : loading ? '読み込み中' : 'ログイン後に表示'}</span>
        </div>
        {view && horses.length === 0 && <div style={{ padding: 18, color: 'var(--u-ink-dark)' }}>
          まだ持ち馬がいません。<a href="/setup" style={{ textDecoration: 'underline' }}>最初の1頭を迎える</a>
        </div>}
        {horses.map((entry) => <button key={entry.id} type="button" onClick={() => { setSelected(entry.id); }}
          aria-pressed={entry.id === horse?.id} style={{
            display: 'flex', alignItems: 'center', gap: 10, width: '100%', minHeight: 58, padding: '8px 12px', textAlign: 'left',
            border: 0, borderBottom: '1px solid var(--u-rule)', background: entry.id === horse?.id ? '#fff4cf' : 'var(--u-paper)', color: 'var(--u-ink-dark)',
          }}>
          <span style={{ flex: 1, minWidth: 0 }}><strong style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.name}</strong>
            <small>{entry.sexAge}・{entry.classLabel}</small></span>
          <span style={{ fontSize: 11 }}>{entry.week.kind === 'rest' ? '休養中' : '在厩中'}</span>
        </button>)}
      </section>

      {horse && <section aria-label={`${horse.name}の情報`} style={{ flex: '1 1 290px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ minHeight: 210, position: 'relative', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', border: '2px solid rgba(251,247,236,.28)', borderRadius: 12, background: 'var(--u-panel)', overflow: 'hidden' }}>
          <strong style={{ position: 'absolute', top: 10, left: 12 }}>{horse.name}</strong>
          <ChibiHorse running={false} width={230} height={186} />
        </div>
        <div style={{ padding: 12, border: '2px solid rgba(251,247,236,.28)', borderRadius: 12, background: 'var(--u-panel)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}><span>調子</span><strong>{conditionView(horse.condition).label}</strong></div>
          <div aria-hidden style={{ display: 'flex', gap: 4, marginTop: 8 }}>{Array.from({ length: CONDITION_STEPS }, (_, index) => <span key={index} style={{ flex: 1, height: 10, background: index < horse.condition ? 'var(--u-gauge)' : 'rgba(251,247,236,.2)' }} />)}</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12 }}><span>疲労</span><strong>{horse.fatigue}</strong></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12 }}><span>次走</span><strong>{horse.nextRace ?? '未定'}</strong></div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <a href="/records" style={{ minHeight: 44, padding: '12px', border: '2px solid var(--u-gold)', borderRadius: 8 }}>出走記録</a>
          <a href="/entry" style={{ minHeight: 44, padding: '12px', border: '2px solid var(--u-gold)', borderRadius: 8 }}>出走登録</a>
        </div>
      </section>}
    </main>

    <div style={{ position: 'relative', display: 'flex', flexWrap: 'wrap', gap: 10, padding: '10px 14px var(--u-safe-bottom)', width: '100%', maxWidth: 1220, margin: '0 auto' }}>
      <BigButton tone="gold" label="育成モードへ" sub="調教を確認する" href="/train" grow="1.4 1 210px" />
      <BigButton tone="ivory" label="ダッシュボード" sub="いつでも戻れます" href="/home" grow="1 1 130px" />
      {/*
        🔴 ★**ログアウトはここ 1 か所です**（★2026-09-25・オーナー指摘「★ログアウトボタンがありません」）。
           ★これまでサイトのどこにも無く、★**別の口座に切り替えられません**でした。
        ⚠️ ★置き場所を増やすなら、★この画面（★本人の牧場）から動かすこと。
           ★毎画面に置くと、★誤って押す事故が増えます。
      */}
      <SignOutButton grow="1 1 130px" />
    </div>
  </div>;
}
