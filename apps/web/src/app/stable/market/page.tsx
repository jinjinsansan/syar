'use client';

/**
 * ★**馬を迎える**（★D12-5・正典 **D-102**・デザイナーのカード `components/jockey-market`）
 *
 * 【🔴 ★2026-09-26: ★見本を外して 実データに繋ぎました】（★オーナー指示「繋いでください」）
 *   ★ループ 8 段のうち ★**ここだけ画面が繋がっていませんでした**（★`buy_horse` も `sell_horse` も
 *   ★どの画面からも呼ばれていない ＝ ★D-119 の族）。
 *   ✔ ★裏は全部 在りました: ★`buy_horse`（`0025`）・`sell_horse`（`0026`）・
 *     ★`horse_market_listing_public`（`0085`・★名前と戦績を返す）。
 *
 * 【🔴 ★繋いだときに 1 行 消しました — ★それが嘘になるからです】
 *   ⚠️ ★旧: ★「★**同じ値段の中なら、どの 1 頭を迎えても同じです**」
 *   ★見本は ★**匿名の枠の繰り返し**（★`{slot+1} 頭目`）だったので、それは本当でした。
 *   🔴 ★実データは ★**名前と戦績の違う個体**です。★同じ値段でも ★中身が違います。
 *     ★あの文を残すと ★**画面が嘘をつきます**（★「見本の馬」と同じ族）。
 *   → ★消しました。★かわりに ★**戦績を出します** — ★D-102 ③「走った実績のある馬だけ買える」と
 *     ★D-114「★手がかりは ★オッズと戦績だけ」が ★**そう定めている**からです（★`0085` の註記と同じ）。
 *
 * 【★2026-10-01: ★馬物語の画面の部品で組み直しました】（★オーナー「馬を買うをクリックすると 古いデザイン」）
 *   ★育成モードと同じ ★`Backdrop`・`TopBar`・`RaceStrip`・★紺地に金枠の板・`BigButton`。★**新しい意匠は作っていません**。
 *   ★`shell-routes.ts` の `OWN_HEADER` に入れて ★白い旧い枠を外しました。
 *   ★中身（★戦績だけ・★戻り額の赤い帯・★煽らない）は そのまま。★依頼: `design/hud-ds/requests/R-17-market-real-listings.md`
 *
 * 【★この画面が持たないもの】
 *   ⚠️ ★**値段を計算しません**（★`price_ep` / `sell_back_ep` は ★サーバーが書いた値）。
 *   ⚠️ ★**素質・能力・発見度を出しません**（★D-114）。
 *   ⚠️ ★**「もう一度探す」を置きません**（★引き直しを煽らない・D-102 ③）。
 *   ⚠️ ★`Date.now()` を使いません（★憲法 4）。★年齢は ★世界の週から引きます。
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  loadMarketScreen, buyHorse, type MarketListingView, type MarketScreenData,
} from '../../../lib/market-screen';
import { SignInRequiredError } from '../../../lib/stable-repo';
import { Backdrop, BigButton, TextPanel, TopBar, useMotionPaused } from '../../../components/uma/uma-parts';
import { RaceStrip } from '../../../components/uma/race-strip';

/** ★年齢（★週から。★画面で 1 年の長さを持たない・D-052 は `@star/scheduler` 側） */
const WEEKS_PER_YEAR_DISPLAY = 52;

/** ★1 頭の板（★ホームの馬名の板と同じ地） */
const CARD: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 6, padding: '12px 14px', borderRadius: 12, cursor: 'pointer',
  background: 'rgba(10,35,64,.86)', color: 'var(--u-ink)', textAlign: 'left', font: 'inherit',
};

