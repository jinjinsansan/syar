'use client';

/**
 * ★**最初の 1 頭を生産する（無償）**（★2026-09-24・オーナー決定 案 A・D-120）
 *
 * 【★なぜこの画面が要るか】
 *   ★案 A は「★付与 1 頭 ＋ ★**無償の生産 1 頭**」でした。★付与は `create_account` が済ませます。
 *   ★生産の口（`request_initial_breeding`）も状態の口（`my_onboarding_state`）も ★**本番に在り**ましたが、
 *   ★**呼ぶ画面がありませんでした**（★報告 `REPORT_SERVER_WITHOUT_SCREEN_20260924.md`）。
 *   → ★登録した人は、★受け取れるはずの馬を ★**1 頭 受け取れていません**でした。
 *
 * 【★この画面が守る約束】
 *   ★**段階を画面が導きません**（★`my_onboarding_state` が返す `stage` に従う・裁定 §2 条件 1）。
 *   ★**選べるかを画面が決めません**（★`canMate` が決める・`lib/initial-breed-screen.ts`）。
 *   ★**失敗の語を出しません**（★見せ方 5 通りに写す・`/stable/breed` と同じ表）。
 *   ★素質・能力・遺伝子は出しません（★D-114・D-116）。
 *   ★**種付料はありません**（★無償）。★EP を引く経路がないので、★額を 1 つも出しません。
 *
 * 【★意匠】
 *   ⚠️ ★新しい見た目を作っていません。★`/stable/breed` の枠と語をそのまま使います
 *      （★オーナー指示「★デザインは必ずデザイナーに」2026-09-15）。★第 3 便が来たら差し替えます。
 *
 * 【★時計】
 *   ★「依頼してから何秒」だけ実時刻を使います。★ゲームの中の時間（週・年）には使いません（★憲法 4）。
 */

import { useCallback, useEffect, useState } from 'react';
import {
  loadInitialBreedScreen, requestInitialBreeding, DAM_CHOICES,
  type InitialBreedScreenData, type InitialDamView, type InitialSireView,
  type BreedFailureVariant,
} from '../../../lib/initial-breed-screen';
import { fetchOnboardingState, type OnboardingState } from '../../../lib/onboarding';
import { SignInRequiredError } from '../../../lib/stable-repo';

/** ★状態を見に行く間隔（★`/stable/breed` と同じ） */
const POLL_MS = 3_000;

/** ★失敗の見せ方（★語は出さない。★`/stable/breed` の 5 通りのうち、★無償なので額の 2 つは出ない） */
const FAILURE_VIEW: Readonly<Record<BreedFailureVariant, { readonly title: string; readonly text: string }>> = {
  feeup: {
    title: 'いま生産できませんでした',
    text: '少し時間をおいて、もう一度お試しください。参加ポイントは引かれていません。',
  },
  noep: {
    title: 'いま生産できませんでした',
    text: '少し時間をおいて、もう一度お試しください。参加ポイントは引かれていません。',
  },
  invalid: {
    title: 'この組合せは選べません',
    text: '父か母を選び直してください。参加ポイントは引かれていません。',
  },
  full: {
    title: '持てる頭数がいっぱいです',
    text: '現役の馬と、名前を付ける前の仔を合わせて、持てる頭数の上限に達しています。',
  },
  temp: {
    title: 'いま生産を確定できませんでした',
    text: 'こちらの処理が混み合っています。少し時間をおいて、もう一度お試しください。'
      + '選んだ父母はそのままです。',
  },
};

function Shell({ children }: { readonly children: React.ReactNode }): React.ReactElement {
  return (
    <div style={{ minHeight: '100dvh', background: '#0a2340', color: '#fbf7ec' }}>
      <div style={{ width: '100%', maxWidth: 1100, margin: '0 auto', padding: '12px 14px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: 18, fontWeight: 900, letterSpacing: '.06em' }}>最初の 1 頭を生産する</div>
        {children}
      </div>
    </div>
  );
}

function Note({ children }: { readonly children: React.ReactNode }): React.ReactElement {
  return <div style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.8 }}>{children}</div>;
}

function Panel({ children }: { readonly children: React.ReactNode }): React.ReactElement {
  return <div style={{
    border: '2px solid rgba(251,247,236,.28)', borderRadius: 12, padding: '10px 12px',
    background: 'rgba(255,255,255,.06)', display: 'flex', flexDirection: 'column', gap: 8,
  }}>{children}</div>;
}

