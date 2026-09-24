'use client';

/**
 * ★**育成モード／調教（`/train`）**（★R-14・2026-09-17・引き渡し資料 §8-3）
 *
 * 【★この画面が守ること】
 *   ★**素質の数値を出しません**（★正典 §5.5・§12.4）— ★出すのはスタミナと調子のゲージだけ
 *   ★**ゲージ以外に「機械」的表現を増やしません**（★資料 §8-3）
 *   ★停止スイッチを常設／★下端 34px の安全領域
 *
 * ⚠️ ★**ルート名について**: ★既存の `/training`（arcade 版）は生きています。
 *    ★同じ URL を奪わず `/train` に置きました。★切り替えはオーナー判断です（★報告 §3）。
 *
 * ⚠️ ★**週送り・メニューの効果のロジックは既存を流用します**（★資料 §4.3）。
 *    ★この画面はまだ**見た目だけ**で、★`@star/training` には繋いでいません（★次便）。
 *
 * ★**馬の絵は「レースの馬そのもの」です**（★2026-09-24・オーナー決定）。
 *
 *   ⚠️ ★2026-09-23 まで、★この画面の馬は ★**別に焼いた**絵（`train-body-idle` / `train-face-*`）でした。
 *      ★焼くたびに絵柄がずれ、★オーナーから ★**3 回**差し戻されました
 *      （「★急にスマートになっている」「★デフォルメのキャラクターではない」）。
 *   ★オーナー決定「★そもそもレースの馬は生成できる。★真横の馬を見せればいい」。
 *   → ★素材は `horse-jockey-side-walk-v1`（★パドックの歩き 8 コマ）から ★**騎手だけを消した**もの。
 *     ★体・顔・線・陰影はレースの馬そのものなので、★乖離は原理的に起きません。
 *     ★作り方は `tools/publish-uma-horse-frames.mjs`（★切り出しの値もそこに在る）。
 *
 * ★**待機** … `horse-stand.webp`（★四肢がいちばん体の下に集まっているコマ）＋ ★小さな上下動
 * ★**調教中** … `horse-walk-sheet.webp` を `steps(8, jump-none)` で送る（★脚が実際に動く）
 * ★**顔アップ** … ★同じ絵から切り出した頭部 1 枚。★表情は ★**まぶた／眉だけの部品を重ねて**作ります
 *    （★オーナー決定 D-4・`DECISIONS_HORSE_LOOK_20260924.md`。★頭部は一切描き直さない）
 * ⚠️ ★どの表情を出すかは `trainFaceOf` が決めます（★画面で決めない）。
 */

import { useEffect, useRef, useState } from 'react';
import { Backdrop, BigButton, TopBar, useMotionPaused } from '../../components/uma/uma-parts';
import { RaceStrip } from '../../components/uma/race-strip';
import { useStableView } from '../../components/uma/use-stable-view';
import { TRAINING_MENUS } from '../../lib/game-demo';
import { conditionView, sortStable, trainFaceOf, type TrainFace } from '../../lib/stable';
import { coatOfHorseId, coatCssFilter } from '@star/render';

/** ★実行してから待機に戻るまで（★資料 §9 の 3200ms） */
const RUN_MS = 3200;

/**
 * ★**メニューは `@star/training` の名簿から引きます**（★D-052・R-30）。
 *
 * ⚠️ ★**2026-09-17 の訂正**: ★最初、★資料 §8-3 の見出し（追い切り／坂路／プール／軽めの調整／
 *    ★休養／馬房で様子見）を ★**画面に 6 件書いていました**。★しかし正典 §7.2 の名簿は
 *    ★**8 件**（`hill`・`wood`・`pool`・`gate`・`partner`・`hard`・`light`・`rest`）で、
 *    ★**画面が別の名簿を持つ**形になっていました。
 *    → ★`TRAINING_MENUS`（★名前も疲労も EP も `MENUS` から出ている）を引きます。
 *    ★資料と正典が食い違うときは ★**正典が上**です（★憲法・§0）。
 */

const CONDITION_STEPS = 5;

/** ★顔枠に出す言葉（★`trainFaceOf` の 3 値と 1 対 1） */
const FACE_WORD: Record<TrainFace, string> = {
  happy: '上機嫌です',
  normal: '落ち着いています',
  tired: '疲れています',
};

/**
 * ★顔に重ねる部品（★`null` ＝ 何も重ねない ＝ 素の頭部）。
 * ⚠️ ★**平常が `null`** です。★部品は「平常の顔をどう変えるか」なので、★平常に部品はありません。
 * ⚠️ ★名前は `/art/uma/horse-face-part-<ここ>.webp` に化けます（★`tools/publish-uma-face-parts.mjs`）。
 */
