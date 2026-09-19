'use client';

/**
 * ★**投票モード（`/vote`）**（★R-14・2026-09-17・引き渡し資料 §8-4）
 *
 * 【★この画面がいちばん重い理由】
 *   ★**マークシートの画面が、これまで存在しませんでした**（★資料 §4.3）。
 *   ★`/races/[id]/bet` は arcade 版の別デザインで、★**同じ URL を奪いません**。
 *
 * 【★正典 §9.5 — 自分の馬が出るレース】★**VT-1 ①**・2026-09-19・オーナー決定
 *   🔴 ★**この画面は「投票できません」としていました。★正典はそう書いていません。**
 *     ★§9.5 が書いているのは ★**買い目の条件**です:
 *       ★1. ★自馬を**含む**券しか買えない ／ ★2. ★1 レース **5,000 EP** まで ／
 *       ★3. ★自馬が複数なら ★**全頭を含む**組合せのみ
 *     → ★★**マークシートは普通に満たせます**（★1 頭 10 EP・18 頭でも **180 EP** ＝ 上限の 3.6%）。
 *   ✅ ★**サーバーは最初から正しく守っています** — ✔ `place_bet`（★最後の定義は移行 `0044`）が
 *     ★`not (p_selection @> to_jsonb(e.gate))` で全頭を確かめ、★金額は `bet_allowance()` が見ます。
 *   ⚠️ 🔴 ★**画面が独自の規則を持たないこと。** ★判定は `checkOwnRaceSelection`（`@star/betting`）
 *     ★**1 か所**から引きます（★D-052・BT-0「材料でなく結果を渡す」）。
 *   ⚠️ ★**「押せない」だけにしない** — ★理由（どの馬が入っていないか）を必ず出します。
 *
 * 【★L-8（ストア審査）】
 *   ★単勝は ★**灰色**。★倍率を大きく・赤く・光らせません。★「儲かる」等を書きません。
 *   ★語は ★**「投票」**（★「馬券」と書かない）。
 */

import { useState } from 'react';
import { JOCKEYS } from '@star/scheduler';
import {
  Backdrop, BigButton, NoticeBar, TopBar, useMotionPaused,
} from '../../components/uma/uma-parts';
import { BET_CAP_OWN_RACE_EP, checkOwnRaceSelection, ownRaceReasonText } from '@star/betting';
import { DEMO_BET_RACE } from '../../lib/game-demo';

/** ★枠色 1〜8（★正典 `--f1`〜`--f8` の写し・★変更禁止） */
const FRAME_COLORS = ['#f5f5f5', '#191919', '#d62828', '#1446b4', '#fad728', '#148c46', '#f08219', '#f596be'] as const;
const DARK_TEXT_FRAMES = new Set([1, 5, 8]);

/** ★1 頭あたりに使う参加ポイント（★資料 §8-4） */
const EP_PER_PICK = 10;

/** ★自馬が出るレースの上限（★数は `@star/betting` から。★画面に数を書かない・D-052） */
const OWN_RACE_CAP_LABEL = BET_CAP_OWN_RACE_EP.toLocaleString('en-US');

/**
 * ★**出馬表は `DEMO_BET_RACE` から引きます**（★D-052・R-30）。
 *
 * ⚠️ ★**2026-09-17 の訂正**: ★最初、★馬名・騎手名・オッズを ★**画面に 12 行書いていました**。
 *    ★既に `lib/game-demo.ts` の `DEMO_BET_RACE` が ★**同じ出馬表**を持っており、
 *    ★**2 か所に別の名簿**ができていました。→ ★引く形に直しました。
 * ⚠️ ★`ownGate`（★自馬の枠番）も ★**あちらが持っています**（★§9.5 の判定の出どころ）。
 *    ★画面で真偽値を作りません。
 * ★騎手は `@star/scheduler` の名簿から（★画面に名前を書かない・D-105）。
 */
const FRAME_OF = (gate: number, fieldSize: number): number => {
  /** ★枠は馬番から決まります（★8 枠に均等割り・★正典 §9.1 の慣行） */
  const perFrame = Math.ceil(fieldSize / 8);
  return Math.min(8, Math.ceil(gate / perFrame));
};

