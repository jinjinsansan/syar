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
import { COAT_TRANSFORMS, coatOfHorseId, coatCssFilter, type CoatName } from '@star/render';

/**
 * ★**毛色は、画面が使うのと同じ CSS の掛け方で出します**（★2026-09-23）。
 *
 * 🔴 ★はじめ、★**焼いた画像を 2 通りの別の方法で色替えして並べていました**
 *    （★`dress.mjs` のパレット置換＝日本語 5 色 ／ `sharp` の `modulate`＝近似）。
 *    ★オーナー指摘「色違いの馬の絵が違う気がします」。
 *    ✔ ★輪郭を比べると **1 画素も違いません**でした（★絵は同じ・色の付け方が 2 通りだった）。
 *    → ★**ここでは 1 通りだけにします。** ★`COAT_TRANSFORMS` を CSS の `filter` に組み立てて掛けます。
 *      ★近似ではなく、★**画面が実際に掛けるのと同じ式**です。
 */
const coatFilter = coatCssFilter;

/** ★毛色の呼び名（★見出しに出すだけ） */
const COAT_LABEL: Readonly<Record<CoatName, string>> = {
  bay: '鹿毛', 'dark-bay': '黒鹿毛', chestnut: '栗毛', 'liver-chestnut': '栃栗毛',
  'seal-brown': '青鹿毛', 'blue-black': '青毛', grey: '芦毛',
};

/** ★本番の馬 ID と同じ形（★出走表の見本を決定論で作る） */
const idAt = (n: number): string => `0f000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;


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
  // ★デザイナー第 2 便（★2026-09-23）。★どちらもログインが要る画面なので、
  //   ★ここでは「ログインしてください」の状態が出ます（★枠と配色の確認用）。
  { path: '/stable/roles', label: '引退後の役割（第 2 便 A）' },
  { path: '/stable/breed', label: '配合（第 2 便 B）' },
];

/**
 * ★**焼いた絵の見本**（★2026-09-23）。
 *   ★`/train` の顔は ★持ち馬が要り、★誕生カットは ★配合が終わらないと出ません。
 *   → ★**絵そのものを、表示の寸法で並べます**（★見るだけなら、ここで足ります）。
 * ⚠️ ★寸法は ★**画面と同じ**にしてあります（★96×74 と 360×270）。★ここで大きく見せない
 *    （★大きく見せると、★小さいときに読めない絵を「良い」と判断してしまう）。
 */
const ART: readonly { readonly src: string; readonly label: string; readonly w: number; readonly h: number }[] = [
  { src: '/art/uma/train-face-happy.webp', label: '調教の顔: 上機嫌', w: 96, h: 74 },
  { src: '/art/uma/train-face-normal.webp', label: '調教の顔: 平常', w: 96, h: 74 },
  { src: '/art/uma/train-face-tired.webp', label: '調教の顔: 疲れ', w: 96, h: 74 },
  { src: '/art/uma/intro-birth-cut.webp', label: '誕生カット（仔馬）', w: 360, h: 270 },
  { src: '/art/uma/train-body-idle.webp', label: '調教の全身: 待機', w: 136, h: 145 },
  { src: '/art/uma/train-body-run.webp', label: '調教の全身: 調教中', w: 136, h: 145 },
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

      {/* ★焼いた絵（★画面と同じ寸法で並べる・★2026-09-23） */}
      <section aria-labelledby="art" style={{ marginBottom: 22 }}>
        <h2 id="art" style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 900, color: '#ffd84a' }}>
          焼いた絵（表示と同じ寸法）
        </h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'flex-end' }}>
          {ART.map((a) => (
            <div key={a.src} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <img src={a.src} alt={a.label} width={a.w} height={a.h}
                style={{ width: a.w, height: a.h, objectFit: 'contain', borderRadius: 8, border: '2px solid rgba(255,216,74,.5)' }} />
              <span style={{ fontSize: 11 }}>{a.label}</span>
              <span style={{ fontSize: 10, opacity: 0.7 }}>{a.w}×{a.h}（素材はこの 2 倍）</span>
            </div>
          ))}
        </div>
      </section>

      {/* ★毛色（★同じ 1 枚の絵に、画面と同じ CSS を掛けている・★焼き直していない） */}
      <section aria-labelledby="coat" style={{ marginBottom: 22 }}>
        <h2 id="coat" style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 900, color: '#ffd84a' }}>
          毛色 7 種（同じ絵に色を掛けているだけ）
        </h2>
        <p style={{ margin: '0 0 8px', fontSize: 11, color: '#9fb6cc', lineHeight: 1.7 }}>
          絵は 1 枚（調教の待機）。輪郭は 1 画素も変えていません。色は画面が使うのと同じ式です。
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end', background: '#091e37', padding: 10, borderRadius: 10 }}>
          {(Object.keys(COAT_TRANSFORMS) as CoatName[]).map((coat) => (
            <div key={coat} style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'center' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/art/uma/train-body-idle.webp" alt={COAT_LABEL[coat]} width={96} height={102}
                style={{ width: 96, height: 102, objectFit: 'contain', filter: coatFilter(coat) }}
              />
              <span style={{ fontSize: 11 }}>{COAT_LABEL[coat]}</span>
            </div>
          ))}
        </div>

        <h2 style={{ margin: '14px 0 4px', fontSize: 15, fontWeight: 900, color: '#ffd84a' }}>
          新しい規則で 18 頭を枠順に並べた出走表
        </h2>
        <p style={{ margin: '0 0 8px', fontSize: 11, color: '#9fb6cc', lineHeight: 1.7 }}>
          毛色は馬 ID から引いています。隣どうしが同じ毛色になる組は 12 頭立てで平均 3.42 組（古い規則は 1 組）。
        </p>
        <div style={{ display: 'flex', gap: 4, overflowX: 'auto', background: '#091e37', padding: 8, borderRadius: 10 }}>
          {Array.from({ length: 18 }, (_, i) => {
            const coat = coatOfHorseId(idAt(1000 + i));
            return (
              <div key={i} style={{ flex: '0 0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/art/uma/train-body-idle.webp" alt={COAT_LABEL[coat]} width={72} height={77}
                  style={{ width: 72, height: 77, objectFit: 'contain', filter: coatFilter(coat) }}
                />
                <span style={{ fontSize: 9, color: '#9fb6cc' }}>{i + 1}枠 {COAT_LABEL[coat]}</span>
              </div>
            );
          })}
        </div>
      </section>

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