export default function MarketPage(): React.ReactElement {
  const [data, setData] = useState<MarketScreenData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [paused, toggle] = useMotionPaused();

  /**
   * ★**冪等キー**（★`buy_horse` の `p_client_token`）。
   * ⚠️ 🔴 ★**押すたびに作り直さないこと** — ★作り直すと ★**2 回買えます**
   *    （★`create_account` で同じ穴を踏んでいます・V-19 ⑭）。★馬ごとに 1 つ持ち続けます。
   */
  const tokens = useMemo(() => new Map<string, string>(), []);
  const tokenFor = useCallback((horseId: string): string => {
    const hit = tokens.get(horseId);
    if (hit !== undefined) return hit;
    const made = crypto.randomUUID();
    tokens.set(horseId, made);
    return made;
  }, [tokens]);

  const reload = useCallback((): void => {
    setLoadError(null);
    loadMarketScreen()
      .then((d) => { setData(d); })
      // 🔴 ★失敗を空にしない（★「出品が無い」に見えてしまう・R-16）
      .catch((e: unknown) => {
        setData(null);
        setLoadError(e instanceof Error ? e.message : String(e));
      });
  }, []);
  useEffect(() => { reload(); }, [reload]);

  const onBuy = useCallback((horseId: string): void => {
    setSending(true);
    setActionError(null);
    buyHorse(horseId, tokenFor(horseId))
      .then((r) => {
        if (r.ok) { setDone(horseId); setPicked(null); reload(); return; }
        setActionError(r.reason);
      })
      .catch((e: unknown) => {
        // ★未ログインは ★DB の文を出さず、そう言います
        if (e instanceof SignInRequiredError) { setNeedsLogin(true); return; }
        setActionError('いま手続きできませんでした');
        console.error('[market] 迎える手続きが落ちました', e);
      })
      .finally(() => { setSending(false); });
  }, [reload, tokenFor]);

  const chosen: MarketListingView | null = data === null || picked === null
    ? null : (data.listings.find((l) => l.horseId === picked) ?? null);

  return (
    <div data-theme="uma" data-page-body className={paused ? 'u-paused' : undefined} style={{
      position: 'relative', width: '100%', minHeight: '100dvh', overflow: 'hidden', background: 'var(--u-navy)',
      display: 'flex', flexDirection: 'column', paddingBottom: 28,
    }}>
      <Backdrop />
      <TopBar title="馬市場" backHref="/home" paused={paused} onToggle={toggle} />
      <RaceStrip />

      {needsLogin && (
        <TextPanel role="status" style={{ padding: 14 }}>
          馬市場を見るには、<a href="/login" style={{ color: 'var(--u-gold)' }}>ログイン</a>してください。
        </TextPanel>
      )}
      {loadError !== null && (
        <TextPanel role="alert" style={{ padding: 14 }}>出品を読めませんでした: {loadError}</TextPanel>
      )}
      {data === null && loadError === null && !needsLogin && (
        <TextPanel role="status" style={{ padding: 14 }}>読み込んでいます…</TextPanel>
      )}

      {/**
        * 🔴 ★**出品が 0 のときは そう言います**（★空の一覧で黙らない・R-16）。
        * ⚠️ ★**「もう一度探す」を置きません**（★引き直しを煽らない・D-102 ③）。
        * ⚠️ 🔴 ★**「時間をおくと入れ替わります」と書きません。**
        *    ★入れ替わりの周期を ★**測っていません**。★測っていないことを画面に書くと、
        *    ★それは ★**待たせる約束**になります（★煽りの裏返し）。
        * ⚠️ ★**数えさせる語を出しません**（★「残り 0」「売り切れ」「完売」「補充」・D-102 ⑤）。
        */}
      {data !== null && data.listings.length === 0 && (
        <TextPanel role="status" style={{ padding: 14 }}>いまは出品がありません</TextPanel>
      )}

      {data !== null && data.listings.length > 0 && (
        <div style={{ position: 'relative', width: 'calc(100% - 28px)', maxWidth: 880, margin: '10px auto 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 13, color: 'var(--u-ink)', lineHeight: 1.7, textShadow: '0 1px 2px rgba(0,0,0,.6)' }}>
            いま {data.listings.length} 頭が出ています。<b style={{ color: 'var(--u-gold)' }}>手がかりは 戦績だけ</b>です。
          </div>
          {data.listings.map((l) => {
            const sel = picked === l.horseId;
            /** ★年齢（★世界の週との差。★画面で週の長さを決めない） */
            const ageY = Math.max(0, Math.floor((data.gameWeek - l.birthWeek) / WEEKS_PER_YEAR_DISPLAY));
            return (
              <button
                type="button"
                key={l.horseId}
                onClick={() => { setPicked(sel ? null : l.horseId); setActionError(null); }}
                aria-pressed={sel}
                style={{ ...CARD, border: sel ? '3px solid var(--u-gold)' : '2px solid rgba(246,194,28,.45)' }}
              >
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ fontSize: 17, fontWeight: 900 }}>{l.horseName}</span>
                  <span>
                    <span style={{ fontSize: 22, fontWeight: 900, color: 'var(--u-gold)' }}>{l.priceEP.toLocaleString('ja-JP')}</span>
                    <span style={{ fontSize: 11, fontWeight: 900, color: 'var(--u-ink-light-3)' }}> EP</span>
                  </span>
                </span>
                {/* ★手がかりは戦績だけ（★素質・能力・発見度は出さない・D-114） */}
                <span style={{ display: 'flex', gap: 12, fontSize: 12.5, fontWeight: 700, color: 'var(--u-ink-light-3)' }}>
                  {/* ⚠️ ★性別は出しません — ★共有の表が無く、★ここで 2 つ目を作らない（D-052）。
                      ★D-114 の「手がかり」は ★戦績なので、★正典上も要りません */}
                  <span>{ageY} 歳</span>
                  <span>{l.starts} 戦 {l.wins} 勝</span>
                  {l.g1Wins > 0 && <span style={{ color: 'var(--u-gold)' }}>G1 {l.g1Wins} 勝</span>}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* ★迎える確認（★戻る額を必ず数字で出す・★画面の下に留める） */}
      {chosen !== null && (
        <div style={{
          position: 'sticky', bottom: 0, width: 'calc(100% - 28px)', maxWidth: 880, margin: '16px auto 0', padding: '14px 14px 16px',
          border: '3px solid var(--u-gold)', borderRadius: 14, background: 'var(--u-panel-strong)', color: 'var(--u-ink)',
          display: 'flex', flexDirection: 'column', gap: 10, zIndex: 2,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 12, letterSpacing: '.1em', color: 'var(--u-ink-light-3)' }}>確認</span>
            <span style={{ fontSize: 16, fontWeight: 900 }}>{chosen.horseName}</span>
            <span style={{ marginLeft: 'auto' }}>
              <span style={{ fontSize: 22, fontWeight: 900, color: 'var(--u-gold)' }}>{chosen.priceEP.toLocaleString('ja-JP')}</span>
              <span style={{ fontSize: 11, fontWeight: 900, color: 'var(--u-ink-light-3)' }}> EP</span>
            </span>
          </div>
          {/**
            * ⚠️ ★戻る額は ★**サーバーが書いた値**です（★`sell_back_ep`）。
            *    ★旧は画面で `sellBackEP(price)` を計算していました（★式が 2 か所になる・D-052）。
            * 🔴 ★赤い帯は ★落とさない（★R-17・D-102）。
            */}
          <div style={{ padding: '10px 12px', borderRadius: 8, background: 'rgba(168,26,19,.22)', border: '2px solid var(--u-red)' }}>
            <span style={{ fontSize: 13, fontWeight: 900, lineHeight: 1.65 }}>
              この馬を手放すと戻るのは<span style={{ fontSize: 16 }}> {chosen.sellBackEP.toLocaleString('ja-JP')} EP</span> です
            </span>
          </div>
          {actionError !== null && (
            <span role="status" style={{ fontSize: 13, fontWeight: 900, color: 'var(--u-red)' }}>{actionError}</span>
          )}
          <BigButton
            tone={sending ? 'disabled' : 'gold'}
            label={sending ? '手続きしています…' : `この馬を迎える（${chosen.priceEP.toLocaleString('ja-JP')} EP）`}
            {...(sending ? {} : { onClick: () => { onBuy(chosen.horseId); } })}
            grow="0 0 auto"
          />
        </div>
      )}

      {done !== null && (
        <TextPanel role="status" style={{ padding: 14 }}>
          迎えました。<a href="/train" style={{ color: 'var(--u-gold)' }}>育成モード</a>で調教できます。
        </TextPanel>
      )}
    </div>
  );
}
