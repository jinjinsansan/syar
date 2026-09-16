'use client';

/**
 * ★**馬詳細（履歴書型・スマホ縦）**（★D13-2・2026-09-16・デザイナーのカード `components/horse-resume`）
 *
 * 【★この画面が守る約束】
 *   §5.5・§12.4 ★**素質の数値も「上限までの割合」も出さない**（★出せるのは★と段だけ）
 *   D-108 ★**発見度は段だけ**（★段を決めるのは `discoveryStageOf`。★画面に刻みを持たない）
 *   D-109 ★**どの個性が付くかを画面が決めない**（★`innateTraitsOf` / `learnedTraitsOf` が導く）
 *   D-105 ★**騎手に強さの差を匂わせない**（★勝率・得意距離を出さない。★親密度の言葉は騎手の画面と同じ関数）
 *   §18 LR-4 ★**物語の文は `storyLinesOf` が組み立てる**（★画面はそのまま出すだけ）
 *
 * ⚠️ ★**個性は「いまは着順に影響しません」と毎回言います**（★`TRAIT_EFFECT` が 0 の便・カードの指定）。
 * ⚠️ ★**「強い」「有利」と読める語を使いません**（★正典どおり）。
 */

import { useState } from 'react';
import { storyLinesOf, STORY_EVENT_LABEL } from '@star/training';
import {
  discoveryStageOf, discoveryLabelOf,
  innateTraitsOf, learnedTraitsOf, careerInputOf, TRAIT_LABEL,
} from '@star/sim-engine';
import { JOCKEYS, jockeyBondAfterRides } from '@star/scheduler';
import { bondLabel } from './jockey-picker';
import { ClassChip, Stars } from './ui';
import { conditionView, fatigueColor, type HorseDetail } from '../lib/stable';
import { DEMO_DISCOVERY } from '../lib/horse-story-demo';
import {
  DEMO_INNATE_INPUT, DEMO_CAREER_RUNS, DEMO_TOP_JOCKEY, DEMO_PEAK_BAND_LABEL,
  DEMO_OFFSPRING, OFFSPRING_GENERATION_LABEL, DEMO_RESUME_STORY, RESUME_TABS, RESUME_STORY_PREVIEW,
} from '../lib/horse-resume-demo';

/** ★発見度の 4 段（★並びは `@star/sim-engine` の `DISCOVERY_STAGES` と同じ。★刻みは持たない） */
const STAGES = ['unknown', 'hint', 'narrow', 'known'] as const;
const STAGE_TONE: readonly string[] = ['#8a95a3', '#6b3fc4', '#1a6fd4', '#1e7a3a'];

