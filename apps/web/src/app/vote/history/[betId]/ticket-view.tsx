'use client';

/**
 * ★**投票の控え（1 枚）**（★2026-10-01・デザイナー引き渡し ② §2-4・見本 `VoteHistory.dc.html` の `mode="ticket"`）
 *
 * 【★語の決まり（§2-1）】★引き渡し §2-1 の禁止語を ★画面に出しません（★外れた控えの札は「確定」）。
 * 【★ポイント】★「使った参加ポイント（EP）」と「受け取った賞金ポイント（PP）」を ★2 つの箱で並べます。
 *   ⚠️ ★**合計・差し引きは出しません。** ★的中でも数字を ★大きくしない・光らせない（★どちらも 22px・同じ色）。
 * 【★ボタン】［レース詳細］→ `/races/[id]`（着順と照合）／［投票モードへ］→ `/vote`。
 *   ⚠️ ★**控えから映像へは行きません**（★映像は 自分の馬の記録からだけ・§2-4）。
 * 【★読むもの】★`lib/vote-history.ts` の `loadVoteTicket`（★本人の行でなければ ★RLS で 0 行 → 「見つかりません」）。
 */

import { useEffect, useState } from 'react';
import { loadVoteTicket } from '../../../../lib/vote-history';
import { jstStamp, receiptNoOf, stakeBreakdownOf, type VoteItem } from '../../../../lib/vote-history-view';
import { SignInRequiredError } from '../../../../lib/stable-repo';
import { Backdrop, BigButton, NoticeBar, TextPanel, TopBar, useMotionPaused } from '../../../../components/uma/uma-parts';
import { RaceStrip } from '../../../../components/uma/race-strip';
import { GateBadge, StateTag } from '../../../../components/uma/vote-ticket-parts';

const HEAD: React.CSSProperties = { fontSize: 11, color: '#4a6178', whiteSpace: 'nowrap' };

/** ★ポイントの箱（★EP は緑の縁・PP は金の縁。★数字は どちらも 22px・同じ色） */
function PointBox({ kind, label, value, sub }: {
  readonly kind: 'ep' | 'pp'; readonly label: string; readonly value: string; readonly sub: string;
}): React.ReactElement {
  const ep = kind === 'ep';
  return (
    <div style={{ minWidth: 0, padding: '8px 10px', borderRadius: 8, border: `2px solid ${ep ? '#57c8a8' : '#d99f14'}`, background: ep ? '#eef8f4' : '#fff8e2' }}>
      <div style={{ fontSize: 10, color: ep ? '#1e6b55' : '#8a5a06' }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
        <span className="u-num" style={{ fontSize: 22, color: '#10243a' }}>{value}</span>
        <span style={{ fontSize: 10 }}>{ep ? 'EP' : 'PP'}</span>
      </div>
      {sub !== '' && <div style={{ fontSize: 10, fontWeight: 500, color: '#4a6178', overflowWrap: 'anywhere' }}>{sub}</div>}
    </div>
  );
}

function Ticket({ t }: { readonly t: VoteItem }): React.ReactElement {
  const hit = t.state === 'hit';
  const raceLine = [
    [t.raceScheduledAtMs === null ? '' : jstStamp(t.raceScheduledAtMs).slice(0, 5), t.raceNo].filter((s) => s !== '').join(' '),
    t.venue ?? '', t.course,
  ].filter((s) => s !== '').join(' ・ ');
  const epSub = t.state === 'void' ? '全額を参加ポイントで返しました' : stakeBreakdownOf(t.amountEP);
  const ppValue = t.state === 'wait' || t.state === 'void' ? '—' : t.payoutPP.toLocaleString('ja-JP');
  const ppSub = t.state === 'wait' ? '結果待ち'
    : t.state === 'void' ? '返還のため 動きません'
      : hit ? `${t.selectionText} 番 ${t.kindLabel} ${t.oddsAtPurchase.toFixed(1)} 倍` : '';
  return (
    <div style={{ position: 'relative', borderRadius: 6, background: '#fffdf6', color: '#10243a', boxShadow: '0 10px 22px rgba(0,0,0,.35)', overflow: 'hidden' }}>
      {/* ★マークシートの帯（★青と白の縞 10px） */}
      <div aria-hidden style={{ height: 10, background: 'repeating-linear-gradient(90deg,#1a6fd4 0 12px,#fffdf6 12px 18px)' }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px 10px', borderBottom: '2px solid #1a6fd4' }}>
        <span style={{ flex: '0 0 auto', padding: '4px 9px', border: '2px solid #1a6fd4', borderRadius: 4, color: '#1a6fd4', fontSize: 13, whiteSpace: 'nowrap' }}>投票の控え</span>
        <span style={{ flex: '1 1 auto' }} />
        <StateTag state={t.state} size={13} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0,1fr)', gap: '8px 14px', padding: '12px 14px', fontSize: 13, alignItems: 'baseline' }}>
        <span style={HEAD}>レース</span>
        <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
          {raceLine}
          {t.raceName !== '' && <span style={{ display: 'block', fontSize: 11, color: '#4a6178' }}>{t.raceName}</span>}
        </span>
        <span style={HEAD}>券種</span>
        <span>{t.kindLabel}</span>
        <span style={HEAD}>選んだ馬</span>
        <span style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
          {t.picks.map((p) => (
            <span key={p.gate} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 6, minWidth: 0,
              background: hit ? '#fff4cf' : '#f4f1e6', border: `1px solid ${hit ? '#e3c766' : '#dcd7c6'}`,
            }}>
              <GateBadge gate={p.gate} frame={p.frame} width={26} height={22} />
              <span style={{ flex: '1 1 auto', minWidth: 0, overflowWrap: 'anywhere' }}>{p.horseName}</span>
              {t.state !== 'wait' && (
                <span style={{ flex: '0 0 auto', fontSize: 11, whiteSpace: 'nowrap', color: hit ? '#1e7a3a' : '#4a6178' }}>
                  {p.finishPos === null ? '—' : `${p.finishPos}着`}
                </span>
              )}
            </span>
          ))}
        </span>
        <span style={HEAD}>受付</span>
        <span className="u-num" style={{ fontSize: 15, overflowWrap: 'anywhere' }}>{jstStamp(t.createdAtMs)} ・ No. {receiptNoOf(t.betId)}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 8, padding: '0 14px 12px' }}>
        <PointBox kind="ep" label="使った参加ポイント" value={t.amountEP.toLocaleString('ja-JP')} sub={epSub} />
        <PointBox kind="pp" label="受け取った賞金ポイント" value={ppValue} sub={ppSub} />
      </div>
      <div style={{ padding: '8px 14px', background: '#f4f1e6', borderTop: '1px dashed #c9c2ab', fontSize: 11, fontWeight: 500, lineHeight: 1.6, color: '#4a6178' }}>
        2 つのポイントは別のものです。合計や差し引きは出しません。
      </div>
      {/* ★切り取り線（★半円 12px） */}
      <div aria-hidden style={{ height: 12, background: 'radial-gradient(circle at 8px 0,#0a2340 6px,transparent 6.5px) 0 0/16px 12px repeat-x' }} />
    </div>
  );
}

