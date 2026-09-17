'use client';

/**
 * ★**デザイン確認の一覧（`/design-check`）**（★2026-09-17・オーナー指示
 *   ★「★デザイナーが作った全てのページをログイン認証なしで開発サーバーで見れるように
 *   ★してください。★クリック動作はなくても構いません。★ＰＣ表示とモバイル表示を
 *   ★チェックしたいだけです」）
 *
 * 【★この画面がすること】
 *   ★① ★**実装した馬物語の 10 画面**を、★PC 幅（1280）とモバイル幅（390）で ★**並べて**出します
 *   ★② ★**デザイナーのカード 29 枚**（`design/hud-ds`）を、★カードごとの指定幅で出します
 *   ★③ ★どれも ★**ログインなし**で開けます（★このアプリに認証はまだありません）
 *
 * 【★この画面がしないこと】
 *   ⚠️ ★**ビジネスロジックを持ちません**（★正典 §14.3）。★枠を並べるだけです。
 *   ⚠️ ★**カードの中身を作り直しません。** ★`public/ds/<名>/index.html` を
 *      ★そのまま枠に入れます（★デザイナーの正本を写しただけ・★作り変えない）。
 *
 * ⚠️ ★**開発の確認用の画面**です。★お客さまに見せる導線からは繋いでいません。
 */

import { useState } from 'react';

/** ★実装した画面（★馬物語 UI・★R-14 の 9 画面＋TOP） */
const SCREENS: readonly { readonly path: string; readonly label: string }[] = [
  { path: '/', label: 'TOP（馬物語）' },
  { path: '/home', label: 'ダッシュボード' },
  { path: '/howto', label: '使い方' },
  { path: '/earn', label: 'ポイントを稼ぐ' },
  { path: '/watch-race', label: '中継の入口' },
  { path: '/odds/demo?demo=1', label: 'オッズ（見本）' },
  /* ★画面を足したら、ここと `story-shell.tsx` の OWN_HEADER の両方に足すこと */
  { path: '/vote', label: '投票' },
  { path: '/train', label: '育成' },
  { path: '/mypage', label: 'わたしの馬' },
  { path: '/exchange', label: '交換' },
  // ★TOP の「はじめる」「ログイン」の飛び先（★2026-09-18 追加・裁定 §6 手順 7）
  //   ⚠️ ★**この 2 つが一覧から漏れていたため、旧テーマのまま本番に出た**。
  //      ★利用者が TOP から最初に押す 2 か所を、確認の対象から外していた。
  { path: '/signup', label: 'はじめる（登録）' },
  { path: '/login', label: 'ログイン' },
];

/**
 * ★デザイナーのカード（★`design/hud-ds/components/*` を `public/ds/` へ写したもの）。
 * ⚠️ ★空だった 7 つ（`horse-detail-mobile`・`horse-story`・`jockey-market`・
 *    ★`race-entry-mobile`・`records-mobile`・`stable-roster`・`training-result`）は
 *    ★**中身がありません**ので入れていません（★空の枠を並べても確認になりません）。
 */
