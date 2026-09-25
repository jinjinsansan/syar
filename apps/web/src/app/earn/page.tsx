'use client';

/**
 * ★**ポイントを稼ぐ（`/earn`）**（★R-14・2026-09-17・引き渡し資料 §8-7）
 *
 * 【★この画面が守ること】（★憲法 §0.2・正典 §17.1 L-8）
 *   ★**受け取れるのは参加ポイントだけ**。★**賞金ポイントは稼げません**（レースの結果だけで増えます）
 *   ★**現金が手に入ると読める見せ方をしない** — ★獲得は**広告視聴・アンケート・オファー・ログイン**のみ
 *   ★**「購入」「チャージ」「換金」「課金」を書かない**
 *
 * ⚠️ ★**広告 SDK・オファー壁の接続先は未定**です（★資料 §8-7）。★その 3 つは準備中のままです。
 *
 * 【✅ ★2026-09-25: ★**毎日のログインだけ、実際に繋ぎました**】（★D-075・`0080_daily_ep.sql`）
 *   🔴 ★それまで ★**EP が入ってくる経路が 1 つもありませんでした**（★口座を作るときの 2,000 だけ）。
 *     ★調教はワーカーが毎週 EP を吸うので、★**全員がいずれ 0 になり、何もできなくなります。**
 *     ★本番のオーナーの口座が実際にそうなりました（★残高 0・出走登録もできない）。
 *   ★裁定 `REVIEW_EP_INFLOW_AND_ENTRY_20260925.md` §1「★これは公開を止める欠陥」。
 */

import { useCallback, useEffect, useState } from 'react';
import {
  Backdrop, BigButton, TopBar, useMotionPaused,
} from '../../components/uma/uma-parts';
import { RaceStrip } from '../../components/uma/race-strip';
import {
  DAILY_EP_NO_CARRYOVER_NOTE, DAILY_EP_STALLED_NOTE,
  claimDailyEp, fetchDailyEpState, type DailyEpState,
} from '../../lib/daily-ep';
import { SignInRequiredError } from '../../lib/stable-repo';

/** ★提供元が決まっていない受け取り方（★資料 §8-7。★どれも利用者がお金を払わない形） */
const WAYS = [
  { icon: '▶', title: '動画を見る', note: '提供元の接続を準備中です' },
  { icon: '☑', title: 'アンケートに答える', note: '提供元の接続を準備中です' },
  { icon: '★', title: 'オファーを試す', note: '提供元の接続を準備中です' },
] as const;

/**
 * ★**毎日のログイン**（★実際に受け取れる唯一の口）。
 *
 * ⚠️ ★**押す前に「持ち越せない」と言います**（★裁定 §5 (c)・D-123 の作法）。
 *    ★押したあとに知らせると、★受け取り忘れた人に後から不利を告げる形になります。
 */
