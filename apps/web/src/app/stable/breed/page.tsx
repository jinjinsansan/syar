'use client';

/**
 * ★**自分の繁殖牝馬で配合する**（★デザイナー第 2 便 §5 **B-1〜B-5** と 失敗 5 通り・2026-09-23）
 *
 * 【★この画面が守る約束】
 *   ★**選べるかを画面が決めません**（★`canMate` が決める・`lib/breed-screen.ts`）。
 *   ★**種付料の式を画面が持ちません**（★`npcStudFee`）。★見積もりが ★**そのまま払ってよい上限**です（★上乗せしない）。
 *   ★**失敗の語を出しません**（★§4）。★見せ方 5 通りに写すだけです。
 *   ★素質・能力・遺伝子は出しません（D-114・D-116）。
 *
 * 【★意匠の出どころ】
 *   ★色・寸法・文言は ★**デザイナーの第 2 便**（`design_handoff_breed_v2/README.md` §5）。★開発側で足していません。
 *
 * 【⚠️ ★まだ無いので出していないもの】（★報告済み）
 *   ★B-3 の血統表 … ★第 1 便の部品がこの画面にまだありません。
 *   ★B-5 の誕生の絵 … ★素材（`intro-birth-cut.png`）がまだ作られていません。
 *   ★B-5 の主「名前を付ける」 … ★命名の画面がまだありません（★次に作ります）。
 *
 * 【★時計】
 *   ★「依頼してから何秒」だけ実時刻を使います（★サーバーが返した `created_at` との差）。
 *   ★ゲームの中の時間（週・年）には ★**一切使いません**（★憲法 4）。
 */

import { useCallback, useEffect, useState } from 'react';
import {
  loadBreedScreen, requestBreeding, loadBreedRequest,
  type BreedScreenData, type BreedMareView, type BreedSireView,
  type BreedFailureVariant, type BreedRequestState,
} from '../../../lib/breed-screen';
import { SignInRequiredError } from '../../../lib/stable-repo';

/** ★失敗の 5 通り（★文言と色はデザイナーの表のまま・★理由の語は出さない） */
const FAILURE_VIEW: Readonly<Record<BreedFailureVariant, {
  readonly icon: string; readonly ink: string; readonly bg: string;
  readonly title: string; readonly text: string;
  readonly primary: string; readonly secondary: string | null;
}>> = {
  feeup: {
    icon: '↑', ink: '#b5651d', bg: '#ffeadb',
    title: '種付料が上がりました',
    text: '確定するときの種付料が、依頼したときの上限を超えたので、生産しませんでした。'
      + '参加ポイントは引かれていません。確認の画面で新しい見積もりを出し直して、もう一度依頼できます。',
    primary: '新しい見積もりで出し直す', secondary: '父を選び直す',
  },
  noep: {
    icon: 'EP', ink: '#57c8a8', bg: '#123a33',
    title: '参加ポイントが足りません',
    text: '種付料に、参加ポイントが足りませんでした。生産はしていません。'
      + 'この母は、今年のうちにもう一度依頼できます。',
    primary: '配合の画面に戻る', secondary: null,
  },
  invalid: {
    icon: '×', ink: '#a81a13', bg: '#ffeceb',
    title: 'この組合せは選べません',
    text: '父か母を選び直してください。参加ポイントは引かれていません。',
    primary: '父母を選び直す', secondary: null,
  },
  full: {
    icon: '30', ink: '#123f6b', bg: '#cfe0ee',
    title: '持てる頭数がいっぱいです',
    text: '現役の馬と、名前を付ける前の仔を合わせて、持てる頭数の上限に達しています。',
    primary: '厩舎を見る', secondary: null,
  },
  temp: {
    icon: '↻', ink: '#a9741a', bg: '#fff6d6',
    title: 'いま生産を確定できませんでした',
    text: 'こちらの処理が混み合っています。少し時間をおいて、もう一度お試しください。'
      + '選んだ父母はそのままです。参加ポイントは引かれていません。',
    primary: 'もう一度試す', secondary: null,
  },
};