export function VoteTicketView({ betId }: { readonly betId: string }): React.ReactElement {
  const [paused, toggle] = useMotionPaused();
  /** ★undefined = 読み込み中・null = 見つからない */
  const [ticket, setTicket] = useState<VoteItem | null | undefined>(undefined);
  const [loadError, setLoadError] = useState(false);
  const [needsLogin, setNeedsLogin] = useState(false);

  useEffect(() => {
    let active = true;
    loadVoteTicket(betId)
      .then((t) => { if (active) setTicket(t); })
      .catch((e: unknown) => {
        if (!active) return;
        // ★未ログインは ★そう言う（★「読めませんでした」と混ぜない）
        if (e instanceof SignInRequiredError) { setNeedsLogin(true); return; }
        // ★生の文は出さない（★理由は console に）
        setLoadError(true);
        console.warn('[vote-ticket] 投票の控えを読めませんでした', e);
      });
    return () => { active = false; };
  }, [betId]);

  return (
    <div data-theme="uma" data-page-body className={paused ? 'u-paused' : undefined} style={{
      position: 'relative', width: '100%', minHeight: '100dvh', overflow: 'hidden', background: 'var(--u-navy)',
      display: 'flex', flexDirection: 'column',
    }}>
      <Backdrop />
      <TopBar title="投票の控え" backHref="/vote/history" paused={paused} onToggle={toggle} />
      <RaceStrip />

      {needsLogin && (
        <TextPanel role="status" style={{ padding: 14 }}>
          投票の控えを見るには、<a href="/login" style={{ color: 'var(--u-gold)' }}>ログイン</a>してください。
        </TextPanel>
      )}
      {loadError && <NoticeBar kind="soon" text="投票の控えを読めませんでした" actionLabel="再読み込み" actionHref={`/vote/history/${encodeURIComponent(betId)}`} />}

      <main style={{
        position: 'relative', flex: '1 1 auto', minHeight: 0, overflow: 'auto', padding: '10px 14px 0',
        width: '100%', maxWidth: 560, margin: '0 auto', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 12,
      }}>
        {ticket === undefined && !loadError && !needsLogin && <TextPanel role="status" style={{ width: '100%', margin: 0, padding: 14, boxSizing: 'border-box' }}>読み込んでいます…</TextPanel>}
        {ticket === null && (
          <TextPanel role="status" style={{ width: '100%', margin: 0, padding: 14, boxSizing: 'border-box' }}>
            この投票の控えは見つかりません。<a href="/vote/history" style={{ color: 'var(--u-gold)' }}>投票の履歴</a>から選んでください。
          </TextPanel>
        )}
        {ticket !== undefined && ticket !== null && <Ticket t={ticket} />}
        <div style={{ flex: '0 0 auto', display: 'flex', flexWrap: 'wrap', gap: 10, paddingBottom: 'var(--u-safe-bottom)' }}>
          {ticket !== undefined && ticket !== null && (
            <BigButton tone="ivory" label="レース詳細" sub="着順と照合" href={`/races/${encodeURIComponent(ticket.raceId)}`} grow="1 1 140px" />
          )}
          <BigButton tone="blue" label="投票モードへ" sub="次のレース" href="/vote" grow="1 1 140px" />
        </div>
      </main>
    </div>
  );
}
