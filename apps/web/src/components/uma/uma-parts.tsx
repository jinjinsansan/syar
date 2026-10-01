'use client';

/**
 * ★**馬物語 UI の共通部品**（★R-14・2026-09-17・引き渡し資料 §5）
 *
 * 【★なぜ部品にするか】
 *   ★資料 §5 は「★**先にこれを部品化する**」と書いています。
 *   ★上段バー・停止スイッチ・通知帯・ボタン・EP/PP カプセルは ★**全画面に出ます**。
 *   ★画面ごとに書くと、★**1 つ直したときに他が古いまま残ります**（★D-052・R-30）。
 *
 * 【★この層が守ること】
 *   ★`a-*`・`.frame` を使わない（★A-2・arcade テーマと混ぜない）
 *   ★当たり判定は **44px 以上**（★資料 §5-5）
 *   ★**EP と PP を合算しない**（★憲法 §0.2）— ★カプセルは別々の部品にしてあります
 *   ★停止スイッチは ★**全ページに常設**（★資料 §5-7・§2-9）
 */

import { useEffect, useState } from 'react';
import { coatOfHorseId } from '@star/render';
import { useCoatedImage } from './coated-image';
import { PLATE_LAYERS, screenOverlayCss } from './backdrop-plate';
import './uma-theme.css';

/** ★停止の状態。★端末が「動きを減らす」なら**初期から停止**（★資料 §5-7 の 1） */
export function useMotionPaused(): readonly [boolean, () => void] {
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (mq.matches) setPaused(true);
  }, []);
  return [paused, () => { setPaused((p) => !p); }] as const;
}

/** ★停止スイッチ（★全ページの上段バーの右端） */
export function MotionToggle({ paused, onToggle }: { readonly paused: boolean; readonly onToggle: () => void }): React.ReactElement {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={paused}
      aria-label="画面の動きを止める／再生する"
      style={{
        minHeight: 44, padding: '0 13px', border: '3px solid var(--u-gold)', borderRadius: 999,
        background: 'var(--u-panel-strong)', color: 'var(--u-ink-light)', fontSize: 14, whiteSpace: 'nowrap',
      }}
    >
      {paused ? '▷ 再生' : 'Ⅱ 停止'}
    </button>
  );
}

/** ★金プレート（★戻るボタン・ロゴに使う共通の地） */
const PLATE: React.CSSProperties = {
  border: '3px solid var(--u-navy)', borderRadius: 10,
  backgroundImage: 'var(--u-gold-plate)', backgroundSize: '240% 100%',
  animation: 'u-sheen 6s linear infinite', color: 'var(--u-ink-dark)',
};

/**
 * ★**上段バー**（★左＝戻る／中＝画面名／右＝停止スイッチ・資料 §5-3）。
 * ★`home` を真にすると、左が**金プレートのロゴ**になります（★ダッシュボード用）。
 */
export function TopBar({ title, backHref, home = false, paused, onToggle, extra, points }: {
  readonly title: string;
  readonly backHref?: string;
  readonly home?: boolean;
  readonly paused: boolean;
  readonly onToggle: () => void;
  /** ★停止スイッチの左に置く小さな入口（★2026-10-01・/vote の「履歴」）。★無ければ何も出さない */
  readonly extra?: React.ReactNode;
  /**
   * ★**PC の上の段に並べる EP / PP のカプセル**（★2026-10-01・引き渡し「PC 表示 大型ビジョン案 2a」§1-3）。
   *   ★幅 1024px 以上でだけ見える（★CSS `.u-topbar-points`）。★スマホは ★画面が いつもの段に置いたまま（★`.u-points-row`）。
   *   ⚠️ ★EP と PP は ★別々のカプセルを並べるだけ（★合計は出さない・憲法 §0.2）。★どちらを出すかは ★画面が決める（★景品交換は PP だけ・投票は EP だけ）。
   */
  readonly points?: React.ReactNode;
}): React.ReactElement {
  /* ★寸法は ★`uma-theme.css` の `.u-topbar*`（★スマホの値は旧の書き込みと同じ・★PC だけ §1-3 の値） */
  return (
    <div className="u-topbar">
      {home ? (
        <div className="u-topbar-logo" style={PLATE}>
          <span className="u-topbar-logo-name">馬物語</span>
          <span className="u-topbar-logo-sub">HOME</span>
        </div>
      ) : (
        <a href={backHref ?? '/home'} className="u-topbar-back" style={PLATE}>
          ‹ 戻る
        </a>
      )}
      {/* ★画面名は 19px ＋ うすい紺の影（★2026-09-29・デザイナー回答 R-22 §3・芝の上で 3.84〜3.93:1 → 大きい文字の扱い 3:1） */}
      <span className="u-topbar-title">{title}</span>
      {points !== undefined && <span className="u-topbar-points">{points}</span>}
      <span className="u-topbar-end">{extra}<MotionToggle paused={paused} onToggle={onToggle} /></span>
    </div>
  );
}

