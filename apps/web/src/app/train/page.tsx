'use client';

/**
 * ★**育成モード／調教（`/train`）**（★R-14・2026-09-17・引き渡し資料 §8-3）
 *
 * 🔴 ★**2026-09-30: 旧 `/training` をここへ畳みました**（★オーナー「1 つにまとめる」）。
 *   ★デザイナー R-21 の引き渡し資料（`design_handoff_r21_races_training/README.md` §3）の中身をここに取り込み、
 *   ★`/training` は ★`next.config.mjs` で ここへ転送します（★同じ役割の画面を 2 つ残さない）。
 *   ★取り込んだもの: ★馬の札（未指示／指示済み・献立／休養中）・★まだ指示していない頭数・★馬の様子
 *   （★名前・格・一言・★調子 5 段と 疲れ 3 段の ★数字なしのゲージと言葉）・★献立のカード（EP つき）・★注意の帯（★理由の文だけ）。
 *   ★残したもの: ★歩く馬と顔（★オーナー「ダッシュボードと同じく歩くように」）・★小窓（★大・オーナー指示）・★出走登録。
 *   ⚠️ ★資料と違えた所: ★「週を進める」は置かない（★週はワーカーが自動で進める・★押しても何も起きないボタンは嘘）→ `CLAIM_DEFAULT_MENU`。
 *     ★「今週 第 n 週」も置かない（★画面が持つ本物の週の値が無い・★旧 `/training` は 32 と書いていた）。
 *
 * 【★この画面が守ること】
 *   ★**素質・能力の数値を出しません**（★正典 §5.5・§12.4・★資料 §3-5 ①「能力のバーを外す」）— ★出すのは調子と疲れの ★段と言葉だけ
 *   ★停止スイッチを常設／★下端 34px の安全領域
 *
 * ★**馬の絵は「レースの馬そのもの」です**（★2026-09-24・オーナー決定）。
 *   ★素材は `horse-jockey-side-walk-v1`（★パドックの歩き 8 コマ）から ★**騎手だけを消した**もの（`tools/publish-uma-horse-frames.mjs`）。
 * ★**顔アップ** … ★同じ絵から切り出した頭部 1 枚。★表情は ★**まぶた／眉だけの部品を重ねて**作ります
 *    （★オーナー決定 D-4・`DECISIONS_HORSE_LOOK_20260924.md`。★頭部は一切描き直さない）
 * ⚠️ ★どの表情を出すかは `trainFaceOf` が決めます（★画面で決めない）。
 */

import { useEffect, useRef, useState } from 'react';
import { Backdrop, BigButton, NOTICE_ACTION, OwnHorseFigure, TextPanel, TopBar, useMotionPaused } from '../../components/uma/uma-parts';
import { RaceStrip } from '../../components/uma/race-strip';
import { useStableView } from '../../components/uma/use-stable-view';
import { NoHorseCard } from '../../components/uma/no-horse-card';
import { TRAINING_MENUS } from '../../lib/game-demo';
import { sendTrainingOrder } from '../../lib/training-order';
import { conditionView, fatigueStepOf, sortStable, trainFaceOf, type StableHorse, type TrainFace } from '../../lib/stable';
import { coatOfHorseId, coatCssFilter } from '@star/render';
import { gradeEpCost, raceWeekMarkOf, type MenuId } from '@star/training';
import { NoticeBar } from '../../components/uma/uma-parts';
import { CLAIM_DEFAULT_MENU, CLAIM_TRAIN_EP_SHORT } from '../../lib/claims';
import { loadTrainProfile, type TrainProfile } from '../../lib/train-profile';
import { SignInRequiredError } from '../../lib/stable-repo';

/** ★実行してから待機に戻るまで（★資料 §9 の 3200ms） */
const RUN_MS = 3200;

/**
 * ★**メニューは `@star/training` の名簿から引きます**（★D-052・R-30）。
 *   ★`TRAINING_MENUS`（★名前も疲労も EP も `MENUS` から出ている）。★資料と正典が食い違うときは ★**正典が上**です（★憲法・§0）。
 */

/** ★調子は 5 段（★エンジンの 1〜5 をそのまま） */
const CONDITION_STEPS = 5;
/** ★疲れは 3 段（★`fatigueStepOf`・境目は `fatigueColor` と同じ） */
const FATIGUE_STEPS = 3;

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