/** ★待ちの見出しが変わる境目（★第 2 便 B-4「ふつうは 60 秒ほど」） */
const SLOW_MS = 60_000;
/** ★待っているあいだ、依頼の状態を見に行く間隔 */
const POLL_MS = 3_000;

type Step = 'mares' | 'sires' | 'confirm' | 'wait' | 'result' | 'failed';

export default function BreedPage(): React.ReactElement {
  const [data, setData] = useState<BreedScreenData | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [step, setStep] = useState<Step>('mares');
  const [mareId, setMareId] = useState<string | null>(null);
  const [sireId, setSireId] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string>(() => crypto.randomUUID());
  const [request, setRequest] = useState<BreedRequestState | null>(null);
  const [failure, setFailure] = useState<BreedFailureVariant | null>(null);
  const [nowMs, setNowMs] = useState(0);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(() => {
    setLoading(true);
    loadBreedScreen().then((fresh) => {
      setData(fresh);
      setError(null);
      setNeedsLogin(false);
    }).catch((cause: unknown) => {
      setData(null);
      setNeedsLogin(cause instanceof SignInRequiredError);
      setError(cause instanceof Error ? cause.message : String(cause));
    }).finally(() => { setLoading(false); });
  }, []);
  useEffect(() => { reload(); }, [reload]);

  /**
   * ★待っているあいだだけ、★状態を見に行き、★経過を進めます。
   * ⚠️ ★`Date.now()` を使うのは ★**この経過の表示だけ**です（★ゲームの中の時間には使いません・憲法 4）。
   */
  useEffect(() => {
    if (step !== 'wait') return;
    let active = true;
    const tick = (): void => { if (active) setNowMs(Date.now()); };
    tick();
    const clock = window.setInterval(tick, 1000);
    const poll = window.setInterval(() => {
      loadBreedRequest(requestId).then((state) => {
        if (!active || state === null) return;
        setRequest(state);
        if (state.status === 'done') { setStep('result'); reload(); }
        if (state.status === 'failed') { setFailure(state.failure); setStep('failed'); reload(); }
      }).catch(() => { /* ★1 回読めなくても待ちは続ける */ });
    }, POLL_MS);
    return () => { active = false; window.clearInterval(clock); window.clearInterval(poll); };
  }, [step, requestId, reload]);

  if (loading && data === null) return <Shell><Note>読み込んでいます…</Note></Shell>;
  if (needsLogin) return <Shell><Note>配合するには、ログインしてください。</Note></Shell>;
  if (error !== null && data === null) return <Shell><Note>読み込めませんでした: {error}</Note></Shell>;
  if (data === null) return <Shell><Note>読み込めませんでした。</Note></Shell>;

  const mare = data.mares.find((m) => m.id === mareId) ?? null;
  const sire = data.sires.find((s) => s.id === sireId) ?? null;

  const ask = async (): Promise<void> => {
    if (mare === null || sire === null || busy) return;
    setBusy(true);
    try {
      // ★見積もりを ★そのまま上限として渡す（★上乗せしない・§2 B）
      const result = await requestBreeding({
        requestId, damId: mare.id, sireId: sire.id, maxFeeEP: sire.feeEP,
      });
      if (result.ok) { setRequest(null); setStep('wait'); } else { setFailure(result.failure); setStep('failed'); }
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setFailure('temp');
      setStep('failed');
    } finally { setBusy(false); }
  };

  const retry = (): void => {
    // ★新しい依頼 ID を作る（★前の依頼の結果を引きずらない）
    setRequestId(crypto.randomUUID());
    setRequest(null);
    setFailure(null);
    reload();
  };

  if (step === 'mares') {
    return (
      <Shell>
        <Head text="配合する母を選びます（自分の繁殖牝馬）。" right={`繁殖牝馬 ${data.mares.length} 頭`} />
        {data.mares.length === 0 && (
          <Note>繁殖牝馬がいません。引退した牝馬を「引退後の役割」で繁殖入りさせると、ここに出ます。</Note>
        )}
        <Grid>
          {data.mares.map((m) => <MareCard key={m.id} mare={m} onPick={() => { setMareId(m.id); setStep('sires'); }} />)}
        </Grid>
      </Shell>
    );
  }

  if (step === 'sires') {
    return (
      <Shell>
        <Head text={`母 ${mare?.name ?? ''} ／ 父を選びます（NPC の種牡馬）。`} right={null} />
        <button type="button" onClick={() => { setStep('mares'); }} style={LINK}>母を選び直す</button>
        <Grid>
          {data.sires.map((s) => <SireCard key={s.id} sire={s} onPick={() => { setSireId(s.id); setStep('confirm'); }} />)}
        </Grid>
        <div style={{ fontSize: 11, fontWeight: 500, lineHeight: 1.7 }}>
          見積もりは今の額です。確定するときの額が、依頼したときの見積もりを超えた場合は、生産せずにお知らせします。
        </div>
      </Shell>
    );
  }

  if (step === 'confirm' && mare !== null && sire !== null) {
    return (
      <Shell>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          <ParentCard title="父（NPC の種牡馬）" border="#1a6fd4" name={sire.name} sub={`${sire.ageYears ?? '?'} 歳 ・ 最高格 ${sire.g1Wins} 勝`} />
          <ParentCard title="母（自分の繁殖牝馬）" border="#b3306e" name={mare.name} sub={`${mare.ageYears ?? '?'} 歳 ・ 産駒 ${mare.foalCount} / ${mare.lifetimeFoals} 頭`} />
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          <EpCard label="種付料の見積もり（払ってよい上限）" value={sire.feeEP} border="#f6c21c"
            note="確定したときの額を払います。上限を超えたら生産しません。" />
          <EpCard label="いまの参加ポイント" value={data.epBalance} border="#57c8a8" note={null} />
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          <button type="button" onClick={() => { setStep('sires'); }} style={SECONDARY}>父母を選び直す</button>
          <button type="button" disabled={busy} onClick={() => { void ask(); }} style={busy ? PRIMARY_OFF : PRIMARY}>
            <span>この組合せで依頼する</span>
            <span style={{ fontSize: 11 }}>上限 {sire.feeEP} EP</span>
          </button>
        </div>
      </Shell>
    );
  }

  if (step === 'wait') {
    const elapsedMs = request === null || nowMs === 0 ? 0 : Math.max(0, nowMs - request.createdAtMs);
    const slow = elapsedMs >= SLOW_MS;
    return (
      <Shell>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 14, border: '2px solid rgba(251,247,236,.28)', borderRadius: 12, background: 'rgba(10,35,64,.72)' }}>
          <div style={{ fontSize: 16, fontWeight: 900 }}>
            {slow ? '混み合っています。このままお待ちください' : '生産しています'}
          </div>
          <div style={{ height: 8, borderRadius: 4, background: 'rgba(251,247,236,.18)', overflow: 'hidden' }}>
            <div style={{ width: '38%', height: '100%', background: '#f6c21c', animation: 'brSweep 1.4s ease-in-out infinite alternate' }} />
          </div>
          <div style={{ fontSize: 13, fontWeight: 900 }}>{Math.floor(elapsedMs / 1000)} 秒</div>
          <div style={{ fontSize: 12, fontWeight: 500, lineHeight: 1.7 }}>
            ふつうは 60 秒ほどです。画面を閉じても大丈夫です。<br />
            種付料は、確定したときに引かれます（上限 {sire?.feeEP ?? 0} EP）。
          </div>
        </div>
        <style>{'@keyframes brSweep{from{margin-left:0}to{margin-left:62%}}'}</style>
      </Shell>
    );
  }

  if (step === 'result') {
    return (
      <Shell>
        <div style={{ fontSize: 20, fontWeight: 900, color: '#ffe483' }}>無事に生まれました</div>
        <div style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.8 }}>
          父 {sire?.name ?? ''} × 母 {mare?.name ?? ''}
        </div>
        {request?.studFeeEP != null && (
          <div style={{ padding: '10px 12px', borderRadius: 10, background: '#123a33', color: '#57c8a8', fontSize: 13, fontWeight: 900 }}>
            種付料 {request.studFeeEP} EP を使いました（確定したときの額）
          </div>
        )}
        <Note>
          ⚠️ 名前を付ける画面は、まだありません。次に作ります。名前を付けるまで、この仔は厩舎に並びません。
        </Note>
        <button type="button" onClick={() => { setMareId(null); setSireId(null); retry(); setStep('mares'); }} style={SECONDARY}>
          配合の画面に戻る
        </button>
      </Shell>
    );
  }

  if (step === 'failed' && failure !== null) {
    const v = FAILURE_VIEW[failure];
    return (
      <Shell>
        <div style={{ display: 'flex', gap: 10, padding: 14, border: `2px solid ${v.ink}`, borderRadius: 12, background: v.bg, color: v.bg === '#123a33' ? '#e8f6f2' : '#10243a' }}>
          <div style={{ flex: '0 0 auto', minWidth: 30, height: 30, padding: '0 6px', borderRadius: 15, background: v.ink, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 900 }}>{v.icon}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ fontSize: 15, fontWeight: 900 }}>{v.title}</div>
            <div style={{ fontSize: 12, fontWeight: 500, lineHeight: 1.7 }}>{v.text}</div>
          </div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {v.secondary !== null && (
            <button type="button" onClick={() => { retry(); setStep('sires'); }} style={SECONDARY}>{v.secondary}</button>
          )}
          <button
            type="button"
            onClick={() => {
              retry();
              setStep(failure === 'feeup' ? 'confirm' : failure === 'invalid' ? 'mares' : failure === 'temp' ? 'confirm' : 'mares');
            }}
            style={PRIMARY}
          >
            <span>{v.primary}</span>
          </button>
        </div>
      </Shell>
    );
  }

  return <Shell><Note>読み込んでいます…</Note></Shell>;
}

