'use client';

import { useState } from 'react';
import { Backdrop, BigButton, TopBar, useMotionPaused } from '../../components/uma/uma-parts';
import { authClient } from '../../lib/supabase';

export default function ForgotPasswordPage(): React.ReactElement {
  const [paused, toggle] = useMotionPaused();
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canSubmit = email.trim().includes('@') && !sending;

  async function submit(): Promise<void> {
    if (!canSubmit) return;
    setSending(true);
    setError(null);
    try {
      const { error: authError } = await authClient().auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (authError) setError(authError.message);
      else setSent(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSending(false);
    }
  }

  return (
    <div data-theme="uma" className={paused ? 'u-paused' : undefined} style={{ position: 'relative', minHeight: '100dvh', background: 'var(--u-navy)', display: 'flex', flexDirection: 'column' }}>
      <Backdrop />
      <TopBar title="パスワード再設定" backHref="/login" paused={paused} onToggle={toggle} />
      <main style={{ position: 'relative', width: '100%', maxWidth: 520, margin: '0 auto', padding: '18px 14px 32px' }}>
        <div style={{ borderRadius: 14, border: '2px solid var(--u-edge)', background: 'rgba(8,18,8,.7)', padding: '20px 18px', color: 'var(--u-ink)', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <h1 style={{ margin: 0, fontSize: 22 }}>パスワードを忘れた方</h1>
          {sent ? (
            <>
              <p role="status" style={{ margin: 0, lineHeight: 1.8 }}>登録済みのアドレスであれば、再設定用のメールが届きます。メール内のリンクを開いてください。</p>
              <p style={{ margin: 0, fontSize: 13 }}>届かない場合は迷惑メールをご確認ください。</p>
              <BigButton tone="ivory" label="ログインに戻る" href="/login" grow="0 0 auto" />
            </>
          ) : (
            <>
              <p style={{ margin: 0, lineHeight: 1.8 }}>登録したメールアドレスに、再設定用のリンクを送ります。</p>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontWeight: 900 }}>
                メールアドレス
                <input type="email" autoComplete="email" value={email} onChange={(ev) => setEmail(ev.target.value)} placeholder="you@example.com" style={{ width: '100%', height: 48, borderRadius: 10, border: '2px solid var(--u-edge)', background: '#fff', color: '#1a2410', fontSize: 16, padding: '0 14px' }} />
              </label>
              {error && <p role="alert" style={{ margin: 0, color: '#ffd04d', lineHeight: 1.6 }}>{error}</p>}
              <BigButton tone={canSubmit ? 'gold' : 'disabled'} label={sending ? '送信しています…' : '再設定メールを送る'} grow="0 0 auto" {...(canSubmit ? { onClick: () => { void submit(); } } : {})} />
              <a href="/login" style={{ alignSelf: 'center', color: 'var(--u-gold)', fontWeight: 900, padding: '8px 12px' }}>ログインに戻る</a>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
