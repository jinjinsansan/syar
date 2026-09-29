'use client';

import { useEffect, useRef, useState } from 'react';
import { checkOwnRaceSelection, ownRaceReasonText } from '@star/betting';
import { Backdrop, BigButton, NOTICE_ACTION, TextPanel, TopBar, useMotionPaused } from '../../components/uma/uma-parts';
import { RaceStrip } from '../../components/uma/race-strip';
import { useSalesClosed } from '../../components/clock';
import { BET_PER_PICK_EP, CLAIM_BET_PER_PICK, CLAIM_OWN_RACE_BET, CLAIM_SALES_CLOSED } from '../../lib/claims';
import { loadBetAllowance, loadBetScreen, oddsKey, placeBet, type BetAllowance, type BetScreenData } from '../../lib/bet-screen';

const FRAME_COLORS = ['#f5f5f5', '#191919', '#d62828', '#1446b4', '#fad728', '#148c46', '#f08219', '#f596be'] as const;
const DARK_TEXT_FRAMES = new Set([1, 5, 8]);
/** ★1 口の額は claims.ts の 1 か所（★DB の制約 bets_amount_range と網で一致・2026-09-29 まで 10 で 必ず落ちていた） */
const EP_PER_PICK = BET_PER_PICK_EP;
const REFRESH_MS = 1000 * 15;

function frameOf(gate: number, fieldSize: number): number {
  return Math.min(8, Math.ceil(gate / Math.ceil(fieldSize / 8)));
}