/**
 * ★**EP のカプセル**（★資料 §5-6）。
 * ⚠️ ★副題は ★**「ゲーム内で使う（無償でのみ受け取れます）」**（★オーナー判定 B-3）。
 * ⚠️ ★**PP と合算しません**（★憲法 §0.2）。★合計を出す口をこの部品に作りません。
 */
/*
  ★**カプセルの寸法は `uma-theme.css` の `.u-cap*`**（★2026-10-01）。★スマホの値は ★旧の書き込みと同じ（★縦 3 段）。
  ★PC の上の段（`.u-topbar-points`）では ★同じ部品を ★横長 48px に組み替える（★§1-3・★記号｜2 段の語｜数字｜単位）。
  ★色だけは ★部品ごとに ここで渡す（★EP は青緑・PP は金・★別の部品のまま）。
*/
export function EpCapsule({ value }: { readonly value: number }): React.ReactElement {
  return (
    <div className="u-cap u-cap-ep">
      <div className="u-cap-row">
        <span className="u-cap-icon" />
        <span className="u-cap-label">参加ポイント</span>
      </div>
      <div className="u-cap-row u-cap-value">
        <span className="u-num u-cap-num">{value.toLocaleString('ja-JP')}</span>
        <span className="u-cap-unit">EP</span>
      </div>
      <div className="u-cap-sub">
        ゲーム内で使う（無償でのみ受け取れます）
      </div>
    </div>
  );
}

/** ★**PP のカプセル**。★記号は菱形。★副題は「景品交換に使えます」 */
export function PpCapsule({ value }: { readonly value: number }): React.ReactElement {
  return (
    <div className="u-cap u-cap-pp">
      <div className="u-cap-row">
        <span className="u-cap-icon" />
        <span className="u-cap-label">賞金ポイント</span>
      </div>
      <div className="u-cap-row u-cap-value">
        <span className="u-num u-cap-num">{value.toLocaleString('ja-JP')}</span>
        <span className="u-cap-unit">PP</span>
      </div>
      <div className="u-cap-sub">景品交換に使えます</div>
    </div>
  );
}

export type NoticeKind = 'soon' | 'closing' | 'own' | 'multi' | 'result';

/**
 * ★**レース通知**（★資料 §7・全ページ共通）。
 *
 * ⚠️ ★**自馬が出走するときは投票の導線を出しません**（★正典 §9.5）。
 *    ★理由を**省略しません**（★「見せない」だけだと、なぜ押せないか分かりません）。
 * ⚠️ ★**中継のルートでは描きません**（★ゲージと仕掛けの合図を隠さない・C-6・V-16）。
 * ⚠️ ★音・バイブ・全画面・煽りは置きません（★L-8）。
 */
/**
 * ★**通知帯・パネルの中の操作子**（★`NoticeBar` の右端のボタンと同じ見た目・1 か所）。
 *   ★2026-09-28: ★誤りの帯の「再読み込み」が ★ブラウザの素の白いボタンのままだったので ★これを当てます（★レビュー側の指摘・新しい意匠ではない）。
 */
export const NOTICE_ACTION: React.CSSProperties = {
  flex: '0 0 auto', minHeight: 44, display: 'inline-flex', alignItems: 'center', padding: '0 12px',
  border: '2px solid var(--u-navy)', borderRadius: 8, cursor: 'pointer',
  backgroundImage: 'linear-gradient(#ffffff,#e6eef6)', color: 'var(--u-ink-dark)', fontSize: 13, fontWeight: 800,
};