/* ── 部品（★意匠はデザイナーの第 2 便のまま） ───────────────────── */

function MareCard({ mare, onPick }: { readonly mare: BreedMareView; readonly onPick: () => void }): React.ReactElement {
  const selectable = mare.block === null;
  return (
    <button
      type="button"
      disabled={!selectable}
      onClick={onPick}
      style={{
        textAlign: 'left', padding: 12, borderRadius: 12, background: '#fbf7ec', color: '#10243a',
        border: '1.5px solid #cfc7b2', opacity: selectable ? 1 : 0.6, minHeight: 44,
        cursor: selectable ? 'pointer' : 'not-allowed',
      }}
    >
      <div style={{ fontSize: 17, fontWeight: 900 }}>{mare.name}</div>
      <div style={{ fontSize: 11, fontWeight: 900, color: '#4a6178' }}>{mare.ageYears ?? '?'} 歳</div>
      <div style={{ display: 'flex', gap: 6, margin: '6px 0' }}>
        <Tag text={mare.bredThisYear ? '今年はもう産みました' : '今年はまだ'}
          bg={mare.bredThisYear ? '#eef2f6' : '#e4efe7'} ink={mare.bredThisYear ? '#4a5a66' : '#1e7a3a'} />
        <Tag text={`産駒 ${mare.foalCount} / ${mare.lifetimeFoals} 頭`} bg="#eef2f6" ink="#4a5a66" />
      </div>
      <div style={{ fontSize: 12, fontWeight: 500 }}>父 {mare.sireName ?? '不明'} ／ 母 {mare.damName ?? '不明'}</div>
    </button>
  );
}

