'use client';

/**
 * ★**投票の履歴**（★2026-10-01・デザイナー引き渡し ② §2-3・見本 `VoteHistory.dc.html` の `mode="list"`）
 *
 * 【★語の決まり（§2-1）】★引き渡し §2-1 の禁止語を ★画面に出しません（★外れた控えの札は「確定」）。
 * 【★ポイント】★「今月 投票に使った n EP」と「今月 受け取った n PP」を ★別のカプセルで並べます。
 *   ⚠️ ★**合計・差し引き・的中率は出しません。** ★的中でも PP の数字の大きさと色は ほかと同じです。
 * 【★読むもの】★`lib/vote-history.ts`（★`bets` ＋ `races_public` ＋ `race_entries_public`）。
 *   ★未ログインは ★`SignInRequiredError` → ★そう言います（★DB の文を出さない）。★失敗は ★誤りの帯（★生の文は出さない）。
 * ⚠️ ★PC（1280）の 2 列の形（§2-5）は ★別の便です。
 */

import { useEffect, useMemo, useState } from 'react';
import { loadVoteHistory } from '../../../lib/vote-history';
import { jstClock, jstDayHeading, jstDayKey, type VoteHistoryData, type VoteItem } from '../../../lib/vote-history-view';
import { SignInRequiredError } from '../../../lib/stable-repo';
import { Backdrop, NoticeBar, TextPanel, TopBar, useMotionPaused } from '../../../components/uma/uma-parts';
import { RaceStrip } from '../../../components/uma/race-strip';
import { GateBadge, StateTag } from '../../../components/uma/vote-ticket-parts';
import { useNow } from '../../../components/clock';

type Tab = 'all' | 'wait' | 'done';
const TABS: readonly { readonly key: Tab; readonly label: string }[] = [
  { key: 'all', label: 'すべて' }, { key: 'wait', label: '結果待ち' }, { key: 'done', label: '確定' },
];
const inTab = (it: VoteItem, tab: Tab): boolean => tab === 'all' || (tab === 'wait' ? it.state === 'wait' : it.state !== 'wait');

