'use client';

/**
 * ★**馬物語帳**（★D13-1・D13-3・D13-4・2026-09-16・正典 §18・D-108）
 *
 * ★デザイナーのカード `components/horse-story` の実装です。
 *
 * 【★この画面が守る約束】（★正典 §18）
 *   LR-1 ★**消さない**（★引退で一覧から消えて終わりにしない）
 *   LR-2 ★**所有ではない**（★現役 30 頭の上限に数えない — ★見出しで明言する）
 *   LR-4 ★**文は開発側が組み立てる** — ★この画面は ★**`storyLinesOf` が返した文をそのまま出すだけ**
 *   LR-6 ★**他人の馬も見えるが、持ち主の個人情報は出さない**（★牧場名まで）
 *   D-108 ★発見度は ★**段だけ**（★素質の数値も「上限までの割合」も出さない）
 *
 * ⚠️ ★**文から種類を推測しません**（★色分けは `StoryLine.type` から。★文言を直した日に色が外れる形にしない）。
 * ⚠️ ★**発見度の段をこの画面で決めません**（★`discoveryStageOf` が回数から決める）。
 */

import { useState } from 'react';
import { storyLinesOf, STORY_EVENT_LABEL, type StoryEventType } from '@star/training';
import { discoveryStageOf, discoveryLabelOf } from '@star/sim-engine';
import { DEMO_RETIRED, DEMO_STORY, DEMO_DISCOVERY, MY_STABLE_NAME } from '../../../lib/horse-story-demo';

/** ★種類ごとの色（★絵文字を使わず、色分けした角丸ラベル・カードの指定） */
const TYPE_TONE: Readonly<Record<StoryEventType, { readonly bg: string; readonly border: string; readonly color: string }>> = {
  birth: { bg: '#eef2f6', border: '#6b7d8c', color: '#6b7d8c' },
  'first-training': { bg: '#eef2f6', border: '#6b7d8c', color: '#6b7d8c' },
  debut: { bg: '#e0eefa', border: '#1a6fd4', color: '#1a6fd4' },
  'jockey-bond': { bg: '#e0eefa', border: '#1a6fd4', color: '#1a6fd4' },
  'first-win': { bg: '#dff3e4', border: '#1e7a3a', color: '#1e7a3a' },
  comeback: { bg: '#dff3e4', border: '#1e7a3a', color: '#1e7a3a' },
  'career-high': { bg: '#dff3e4', border: '#1e7a3a', color: '#1e7a3a' },
  'offspring-win': { bg: '#dff3e4', border: '#1e7a3a', color: '#1e7a3a' },
  'trait-discovered': { bg: '#eee5fb', border: '#6b3fc4', color: '#6b3fc4' },
  'first-offspring': { bg: '#eee5fb', border: '#6b3fc4', color: '#6b3fc4' },
  'graded-win': { bg: '#fff3d6', border: '#a9741a', color: '#a9741a' },
  'top-grade-win': { bg: '#ffe9a8', border: '#8a5a06', color: '#8a5a06' },
  injury: { bg: '#ffe4e1', border: '#a81a13', color: '#a81a13' },
  'final-race': { bg: '#ffeadb', border: '#b5651d', color: '#b5651d' },
  retirement: { bg: '#e3e8ec', border: '#4a5a66', color: '#4a5a66' },
  // ★仮に「引退」と同じ色（★I-1 段 3・画面は kind='breed' の便でデザイナーが決める）
  'breeding-role-changed': { bg: '#e3e8ec', border: '#4a5a66', color: '#4a5a66' },
};

/** ★最初に見せる行数（★30〜40 行でも読めるように畳む・カードの指定） */
const FIRST_LINES = 12;