function DailyLogin(): React.ReactElement {
  const [state, setState] = useState<DailyEpState | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [needsLogin, setNeedsLogin] = useState(false);

  const reload = useCallback((): void => {
    fetchDailyEpState()
      .then((s) => { setState(s); setNeedsLogin(false); })
      .catch((e: unknown) => {
        if (e instanceof SignInRequiredError) { setNeedsLogin(true); return; }
        setMessage(e instanceof Error ? e.message : '状態を読めませんでした');
      });
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const onClaim = (): void => {
    setBusy(true);
    setMessage(null);
    claimDailyEp()
      .then((r) => {
        setMessage(r.alreadyClaimed
          ? '今日のぶんは受け取り済みです。'
          : `${r.granted} EP を受け取りました（残高 ${r.balance} EP）。`);
        reload();
      })
      .catch((e: unknown) => setMessage(e instanceof Error ? e.message : '受け取れませんでした'))
      .finally(() => setBusy(false));
  };

  const amount = state === null ? null : state.amount;
  /**
   * 🔴 ★**止まっているのを「受け取り済み」と見せない**（★裁定 §7 ①・`0081`）。
   *   ★配布が止まっているときは ★受け取ったから押せないのではありません。
   *   ★判定より ★**先に**見ること（★順番を変えると、また「受け取り済み」が勝ちます）。
   */
  const label = needsLogin ? 'ログインが必要です'
    : state === null ? '読み込んでいます…'
      : state.distributionStalled ? DAILY_EP_STALLED_NOTE
        : state.alreadyClaimed ? '今日のぶんは受け取り済み'
          : `${amount} EP を受け取る`;

  return (
    <div style={{
      flex: '0 0 auto', padding: 10, borderRadius: 12, background: 'var(--u-paper)',
      border: '3px solid var(--u-ep)', boxShadow: 'var(--u-shadow-card)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{
          flex: '0 0 auto', width: 38, height: 38, borderRadius: 8,
          border: '2px solid var(--u-ink-dark)',
          backgroundImage: 'linear-gradient(#e4e8ec,#d3dae1)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 17, color: 'var(--u-ink-dark)',
        }}>◎</span>
        <span style={{ flex: '1 1 auto', minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: 15, color: 'var(--u-ink-dark)' }}>毎日のログイン</span>
          {/* 🔴 ★押す前に言う（★裁定 §5 (c)） */}
          <span style={{ display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--u-ink-dark-2)', lineHeight: 1.5 }}>
            {state?.distributionStalled === true
              ? `${DAILY_EP_STALLED_NOTE}。復旧すると また受け取れます。`
              : `1 日 1 回 受け取れます。${DAILY_EP_NO_CARRYOVER_NOTE}。`}
          </span>
        </span>
        {amount !== null && (
          <span className="u-num" style={{ fontSize: 16, color: 'var(--u-ink-dark)' }}>{amount} EP</span>
        )}
      </div>
      {needsLogin ? (
        <a
          href="/login"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', minHeight: 44,
            marginTop: 8, borderRadius: 8, border: '2px solid var(--u-ink-dark)',
            backgroundImage: 'linear-gradient(#ffe483,#f5cf5d)', color: 'var(--u-ink-dark)',
            fontSize: 14, fontWeight: 900, textDecoration: 'none',
          }}
        >
          ログインして受け取る
        </a>
      ) : (
        <button
          type="button"
          onClick={onClaim}
          disabled={busy || state === null || !state.claimable}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', minHeight: 44,
            marginTop: 8, borderRadius: 8,
            border: `2px solid ${state?.claimable === true ? 'var(--u-ink-dark)' : '#c3ccd4'}`,
            backgroundImage: state?.claimable === true
              ? 'linear-gradient(#ffe483,#f5cf5d)' : 'linear-gradient(#e7e9ec,#dfe3e8)',
            color: 'var(--u-ink-dark)', fontSize: 14, fontWeight: 900,
          }}
        >
          {busy ? '受け取っています…' : label}
        </button>
      )}
      {message !== null && (
        <div role="status" style={{ marginTop: 6, fontSize: 11, fontWeight: 700, color: 'var(--u-ink-dark)' }}>
          {message}
        </div>
      )}
    </div>
  );
}