export function HorseResume({ horse }: { readonly horse: HorseDetail }): React.ReactElement {
  const [tab, setTab] = useState(RESUME_TABS[0]!.key);
  const cond = conditionView(horse.condition);
  /**
   * ★**個性は導かれます**（★D-109）。
   * ⚠️ ★**「繊細」「大舞台経験」と画面に書きません** — ★境目を動かした日に画面だけ古くなります。
   */
  const innate = innateTraitsOf(DEMO_INNATE_INPUT);
  const learned = learnedTraitsOf(careerInputOf(DEMO_CAREER_RUNS));
  /** ★主戦騎手（★名簿は `@star/scheduler` が正・★名前を画面に書かない） */
  const topJockey = JOCKEYS.find((j) => j.id === DEMO_TOP_JOCKEY.id) ?? null;
  const bond = jockeyBondAfterRides(DEMO_TOP_JOCKEY.rides);
  /** ★物語の文も種類も週も `@star/training` から（★画面で組み立てない・LR-4） */
  const storyLines = storyLinesOf(DEMO_RESUME_STORY[horse.id] ?? []);
  const storyPreview = storyLines.slice(-RESUME_STORY_PREVIEW);
  const generations = DEMO_OFFSPRING[horse.id] ?? [];

  return (
    <div style={{ padding: '0 0 28px' }}>
      <div className="a-band" style={{ height: 52, padding: '0 16px' }}>
        <span style={{ fontSize: 17, fontWeight: 900, letterSpacing: '.04em' }}>馬詳細</span>
      </div>

      {/* ★表紙: 格・馬名・★・いまの状態・生涯のピーク */}
      <div className="a-panel" style={{ margin: '14px 14px 0', borderWidth: 3 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 14px 8px', flexWrap: 'wrap' }}>
          <ClassChip label={horse.classLabel} classRank={horse.classRank} h={24} font={11.5} />
          <span style={{ fontSize: 20, fontWeight: 900 }}>{horse.name}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px 12px' }}>
          {/* ★素質は★だけ（★数値も上限までの割合も出さない） */}
          <span className="a-lbl" style={{ fontSize: 11 }}>素質</span>
          <Stars value={horse.stars} size={17} />
          <span style={{ fontSize: 10.5, fontWeight: 900, color: 'var(--a-ink-3)', marginLeft: 6 }}>{horse.sexAge}・{horse.coat}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '0 14px 12px', fontSize: 12, fontWeight: 900, color: 'var(--a-ink-2)' }}>
          <span>調子 <span style={{ color: cond.color }}>{cond.mark} {cond.label}</span></span>
          <span>疲労 <span className="a-num" style={{ fontSize: 15, color: fatigueColor(horse.fatigue) }}>{horse.fatigue}</span></span>
        </div>
        {/* ★ピークは帯の名前で（★数値の絶対値は出さない） */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 36, padding: '8px 14px', background: 'var(--a-ivory)', borderTop: '2px solid var(--a-line)' }}>
          <span style={{ fontSize: 11, fontWeight: 900, color: 'var(--a-ink-2)' }}>生涯のピーク　{DEMO_PEAK_BAND_LABEL}帯</span>
        </div>
      </div>

      {/* ★判明した能力（★段だけ・D-108） */}
      <div style={{ padding: '18px 14px 0' }}>
        <div style={{ fontSize: 14, fontWeight: 900, marginBottom: 8 }}>判明した能力</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '12px 14px', borderRadius: 12, background: '#fff', border: '1.5px solid var(--a-line)' }}>
          {DEMO_DISCOVERY.map((d) => {
            /** ★段は回数から `@star/sim-engine` が決めます（★画面で決めない） */
            const stage = discoveryStageOf(d.runs);
            const reached = STAGES.indexOf(stage);
            const tone = STAGE_TONE[reached] ?? STAGE_TONE[0]!;
            return (
              <div key={d.label} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 12, fontWeight: 900, color: 'var(--a-ink-2)' }}>{d.label}</span>
                  <span style={{ fontSize: 11, fontWeight: 900, color: tone }}>{discoveryLabelOf(stage, '評価: A')}</span>
                </div>
                <div style={{ display: 'flex', gap: 3 }}>
                  {STAGES.map((s, i) => (
                    <div key={s} style={{ flex: 1, height: 7, borderRadius: 4, background: i <= reached ? tone : '#e3ecf3', border: `1.5px solid ${i <= reached ? tone : 'var(--a-edge-soft)'}` }} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ★個性（★先天は灰・後天はシアン。★着順に効かないことを毎回言う） */}
      <div style={{ padding: '18px 14px 0' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 14, fontWeight: 900 }}>個性</span>
          <span style={{ fontSize: 10.5, fontWeight: 900, color: 'var(--a-ink-3)' }}>いまは着順に影響しません</span>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {innate.map((t) => (
            <span key={t} style={{ display: 'flex', alignItems: 'center', height: 26, padding: '0 11px', borderRadius: 7, background: '#eef2f6', border: '1.5px solid var(--a-edge-soft)', fontSize: 12, fontWeight: 900, color: 'var(--a-ink-2)' }}>
              {TRAIT_LABEL[t]}
            </span>
          ))}
          {learned.map((t) => (
            <span key={t} style={{ display: 'flex', alignItems: 'center', height: 26, padding: '0 11px', borderRadius: 7, background: '#eaf3fb', border: '1.5px solid #9fc0dc', fontSize: 12, fontWeight: 900, color: 'var(--a-edge)' }}>
              {TRAIT_LABEL[t]}
            </span>
          ))}
          {innate.length + learned.length === 0 && (
            <span style={{ fontSize: 11.5, fontWeight: 900, color: 'var(--a-ink-3)' }}>まだ分かっている個性はありません</span>
          )}
        </div>
      </div>

      {/* ★主戦騎手（★肖像・名前・コンビ経験だけ） */}
      {topJockey !== null && (
        <div style={{ padding: '16px 14px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 13px', borderRadius: 11, background: '#fff', border: '1.5px solid var(--a-line)' }}>
            {/* ★抽象の人影だけ（★実在の顔を想起させない・§0.1） */}
            <div style={{ width: 44, height: 44, flex: '0 0 44px', borderRadius: '50%', background: 'linear-gradient(160deg,#1e5aa822,#1e5aa855)', border: '2px solid var(--a-edge-soft)' }} />
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span style={{ fontSize: 13.5, fontWeight: 900 }}>主戦騎手　{topJockey.name}</span>
              {/* ★言葉は騎手の画面と同じ関数（★ここで組み直さない） */}
              <span style={{ fontSize: 10.5, fontWeight: 900, color: 'var(--a-ink-3)' }}>コンビ経験　{bondLabel(bond)}</span>
            </div>
          </div>
        </div>
      )}

      <div style={{ height: 1, background: 'var(--a-line)', margin: '22px 14px 0' }} />

      {/* ★4 タブ（★選択中は青グロス・下辺を白にして板と繋ぐ） */}
      <div style={{ marginTop: 22 }}>
        <div style={{ display: 'flex', gap: 6, padding: '0 16px' }}>
          {RESUME_TABS.map((t) => {
            const sel = t.key === tab;
            return (
              <span
                key={t.key}
                onClick={() => { setTab(t.key); }}
                style={{
                  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 40, cursor: 'pointer',
                  borderRadius: '9px 9px 0 0', fontSize: 12.5, fontWeight: 900,
                  border: sel ? '2px solid var(--a-edge)' : '2px solid var(--a-edge-soft)',
                  borderBottom: sel ? '2px solid #fff' : '2px solid var(--a-edge-soft)',
                  backgroundImage: sel ? 'var(--a-gloss-blue)' : 'linear-gradient(#fff,#eef3f8)',
                  color: sel ? '#fff' : 'var(--a-ink-2)',
                }}
              >
                {t.label}
              </span>
            );
          })}
        </div>

        <div style={{ padding: '16px 16px 0' }}>
          {/* ★競走成績（★1 着だけ大きく赤・PC 版の戦績表と同じ規則） */}
          {tab === 'races' && (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {horse.races.map((r, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 0', borderTop: '1px solid var(--a-line)' }}>
                  <span className="a-num" style={{ width: 40, flex: '0 0 40px', fontSize: 12.5, color: 'var(--a-ink-3)' }}>{r.week}週</span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 900, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.race}</span>
                  <span className="a-num" style={{ width: 30, flex: '0 0 30px', textAlign: 'center', fontSize: r.place === 1 ? 22 : 17, color: r.place === 1 ? 'var(--a-num-rank)' : 'var(--a-ink)' }}>{r.place}</span>
                  <span className="a-num" style={{ width: 62, flex: '0 0 62px', textAlign: 'right', fontSize: 15, color: 'var(--a-ink-2)' }}>{r.time}</span>
                </div>
              ))}
              {horse.races.length === 0 && (
                <span style={{ fontSize: 12, fontWeight: 900, color: 'var(--a-ink-3)' }}>まだ出走していません</span>
              )}
            </div>
          )}

          {/* ★血統（★5 代の表は横に広いので PC 版で。★モバイル版の血統表は次のカード待ち） */}
          {tab === 'pedigree' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 14px', borderRadius: 12, background: '#fff', border: '1.5px solid var(--a-line)' }}>
              <span style={{ fontSize: 12.5, fontWeight: 900, color: 'var(--a-ink-2)', lineHeight: 1.7 }}>
                5 代の血統表は横に広いので、広い画面で開くと表で見られます。
              </span>
              {horse.inbreedCoeff !== null && (
                <span style={{ fontSize: 11.5, fontWeight: 900, color: 'var(--a-ink-3)' }}>
                  インブリード係数 <span className="a-num" style={{ fontSize: 15 }}>{(horse.inbreedCoeff * 100).toFixed(2)}</span>%
                </span>
              )}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {horse.crosses.map((c) => (
                  <span key={c.name} style={{ display: 'flex', alignItems: 'center', height: 24, padding: '0 10px', borderRadius: 6, background: '#eef2f6', border: '1.5px solid var(--a-edge-soft)', fontSize: 11.5, fontWeight: 900, color: 'var(--a-ink-2)' }}>
                    {c.name} {c.label}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* ★物語（★D13-1 と同じ型の行を、直近だけ抜粋） */}
          {tab === 'story' && (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {storyPreview.map((l, i) => (
                <div key={`${l.type}-${l.week}-${i}`} style={{ display: 'flex', gap: 12, padding: '12px 0', borderTop: '1px solid var(--a-line)' }}>
                  <span className="a-num" style={{ width: 40, flex: '0 0 40px', fontSize: 12.5, color: 'var(--a-ink-3)' }}>{l.week}週</span>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ display: 'inline-flex', alignSelf: 'flex-start', alignItems: 'center', height: 20, padding: '0 8px', borderRadius: 6, background: '#eef2f6', border: '1.5px solid var(--a-edge-soft)', fontSize: 10, fontWeight: 900, color: 'var(--a-ink-2)' }}>
                      {STORY_EVENT_LABEL[l.type]}
                    </span>
                    {/* ★文はそのまま出すだけ（★画面で組み立てない・LR-4） */}
                    <span style={{ fontSize: 12.5, fontWeight: 900, lineHeight: 1.6 }}>{l.text}</span>
                  </div>
                </div>
              ))}
              {storyLines.length === 0 ? (
                <span style={{ fontSize: 12, fontWeight: 900, color: 'var(--a-ink-3)' }}>まだ出来事がありません</span>
              ) : (
                <a href="/stable/retired" style={{ textAlign: 'center', padding: '10px 0', fontSize: 11, fontWeight: 900, color: 'var(--a-blue-d)' }}>
                  物語帳をすべて見る（{storyLines.length}件）
                </a>
              )}
            </div>
          )}

          {/* ★子孫（★2 代まで。★いない世代は 1 行だけ） */}
          {tab === 'offspring' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: 14, borderRadius: 12, background: '#fff', border: '1.5px solid var(--a-line)' }}>
              {OFFSPRING_GENERATION_LABEL.map((label, gi) => {
                const list = generations[gi] ?? [];
                return (
                  <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <span style={{ fontSize: 11, fontWeight: 900, color: 'var(--a-ink-3)' }}>{label}</span>
                    {list.length === 0 ? (
                      /* ★空のグリッドや 0 件のしるしは置かない（★1 行で言う・カードの指定） */
                      <span style={{ fontSize: 12.5, fontWeight: 900, color: 'var(--a-ink-3)' }}>まだいません</span>
                    ) : list.map((o) => (
                      <div key={o.name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 11px', borderRadius: 9, background: '#fff', border: '1.5px solid var(--a-line)' }}>
                        <span style={{ fontSize: 13, fontWeight: 900, flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.name}</span>
                        <span style={{ fontSize: 11, fontWeight: 900, color: 'var(--a-ink-3)' }}>{o.note}</span>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