/** ★今月の欄のカプセル（★EP の色／PP の色・§2-3） */
function MonthCapsule({ kind, label, value }: { readonly kind: 'ep' | 'pp'; readonly label: string; readonly value: number }): React.ReactElement {
  const ep = kind === 'ep';
  return (
    <div style={{ minWidth: 0, padding: '8px 10px', borderRadius: 10, border: `2px solid ${ep ? '#57c8a8' : '#f6c21c'}`, background: ep ? 'rgba(8,26,22,.86)' : 'rgba(30,22,4,.86)' }}>
      <div style={{ fontSize: 10, color: ep ? '#cfeee4' : '#fff3cd' }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
        <span className="u-num" style={{ fontSize: 22, color: ep ? '#eafaf4' : '#fff3cd' }}>{value.toLocaleString('ja-JP')}</span>
        <span style={{ fontSize: 10, color: ep ? '#cfeee4' : '#fff3cd' }}>{ep ? 'EP' : 'PP'}</span>
      </div>
    </div>
  );
}

/** ★控えのカード（★紙地・3 行・§2-3） */
function VoteCard({ it }: { readonly it: VoteItem }): React.ReactElement {
  /** ★結果待ちは「—」。★返還は PP を受け取っていないので「—」（★EP で戻っている） */
  const pp = it.state === 'wait' || it.state === 'void' ? '—' : it.payoutPP.toLocaleString('ja-JP');
  return (
    <a href={`/vote/history/${encodeURIComponent(it.betId)}`} style={{
      display: 'flex', flexDirection: 'column', gap: 6, padding: '10px 12px', boxSizing: 'border-box', minWidth: 0,
      borderRadius: 12, background: '#fbf7ec', border: '3px solid rgba(251,247,236,.22)', color: '#10243a', textDecoration: 'none',
    }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <span className="u-num" style={{ flex: '0 0 auto', fontSize: 15, color: '#4a6178' }}>{jstClock(it.createdAtMs)}</span>
        <span style={{ flex: '1 1 auto', minWidth: 0, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {[it.raceNo, it.course].filter((s) => s !== '').join(' ・ ') || it.raceName}
        </span>
        <StateTag state={it.state} />
      </span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <span style={{ flex: '0 0 auto', whiteSpace: 'nowrap', padding: '1px 7px', borderRadius: 4, background: '#0a2340', color: '#fbf7ec', fontSize: 11 }}>{it.kindLabel}</span>
        {it.picks.map((p) => (
          <span key={p.gate} style={{ flex: '0 0 auto', maxWidth: '100%', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, minWidth: 0 }}>
            <GateBadge gate={p.gate} frame={p.frame} />
            <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{p.horseName}</span>
          </span>
        ))}
      </span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', paddingTop: 6, borderTop: '1px dashed #c9c2ab', fontSize: 11, color: '#4a6178' }}>
        <span>使った</span>
        <span className="u-num" style={{ fontSize: 16, color: '#10243a' }}>{it.amountEP.toLocaleString('ja-JP')}</span>
        <span>EP</span>
        <span style={{ flex: '1 1 auto' }} />
        <span>受け取った</span>
        {/* ★的中でも 同じ大きさ・同じ色（★§2-3・確認リスト） */}
        <span className="u-num" style={{ fontSize: 16, color: '#10243a' }}>{pp}</span>
        <span>PP</span>
        <span aria-hidden style={{ paddingLeft: 4, fontSize: 16, color: '#123f6b' }}>›</span>
      </span>
    </a>
  );
}

export default function VoteHistoryPage(): React.ReactElement {
  const [paused, toggle] = useMotionPaused();
  /** ★「今日」「今月」の基準（★表示用の壁時計・`components/clock.tsx` の 1 か所から） */
  const nowMs = useNow(60_000);
  const [data, setData] = useState<VoteHistoryData | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [tab, setTab] = useState<Tab>('all');
  const [loadedFor, setLoadedFor] = useState<number | null>(null);

  useEffect(() => {
    /** ★最初の 1 回だけ読む（★壁時計が進むたびに読み直さない） */
    if (nowMs === null || loadedFor !== null) return;
    setLoadedFor(nowMs);
    loadVoteHistory(nowMs)
      .then((d) => { setData(d); })
      .catch((e: unknown) => {
        // ★未ログインは ★そう言う（★「読めませんでした」と混ぜない）
        if (e instanceof SignInRequiredError) { setNeedsLogin(true); return; }
        // ★生の文は出さない（★理由は console に）
        setLoadError(true);
        console.warn('[vote-history] 投票の履歴を読めませんでした', e);
      });
  }, [nowMs, loadedFor]);
  /**
   * ★**結果待ちが残っている間は 読み直す**（★2026-10-01・オーナー「既に結果は出ているのに 結果待ち」・控えの画面と同じ）。
   *   ★15 秒ごと・★画面が見えている間だけ。★結果待ちが 0 になったら止める。
   */
  const anyWaiting = (data?.items ?? []).some((i) => i.state === 'wait');
  useEffect(() => {
    if (!anyWaiting || nowMs === null) return undefined;
    let active = true;
    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      /** ★基準の時刻は 壁時計の 1 か所（`useNow`）から（★直に時計を読まない） */
      loadVoteHistory(nowMs).then((d) => { if (active) setData(d); }, () => undefined);
    }, 15_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [anyWaiting, nowMs]);

  const counts = useMemo(() => {
    const items = data?.items ?? [];
    return { all: items.length, wait: items.filter((i) => i.state === 'wait').length, done: items.filter((i) => i.state !== 'wait').length };
  }, [data]);

  /** ★日本時間の日ごとに まとめる（★新しい順のまま） */
  const groups = useMemo(() => {
    const out: { key: string; heading: string; items: VoteItem[] }[] = [];
    if (data === null || loadedFor === null) return out;
    for (const it of data.items.filter((i) => inTab(i, tab))) {
      const key = jstDayKey(it.createdAtMs);
      const last = out[out.length - 1];
      if (last !== undefined && last.key === key) last.items.push(it);
      else out.push({ key, heading: jstDayHeading(it.createdAtMs, loadedFor), items: [it] });
    }
    return out;
  }, [data, tab, loadedFor]);

  return (
    <div data-theme="uma" data-page-body className={paused ? 'u-paused' : undefined} style={{
      position: 'relative', width: '100%', minHeight: '100dvh', overflow: 'hidden', background: 'var(--u-navy)',
      display: 'flex', flexDirection: 'column',
    }}>
      <Backdrop />
      <TopBar title="投票の履歴" backHref="/vote" paused={paused} onToggle={toggle} />
      <RaceStrip />

      {needsLogin && (
        <TextPanel role="status" style={{ padding: 14 }}>
          投票の履歴を見るには、<a href="/login" style={{ color: 'var(--u-gold)' }}>ログイン</a>してください。
        </TextPanel>
      )}
      {/* ★読めなかった: ★生の文は出さず ★誤りの帯 */}
      {loadError && <NoticeBar kind="soon" text="投票の履歴を読めませんでした" actionLabel="再読み込み" actionHref="/vote/history" />}

      <main style={{
        position: 'relative', flex: '1 1 auto', minHeight: 0, overflow: 'auto', padding: '10px 14px 0',
        width: '100%', maxWidth: 1220, margin: '0 auto', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 10,
      }}>
        {data === null && !loadError && !needsLogin && <TextPanel role="status" style={{ padding: 14 }}>読み込んでいます…</TextPanel>}

        {data !== null && <>
          <div role="tablist" aria-label="絞り込み" style={{ flex: '0 0 auto', display: 'flex', gap: 6 }}>
            {TABS.map((t) => {
              const on = tab === t.key;
              return (
                <button key={t.key} type="button" role="tab" aria-selected={on} onClick={() => { setTab(t.key); }} style={{
                  flex: '1 1 0', minWidth: 0, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                  borderRadius: 10, boxSizing: 'border-box', border: on ? '3px solid #f6c21c' : '2px solid rgba(251,247,236,.3)',
                  background: on ? 'rgba(246,194,28,.18)' : 'rgba(10,35,64,.9)', color: '#fbf7ec', fontSize: 13, fontWeight: 800, whiteSpace: 'nowrap', cursor: 'pointer',
                }}>
                  {t.label}<span className="u-num" style={{ fontSize: 15 }}>{counts[t.key]}</span>
                </button>
              );
            })}
          </div>

          {/* ★今月の欄（★2 つを並べるだけ・★合計・差し引き・的中率は出さない） */}
          <div style={{ flex: '0 0 auto', display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 8 }}>
            <MonthCapsule kind="ep" label="今月 投票に使った" value={data.month.usedEP} />
            <MonthCapsule kind="pp" label="今月 受け取った" value={data.month.receivedPP} />
          </div>

          {data.items.length === 0 && (
            <TextPanel role="status" style={{ width: '100%', margin: 0, padding: 14, boxSizing: 'border-box' }}>まだ投票がありません。</TextPanel>
          )}
          {data.items.length > 0 && groups.length === 0 && (
            <TextPanel role="status" style={{ width: '100%', margin: 0, padding: 14, boxSizing: 'border-box' }}>この絞り込みに当たる投票はありません。</TextPanel>
          )}

          {groups.map((g) => (
            <section key={g.key} aria-label={g.heading} style={{ flex: '0 0 auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: 12, color: '#cfe0ee', textShadow: '0 2px 0 rgba(10,35,64,.6)' }}>{g.heading}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(320px, 100%), 1fr))', gap: 8 }}>
                {g.items.map((it) => <VoteCard key={it.betId} it={it} />)}
              </div>
            </section>
          ))}

          {data.truncated && (
            <div style={{ flex: '0 0 auto', fontSize: 11, color: '#cfe0ee' }}>新しい順に {data.items.length} 件まで出しています。</div>
          )}
          {/* ★残す期間は 書きません（★控えを消す決まりが どこにも無い・★書くと約束になる） */}
          <div style={{ flex: '0 0 auto', padding: '8px 2px', fontSize: 11, fontWeight: 500, lineHeight: 1.6, color: '#cfe0ee' }}>
            賞金ポイントは現金や暗号資産には換えられません。
          </div>
        </>}
        <div style={{ flex: '0 0 auto', height: 34 }} />
      </main>

    </div>
  );
}
