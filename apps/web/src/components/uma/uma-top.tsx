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

/**
 * ★**1 完歩にかける秒数**（★8 コマで 1 周）。
 * ⚠️ ★中継は ★**走った距離**からコマを決めます（`raceGaitPhase(travelM, gate, strideM) * 8`・
 *    ★時間ではなく距離＝決定論のため）。★TOP は世界を持たないので ★**秒で回します**。
 *    ★見た目の速さはオーナーの目で決めてください。
 */
const GALLOP_SEC = 0.62;

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

      {/*
        🔴 ★**速度線は消しました**（★2026-09-17・オーナー指摘
          ★「★手前の芝がなぜか半透明の何かがある」）。

        ★芝の段の境目を消して地面が落ち着いたぶん、★白い横帯だけが残り、
        ★**何なのか分からないもの**として見えていました。★速さの手がかりは
        ★背景 3 層と馬の 8 コマが担うので、★この線は要りません。
      */}

      {/*
        ★**題字＝札なし・白抜き文字＋耳と目**（★2026-09-17・オーナー指示
          ★「★タイトルをスクリーンショットのように ★**耳と目**をつけてください」
          ★「★目は ★**レース演出の馬の目**を使ってください」
          ★「★デザイナーに依頼しましたがうまくできないのであなたがやってください」）

        ★デザイナー案 4「★札なし・白抜き文字＋耳と目」の形です。
        ★札で背景を塞がないぶん、★観客席や木立が透けて見えます。

        ⚠️ ★目は ★**中継の素材から切り出したもの**です
           （`horse-jockey-side-v8-pose05.png` の x 757〜873 / y 144〜230 → `uma/title-eye.webp`）。
           ★描き起こしていません。★中継と同じ目です。
        ⚠️ ★最初 `race/page.tsx:1107` の実測値（nx 0.61〜0.69）をそのまま当てて、
           ★**胴と手綱**を切り出しました。★あの数字は ★**別のコマ・別の座標系**の話でした。
           → ★素材を開いて目で確かめてから切り出しました。
      */}
      <div style={{
        position: 'absolute', left: 0, right: 0, top: '9%',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'clamp(6px,1.4cqw,12px)',
        padding: '0 14px',
      }}>
        <div style={{ position: 'relative', display: 'inline-flex', flexDirection: 'column', alignItems: 'center' }}>
          {/* ★耳（★2 つ）。★文字の上に少しはみ出させます */}
          {([['left', '11%'], ['right', '11%']] as const).map(([side, off]) => (
            <span key={side} aria-hidden style={{
              /**
               * 🔴 ★**耳は目より外側・上に置きます**（★2026-09-17・撮って分かりました）。
               *    ★最初 目と同じ辺りに置いたところ、★**耳が目の後ろに隠れ**、
               *    ★先だけが脇から覗く形になりました。→ ★外へ 9%・上へ 10px ずらします。
               */
              position: 'absolute', top: 'clamp(-34px,-6.2cqw,-16px)', [side]: off,
              width: 'clamp(30px,5.8cqw,60px)', height: 'clamp(40px,7.6cqw,78px)',
              /**
               * 🔴 ★**馬の毛色にします**（★2026-09-17・オーナー指摘
               *   ★「★ありえないことになっています」）。
               *   ★最初 濃紺（`--u-ink-dark`）で塗ったので、★**青い小さな三角**にしか見えず、
               *   ★耳として読めませんでした。★中継の馬の毛色（鹿毛）に合わせます。
               */
              background: '#8a4a1e',
              /** ★耳の形（★先が尖り、根元が広い） */
              clipPath: 'polygon(50% 0%, 86% 70%, 74% 100%, 26% 100%, 14% 70%)',
              transform: side === 'left' ? 'rotate(-15deg)' : 'rotate(15deg)',
              filter: 'drop-shadow(0 3px 3px rgba(8,18,8,.45))',
            }}>
              {/* ★耳の内側（★薄い桃色。★中継の馬と同じ作り） */}
              <span style={{
                position: 'absolute', left: '28%', right: '28%', top: '20%', bottom: '16%',
                background: '#d79a72',
                clipPath: 'polygon(50% 0%, 92% 74%, 70% 100%, 30% 100%, 8% 74%)',
              }} />
            </span>
          ))}

          <h1 style={{
            /**
             * ⚠️ ★`lineHeight` は **1.18**。★1.02 だと ★**和文の字面がはみ出します**
             *    （★実ブラウザの診断が「中身が箱より高い +19px」と拾いました）。
             */
            margin: 0, fontSize: 'clamp(58px,20cqw,126px)', lineHeight: 1.18, letterSpacing: '.03em',
            whiteSpace: 'nowrap', color: '#fff',
            /** ★白抜き（★濃紺の縁取り＋落ち影）。★札が無いので、★縁で背景から浮かせます */
            WebkitTextStroke: 'clamp(3px,0.7cqw,7px) var(--u-navy)',
            paintOrder: 'stroke fill',
            textShadow: '0 6px 0 rgba(10,35,64,.55), 0 14px 26px rgba(8,18,8,.45)',
          }}>馬物語</h1>

          {/* ★目（★2 つ・★中継の素材そのもの）。★文字の上に重ねます */}
          {([['left', '24%'], ['right', '24%']] as const).map(([side, off]) => (
            <span key={side} aria-hidden style={{
              /**
               * 🔴 ★**目は字に乗せません**（★2026-09-17・撮って分かりました）。
               *    ★最初 `top: 4px` に置いたところ、★`馬` と `物` の上に乗って
               *    ★**字が読めなくなり**ました。→ ★字の ★**上の余白**に置きます。
               */
              position: 'absolute', top: 'clamp(-14px,-2.6cqw,-6px)', [side]: off,
              width: 'clamp(32px,6.2cqw,66px)', aspectRatio: '86 / 76',
              background: "url('/art/uma/title-eye.webp') no-repeat center/contain",
              /** ★右の目は左右を反転（★1 枚の素材で 2 つ作る） */
              transform: side === 'right' ? 'scaleX(-1)' : undefined,
              filter: 'drop-shadow(0 3px 4px rgba(8,18,8,.5))',
            }} />
          ))}
        </div>

        <div style={{
          padding: 'clamp(5px,1.1cqw,9px) clamp(12px,2.6cqw,20px)',
          background: 'var(--u-navy)', border: 'clamp(2px,.5cqw,4px) solid var(--u-gold)',
          borderRadius: 999, fontSize: 'clamp(11px,2.9cqw,16px)', letterSpacing: '.12em',
          whiteSpace: 'nowrap', color: 'var(--u-ink-light)',
        }}>そだてる ・ とうひょう ・ かけぬける</div>
      </div>

      {/*
        ★**馬＝中継と同じ素材**（★2026-09-17・第 4 稿）

        🔴 ★**ここまで 3 回外しました。★どれも「手元の素材を調べずに選んだ」ためです。**
          ★① `chibi-horse.png`（斜め前向き・1 枚）… ★芝は真横に流れるのに正面を向いていた
          ★② `horse-gallop.webp`（220×140 の 6 コマ）… ★脚は動いたが ★**絵柄が別系統**
          ★③ `chibi-side.webp`（デフォルメ真横）… ★生成指示が `slender`・`light and elegant` で
             ★**細すぎ**た。★しかも「がっしりの真横は手元に無い」と報告し、
             ★**オーナーに「何を迷子になっているのですか？」と指摘された**

        → ★**答えは最初から在りました。** ★`/race` は
          ★`horse-jockey-side-v8-pose01〜08`（**970×576・真横・8 コマ**）を描いています。
          ★これが「★レースに出ている馬」そのものです。★体型も向きもコマ数も揃います。

        ⚠️ ★私は ★**`/race` が何を読んでいるかを調べる前に、新しい絵を選んで・作って**いました。
           ★既存の画面が使っている素材を先に見ること。
        ⚠️ ★png は 1 枚 460KB（8 枚で 3.7MB）なので、★`tools/build-art-webp.mjs` で
           ★**webp（1 枚 56KB）**にしました。
      */}
      <div aria-hidden style={{
        /**
         * ★**馬を主役にします**（★2026-09-17・オーナー指摘
         *   ★「★はじめる・ログインボタンを小さくし、★馬を主役にしてください」）。
         * ★狭い画面ほど ★**画面幅に対して大きく**なるよう、下限を上げました
         *   （★390px のとき 300px ＝ 画面の 77%）。
         */
        /**
         * ⚠️ ★**PC は変えません**（★オーナー「★PC 表示は馬とタイトルがいいバランスです」）。
         *    ★上限 560px はそのまま。★`92cqw` は 1280px のとき 1178px なので ★**必ず 560px で頭打ち**です。
         * ★狭い画面だけ大きくします（★390px のとき **360px ＝ 画面の 92%**）。
         */
        /**
         * ⚠️ ★**PC は変えません**（★オーナー「★PC 表示は馬とタイトルがいいバランスです」）。
         *    ★`104cqw` は 1280px のとき 1331px なので ★**必ず 560px で頭打ち**です。
         * ★狭い画面だけさらに大きく（★390px のとき **406px ＝ 画面いっぱい**。
         *   ★鼻先と尾が少し外へ出て、★迫力が出ます。★親が隠すので欠けては見えません）。
         */
        /**
         * ⚠️ ★芝を ★**中継の板どおり**にしたので、★手前の芝は画面の 9.6% しかありません。
         *    ★馬の足元の余白が広く、★モバイルでは ★**相対的に小さく見えて**いました。
         *    → ★狭い画面では ★さらに大きく（★390px のとき **445px**）、★位置も上げます。
         * ⚠️ ★**PC は変えません**（★`114cqw` は 1280px で 1459px ＝ ★必ず 560px で頭打ち）。
         */
        position: 'absolute', right: '-5%', bottom: '24%',
        width: 'clamp(445px,114cqw,560px)', aspectRatio: '970 / 576',
        transformOrigin: 'bottom center',
        /**
         * ⚠️ ★**跳ねは付けません**（★2026-09-17）。★1 枚絵だったときの名残で
         *    ★`u-idle` を残していましたが、★8 コマには ★**上下動が入っている**ので、
         *    ★重ねると ★**二重に跳ねます**（★第 2 稿で `u-rush` を外したのと同じ理由）。
         */
      }}>
        <span style={{ position: 'absolute', left: '14%', right: '14%', bottom: -10, height: 22, borderRadius: '50%', background: 'rgba(14,26,12,.5)', filter: 'blur(6px)' }} />
        {/* ★砂煙と土くれは ★**後ろ（左）へ**飛びます（★真横・右向きに合わせる） */}
        <span style={{ position: 'absolute', left: '-6%', bottom: '2%', width: '16%', aspectRatio: '1', borderRadius: '50%', background: 'rgba(228,226,208,.5)', filter: 'blur(8px)', animation: 'u-dust .62s linear infinite' }} />
        <span style={{ position: 'absolute', left: '6%', bottom: 0, width: '11%', aspectRatio: '1', borderRadius: '50%', background: 'rgba(228,226,208,.38)', filter: 'blur(7px)', animation: 'u-dust .62s linear -.2s infinite' }} />
        <span style={{ position: 'absolute', left: '18%', bottom: '1%', width: '8%', aspectRatio: '1', borderRadius: '50%', background: 'rgba(228,226,208,.28)', filter: 'blur(6px)', animation: 'u-dust .62s linear -.42s infinite' }} />
        <span style={{ position: 'absolute', left: '12%', bottom: '4%', width: 11, height: 8, borderRadius: 3, background: '#2c4522', animation: 'u-clod .62s linear -.08s infinite' }} />
        <span style={{ position: 'absolute', left: '22%', bottom: '2%', width: 8, height: 7, borderRadius: 3, background: '#37541f', animation: 'u-clod .62s linear -.36s infinite' }} />
        {/*
          ★**中継と同じ 8 コマ**を重ねて、★順に 1 枚だけ見せます（★`u-frame` の註記）。
          ⚠️ ★止めると（`.u-paused`）★`animation: none` で ★**全部 opacity 1**になり、
             ★8 枚が重なって濁ります。→ ★**1 枚目以外は `opacity: 0` を素の値**にしておきます。
        */}
        {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
          <span key={n} style={{
            position: 'absolute', inset: 0,
            background: `url('/art/horse-jockey-side-v8-pose0${n}.webp') no-repeat bottom center/contain`,
            filter: 'drop-shadow(0 10px 14px rgba(10,20,8,.38))',
            opacity: n === 1 ? 1 : 0,
            animation: `u-frame ${GALLOP_SEC}s steps(1,end) ${((n - 1) * GALLOP_SEC) / 8}s infinite`,
          }} />
        ))}
      </div>

      {/* ★下端のボタン 2 つ（★44px 以上・下端 34px の安全領域） */}
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 0, padding: '16px 16px var(--u-safe-bottom)',
        background: 'linear-gradient(rgba(8,20,10,0) 0%,rgba(8,20,10,.44) 42%,rgba(8,20,10,.66) 100%)',
      }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'center', width: '100%', maxWidth: 900, margin: '0 auto' }}>
          {/*
            ★**ボタンは小さくしました**（★2026-09-17・オーナー指摘）。
            ⚠️ ★ただし ★**44px は下回りません**（★指で押せる大きさ・★実ブラウザの診断が見ています）。
               ★高さ 92px 固定 → ★`clamp(56px, 11cqw, 88px)`。★390px のとき **56px**。
          */}
          <a href="/signup" style={{
            flex: '1.3 1 180px', maxWidth: 470, minHeight: 'clamp(56px,11cqw,88px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '5px solid var(--u-navy)', borderRadius: 10,
            backgroundImage: 'linear-gradient(#58c079 0%,#2f9e4f 46%,#1b6f34 100%)',
            boxShadow: '0 7px 0 #0a2340, 0 12px 20px rgba(8,18,8,.42), inset 0 3px 0 rgba(255,255,255,.6)',
            color: '#fff', fontSize: 'clamp(20px,4.6cqw,38px)', textShadow: '0 3px 0 rgba(0,0,0,.32)',
          }}>はじめる</a>
          <a href="/login" style={{
            flex: '1 1 150px', maxWidth: 380, minHeight: 'clamp(56px,11cqw,88px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '5px solid var(--u-navy)', borderRadius: 10,
            backgroundImage: 'linear-gradient(#ffffff 0%,#e6eef6 100%)',
            boxShadow: '0 7px 0 rgba(10,35,64,.9), 0 12px 20px rgba(8,18,8,.42), inset 0 3px 0 #fff',
            color: 'var(--u-ink-dark)', fontSize: 'clamp(18px,4.1cqw,34px)',
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
