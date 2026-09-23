'use client';

/**
 * ★**仔に名前を付ける**（★PLAN I-3・第 1 便の命名の画面・2026-09-24）
 *
 * 【★この画面が守る約束】
 *   ★**名前の形を画面で判定しません。** ★`nameShapeOf` が `@star/sim-engine` の
 *     `checkPlayerHorseName` を呼びます（★ワーカーと同じ関数）。
 *   ⚠️ ★**形が通っても「使えます」と出しません。** ★重複と禁止名（実在の馬の名前）は
 *      ★DB と一覧が要るので、★**送ってみるまで分かりません**。
 *   ★失敗の語（`name_taken` など）は出しません。★言葉に写します。
 *   ★素質・能力は出しません（D-114・D-116）。
 *
 * 【⚠️ ★文言について】
 *   ★「あとから変えられません」とは書きません。★**「ご自身では変更できません」まで**
 *     （★第 1 便の回答 §11・★運営が名前を戻す仕組みがあり、根拠は規約に書く予定で未確定）。
 *
 * 【★意匠】
 *   ⚠️ ★第 1 便の命名の画面の意匠は、★こちらに届いていません。
 *      ★**配色と部品は `/stable/breed` に合わせた仮**です。★デザイナーの指示で差し替えます。
 */

import { useCallback, useEffect, useState } from 'react';
import {
  loadFoalDrafts, requestFoalName, loadNameRequest, nameShapeOf,
  PLAYER_NAME_MIN_CHARS, PLAYER_NAME_MAX_CHARS,
  type FoalDraftView, type NameFailureVariant, type NameRequestState,
} from '../../../lib/name-screen';
import { SignInRequiredError } from '../../../lib/stable-repo';

/** ★失敗の見せ方（★語は出さない） */
const FAILURE_VIEW: Readonly<Record<NameFailureVariant, {
  readonly icon: string; readonly ink: string; readonly bg: string;
  readonly title: string; readonly text: string; readonly primary: string;
}>> = {
  shape: {
    icon: 'ア', ink: '#a9741a', bg: '#fff6d6',
    title: 'この名前は使えません',
    text: `カタカナ（長音「ー」と中黒「・」を含む）で、${PLAYER_NAME_MIN_CHARS}〜${PLAYER_NAME_MAX_CHARS} 文字にしてください。`,
    primary: '書き直す',
  },
  taken: {
    icon: '同', ink: '#1a6fd4', bg: '#e0eefa',
    title: 'その名前は、もう使われています',
    text: '同じ名前の馬が、ほかにいます。別の名前を付けてください。',
    primary: '別の名前にする',
  },
  blocked: {
    icon: '×', ink: '#a81a13', bg: '#ffeceb',
    title: 'この名前は使えません',
    text: '使えない名前です。別の名前を付けてください。',
    primary: '別の名前にする',
  },
  already: {
    icon: '済', ink: '#1e7a3a', bg: '#dff3e4',
    title: 'この仔には、もう名前が付いています',
    text: '先に送った名前が通ったようです。厩舎で確かめてください。',
    primary: '厩舎を見る',
  },
  missing: {
    icon: '?', ink: '#4a5a66', bg: '#e3e8ec',
    title: 'この仔が見つかりません',
    text: '名前を付ける前の仔の一覧を読み直します。',
    primary: '読み直す',
  },
  temp: {
    icon: '↻', ink: '#a9741a', bg: '#fff6d6',
    title: 'いま名前を付けられませんでした',
    text: 'こちらの処理が混み合っています。少し時間をおいて、もう一度お試しください。名前はそのままです。',
    primary: 'もう一度試す',
  },
};

const POLL_MS = 3_000;

type Step = 'pick' | 'input' | 'wait' | 'done' | 'failed';

