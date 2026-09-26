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
 * 【⚠️ ★見た目は仮です（★T-11・デザイナー便）】
 *   ★このファイルの旧い註記も ★「🔴 T-11 でこの画面ごと変わります。★見た目はデザイナー便」と
 *   ★書いていました。★**新しい意匠は作っていません** — ★色・字・枠・「迎える」の語・
 *   ★戻り額の赤い帯は ★**既存のまま**で、★中身を実データに替えただけです。
 *   ★依頼: `design/hud-ds/requests/R-17-market-real-listings.md`
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

/** ★年齢（★週から。★画面で 1 年の長さを持たない・D-052 は `@star/scheduler` 側） */
const WEEKS_PER_YEAR_DISPLAY = 52;

export default function MarketPage(): React.ReactElement {
  const [data, setData] = useState<MarketScreenData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

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
    <div style={{ padding: '0 0 28px' }}>
      <div className="a-band" style={{ height: 52, padding: '0 16px' }}>
        <span style={{ fontSize: 18, fontWeight: 900, letterSpacing: '.06em' }}>馬を迎える</span>
      </div>

      {needsLogin && (
        <p role="status" style={{ padding: '14px 16px', fontSize: 12.5, fontWeight: 900, color: 'var(--a-ink-2)' }}>
          馬を迎えるには、<a href="/login">ログイン</a>してください。
        </p>
      )}
      {loadError !== null && (
        <div className="a-panel" style={{ margin: '14px 16px 0', padding: '14px 16px', fontSize: 14, fontWeight: 900, color: 'var(--a-red-d)' }}>
          出品を読めませんでした: {loadError}
        </div>
      )}
      {data === null && loadError === null && (
        <div className="a-panel" style={{ margin: '14px 16px 0', padding: '14px 16px', fontSize: 14, fontWeight: 900, color: 'var(--a-ink-2)' }}>
          読み込んでいます…
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
        <div style={{ margin: '14px 16px 0', padding: '11px 13px', borderRadius: 9, background: '#fff8ea', border: '2px solid #d9b25a' }}>
          <span style={{ fontSize: 11.5, fontWeight: 900, color: '#4a3105', lineHeight: 1.7 }}>
            いまは出品がありません
          </span>
        </div>
      )}

      {data !== null && data.listings.length > 0 && (
        <>
          <div style={{ padding: '12px 16px 0', fontSize: 11.5, fontWeight: 900, color: 'var(--a-ink-2)', lineHeight: 1.7 }}>
            いま {data.listings.length} 頭が出ています。
            <b style={{ color: 'var(--a-ink)' }}>手がかりは 戦績だけ</b>です。
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '14px 16px 0' }}>
            {data.listings.map((l) => {
              const sel = picked === l.horseId;
              /** ★年齢（★世界の週との差。★画面で週の長さを決めない） */
              const ageY = Math.max(0, Math.floor((data.gameWeek - l.birthWeek) / WEEKS_PER_YEAR_DISPLAY));
              return (
                <div
                  key={l.horseId}
                  onClick={() => { setPicked(sel ? null : l.horseId); setActionError(null); }}
                  style={{
                    display: 'flex', flexDirection: 'column', gap: 8, padding: '14px 14px 16px', borderRadius: 14,
                    background: '#fff', cursor: 'pointer',
                    border: sel ? '3px solid #8a5a06' : '2px solid var(--a-edge)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ fontSize: 15, fontWeight: 900 }}>{l.horseName}</span>
                    <span>
                      <span className="a-num" style={{ fontSize: 20, color: 'var(--a-num-money)' }}>{l.priceEP.toLocaleString('ja-JP')}</span>
                      <span style={{ fontSize: 11, fontWeight: 900, color: 'var(--a-ink-2)' }}> EP</span>
                    </span>
                  </div>
                  {/* ★手がかりは戦績だけ（★素質・能力・発見度は出さない・D-114） */}
                  <div style={{ display: 'flex', gap: 10, fontSize: 11.5, fontWeight: 900, color: 'var(--a-ink-2)' }}>
                    {/* ⚠️ ★性別は出しません — ★共有の表が無く、★ここで 2 つ目を作らない（D-052）。
                        ★D-114 の「手がかり」は ★戦績なので、★正典上も要りません */}
                    <span>{ageY} 歳</span>
                    <span>{l.starts} 戦 {l.wins} 勝</span>
                    {l.g1Wins > 0 && <span style={{ color: '#4a3105' }}>G1 {l.g1Wins} 勝</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ★迎える確認（★戻る額を必ず数字で出す） */}
      {chosen !== null && (
        <div className="a-panel" style={{ margin: '16px 16px 0', borderWidth: 3 }}>
          <div className="a-band" style={{ height: 38, padding: '0 14px' }}>
            <span style={{ fontSize: 14, fontWeight: 900 }}>迎える確認</span>
          </div>
          <div style={{ padding: '14px 14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 14, fontWeight: 900 }}>{chosen.horseName}</span>
              <span style={{ marginLeft: 'auto' }}>
                <span className="a-num" style={{ fontSize: 22, color: 'var(--a-num-money)' }}>{chosen.priceEP.toLocaleString('ja-JP')}</span>
                <span style={{ fontSize: 11, fontWeight: 900, color: 'var(--a-ink-2)' }}> EP</span>
              </span>
            </div>
            {/**
              * ⚠️ ★戻る額は ★**サーバーが書いた値**です（★`sell_back_ep`）。
              *    ★旧は画面で `sellBackEP(price)` を計算していました（★式が 2 か所になる・D-052）。
              */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '10px 12px', borderRadius: 8, background: '#ffeceb', border: '2px solid #a81a13' }}>
              <span style={{ fontSize: 12, fontWeight: 900, color: '#a81a13', lineHeight: 1.65 }}>
                この馬を手放すと戻るのは<span style={{ fontSize: 15 }}> {chosen.sellBackEP.toLocaleString('ja-JP')} EP</span> です
              </span>
            </div>
            {actionError !== null && (
              <span role="status" style={{ fontSize: 12.5, fontWeight: 900, color: 'var(--a-red-d)' }}>{actionError}</span>
            )}
            <button
              type="button"
              disabled={sending}
              onClick={() => { onBuy(chosen.horseId); }}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', minHeight: 48,
                borderRadius: 10, backgroundImage: 'var(--a-gloss-gold)', border: '2px solid #8a5a06',
                fontSize: 15, fontWeight: 900, color: '#4a3105', cursor: sending ? 'default' : 'pointer',
              }}
            >
              {sending ? '手続きしています…' : `この馬を迎える（${chosen.priceEP.toLocaleString('ja-JP')} EP）`}
            </button>
          </div>
        </div>
      )}

      {done !== null && (
        <p role="status" style={{ padding: '14px 16px 0', fontSize: 12.5, fontWeight: 900, color: 'var(--a-green-d)' }}>
          迎えました。<a href="/stable">厩舎</a>で見られます。
        </p>
      )}
    </div>
  );
}
