'use client';

/**
 * ★**馬がいないとき・入れないときの案内 1 枚**（★2026-10-01・オーナー「馬がいない状態を UI で工夫して・ログインしているのにログインがあるのはおかしい」）。
 *   ★ホームと育成モードで同じ形（★見た目は既存の「牧場をはじめましょう」の金枠のカードと `BigButton`・★新しい意匠は作らない）。
 *   ★出し分けは 4 つ: ログインしていない ／ 牧場がまだ ／ 読めなかった ／ ★牧場はあるが馬が 0 頭。
 *   ★「ログイン」は ★ログインしていないときだけ出す（★旧: 育成モードで常に出ていた）。
 *   ★馬が 0 頭のときの行き先は ★無償の 1 頭を受け取れる段階（★`my_onboarding_state`: 父母を選ぶ・誕生待ち・名付け）なら ★`/stable/foal`、
 *   ★受け取り済み・古い口座・読めないときは ★`/stable/market`（★買う）。★無償と書くのは 受け取れるときだけ（★段階は画面で導かない）。
 */
import type React from 'react';
import { useEffect, useState } from 'react';
import { BigButton } from './uma-parts';
import { fetchOnboardingState, type OnboardingStage } from '../../lib/onboarding';

export function NoHorseCard({ needsLogin, needsSetup, error, onRetry }: {
  readonly needsLogin: boolean;
  readonly needsSetup: boolean;
  readonly error: string | null;
  readonly onRetry: () => void;
}): React.ReactElement {
  const kind = needsLogin ? 'login' : needsSetup ? 'setup' : error !== null ? 'error' : 'empty';
  const [stage, setStage] = useState<OnboardingStage | null>(null);
  useEffect(() => {
    if (kind !== 'empty') return undefined;
    let active = true;
    fetchOnboardingState().then((s) => { if (active) setStage(s.stage); }, () => { /* ★読めないときは 買う案内だけ */ });
    return () => { active = false; };
  }, [kind]);
  const foal = stage === 'choose_parents' || stage === 'waiting_birth' || stage === 'naming';
  const foalLabel = stage === 'waiting_birth' ? '生まれるのを見る' : stage === 'naming' ? '生まれた仔に名前を付ける' : 'はじめての 1 頭を迎える';
  const title = { login: 'ログインして牧場を見る', setup: '牧場をはじめましょう', error: '厩舎を読み込めませんでした', empty: 'まだ馬がいません' }[kind];
  const body = {
    login: 'アカウントにログインすると、持ち馬やポイントを確認できます。',
    setup: 'メール確認とログインができました。牧場名を決めて、最初の馬を迎えましょう。',
    error: error ?? '',
    empty: foal ? 'はじめての 1 頭は無償で生まれます。迎えたら、ここで調教やレースへの登録ができます。'
      : '市場で馬を迎えると、ここで調教やレースへの登録ができます。',
  }[kind];
  return (
    <div role={kind === 'error' ? 'alert' : 'status'} style={{
      width: '100%', maxWidth: 520, padding: '24px 22px', borderRadius: 16,
      border: '2px solid var(--u-gold)', background: 'rgba(8,18,8,.84)',
      color: 'var(--u-ink)', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 14,
    }}>
      <strong style={{ fontSize: 22, lineHeight: 1.4 }}>{title}</strong>
      <span style={{ fontSize: 14, lineHeight: 1.7 }}>{body}</span>
      {kind === 'login' && <BigButton tone="gold" label="ログインへ" href="/login" grow="0 0 auto" />}
      {kind === 'setup' && <BigButton tone="gold" label="牧場の初回設定へ" href="/setup" grow="0 0 auto" />}
      {kind === 'error' && <button type="button" onClick={onRetry} style={{ minHeight: 48, borderRadius: 10, border: '2px solid var(--u-gold)', background: 'var(--u-gold)', color: '#172514', fontSize: 16, fontWeight: 900 }}>もう一度読み込む</button>}
      {kind === 'empty' && <>
        {foal && <BigButton tone="gold" label={foalLabel} sub="無償" href="/stable/foal" grow="0 0 auto" />}
        <BigButton tone={foal ? 'ivory' : 'gold'} label="馬を買う" sub="参加ポイントで" href="/stable/market" grow="0 0 auto" />
      </>}
    </div>
  );
}
