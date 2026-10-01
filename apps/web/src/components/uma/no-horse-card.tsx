'use client';

/**
 * ★**馬がいないとき・入れないときの案内**（★2026-10-01・デザイナー R-26 D26-2・オーナー「馬がいない状態を UI で工夫して・ログインしているのにログインがあるのはおかしい」）。
 *   ★ホーム・育成モード・わたしの馬で同じ部品。★芝と内ラチの上に ★馬の影絵（★`/art/uma/chibi-horse.png`・★新しい絵は使わない）と吹き出し、
 *   ★その下に紺の板（見出し・本文・★無償の 1 頭の 3 つの段）。
 *   ★出し分け: ログイン前 ／ 初回設定前 ／ 読めなかった（★誤りの帯・R-21 §3）／ ★馬 0 頭（無償の 1 頭を受け取れる段・受け取り済み）。
 *   ★「ログイン」は ★ログインしていないときだけ。★段は ★`my_onboarding_state` から（★画面で導かない）。
 *   ⚠️ ★見本の本文「数日で仔馬が生まれます」の ★日数は ★書いていません（★測っていない値を画面に書かない・claims）。
 */
import type React from 'react';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { BigButton, NoticeBar } from './uma-parts';
import { fetchOnboardingState, type OnboardingStage } from '../../lib/onboarding';
import { SignInRequiredError } from '../../lib/stable-repo';

type Kind = 'login' | 'setup' | 'error' | 'foal' | 'waiting' | 'naming' | 'bought';

const STEPS = ['父母を選ぶ', '生まれる', '名前を付ける'] as const;