/**
 * ★**文字を載せる濃紺のパネル**（★2026-09-28・デザイナー R-18 回答 🟡 #7「★本文は必ず濃紺パネルか紙パネルの上」）。
 *   ★箱の値は ★`NoticeBar` と同じ（★幅・余白・金の縁 2px・角丸 12・`--u-panel-strong`）。★新しい意匠ではありません。
 *   ★芝の上に ★じかに置いていた案内・誤りの文を ★これに入れます（★道具 `audit-text-on-backdrop.mjs` が洗い出した所）。
 */
export function TextPanel({ children, role, style }: {
  readonly children: React.ReactNode;
  readonly role?: 'status' | 'alert';
  readonly style?: React.CSSProperties;
}): React.ReactElement {
  return (
    <div role={role} style={{
      position: 'relative', width: 'calc(100% - 28px)', maxWidth: 880, margin: '10px auto 0', padding: '8px 12px',
      border: '2px solid var(--u-gold)', borderRadius: 12, background: 'var(--u-panel-strong)', ...style,
    }}>{children}</div>
  );
}

export function NoticeBar({ kind, text, sub, actionLabel, actionHref, extra }: {
  readonly kind: NoticeKind;
  readonly text: string;
  readonly sub?: string;
  readonly actionLabel: string;
  readonly actionHref: string;
  /** ★「他 n 件」札（★重なったときだけ・★積み上げない） */
  readonly extra?: number;
}): React.ReactElement {
  const border = kind === 'closing' ? 'var(--u-orange)' : kind === 'result' ? 'var(--u-ep)' : 'var(--u-gold)';
  const dot = kind === 'closing' ? 'var(--u-orange)' : kind === 'own' || kind === 'result' ? 'var(--u-ep)' : 'var(--u-red)';
  return (
    /*
      ★`position: relative; z-index: 1`（★2026-09-29）: ★芝（`Backdrop`・position:absolute）より ★上に描く。
      ★無いと ★位置を持たない帯は ★芝の下に描かれ、★赤い点しか見えなかった（★本番 /signup・/home の古い版の知らせで実測）。
      ★帯（`.u-race-strip`）と同じ段。
    */
    <div style={{
      position: 'relative', zIndex: 1,
      display: 'flex', alignItems: 'center', gap: 8, width: 'calc(100% - 28px)', maxWidth: 880,
      margin: '10px auto 0', padding: '6px 10px', border: `2px solid ${border}`, borderRadius: 12,
      background: 'var(--u-panel-strong)', animation: 'u-notice .35s ease-out',
    }}>
      <span style={{ flex: '0 0 auto', width: 9, height: 9, borderRadius: '50%', background: dot, animation: 'u-led 2s ease-in-out infinite' }} />
      <span style={{ minWidth: 0, flex: '1 1 auto' }}>
        <span style={{ display: 'block', fontSize: 12, lineHeight: 1.35 }}>{text}</span>
        {sub !== undefined && (
          <span style={{ display: 'block', fontSize: 11, fontWeight: 500, lineHeight: 1.35, color: 'var(--u-ink-light-3)' }}>{sub}</span>
        )}
      </span>
      {extra !== undefined && extra > 0 && (
        <span style={{
          flex: '0 0 auto', padding: '2px 7px', borderRadius: 999, fontSize: 10,
          background: 'rgba(246,194,28,.18)', border: '1px solid rgba(246,194,28,.6)',
        }}>他 {extra} 件</span>
      )}
      <a href={actionHref} style={NOTICE_ACTION}>{actionLabel}</a>
    </div>
  );
}

export type ButtonTone = 'gold' | 'blue' | 'green' | 'ivory' | 'disabled';

