'use client';

/**
 * ★調教（週送り）— 正本 design/hud-ds/components/training［アーケード］
 *   左に馬の選択（未指示が上）、右に馬カード＋8 メニュー＋指示バー。全頭指示で「週を進める」が有効。
 *   ⚠️ 今はデモデータ。指示の書き込み（spend_training_ep）と週送りはサーバー RPC に繋ぐまで押しても何も起きない。
 *   ⚠️ 疲労の遷移・注意文・警告帯の条件はサーバーが返す前提（ここでは見本の値）。画面で式を作らない。
 */
import { useEffect, useMemo, useState } from 'react';
import {
  TRAINING_AXES, TRAINING_INTENSITIES, TRAINING_AXIS_LABEL, TRAINING_INTENSITY_LABEL,
  trainingBarsOf, raceWeekMarkOf, RACE_WEEK_LABEL,
  trainingResultTierOf, TRAINING_RESULT_LABEL, GAIN_JITTER,
  trainingStreakOf, TRAINING_STREAK_WEEKS,
} from '@star/training';
import { sortStable, conditionView, DEMO_HORSES } from '../../lib/stable';
import { TRAINING_MENUS, trainingMenusOfView, DEMO_TRAINING_ABILITY, DEFAULT_TRAINING_ABILITY, demoFatigueNote } from '../../lib/game-demo';
import { Capsule, ClassChip, FatigueBar, PageTitle, Pill, StatBar } from '../../components/ui';

const WEEK_NO = 32;

/**
 * ★**狭い画面ではスマホ縦の版を出します**（★デザイナーのカード `components/training-mobile`・D12-1・2026-09-16）。
 *
 * ⚠️ ★閾値の 720px は `globals.css` の `@media (max-width: 720px)` と**同じ数**です
 *    （★`races/[id]/bet/page.tsx` と同じ作法。★片方だけ動かすと版面と操作が別の幅で切り替わります）。
 * ⚠️ ★**PC 版は今回変えません**（★カードの実装表「PC 版（/training）は今回変更しない」）。
 */
const NARROW_PX = 720;

/** ★強度ごとの見出しの重さ（★弱 → 強で背景と文字が重くなる・カードの実装表の値） */
const INTENSITY_HEAD: Readonly<Record<string, { readonly bg: string; readonly border: string; readonly color: string; readonly weight: number; readonly size: number }>> = {
  weak: { bg: 'linear-gradient(#fff,#e9eff5)', border: 'var(--a-edge-soft)', color: 'var(--a-ink-2)', weight: 700, size: 12.5 },
  mid: { bg: 'linear-gradient(#eaf3fb,#cfe0ee)', border: 'var(--a-edge)', color: 'var(--a-ink)', weight: 900, size: 13.5 },
  strong: { bg: 'linear-gradient(#ffe9e7,#ffb7b0)', border: '#a81a13', color: '#a81a13', weight: 900, size: 14.5 },
};

/** 疲労の数値色（18px は large text 扱いにならないため黄は濃い #8a5a06）: ≤30 緑／≤60 #8a5a06／>60 赤 */
function fatigueNumColor(f: number): string {
  return f <= 30 ? '#1e7a3a' : f <= 60 ? '#8a5a06' : '#a81a13';
}

function WeekPill({ kind }: { readonly kind: 'todo' | 'done' | 'rest' }): React.ReactElement {
  if (kind === 'todo') return <Pill tone="yellow">未指示</Pill>;
  if (kind === 'done') return <Pill tone="green">指示済み</Pill>;
  return <Pill tone="grey">休養中</Pill>;
}