/** ★馬の札の状態（★資料 §3-1） */
function weekChip(h: StableHorse): { readonly text: string; readonly bg: string; readonly ink: string } {
  if (h.week.kind === 'todo') return { text: '未指示', bg: '#ffe483', ink: '#10243a' };
  if (h.week.kind === 'done') return { text: `指示済み ・ ${h.week.menu}`, bg: '#e4efe7', ink: '#1e7a3a' };
  return { text: '休養中', bg: '#e7e9ec', ink: '#4a5a66' };
}

/**
 * ★**今週の一言**（★資料 §3-2）。★出走の前後は ★`raceWeekMarkOf`（★`@star/training` の 1 か所・★画面に条件を持たない）。
 */
function weekLine(h: StableHorse, face: TrainFace): string {
  const mark = raceWeekMarkOf(h.weeksToNextRace, h.weeksSinceLastRace);
  if (mark === 'race-week' && h.nextRace !== null) return `${h.nextRace} 本日発走です。`;
  if (mark === 'before-race' && h.nextRace !== null) return `${h.nextRace} に向けて仕上げます。`;
  if (mark === 'after-race') return '前走を終えました。疲れを抜く週です。';
  return `${FACE_WORD[face]}。`;
}

const GAUGE_LABEL: React.CSSProperties = { fontSize: 11, color: '#cfe0ee' };
const GAUGE_WORD: React.CSSProperties = { fontSize: 12, color: '#e6eef6', whiteSpace: 'nowrap' };

