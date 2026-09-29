'use client';

import { useEffect, useRef, useState } from 'react';
import { checkOwnRaceSelection, ownRaceReasonText } from '@star/betting';
import { Backdrop, BigButton, NOTICE_ACTION, TextPanel, TopBar, useMotionPaused } from '../../components/uma/uma-parts';
import { RaceStrip } from '../../components/uma/race-strip';
import { useSalesClosed } from '../../components/clock';
import { BET_PER_PICK_EP, BET_TYPE_LABEL, CLAIM_BET_PER_PICK, CLAIM_BET_TYPE_RULE, CLAIM_OWN_RACE_BET, CLAIM_REPEAT_BET, CLAIM_REPEAT_BET_LIMIT, CLAIM_REPEAT_BET_PLANNED, CLAIM_REPEAT_BET_SHORT, CLAIM_SALES_CLOSED, CLAIM_VOTE_NO_CANCEL, REPEAT_BET_MAX, type VoteBetType } from '../../lib/claims';
import { nextRepeatStreak, offerAfterAccept, planAppliesTo, readRepeatPlan, readRepeatStreak, writeRepeatPlan, writeRepeatStreak, type RepeatPlan } from '../../lib/repeat-bet';

/** ★いま出す券種（★オーナー 2026-09-29「まずは単勝・複勝」） */
const VOTE_BET_TYPES: readonly VoteBetType[] = ['win', 'place'];
import { loadBetAllowance, loadBetScreen, oddsKey, placeBet, type BetAllowance, type BetScreenData } from '../../lib/bet-screen';

const FRAME_COLORS = ['#f5f5f5', '#191919', '#d62828', '#1446b4', '#fad728', '#148c46', '#f08219', '#f596be'] as const;
const DARK_TEXT_FRAMES = new Set([1, 5, 8]);
/** ★1 口の額は claims.ts の 1 か所（★DB の制約 bets_amount_range と網で一致・2026-09-29 まで 10 で 必ず落ちていた） */
const EP_PER_PICK = BET_PER_PICK_EP;
const REFRESH_MS = 1000 * 15;

/** ★続けて投票の 2 つのボタン（★同じ見た目・R-22 §5） */
const REPEAT_BUTTON: React.CSSProperties = {
  flex: '1 1 140px', minHeight: 44, border: '2px solid #f6c21c', borderRadius: 10, fontSize: 14, fontWeight: 900,
  background: 'transparent', color: 'var(--u-ink-light)', cursor: 'pointer',
};
/** ★マークシートの行（★R-22 §3） */
const SHEET_ROW: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, minHeight: 44, borderBottom: '1px solid #c9c2ab', padding: '4px 0' };
const SHEET_HEAD: React.CSSProperties = { width: 44, flex: '0 0 auto', fontSize: 11, color: '#4a6178' };
/** ★確認のシートの表（★R-22 §4） */
const CONFIRM_ROW: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderBottom: '1px solid #dcd7c6', fontSize: 14 };
const CONFIRM_HEAD: React.CSSProperties = { width: 92, flex: '0 0 auto', fontSize: 11, color: '#4a6178' };

function frameOf(gate: number, fieldSize: number): number {
  return Math.min(8, Math.ceil(gate / Math.ceil(fieldSize / 8)));
}