export default function TrainingPage(): React.ReactElement {
  const horses = useMemo(() => sortStable(DEMO_HORSES), []);
  const [selectedHorse, setSelectedHorse] = useState<string | null>(horses.find((h) => h.week.kind === 'todo')?.id ?? null);
  const [selectedMenu, setSelectedMenu] = useState<string | null>('hill');
  const horse = horses.find((h) => h.id === selectedHorse) ?? null;
  const menu = TRAINING_MENUS.find((m) => m.id === selectedMenu) ?? null;
  const todo = horses.filter((h) => h.week.kind === 'todo');
  const allDone = todo.length === 0;
  /**
   * ★3 本のバー（スピード・スタミナ・コンディション）は **`@star/training` の 1 か所**が作ります（D-101・R-30）。
   * ⚠️ ★素質（`potential`）も「上限までの割合」も渡しません（正典 §5.5・§12.4）。
   */
  const bars = horse === null ? [] : trainingBarsOf(DEMO_TRAINING_ABILITY[horse.id] ?? DEFAULT_TRAINING_ABILITY, horse.condition);
  /** ★出走の前の週・後の週の導線（★週の進み方・成長式は変えない。どの週かを言うだけ） */
  /**
   * ⚠️ ★**2026-09-16 に直しました。** ★以前は `raceWeekMarkOf(nextRace === null ? null : 1, null)` と
   *    ★**次走の有無から 1 週と決め打ち**しており、★`race-week`（今週出走）と `after-race`（出走あと）が
   *    ★**構造的に出せませんでした**（★4 値のうち 2 値が死んでいた）。
   *    → ★週数を 2 つ持たせ、★判定は `@star/training` の 1 か所に任せます（★画面に条件を持たない）。
   */
  const raceMark = horse === null ? 'none' : raceWeekMarkOf(horse.weeksToNextRace, horse.weeksSinceLastRace);
  const raceMarkLabel = RACE_WEEK_LABEL[raceMark];
  /** ★印ごとの見た目（★デザイナーのカード `components/training-result` の D12-3・金／青／緑） */
  const RACE_MARK_STYLE: Readonly<Record<string, { readonly bg: string; readonly border: string; readonly color: string }>> = {
    'race-week': { bg: 'var(--a-gloss-gold)', border: '#8a5a06', color: '#4a3105' },
    'before-race': { bg: 'var(--a-gloss-blue)', border: 'var(--a-edge)', color: '#fff' },
    'after-race': { bg: 'var(--a-gloss-green)', border: '#1e7a3a', color: '#fff' },
  };
  const raceMarkStyle = RACE_MARK_STYLE[raceMark] ?? null;

  /**
   * ★**調教の結果の演出**（★D12-2・デザイナーのカード `components/training-result`）。
   *
   * ⚠️ ★**段の境目を画面に持ちません**（★`1.13` のような数字はここに書かない・D-052）。
   *    ★`@star/training` の `trainingResultTierOf` が ★**伸びの乱数から**決めます。
   * ⚠️ ★**新しい抽選を足していません**（★正典 D-101）。★見ているのは
   *    ★週送りが既に引いた値（`WeekLog.gainJitter`）です。
   * ★いまはデモの値です（★週送りの実データを画面に繋ぐのは別の便）。
   */
  /**
   * ⚠️ ★**デモの値は「境目のすぐ上」を狙いません**（★2026-09-16 に直しました）。
   *    ★最初 `1.142` などと書きましたが、★それは ★**画面が境目を知っているのと同じ**です
   *    （★境目を動かした日に、このデモだけ意味が変わります）。
   *    → ★`GAIN_JITTER` の**範囲の代表点**（上端・中央・下端）から作り、★段は純関数に決めさせます。
   */
  const DEMO_JITTERS = [
    GAIN_JITTER.max,
    (GAIN_JITTER.min + GAIN_JITTER.max) / 2,
    GAIN_JITTER.min,
  ] as const;
  const [demoJitter, setDemoJitter] = useState<number>(GAIN_JITTER.max);
  const resultTier = trainingResultTierOf(demoJitter);
  const TIER_STYLE: Readonly<Record<string, { readonly bg: string; readonly border: string; readonly color: string; readonly size: number }>> = {
    great: { bg: 'linear-gradient(#ffe9e7,#ffd0ca)', border: '#a81a13', color: '#a81a13', size: 30 },
    up: { bg: 'linear-gradient(#eefaf1,#d7f0dd)', border: '#1e7a3a', color: '#1e7a3a', size: 22 },
    normal: { bg: '#fff', border: 'var(--a-edge-soft)', color: 'var(--a-ink-2)', size: 16 },
  };
  const tierStyle = TIER_STYLE[resultTier]!;
  /**
   * ★**「2 週続けて良い仕上がりです」**（★デザイナーが **2026-09-16 に 3 週 → 2 週**へ確定）。
   *
   * ⚠️ ★**週数を画面に書きません**（★`TRAINING_STREAK_WEEKS` が唯一の出どころ・D-052）。
   *    ★3 週連続は 0.46%（約 216 週に 1 回）で、★現役 182 週では ★**1 回も出ない馬が多数**でした。
   * ⚠️ ★**煽る要素を足しません** — ★加点・積み上げ・カウントダウンは置きません（★カードの禁止事項）。
   * ★デモ: ★前の週も上振れだった列にしています（★段を切り替えるとバッジの出入りが見えます）。
   */
  const recentTiers = [resultTier, trainingResultTierOf(GAIN_JITTER.max)] as const;
  const streak = trainingStreakOf(recentTiers, TRAINING_STREAK_WEEKS);
  const note = horse === null ? null : demoFatigueNote(horse.fatigue);
  const cond = horse === null ? null : conditionView(horse.condition);
  const selectable = horses.filter((h) => h.week.kind !== 'rest');
  const canInstruct = horse !== null && menu !== null;

  /** ★狭い画面か（★`globals.css` の `@media (max-width: 720px)` と同じ数） */
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${NARROW_PX}px)`);
    const apply = (): void => { setNarrow(mq.matches); };
    apply();
    mq.addEventListener('change', apply);
    return () => { mq.removeEventListener('change', apply); };
  }, []);

  /**
   * ★**スマホ縦の版**（★デザイナーのカード `components/training-mobile`・D12-1）。
   * ⚠️ ★枠の割り当て（体・心 × 弱中強）・3 本のバー・出走前後の印は ★**`@star/training` から引きます**
   *    （★画面に表を持たない・`apps/cli/test/training-view-wiring.test.ts` が構文木で見ています）。
   */
  if (narrow) {
    return (
      <div style={{ padding: '0 0 28px' }}>
        <div className="a-band" style={{ height: 52, padding: '0 16px', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 18, fontWeight: 900, letterSpacing: '.06em' }}>調教</span>
          <span style={{ fontSize: 12, fontWeight: 900 }}>第 {WEEK_NO} 週</span>
        </div>

        {/* ★馬の選択（横スクロール・未指示は右上に赤丸） */}
        <div style={{ display: 'flex', gap: 8, padding: '12px 14px 0', overflowX: 'auto' }}>
          {horses.map((h) => {
            const sel = h.id === selectedHorse;
            const rest = h.week.kind === 'rest';
            return (
              <span
                key={h.id}
                onClick={() => { if (!rest) setSelectedHorse(h.id); }}
                style={{
                  flex: '0 0 auto', position: 'relative', display: 'flex', alignItems: 'center', minHeight: 38,
                  padding: '0 14px', borderRadius: 9, whiteSpace: 'nowrap', cursor: rest ? 'default' : 'pointer',
                  border: sel ? '2px solid #8a5a06' : '2px solid var(--a-edge-soft)',
                  backgroundImage: sel ? 'var(--a-gloss-gold)' : 'linear-gradient(#fff,#e9eff5)',
                  opacity: rest ? 0.55 : 1,
                }}
              >
                <span style={{ fontSize: 13, fontWeight: 900, color: sel ? '#4a3105' : 'var(--a-ink-2)' }}>{h.name}</span>
                {h.week.kind === 'todo' && (
                  <span style={{ position: 'absolute', right: -3, top: -3, width: 10, height: 10, borderRadius: '50%', background: '#d62f26', border: '2px solid #fff' }} />
                )}
              </span>
            );
          })}
        </div>

        {/* ★選択中の馬 */}
        {horse !== null && cond !== null && (
          <div className="a-panel" style={{ margin: '12px 14px 0', borderWidth: 3 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px 8px' }}>
              <ClassChip label={horse.classLabel} classRank={horse.classRank} h={24} font={11.5} />
              <span style={{ fontSize: 19, fontWeight: 900 }}>{horse.name}</span>
            </div>
            {/* ⚠️ ★**素質の行を取りました**（★2026-09-18・D-114 ②・T-10・AL-2） */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9, padding: '0 14px 14px' }}>
              {bars.map((b) => (b.kind === 'ability' ? (
                /* ★能力は棒（伸びるもの） */
                <div key={b.key} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ width: 64, flex: '0 0 64px', fontSize: 12.5, fontWeight: 900, color: 'var(--a-ink-2)' }}>{b.label}</span>
                  <span style={{ position: 'relative', flex: 1, height: 14, borderRadius: 7, background: '#e3ecf3', border: '2px solid var(--a-edge)', overflow: 'hidden' }}>
                    <span style={{ display: 'block', width: `${Math.max(0, Math.min(100, (b.value / b.max) * 100))}%`, height: '100%', backgroundImage: 'var(--a-gloss-blue)' }} />
                  </span>
                </div>
              ) : (
                /* ★調子は状態。★形を変えて能力と混同させない（ドット＋語） */
                <div key={b.key} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ width: 64, flex: '0 0 64px', fontSize: 12.5, fontWeight: 900, color: 'var(--a-ink-2)' }}>{b.label}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, height: 14 }}>
                    <span style={{ width: 14, height: 14, flex: '0 0 14px', borderRadius: '50%', background: cond.color, border: `2px solid ${cond.color}` }} />
                    <span style={{ fontSize: 15, fontWeight: 900, color: cond.color }}>{cond.label}</span>
                  </span>
                </div>
              )))}
            </div>
            {/*
              ★出走の前の週・後の週（★D12-3・デザイナーのカード `components/training-result`）。
              ⚠️ ★**印が無いときは「空のバッジ」を置かず、文で言います**（★不在をテキストで明示する・カードの指定）。
            */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 38, padding: '0 14px', background: 'var(--a-ivory)', borderTop: '2px solid var(--a-line)' }}>
              {raceMarkLabel !== null && raceMarkStyle !== null ? (
                <>
                  <span style={{ display: 'flex', alignItems: 'center', height: 22, padding: '0 9px', borderRadius: 6, backgroundImage: raceMarkStyle.bg, border: `1px solid ${raceMarkStyle.border}`, fontSize: 11, fontWeight: 900, color: raceMarkStyle.color }}>
                    {raceMarkLabel}
                  </span>
                  <span style={{ fontSize: 11.5, fontWeight: 900, color: 'var(--a-ink-2)' }}>
                    {raceMark === 'race-week' && horse.nextRace !== null ? `${horse.nextRace} 本日発走`
                      : raceMark === 'before-race' && horse.nextRace !== null ? `${horse.nextRace} に向けて仕上げます`
                        : '前走を終えました。疲労を抜く週です'}
                  </span>
                </>
              ) : (
                <span style={{ fontSize: 11.5, fontWeight: 900, color: 'var(--a-ink-3)' }}>今週の指示に印はありません</span>
              )}
            </div>
          </div>
        )}

        {/*
          ★**調教の結果**（★D12-2）。★週を進めた直後に出すカード。
          ⚠️ ★段は `trainingResultTierOf` が決めます（★画面に境目の数字を持たない）。
          ⚠️ ★「もう一度」「引き直す」に当たるものは置きません（★射幸性の禁止事項）。
        */}
        {horse !== null && (
          <div style={{ margin: '16px 14px 0', padding: '18px 16px', borderRadius: 14, background: tierStyle.bg, border: `3px solid ${tierStyle.border}` }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: tierStyle.size, fontWeight: 900, color: tierStyle.color, letterSpacing: '.06em' }}>
                {TRAINING_RESULT_LABEL[resultTier]}
              </span>
              {resultTier === 'great' && (
                <span style={{ fontSize: 12.5, fontWeight: 900, color: tierStyle.color, opacity: 0.85 }}>伸びの乱数が上振れしました</span>
              )}
            </div>
            {/* ★デモ: 段を切り替えて見せる（★実データに繋ぐのは別の便） */}
            <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginTop: 12 }}>
              {DEMO_JITTERS.map((j) => (
                <span
                  key={j}
                  onClick={() => { setDemoJitter(j); }}
                  style={{
                    display: 'flex', alignItems: 'center', height: 26, padding: '0 10px', borderRadius: 7, cursor: 'pointer',
                    border: j === demoJitter ? `2px solid ${tierStyle.border}` : '2px solid var(--a-edge-soft)',
                    background: '#fff', fontSize: 11, fontWeight: 900, color: 'var(--a-ink-2)',
                  }}
                >
                  {TRAINING_RESULT_LABEL[trainingResultTierOf(j)]}
                </span>
              ))}
            </div>
            {/* ★続いたときだけ、控えめに 1 行（★カードの指定） */}
            {streak && (
              <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 10, background: '#fff8ea', border: '1.5px solid #d9b25a' }}>
                <span style={{ fontSize: 12.5, fontWeight: 900, color: '#8a5a06' }}>
                  {TRAINING_STREAK_WEEKS}週続けて良い仕上がりです
                </span>
              </div>
            )}
          </div>
        )}

        {/* ★6 枡（体・心 × 弱中強）。★割り当ては @star/training の写像から */}
        {TRAINING_AXES.map((axis) => (
          <div key={axis} style={{ padding: '16px 14px 0' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
              <span className={axis === 'mind' ? 'a-band a-band-red' : 'a-band'} style={{ height: 30, padding: '0 12px', borderRadius: 8, fontSize: 14, fontWeight: 900 }}>
                {TRAINING_AXIS_LABEL[axis]}
              </span>
              <span style={{ fontSize: 11.5, fontWeight: 900, color: 'var(--a-ink-2)' }}>
                {axis === 'body' ? '力を作る調教' : '状態を整える調教'}
              </span>
            </div>
            {/* ★体の「中」だけ 3 枚なので、その列を広く取る */}
            <div style={{ display: 'grid', gridTemplateColumns: axis === 'body' ? '1fr 1.4fr 1fr' : '1fr 1fr 1fr', gap: 8 }}>
              {TRAINING_INTENSITIES.map((intensity) => {
                const head = INTENSITY_HEAD[intensity]!;
                return (
                  <div key={intensity} style={{ display: 'flex', flexDirection: 'column', borderRadius: 9, overflow: 'hidden', background: '#f4f9fd', border: '2px solid var(--a-edge)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 24, backgroundImage: head.bg, borderBottom: `2px solid ${head.border}` }}>
                      <span style={{ fontSize: head.size, fontWeight: head.weight, color: head.color, letterSpacing: '.08em' }}>
                        {TRAINING_INTENSITY_LABEL[intensity]}
                      </span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 8, flex: 1 }}>
                      {trainingMenusOfView(axis, intensity).map((m) => {
                        const sel = m.id === selectedMenu;
                        const warn = m.banner !== undefined;
                        return (
                          <div
                            key={m.id}
                            onClick={() => setSelectedMenu(m.id)}
                            style={{
                              position: 'relative', display: 'flex', flexDirection: 'column', gap: 3, padding: '9px 10px',
                              borderRadius: 9, background: '#fff', cursor: 'pointer', minHeight: 38,
                              border: sel ? '3px solid #8a5a06' : '2px solid var(--a-edge)', boxShadow: 'var(--a-shadow-sm)',
                            }}
                          >
                            {warn && (
                              <span style={{ position: 'absolute', right: 8, top: 8, display: 'flex', alignItems: 'center', height: 18, padding: '0 7px', borderRadius: 5, backgroundImage: 'linear-gradient(#ffe270,#f6c21c 52%,#d99f06)', border: '1px solid #a9741a', fontSize: 9.5, fontWeight: 900, color: '#4a3105' }}>
                                注意
                              </span>
                            )}
                            <span style={{ fontSize: 14, fontWeight: 900 }}>{m.name}</span>
                            <span style={{ fontSize: 11, fontWeight: 900, color: 'var(--a-green-d)' }}>{m.main}</span>
                            <span style={{ fontSize: 10.5, fontWeight: 900, color: m.fatigueDelta < 0 ? 'var(--a-green-d)' : '#8a5a06' }}>
                              疲労 {m.fatigueDelta > 0 ? `+${m.fatigueDelta}` : `−${Math.abs(m.fatigueDelta)}`}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {/* ★指示バー（★画面の下端に常時） */}
        <div style={{ position: 'sticky', bottom: 0, marginTop: 18, padding: '12px 14px', background: 'var(--a-panel)', borderTop: '3px solid var(--a-edge)', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {horse !== null && menu !== null ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 13.5, fontWeight: 900 }}>{menu.name}　を指示</span>
                <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 900, color: 'var(--a-ink-2)' }}>
                  疲労 <span className="a-num" style={{ fontSize: 15, color: fatigueNumColor(horse.fatigue) }}>{horse.fatigue}→{Math.max(0, horse.fatigue + menu.fatigueDelta)}</span>
                </span>
              </div>
              <span className="a-btn a-btn-gold" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', minHeight: 50, fontSize: 16 }} title="サーバー接続まで押せません">
                この馬に指示する（{menu.ep} EP）
              </span>
            </>
          ) : (
            <span style={{ fontSize: 13.5, fontWeight: 900, color: 'var(--a-ink-2)' }}>馬とメニューを選んでください</span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '22px 0 40px' }}>
      <PageTitle
        title="調教"
        sub="1 週に 1 回、各馬にメニューを指示します"
        right={(
          <span style={{ display: 'inline-flex', gap: 10 }}>
            <Capsule label="週" value={String(WEEK_NO)} />
            <Capsule label="未指示" value={String(todo.length)} color={todo.length > 0 ? 'var(--a-num-rank)' : 'var(--a-ink)'} />
          </span>
        )}
      />
      <p style={{ margin: '8px 0 0', fontSize: 12, fontWeight: 900, color: 'var(--a-ink-3)' }}>※ デモデータ（指示の保存と週送りはサーバー RPC に接続するまで動きません）</p>

      <div style={{ display: 'flex', gap: 16, marginTop: 14, alignItems: 'flex-start' }}>
        {/* 左: 馬の選択 */}
        <div className="a-panel strong" style={{ width: 290, flex: '0 0 290px' }}>
          <div className="a-band" style={{ height: 38, padding: '0 14px', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 15, fontWeight: 900, letterSpacing: '.1em' }}>馬を選ぶ</span>
            <span style={{ fontSize: 12, fontWeight: 900 }}>{horses.length} 頭</span>
          </div>
          {horses.map((h) => {
            const sel = h.id === selectedHorse;
            const rest = h.week.kind === 'rest';
            return (
              <div key={h.id} onClick={() => { if (!rest) setSelectedHorse(h.id); }} style={{
                display: 'flex', flexDirection: 'column', gap: 6, padding: '12px 14px', borderTop: '1px solid var(--a-line)', cursor: rest ? 'default' : 'pointer',
                background: sel ? 'linear-gradient(#fffdf2,#fff3cf)' : rest ? '#e7edf3' : '#fff', boxShadow: sel ? 'inset 5px 0 0 #f2b012' : undefined,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 16, fontWeight: 900 }}>{h.name}</span>
                  <span style={{ marginLeft: 'auto' }}><WeekPill kind={h.week.kind} /></span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <ClassChip label={h.classLabel} classRank={h.classRank} />
                  <span style={{ marginLeft: 'auto' }}><FatigueBar value={h.fatigue} width={60} color={fatigueNumColor(h.fatigue)} /></span>
                </div>
                {h.week.kind === 'done' && <div style={{ fontSize: 12, fontWeight: 900, color: 'var(--a-ink-3)' }}>今週 {h.week.menu}</div>}
              </div>
            );
          })}
          {selectable.length === 0 && <p style={{ margin: 0, padding: 14, borderTop: '1px solid var(--a-line)', fontSize: 14, fontWeight: 900, color: 'var(--a-ink-2)' }}>指示できる馬がいません</p>}
        </div>

        {/* 右 */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="a-panel strong">
            <div className="a-band" style={{ height: 38, padding: '0 16px', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 15, fontWeight: 900, letterSpacing: '.1em' }}>選択中の馬</span>
              <span style={{ fontSize: 12, fontWeight: 900 }}>現在値は素質による上限まで伸びます</span>
            </div>
            {horse !== null && cond !== null ? (
              <div style={{ display: 'flex', gap: 22, padding: '16px 20px', backgroundImage: 'linear-gradient(#ffffff,#eef6fd)', flexWrap: 'wrap' }}>
                <div style={{ width: 280, flex: '0 0 280px' }}>
                  <div className="tr-horse-heading" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <ClassChip label={horse.classLabel} classRank={horse.classRank} h={28} font={14} />
                    <span style={{ fontSize: 26, fontWeight: 900 }}>{horse.name}</span>
                    {/*
                      ★出走の前の週・後の週を強調する（D-101・D12-3）。
                      ⚠️ ★**2026-09-16 に直しました。** ★以前は `tone="gold"` 固定で、
                         ★**どの印でも金**でした（★4 値を足した今は、スマホ版と見え方が割れます）。
                         ★印ごとの色はスマホ版と同じ 1 か所（`RACE_MARK_STYLE`）から引きます。
                    */}
                    {raceMarkLabel !== null && raceMarkStyle !== null && (
                      <span style={{ display: 'flex', alignItems: 'center', height: 26, padding: '0 11px', borderRadius: 7, backgroundImage: raceMarkStyle.bg, border: `2px solid ${raceMarkStyle.border}`, fontSize: 12.5, fontWeight: 900, color: raceMarkStyle.color }}>
                        {raceMarkLabel}
                      </span>
                    )}
                  </div>
                  {horse.nextRace !== null && (
                    <div style={{ marginTop: 8, fontSize: 12, fontWeight: 900, color: 'var(--a-ink-2)' }}>次走 {horse.nextRace}</div>
                  )}
                  {/* ⚠️ ★**素質の行を取りました**（★2026-09-18・D-114 ②・T-10・AL-2） */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 10 }}>
                    <span className="a-lbl">調子</span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 900, color: cond.color }}><span style={{ fontSize: 17 }}>{cond.mark}</span>{cond.label}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 10 }}><span className="a-lbl">疲労</span><FatigueBar value={horse.fatigue} width={118} color={fatigueNumColor(horse.fatigue)} /></div>
                  {note !== null && (
                    <div style={{ marginTop: 10, padding: '8px 10px', borderRadius: 8, background: '#fff6d6', border: '2px solid #e6c979', fontSize: 12, fontWeight: 900, color: '#8a5a06', lineHeight: 1.6 }}>{note}</div>
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 280, borderLeft: '2px solid var(--a-line)', paddingLeft: 20 }}>
                  {/* ★能力（伸ばすもの）。★素質の数値・上限までの割合は出さない（§5.5・§12.4） */}
                  {bars.filter((b) => b.kind === 'ability').map((b) => (
                    <StatBar key={b.key} label={b.label} value={b.value} cap={b.max} />
                  ))}
                  {/* ★コンディションは能力ではなく状態。同じ物差しに並べない */}
                  {bars.filter((b) => b.kind === 'state').map((b) => (
                    <div key={b.key} style={{ display: 'flex', alignItems: 'center', gap: 12, height: 34 }}>
                      <span className="a-lbl" style={{ width: 96 }}>{b.label}</span>
                      <span style={{ display: 'inline-flex', gap: 4 }}>
                        {Array.from({ length: b.max }, (_, i) => (
                          <span key={i} style={{
                            width: 16, height: 14, borderRadius: 4, border: '2px solid var(--a-edge)',
                            backgroundImage: i < b.value ? 'var(--a-gloss-green)' : 'linear-gradient(#fff,#e6edf4)',
                          }} />
                        ))}
                      </span>
                      {cond !== null && (
                        <span style={{ fontSize: 13, fontWeight: 900, color: cond.color }}>{cond.mark} {cond.label}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div style={{ padding: '18px 22px', backgroundImage: 'linear-gradient(#ffffff,#eef6fd)', fontSize: 14, fontWeight: 900, color: 'var(--a-ink-2)' }}>指示できる馬がいません</div>
            )}
          </div>

          {/* ★メニュー: 体・心 × 強度（D-101）。★枠の割り当ては @star/training の写像 1 か所から引く */}
          {TRAINING_AXES.map((axis) => (
          <div key={axis} className="a-panel" style={{ marginTop: 14 }}>
            <div className="a-band" style={{ height: 34, padding: '0 14px', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 15, fontWeight: 900, letterSpacing: '.1em' }}>{TRAINING_AXIS_LABEL[axis]}を鍛える</span>
              <span style={{ fontSize: 12, fontWeight: 900 }}>弱 → 強</span>
            </div>
            <div style={{ display: 'flex', gap: 12, padding: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
              {TRAINING_INTENSITIES.map((intensity) => (
                <div key={intensity} style={{ flex: '1 1 250px', minWidth: 250 }}>
                  <div style={{ marginBottom: 8 }}>
                    <Pill tone={intensity === 'strong' ? 'red' : intensity === 'mid' ? 'yellow' : 'grey'}>
                      {TRAINING_INTENSITY_LABEL[intensity]}
                    </Pill>
                  </div>
                  <div style={{ display: 'grid', gap: 10 }}>
            {trainingMenusOfView(axis, intensity).map((m) => {
              const sel = m.id === selectedMenu;
              const fatColor = m.fatigueDelta < 0 ? 'var(--a-green-d)' : m.fatigueDelta >= 20 ? '#a9741a' : 'var(--a-ink)';
              const showBanner = m.banner !== undefined && (m.banner.kind === 'bad' || (horse !== null && horse.fatigue > 50));
              const bandClass = sel ? 'a-band a-band-gold' : m.banner?.kind === 'bad' ? 'a-band a-band-red' : 'a-band';
              const bandStyle: React.CSSProperties = !sel && m.banner?.kind === 'warn' ? { backgroundImage: 'var(--a-gloss-yellow)', color: '#4a3105' } : {};
              return (
                <div key={m.id} onClick={() => setSelectedMenu(m.id)} style={{
                  display: 'flex', flexDirection: 'column', cursor: 'pointer', borderRadius: 10, overflow: 'hidden', background: '#fff',
                  border: sel ? '3px solid #8a5a06' : '2px solid var(--a-edge)', boxShadow: 'var(--a-shadow-sm)',
                }}>
                  <div className={bandClass} style={{ height: 34, padding: '0 12px', justifyContent: 'space-between', ...bandStyle }}>
                    <span style={{ fontSize: 16, fontWeight: 900 }}>{m.name}</span>
                    {sel && <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: '.1em' }}>選択中</span>}
                  </div>
                  {showBanner && m.banner !== undefined && (
                    <div style={{ display: 'flex', alignItems: 'center', height: 24, padding: '0 12px', background: m.banner.kind === 'bad' ? '#ffe6e4' : '#fff6d6', borderBottom: `1px solid ${m.banner.kind === 'bad' ? '#e8a9a4' : '#e6c979'}` }}>
                      <span style={{ fontSize: 11, fontWeight: 900, color: m.banner.kind === 'bad' ? 'var(--a-red-d)' : '#8a5a06' }}>{m.banner.text}</span>
                    </div>
                  )}
                  <div style={{ padding: '10px 12px 12px' }}>
                    <div style={{ fontSize: 13, fontWeight: 900, color: 'var(--a-green-d)', minHeight: 19 }}>{m.main}</div>
                    <div style={{ fontSize: 12, fontWeight: 900, color: m.sub === '—' ? 'var(--a-ink-3)' : 'var(--a-blue-d)', marginTop: 4 }}>副効果 {m.sub}</div>
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--a-line)' }}>
                      <span><span className="a-lbl" style={{ display: 'block', fontSize: 11 }}>疲労</span><span className="a-num" style={{ fontSize: 28, color: fatColor }}>{m.fatigueDelta > 0 ? `+${m.fatigueDelta}` : `−${Math.abs(m.fatigueDelta)}`}</span></span>
                      <span style={{ marginLeft: 'auto', textAlign: 'right' }}><span className="a-lbl" style={{ display: 'block', fontSize: 11 }}>消費</span><span className="a-num" style={{ fontSize: 28, color: 'var(--a-num-money)' }}>{m.ep}</span> <span style={{ fontSize: 11, fontWeight: 900, color: 'var(--a-ink-2)' }}>EP</span></span>
                    </div>
                  </div>
                </div>
              );
            })}
                  </div>
                </div>
              ))}
            </div>
          </div>
          ))}

          {/* 指示バー */}
          <div className="a-panel" style={{ marginTop: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 24, padding: '14px 18px', backgroundImage: 'linear-gradient(#ffffff,#eef6fd)', flexWrap: 'wrap' }}>
              {horse !== null && menu !== null ? (
                <>
                  <div style={{ flex: '0 0 auto' }}><span className="a-lbl" style={{ display: 'block' }}>指示の内容</span><span style={{ fontSize: 19, fontWeight: 900, whiteSpace: 'nowrap' }}>{horse.name}　—　{menu.name}</span></div>
                  <div style={{ display: 'flex', gap: 22, fontSize: 13, fontWeight: 900, color: 'var(--a-ink-2)', whiteSpace: 'nowrap' }}>
                    <span>疲労 <span className="a-num" style={{ fontSize: 22, color: '#a9741a' }}>{horse.fatigue} → {Math.max(0, horse.fatigue + menu.fatigueDelta)}</span></span>
                    <span>消費 <span className="a-num" style={{ fontSize: 22, color: 'var(--a-num-money)' }}>{menu.ep}</span> EP</span>
                  </div>
                </>
              ) : (
                <span style={{ fontSize: 14, fontWeight: 900, color: 'var(--a-ink-2)' }}>馬とメニューを選んでください</span>
              )}
              <div style={{ display: 'flex', gap: 10, marginLeft: 'auto' }}>
                <span className={canInstruct ? 'a-btn a-btn-gold' : 'a-btn a-btn-gold off'} style={{ height: 48, padding: '0 22px', fontSize: 17, whiteSpace: 'nowrap' }} title="サーバー接続まで押せません">
                  {horse?.week.kind === 'done' ? '指示を変更する' : 'この馬に指示する'}{menu !== null ? `（${menu.ep} EP）` : ''}
                </span>
                <span className={allDone ? 'a-btn' : 'a-btn off'} style={{ height: 48, padding: '0 18px', fontSize: 15, whiteSpace: 'nowrap' }} title={allDone ? 'サーバー接続まで押せません' : '全頭に指示すると押せます'}>週を進める</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