function SireCard({ sire, onPick }: { readonly sire: BreedSireView; readonly onPick: () => void }): React.ReactElement {
  const selectable = sire.block === null;
  return (
    <button
      type="button"
      disabled={!selectable}
      onClick={onPick}
      style={{
        textAlign: 'left', padding: 12, borderRadius: 12, background: '#fbf7ec', color: '#10243a',
        border: '1.5px solid #cfc7b2', opacity: selectable ? 1 : 0.55, minHeight: 44,
        cursor: selectable ? 'pointer' : 'not-allowed',
      }}
    >
      <div style={{ fontSize: 17, fontWeight: 900 }}>{sire.name}</div>
      <div style={{ fontSize: 11, fontWeight: 900, color: '#4a6178' }}>{sire.ageYears ?? '?'} 歳</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 6, fontSize: 12, fontWeight: 900 }}>
        <span>最高格 {sire.g1Wins} 勝</span>
        <span>{sire.totalPrizePP}<span style={{ fontSize: 9, color: '#8a5a06' }}> PP</span></span>
        <span>{selectable ? `残り ${sire.coveringsLeft} 枠` : '今年の枠はありません'}</span>
        <span style={{ color: '#1e7a3a' }}>{sire.feeEP} EP</span>
      </div>
    </button>
  );
}

