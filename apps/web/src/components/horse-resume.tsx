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
import { discoveryStageOf, discoveryLabelOf } from '@star/sim-engine';
import { ClassChip } from './ui';
import { conditionView, fatigueColor, type HorseDetail } from '../lib/stable';
import type { DiscoveryRow } from '../lib/discovery-screen';
import { RESUME_TABS } from '../lib/horse-resume-demo';

/**
 * 🔴 ★**見本で埋めない**（★2026-09-27・裁定 `REVIEW_UI_AUDIT_20260927.md` P0-B）。
 *   ★この部品は ★スマホ幅（`show-narrow`・900px 以下）でだけ出るので、★PC で見ていると ★気づけません。
 *   ★それまで ★**自分の馬の画面に**、★見本の個性（`DEMO_INNATE_INPUT` / `DEMO_CAREER_RUNS`）・★主戦騎手（`DEMO_TOP_JOCKEY`）・
 *   ★生涯のピーク（`DEMO_PEAK_BAND_LABEL`）・★物語（`DEMO_RESUME_STORY`）・★産駒（`DEMO_OFFSPRING`）を ★条件なしで出していました。
 *   → ★`HorseDetail` に ★実データが在る欄だけ出します（★表紙・分かってきたこと・戦績・血統）。★渡せない欄は ★出しません。
 *   ★網 `apps/cli/test/no-demo-in-user-screens.test.ts`（★利用者の画面が `DEMO_*` を読まない）。
 */
/** ★実データが在るタブだけ（★物語・産駒は `HorseDetail` に無いので出さない） */
const REAL_TABS = RESUME_TABS.filter((t) => t.key === 'races' || t.key === 'pedigree');

/** ★発見度の 4 段（★並びは `@star/sim-engine` の `DISCOVERY_STAGES` と同じ。★刻みは持たない） */
const STAGES = ['unknown', 'hint', 'narrow', 'known'] as const;
const STAGE_TONE: readonly string[] = ['#8a95a3', '#6b3fc4', '#1a6fd4', '#1e7a3a'];

/**
 * 🔴 ★**発見の行は、呼ぶ側から渡します**（★2026-09-25・裁定 `REVIEW_DISCOVERY_AXES_20260925.md`）
 *
 * ⚠️ ★それまで ★`DEMO_DISCOVERY` を直に読んでいました。★中身は ★**能力 4 つ**で、
 *    ★正典 **D-116**（「発見＝距離・馬場・脚質・気性」）と ★**軸が違っていました**。
 * ★本物は `lib/discovery-screen.ts`（★`my_horse_discovery_runs`・`0084`）です。
 * ⚠️ ★渡されなければ ★**節そのものを出しません**（★間違った軸の見本を出し続けない）。
 */
export function HorseResume(
  { horse, discovery }: { readonly horse: HorseDetail; readonly discovery?: readonly DiscoveryRow[] },
): React.ReactElement {
  const [tab, setTab] = useState(REAL_TABS[0]!.key);
  const cond = conditionView(horse.condition);

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
          {/* ⚠️ ★**素質の★を取りました**（★2026-09-18・D-114 ②・T-10・AL-2） */}
          <span style={{ fontSize: 10.5, fontWeight: 900, color: 'var(--a-ink-3)', marginLeft: 6 }}>{horse.sexAge}・{horse.coat}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '0 14px 12px', fontSize: 12, fontWeight: 900, color: 'var(--a-ink-2)' }}>
          <span>調子 <span style={{ color: cond.color }}>{cond.mark} {cond.label}</span></span>
          <span>疲労 <span className="a-num" style={{ fontSize: 15, color: fatigueColor(horse.fatigue) }}>{horse.fatigue}</span></span>
        </div>
        {/* 🔴 ★生涯のピーク帯は ★出しません（★`HorseDetail` に無い・★見本で埋めない・P0-B） */}
      </div>

      {/* ★分かってきたこと（★段だけ・D-108・軸は D-116） */}
      {discovery !== undefined && discovery.length > 0 && (
      <div style={{ padding: '18px 14px 0' }}>
        <div style={{ fontSize: 14, fontWeight: 900, marginBottom: 8 }}>分かってきたこと</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '12px 14px', borderRadius: 12, background: '#fff', border: '1.5px solid var(--a-line)' }}>
          {discovery.map((d) => {
            /** ★段は回数から `@star/sim-engine` が決めます（★画面で決めない） */
            const stage = discoveryStageOf(d.runs);
            const reached = STAGES.indexOf(stage);
            const tone = STAGE_TONE[reached] ?? STAGE_TONE[0]!;
            return (
              <div key={`${d.axis}-${d.label}`} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
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
      )}

      {/*
        🔴 ★**個性・主戦騎手は ★出しません**（★2026-09-27・P0-B）。
           ★`HorseDetail` に ★個性の入力（先天・通算の走り）も ★主戦騎手（騎乗の凍結）も ★在りません。
           ★それまで ★見本（`DEMO_INNATE_INPUT` / `DEMO_CAREER_RUNS` / `DEMO_TOP_JOCKEY`）を ★自分の馬の欄として出していました。
           ★出すときは ★実データの口（★サーバーが作って返す）を先に作ること。
      */}

      <div style={{ height: 1, background: 'var(--a-line)', margin: '22px 14px 0' }} />

      {/* ★4 タブ（★選択中は青グロス・下辺を白にして板と繋ぐ） */}
      <div style={{ marginTop: 22 }}>
        <div style={{ display: 'flex', gap: 6, padding: '0 16px' }}>
          {REAL_TABS.map((t) => {
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

          {/* 🔴 ★物語・子孫のタブは ★出しません（★`HorseDetail` に無い・★見本で埋めない・P0-B）。★物語は `/stable/retired` の馬物語帳で実データを見られます */}
          {/*
            ★**馬物語帳への入口**（★実データの画面・★網 `screen-reachable` が見る）。
            ⚠️ ★以前は ★物語タブの中（★見本の件数つき）にだけ在りました。★タブを外しても ★入口は残します。
          */}
          <a href="/stable/retired" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 44, marginTop: 14, fontSize: 12, fontWeight: 900, color: 'var(--a-blue-d)' }}>
            馬物語帳（引退した馬と、その生涯）を見る
          </a>
        </div>
      </div>
    </div>
  );
}