export default function NamePage(): React.ReactElement {
  const [drafts, setDrafts] = useState<readonly FoalDraftView[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [step, setStep] = useState<Step>('pick');
  const [draftId, setDraftId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [requestId, setRequestId] = useState<string>(() => crypto.randomUUID());
  const [request, setRequest] = useState<NameRequestState | null>(null);
  const [failure, setFailure] = useState<NameFailureVariant | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(() => {
    setLoading(true);
    loadFoalDrafts().then((rows) => {
      setDrafts(rows);
      setError(null);
      setNeedsLogin(false);
    }).catch((cause: unknown) => {
      setDrafts(null);
      setNeedsLogin(cause instanceof SignInRequiredError);
      setError(cause instanceof Error ? cause.message : String(cause));
    }).finally(() => { setLoading(false); });
  }, []);
  useEffect(() => { reload(); }, [reload]);

  useEffect(() => {
    if (step !== 'wait') return;
    let active = true;
    const poll = window.setInterval(() => {
      loadNameRequest(requestId).then((state) => {
        if (!active || state === null) return;
        setRequest(state);
        if (state.status === 'done') { setStep('done'); reload(); }
        if (state.status === 'failed') { setFailure(state.failure); setStep('failed'); reload(); }
      }).catch(() => { /* ★1 回読めなくても待ちは続ける */ });
    }, POLL_MS);
    return () => { active = false; window.clearInterval(poll); };
  }, [step, requestId, reload]);

  if (loading && drafts === null) return <Shell><Note>読み込んでいます…</Note></Shell>;
  if (needsLogin) return <Shell><Note>名前を付けるには、ログインしてください。</Note></Shell>;
  if (error !== null && drafts === null) return <Shell><Note>読み込めませんでした: {error}</Note></Shell>;

  const foal = (drafts ?? []).find((d) => d.id === draftId) ?? null;
  const shape = nameShapeOf(name);
  const canSend = name.trim().length > 0 && shape.ok && !busy;

  const send = async (): Promise<void> => {
    if (foal === null || !canSend) return;
    setBusy(true);
    try {
      const result = await requestFoalName({ requestId, draftId: foal.id, name: name.normalize('NFKC').trim() });
      if (result.ok) { setRequest(null); setStep('wait'); } else { setFailure(result.failure); setStep('failed'); }
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setFailure('temp');
      setStep('failed');
    } finally { setBusy(false); }
  };

  const retry = (): void => {
    setRequestId(crypto.randomUUID());
    setRequest(null);
    setFailure(null);
    reload();
  };

  if (step === 'pick') {
    return (
      <Shell>
        {(drafts ?? []).length === 0 ? (
          <Note>名前を付ける前の仔はいません。配合して仔が生まれると、ここに出ます。</Note>
        ) : (
          <>
            <Note>名前を付ける仔を選んでください。</Note>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(min(300px,100%),1fr))', gap: 10 }}>
              {(drafts ?? []).map((d) => (
                <button
                  key={d.id} type="button"
                  onClick={() => { setDraftId(d.id); setName(''); setStep('input'); }}
                  style={{ textAlign: 'left', padding: 12, borderRadius: 12, background: '#fbf7ec', color: '#10243a', border: '1.5px solid #cfc7b2', minHeight: 44, cursor: 'pointer' }}
                >
                  <div style={{ fontSize: 15, fontWeight: 900 }}>{d.sex === 'female' ? '牝' : '牡'}の仔</div>
                  <div style={{ fontSize: 12, fontWeight: 500, marginTop: 4 }}>父 {d.sireName} ／ 母 {d.damName}</div>
                  <div style={{ fontSize: 11, fontWeight: 900, color: '#4a6178', marginTop: 4 }}>
                    この母（{d.damName}）の {d.damFoalCount} 頭目の仔です。
                  </div>
                </button>
              ))}
            </div>
          </>
        )}
      </Shell>
    );
  }

  if (step === 'input' && foal !== null) {
    return (
      <Shell>
        <div style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.8 }}>
          父 {foal.sireName} × 母 {foal.damName}<br />
          この母（{foal.damName}）の {foal.damFoalCount} 頭目の仔です。
        </div>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 900 }}>名前</span>
          <input
            value={name}
            onChange={(e) => { setName(e.target.value); }}
            placeholder="カタカナで"
            style={{
              minHeight: 56, padding: '0 14px', borderRadius: 10, fontSize: 20, fontWeight: 900,
              border: '2px solid rgba(251,247,236,.45)', background: '#0e2a4a', color: '#fbf7ec',
            }}
          />
        </label>
        <div style={{ fontSize: 11.5, fontWeight: 500, lineHeight: 1.8 }}>
          カタカナ（長音「ー」と中黒「・」を含む）で、{PLAYER_NAME_MIN_CHARS}〜{PLAYER_NAME_MAX_CHARS} 文字。<br />
          一度付けた名前は、<b>ご自身では変更できません</b>。<br />
          同じ名前の馬がいるかどうかは、<b>送ってから分かります</b>。
        </div>
        {name.trim().length > 0 && !shape.ok && (
          <div style={{ fontSize: 12, fontWeight: 900, color: '#ffd84a' }}>
            {FAILURE_VIEW.shape.text}
          </div>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          <button type="button" onClick={() => { setStep('pick'); }} style={SECONDARY}>ほかの仔にする</button>
          <button type="button" disabled={!canSend} onClick={() => { void send(); }} style={canSend ? PRIMARY : PRIMARY_OFF}>
            <span>この名前にする</span>
          </button>
        </div>
      </Shell>
    );
  }

  if (step === 'wait') {
    return (
      <Shell>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 14, border: '2px solid rgba(251,247,236,.28)', borderRadius: 12, background: 'rgba(10,35,64,.72)' }}>
          <div style={{ fontSize: 16, fontWeight: 900 }}>名前を確かめています</div>
          <div style={{ height: 8, borderRadius: 4, background: 'rgba(251,247,236,.18)', overflow: 'hidden' }}>
            <div style={{ width: '38%', height: '100%', background: '#f6c21c', animation: 'nmSweep 1.4s ease-in-out infinite alternate' }} />
          </div>
          <div style={{ fontSize: 12, fontWeight: 500, lineHeight: 1.7 }}>
            同じ名前の馬がいないかを確かめています。画面を閉じても大丈夫です。
          </div>
        </div>
        <style>{'@keyframes nmSweep{from{margin-left:0}to{margin-left:62%}}'}</style>
      </Shell>
    );
  }

  if (step === 'done') {
    return (
      <Shell>
        <div style={{ fontSize: 20, fontWeight: 900, color: '#ffe483' }}>名前が決まりました</div>
        <div style={{ fontSize: 24, fontWeight: 900 }}>{name}</div>
        <Note>厩舎に並びました。育成の画面から調教できます。</Note>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          <a href="/stable" style={{ ...SECONDARY, textDecoration: 'none' }}>厩舎を見る</a>
          {(drafts ?? []).length > 0 && (
            <button type="button" onClick={() => { retry(); setDraftId(null); setName(''); setStep('pick'); }} style={PRIMARY}>
              <span>次の仔に名前を付ける</span>
            </button>
          )}
        </div>
      </Shell>
    );
  }

  if (step === 'failed' && failure !== null) {
    const v = FAILURE_VIEW[failure];
    return (
      <Shell>
        <div style={{ display: 'flex', gap: 10, padding: 14, border: `2px solid ${v.ink}`, borderRadius: 12, background: v.bg, color: '#10243a' }}>
          <div style={{ flex: '0 0 auto', minWidth: 30, height: 30, padding: '0 6px', borderRadius: 15, background: v.ink, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 900 }}>{v.icon}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ fontSize: 15, fontWeight: 900 }}>{v.title}</div>
            <div style={{ fontSize: 12, fontWeight: 500, lineHeight: 1.7 }}>{v.text}</div>
          </div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {failure === 'already' ? (
            <a href="/stable" style={{ ...PRIMARY, textDecoration: 'none' }}><span>{v.primary}</span></a>
          ) : (
            <button
              type="button"
              onClick={() => { retry(); setStep(failure === 'missing' ? 'pick' : 'input'); }}
              style={PRIMARY}
            ><span>{v.primary}</span></button>
          )}
        </div>
      </Shell>
    );
  }

  return <Shell><Note>読み込んでいます…</Note></Shell>;
}