export default function RetiredPage(): React.ReactElement {
  const [selected, setSelected] = useState(DEMO_RETIRED[0]!.id);
  const [expanded, setExpanded] = useState(false);
  const horse = DEMO_RETIRED.find((h) => h.id === selected) ?? DEMO_RETIRED[0]!;
  /** ★文も種類も週も、★`@star/training` の 1 か所から来ます（★画面で組み立てない） */
  const lines = storyLinesOf(DEMO_STORY[horse.id] ?? []);
  const shown = expanded ? lines : lines.slice(0, FIRST_LINES);
  const rest = lines.length - shown.length;

  return (
    <div style={{ padding: '0 0 28px' }}>
      <div className="a-band" style={{ height: 52, padding: '0 16px', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 18, fontWeight: 900, letterSpacing: '.06em' }}>馬物語帳</span>
        <span style={{ fontSize: 12, fontWeight: 900 }}>引退した馬</span>
      </div>

      {/* ★LR-2: 所有ではないことを最初に言う（★不安にさせない） */}
      <div style={{ padding: '14px 16px 0', fontSize: 11.5, fontWeight: 900, color: 'var(--a-ink-2)', lineHeight: 1.7 }}>
        現役の 30 頭には数えません。記録は消えません。
      </div>

      {/* ★引退馬の一覧（★所有とは別の棚） */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 16px 0' }}>
        {DEMO_RETIRED.map((h) => {
          const mine = h.stableName === MY_STABLE_NAME;
          const sel = h.id === selected;
          return (
            <div
              key={h.id}
              onClick={() => { setSelected(h.id); setExpanded(false); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '11px 13px', borderRadius: 10, cursor: 'pointer',
                background: h.topGrade ? '#fff3d6' : mine ? '#eef2f6' : '#eaf3fb',
                border: `${sel ? 2.5 : 1.5}px solid ${h.topGrade ? '#8a5a06' : mine ? 'var(--a-ink-3)' : '#9fc0dc'}`,
              }}
            >
              <span style={{ fontSize: 14, fontWeight: 900, flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{h.name}</span>
              <span style={{ fontSize: 11, fontWeight: 900, color: h.topGrade ? '#8a5a06' : 'var(--a-ink-3)' }}>{h.summary}</span>
              {/* ★LR-6: 他人の馬は牧場名まで（★持ち主の表示名は出さない） */}
              {!mine && <span style={{ fontSize: 10.5, fontWeight: 900, color: 'var(--a-ink-2)' }}>{h.stableName}</span>}
            </div>
          );
        })}
      </div>

      <div style={{ height: 1, background: 'var(--a-line)', margin: '22px 16px 0' }} />

      {/* ★1 頭の生涯 */}
      <div style={{ padding: '22px 16px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <span className="a-chip" style={{ height: 24, padding: '0 10px', fontSize: 11.5 }}>引退</span>
          <span style={{ fontSize: 20, fontWeight: 900 }}>{horse.name}</span>
        </div>
        <div style={{ fontSize: 11, fontWeight: 900, color: 'var(--a-ink-3)', marginBottom: 14 }}>{horse.summary}</div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {shown.map((l, i) => {
            const tone = TYPE_TONE[l.type];
            return (
              <div key={`${l.type}-${l.week}-${i}`} style={{ display: 'flex', gap: 12, paddingTop: l.sameWeekAsPrev ? 0 : 14 }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: '0 0 52px' }}>
                  {/* ★同じ週の続きは週番号を出さない（★1 グループに見せる） */}
                  {!l.sameWeekAsPrev && <span className="a-num" style={{ fontSize: 14, color: 'var(--a-ink-3)' }}>{l.week}週</span>}
                  <div style={{ flex: 1, width: 2, background: 'var(--a-line)', marginTop: l.sameWeekAsPrev ? 0 : 6 }} />
                </div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5, paddingBottom: 14 }}>
                  <span style={{ display: 'inline-flex', alignSelf: 'flex-start', alignItems: 'center', height: 22, padding: '0 9px', borderRadius: 6, background: tone.bg, border: `1.5px solid ${tone.border}`, fontSize: 11, fontWeight: 900, color: tone.color }}>
                    {STORY_EVENT_LABEL[l.type]}
                  </span>
                  {/* ★文はそのまま出すだけ（★画面で組み立てない・LR-4） */}
                  <span style={{ fontSize: 13.5, fontWeight: 900, color: 'var(--a-ink)', lineHeight: 1.6 }}>{l.text}</span>
                </div>
              </div>
            );
          })}
        </div>
        {rest > 0 && (
          <div
            onClick={() => { setExpanded(true); }}
            style={{ textAlign: 'center', padding: '6px 0 0', fontSize: 11.5, fontWeight: 900, color: 'var(--a-ink-3)', cursor: 'pointer' }}
          >
            さらに {rest} 件を表示（全{lines.length}件）
          </div>
        )}
      </div>

      <div style={{ height: 1, background: 'var(--a-line)', margin: '26px 16px 0' }} />

      {/* ★D13-3 発見度（★段だけ・素質の数値は出さない） */}
      <div style={{ padding: '22px 16px 0' }}>
        <div style={{ fontSize: 15, fontWeight: 900, marginBottom: 4 }}>判明した能力</div>
        <div style={{ fontSize: 11, fontWeight: 900, color: 'var(--a-ink-2)', lineHeight: 1.7, marginBottom: 12 }}>
          レースを終えるたびに、少しずつ分かっていきます。
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          {DEMO_DISCOVERY.map((d) => {
            /** ★段は `@star/sim-engine` が回数から決めます（★画面で決めない・D-108） */
            const stage = discoveryStageOf(d.runs);
            const stages = ['unknown', 'hint', 'narrow', 'known'] as const;
            const reached = stages.indexOf(stage);
            const tone = ['#8a95a3', '#6b3fc4', '#1a6fd4', '#1e7a3a'][reached] ?? '#8a95a3';
            return (
              <div key={d.label} style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '12px 14px', borderRadius: 10, background: '#fff', border: '1.5px solid var(--a-line)' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 13, fontWeight: 900 }}>{d.label}</span>
                  {/* ★`known` のときだけ評価そのもの（★数値は段によらず出さない） */}
                  <span style={{ fontSize: 12.5, fontWeight: 900, color: tone }}>{discoveryLabelOf(stage, '評価: A')}</span>
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  {stages.map((s, i) => (
                    <div key={s} style={{ flex: 1, height: 8, borderRadius: 4, background: i <= reached ? tone : '#e3ecf3', border: `1.5px solid ${i <= reached ? tone : 'var(--a-edge-soft)'}` }} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ★D13-4 他人の馬（★出るのは牧場名まで） */}
      <div style={{ margin: '20px 16px 0', padding: '13px 14px', borderRadius: 10, background: '#eaf3fb', border: '2px solid #9fc0dc' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 900 }}>他の牧場の馬</span>
          <span style={{ fontSize: 10.5, fontWeight: 900, color: 'var(--a-ink-3)' }}>見分け方: 牧場名が「{MY_STABLE_NAME}」以外</span>
        </div>
        <div style={{ fontSize: 10.5, fontWeight: 900, color: 'var(--a-ink-3)', lineHeight: 1.6 }}>
          出るのは牧場名まで。持ち主の表示名・個人情報は出しません
        </div>
      </div>
    </div>
  );
}