export function NoHorseCard({ needsLogin, needsSetup, error }: {
  readonly needsLogin: boolean;
  readonly needsSetup: boolean;
  readonly error: string | null;
  /** ★旧い呼び出しの互換（★再読み込みは誤りの帯が持つ） */
  readonly onRetry?: () => void;
}): React.ReactElement {
  const here = usePathname() ?? '/home';
  const base = needsLogin ? 'login' : needsSetup ? 'setup' : error !== null ? 'error' : 'empty';
  const [stage, setStage] = useState<OnboardingStage | null>(null);
  /** ★段を読むときに セッションが切れていたら ★ログインの案内（★`owner-scoped-needs-session`） */
  const [signedOut, setSignedOut] = useState(false);
  useEffect(() => {
    if (base !== 'empty') return undefined;
    let active = true;
    fetchOnboardingState().then((s) => { if (active) setStage(s.stage); }, (e: unknown) => {
      if (active && e instanceof SignInRequiredError) setSignedOut(true);
      /* ★それ以外で読めないときは 受け取り済みの扱い（馬市場だけ） */
    });
    return () => { active = false; };
  }, [base]);
  const kind: Kind = signedOut ? 'login' : base !== 'empty' ? base
    : stage === 'choose_parents' ? 'foal' : stage === 'waiting_birth' ? 'waiting' : stage === 'naming' ? 'naming' : 'bought';

  /** ★読めなかった: ★生の文は出さず ★誤りの帯（★R-21 §3・再読み込み） */
  if (kind === 'error') return <NoticeBar kind="soon" text="厩舎を読み込めませんでした" actionLabel="再読み込み" actionHref={here} />;

  const bubble = kind === 'bought' ? '市場で待っています' : kind === 'waiting' || kind === 'naming' ? 'もうすぐ会えます'
    : kind === 'foal' ? 'どんな仔が生まれる？' : '牧場で待っています';
  const title = kind === 'login' ? 'ログインして牧場を見る' : kind === 'setup' ? '牧場をはじめましょう' : 'まだ馬がいません';
  const body = kind === 'login' ? 'アカウントにログインすると、持ち馬やポイントを確認できます。'
    : kind === 'setup' ? '牧場名を決めて、最初の馬を迎えましょう。'
      : kind === 'bought' ? '馬市場で 1 頭を迎えると、ここで調教やレースへの登録ができます。'
        : kind === 'foal' ? 'はじめての 1 頭は無償で生まれます。父と母を選ぶと、仔馬が生まれます。'
          : 'はじめての 1 頭が、もうすぐ生まれます。生まれたら名前を付けて、育成を始めましょう。';
  /** ★いまの段（★0 始まり・★無償の 1 頭の段だけ） */
  const current = kind === 'foal' ? 0 : kind === 'waiting' ? 1 : kind === 'naming' ? 2 : -1;

  return (
    <div style={{ position: 'relative', width: '100%', maxWidth: 880, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* ★芝と内ラチの上に 馬の影絵と吹き出し（★高さ 250・左右いっぱい） */}
      <div aria-hidden style={{ position: 'relative', height: 250, margin: '0 -14px', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 120, background: "url('/art/parallax/backstretch-side-v1/turf-near.webp') repeat 0 0/1500px 90px" }} />
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 104, height: 30, background: "url('/art/parallax/backstretch-side-v1/inner-rail.webp') repeat-x 0 0/auto 100%" }} />
        <div className="u-no-horse-bob" style={{
          position: 'absolute', left: '50%', bottom: 22, width: 200, height: 206, transform: 'translateX(-50%)',
          background: "url('/art/uma/chibi-horse.png') no-repeat bottom center/contain", filter: 'brightness(0) opacity(.55)',
        }} />
        <div style={{ position: 'absolute', left: '50%', bottom: 16, width: 150, height: 16, transform: 'translateX(-50%)', borderRadius: '50%', background: 'rgba(8,18,8,.45)' }} />
        <div style={{
          position: 'absolute', left: '50%', top: 22, transform: 'translateX(60px)', padding: '6px 12px', borderRadius: 12,
          background: '#fbf7ec', color: '#10243a', fontSize: 13, border: '3px solid #0a2340', boxShadow: '0 3px 0 rgba(10,35,64,.6)', whiteSpace: 'nowrap',
        }}>{bubble}</div>
      </div>
      <div role="status" style={{
        display: 'flex', flexDirection: 'column', gap: 10, padding: 14, borderRadius: 14,
        background: 'rgba(10,35,64,.92)', border: '2px solid #f6c21c', color: '#fbf7ec',
      }}>
        <strong style={{ fontSize: 20, lineHeight: 1.35 }}>{title}</strong>
        <span style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.7, color: '#e6eef6' }}>{body}</span>
        {current >= 0 && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'stretch' }}>
            {STEPS.map((t, i) => {
              const cur = i === current, done = i < current;
              return (
                <div key={t} style={{
                  flex: '1 1 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '8px 4px', borderRadius: 10,
                  background: cur ? 'rgba(246,194,28,.18)' : '#061a33', border: cur ? '2px solid #f6c21c' : '1px solid rgba(251,247,236,.22)',
                  color: cur || done ? '#fbf7ec' : '#cfe0ee',
                }}>
                  <span style={{
                    width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: cur ? '#f6c21c' : done ? '#57c8a8' : 'rgba(251,247,236,.2)', color: cur || done ? '#10243a' : '#fbf7ec', fontSize: 14,
                  }}>{done ? '✓' : String(i + 1)}</span>
                  <span style={{ fontSize: 12, textAlign: 'center', lineHeight: 1.3 }}>{t}</span>
                </div>
              );
            })}
          </div>
        )}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 4 }}>
          {kind === 'login' && <BigButton tone="gold" label="ログインへ" href="/login" grow="1 1 100%" />}
          {kind === 'setup' && <BigButton tone="gold" label="牧場の初回設定へ" href="/setup" grow="1 1 100%" />}
          {kind === 'foal' && <BigButton tone="gold" label="はじめての 1 頭を迎える" sub="無償 ・ 父母を選ぶところから" href="/stable/foal" grow="1.4 1 230px" />}
          {kind === 'waiting' && <BigButton tone="gold" label="生まれるのを見る" sub="無償の 1 頭" href="/stable/foal" grow="1.4 1 230px" />}
          {kind === 'naming' && <BigButton tone="gold" label="生まれた仔に名前を付ける" sub="無償の 1 頭" href="/stable/foal" grow="1.4 1 230px" />}
          {(kind === 'foal' || kind === 'waiting' || kind === 'naming') && <BigButton tone="ivory" label="馬市場を見る" sub="参加ポイントで迎える" href="/stable/market" grow="1 1 150px" />}
          {kind === 'bought' && <BigButton tone="gold" label="馬市場を見る" sub="参加ポイントで迎える" href="/stable/market" grow="1 1 100%" />}
        </div>
      </div>
    </div>
  );
}
