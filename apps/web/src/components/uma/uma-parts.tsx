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
export function TopBar({ title, backHref, home = false, paused, onToggle }: {
  readonly title: string;
  readonly backHref?: string;
  readonly home?: boolean;
  readonly paused: boolean;
  readonly onToggle: () => void;
}): React.ReactElement {
  return (
    <div style={{
      position: 'relative', flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 10,
      padding: '12px 14px 0', width: '100%', maxWidth: 1220, margin: '0 auto',
    }}>
      {home ? (
        <div style={{ ...PLATE, display: 'flex', alignItems: 'baseline', gap: 8, padding: '7px 12px' }}>
          <span style={{ fontSize: 19, letterSpacing: '.04em' }}>馬物語</span>
          <span style={{ fontSize: 10, letterSpacing: '.16em', color: '#6b4d06' }}>HOME</span>
        </div>
      ) : (
        <a href={backHref ?? '/home'} style={{ ...PLATE, display: 'flex', alignItems: 'center', minHeight: 44, padding: '0 13px', fontSize: 13, whiteSpace: 'nowrap' }}>
          ‹ 戻る
        </a>
      )}
      <span style={{ flex: '0 0 auto', fontSize: 18, whiteSpace: 'nowrap' }}>{title}</span>
      <span style={{ marginLeft: 'auto' }}><MotionToggle paused={paused} onToggle={onToggle} /></span>
    </div>
  );
}

/**
 * ★**EP のカプセル**（★資料 §5-6）。
 * ⚠️ ★副題は ★**「ゲーム内で使う（無償でのみ受け取れます）」**（★オーナー判定 B-3）。
 * ⚠️ ★**PP と合算しません**（★憲法 §0.2）。★合計を出す口をこの部品に作りません。
 */
export function EpCapsule({ value }: { readonly value: number }): React.ReactElement {
  return (
    <div style={{
      flex: '1 1 220px', minWidth: 0, maxWidth: 430, padding: '7px 12px',
      border: '2px solid var(--u-ep)', borderRadius: 12, background: 'rgba(8,26,22,.82)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ width: 11, height: 11, borderRadius: '50%', border: '3px solid var(--u-ep)' }} />
        <span style={{ fontSize: 11, letterSpacing: '.08em', color: 'var(--u-ep-ink)' }}>参加ポイント</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 2 }}>
        <span className="u-num" style={{ fontSize: 27, color: 'var(--u-ep-num)' }}>{value.toLocaleString('ja-JP')}</span>
        <span style={{ fontSize: 11, color: 'var(--u-ep-ink)' }}>EP</span>
      </div>
      <div style={{ marginTop: 3, fontSize: 10, fontWeight: 500, color: '#a9d8cb' }}>
        ゲーム内で使う（無償でのみ受け取れます）
      </div>
    </div>
  );
}