export default function VotePage(): React.ReactElement {
  const [paused, toggle] = useMotionPaused();
  const [data, setData] = useState<BetScreenData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [picks, setPicks] = useState<readonly number[]>([]);
  const [allowance, setAllowance] = useState<BetAllowance | null>(null);
  const [busy, setBusy] = useState(false);
  const [clientToken, setClientToken] = useState(() => crypto.randomUUID());
  const currentRaceId = useRef<string | null>(null);

  const reload = (): void => {
    setError(null);
    void loadBetScreen(null).then((fresh) => {
      const nextRaceId = fresh.race?.id ?? null;
      if (currentRaceId.current !== nextRaceId) setPicks([]);
      currentRaceId.current = nextRaceId;
      setData(fresh);
    })
      .catch((cause: unknown) => { setError(cause instanceof Error ? cause.message : String(cause)); });
  };
  useEffect(() => {
    reload();
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') reload(); }, REFRESH_MS);
    return () => { window.clearInterval(timer); };
  }, []);
  const race = data?.race ?? null;
  useEffect(() => {
    if (race === null) { setAllowance(null); return; }
    let active = true;
    void loadBetAllowance(race.id, 'win').then((value) => { if (active) setAllowance(value); })
      .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : String(cause)); });
    return () => { active = false; };
  }, [race?.id]);

  const ownGates = data?.ownGates ?? [];
  const check = checkOwnRaceSelection(picks, ownGates, EP_PER_PICK);
  const selected = picks[0] ?? null;
  const selectedOdds = race && selected !== null ? race.odds.get(oddsKey('win', [selected])) ?? null : null;
  /** ★発売締切を過ぎたら 押せない（★締め切ったのに買えると読める姿を残さない・2026-09-29） */
  const salesClosed = useSalesClosed(race?.scheduledAt ?? null);
  const blocked = salesClosed || !data?.authenticated || race === null || selected === null || selectedOdds === null || !check.ok
    || allowance === null || allowance.remainingEP < EP_PER_PICK || data === null || data.epBalance < EP_PER_PICK || busy;

  const submit = async (): Promise<void> => {
    if (blocked || race === null || selected === null) return;
    /**
     * 🔴 ★**「取り消せません」を先に言います**（★2026-09-25・簿 `ONE-WAY-DOORS`）。
     *   ★投票の取消は ★**作りません**（★現実の作法と揃え、★オッズを見てから引ける形を作らないため）。
     *   ★取り消す道が無いのだから、★**押す前に**そう言うべきです（★押した後に知らせない）。
     * ⚠️ ★券種・目・金額を出します（★何に賭けるのかを、★押す前に読める形で）。
     */
    if (!window.confirm(
      `${race.raceName}\n単勝・${selected}番・${EP_PER_PICK} EP\n\n`
      + '投票は取り消せません。この内容でよろしいですか？',
    )) return;
    setBusy(true); setMessage(null);
    try {
      const result = await placeBet({ raceId: race.id, betType: 'win', selection: [selected], amount: EP_PER_PICK, clientToken });
      if (!result.ok) setError(result.failure.message);
      else {
        setClientToken(crypto.randomUUID());
        setMessage('投票を受け付けました。');
        setPicks([]);
        reload();
        setAllowance(null);
        void loadBetAllowance(race.id, 'win').then(setAllowance)
          .catch((cause: unknown) => { setError(cause instanceof Error ? cause.message : String(cause)); });
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
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
    {data && !data.authenticated && <TextPanel style={{ fontSize: 13 }}>
      出馬表は閲覧できます。投票するには <a href="/login" style={{ textDecoration: 'underline' }}>ログイン</a> してください。
    </TextPanel>}

    <main style={{ position: 'relative', flex: '1 1 auto', minHeight: 0, overflow: 'auto', padding: '10px 14px 0', width: '100%', maxWidth: 1220, margin: '0 auto', display: 'flex', flexWrap: 'wrap', gap: 12, alignContent: 'flex-start' }}>
      <section aria-label="出馬表" style={{ flex: '2 1 330px', minWidth: 0, border: '2px solid rgba(246,194,28,.45)', borderRadius: 12, background: 'var(--u-paper)', overflow: 'hidden' }}>
        <div style={{ padding: '9px 12px', background: 'var(--u-navy)', borderBottom: '3px solid var(--u-gold)' }}>
          <strong>出馬表</strong>　<small>{race ? `${race.raceName}・${race.cond}・${race.fieldSize}頭` : data ? '現在、投票を受け付けているレースはありません' : '読み込み中…'}</small>
        </div>
        {race?.entries.map((entry) => {
          const frame = frameOf(entry.gate, race.fieldSize);
          const on = selected === entry.gate;
          const odds = race.odds.get(oddsKey('win', [entry.gate]));
          return <button key={entry.gate} type="button" aria-pressed={on} onClick={() => { setPicks(on ? [] : [entry.gate]); setMessage(null); }}
            style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', minHeight: 50, padding: '5px 10px', textAlign: 'left', border: 0, borderBottom: '1px solid var(--u-rule)', background: on ? '#fff4cf' : 'var(--u-paper)', color: 'var(--u-ink-dark)' }}>
            <span style={{ width: 26, height: 24, display: 'grid', placeItems: 'center', background: FRAME_COLORS[frame - 1], color: DARK_TEXT_FRAMES.has(frame) ? '#111' : '#fff', border: '1px solid var(--u-ink-dark)' }}>{frame}</span>
            <strong className="u-num" style={{ width: 30, fontSize: 18 }}>{entry.gate}</strong>
            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.horseName}{entry.isMine ? '（自分の馬）' : ''}</span>
            <span style={{ color: 'var(--u-ink-dark-2)', fontSize: 12 }}>{odds === undefined ? '—' : odds.toFixed(1)}</span>
            <span aria-hidden style={{ width: 26, textAlign: 'center', fontSize: 18 }}>{on ? '◉' : '◯'}</span>
          </button>;
        })}
      </section>

      <section aria-label="投票内容" style={{ flex: '1 1 250px', minWidth: 0, maxWidth: 420, padding: 12, alignSelf: 'flex-start', border: '2px solid rgba(251,247,236,.28)', borderRadius: 12, background: 'var(--u-panel)', fontSize: 12 }}>
        <strong>マークシート</strong>
        <p>{selected === null ? '馬を1頭選んでください。' : `${selected}番を選択中`}</p>
        <p>{CLAIM_BET_PER_PICK}</p>
        <p>現在の残高: {data ? data.authenticated ? `${data.epBalance.toLocaleString('ja-JP')} EP` : 'ログイン後に表示' : '読み込み中'}</p>
        {ownGates.length > 0 && <p>{CLAIM_OWN_RACE_BET}。</p>}
        {!check.ok && <p role="alert">{ownRaceReasonText(check)}</p>}
        {allowance && <p>この券種であと {allowance.remainingEP.toLocaleString('ja-JP')} EP 投票できます。</p>}
        {race && <a href={`/odds/${encodeURIComponent(race.id)}`} style={{ display: 'inline-block', padding: '10px 0', textDecoration: 'underline' }}>オッズの詳細</a>}
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
        onClick={() => { void submit(); }} grow="1.4 1 210px" />
      <BigButton tone="ivory" label="レースを見る" sub="演出デモを見る" href="/watch-race" grow="1 1 130px" />
    </div>
  </div>;
}
