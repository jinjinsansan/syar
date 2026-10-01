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
import { Backdrop, BigButton, NoticeBar, TextPanel, TopBar, useMotionPaused } from '../../../components/uma/uma-parts';
import { RaceStrip } from '../../../components/uma/race-strip';

/** ★年齢（★週から。★画面で 1 年の長さを持たない・D-052 は `@star/scheduler` 側） */
const WEEKS_PER_YEAR_DISPLAY = 52;

/** ★1 頭の板（★R-26 D26-1・紙の地・値段は濃紺） */
const CARD: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 8, padding: '11px 12px', minHeight: 84, boxSizing: 'border-box', borderRadius: 12,
  cursor: 'pointer', color: '#10243a', textAlign: 'left', font: 'inherit',
};
/** ★戦績の札（★R-26 D26-1） */
const TAG: React.CSSProperties = { padding: '2px 8px', borderRadius: 5, background: '#e8eef3', color: '#25384a', fontSize: 11 };
/** ★金のグロス（★G1 勝ちの札だけ） */
const GOLD_GLOSS = 'linear-gradient(100deg,#fff6b0 0%,#f3cf34 30%,#d99f14 48%,#ffe483 62%,#fff6b0 100%)';

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
        console.warn('[market] 出品を読めませんでした', e);
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
      display: 'flex', flexDirection: 'column',
    }}>
      <Backdrop />
      <TopBar title="馬市場" backHref="/home" paused={paused} onToggle={toggle} />
      <RaceStrip />

      {needsLogin && (
        <TextPanel role="status" style={{ padding: 14 }}>
          馬市場を見るには、<a href="/login" style={{ color: 'var(--u-gold)' }}>ログイン</a>してください。
        </TextPanel>
      )}
      {/* ★読めなかった: ★生の文は出さず ★誤りの帯（★R-26 🔴3・R-21 §3）。★理由は console に */}
      {loadError !== null && <NoticeBar kind="soon" text="出品を読めませんでした" actionLabel="再読み込み" actionHref="/stable/market" />}

      <main style={{
        position: 'relative', flex: '1 1 auto', minHeight: 0, overflow: 'auto', padding: '10px 14px 0',
        width: '100%', maxWidth: 1220, margin: '0 auto', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 12,
      }}>
        {data === null && loadError === null && !needsLogin && (
          <TextPanel role="status" style={{ padding: 14 }}>読み込んでいます…</TextPanel>
        )}
        {data !== null && (
          <div style={{
            flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '10px 12px', borderRadius: 12,
            background: 'rgba(10,35,64,.9)', border: '2px solid rgba(251,247,236,.28)',
          }}>
            <span style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
              <span style={{ fontSize: 11, color: '#cfe0ee' }}>いま</span>
              <span style={{ fontSize: 22 }}>{data.listings.length}</span>
              <span style={{ fontSize: 11, color: '#cfe0ee' }}>頭が出ています</span>
            </span>
            <span style={{ marginLeft: 'auto', padding: '4px 10px', borderRadius: 999, background: '#061a33', border: '1px solid #f6c21c', color: '#ffe483', fontSize: 11 }}>
              手がかりは 戦績だけ
            </span>
          </div>
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
          <div style={{
            flex: '0 0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '30px 16px', borderRadius: 12,
            background: 'rgba(10,35,64,.9)', border: '2px dashed rgba(251,247,236,.35)', textAlign: 'center',
          }}>
            <span style={{ fontSize: 17 }}>いまは出品がありません</span>
          </div>
        )}

        {data !== null && data.listings.length > 0 && (
          <div style={{ flex: '0 0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 8 }}>
            {data.listings.map((l) => {
              const sel = picked === l.horseId;
              /** ★年齢（★世界の週との差。★画面で週の長さを決めない） */
              const ageY = Math.max(0, Math.floor((data.gameWeek - l.birthWeek) / WEEKS_PER_YEAR_DISPLAY));
              return (
                <button
                  type="button"
                  key={l.horseId}
                  onClick={() => { setPicked(sel ? null : l.horseId); setActionError(null); setDone(null); }}
                  aria-pressed={sel}
                  style={{
                    ...CARD,
                    background: sel ? '#fff4cf' : '#fbf7ec',
                    border: sel ? '3px solid #f6c21c' : '3px solid rgba(251,247,236,.22)',
                    boxShadow: sel ? '0 4px 0 #a9741a' : '0 3px 0 rgba(10,35,64,.5)',
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <span style={{ flex: '1 1 auto', minWidth: 0, fontSize: 16, lineHeight: 1.3 }}>{l.horseName}</span>
                    {/* ★値段は濃紺（★色で煽らない・R-26 🔴1） */}
                    <span style={{ flex: '0 0 auto', display: 'flex', alignItems: 'baseline', gap: 3 }}>
                      <span style={{ fontSize: 22, color: '#10243a' }}>{l.priceEP.toLocaleString('ja-JP')}</span>
                      <span style={{ fontSize: 10, color: '#4a6178' }}>EP</span>
                    </span>
                  </span>
                  {/* ★手がかりは戦績だけ（★素質・能力・発見度は出さない・D-114） */}
                  <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    {/* ⚠️ ★性別は出しません — ★共有の表が無く、★ここで 2 つ目を作らない（D-052）。
                        ★D-114 の「手がかり」は ★戦績なので、★正典上も要りません */}
                    <span style={TAG}>{ageY} 歳</span>
                    <span style={TAG}>{l.starts} 戦 {l.wins} 勝</span>
                    {l.g1Wins > 0 && <span style={{ ...TAG, backgroundImage: GOLD_GLOSS, border: '1px solid #a9741a', color: '#10243a' }}>G1 {l.g1Wins} 勝</span>}
                    {sel && <span style={{ marginLeft: 'auto', fontSize: 11, color: '#a9741a' }}>選んでいます</span>}
                  </span>
                </button>
              );
            })}
          </div>
        )}
        <div style={{ flex: '0 0 auto', height: 8 }} />
      </main>

      {/* ★迎える確認（★下段の直上に留める・★戻る額を必ず数字で出す） */}
      {chosen !== null && (
        <div style={{
          position: 'sticky', bottom: 0, width: 'calc(100% - 28px)', maxWidth: 880, margin: '10px auto 0', padding: '12px 14px 14px',
          border: '3px solid #f6c21c', borderRadius: 14, background: 'rgba(6,26,51,.97)', color: '#fbf7ec',
          boxShadow: '0 -8px 20px rgba(0,0,0,.35)', display: 'flex', flexDirection: 'column', gap: 10, zIndex: 2,
        }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <span style={{ fontSize: 11, color: '#cfe0ee' }}>確認</span>
            <span style={{ fontSize: 16 }}>{chosen.horseName}</span>
            <span style={{ marginLeft: 'auto', fontSize: 22, color: '#ffe483' }}>{chosen.priceEP.toLocaleString('ja-JP')}<span style={{ fontSize: 10, color: '#cfe0ee' }}> EP</span></span>
          </div>
          {/**
            * ⚠️ ★戻る額は ★**サーバーが書いた値**です（★`sell_back_ep`）。
            *    ★旧は画面で `sellBackEP(price)` を計算していました（★式が 2 か所になる・D-052）。
            * 🔴 ★赤い帯は ★落とさない（★R-17・D-102）。
            */}
          <div style={{ padding: '10px 12px', borderRadius: 8, background: 'rgba(168,26,19,.24)', border: '2px solid #d62f26', fontSize: 13, lineHeight: 1.6 }}>
            この馬を手放すと戻るのは<span style={{ fontSize: 19 }}> {chosen.sellBackEP.toLocaleString('ja-JP')} </span>EP です
          </div>
          {actionError !== null && (
            <span role="status" style={{ fontSize: 13, color: 'var(--u-red)' }}>{actionError}</span>
          )}
        </div>
      )}

      {/* ★迎えた後（★確認の板の位置に 緑の縁の板） */}
      {done !== null && chosen === null && (
        <div role="status" style={{
          width: 'calc(100% - 28px)', maxWidth: 880, margin: '10px auto 0', padding: '12px 14px', borderRadius: 14,
          border: '3px solid var(--u-ep)', background: 'rgba(6,26,51,.97)', color: '#fbf7ec', fontSize: 14, lineHeight: 1.6,
        }}>
          迎えました。育成モードで調教できます。
        </div>
      )}

      {/* ★下段の大きいボタン（★選ぶ前は ダッシュボードへ／選んだら 迎える／迎えた後は 育成モードへ） */}
      <div style={{ position: 'relative', display: 'flex', gap: 10, width: '100%', maxWidth: 880, margin: '10px auto 0', padding: '0 14px 34px', boxSizing: 'border-box' }}>
        {chosen !== null ? (
          <BigButton
            tone={sending ? 'disabled' : 'gold'}
            label={sending ? '手続きしています…' : 'この馬を迎える'}
            sub={`${chosen.priceEP.toLocaleString('ja-JP')} EP を使います`}
            {...(sending ? {} : { onClick: () => { onBuy(chosen.horseId); } })}
            grow="1 1 100%"
          />
        ) : done !== null ? (
          <BigButton tone="gold" label="育成モードへ" sub="今週の調教をする" href="/train" grow="1 1 100%" />
        ) : (
          <BigButton tone="ivory" label="ダッシュボード" sub="ホームへ戻る" href="/home" grow="1 1 100%" />
        )}
      </div>
    </div>
  );
}