const CARDS: readonly { readonly slug: string; readonly group: string; readonly label: string; readonly w: number }[] = [
  /*
    🔴 ★**アーケード（青い「STAR」）の 12 枚は外しました**（★2026-09-17・オーナー指摘
      ★「★デザイナーが以前作った STAR というデザインはもう使わないので反映すら不要」
      ★「★同じくこのブルー系の表示はもう使わない。★新しいハンドオフ通りです」）。

    ★外したもの（★`data-theme="arcade"` の 12 枚）:
      ★landing・program-board・odds-board・bet-sheet・race-detail・race-entry・
      ★stable-home・horse-detail・training・records・prize-exchange・setup
    ⚠️ ★**ファイルは消していません**（`design/hud-ds` に残っています）。★一覧に出さないだけです。
    ⚠️ ★残した 17 枚は ★**中継の HUD と本線の画面**で、★どれもアーケードのテーマを持ちません。
       ★中継 HUD は合格済みなので、そのまま確認できるようにしておきます。
  */
  { slug: 'screen-live', group: 'Screens', label: '【本線】フル画面／レース中', w: 1280 },
  { slug: 'title-card', group: 'Screens', label: '【本線】レース名タイトル（発走前）', w: 1280 },
  { slug: 'entry-board', group: 'Screens', label: '出馬表（発走前オーバーレイ）', w: 1280 },
  { slug: 'paddock', group: 'Screens', label: 'パドック（発走前）', w: 1280 },
  { slug: 'payout-board', group: 'Screens', label: '確定・払戻（レース後）', w: 1280 },
  { slug: 'call-band', group: 'HUD', label: '実況帯（リアルタイム）', w: 1280 },
  { slug: 'start-band', group: 'HUD', label: 'まもなく発走 帯', w: 1280 },
  { slug: 'broadcast-badges', group: 'HUD', label: '中継バッジと画面遷移エフェクト', w: 1280 },
  { slug: 'replay-bar', group: 'HUD', label: 'リプレイ操作（シークバー）', w: 1280 },
  { slug: 'winner-lower-third', group: 'HUD', label: '勝馬テロップ', w: 1280 },
  { slug: 'narrator-cast', group: 'HUD', label: 'ナレーター4名（立ち絵枠）', w: 1080 },
  { slug: 'minimap', group: 'HUD', label: 'コース図ミニマップ', w: 320 },
  { slug: 'standings', group: 'HUD', label: '順位パネル', w: 400 },
  { slug: 'section-tag', group: 'HUD', label: '区間タグ', w: 400 },
  { slug: 'motion-spec', group: 'Motion', label: '走行アニメーション仕様', w: 1080 },
  { slug: 'motion-mock', group: 'Motion', label: '走行モック（プレースホルダ）', w: 1080 },
  { slug: 'sheet-spec', group: 'Motion', label: 'スプライトシート仕様', w: 1080 },
];

/** ★枠の高さ（★中身の丈は分からないので、★見て回れる高さに揃えます） */
const FRAME_H = 560;

const shell: React.CSSProperties = {
  border: '2px solid #2a3a4a', borderRadius: 8, background: '#fff', overflow: 'hidden',
  flex: '0 0 auto',
};
const frame: React.CSSProperties = { display: 'block', border: 0, background: '#fff' };

/**
 * ★**開く口は指で押せる大きさにします**（★44px 以上・★資料 §2 の確認リスト）。
 *
 * ⚠️ ★2026-09-17: ★最初これを素の `<a>` で書いたところ、★実ブラウザの診断で
 *    ★**高さ 16px の口が 39 個**出ました（★`/design-check` の 44px 未満が 39/42）。
 *    ★自分が作った確認用の画面が、★**確認の基準を自分で破っていました**。
 */
const openLink: React.CSSProperties = {
  /**
   * ⚠️ ★`minWidth` も要ります（★2026-09-17）。★`minHeight` だけ付けたところ、
   *    ★文字が「/」1 字の TOP の行だけ ★**42×44px** になり、★診断に 1 個残りました
   *    （★39 → 1）。★**短い文字のときは幅が足りません。**
   */
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  minHeight: 44, minWidth: 44, padding: '0 10px',
  borderRadius: 8, border: '1px solid #2a3a4a', background: '#1b2c3c',
  fontSize: 12, fontWeight: 700, color: '#7fc4ff', textDecoration: 'none',
};

function Caption({ text, sub }: { readonly text: string; readonly sub: string }): React.ReactElement {
  return (
    <div style={{
      display: 'flex', alignItems: 'baseline', gap: 8, padding: '6px 10px',
      background: '#0a2340', color: '#fff', fontSize: 13, fontWeight: 800, whiteSpace: 'nowrap',
    }}>
      <span>{text}</span>
      <span style={{ fontSize: 11, fontWeight: 500, color: '#9fb6cc' }}>{sub}</span>
    </div>
  );
}