function Choice({ label, sub, on, disabled, onPick }: {
  readonly label: string; readonly sub: string;
  readonly on: boolean; readonly disabled: boolean; readonly onPick: () => void;
}): React.ReactElement {
  return (
    <button
      type="button"
      onClick={onPick}
      disabled={disabled}
      aria-pressed={on}
      style={{
        textAlign: 'left', minHeight: 56, padding: '8px 10px', borderRadius: 10,
        border: on ? '3px solid #ffd84a' : '2px solid rgba(251,247,236,.3)',
        background: disabled ? 'rgba(255,255,255,.04)' : 'rgba(255,255,255,.1)',
        color: disabled ? 'rgba(251,247,236,.45)' : '#fbf7ec',
        cursor: disabled ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
      }}
    >
      <span style={{ display: 'block', fontSize: 14, fontWeight: 800 }}>{label}</span>
      <span style={{ display: 'block', fontSize: 11, fontWeight: 500, opacity: 0.85 }}>{sub}</span>
    </button>
  );
}

const damSub = (d: InitialDamView): string =>
  `${d.ageYears === null ? '年齢不明' : `${d.ageYears} 歳`}・これまでに ${d.foalCount} 頭`;
const sireSub = (s: InitialSireView): string =>
  `${s.ageYears === null ? '年齢不明' : `${s.ageYears} 歳`}・G1 ${s.g1Wins} 勝`;

