'use client';

/**
 * ★アカウント作成（メール＋パスワード）— D-113・裁定 REVIEW_AUTH_EMAIL_PASSWORD_VERDICT_20260918 §6 手順 6
 *
 * 【★D-113 の制約を守っていること】
 *   ① **自前で JWT を発行しない。セッションは Supabase Auth に発行させる**
 *      → `authClient().auth.signUp()` を呼ぶだけ。**トークンを組み立てるコードを書かない**
 *   ② リフレッシュの寿命管理を自前で抱えない → `authClient()` 側でライブラリに任せている
 *   ③ **`auth.uid()` / RLS / 書き込み RPC は一切変更しない** → ここでは呼ばない
 *   ④ **メール確認を必須にする** → 登録の直後は**確認待ち**の画面にする。
 *      ★DB 側にも重ねてある（移行 `0030`・`assert_setup_complete` が未確認を弾く）
 *   ⑦ **開発期間中は招待制／許可リストに限る** → ★画面にもその旨を出す。
 *      ⚠️ ★**画面の文言は防御ではない**。判定はサーバー側（Supabase の `disable_signup`）。
 *         V-19 の **E-8** がそれを機械で見る。
 *
 * 【★参加ポイントを買う導線をここから絶対に生やさない】（憲法 §0.2）
 *
 * 【★エラーの文言をそのまま出す】
 *   2026-09-18、道具の側で「新規登録が止めてある設定かもしれません」と**推測を出して 2 回誤誘導した**。
 *   ★画面でも同じことをしない。**返ってきた言葉を、利用者に分かる形に言い換えるだけ**にする。
 */

import { useState } from 'react';

import {
  Backdrop, BigButton, NoticeBar, TopBar, useMotionPaused,
} from '../../components/uma/uma-parts';
import { authClient } from '../../lib/supabase';

/** ★パスワードの最低要件（V-19 E-7）。★サーバー側でも弾かれるが、先に画面で伝える */
const PW_MIN = 8;

/** 登録後の流れ（★文言だけ・画面で計算しない） */
const STEPS: readonly { readonly n: string; readonly label: string }[] = [
  { n: '1', label: '牧場の名前を決める' },
  { n: '2', label: '最初の馬を迎える' },
  { n: '3', label: '調教を指示する' },
  { n: '4', label: 'レースに登録する' },
  { n: '5', label: '中継を観る' },
];

type State = 'form' | 'sending' | 'sent';

export default function SignupPage(): React.ReactElement {
  const [paused, toggle] = useMotionPaused();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [state, setState] = useState<State>('form');
  const [error, setError] = useState<string | null>(null);

  const tooShort = password.length > 0 && password.length < PW_MIN;
  const canSubmit = email.includes('@') && password.length >= PW_MIN && state === 'form';

  async function submit(): Promise<void> {
    setError(null);
    setState('sending');
    try {
      const { error: e } = await authClient().auth.signUp({ email, password });
      if (e !== null) {
        // ★推測を足さない。返ってきた言葉を、利用者に分かる形にするだけ
        setError(e.message);
        setState('form');
        return;
      }
      setState('sent');
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
      <TopBar title="はじめる" backHref="/" paused={paused} onToggle={toggle} />
      <NoticeBar
        kind="soon"
        text="いまは、お誘いした方だけがご登録いただけます。"
        sub="登録しなくても、中継・オッズ・記録はご覧いただけます"
        actionLabel="中継を観る"
        actionHref="/watch-race"
      />

      <div style={{
        position: 'relative', flex: '1 1 auto', minHeight: 0, overflow: 'auto',
        padding: '12px 14px 18px', width: '100%', maxWidth: 1220, margin: '0 auto',
        display: 'flex', flexDirection: 'column', gap: 12,
      }}>
        {state === 'sent' ? (
          <div style={{
            flex: '0 0 auto', borderRadius: 14, padding: '18px 20px',
            background: 'rgba(8,18,8,.55)', border: '2px solid var(--u-gold)',
            color: 'var(--u-ink)', fontSize: 15, fontWeight: 800, lineHeight: 1.9,
          }}>
            <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--u-gold)', marginBottom: 8 }}>
              確認のメールをお送りしました
            </div>
            届いたメールのリンクを開いてください。<br />
            <b>リンクを開くまで、牧場をはじめることはできません。</b>
            <div style={{ marginTop: 8, fontSize: 13, opacity: .9 }}>
              メールが見当たらないときは、迷惑メールの箱もご確認ください。
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
              <BigButton tone="gold" label="中継を観る" href="/watch-race" />
              <BigButton tone="ivory" label="ログイン" href="/login" />
            </div>
          </div>
        ) : (
          <>
            {/* ★入力（★390 で 1 列・1280 で横並び） */}
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
                <span style={{ fontSize: 14, fontWeight: 900, color: 'var(--u-ink)' }}>
                  パスワード（{PW_MIN} 文字以上）
                </span>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(ev) => { setPassword(ev.target.value); }}
                  style={{
                    height: 48, borderRadius: 10,
                    border: `2px solid ${tooShort ? '#e0561f' : 'var(--u-edge)'}`,
                    background: 'rgba(255,255,255,.95)', padding: '0 14px',
                    fontSize: 16, fontWeight: 800, color: '#1a2410',
                  }}
                />
                {tooShort && (
                  <span style={{ fontSize: 13, fontWeight: 900, color: '#f2b012' }}>
                    あと {PW_MIN - password.length} 文字必要です
                  </span>
                )}
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
                  label={state === 'sending' ? '送信しています…' : 'アカウントを作る'}
                  sub="確認のメールが届きます"
                  grow="1.2"
                  {...(canSubmit ? { onClick: () => { void submit(); } } : {})}
                />
                <BigButton tone="ivory" label="ログイン" href="/login" />
              </div>

              <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--u-ink)', opacity: .9, lineHeight: 1.8 }}>
                参加ポイントを販売することはありません。<br />
                いまは、お誘いした方だけがご登録いただけます。
              </div>
            </div>

            {/* ★登録後の流れ */}
            <div style={{ flex: '0 0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 10 }}>
              {STEPS.map((s) => (
                <div key={s.n} style={{
                  flex: '0 0 auto', borderRadius: 12, padding: '12px 14px',
                  background: 'rgba(8,18,8,.5)', border: '2px solid var(--u-edge)',
                  display: 'flex', alignItems: 'center', gap: 10,
                }}>
                  <span style={{
                    flex: '0 0 auto', width: 30, height: 30, borderRadius: '50%',
                    background: 'var(--u-gold)', color: '#1a2410',
                    display: 'grid', placeItems: 'center', fontSize: 15, fontWeight: 900,
                  }}>{s.n}</span>
                  <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--u-ink)' }}>{s.label}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