export default function DesignCheckPage(): React.ReactElement {
  /** ★どちらの幅を見るか（★両方・PC だけ・モバイルだけ） */
  const [mode, setMode] = useState<'both' | 'pc' | 'mobile'>('both');
  const showPc = mode !== 'mobile';
  const showMobile = mode !== 'pc';

  return (
    <div style={{
      minHeight: '100dvh', background: '#12202c', color: '#e8eef3', padding: '14px 14px 40px',
      fontFamily: "system-ui, 'Noto Sans JP', sans-serif",
    }}>
      <header style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 900 }}>デザイン確認</h1>
        <span style={{ fontSize: 12, color: '#9fb6cc' }}>
          実装 {SCREENS.length} 画面 ／ デザイナーのカード {CARDS.length} 枚（ログイン不要）
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          {([['both', 'PC＋モバイル'], ['pc', 'PC だけ'], ['mobile', 'モバイルだけ']] as const).map(([k, l]) => (
            <button
              key={k} type="button" onClick={() => { setMode(k); }}
              style={{
                minHeight: 44, padding: '0 14px', borderRadius: 8, cursor: 'pointer',
                border: '2px solid #2a3a4a', fontSize: 13, fontWeight: 800,
                background: mode === k ? '#f2b012' : '#1b2c3c', color: mode === k ? '#1b2c3c' : '#e8eef3',
              }}
            >{l}</button>
          ))}
        </div>
      </header>

      <section aria-labelledby="impl">
        <h2 id="impl" style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 900, color: '#ffd84a' }}>
          実装した画面（馬物語 UI）
        </h2>
        {SCREENS.map((s) => (
          <div key={s.path} style={{ marginBottom: 18 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
              <strong style={{ fontSize: 14 }}>{s.label}</strong>
              <a href={s.path} target="_blank" rel="noreferrer" style={openLink}>{s.path} ↗</a>
            </div>
            {/* ⚠️ ★横に並べます。★入らないときは折り返します（★この画面自身が横スクロールを出さない） */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
              {showPc && (
                <div style={{ ...shell, maxWidth: '100%' }}>
                  <Caption text="PC" sub="1280px" />
                  <iframe title={`${s.label} PC`} src={s.path} width={1280} height={FRAME_H} style={{ ...frame, maxWidth: '100%' }} loading="lazy" />
                </div>
              )}
              {showMobile && (
                <div style={{ ...shell, maxWidth: '100%' }}>
                  <Caption text="モバイル" sub="390px" />
                  <iframe title={`${s.label} モバイル`} src={s.path} width={390} height={FRAME_H} style={{ ...frame, maxWidth: '100%' }} loading="lazy" />
                </div>
              )}
            </div>
          </div>
        ))}
      </section>

      <section aria-labelledby="cards" style={{ marginTop: 26 }}>
        <h2 id="cards" style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 900, color: '#ffd84a' }}>
          デザイナーのカード（design/hud-ds）
        </h2>
        <p style={{ margin: '0 0 10px', fontSize: 12, color: '#9fb6cc' }}>
          カードごとに作られた幅で出しています。実装ではなく、デザイナーの正本そのものです。
        </p>
        {CARDS.map((c) => (
          <div key={c.slug} style={{ marginBottom: 18 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
              <span style={{
                padding: '2px 8px', borderRadius: 999, background: '#1b2c3c',
                border: '1px solid #2a3a4a', fontSize: 11, fontWeight: 800, color: '#9fb6cc',
              }}>{c.group}</span>
              <strong style={{ fontSize: 14 }}>{c.label}</strong>
              <a href={`/ds/${c.slug}/index.html`} target="_blank" rel="noreferrer" style={openLink}>
                /ds/{c.slug}/ ↗
              </a>
            </div>
            <div style={{ ...shell, maxWidth: '100%' }}>
              <Caption text="カード" sub={`${c.w}px`} />
              <iframe title={c.label} src={`/ds/${c.slug}/index.html`} width={c.w} height={FRAME_H} style={{ ...frame, maxWidth: '100%' }} loading="lazy" />
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