export default function VotePage(): React.ReactElement {
  const [paused, toggle] = useMotionPaused();
  const [data, setData] = useState<BetScreenData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [picks, setPicks] = useState<readonly number[]>([]);
  /** ★券種（★2026-09-29・単勝と複勝・馬券の流れ＝券種→馬番→金額→確認・デザイナーの bet-sheet の順） */
  const [betType, setBetType] = useState<VoteBetType>('win');
  const [allowance, setAllowance] = useState<BetAllowance | null>(null);
  const [busy, setBusy] = useState(false);
  const [clientToken, setClientToken] = useState(() => crypto.randomUUID());
  const currentRaceId = useRef<string | null>(null);
  /**
   * ★続けて投票（★`lib/repeat-bet.ts`）。★出すのは ★投票を受け付けた直後だけ（★結果の後には出さない・★結果を読まない）。
   *   ★［次のレースも］で予定を置き、★次のレースが発売になったら 券種だけ揃える（★馬は本人が選ぶ・★自動では買わない）。
   */
  const [justPlaced, setJustPlaced] = useState<{ readonly raceId: string; readonly betType: VoteBetType; readonly streak: number; readonly gate: number; readonly raceNo: string } | null>(null);
  const [plan, setPlan] = useState<RepeatPlan | null>(null);
  const [repeatStreak, setRepeatStreak] = useState(0);

  const reload = (): void => {
    setError(null);
    void loadBetScreen(null, VOTE_BET_TYPES).then((fresh) => {
      const nextRaceId = fresh.race?.id ?? null;
      if (currentRaceId.current !== nextRaceId) setPicks([]);
      currentRaceId.current = nextRaceId;
      setData(fresh);
    })
      .catch((cause: unknown) => { setError(cause instanceof Error ? cause.message : String(cause)); });
  };
  useEffect(() => {
    setRepeatStreak(readRepeatStreak());
    setPlan(readRepeatPlan());
    reload();
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') reload(); }, REFRESH_MS);
    return () => { window.clearInterval(timer); };
  }, []);
  const race = data?.race ?? null;
  useEffect(() => {
    if (race === null) { setAllowance(null); return; }
    let active = true;
    setAllowance(null);
    void loadBetAllowance(race.id, betType).then((value) => { if (active) setAllowance(value); })
      .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : String(cause)); });
    return () => { active = false; };
  }, [race?.id, betType]);

  const ownGates = data?.ownGates ?? [];
  const check = checkOwnRaceSelection(picks, ownGates, EP_PER_PICK);
  const selected = picks[0] ?? null;
  const selectedOdds = race && selected !== null ? race.odds.get(oddsKey(betType, [selected])) ?? null : null;
  /** ★発売締切を過ぎたら 押せない（★締め切ったのに買えると読める姿を残さない・2026-09-29） */
  const salesClosed = useSalesClosed(race?.scheduledAt ?? null);
  /** ★予定が このレースに当たるか（★予定を作ったレースの次・締切前） */
  const planned = data?.authenticated === true && planAppliesTo(plan, { currentRaceId: race?.id ?? null, salesClosed, betTypes: VOTE_BET_TYPES });
  /** ★予定が当たったら 券種を予定どおりに（★1 レースで 1 回だけ） */
  const appliedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!planned || plan === null || race === null || appliedFor.current === race.id) return;
    appliedFor.current = race.id;
    setBetType(plan.betType as VoteBetType);
  }, [planned, race?.id]);
  /** ★受け付けた直後の案内（★いま受け付けた投票の券種・額・受け付けた後の残高・続けた回数だけから） */
  const afterAccept = justPlaced === null ? null : offerAfterAccept({
    betType: justPlaced.betType, amount: EP_PER_PICK, epBalance: data?.epBalance ?? 0, streak: justPlaced.streak,
  });
  const blocked = salesClosed || !data?.authenticated || race === null || selected === null || selectedOdds === null || !check.ok
    || allowance === null || allowance.remainingEP < EP_PER_PICK || data === null || data.epBalance < EP_PER_PICK || busy;

  /**
   * ★**確認のシート**（★2026-09-29・デザイナー R-22 §4・`window.confirm` の代わり）。
   *   🔴 ★「投票は取り消せません」を ★押す前に言う（★簿 ONE-WAY-DOORS・網 irreversible-confirms）。★［戻る］に焦点・背後のタップと Esc で閉じる。
   */
  const [confirmOpen, setConfirmOpen] = useState(false);
  useEffect(() => {
    if (!confirmOpen) return undefined;
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape' && !busy) setConfirmOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); };
  }, [confirmOpen, busy]);
  const submit = (): void => {
    if (blocked || race === null || selected === null) return;
    setConfirmOpen(true);
  };
  /** ★シートの［投票する］だけが呼ぶ（★ここ以外から placeBet を呼ばない） */
  const confirmVote = async (): Promise<void> => {
    if (blocked || race === null || selected === null) { setConfirmOpen(false); return; }
    setBusy(true); setMessage(null);
    try {
      const result = await placeBet({ raceId: race.id, betType, selection: [selected], amount: EP_PER_PICK, clientToken });
      if (!result.ok) setError(result.failure.message);
      else {
        setClientToken(crypto.randomUUID());
        /** ★予定どおりに買えたら +1・★自分で選び直して買ったら 0（★どちらでも予定は使い切る） */
        const streak = nextRepeatStreak(repeatStreak, planned && plan !== null && plan.betType === betType);
        setRepeatStreak(streak); writeRepeatStreak(streak);
        setPlan(null); writeRepeatPlan(null);
        setJustPlaced({ raceId: race.id, betType, streak, gate: selected, raceNo: race.raceNo });
        setConfirmOpen(false);
        setPicks([]);
        reload();
        setAllowance(null);
        void loadBetAllowance(race.id, betType).then(setAllowance)
          .catch((cause: unknown) => { setError(cause instanceof Error ? cause.message : String(cause)); });
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); setConfirmOpen(false); }
  };

  return <div data-theme="uma" data-page-body className={paused ? 'u-paused' : undefined} style={{
    position: 'relative', width: '100%', minHeight: '100dvh', overflow: 'hidden',
    containerType: 'inline-size', background: 'var(--u-navy)', display: 'flex', flexDirection: 'column',
  }}>
    <Backdrop />
    <TopBar title="投票モード" paused={paused} onToggle={toggle} />
    <RaceStrip />
    {error && <TextPanel role="alert" style={{ fontSize: 12 }}>
      {error}　<a href="/login">ログイン</a>　<button type="button" onClick={reload} style={NOTICE_ACTION}>再読み込み</button>
    </TextPanel>}
    {message && <TextPanel role="status" style={{ color: 'var(--u-gold)' }}>{message}</TextPanel>}
    {/* ★① 受け付けた直後だけ（★結果の後には出さない・R-22 §5）。★2 つのボタンは同じ見た目 */}
    {afterAccept !== null && justPlaced !== null && <div role="status" style={{
      position: 'relative', margin: '8px 14px 0', padding: 12, borderRadius: 12,
      background: 'rgba(10,35,64,.9)', border: '2px solid rgba(251,247,236,.28)', color: 'var(--u-ink-light)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 900 }}>
        <span aria-hidden style={{ width: 22, height: 22, borderRadius: 999, background: '#57c8a8', color: '#0a2340', display: 'grid', placeItems: 'center', fontSize: 14 }}>✓</span>
        投票を受け付けました
      </div>
      <div style={{ fontSize: 12, color: '#cfe0ee', marginTop: 4 }}>{justPlaced.raceNo} ・ {BET_TYPE_LABEL[justPlaced.betType]} ・ {justPlaced.gate}番 ・ {EP_PER_PICK} EP</div>
      <div style={{ borderTop: '1px solid rgba(251,247,236,.18)', margin: '10px 0' }} />
      {afterAccept.kind === 'offer' ? <>
        <p style={{ margin: 0, fontSize: 13 }}>次のレースも、同じ券種（{BET_TYPE_LABEL[justPlaced.betType]}）・同じ額（{afterAccept.amount} EP）で投票できます。</p>
        <p style={{ margin: '4px 0 0', fontSize: 11, color: '#cfe0ee' }}>{CLAIM_REPEAT_BET}（続けて あと {REPEAT_BET_MAX - justPlaced.streak} 回）</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
          <button type="button" style={REPEAT_BUTTON} onClick={() => {
            const next = { afterRaceId: justPlaced.raceId, betType: justPlaced.betType };
            setPlan(next); writeRepeatPlan(next); setJustPlaced(null);
          }}>次のレースも</button>
          <button type="button" style={REPEAT_BUTTON} onClick={() => { setJustPlaced(null); }}>やめる</button>
        </div>
      </> : <p style={{ margin: 0, fontSize: 13 }}>{afterAccept.kind === 'short' ? CLAIM_REPEAT_BET_SHORT : CLAIM_REPEAT_BET_LIMIT}</p>}
    </div>}
    {/* ★② 予定どおり 次のレースが発売になったとき（★券種だけ揃えた・★馬は本人が選ぶ） */}
    {planned && plan !== null && justPlaced === null && <TextPanel role="status" style={{ fontSize: 13 }}>
      券種を{BET_TYPE_LABEL[plan.betType as VoteBetType]}にしました。{CLAIM_REPEAT_BET_PLANNED}
      <span style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
        <button type="button" style={REPEAT_BUTTON} onClick={() => { setPlan(null); writeRepeatPlan(null); }}>やめる</button>
      </span>
    </TextPanel>}
    {data && !data.authenticated && <TextPanel style={{ fontSize: 13 }}>
      出馬表は閲覧できます。投票するには <a href="/login" style={{ textDecoration: 'underline' }}>ログイン</a> してください。
    </TextPanel>}

    <main style={{ position: 'relative', flex: '1 1 auto', minHeight: 0, overflow: 'auto', padding: '10px 14px 0', width: '100%', maxWidth: 1220, margin: '0 auto', display: 'flex', flexWrap: 'wrap', gap: 12, alignContent: 'flex-start' }}>
      <section aria-label="出馬表" style={{ flex: '2 1 330px', minWidth: 0, border: '2px solid rgba(246,194,28,.45)', borderRadius: 12, background: '#fbf7ec', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: '#0a2340', borderBottom: '3px solid #f6c21c', color: 'var(--u-ink-light)' }}>
          <strong style={{ fontSize: 14, flex: '0 0 auto' }}>出馬表</strong>
          <small style={{ fontSize: 11, color: '#cfe0ee', flex: '1 1 auto', minWidth: 0 }}>{race ? `${race.raceName}・${race.cond}・${race.fieldSize}頭` : data ? '現在、投票を受け付けているレースはありません' : '読み込み中…'}</small>
          {race && <span style={{ flex: '0 0 auto', whiteSpace: 'nowrap', fontSize: 12 }}>{BET_TYPE_LABEL[betType]}{salesClosed ? '（締切時点）' : ''}</span>}
        </div>
        {/* ★締め切った後は 選べない（★R-22 §6） */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', ...(salesClosed ? { opacity: 0.62, pointerEvents: 'none' as const } : {}) }}>
          {race?.entries.map((entry, idx) => {
            const frame = frameOf(entry.gate, race.fieldSize);
            const on = selected === entry.gate;
            const odds = race.odds.get(oddsKey(betType, [entry.gate]));
            return <button key={entry.gate} type="button" aria-pressed={on} onClick={() => { setPicks(on ? [] : [entry.gate]); setMessage(null); }}
              style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', minHeight: 50, padding: '5px 10px', textAlign: 'left', border: 0, borderBottom: '1px solid #dcd7c6', background: on ? '#fff4cf' : idx % 2 === 0 ? '#fbf7ec' : '#f4f1e6', color: 'var(--u-ink-dark)' }}>
              <span className="u-num" style={{ width: 26, height: 22, flex: '0 0 auto', display: 'grid', placeItems: 'center', borderRadius: 4, fontSize: 13, background: FRAME_COLORS[frame - 1], color: DARK_TEXT_FRAMES.has(frame) ? '#111' : '#fff', border: '2px solid #10243a' }}>{frame}</span>
              <strong className="u-num" style={{ width: 24, flex: '0 0 auto', fontSize: 18 }}>{entry.gate}</strong>
              {/* ★馬名は「…」で切らず 2 行まで（★R-22 §2） */}
              <span style={{ flex: 1, minWidth: 0, fontSize: 14, lineHeight: 1.25, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', overflowWrap: 'anywhere' }}>
                {entry.horseName}{entry.isMine ? <span style={{ display: 'block', fontSize: 10, color: '#4a6178' }}>自分の馬</span> : null}
              </span>
              {/* ★オッズは灰色 16px だけ（★煽らない・R-22 §2） */}
              <span className="u-num" style={{ width: 44, flex: '0 0 auto', textAlign: 'right', color: '#4a6178', fontSize: 16 }}>{odds === undefined ? '—' : odds.toFixed(1)}</span>
              {/* ★印は楕円（★「◯◉」の文字は使わない） */}
              <span aria-hidden style={{ width: 34, height: 18, flex: '0 0 auto', borderRadius: 999, border: `2px solid ${on ? '#1a6fd4' : '#c3ccd4'}`, background: on ? '#1a6fd4' : '#fff' }} />
            </button>;
          })}
        </div>
      </section>

      {/* ★マークシート（★R-22 §3・罫線の地・① 券種 ② 馬番 ③ 額） */}
      <section aria-label="マークシート" style={{ flex: '1 1 250px', minWidth: 0, maxWidth: 420, alignSelf: 'flex-start', border: '2px solid rgba(246,194,28,.45)', borderRadius: 12, background: '#fbf7ec', overflow: 'hidden', color: 'var(--u-ink-dark)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: '#0a2340', borderBottom: '3px solid #f6c21c', color: 'var(--u-ink-light)' }}>
          <strong style={{ fontSize: 14 }}>マークシート</strong>
          <span className="u-num" style={{ fontSize: 13, color: '#cfe0ee' }}>{race?.raceNo ?? ''}</span>
        </div>
        <div style={{ padding: '4px 12px 10px', backgroundImage: 'repeating-linear-gradient(0deg, transparent 0 43px, rgba(18,63,107,.12) 43px 44px)' }}>
          <div style={SHEET_ROW}>
            <span style={SHEET_HEAD}>① 券種</span>
            <div role="tablist" aria-label="券種" style={{ display: 'flex', gap: 6, flex: 1 }}>
              {VOTE_BET_TYPES.map((t) => {
                const onT = betType === t;
                return <button key={t} type="button" role="tab" aria-selected={onT} onClick={() => { setBetType(t); setMessage(null); }}
                  style={{ flex: 1, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 8, fontSize: 15, fontWeight: 900, border: `2px solid ${onT ? '#123f6b' : '#c9c2ab'}`, background: onT ? '#eef3f8' : '#fffdf6', color: 'var(--u-ink-dark)' }}>
                  <span aria-hidden style={{ width: 30, height: 16, borderRadius: 999, border: '2px solid #123f6b', background: onT ? '#10243a' : '#fff' }} />
                  {BET_TYPE_LABEL[t]}
                </button>;
              })}
            </div>
          </div>
          <p style={{ margin: '4px 0 0', fontSize: 11, lineHeight: 1.55, color: '#25384a' }}>{CLAIM_BET_TYPE_RULE[betType]}</p>
          <div style={SHEET_ROW}>
            <span style={SHEET_HEAD}>② 馬番</span>
            {selected === null ? <span style={{ fontSize: 14, color: '#4a6178' }}>— 出馬表から 1 頭</span>
              : <span style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
                <span style={{ flex: 1, minWidth: 0 }}>{selected}番 {race?.entries.find((e) => e.gate === selected)?.horseName ?? ''}</span>
                <span className="u-num" style={{ fontSize: 16, color: '#4a6178' }}>{selectedOdds === null ? '—' : selectedOdds.toFixed(1)}</span>
              </span>}
          </div>
          <div style={SHEET_ROW}>
            <span style={SHEET_HEAD}>③ 額</span>
            <span className="u-num" style={{ fontSize: 22 }}>{EP_PER_PICK}</span><span style={{ fontSize: 11 }}>EP（1 口）</span>
          </div>
          <p style={{ margin: '8px 0 0', fontSize: 11 }}>{CLAIM_BET_PER_PICK}</p>
          <p style={{ margin: '4px 0 0', fontSize: 11 }}>現在の残高: {data ? data.authenticated ? `${data.epBalance.toLocaleString('ja-JP')} EP` : 'ログイン後に表示' : '読み込み中'}</p>
          {ownGates.length > 0 && <p style={{ margin: '4px 0 0', fontSize: 11 }}>{CLAIM_OWN_RACE_BET}。</p>}
          {!check.ok && <p role="alert" style={{ margin: '4px 0 0', fontSize: 11 }}>{ownRaceReasonText(check)}</p>}
          {allowance && <p style={{ margin: '4px 0 0', fontSize: 11 }}>この券種で あと {allowance.remainingEP.toLocaleString('ja-JP')} EP 投票できます。</p>}
          {race && <a href={`/odds/${encodeURIComponent(race.id)}`} style={{ display: 'inline-flex', alignItems: 'center', minHeight: 44, textDecoration: 'underline', color: '#123f6b' }}>オッズの詳細 →</a>}
        </div>
      </section>
    </main>

    <div style={{ position: 'relative', display: 'flex', flexWrap: 'wrap', gap: 10, padding: '10px 14px var(--u-safe-bottom)', width: '100%', maxWidth: 1220, margin: '0 auto' }}>
      <BigButton tone={blocked ? 'disabled' : 'blue'} label={busy ? '送信中…' : '投票する'}
        /*
          ★押せない理由を先に言う（★2026-09-29・オーナーの画面: 締め切った・残高 0 なのに「100 EP を使います」と出ていた＝押せると読める）。
          ★順: 締め切った → レースが無い → ログイン → 自馬の制限 → 馬を選ぶ → 残高 → 上限 → 押せる
        */
        sub={salesClosed ? CLAIM_SALES_CLOSED
          : race === null ? '受付中のレースをお待ちください'
            : !data?.authenticated ? 'ログインしてください'
              : !check.ok ? ownRaceReasonText(check)
                : selected === null ? '馬を選んでください'
                  : data.epBalance < EP_PER_PICK ? '参加ポイントが足りません'
                    : allowance !== null && allowance.remainingEP < EP_PER_PICK ? '上限に達しています'
                      : `${EP_PER_PICK} EP を使います`}
        onClick={submit} grow="1.4 1 210px" />
      {/* ★「演出デモ」とは書かない（★R-18 🔴#3・R-22 §1-5） */}
      <BigButton tone="ivory" label="レースを見る" sub="録画で見る" href="/watch-race" grow="1 1 130px" />
    </div>

    {/* ★確認のシート（★R-22 §4）。★背後のタップ・Esc・［戻る］で閉じる。★選んだ券種と馬は残す */}
    {confirmOpen && race !== null && selected !== null && <div role="presentation" onClick={() => { if (!busy) setConfirmOpen(false); }}
      style={{ position: 'absolute', inset: 0, zIndex: 30, background: 'rgba(6,18,30,.62)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div role="alertdialog" aria-modal="true" aria-labelledby="vote-confirm-title" onClick={(e) => { e.stopPropagation(); }}
        style={{ width: '100%', maxWidth: 520, background: '#fbf7ec', borderRadius: '18px 18px 0 0', borderTop: '4px solid #f6c21c', padding: '16px 16px 34px', display: 'flex', flexDirection: 'column', gap: 12, color: 'var(--u-ink-dark)' }}>
        <strong id="vote-confirm-title" style={{ fontSize: 17 }}>この内容で投票しますか</strong>
        <div style={{ border: '2px solid #123f6b', borderRadius: 10, overflow: 'hidden' }}>
          <div style={CONFIRM_ROW}><span style={CONFIRM_HEAD}>レース</span><span>{race.raceName}</span></div>
          <div style={CONFIRM_ROW}><span style={CONFIRM_HEAD}>券種</span><span>{BET_TYPE_LABEL[betType]}<span style={{ display: 'block', fontSize: 11, color: '#4a6178' }}>{CLAIM_BET_TYPE_RULE[betType]}</span></span></div>
          <div style={CONFIRM_ROW}><span style={CONFIRM_HEAD}>馬</span><span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="u-num" style={{ width: 26, height: 22, display: 'grid', placeItems: 'center', borderRadius: 4, fontSize: 13, background: FRAME_COLORS[frameOf(selected, race.fieldSize) - 1], color: DARK_TEXT_FRAMES.has(frameOf(selected, race.fieldSize)) ? '#111' : '#fff', border: '2px solid #10243a' }}>{frameOf(selected, race.fieldSize)}</span>
            {selected}番 {race.entries.find((e) => e.gate === selected)?.horseName ?? ''}
          </span></div>
          <div style={{ ...CONFIRM_ROW, borderBottom: 0 }}><span style={CONFIRM_HEAD}>使う参加ポイント</span><span className="u-num" style={{ fontSize: 22 }}>{EP_PER_PICK} EP</span></div>
        </div>
        <p style={{ margin: 0, padding: '8px 10px', borderRadius: 10, background: '#f6e7cf', color: '#5a3a06', fontSize: 12, fontWeight: 700 }}>{CLAIM_VOTE_NO_CANCEL}</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          <BigButton tone={busy ? 'disabled' : 'blue'} label={busy ? '送信中…' : '投票する'} onClick={() => { void confirmVote(); }} grow="1.4 1 180px" />
          <BigButton tone="ivory" label="戻る" onClick={() => { if (!busy) setConfirmOpen(false); }} grow="1 1 120px" autoFocus />
        </div>
      </div>
    </div>}
  </div>;
}