const FACE_PART: Record<TrainFace, string | null> = {
  happy: 'happy',
  normal: null,
  tired: 'tired',
};

export default function TrainPage(): React.ReactElement {
  const [paused, toggle] = useMotionPaused();
  const { view, loading, error, refresh } = useStableView();
  /** ★選んでいるメニューの id（★名簿の並びから引く・★画面で番号を発明しない） */
  const [menuId, setMenuId] = useState<string>(TRAINING_MENUS[0]!.id);
  const spec = TRAINING_MENUS.find((m) => m.id === menuId) ?? TRAINING_MENUS[0]!;
  const [selectedHorse, setSelectedHorse] = useState<string | null>(null);
  const horses = sortStable(view?.horses ?? []);
  const horse = horses.find((candidate) => candidate.id === selectedHorse) ?? horses[0] ?? null;
  const [running, setRunning] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => { if (timer.current !== undefined) clearTimeout(timer.current); }, []);
  const run = (): void => {
    if (timer.current !== undefined) clearTimeout(timer.current);
    setRunning(true);
    timer.current = setTimeout(() => { setRunning(false); }, RUN_MS);
  };

  if (horse === null) return <div data-theme="uma" style={{ minHeight: '100dvh', background: 'var(--u-navy)' }}>
    <Backdrop /><TopBar title="育成モード" paused={paused} onToggle={toggle} /><RaceStrip compact />
    <div role={error ? 'alert' : 'status'} style={{ position: 'relative', padding: 20 }}>
      {loading ? '厩舎を読み込み中…' : error ?? 'まだ持ち馬がいません。'}
      <div style={{ display: 'flex', gap: 12, marginTop: 12 }}><a href="/login">ログイン</a><a href="/setup">最初の1頭を迎える</a><button type="button" onClick={refresh}>再読み込み</button></div>
    </div>
  </div>;
  const cond = conditionView(horse.condition);
  /** ★顔は 3 種。★選ぶ規則は画面に置かない（★`trainFaceOf`・疲労が先） */
  const face = trainFaceOf(horse.condition, horse.fatigue);
  /**
   * ★**この馬の毛色**（★裁定 `REVIEW_HORSE_IDENTITY_VERDICT_20260923.md` §9・2026-09-23）。
   *   ★馬 ID から決定的に引く（★枠番からではない）。★同じ馬はいつ見ても同じ毛色。
   *   ⚠️ ★色の式は `@star/render` が持つ（★画面で組み立てない）。
   */
  const coatFilter = coatCssFilter(coatOfHorseId(horse.id));

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
      <TopBar title="育成モード" paused={paused} onToggle={toggle} />
      <RaceStrip compact />
      <div role="status" style={{ position: 'relative', padding: '6px 14px', color: 'var(--u-gold)', fontSize: 12 }}>
        馬の状態は実データです。調教指示の適用は準備中のため、この画面からは保存できません。
      </div>

      <div style={{
        position: 'relative', flex: '1 1 auto', minHeight: 0, display: 'flex', flexWrap: 'wrap',
        alignItems: 'stretch', gap: 12, padding: '12px 14px 0',
        width: '100%', maxWidth: 1220, margin: '0 auto', overflow: 'hidden',
      }}>
        {horses.length > 1 && <div style={{ width: '100%', display: 'flex', gap: 8, overflowX: 'auto' }}>
          {horses.map((entry) => <button key={entry.id} type="button" onClick={() => { setSelectedHorse(entry.id); }} aria-pressed={entry.id === horse.id}
            style={{ minHeight: 44, flex: '0 0 auto', padding: '5px 10px', border: entry.id === horse.id ? '2px solid var(--u-gold)' : '2px solid var(--u-edge-light)', borderRadius: 8, background: 'var(--u-panel)', color: 'var(--u-ink-light)' }}>{entry.name}</button>)}
        </div>}
        {/* ★調教ステージ */}
        <div style={{
          flex: '1 1 340px', minWidth: 0, minHeight: 296, position: 'relative',
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
          border: '2px solid rgba(246,194,28,.45)', borderRadius: 14, background: 'rgba(6,18,30,.28)', overflow: 'hidden',
        }}>
          {/* ★左上の 2 札（選んだメニュー／状態） */}
          <div style={{ position: 'absolute', left: 10, top: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ padding: '5px 9px', border: '2px solid var(--u-gold)', borderRadius: 999, background: 'var(--u-panel-strong)', fontSize: 11 }}>
              {spec.name}
            </span>
            <span style={{ padding: '5px 9px', border: '2px solid rgba(251,247,236,.35)', borderRadius: 999, background: 'var(--u-panel)', fontSize: 11, fontWeight: 700 }}>
              {running ? '調教中' : `${horse.name}・${cond.label}`}
            </span>
          </div>

          {/* ★顔アップ枠（★表情 3 種。★どれを出すかは `trainFaceOf` が決める） */}
          <div style={{ position: 'absolute', right: 10, top: 10, width: 96, border: '3px solid var(--u-gold)', borderRadius: 12, background: 'var(--u-panel-strong)', overflow: 'hidden' }}>
            {/*
              ★**表情は「部品」で作ります**（★オーナー決定 D-4・2026-09-24）。
                ★頭部の絵は ★**1 枚のまま**（`horse-face.webp`）。
                ★その上に ★**まぶた／眉だけの透過レイヤー**を重ねます。
              ⚠️ ★2026-09-23 まで、★表情ごとに ★**頭部を焼き直して**いました。
                 ★「耳・まぶた・口角だけ動かす」と指示しても、★**2 回とも頭の形と線が引き直され**、
                 ★別キャラになりました（★Codex 自身も失敗と報告）。
                 ★オーナーに 3 回 差し戻された原因と同じ形です。
              ⚠️ ★部品は ★**頭部と同じ画布**で作ってあります（`tools/publish-uma-face-parts.mjs` が
                 ★頭部から目の位置を測って合わせた）。★だから ★**`inset: 0` で重ねるだけ**です。
                 🔴 ★ここに座標を書かないこと（★頭部を切り直したら画面まで直すことになります）。
            */}
            <div style={{ position: 'relative', height: 101, filter: coatFilter }}>
              {/* ★顔も同じ毛色にする（★全身と顔で色が違うと、別の馬に見える） */}
              <span style={{
                position: 'absolute', inset: 0,
                // ★240x252 の頭部。★`contain` で入れる（★`cover` だと耳と鼻先が切れる）
                background: "url('/art/uma/horse-face.webp') no-repeat center/contain",
              }} />
              {FACE_PART[face] !== null && (
                <span style={{
                  position: 'absolute', inset: 0,
                  background: `url('/art/uma/horse-face-part-${FACE_PART[face]}.webp') no-repeat center/contain`,
                }} />
              )}
            </div>
            <div style={{ padding: '4px 6px', textAlign: 'center', fontSize: 11, borderTop: '2px solid rgba(246,194,28,.6)' }}>
              {FACE_WORD[face]}
            </div>
          </div>

          {/* ★馬（★タップでも「この内容で調教する」でも走り出す） */}
          <span style={{ position: 'absolute', left: '16%', right: '16%', bottom: 74, height: 18, borderRadius: '50%', background: 'rgba(8,18,8,.5)', filter: 'blur(6px)' }} />
          {running && (
            <span style={{ position: 'absolute', left: '12%', bottom: 72, width: 60, height: 44, borderRadius: '50%', background: 'rgba(228,226,208,.4)', filter: 'blur(8px)', animation: 'u-dust .95s linear infinite' }} />
          )}
          <div
            onClick={run}
            style={{
              position: 'relative', width: 'min(330px, 88%)', aspectRatio: '544 / 312',
              marginBottom: 80, cursor: 'pointer',
              /**
               * ⚠️ ★調教中は ★**CSS で跳ねさせません**（★Codex の助言・
               *    「★一定周期の CSS の上下動は玩具や UI アイコンに見える」）。
               *    ★脚は絵の側（8 コマ）が動かします。
               */
              animation: running ? undefined : 'u-idle 3.4s ease-in-out infinite',
            }}
          >
            <span style={{
              position: 'absolute', inset: 0,
              /**
               * ⚠️ ★`800% 100%` は `@keyframes u-walk`（0%→100%）と ★**対**です。
               *    ★片方だけ変えるとコマが半分ずれます。
               */
              background: running
                ? "url('/art/uma/horse-walk-sheet.webp') no-repeat 0 0 / 800% 100%"
                : "url('/art/uma/horse-stand.webp') no-repeat center/contain",
              /**
               * 🔴 ★**`jump-none` を落とさないこと**（★2026-09-24・実ブラウザで実測）。
               *   ★既定の `steps(8)` は 0/8, 1/8 … 7/8 の位置で止まります。★コマの境目は k/7 なので、
               *   ★**8 コマ中 7 コマで、★2 コマが半分ずつ映ります**（★実測 差 25〜35・★合っていれば 1.0）。
               *   ★`jump-none` は 0/7, 1/7 … 7/7 で止まります（★両端を含む 8 点）。
               */
              animation: running ? 'u-walk .8s steps(8, jump-none) infinite' : undefined,
              // ⚠️ ★毛色を先に、影を後に掛ける（★逆にすると影まで毛色に染まる）
              filter: `${coatFilter === undefined ? '' : `${coatFilter} `}drop-shadow(0 8px 12px rgba(8,18,8,.45))`,
            }} />
          </div>

          {/* ★ゲージ（★スタミナ・調子。★これ以外に機械的な表示を増やさない） */}
          <div style={{
            position: 'absolute', left: 10, right: 10, bottom: 10, display: 'flex', flexDirection: 'column', gap: 5,
            padding: '8px 10px', borderRadius: 10, background: 'rgba(10,35,64,.78)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 62, flex: '0 0 auto', fontSize: 10, letterSpacing: '.08em', color: 'var(--u-ink-light-3)' }}>疲労</span>
              <span style={{ flex: '1 1 auto', height: 12, background: 'rgba(251,247,236,.18)', borderRadius: 2, overflow: 'hidden' }}>
                <span style={{ display: 'block', width: `${Math.max(0, Math.min(100, horse.fatigue))}%`, height: '100%', background: 'var(--u-gauge)' }} />
              </span>
              <span className="u-num" style={{ flex: '0 0 auto', width: 42, textAlign: 'right', fontSize: 16 }}>{horse.fatigue}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 62, flex: '0 0 auto', fontSize: 10, letterSpacing: '.08em', color: 'var(--u-ink-light-3)' }}>調子</span>
              <span style={{ flex: '1 1 auto', display: 'flex', gap: 3, height: 12 }}>
                {Array.from({ length: CONDITION_STEPS }, (_, i) => (
                  <span key={i} style={{ flex: 1, background: i < horse.condition ? 'var(--u-gold)' : 'rgba(251,247,236,.2)' }} />
                ))}
              </span>
              <span style={{ flex: '0 0 auto', width: 42, textAlign: 'right', fontSize: 12 }}>{cond.mark}</span>
            </div>
          </div>
        </div>

        {/* ★メニュー列 */}
        <div style={{ flex: '1 1 320px', minWidth: 0, maxWidth: 460, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(104px,1fr))', gap: 8 }}>
            {TRAINING_MENUS.map((m) => {
              const on = m.id === menuId;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => { setMenuId(m.id); }}
                  style={{
                    minHeight: 52, borderRadius: 10, padding: '6px 8px',
                    border: on ? '3px solid var(--u-gold)' : '3px solid rgba(251,247,236,.3)',
                    backgroundImage: on ? 'linear-gradient(#3c6d99,#123f6b)' : undefined,
                    background: on ? undefined : 'var(--u-panel)',
                    boxShadow: on ? '0 4px 0 var(--u-navy-deep)' : undefined,
                    color: 'var(--u-ink-light)',
                  }}
                >
                  <span style={{ display: 'block', fontSize: 14 }}>{m.name}</span>
                  {/* ★疲労も EP も名簿から（★画面に数を書かない・D-052） */}
                  <span style={{ display: 'block', fontSize: 10, fontWeight: 500, color: 'var(--u-ink-light-3)' }}>
                    疲労 {m.fatigueDelta > 0 ? `+${m.fatigueDelta}` : `−${Math.abs(m.fatigueDelta)}`}
                  </span>
                </button>
              );
            })}
          </div>
          {/* ★説明は常に 1〜2 行（★資料 §8-3）。★主効果・副効果も名簿から */}
          <div style={{
            padding: '8px 11px', border: '2px solid rgba(251,247,236,.28)', borderRadius: 12,
            background: 'var(--u-panel)', fontSize: 12, fontWeight: 500, lineHeight: 1.6,
          }}>
            {spec.main}　／　副効果 {spec.sub}　／　消費 {spec.ep} EP
            {spec.banner !== undefined && (
              <span style={{ display: 'block', marginTop: 4, color: spec.banner.kind === 'bad' ? '#f06a5f' : 'var(--u-gold)' }}>
                {spec.banner.text}
              </span>
            )}
          </div>
        </div>
      </div>

      <div style={{
        position: 'relative', flex: '0 0 auto', display: 'flex', flexWrap: 'wrap', gap: 10,
        padding: '10px 14px var(--u-safe-bottom)', width: '100%', maxWidth: 1220, margin: '0 auto',
      }}>
        <BigButton tone="disabled" label="調教指示は準備中" sub="現在、この画面からの指示は保存されません" grow="1.4 1 210px" />
        <BigButton tone="ivory" label="ダッシュボード" sub="いつでも戻れます" href="/home" grow="1 1 130px" />
      </div>
    </div>
  );
}