const TONE: Readonly<Record<ButtonTone, React.CSSProperties>> = {
  gold: {
    border: '5px solid var(--u-navy)',
    backgroundImage: 'linear-gradient(#ffe483 0%,#f6c21c 46%,#d98f0a 100%)',
    boxShadow: '0 7px 0 #0a2340, 0 12px 20px rgba(8,18,8,.4), inset 0 3px 0 rgba(255,255,255,.65)',
    color: 'var(--u-ink-dark)',
  },
  blue: {
    border: '5px solid var(--u-navy)',
    backgroundImage: 'linear-gradient(#5fa9ee 0%,#1a6fd4 46%,#0f56ab 100%)',
    boxShadow: '0 7px 0 #0a2340, 0 12px 20px rgba(8,18,8,.4), inset 0 3px 0 rgba(255,255,255,.5)',
    color: '#fff',
  },
  green: {
    border: '5px solid #15612d',
    backgroundImage: 'linear-gradient(#54bb74 0%,#2f9e4f 46%,#1b6f34 100%)',
    boxShadow: '0 7px 0 #103f20, 0 12px 20px rgba(8,18,8,.4), inset 0 3px 0 rgba(255,255,255,.5)',
    color: '#fff',
  },
  ivory: {
    border: '4px solid var(--u-navy)',
    backgroundImage: 'linear-gradient(#ffffff,#e6eef6)',
    boxShadow: '0 6px 0 rgba(10,35,64,.85), 0 10px 16px rgba(8,18,8,.34)',
    color: 'var(--u-ink-dark)',
  },
  disabled: {
    border: '4px solid #4a6178',
    backgroundImage: 'linear-gradient(#9fb0bd,#7d8f9c)',
    boxShadow: 'none',
    color: '#e8edf1',
    pointerEvents: 'none',
  },
};

/**
 * ★**大きなボタン**（★資料 §5-5）。★当たりは **88px**。
 * ★`href` があれば `<a>`、無ければ `<button>`。★無効は `disabled` の色で、★押せません。
 */
export function BigButton({ tone, label, sub, href, onClick, grow, autoFocus = false }: {
  readonly tone: ButtonTone;
  readonly label: string;
  readonly sub?: string;
  readonly href?: string;
  readonly onClick?: () => void;
  /** ★`flex` の伸び（★主ボタンを少し大きく） */
  readonly grow?: string;
  /** ★開いたら焦点を置く（★確認のシートの［戻る］・誤って確定しないため・R-22 §4） */
  readonly autoFocus?: boolean;
}): React.ReactElement {
  const style: React.CSSProperties = {
    ...TONE[tone],
    flex: grow ?? '1 1 220px', minHeight: 88, borderRadius: 14,
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3,
    textAlign: 'center', padding: '0 12px',
  };
  const inner = (
    <>
      <span style={{ fontSize: tone === 'ivory' ? 17 : 22 }}>{label}</span>
      {sub !== undefined && <span style={{ fontSize: 11, fontWeight: 700, opacity: 0.85 }}>{sub}</span>}
    </>
  );
  if (href !== undefined && tone !== 'disabled') return <a href={href} style={style}>{inner}</a>;
  return <button type="button" onClick={onClick} style={style} disabled={tone === 'disabled'} autoFocus={autoFocus}>{inner}</button>;
}

/**
 * ★**背景**（★資料 §5-2・レース演出と同一素材）。
 * ⚠️ ★芝の送りは ★**必ず横方向**（★馬は右へ進むので、縦送りは進行方向と矛盾します）。
 */
/**
 * ★**遠景を継ぎ目なく流す帯**（★2026-09-17・オーナー指示
 *   ★「★芝を動かすなら背景の観客席も動かないといけない」）
 *
 * 【★なぜ箱を 2 つ並べるのか】
 *   ★観客席や柵は ★**縦横の比を保って**出しています（`background-size: auto 100%`）。
 *   ★そのため ★**1 枚の幅が画面幅と一致せず**、★`background-position` を動かす作りでは
 *   ★輪に戻るときに ★**必ず跳ねます**（★ちょうど 1 枚ぶんを指定できないため）。
 *   → ★同じ幅の箱を 2 つ並べ、★片方を 0 → −100%、★もう片方を +100% → 0 へ。
 *     ★終わりの瞬間、★2 枚は ★**まったく同じ絵**なので、★輪に戻っても見えません。
 *
 * ⚠️ ★`.u-paused` が掛かると `animation: none` で止まります（★停止スイッチ）。
 *    ★そのとき 2 枚目は画面の右外（+100%）で止まるので、★**絵は欠けません**。
 */