export default function EarnPage(): React.ReactElement {
  const [paused, toggle] = useMotionPaused();
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
      <TopBar title="ポイントを稼ぐ" paused={paused} onToggle={toggle} />
      <RaceStrip />
      <div role="status" style={{ position: 'relative', padding: '6px 14px', color: 'var(--u-gold)', fontSize: 12 }}>
        毎日のログインで参加ポイントを受け取れます。動画・アンケート・オファーは提供元の接続を準備中です。
      </div>

      {/* ★EP のカプセル＋常設の注記（★PP は稼げないと明言） */}
      <div style={{
        position: 'relative', flex: '0 0 auto', display: 'flex', flexWrap: 'wrap', gap: 8,
        padding: '10px 14px 0', width: '100%', maxWidth: 1220, margin: '0 auto',
      }}>
        <div style={{
          flex: '1 1 220px', minWidth: 0, maxWidth: 430, padding: '7px 12px',
          border: '2px solid var(--u-ep)', borderRadius: 12, background: 'rgba(8,26,22,.82)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ flex: '0 0 auto', width: 11, height: 11, borderRadius: '50%', border: '3px solid var(--u-ep)' }} />
            <span style={{ fontSize: 11, letterSpacing: '.08em', color: 'var(--u-ep-ink)', whiteSpace: 'nowrap' }}>参加ポイント</span>
            <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'baseline', gap: 5 }}>
              <span className="u-num" style={{ fontSize: 18, color: 'var(--u-ep-num)' }}>残高はダッシュボードで確認</span>
              <span style={{ fontSize: 11, color: 'var(--u-ep-ink)' }}>EP</span>
            </span>
          </div>
          <div style={{ marginTop: 2, fontSize: 10, fontWeight: 500, color: '#a9d8cb' }}>
            ゲーム内で使う（無償でのみ受け取れます）
          </div>
        </div>
        <div style={{
          flex: '1 1 220px', minWidth: 0, maxWidth: 430, padding: '7px 12px',
          border: '2px solid rgba(251,247,236,.28)', borderRadius: 12, background: 'var(--u-panel)',
          fontSize: 11, fontWeight: 500, lineHeight: 1.55, color: '#e6edf3',
        }}>
          ここで受け取れるのは<b>参加ポイントだけ</b>です。<b>賞金ポイントは稼げません</b>（レースの結果だけで増えます）。
        </div>
      </div>

      {/* ★受け取り方 4 つ（★390 は 1 列／1280 は 4 列） */}
      <div style={{
        position: 'relative', flex: '1 1 auto', minHeight: 0, overflow: 'auto',
        padding: '10px 14px 0', width: '100%', maxWidth: 1220, margin: '0 auto',
      }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(290px,1fr))', gap: 10 }}>
          {/* ★実際に受け取れるのはこれだけ。★先頭に置く */}
          <DailyLogin />
          {WAYS.map((w) => (
            <div key={w.title} style={{
              flex: '0 0 auto', padding: 10, borderRadius: 12, background: 'var(--u-paper)',
              border: '3px solid rgba(251,247,236,.22)', boxShadow: 'var(--u-shadow-card)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{
                  flex: '0 0 auto', width: 38, height: 38, borderRadius: 8,
                  border: '2px solid var(--u-ink-dark)',
                  backgroundImage: 'linear-gradient(#e4e8ec,#d3dae1)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 17, color: 'var(--u-ink-dark)',
                }}>{w.icon}</span>
                <span style={{ flex: '1 1 auto', minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 15, color: 'var(--u-ink-dark)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {w.title}
                  </span>
                  <span style={{ display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--u-ink-dark-2)', lineHeight: 1.5 }}>
                    {w.note}
                  </span>
                </span>
                <span style={{ fontSize: 11, color: 'var(--u-ink-dark-2)' }}>準備中</span>
              </div>
              {/* ★接続先が未定なので、押しても何も起きません（★`button` で口だけ用意） */}
              <button
                type="button"
                disabled
                title="提供元が決まるまで利用できません"
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', minHeight: 44,
                  marginTop: 8, borderRadius: 8, border: '2px solid #c3ccd4',
                  backgroundImage: 'linear-gradient(#e7e9ec,#dfe3e8)',
                  color: 'var(--u-ink-dark-2)', fontSize: 14,
                }}
              >
                利用準備中
              </button>
            </div>
          ))}
        </div>
      </div>

      <div style={{
        position: 'relative', flex: '0 0 auto', display: 'flex', flexWrap: 'wrap', gap: 10,
        padding: '10px 14px var(--u-safe-bottom)', width: '100%', maxWidth: 1220, margin: '0 auto',
      }}>
        <BigButton tone="disabled" label="広告・アンケートは準備中" sub="提供元が決まるまで利用できません" grow="1.4 1 210px" />
        <BigButton tone="ivory" label="ダッシュボード" sub="いつでも戻れます" href="/home" grow="1 1 130px" />
      </div>
    </div>
  );
}