/** ★**PP のカプセル**。★記号は菱形。★副題は「景品と交換できます」 */
export function PpCapsule({ value }: { readonly value: number }): React.ReactElement {
  return (
    <div style={{
      flex: '1 1 220px', minWidth: 0, maxWidth: 430, padding: '7px 12px',
      border: '2px solid var(--u-gold)', borderRadius: 12, background: 'rgba(30,22,4,.82)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ width: 11, height: 11, border: '3px solid var(--u-gold)', transform: 'rotate(45deg)' }} />
        <span style={{ fontSize: 11, letterSpacing: '.08em', color: '#f7e6b5' }}>賞金ポイント</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 2 }}>
        <span className="u-num" style={{ fontSize: 27, color: '#fff3cd' }}>{value.toLocaleString('ja-JP')}</span>
        <span style={{ fontSize: 11, color: '#f7e6b5' }}>PP</span>
      </div>
      <div style={{ marginTop: 3, fontSize: 10, fontWeight: 500, color: '#dcc78a' }}>景品と交換できます</div>
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
    <div style={{
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
      <a href={actionHref} style={{
        flex: '0 0 auto', minHeight: 44, display: 'flex', alignItems: 'center', padding: '0 12px',
        border: '2px solid var(--u-navy)', borderRadius: 8,
        backgroundImage: 'linear-gradient(#ffffff,#e6eef6)', color: 'var(--u-ink-dark)', fontSize: 13,
      }}>{actionLabel}</a>
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
export function BigButton({ tone, label, sub, href, onClick, grow }: {
  readonly tone: ButtonTone;
  readonly label: string;
  readonly sub?: string;
  readonly href?: string;
  readonly onClick?: () => void;
  /** ★`flex` の伸び（★主ボタンを少し大きく） */
  readonly grow?: string;
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
  return <button type="button" onClick={onClick} style={style} disabled={tone === 'disabled'}>{inner}</button>;
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
function ParallaxStrip({ src, top, height, dur, position = 'center', filter, bottom }: {
  readonly src: string;
  readonly top?: number | string;
  readonly bottom?: number | string;
  readonly height: number | string;
  /** ★1 周にかける秒数（★遠いものほど大きく） */
  readonly dur: number;
  /** ★**縦の合わせ方だけ**（`top` / `center` / `bottom`）。★横は常に左起点（上の註記） */
  readonly position?: 'top' | 'center' | 'bottom';
  readonly filter?: string;
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

export function Backdrop({ variant = 'screen' }: { readonly variant?: 'screen' | 'top' }): React.ReactElement {
  const top = variant === 'top';
  /** ★近景が始まる高さ（★TOP は内柵の下から・★画面版はもっと上から） */
  const regionTop = top ? 42 : 26;
  return (
    <div aria-hidden style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      {/*
        ★**観客席・木立（遠景）も流します**（★2026-09-17・オーナー指示
          ★「★芝を動かすなら背景の観客席も動かないといけない」）。

        ⚠️ ★ここは ★**完全に静止**していました。★地面だけが流れるので、
           ★**貼り紙の前で馬が足踏み**して見えていました。
        ★遠いものほど遅く流します（★観客席は手前の芝の 40 倍ゆっくり）。
        ★継ぎ目が出ない作りは `u-pan-a` / `u-pan-b` の註記を参照（★同じ幅の箱を 2 枚）。
      */}
      <ParallaxStrip
        src="/art/uma/world-panorama.webp"
        top={0}
        height={top ? '26%' : '20%'}
        dur={top ? 26 : 30}
        position="bottom"
        filter={top ? 'saturate(1.04) brightness(1.1) contrast(1.02)' : 'saturate(1.02) brightness(.92)'}
      />
      <div style={{
        position: 'absolute', left: 0, right: 0, top: top ? '26%' : '20%', height: top ? '7%' : '6%',
        background: "url('/art/uma/turf-far.webp') repeat center", backgroundSize: '1500px 75px',
        filter: top ? 'brightness(1.07) saturate(1.05)' : 'brightness(.9)',
        animation: `u-scroll ${top ? '2.8s' : '3.4s'} linear infinite`,
      }} />
      {top && (
        <div style={{
          position: 'absolute', left: 0, right: 0, top: '33%', height: '9%',
          background: "url('/art/uma/turf-mid.webp') repeat center", backgroundSize: '1500px 94px',
          filter: 'brightness(1.1) saturate(1.05)', animation: 'u-scroll 1.6s linear infinite',
        }} />
      )}
      {/*
        ★**近景の芝**（★2026-09-17・第 2 稿）。

        🔴 ★**前の作りは失敗でした。** ★「遠近 4 段」にして各段の明るさを 3.5% ずつ
           ★階段状にし、★段の頭に白い線まで足しました。★私は「★境目が遠近の線として
           ★読める」と書きましたが、★**読めていません。★継ぎ目にしか見えませんでした**
           （★オーナー指摘「★芝の動きも雑なまま」「★PC 表示では隙間から芝の雑が見える」）。
           ★機械の診断は 0 点になったのに、★**苦情の言葉は消えていません**でした。

        → ★**段そのものをやめます。** ★1 枚で敷き、★遠近は
          ★**上を暗く沈める縦のぼかし**だけで作ります（★線が 1 本も出ません）。
        ⚠️ ★`backgroundSize` の横は ★**`150cqw`**（★画面幅の 1.5 倍）。
           ★`u-turf` が ★**ちょうど 1 枚ぶん**流すので、★輪に戻るときの跳ねも出ません。
        ⚠️ ★縦は 1 枚を引き伸ばします。★芝の筋がやわらかく溶けますが、
           ★**等間隔の線が出るよりは良い**と判断しました（★オーナーの目で最終判断）。
      */}
      <div style={{
        position: 'absolute', left: 0, right: 0, top: `${regionTop}%`, bottom: 0,
        background: "url('/art/uma/turf-near.webp') repeat-x center",
        backgroundSize: '150cqw 100%',
        filter: top ? 'brightness(1.1) saturate(1.04)' : 'brightness(.88) saturate(1.02)',
        animation: `u-turf ${top ? '.62s' : '.7s'} linear infinite`,
      }} />
      {/* ★遠近（★奥ほど沈む）。★**境目を作らない**ので、線が出ません */}
      <div style={{
        position: 'absolute', left: 0, right: 0, top: `${regionTop}%`, bottom: 0,
        background: top
          ? 'linear-gradient(rgba(18,40,20,.34) 0%,rgba(18,40,20,.16) 22%,rgba(18,40,20,0) 52%,rgba(255,255,255,.05) 100%)'
          : 'linear-gradient(rgba(6,20,10,.42) 0%,rgba(6,20,10,.2) 24%,rgba(6,20,10,0) 56%)',
      }} />
      {/*
        ★**刈り跡**（★2026-09-17・オーナー指示「★芝をあなたが治してください」）。
        ★競馬場の芝は横切る向きに刈り跡が入ります。★真横から見ると
        ★**縦の帯が流れていく**ので、★速さの手がかりにもなります。
        ⚠️ ★**これは見た目の足し算です。** ★要らなければ ★この `<div>` を消すだけで戻せます。
      */}
      <div style={{
        position: 'absolute', left: 0, right: 0, top: `${regionTop}%`, bottom: 0,
        backgroundImage: 'repeating-linear-gradient(90deg,rgba(255,255,255,.06) 0 60px,rgba(6,26,10,.06) 60px 120px)',
        backgroundSize: '120px 100%',
        animation: `u-mow ${top ? '.62s' : '.7s'} linear infinite`,
        mixBlendMode: 'soft-light',
      }} />
      {top ? (
        <>
          <div style={{
            position: 'absolute', left: '6%', top: '2%', height: '25%', aspectRatio: '62 / 282',
            background: "url('/art/uma/finish-tower.webp') no-repeat bottom center/contain", filter: 'brightness(1.08)',
          }} />
          {/*
            ★内柵も流します（★2026-09-17）。★観客席と芝だけ動いて
            ★**中間の柵が貼り付く**と、かえって不自然に見えます。
            ★奥の芝（2.8s）とほぼ同じ速さにします。
          */}
          <ParallaxStrip src="/art/uma/inner-rail.webp" top="25.4%" height={30} dur={3} filter="brightness(1.12)" />
          <div style={{
            position: 'absolute', left: 0, right: 0, top: '42%', bottom: 0,
            background: 'linear-gradient(rgba(255,255,255,.3),rgba(255,255,255,0) 26%,rgba(12,26,14,.1) 70%,rgba(12,26,14,.28) 100%)',
          }} />
          {/*
            ★前柵は ★**いちばん手前**なので、★いちばん速く流します（★手前の芝より速い）。
            ⚠️ ★速すぎると柵の柱がちらつきます。★数字はオーナーの目で決めてください。
          */}
          <ParallaxStrip src="/art/uma/front-rail.webp" bottom={0} height={120} dur={0.55} position="top" filter="brightness(1.06) saturate(1.04)" />
        </>
      ) : (
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(rgba(10,35,64,.5) 0%,rgba(10,35,64,.28) 26%,rgba(8,20,10,.42) 62%,rgba(8,20,10,.78) 100%)',
        }} />
      )}
    </div>
  );
}

/**
 * ★**デフォルメの馬**（★TOP・ダッシュボード・調教で使う 1 枚絵）。
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