const PRIMARY: React.CSSProperties = {
  flex: '1.6 1 220px', minHeight: 72, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
  border: '5px solid #0a2340', borderRadius: 14, backgroundImage: 'linear-gradient(#ffe483 0%,#f6c21c 46%,#d98f0a 100%)',
  boxShadow: '0 7px 0 #0a2340, inset 0 3px 0 rgba(255,255,255,.65)', color: '#10243a', fontSize: 20, fontWeight: 900, cursor: 'pointer',
};
const PRIMARY_OFF: React.CSSProperties = {
  ...PRIMARY, border: '4px solid #4a6178', backgroundImage: 'linear-gradient(#9fb0bd,#7d8f9c)',
  boxShadow: 'none', color: '#e8edf1', fontSize: 18, cursor: 'not-allowed',
};
const SECONDARY: React.CSSProperties = {
  flex: '1 1 150px', minHeight: 72, display: 'flex', alignItems: 'center', justifyContent: 'center',
  border: '4px solid #0a2340', borderRadius: 14, backgroundImage: 'linear-gradient(#ffffff,#e6eef6)',
  boxShadow: '0 6px 0 rgba(10,35,64,.85)', color: '#10243a', fontSize: 16, fontWeight: 900, cursor: 'pointer',
};

function Shell({ children }: { readonly children: React.ReactNode }): React.ReactElement {
  return (
    <div style={{ minHeight: '100%', background: '#0a2340', color: '#fbf7ec' }}>
      <div style={{ width: '100%', maxWidth: 720, margin: '0 auto', padding: '12px 14px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: 18, fontWeight: 900, letterSpacing: '.06em' }}>名前を付ける</div>
        {children}
      </div>
    </div>
  );
}

function Note({ children }: { readonly children: React.ReactNode }): React.ReactElement {
  return <div style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.8 }}>{children}</div>;
}