export default function VotePage(): React.ReactElement {
  const [paused, toggle] = useMotionPaused();
  const [picks, setPicks] = useState<readonly number[]>([]);
  /**
   * ★**自分の馬の枠番**（★出どころは `DEMO_BET_RACE.ownGate`・★本番はサーバーの出走登録）。
   * ⚠️ ★画面で真偽値を作りません（★§9.5 の判定は 1 か所から）。
   * ★デモの `ownGate` は `null` なので、★**両方の見え方**を確かめられるよう切り替えを置きます。
   */
  const [ownGate, setOwnGate] = useState<number | null>(DEMO_BET_RACE.ownGate ?? 7);
  const ownHorseRuns = ownGate !== null;
  /**
   * ★**このレースに出ている自分の馬の馬番**（★D-104 で 1 人 2 頭まで出せます）。
   * ⚠️ ★デモは 1 頭ですが、★判定は ★**複数でも同じ関数**が見ます（★§9.5-3）。
   */
  const ownGates = ownGate === null ? [] : [ownGate];
  /** ★出馬表（★馬名は `DEMO_BET_RACE`・騎手は `JOCKEYS`・枠は馬番から） */
  const rows = DEMO_BET_RACE.horses.map((h, i) => ({
    no: h.gate,
    frame: FRAME_OF(h.gate, DEMO_BET_RACE.fieldSize),
    name: h.name,
    jockey: JOCKEYS[i % JOCKEYS.length]!.name,
    /** ★単勝は見本の値（★実データは `odds-board.tsx` の構造から・次便） */
    odds: (3.4 + i * 7.3).toFixed(1),
    mine: h.gate === ownGate,
  }));

  /**
   * ⚠️ 🔴 ★**自馬の行も押せます。** ★§9.5 は「選べない」ではなく「**含めること**」です。
   *    ★外したら ★**理由を出して、出せなくします**（★下の `check`）。
   *    ★ここで外せなくすると、★**画面が正典より狭い規則**を持つことになります。
   */
  const toggleRow = (no: number): void => {
    setPicks((p) => (p.includes(no) ? p.filter((x) => x !== no) : [...p, no]));
  };
  const epTotal = picks.length * EP_PER_PICK;
  /**
   * ★**§9.5 の判定は `@star/betting` の 1 か所から**（★画面で組み立てない・BT-0）。
   * ⚠️ ★これは ★**「なぜ出せないか」を言うため**のもので、★最後に弾くのはサーバーです（憲法 3）。
   */
  const check = checkOwnRaceSelection(picks, ownGates, epTotal);
  const blocked = picks.length === 0 || !check.ok;
  const useEp = String(epTotal);

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
      <TopBar title="投票モード" paused={paused} onToggle={toggle} />

      {/* ★自馬が出走しているときは、★投票の導線を出さない（★§9.5） */}
      {ownHorseRuns ? (
        <NoticeBar
          kind="own"
          text="第12R に自分の馬が出走しています"
          sub={`自分の馬（${ownGates.join('・')} 番）を必ず含めてください（1 レース ${OWN_RACE_CAP_LABEL} EP まで）`}
          actionLabel="レースを見る"
          actionHref="/watch-race"
        />
      ) : (
        <NoticeBar
          kind="soon"
          text="第12R 発走まで 3:20（芝1600m・12頭）"
          actionLabel="レースを見る"
          actionHref="/watch-race"
        />
      )}

      <div style={{
        position: 'relative', flex: '1 1 auto', minHeight: 0, display: 'flex', flexWrap: 'wrap', gap: 12,
        padding: '10px 14px 0', width: '100%', maxWidth: 1220, margin: '0 auto', overflow: 'auto',
      }}>
        {/* ★出馬表 */}
        <div style={{
          flex: '2 1 330px', minWidth: 0, alignSelf: 'flex-start',
          border: '2px solid rgba(246,194,28,.45)', borderRadius: 12,
          background: 'rgba(251,247,236,.96)', overflow: 'hidden',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: 'var(--u-navy)', borderBottom: '3px solid var(--u-gold)' }}>
            <span style={{ fontSize: 15 }}>出馬表</span>
            <span style={{ minWidth: 0, fontSize: 11, fontWeight: 700, color: 'var(--u-ink-light-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              第12R ・ 芝1600m ・ 12頭
            </span>
            <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'baseline', gap: 4 }}>
              <span style={{ fontSize: 10, color: 'var(--u-ink-light-3)' }}>発走まで</span>
              <span className="u-num" style={{ fontSize: 19 }}>3:20</span>
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', padding: '4px 10px', background: '#e8eef3', color: 'var(--u-ink-dark-2)', fontSize: 10, letterSpacing: '.06em', borderBottom: '1px solid #cfe0ee' }}>
            <span style={{ width: 78, flex: '0 0 auto' }}>枠・馬番</span>
            <span style={{ flex: '1 1 auto', minWidth: 0 }}>馬名 ／ 騎手</span>
            <span style={{ width: 52, flex: '0 0 auto', textAlign: 'right' }}>単勝</span>
            <span style={{ width: 34, flex: '0 0 auto', textAlign: 'center' }}>印</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))' }}>
            {rows.map((r, i) => {
              const on = picks.includes(r.no);
              return (
                <button
                  key={r.no}
                  type="button"
                  onClick={() => { toggleRow(r.no); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6, minHeight: 46, padding: '0 10px', textAlign: 'left',
                    border: 'none', borderBottom: '1px solid var(--u-rule)',
                    background: on ? '#fff4cf' : i % 2 === 1 ? 'var(--u-paper-2)' : 'var(--u-paper)',
                    cursor: 'pointer',
                  }}
                >
                  <span style={{ width: 78, flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{
                      width: 26, height: 22, borderRadius: 4, border: '2px solid var(--u-ink-dark)',
                      background: FRAME_COLORS[r.frame - 1], display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 11, color: DARK_TEXT_FRAMES.has(r.frame) ? '#111' : '#fff',
                    }}>{r.frame}</span>
                    <span className="u-num" style={{ fontSize: 19, color: 'var(--u-ink-dark)' }}>{r.no}</span>
                  </span>
                  <span style={{ flex: '1 1 auto', minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 14, color: 'var(--u-ink-dark)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {r.name}{r.mine ? '（自分の馬）' : ''}
                    </span>
                    <span style={{ display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--u-ink-dark-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {r.jockey}
                    </span>
                  </span>
                  {/* ★単勝は灰色。★大きく・赤く・光らせない（★L-8） */}
                  <span className="u-num" style={{ width: 52, flex: '0 0 auto', textAlign: 'right', fontSize: 16, color: 'var(--u-ink-dark-2)' }}>{r.odds}</span>
                  <span style={{
                    width: 34, flex: '0 0 auto', height: 30, borderRadius: '50%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    border: on ? '3px solid var(--u-blue)' : '2px solid #c3ccd4',
                    background: on ? 'var(--u-blue)' : '#fff', color: '#fff', fontSize: 13,
                  }}>{on ? '◯' : ''}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ★集計列 */}
        <div style={{ flex: '1 1 250px', minWidth: 0, maxWidth: 420, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ padding: '8px 11px', border: '2px solid rgba(251,247,236,.28)', borderRadius: 12, background: 'var(--u-panel)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, letterSpacing: '.08em', color: 'var(--u-ink-light-3)' }}>マークシート</span>
              <span style={{ marginLeft: 'auto', fontSize: 12 }}>{picks.length} 頭を選択中</span>
            </div>
            <div style={{ marginTop: 6, display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontSize: 11, color: 'var(--u-ink-light-3)' }}>使う参加ポイント</span>
              <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'baseline', gap: 5 }}>
                <span className="u-num" style={{ fontSize: 24, color: 'var(--u-ep-num)' }}>{useEp}</span>
                <span style={{ fontSize: 11, color: 'var(--u-ep-ink)' }}>EP</span>
              </span>
            </div>
            <div style={{ marginTop: 4, fontSize: 10, fontWeight: 500, color: '#a9d8cb' }}>
              参加ポイントは無償で受け取れます（有償での取得はありません）
            </div>
          </div>
          <div style={{ padding: '8px 11px', border: '2px solid rgba(251,247,236,.28)', borderRadius: 12, background: 'var(--u-panel)', fontSize: 12, fontWeight: 500, lineHeight: 1.6 }}>
            {/* 🔴 ★「押せない」だけにしない。★理由（どの馬が入っていないか）を出す */}
            {check.ok
              ? `1 頭につき ${EP_PER_PICK} EP を使います。出走登録の出走料とは別枠です。`
              : ownRaceReasonText(check)}
          </div>
          {/* ★デモの切り替え（★両方の見え方を確かめるため。★本番はサーバーが決めます） */}
          <button
            type="button"
            onClick={() => { setOwnGate((g) => (g === null ? 7 : null)); setPicks([]); }}
            style={{
              minHeight: 44, borderRadius: 8, border: '2px solid rgba(251,247,236,.28)',
              background: 'transparent', color: 'var(--u-ink-light-3)', fontSize: 11,
            }}
          >
            （デモ）自馬の出走を{ownHorseRuns ? '無し' : '有り'}にする
          </button>
        </div>
      </div>

      <div style={{
        position: 'relative', flex: '0 0 auto', display: 'flex', flexWrap: 'wrap', gap: 10,
        padding: '10px 14px var(--u-safe-bottom)', width: '100%', maxWidth: 1220, margin: '0 auto',
      }}>
        {blocked ? (
          <BigButton
            tone="disabled"
            label="投票する（マークシート）"
            sub={picks.length === 0 ? '馬を選んでください' : ownRaceReasonText(check)}
            grow="1.4 1 210px"
          />
        ) : (
          <BigButton
            tone="blue"
            label="投票する（マークシート）"
            sub={`${picks.length} 頭 ／ ${epTotal} EP を使います`}
            grow="1.4 1 210px"
          />
        )}
        <BigButton tone="ivory" label="レースを見る" sub="横向きの全画面で流れます" href="/watch-race" grow="1 1 130px" />
      </div>
    </div>
  );
}