function Tag({ text, bg, ink }: { readonly text: string; readonly bg: string; readonly ink: string }): React.ReactElement {
  return <span style={{ padding: '1px 8px', borderRadius: 5, background: bg, color: ink, fontSize: 11, fontWeight: 900 }}>{text}</span>;
}

function ParentCard({ title, border, name, sub }: {
  readonly title: string; readonly border: string; readonly name: string; readonly sub: string;
}): React.ReactElement {
  return (
    <div style={{ flex: '1 1 220px', padding: 12, borderRadius: 12, background: '#fbf7ec', color: '#10243a', border: `2px solid ${border}` }}>
      <div style={{ fontSize: 11, fontWeight: 900, color: border }}>{title}</div>
      <div style={{ fontSize: 18, fontWeight: 900 }}>{name}</div>
      <div style={{ fontSize: 12, fontWeight: 500 }}>{sub}</div>
    </div>
  );
}

function EpCard({ label, value, border, note }: {
  readonly label: string; readonly value: number; readonly border: string; readonly note: string | null;
}): React.ReactElement {
  return (
    <div style={{ flex: '1 1 220px', padding: 12, borderRadius: 12, background: '#123a33', color: '#e8f6f2', border: `2px solid ${border}` }}>
      <div style={{ fontSize: 11, fontWeight: 900 }}>{label}</div>
      <div style={{ fontSize: 27, fontWeight: 900 }}>{value}<span style={{ fontSize: 12 }}> EP</span></div>
      {note !== null && <div style={{ fontSize: 10, fontWeight: 500, lineHeight: 1.6 }}>{note}</div>}
    </div>
  );
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
const LINK: React.CSSProperties = {
  alignSelf: 'flex-start', minHeight: 44, padding: '0 12px', borderRadius: 10,
  background: 'none', border: '1.5px solid rgba(251,247,236,.4)', color: '#fbf7ec', fontSize: 12, fontWeight: 900, cursor: 'pointer',
};

function Grid({ children }: { readonly children: React.ReactNode }): React.ReactElement {
  return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(min(330px,100%),1fr))', gap: 10 }}>{children}</div>;
}

function Head({ text, right }: { readonly text: string; readonly right: string | null }): React.ReactElement {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
      <div style={{ fontSize: 13, fontWeight: 500 }}>{text}</div>
      {right !== null && <div style={{ fontSize: 12, fontWeight: 900 }}>{right}</div>}
    </div>
  );
}

function Shell({ children }: { readonly children: React.ReactNode }): React.ReactElement {
  return (
    <div style={{ minHeight: '100%', background: '#0a2340', color: '#fbf7ec' }}>
      <div style={{ width: '100%', maxWidth: 1100, margin: '0 auto', padding: '12px 14px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: 18, fontWeight: 900, letterSpacing: '.06em' }}>配合</div>
        {children}
      </div>
    </div>
  );
}

function Note({ children }: { readonly children: React.ReactNode }): React.ReactElement {
  return <div style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.8 }}>{children}</div>;
}