function ParallaxStrip({ src, top, height, dur, position = 'center', filter, bottom, fadeBottom }: {
  readonly src: string;
  readonly top?: number | string;
  readonly bottom?: number | string;
  readonly height: number | string;
  /** ★1 周にかける秒数（★遠いものほど大きく） */
  readonly dur: number;
  /** ★**縦の合わせ方だけ**（`top` / `center` / `bottom`）。★横は常に左起点（上の註記） */
  readonly position?: 'top' | 'center' | 'bottom';
  readonly filter?: string;
  /**
   * ★**下端へ向かって消すぼかし**（★`mask-image` の値）。
   *
   * ⚠️ ★2026-09-17: ★モバイルで ★**芝に横の境目が 1 本**残っていました（★オーナー指摘）。
   *    ★測ると `turf-mid` の下端 **y=307** で `turf-near` に切り替わっており、
   *    ★`turf-mid` は ★**層全体が一様に 0.76s**、★`turf-near` は ★**縦のぼかしで上ほど遅い**。
   *    → ★**明るさではなく「速さの段差」**が線に見えていました。
   * → ★奥の層の下端を消して、★手前の層と ★**速さが連続して見える**ようにします。
   */
  readonly fadeBottom?: string;
}): React.ReactElement {
  /**
   * 🔴 ★**1 つの箱に、絵をちょうど 1 枚**敷きます（★2026-09-17・第 3 稿）。
   *
   * 【★ここで 2 回間違えました。★どちらも撮って見つけました】
   *   ★① ★最初 `background-position: center` ＋ `auto 100%` で敷き、
   *      ★註記に「★2 枚はまったく同じ絵になる」と書きました。★**嘘でした。**
   *      ★撮った画に ★**縦の継ぎ目が 2 本**出ました。
   *   ★② ★起点を `left` に直しました。★継ぎ目は 2 本 → 1 本に減っただけで、★**消えませんでした。**
   *      ★測ると、★`world-panorama` は帯の高さ 187px のとき ★**1 枚 681px**、
   *      ★箱は 1280px で ★**1.880 枚**。★整数倍でないので、
   *      ★箱 A の右端は ★**絵の途中（0.88 枚目）で切れ**、★箱 B は ★**絵の頭から**始まります。
   *      → ★**起点をどこにしても、箱の幅が絵の整数倍でなければ必ず継ぎ目が出ます。**
   *
   * → ★**絵の幅を箱に合わせます**（`background-size: 100% 100%` ＝ 1 箱に 1 枚ちょうど）。
   *   ★これなら箱 A の右端と箱 B の左端が ★**必ず**繋がります（★元絵の左右端はほぼ同じ色
   *   ★— 実測で平均差 5/256 — なので、★1 枚の中の継ぎ目も出ません）。
   *
   * ⚠️ ★**縦横の比は崩れます**（★画面の幅と高さで見え方が変わります）。
   *    ★継ぎ目が出るよりは良いと判断しましたが、★**最終判断はオーナーの目**です。
   */
  const layer: React.CSSProperties = {
    position: 'absolute', top: 0, bottom: 0, left: 0, width: '100%',
    background: `url('${src}') no-repeat left ${position}`,
    backgroundSize: '100% 100%',
    ...(fadeBottom === undefined ? {} : { maskImage: fadeBottom, WebkitMaskImage: fadeBottom }),
  };
  return (
    <div style={{
      position: 'absolute', left: 0, right: 0,
      ...(top === undefined ? {} : { top }),
      ...(bottom === undefined ? {} : { bottom }),
      height, overflow: 'hidden', ...(filter === undefined ? {} : { filter }),
    }}>
      <span style={{ ...layer, animation: `u-pan-a ${dur}s linear infinite` }} />
      <span style={{ ...layer, animation: `u-pan-b ${dur}s linear infinite` }} />
    </div>
  );
}

/** ★板の割合と暗幕の段は ★`backdrop-plate.ts`（★1 か所・道具と分け合う） */

