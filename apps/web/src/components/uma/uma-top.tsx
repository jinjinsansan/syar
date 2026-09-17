'use client';

/**
 * ★**TOP（`/`）— 確定案 3b**（★R-14・2026-09-17・引き渡し資料 §8-1・`TopE3.dc.html`）
 *
 * 【★オーナー判定】
 *   ★題字は ★**金プレート＋濃紺の文字**（★`TopE2` の斜め帯・黄文字は**却下**）。
 *   ★**スクロールなしの一枚絵**。★ボタンは ★**はじめる / ログイン の 2 つだけ**。
 *
 * 【★TOP から外した導線】（★オーナー指定）
 *   ⚠️ ★`/race`・`/lp-arcade`・`#story` は ★**TOP から外します**。
 *      ★レビュー側の CH-3 は「導線 5 本を消さない」でしたが、★**オーナー判定が後に出ています**
 *      （★資料 §3 の「ボタンは 2 つだけ」）。→ ★**判定を優先**し、★この差分を報告に書きます。
 *
 * ⚠️ ★`a-*`・`.frame` を使いません（★A-2）。★最上位に `data-theme="uma"` を付けます。
 */

import { Backdrop, MotionToggle, useMotionPaused } from './uma-parts';

export default function UmaTop(): React.ReactElement {
  const [paused, toggle] = useMotionPaused();
  return (
    <div
      data-theme="uma"
      className={paused ? 'u-paused' : undefined}
      style={{
        position: 'relative', width: '100%', minHeight: '100dvh', overflow: 'hidden',
        containerType: 'inline-size', background: '#eaf6ff', color: 'var(--u-ink-dark)',
      }}
    >
      <Backdrop variant="top" />

      {/* ★速度線（★停止しても 0% から不透明＝消えない・資料 §5-7 の 4） */}
      <div aria-hidden>
        {[
          { top: '47%', width: '54%', height: 10, alpha: 0.8, dur: '.8s', delay: '0s' },
          { top: '58%', width: '66%', height: 13, alpha: 0.62, dur: '.66s', delay: '-.2s' },
          { top: '70%', width: '46%', height: 10, alpha: 0.45, dur: '.95s', delay: '-.5s' },
        ].map((s) => (
          <span key={s.top} style={{
            position: 'absolute', right: 0, top: s.top, width: s.width, height: s.height,
            borderRadius: s.height / 2,
            background: `linear-gradient(90deg,rgba(255,255,255,0),rgba(255,255,255,${s.alpha}) 55%,rgba(255,255,255,0))`,
            animation: `u-streak ${s.dur} linear ${s.delay} infinite`,
          }} />
        ))}
      </div>

      {/* ★題字（金プレート）＋副題の丸札 */}
      <div style={{
        position: 'absolute', left: 0, right: 0, top: '10%',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '0 14px',
      }}>
        <div style={{
          position: 'relative', border: '6px solid var(--u-navy)', borderRadius: 22,
          boxShadow: '0 8px 0 #12200f, 0 18px 30px rgba(8,18,8,.5)',
          backgroundImage: 'var(--u-gold-plate)', backgroundSize: '240% 100%',
          animation: 'u-sheen 5s linear infinite', padding: '12px 28px 16px',
        }}>
          <h1 style={{
            /**
             * ⚠️ ★`lineHeight` は **1.02 → 1.18**（★2026-09-17）。
             *    ★1.02 だと箱が 128.5px なのに ★**日本語の字面は 148px** で、
             *    ★実ブラウザの診断が「★中身が箱より高い（+19px）」と拾いました。
             *    ★欧文の行送りのつもりで詰めると、★和文は字面がはみ出します。
             */
            margin: 0, fontSize: 'clamp(58px,20cqw,126px)', lineHeight: 1.18, letterSpacing: '.03em',
            whiteSpace: 'nowrap', color: 'var(--u-ink-dark)', textShadow: '0 3px 0 rgba(255,255,255,.6)',
          }}>馬物語</h1>
        </div>
        <div style={{
          padding: '8px 16px', background: 'var(--u-navy)', border: '4px solid var(--u-gold)',
          borderRadius: 999, fontSize: 'clamp(11px,2.9cqw,16px)', letterSpacing: '.12em',
          whiteSpace: 'nowrap', color: 'var(--u-ink-light)',
        }}>そだてる ・ とうひょう ・ かけぬける</div>
      </div>

      {/*
        ★**馬（デフォルメ・真横）**（★2026-09-17・第 2 稿）

        【★経緯】
          ★① 元は `chibi-horse.png`（900×929・★**斜め前向き**・脚のコマ 1 枚）でした。
             ★背景の芝は真横に流れるので、★「その場で足踏みする正面の馬」に見えていました。
          ★② そこで `horse-gallop.webp`（220×140 の 6 コマ）に替え、★脚は動くようになりました。
          🔴 ★③ ★**オーナー指摘「★馬が違います」**（★2026-09-17）。★②は ★**写実のスプライト**で、
             ★合格をいただいたダッシュボードの ★**デフォルメのキャラクターとは別系統**でした。
             ★しかも 1 コマ 220×140 を 2 倍に拡大していたので、★輪郭も甘くなっていました。

        → ★`chibi-side.webp`（**1431×767**）に差し替えました。★デフォルメ・真横・右向きで、
          ★ダッシュボードと ★**同じ絵柄**です。★背景の流れ・速度線・砂煙（どれも左へ）とも揃います。

        ⚠️ ★**脚は動きません。** ★元絵 `horse-jockey-chibi-gallop-frame01.png` の生成指示に
           ★「★**8 コマの gallop の frame 01（アンカー）**」とあり、★**残り 7 コマが未作成**です。
           ★揃ったら `steps(8)` のコマ送りに戻します（★オーナー判断 ⓐ→ⓒ・依頼 R-15 §4）。
        ⚠️ ★緑背景は `tools/remove-chroma-key.mjs` で抜き、
           ★`tools/verify-chroma-residue.mjs` で ★**輪郭から離れた緑 0px（合格）**を確かめました。
      */}
      <div aria-hidden style={{
        position: 'absolute', right: '2%', bottom: '25%',
        width: 'clamp(250px,40cqw,520px)', aspectRatio: '1431 / 767',
        transformOrigin: 'bottom center',
        /** ★1 枚絵なので、★ごく軽い上下だけ付けます（★脚は動きません・下の註記） */
        animation: 'u-idle 2.6s ease-in-out infinite',
      }}>
        <span style={{ position: 'absolute', left: '14%', right: '14%', bottom: -10, height: 22, borderRadius: '50%', background: 'rgba(14,26,12,.5)', filter: 'blur(6px)' }} />
        {/* ★砂煙と土くれは ★**後ろ（左）へ**飛びます（★真横・右向きに合わせる） */}
        <span style={{ position: 'absolute', left: '-6%', bottom: '2%', width: '16%', aspectRatio: '1', borderRadius: '50%', background: 'rgba(228,226,208,.5)', filter: 'blur(8px)', animation: 'u-dust .62s linear infinite' }} />
        <span style={{ position: 'absolute', left: '6%', bottom: 0, width: '11%', aspectRatio: '1', borderRadius: '50%', background: 'rgba(228,226,208,.38)', filter: 'blur(7px)', animation: 'u-dust .62s linear -.2s infinite' }} />
        <span style={{ position: 'absolute', left: '18%', bottom: '1%', width: '8%', aspectRatio: '1', borderRadius: '50%', background: 'rgba(228,226,208,.28)', filter: 'blur(6px)', animation: 'u-dust .62s linear -.42s infinite' }} />
        <span style={{ position: 'absolute', left: '12%', bottom: '4%', width: 11, height: 8, borderRadius: 3, background: '#2c4522', animation: 'u-clod .62s linear -.08s infinite' }} />
        <span style={{ position: 'absolute', left: '22%', bottom: '2%', width: 8, height: 7, borderRadius: 3, background: '#37541f', animation: 'u-clod .62s linear -.36s infinite' }} />
        <span style={{
          position: 'absolute', inset: 0,
          background: "url('/art/uma/chibi-side.webp') no-repeat bottom center/contain",
          filter: 'drop-shadow(0 10px 14px rgba(10,20,8,.38))',
        }} />
      </div>

      {/* ★下端のボタン 2 つ（★44px 以上・下端 34px の安全領域） */}
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 0, padding: '16px 16px var(--u-safe-bottom)',
        background: 'linear-gradient(rgba(8,20,10,0) 0%,rgba(8,20,10,.44) 42%,rgba(8,20,10,.66) 100%)',
      }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'center', width: '100%', maxWidth: 900, margin: '0 auto' }}>
          <a href="/signup" style={{
            flex: '1.3 1 260px', maxWidth: 470, minHeight: 92, display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '6px solid var(--u-navy)', borderRadius: 10,
            backgroundImage: 'linear-gradient(#58c079 0%,#2f9e4f 46%,#1b6f34 100%)',
            boxShadow: '0 10px 0 #0a2340, 0 16px 24px rgba(8,18,8,.42), inset 0 4px 0 rgba(255,255,255,.6)',
            color: '#fff', fontSize: 'clamp(30px,7.6cqw,40px)', textShadow: '0 3px 0 rgba(0,0,0,.32)',
          }}>はじめる</a>
          <a href="/login" style={{
            flex: '1 1 220px', maxWidth: 380, minHeight: 92, display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '6px solid var(--u-navy)', borderRadius: 10,
            backgroundImage: 'linear-gradient(#ffffff 0%,#e6eef6 100%)',
            boxShadow: '0 10px 0 rgba(10,35,64,.9), 0 16px 24px rgba(8,18,8,.42), inset 0 4px 0 #fff',
            color: 'var(--u-ink-dark)', fontSize: 'clamp(27px,6.6cqw,36px)',
          }}>ログイン</a>
        </div>
        <div style={{ marginTop: 12, textAlign: 'center', fontSize: 'clamp(12px,3cqw,15px)', color: 'var(--u-ink-light)' }}>
          登録は無料です
        </div>
      </div>

      {/* ★停止スイッチ（★全ページ常設・資料 §2-9） */}
      <div style={{ position: 'absolute', right: 14, top: 14 }}>
        <MotionToggle paused={paused} onToggle={toggle} />
      </div>
    </div>
  );
}
