'use client';

import { useEffect, useMemo, useState } from 'react';
import { Backdrop, BigButton, TopBar, useMotionPaused } from '../../components/uma/uma-parts';
import { authClient } from '../../lib/supabase';

const PW_MIN = 8;
type State = 'checking' | 'ready' | 'saving' | 'done' | 'invalid';

export default function ResetPasswordPage(): React.ReactElement {
  const [paused, toggle] = useMotionPaused();
  const [state, setState] = useState<State>('checking');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const client = useMemo(() => authClient(), []);

  useEffect(() => {
    let active = true;
    const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event === 'PASSWORD_RECOVERY' && session) setState('ready');
    });
    const timer = window.setTimeout(() => {
      if (active) setState((current) => current === 'checking' ? 'invalid' : current);
    }, 8000);
    return () => { active = false; window.clearTimeout(timer); subscription.unsubscribe(); };
  }, [client]);

  const canSubmit = state === 'ready' && password.length >= PW_MIN && password === confirm;
  async function submit(): Promise<void> {
    if (!canSubmit) return;
    setState('saving');
    setError(null);
    try {
      const { error: authError } = await client.auth.updateUser({ password });
      if (authError) {
        setError(authError.message);
        setState('ready');
      } else {
        setPassword('');
        setConfirm('');
        setState('done');
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setState('ready');
    }
  }

  return (
    <div data-theme="uma" className={paused ? 'u-paused' : undefined} style={{ position: 'relative', minHeight: '100dvh', background: 'var(--u-navy)', display: 'flex', flexDirection: 'column' }}>
      <Backdrop />
      <TopBar title="パスワード再設定" backHref="/login" paused={paused} onToggle={toggle} />
      <main style={{ position: 'relative', width: '100%', maxWidth: 520, margin: '0 auto', padding: '18px 14px 32px' }}>
        <div style={{ borderRadius: 14, border: '2px solid var(--u-edge)', background: 'rgba(8,18,8,.7)', padding: '20px 18px', color: 'var(--u-ink)', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <h1 style={{ margin: 0, fontSize: 22 }}>新しいパスワード</h1>
          {state === 'checking' && <p role="status" style={{ margin: 0 }}>再設定リンクを確認しています…</p>}
          {state === 'invalid' && <>
            <p role="alert" style={{ margin: 0, lineHeight: 1.8 }}>リンクが無効か期限切れです。再設定メールをもう一度お送りください。</p>
            <BigButton tone="gold" label="メールを再送する" href="/forgot-password" grow="0 0 auto" />
          </>}
          {state === 'done' && <>
            <p role="status" style={{ margin: 0 }}>パスワードを変更しました。新しいパスワードでログインしてください。</p>
            <BigButton tone="gold" label="ログインへ" href="/login" grow="0 0 auto" />
          </>}
          {(state === 'ready' || state === 'saving') && <>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontWeight: 900 }}>新しいパスワード（{PW_MIN}文字以上）
              <input type="password" autoComplete="new-password" value={password} onChange={(ev) => setPassword(ev.target.value)} style={{ width: '100%', height: 48, borderRadius: 10, border: '2px solid var(--u-edge)', background: '#fff', color: '#1a2410', fontSize: 16, padding: '0 14px' }} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontWeight: 900 }}>新しいパスワード（確認）
              <input type="password" autoComplete="new-password" value={confirm} onChange={(ev) => setConfirm(ev.target.value)} style={{ width: '100%', height: 48, borderRadius: 10, border: '2px solid var(--u-edge)', background: '#fff', color: '#1a2410', fontSize: 16, padding: '0 14px' }} />
            </label>
            {confirm && password !== confirm && <p style={{ margin: 0, color: '#ffd04d' }}>パスワードが一致しません。</p>}
            {error && <p role="alert" style={{ margin: 0, color: '#ffd04d' }}>{error}</p>}
            <BigButton tone={canSubmit ? 'gold' : 'disabled'} label={state === 'saving' ? '変更しています…' : 'パスワードを変更する'} grow="0 0 auto" {...(canSubmit ? { onClick: () => { void submit(); } } : {})} />
          </>}
        </div>
      </main>
    </div>
  );
}