/**
 * ★**TOP 以外の画面で、芝をゆっくりにする倍率**（★2026-09-17・オーナー指示
 *   ★「★今は早すぎて、サイトを見るユーザーの目が疲れてしまいます」）。
 *
 * ★TOP は ★**一瞬見る看板**なので速さが要ります。★他の 9 画面は ★**読む・選ぶ画面**で、
 * ★同じ速さだと目が休まりません。★「★動いているのがわかればいい」が求められた速さです。
 * ⚠️ ★**全層に同じ倍率**を掛けます。★層ごとの比（★中継の公式から出した遠近）は崩しません。
 */
const SCREEN_SLOWDOWN = 5;

export function Backdrop({ variant = 'screen' }: { readonly variant?: 'screen' | 'top' }): React.ReactElement {
  const top = variant === 'top';
  /*
    ⚠️ ★`regionTop`（近景が始まる高さ）は ★**もう要りません**（★2026-09-17・第 3 稿）。
       ★層の縦位置は ★`PLATE_LAYERS`（★中継の板の割合）が持っています。
  */
  return (
    <div aria-hidden style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      {/*
        ★**遠景を中継と同じ 3 層に分けます**（★2026-09-17・第 2 稿・オーナー指摘
          ★「★既にレース演出で使っている素材がありますよね？」）。

        🔴 ★第 1 稿は `world-panorama.webp` の ★**1 枚**を流していました。
           ★木立も観客席も生垣も ★**同じ速さ**なので、★遠近が付きません。
        → ★中継（`/art/parallax/backstretch-side-v1/manifest.json`）は
          ★`trees` / `stand` / `hedge` の ★**3 層**に分け、★層ごとに `depthOffsetM` を
          ★持っています。★`uma/` にも ★**同じ 3 枚が既に在りました**（★使っていなかっただけ）。

        ⚠️ ★秒数は ★**当てずっぽうをやめ**、★中継の公式から出しました
           （`parallax-plate.ts:14`: `pxPerM = packPxPerM × packDepthM / (packDepthM + depthOffsetM)`）。
           ★注視点の深さを代表値 30m とし、★`turf-near` を 1 とした比で割っています。
      */}
      {/*
        🔴 ★**中継の板の割合をそのまま使います**（★2026-09-17・第 3 稿・オーナー指摘
          ★「★おそらくデザイナーのハンドオフ通りの芝にしており、
          ★**レース演出そのものの芝にしていないから**です」）。

        ★ご指摘のとおりでした。★中継は `manifest.json` の板（**941px**）に
        ★層ごとの高さが決まっており、★`turf-near` は ★**板の 9.6% しかありません**。
        ★私はそれを ★**画面の 64% に 5 倍以上へ引き伸ばして**いました。
        ★引き伸ばした芝はぼやけて白っぽくなり、★「★手前が半透明」に見えていました。
        ⚠️ ★土台を敷いても直らなかったのは、★**透けていたのではなく、ぼけていた**からです。

        → ★板の割合（trees 20% / stand 16.4% / hedge 6% / back-rails 6.4% /
          ★inner-rail 4.8% / turf-far 8% / turf-mid 10% / turf-near 9.6% / front-rail 19%）を
          ★そのまま使い、★素材も ★**中継と同じ `/art/parallax/backstretch-side-v1/`** から読みます。
        ⚠️ ★`back-rails` は ★**これまで使っていませんでした**（★`uma/` に写していなかった）。
        ★秒数はすべて中継の公式から（★`depthOffsetM`）。
      */}
      {/*
        ★**TOP 以外は、ずっとゆっくり流します**（★2026-09-17・オーナー指示
          ★「★ダッシュボード・使い方・ポイントを稼ぐ・中継の入口・オッズ・投票・育成・
          ★わたしの馬・交換 の芝の動きをもっとゆっくりに。★動いているのがわかればいいです。
          ★**今は早すぎて、サイトを見るユーザーの目が疲れてしまいます**」）。

        ★TOP は ★**一瞬見る看板**なので速さが要りますが、★他の 9 画面は
        ★**読む・選ぶ画面**です。★同じ速さだと目が休まりません。
        ⚠️ ★**層ごとの比は崩しません**（★中継の公式から出した遠近）。
           ★全部に同じ倍率を掛けるので、★遠近の関係はそのままです。
        ★手前の芝は 0.62 秒 → ★**3.1 秒**で 1 周。★木立は 5.35 秒 → ★**27 秒**。
      */}
      {PLATE_LAYERS.map((L) => (
        <ParallaxStrip
          key={L.src}
          src={`/art/parallax/backstretch-side-v1/${L.src}.webp`}
          top={`${L.y}%`}
          height={`${L.h}%`}
          dur={L.dur * (top ? 1 : SCREEN_SLOWDOWN)}
          position="bottom"
          filter={top ? 'saturate(1.04) brightness(1.06)' : 'saturate(1.02) brightness(.9)'}
        />
      ))}
      {/*
        🔴 ★**ここに在った層を全部消しました**（★2026-09-17・第 3 稿）。

        ★`PLATE_LAYERS` の 9 層を足したのに、★古い作りを ★**そのまま残して**いました:
          ★`turf-far`/`turf-mid` の個別の呼び出し／★土台 1 枚／★ぼかしを掛けた 3 枚／
          ★遠近の沈み 2 枚／★刈り跡／★`inner-rail`／★`front-rail`。
        ★同じ芝が ★**三重四重に重なる**ところでした（★二重帳簿・D-052）。
        → ★**板の 9 層だけ**にします。★遠近も速さも、★中継がすでに決めています。

        ⚠️ ★刈り跡（`u-mow`）も外しました。★板の芝には ★**もともと刈り跡が描かれて**おり、
           ★上から足すと ★**二重**になります。
      */}
      {top ? null : (
        /*
          ★画面版は文字を載せるので、★背景を沈めます（★TOP は沈めない）。
          ★下半分は ★2026-09-28 に濃くしました（★.42 → .55・★.78 → .86・★デザイナー R-18 回答 🟡 #7）:
          ★芝の上で 本文 12px の明度差が 4.5:1 に届かないことがある、ため。★値はデザイナーの指定どおり。
        */
        <div className="u-backdrop-dim" style={{
          position: 'absolute', inset: 0,
          background: screenOverlayCss(),
        }} />
      )}
    </div>
  );
}

