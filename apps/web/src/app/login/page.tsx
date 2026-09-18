'use client';

/**
 * ★ログイン（メール＋パスワード）— D-113・裁定 REVIEW_AUTH_EMAIL_PASSWORD_VERDICT_20260918 §6 手順 6
 *
 * 【★D-113 の制約】
 *   ① **自前で JWT を発行しない**。`authClient().auth.signInWithPassword()` を呼ぶだけ
 *   ② 寿命管理は `authClient()` 側でライブラリに任せている
 *   ③ **`auth.uid()` / RLS / 書き込み RPC は変更しない**
 *
 * 【★未確認の利用者はここで止まる】
 *   `mailer_autoconfirm = false` なので Supabase が `Email not confirmed` を返す。
 *   ★**ただし、それに頼らない** — 設定を戻されたときのために **DB 側にも重ねてある**
 *   （移行 `0030`・`assert_setup_complete`）。**2 枚で止める**（裁定 C-3）。
 *
 * 【★エラーの文言に推測を足さない】
 *   2026-09-18 に道具の側で推測を出して 2 度誤誘導した。ここでも**返ってきた言葉を出す**。
 *   ★ただし `Invalid login credentials` のような英語は、**利用者に分かる日本語に言い換える**
 *   （言い換えの対応表は下の `JA` 1 か所だけに置く・D-052）。
 */

import { useState } from 'react';

import {
  Backdrop, BigButton, NoticeBar, TopBar, useMotionPaused,
} from '../../components/uma/uma-parts';
import { authClient } from '../../lib/supabase';

/**
 * ★Supabase の文言 → 利用者に出す日本語（★対応表はここ 1 か所だけ）
 *   ⚠️ **当てはまらないものは、原文をそのまま出す**（勝手に「たぶん◯◯です」と書かない）
 */
const JA: readonly (readonly [RegExp, string])[] = [
  [/invalid login credentials/i, 'メールアドレスかパスワードが違います。'],
  [/email not confirmed/i, 'メールの確認がまだ済んでいません。届いたメールのリンクを開いてください。'],
  [/rate limit/i, '短い時間に何度も試したため、いまは受け付けられません。しばらくしてからお試しください。'],
];

function toJa(message: string): string {
  for (const [re, ja] of JA) if (re.test(message)) return ja;
  return message;
}

type State = 'form' | 'sending' | 'done';

export default function LoginPage(): React.ReactElement {
  const [paused, toggle] = useMotionPaused();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [state, setState] = useState<State>('form');
  const [error, setError] = useState<string | null>(null);

  const canSubmit = email.includes('@') && password.length > 0 && state === 'form';

  async function submit(): Promise<void> {
    setError(null);
    setState('sending');
    try {
      const { error: e } = await authClient().auth.signInWithPassword({ email, password });
      if (e !== null) {
        setError(toJa(e.message));
        setState('form');
        return;
      }
      setState('done');
      // ★入ったらダッシュボードへ（★口座が無ければ RPC 側が /setup へ誘導する・D-080）
      window.location.href = '/home';
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setState('form');
    }
  }

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
      <TopBar title="ログイン" backHref="/" paused={paused} onToggle={toggle} />
      <NoticeBar
        kind="soon"
        text="登録しなくても、中継・オッズ・記録はご覧いただけます。"
        actionLabel="中継を観る"
        actionHref="/watch-race"
      />

      <div style={{
        position: 'relative', flex: '1 1 auto', minHeight: 0, overflow: 'auto',
        padding: '12px 14px 18px', width: '100%', maxWidth: 1220, margin: '0 auto',
        display: 'flex', flexDirection: 'column', gap: 12,
      }}>
        <div style={{
          flex: '0 0 auto', borderRadius: 14, padding: '16px 18px',
          background: 'rgba(8,18,8,.55)', border: '2px solid var(--u-edge)',
          display: 'flex', flexDirection: 'column', gap: 12,
        }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 14, fontWeight: 900, color: 'var(--u-ink)' }}>メールアドレス</span>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(ev) => { setEmail(ev.target.value); }}
              placeholder="you@example.com"
              style={{
                height: 48, borderRadius: 10, border: '2px solid var(--u-edge)',
                background: 'rgba(255,255,255,.95)', padding: '0 14px',
                fontSize: 16, fontWeight: 800, color: '#1a2410',
              }}
            />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 14, fontWeight: 900, color: 'var(--u-ink)' }}>パスワード</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(ev) => { setPassword(ev.target.value); }}
              style={{
                height: 48, borderRadius: 10, border: '2px solid var(--u-edge)',
                background: 'rgba(255,255,255,.95)', padding: '0 14px',
                fontSize: 16, fontWeight: 800, color: '#1a2410',
              }}
            />
          </label>

          {error !== null && (
            <div style={{
              borderRadius: 10, padding: '10px 12px', background: 'rgba(214,47,38,.18)',
              border: '2px solid #d62f26', fontSize: 14, fontWeight: 800, color: 'var(--u-ink)',
            }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {/* ★`onClick` に `undefined` を渡さない（`exactOptionalPropertyTypes: true`）。
                ★**渡さない**ことと「`undefined` を渡す」ことは別物なので、条件付きで展開する */}
            <BigButton
              tone={canSubmit ? 'gold' : 'disabled'}
              label={state === 'sending' ? '確認しています…' : 'ログイン'}
              grow="1.2"
              {...(canSubmit ? { onClick: () => { void submit(); } } : {})}
            />
            <BigButton tone="ivory" label="はじめる（登録）" href="/signup" />
          </div>
        </div>

        <div style={{ flex: '0 0 auto', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <BigButton tone="ivory" label="中継を観る" href="/watch-race" />
          <BigButton tone="ivory" label="トップへ戻る" href="/" />
        </div>
      </div>
    </div>
  );
}