export default function TrainPage(): React.ReactElement {
  const [paused, toggle] = useMotionPaused();
  const { view, loading, error, needsSetup, needsLogin, refresh } = useStableView();
  /** ★選んでいるメニューの id（★名簿の並びから引く・★画面で番号を発明しない） */
  const [menuId, setMenuId] = useState<string>(TRAINING_MENUS[0]!.id);
  const spec = TRAINING_MENUS.find((m) => m.id === menuId) ?? TRAINING_MENUS[0]!;
  const [selectedHorse, setSelectedHorse] = useState<string | null>(null);
  const horses = sortStable(view?.horses ?? []);
  /** ★最初は ★未指示の先頭（★休養中は選べない） */
  const horse = horses.find((candidate) => candidate.id === selectedHorse)
    ?? horses.find((h) => h.week.kind === 'todo') ?? horses.find((h) => h.week.kind !== 'rest') ?? horses[0] ?? null;
  const todoCount = horses.filter((h) => h.week.kind === 'todo').length;
  /**
   * ★**この馬の実力**（★2026-09-30・オーナー「馬の実力を表すものを 育成ページで 全て一目で」）。
   *   ★戦績・最近の着順・条件ごとの経験（★`lib/train-profile.ts`）。★能力の数値は出さない（★D-114）。
   */
  const [profile, setProfile] = useState<{ readonly id: string; readonly data: TrainProfile | null; readonly error: string | null } | null>(null);
  const profileHorseId = horse?.id ?? null;
  useEffect(() => {
    if (profileHorseId === null || (view !== null && view.demo)) return;
    let alive = true;
    loadTrainProfile(profileHorseId)
      .then((data) => { if (alive) setProfile({ id: profileHorseId, data, error: null }); })
      .catch((e: unknown) => {
        if (!alive) return;
        /** ★未ログインは そう言う（★見本に落とさない・網 owner-scoped-needs-session） */
        if (e instanceof SignInRequiredError) { setProfile({ id: profileHorseId, data: null, error: 'ログインすると見られます' }); return; }
        setProfile({ id: profileHorseId, data: null, error: e instanceof Error ? e.message : String(e) });
      });
    return () => { alive = false; };
  }, [profileHorseId, view]);
  const [running, setRunning] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => { if (timer.current !== undefined) clearTimeout(timer.current); }, []);
  const run = (): void => {
    if (timer.current !== undefined) clearTimeout(timer.current);
    setRunning(true);
    timer.current = setTimeout(() => { setRunning(false); }, RUN_MS);
  };
  /**
   * 🔴 ★**調教の指示を送る**（★2026-09-27・裁定 `REVIEW_UI_AUDIT_20260927.md` P1-1）。
   *   ★送る処理は ★`lib/training-order.ts` 1 か所。★EP は ★ここでは減りません（★調教したときに減る）。
   *   ★失敗は ★サーバーの文を ★画面の上の帯で出します（★`window.alert` は使わない・資料 §3-5 ③）。
   */
  const [sending, setSending] = useState(false);
  const [sentId, setSentId] = useState<string | null>(null);
  const [orderMessage, setOrderMessage] = useState<{ readonly ok: boolean; readonly text: string } | null>(null);
  const instruct = async (horseId: string, horseName: string, menuName: string): Promise<void> => {
    if (sending) return;
    setSending(true);
    setOrderMessage(null);
    try {
      await sendTrainingOrder(horseId, menuId);
      setSentId(horseId);
      setOrderMessage({ ok: true, text: `${horseName} に「${menuName}」を指示しました（参加ポイントは 調教したときに減ります）` });
      run();
      refresh();
    } catch (e) {
      setOrderMessage({ ok: false, text: `指示を保存できませんでした: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setSending(false);
    }
  };

  if (horse === null) return <div data-theme="uma" data-page-body style={{ minHeight: '100dvh', background: 'var(--u-navy)' }}>
    <Backdrop /><TopBar title="育成モード" paused={paused} onToggle={toggle} /><RaceStrip />
    {/* ★馬がいない・入れない（★2026-10-01・オーナー「ログインしているのにログインがあるのはおかしい」）。★ホームと同じカード */}
    {loading ? <TextPanel role="status" style={{ padding: 16 }}>厩舎を読み込み中…</TextPanel>
      : <div style={{ display: 'flex', justifyContent: 'center', padding: '24px 14px' }}>
        <NoHorseCard needsLogin={needsLogin} needsSetup={needsSetup} error={view === null ? error : null} onRetry={refresh} />
      </div>}
  </div>;
  const cond = conditionView(horse.condition);
  const fat = fatigueStepOf(horse.fatigue);
  /** ★顔は 3 種。★選ぶ規則は画面に置かない（★`trainFaceOf`・疲労が先） */
  const face = trainFaceOf(horse.condition, horse.fatigue);
  /**
   * ★**この馬の毛色**（★裁定 `REVIEW_HORSE_IDENTITY_VERDICT_20260923.md` §9・2026-09-23）。
   *   ★馬 ID から決定的に引く。⚠️ ★色の式は `@star/render` が持つ（★画面で組み立てない）。
   */
  const coatFilter = coatCssFilter(coatOfHorseId(horse.id));
  /** ★実際に引かれる額（★ワーカーと同じ `gradeEpCost(献立, その馬の厩舎の格)`・2026-09-29） */
  const cost = gradeEpCost(spec.id as MenuId, horse.stableGrade);
  /** ★残高が足りなければ ★その週は無料の休養に落ちる（★ST001・training-runner）→ ★前もって言う・★受け取りへの道を並べる */
  const epShort = view !== null && !view.demo && view.home.epBalance < cost;
  const resting = horse.week.kind === 'rest';
  const instructLabel = sending ? '送っています…'
    : sentId === horse.id ? '指示しました'
      : horse.week.kind === 'done' ? '指示を変更する' : 'この馬に指示する';

  return (
    <div
      data-theme="uma" data-page-body
      className={paused ? 'u-paused' : undefined}
      style={{
        position: 'relative', width: '100%', minHeight: '100dvh', overflow: 'hidden',
        containerType: 'inline-size', background: 'var(--u-navy)', display: 'flex', flexDirection: 'column',
      }}
    >
      <Backdrop />
      <TopBar title="育成モード" paused={paused} onToggle={toggle} />
      <RaceStrip />
      {epShort && <NoticeBar kind="closing" text={CLAIM_TRAIN_EP_SHORT} sub={`残高 ${view!.home.epBalance.toLocaleString('ja-JP')} EP ／ この献立 ${cost.toLocaleString('ja-JP')} EP`} actionLabel="受け取る" actionHref="/earn" />}
      {orderMessage !== null && (
        <div role={orderMessage.ok ? 'status' : 'alert'} style={{
          position: 'relative', margin: '6px 14px 0', padding: '8px 12px', borderRadius: 10, fontSize: 13,
          border: `2px solid ${orderMessage.ok ? 'var(--u-ep)' : 'var(--u-red)'}`, background: 'var(--u-panel-strong)',
          display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
        }}>
          <span style={{ flex: '1 1 200px' }}>{orderMessage.text}</span>
          {!orderMessage.ok && <button type="button" onClick={refresh} style={NOTICE_ACTION}>再読み込み</button>}
        </div>
      )}

      <div style={{
        position: 'relative', flex: '1 1 auto', minHeight: 0, display: 'flex', flexWrap: 'wrap',
        alignItems: 'stretch', gap: 12, padding: '10px 14px 0',
        width: '100%', maxWidth: 1220, margin: '0 auto', overflow: 'auto',
      }}>
        {/* ★上の段（§3-1）: ★まだ指示していない頭数 ＋ ★馬の札（横スクロール） */}
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <span style={{ padding: '7px 12px', borderRadius: 999, background: 'rgba(10,35,64,.9)', border: '2px solid #f6c21c', fontSize: 12 }}>
              まだ指示していない <span className="u-num" style={{ color: '#ffe483', fontSize: 15 }}>{todoCount}</span> 頭
            </span>
          </div>
          {horses.length > 1 && (
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 2 }}>
              {horses.map((entry) => {
                const chip = weekChip(entry);
                const on = entry.id === horse.id;
                const rest = entry.week.kind === 'rest';
                return (
                  <button key={entry.id} type="button" disabled={rest} aria-pressed={on}
                    onClick={() => { setSelectedHorse(entry.id); }}
                    style={{
                      flex: '0 0 auto', minHeight: 48, padding: '0 12px', borderRadius: 12,
                      display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap',
                      border: on ? '3px solid #f6c21c' : '2px solid rgba(251,247,236,.28)',
                      background: on ? 'rgba(246,194,28,.16)' : 'rgba(10,35,64,.9)', color: 'var(--u-ink-light)',
                      opacity: rest ? 0.6 : 1,
                    }}>
                    <span style={{ fontSize: 14 }}>{entry.name}</span>
                    <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 5, background: chip.bg, color: chip.ink }}>{chip.text}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* ★調教ステージ（★歩く馬と顔・★オーナー指示で残す） */}
        <div style={{
          flex: '1 1 340px', minWidth: 0, minHeight: 250, position: 'relative',
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
          border: '2px solid rgba(246,194,28,.45)', borderRadius: 14, background: 'rgba(6,18,30,.28)', overflow: 'hidden',
        }}>
          <div style={{ position: 'absolute', left: 10, top: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ padding: '5px 9px', border: '2px solid var(--u-gold)', borderRadius: 999, background: 'var(--u-panel-strong)', fontSize: 11 }}>
              {spec.name}
            </span>
            {running && <span style={{ padding: '5px 9px', border: '2px solid rgba(251,247,236,.35)', borderRadius: 999, background: 'var(--u-panel)', fontSize: 11 }}>調教中</span>}
          </div>

          {/* ★顔アップ枠（★表情 3 種。★どれを出すかは `trainFaceOf` が決める） */}
          <div style={{ position: 'absolute', right: 10, top: 10, width: 96, border: '3px solid var(--u-gold)', borderRadius: 12, background: 'var(--u-panel-strong)', overflow: 'hidden' }}>
            {/*
              ★**表情は「部品」で作ります**（★オーナー決定 D-4・2026-09-24）。★頭部の絵は ★**1 枚のまま**（`horse-face.webp`）。
              ⚠️ ★部品は ★**頭部と同じ画布**で作ってあります。★だから ★**`inset: 0` で重ねるだけ**です。
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

          {/* ★馬（★タップでも「指示する」でも走り出す） */}
          <span style={{ position: 'absolute', left: '16%', right: '16%', bottom: 18, height: 18, borderRadius: '50%', background: 'rgba(8,18,8,.5)', filter: 'blur(6px)' }} />
          {running && (
            <span style={{ position: 'absolute', left: '12%', bottom: 16, width: 60, height: 44, borderRadius: '50%', background: 'rgba(228,226,208,.4)', filter: 'blur(8px)', animation: 'u-dust .95s linear infinite' }} />
          )}
          {/* ★その馬の姿（★`/home`・`/mypage` と 同じ部品・★毛色は馬 ID から・2026-09-28）。★2026-09-30 オーナー「ダッシュボードと同じく歩くように」→ ★いつも歩く */}
          <OwnHorseFigure horseId={horse.id} running onClick={run} style={{ marginBottom: 24 }} />
        </div>

        {/* ★馬の様子（§3-2・濃紺パネル）。★数字は出さない（★段と言葉だけ） */}
        <section aria-label="馬の様子" style={{
          flex: '1 1 300px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10, padding: 12,
          background: 'rgba(10,35,64,.9)', border: '2px solid rgba(251,247,236,.28)', borderRadius: 12,
        }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
            <strong style={{ fontSize: 17 }}>{horse.name}</strong>
            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 5, background: '#0a2340', border: '1px solid #f6c21c', color: '#ffe483' }}>{horse.classLabel}</span>
            <span style={{ fontSize: 11, color: '#cfe0ee' }}>{horse.sexAge}</span>
          </div>
          <div style={{ fontSize: 12, lineHeight: 1.6, color: '#e6eef6' }}>{weekLine(horse, face)}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', alignItems: 'center', gap: '8px 10px', padding: 10, borderRadius: 10, background: '#061a33' }}>
            <span style={GAUGE_LABEL}>調子</span>
            <span aria-label={`調子 ${horse.condition} / ${CONDITION_STEPS}`} style={{ display: 'flex', gap: 3, height: 8 }}>
              {Array.from({ length: CONDITION_STEPS }, (_, i) => (
                <span key={i} style={{ flex: 1, borderRadius: 2, background: i < horse.condition ? '#57c8a8' : 'rgba(251,247,236,.22)' }} />
              ))}
            </span>
            <span style={GAUGE_WORD}>{cond.label}</span>
            <span style={GAUGE_LABEL}>疲れ</span>
            <span aria-label={`疲れ ${fat.steps} / ${FATIGUE_STEPS}`} style={{ display: 'flex', gap: 3, height: 8 }}>
              {Array.from({ length: FATIGUE_STEPS }, (_, i) => (
                <span key={i} style={{ flex: 1, borderRadius: 2, background: i < fat.steps ? '#f08219' : 'rgba(251,247,236,.22)' }} />
              ))}
            </span>
            <span style={GAUGE_WORD}>{fat.word}</span>
          </div>
          <AbilityPanel profile={profile !== null && profile.id === horse.id ? profile : null} />
        </section>

        {/* ★今週の調教（§3-3・1 つ選ぶ）。★名前・疲労・EP は名簿から（★画面に数を書かない・D-052） */}
        <section aria-label="今週の調教" style={{ flex: '1.4 1 330px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <strong style={{ fontSize: 13, textShadow: '0 2px 0 rgba(10,35,64,.6)' }}>今週の調教（1 つ選ぶ）</strong>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
            {TRAINING_MENUS.map((m) => {
              const on = m.id === menuId;
              return (
                <div key={m.id} style={{ display: 'flex', flexDirection: 'column' }}>
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => { setMenuId(m.id); }}
                    style={{
                      minHeight: 58, padding: '8px 10px', borderRadius: 10, textAlign: 'left', color: '#10243a',
                      display: 'flex', flexDirection: 'column', gap: 3,
                      /** ⚠️ ★`background` 1 つで書く（★省略形と個別を混ぜると 選び直しで地が消える・2026-09-30） */
                      background: on ? '#fff4cf' : '#fbf7ec',
                      border: on ? '3px solid #f6c21c' : '3px solid rgba(251,247,236,.22)',
                      boxShadow: on ? '0 4px 0 #a9741a' : '0 3px 0 rgba(10,35,64,.5)',
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'baseline', gap: 6, width: '100%' }}>
                      <span style={{ fontSize: 14 }}>{m.name}</span>
                      <span style={{ marginLeft: 'auto', whiteSpace: 'nowrap' }}>
                        <span className="u-num" style={{ fontSize: 15 }}>{gradeEpCost(m.id as MenuId, horse.stableGrade)}</span>
                        <span style={{ fontSize: 9 }}> EP</span>
                      </span>
                    </span>
                    <span style={{ fontSize: 10, color: '#4a6178', lineHeight: 1.4 }}>
                      {m.main}{m.sub !== '—' ? `・${m.sub}` : ''}
                    </span>
                  </button>
                  {/* ★注意の帯（★理由の文だけ・★数値の条件は出さない・資料 §3-5 ④） */}
                  {m.banner !== undefined && (
                    <span style={{
                      marginTop: 4, padding: '4px 10px', borderRadius: 6, fontSize: 10, lineHeight: 1.4,
                      background: m.banner.kind === 'bad' ? '#f6ddd9' : '#f6e7cf', color: m.banner.kind === 'bad' ? '#8a1f16' : '#6b4506',
                    }}>{m.banner.text}</span>
                  )}
                </div>
              );
            })}
          </div>
          <div style={{ fontSize: 11, lineHeight: 1.6, textShadow: '0 1px 0 rgba(10,35,64,.8)' }}>{CLAIM_DEFAULT_MENU}</div>
        </section>
      </div>

      <div style={{
        position: 'relative', flex: '0 0 auto', display: 'flex', flexWrap: 'wrap', gap: 10,
        padding: '10px 14px var(--u-safe-bottom)', width: '100%', maxWidth: 1220, margin: '0 auto',
      }}>
        <BigButton
          tone={sending || resting ? 'disabled' : 'gold'}
          label={resting ? '休養中の馬です' : instructLabel}
          sub={`${spec.name} ・ ${cost} EP を使います（調教したときに）`}
          {...(sending || resting ? {} : { onClick: () => { void instruct(horse.id, horse.name, spec.name); } })}
          grow="1.4 1 210px"
        />
        {/* ★2026-09-30 オーナー「自分の馬を出走させるボタンはどこ？ 育成モードから出走登録をします」 */}
        <BigButton tone="blue" label="出走登録" sub="自分の馬をレースに出す" href="/entry" grow="1 1 130px" />
        <BigButton tone="ivory" label="ダッシュボード" sub="いつでも戻れます" href="/home" grow="1 1 130px" />
      </div>
    </div>
  );
}

/** ★条件ごとの経験の軸（★`DiscoveryRow.axis`）と見出し */
const AXIS_LABEL = { distance: '距離', surface: '馬場', condition: '馬場', strategy: '脚質' } as const;

/**
 * ★**この馬の実力**（★戦績・最近の着順・条件ごとの経験）。
 * 🔴 ★能力・素質の数値は出さない（★正典 §5.5・§12.4・D-114「強さの手がかりは オッズと戦績だけ」）。
 * ⚠️ ★経験は ★「走った回数」だけ（★得意・不得意の評価はまだ出せる値が無い・★回数から「得意」と言わない）。
 */
function AbilityPanel({ profile }: {
  readonly profile: { readonly data: TrainProfile | null; readonly error: string | null } | null;
}): React.ReactElement {
  const head = <strong style={{ fontSize: 13, color: '#ffe483' }}>この馬の実力</strong>;
  if (profile === null) return <div style={{ fontSize: 11, color: '#cfe0ee' }}>{head}　読み込み中…</div>;
  if (profile.data === null) return <div role="alert" style={{ fontSize: 11, color: '#f6ddd9' }}>{head}　読めませんでした: {profile.error}</div>;
  const p = profile.data;
  const groups = (['distance', 'surface', 'strategy'] as const).map((axis) => ({
    title: AXIS_LABEL[axis],
    rows: p.discovery.filter((d) => d.axis === axis || (axis === 'surface' && d.axis === 'condition')),
  }));
  const cell: React.CSSProperties = { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, padding: '4px 0', borderRadius: 6, background: '#061a33' };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {head}
      {/* ★戦績（★出走・1〜3 着・G1） */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4 }}>
        {([['出走', p.starts], ['1着', p.wins], ['2着', p.seconds], ['3着', p.thirds], ['G1勝', p.gradedWins]] as const).map(([k, v]) => (
          <span key={k} style={cell}>
            <span style={{ fontSize: 10, color: '#cfe0ee' }}>{k}</span>
            <span className="u-num" style={{ fontSize: 17 }}>{v}</span>
          </span>
        ))}
      </div>
      {/* ★最近の着順（★新しい順） */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <span style={{ fontSize: 11, color: '#cfe0ee' }}>最近の着順</span>
        {p.recent.length === 0
          ? <span style={{ fontSize: 12, color: '#e6eef6' }}>まだレースに出ていません</span>
          : p.recent.map((r, i) => (
            <span key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontSize: 12 }}>
              <span className="u-num" style={{ width: 44, flex: '0 0 44px', color: r.finishPos <= 3 ? '#ffe483' : '#e6eef6' }}>{r.finishPos}着</span>
              <span style={{ fontSize: 10, color: '#cfe0ee', flex: '0 0 auto' }}>／{r.fieldSize}頭</span>
              <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.raceName}</span>
            </span>
          ))}
      </div>
      {/* ★条件ごとの経験（★走った回数だけ） */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontSize: 11, color: '#cfe0ee' }}>走った経験（回数）</span>
        {groups.map((g) => (
          <div key={g.title} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 30, flex: '0 0 30px', fontSize: 10, color: '#cfe0ee' }}>{g.title}</span>
            {g.rows.map((d) => (
              <span key={`${d.axis}-${d.label}`} style={{
                fontSize: 10, padding: '2px 6px', borderRadius: 5,
                background: d.runs > 0 ? 'rgba(87,200,168,.18)' : 'rgba(251,247,236,.08)',
                border: `1px solid ${d.runs > 0 ? 'rgba(87,200,168,.6)' : 'rgba(251,247,236,.2)'}`,
                color: d.runs > 0 ? '#e6eef6' : '#9fb0bd',
              }}>{d.label} {d.runs}</span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