/**
 * ★**自分の馬の姿**（★2026-09-28・オーナー「自分の馬は 仔馬の誕生から育成からレース発走まで一環として同じ馬に」・
 *   レビュー側の裁定「騎手なしの立ち姿でよい・先に直す」）。
 *   ★`/train`・`/home`・`/mypage` が ★**この 1 つ**を使う（★写さない・D-052）。
 *   ★毛色は ★`coatOfHorseId(馬の ID)`（`@star/render`・★唯一の出どころ・★レースの走りと同じ）。★同じ馬は どの画面でも同じ毛色。
 *   ★立ち姿 `horse-stand.webp`・★`running` の間は 歩きの 8 コマ `horse-walk-sheet.webp`（★`u-walk` と対）。
 *   ⚠️ ★見本の `chibi-horse.png` を ★持ち馬の欄に使わないこと（★見本を自分の馬として見せる ＝ P0-B と同じ族・★網 `own-horse-figure.test.ts`）。
 */
export function OwnHorseFigure({ horseId, running, onClick, style, className }: {
  readonly horseId: string;
  readonly running: boolean;
  readonly onClick?: () => void;
  /** ★置く場所の余白などだけ（★絵と毛色は変えない） */
  readonly style?: React.CSSProperties;
  /** ★置く場所の大きさを ★CSS の幅の段で変えるとき（★2026-10-01・/home の PC の舞台）。★絵と毛色は変えない */
  readonly className?: string;
}): React.ReactElement {
  /**
   * ★毛色は ★馬体の画素だけに焼く（★2026-10-01・`coated-image.ts`）。
   *   🔴 ★旧: ★CSS の filter を絵全体に掛け、★目・輪郭・白斑まで暗くなって ★黒い膜を被せたように見えた（オーナー指摘）。
   */
  const coat = coatOfHorseId(horseId);
  const walkUrl = useCoatedImage('/art/uma/horse-walk-sheet.webp', coat);
  const standUrl = useCoatedImage('/art/uma/horse-stand.webp', coat);
  const sheet = running ? walkUrl : standUrl;
  return (
    <div
      className={className}
      onClick={onClick}
      style={{
        position: 'relative', width: 'min(330px, 88%)', aspectRatio: '544 / 312',
        cursor: onClick === undefined ? undefined : 'pointer',
        /**
         * ⚠️ ★歩いている間は ★CSS で跳ねさせません（★Codex の助言・
         *    「★一定周期の CSS の上下動は玩具や UI アイコンに見える」）。★脚は絵の側（8 コマ）が動かします。
         */
        animation: running ? undefined : 'u-idle 3.4s ease-in-out infinite',
        ...style,
      }}
    >
      <span style={{
        position: 'absolute', inset: 0,
        /**
         * ⚠️ ★`800% 100%` は `@keyframes u-walk`（0%→100%）と ★**対**です。★片方だけ変えるとコマが半分ずれます。
         */
        background: sheet === null ? undefined : running
          ? `url('${sheet}') no-repeat 0 0 / 800% 100%`
          : `url('${sheet}') no-repeat center/contain`,
        /**
         * 🔴 ★**`jump-none` を落とさないこと**（★2026-09-24・実ブラウザで実測）。
         *   ★既定の `steps(8)` は 0/8, 1/8 … 7/8 の位置で止まり、★8 コマ中 7 コマで 2 コマが半分ずつ映ります。
         */
        /**
         * ★1 周 1.6 秒（★2026-09-30・オーナー「タップダンスみたいな足の動き」）。
         *   ★旧 0.8 秒 ＝ 1 秒に 10 コマ。★その場で歩く大きな絵では ★脚だけが せわしなく入れ替わって見えた。
         */
        animation: running ? 'u-walk 1.6s steps(8, jump-none) infinite' : undefined,
        // ★毛色は絵に焼いてあるので ★ここは影だけ
        filter: 'drop-shadow(0 8px 12px rgba(8,18,8,.45))',
      }} />
    </div>
  );
}