export default function FirstFoalPage(): React.ReactElement {
  const [data, setData] = useState<InitialBreedScreenData | null>(null);
  const [state, setState] = useState<OnboardingState | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [damId, setDamId] = useState<string | null>(null);
  const [sireId, setSireId] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string>(() => crypto.randomUUID());
  const [failure, setFailure] = useState<BreedFailureVariant | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(() => {
    setLoading(true);
    fetchOnboardingState().then(async (fresh) => {
      setState(fresh);
      setNeedsLogin(false);
      setError(null);
      // ★父母を選ぶ段だけ、候補を読みます（★他の段では要りません）
      if (fresh.stage === 'choose_parents') setData(await loadInitialBreedScreen());
    }).catch((cause: unknown) => {
      setNeedsLogin(cause instanceof SignInRequiredError);
      setError(cause instanceof Error ? cause.message : String(cause));
    }).finally(() => { setLoading(false); });
  }, []);
  useEffect(() => { reload(); }, [reload]);

  /** ★待っている段のあいだだけ、段階を見に行きます */
  useEffect(() => {
    if (state?.stage !== 'waiting_birth') return;
    const poll = window.setInterval(() => { reload(); }, POLL_MS);
    return () => { window.clearInterval(poll); };
  }, [state?.stage, reload]);

  if (loading && state === null) return <Shell><Note>読み込んでいます…</Note></Shell>;
  if (needsLogin) return <Shell><Note>生産するには、ログインしてください。</Note></Shell>;
  if (state === null) return <Shell><Note>読み込めませんでした{error === null ? '' : `: ${error}`}</Note></Shell>;

  if (state.stage === 'no_account') {
    return <Shell><Note>まず牧場を開いてください。<a href="/setup" style={{ color: '#ffd84a' }}>最初の 1 頭を迎える</a></Note></Shell>;
  }
  if (state.stage === 'legacy') {
    return <Shell><Note>この牧場は、無償の生産の対象ではありません。<a href="/stable/breed" style={{ color: '#ffd84a' }}>配合の画面へ</a></Note></Shell>;
  }
  /**
   * ★父母の名前は ★**生まれてから**しか返りません。
   * ⚠️ 🔴 ★待っている段で `父 — ／ 母 —` と出していました（★2026-09-24・オーナーの画面で発覚）。
   *    ★`my_onboarding_state` は、★待ちの段では名前を埋めません（★命名前の仔から取るため）。
   *    → ★**空の欄を出しません**。★無いものの枠だけ見せない。
   */
  const parents = state.sireName === null && state.damName === null ? null
    : `父 ${state.sireName ?? '—'} ／ 母 ${state.damName ?? '—'}`;

  if (state.stage === 'waiting_birth') {
    return <Shell>
      <Note>仔が生まれるのを待っています。この画面を開いたままでかまいません。</Note>
      {parents !== null && <Panel><Note>{parents}</Note></Panel>}
    </Shell>;
  }
  if (state.stage === 'naming') {
    return <Shell>
      <Note>仔が生まれました。名前を付けてください。</Note>
      <Panel>
        {parents !== null && <Note>{parents}</Note>}
        <a href="/stable/name" style={{ color: '#ffd84a', fontWeight: 800 }}>名前を付ける</a>
      </Panel>
    </Shell>;
  }
  if (state.stage === 'ready') {
    return <Shell>
      <Note>最初の 1 頭の生産は終わっています。</Note>
      <Panel><a href="/train" style={{ color: '#ffd84a', fontWeight: 800 }}>育成へ</a></Panel>
    </Shell>;
  }

  // ★ここから `choose_parents`
  if (data === null) return <Shell><Note>候補を読み込んでいます…</Note></Shell>;

  const dam = data.dams.find((d) => d.id === damId) ?? null;
  const sire = data.sires.find((s) => s.id === sireId) ?? null;
  const pickable = data.dams.filter((d) => d.block === null);

  const ask = async (): Promise<void> => {
    if (dam === null || sire === null || busy) return;
    /**
     * 🔴 ★**押す前に言う**（★D-123 ③・裁定 `REVIEW_IDLE_WORK_20260925.md` (a)・2026-09-25）
     *
     * 【★なぜ要るか】
     *   ★これは ★**無償の生産 1 頭**で、★**1 回きり**です（★案 A・D-120）。
     *   ★父と母を選び直す口は ★**在りません**（★依頼が通ると仔が生まれ、★やり直せません）。
     *   → ★D-123 の作法（★`/vote` と同じ）: ★**取り消せないものは、押す前にそう言う**。
     * ⚠️ ★文面は ★`/vote` の形を写しました（★何が決まるか → ★空行 → ★戻せないこと → ★問い）。
     * ⚠️ ★`window.confirm` は ★**既存の部品だけ**で済ませる形です（★新しい意匠を作らない）。
     *    ★デザイナー便（★第 3 便）で ★画面の中の確認に差し替える前提です
     *    （★そのとき ★**この文面を持っていく**こと）。
     */
    if (!window.confirm(
      `最初の 1 頭を生産します\n母: ${dam.name}\n父: ${sire.name}\n\n`
      + 'この組み合わせは選び直せません。無償の生産は 1 回だけです。この内容でよろしいですか？',
    )) return;
    setBusy(true);
    setFailure(null);
    try {
      const result = await requestInitialBreeding({ requestId, damId: dam.id, sireId: sire.id });
      if (result.ok) reload();
      else setFailure(result.failure);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setFailure('temp');
    } finally { setBusy(false); }
  };

  return (
    <Shell>
      <Note>
        父と母を選ぶと、仔が 1 頭 生まれます。<strong>参加ポイントはかかりません。</strong>
        生まれるのは 1 回だけです。
      </Note>

      {failure !== null && (
        <Panel>
          <div style={{ fontSize: 14, fontWeight: 900 }}>{FAILURE_VIEW[failure].title}</div>
          <Note>{FAILURE_VIEW[failure].text}</Note>
          <button
            type="button"
            onClick={() => { setRequestId(crypto.randomUUID()); setFailure(null); reload(); }}
            style={{ minHeight: 44, borderRadius: 10, border: '2px solid #ffd84a', background: 'transparent', color: '#ffd84a', fontWeight: 800, fontFamily: 'inherit' }}
          >もう一度試す</button>
        </Panel>
      )}

      {/*
        ⚠️ ★`ageKnown` が false でも「候補切れ」と出しません（★移行 0077 の註記・0068 の実害）。
           ★確定の判定はワーカーです。
      */}
      {pickable.length === 0 && (
        <Panel><Note>
          {data.ageKnown
            ? 'いま選べる母がいません。年が変わると、また選べるようになります。'
            : 'いまは候補を絞り込めていません。選んでみてください。'}
        </Note></Panel>
      )}

      <Panel>
        <div style={{ fontSize: 14, fontWeight: 900 }}>母を選ぶ</div>
        <Note>{data.damTotal} 頭のうち {Math.min(DAM_CHOICES, data.damTotal)} 頭を出しています。</Note>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: 8 }}>
          {data.dams.map((d) => (
            <Choice
              key={d.id} label={d.name} sub={damSub(d)}
              on={d.id === damId} disabled={d.block !== null}
              onPick={() => { setDamId(d.id); }}
            />
          ))}
        </div>
      </Panel>

      <Panel>
        <div style={{ fontSize: 14, fontWeight: 900 }}>父を選ぶ</div>
        <Note>{data.sires.length} 頭から選べます。</Note>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: 8 }}>
          {data.sires.slice(0, DAM_CHOICES).map((s) => (
            <Choice
              key={s.id} label={s.name} sub={sireSub(s)}
              on={s.id === sireId} disabled={false}
              onPick={() => { setSireId(s.id); }}
            />
          ))}
        </div>
      </Panel>

      <button
        type="button"
        onClick={() => { void ask(); }}
        disabled={dam === null || sire === null || busy}
        style={{
          minHeight: 56, borderRadius: 12, fontSize: 16, fontWeight: 900, fontFamily: 'inherit',
          border: '3px solid #ffd84a',
          background: dam !== null && sire !== null && !busy ? '#ffd84a' : 'transparent',
          color: dam !== null && sire !== null && !busy ? '#0a2340' : 'rgba(251,247,236,.5)',
          cursor: dam !== null && sire !== null && !busy ? 'pointer' : 'not-allowed',
        }}
      >{busy ? '送っています…' : 'この父母で 1 頭 生産する'}</button>
    </Shell>
  );
}