/**
 * ★**デフォルメの馬**（★TOP の看板で使う 1 枚絵・★見本）。
 * ⚠️ ★**持ち馬の欄には使いません**（★2026-09-28 から ★`OwnHorseFigure`）。★TOP の看板は別扱い（★簿 LOOK-CHIBI-VS-SIDE-V8）。
 * ⚠️ ★**中継の真横スプライトとは役割が別**です（★資料 §4.4「混ぜないこと」）。
 * ★`running` が真なら跳ねと砂煙、偽なら静かな待機。
 */
export function ChibiHorse({ running, onClick, width, height }: {
  readonly running: boolean;
  readonly onClick?: () => void;
  readonly width?: number | string;
  readonly height?: number | string;
}): React.ReactElement {
  return (
    <div
      onClick={onClick}
      style={{
        position: 'relative', flex: '0 0 auto',
        width: width ?? 272, height: height ?? 280,
        cursor: onClick === undefined ? undefined : 'pointer',
        transformOrigin: 'bottom center',
        animation: running ? 'u-rush .95s ease-in-out infinite' : 'u-idle 3.4s ease-in-out infinite',
      }}
    >
      <span style={{ position: 'absolute', left: '10%', right: '10%', bottom: 8, height: 22, borderRadius: '50%', background: 'rgba(8,18,8,.5)', filter: 'blur(6px)' }} />
      {running && (
        <>
          <span style={{ position: 'absolute', left: '-10%', bottom: 6, width: 56, height: 42, borderRadius: '50%', background: 'rgba(228,226,208,.42)', filter: 'blur(7px)', animation: 'u-dust .95s linear infinite' }} />
          <span style={{ position: 'absolute', left: '6%', bottom: 0, width: 38, height: 30, borderRadius: '50%', background: 'rgba(228,226,208,.3)', filter: 'blur(6px)', animation: 'u-dust .95s linear -.32s infinite' }} />
          <span style={{ position: 'absolute', left: '14%', bottom: '3%', width: 11, height: 8, borderRadius: 3, background: '#2c4522', animation: 'u-clod .95s linear -.1s infinite' }} />
        </>
      )}
      <span style={{
        position: 'absolute', inset: 0,
        background: "url('/art/uma/chibi-horse.png') no-repeat bottom center/contain",
        filter: 'drop-shadow(0 8px 12px rgba(8,18,8,.45))',
      }} />
    </div>
  );
}
