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
 *
 * 【✅ ★2026-09-25: ★**本物に繋ぎました**】（★裁定 `REVIEW_SCREEN_GENERATIONS_20260925.md` §5）
 *   🔴 ★それまで ★**この画面は見本のデータだけ**でした（★`horse-story-demo`）。
 *     ★註記には書いてありましたが、★**誰も繋いでいませんでした**。
 *     ★引退馬の一覧は血統ループの一部なので、★綺麗にしても中身が空のままでした。
 *   ✅ ★繋いだもの:
 *     ★① 引退馬の一覧 … `loadRetiredScreen()`（★`my_retired_horses()`・`0075`）
 *     ★② 生涯の記録 … `loadHorseStory(horseId)`（★公開の view `horse_story_event_public`）
 *   🔴 ★繋げなかったもの（★**口が無い**・★見本のまま。★画面で「見本」と明記しました）:
 *     ★③ 判明した能力（発見度）… ★**条件別の出走回数を返す口が在りません**。
 *        ★`0034` は「★列は要りません。★戦績から計算できます」と書いていますが、
 *        ★**その計算をする口（RPC か view）は まだ在りません**。
 *     ★④ 他の牧場の引退馬 … ★`my_retired_horses()` は ★**自分の分だけ**返します。
 *        ★公開の一覧の口が在りません（★物語の view は公開なので、★一覧だけが足りない）。
 *   ⚠️ ★③④ は ★**「見本」と画面に出しています**（★本物だと思わせない・★裁定 §5 の指示）。
 */

import { useCallback, useEffect, useState } from 'react';
import { storyLinesOf, STORY_EVENT_LABEL, type StoryEvent } from '@star/training';
import { discoveryStageOf, discoveryLabelOf } from '@star/sim-engine';
import { loadDiscovery, type DiscoveryRow } from '../../../lib/discovery-screen';
import {
  loadHorseStory, loadPublicRetired, loadRetiredScreen,
  type PublicRetiredRow, type RetiredHorseView,
} from '../../../lib/retired-screen';
import { SignInRequiredError } from '../../../lib/stable-repo';
import { TYPE_TONE } from '../../../lib/story-tone';

/**
 * ★一覧に出す 1 行（★事実だけから組み立てます）。
 * ⚠️ ★`summary` は ★**戦績の事実**です（★評価や素質の数値を出しません・D-114）。
 */
interface RetiredRow {
  readonly id: string;
  readonly name: string;
  readonly summary: string;
  readonly topGrade: boolean;
  /**
   * ★自分の馬か。★偽なら ★**牧場名まで**を出します（★LR-6）。
   * ⚠️ ★持ち主の表示名は ★view が返しません（★出せません）。
   */
  readonly mine: boolean;
  /** ★牧場名（★他人の馬のときだけ出す。★NPC は `null`） */
  readonly stableName: string | null;
}

/** ★戦績の要約（★事実だけ。★評価や素質の数値を出しません・D-114） */
function summaryOf(starts: number, wins: number, g1Wins: number): string {
  return `${starts}戦${wins}勝${g1Wins > 0 ? `・G1 ${g1Wins}勝` : ''}`;
}

function toRow(h: RetiredHorseView): RetiredRow {
  return {
    id: h.id,
    name: h.name,
    // ★事実のみ（★`starts` / `wins` / `g1Wins` は `my_retired_horses()` が返した値）
    summary: summaryOf(h.starts, h.wins, h.g1Wins),
    topGrade: h.g1Wins > 0,
    mine: true,
    stableName: null,
  };
}

/**
 * ★公開の一覧の 1 行 → 画面の行（★`0083` の `retired_horses_public`）。
 * ⚠️ ★**同じ要約の式**を使います（★自分の馬と他人の馬で違う戦績を出さない・D-052）。
 */
function toPublicRow(r: PublicRetiredRow, mineIds: ReadonlySet<string>): RetiredRow {
  return {
    id: r.horseId,
    name: r.horseName,
    summary: summaryOf(r.starts, r.wins, r.g1Wins),
    topGrade: r.g1Wins > 0,
    mine: mineIds.has(r.horseId),
    stableName: r.stableName,
  };
}

/**
 * ★種類ごとの色は ★**`lib/story-tone.ts` の 1 か所**にあります。
 *   ★`/stable/roles`（第 2 便 A-1）も同じ表を使うので、★片方だけ直せない形にしました。
 */

/** ★最初に見せる行数（★30〜40 行でも読めるように畳む・カードの指定） */
const FIRST_LINES = 12;

export default function RetiredPage(): React.ReactElement {
  const [rows, setRows] = useState<readonly RetiredRow[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [events, setEvents] = useState<readonly StoryEvent[]>([]);
  /** ★発見度（★自分の馬のときだけ。★`null` は「出さない」） */
  const [discovery, setDiscovery] = useState<readonly DiscoveryRow[] | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * ★**自分の引退馬と、他の牧場の引退馬**を読みます（★LR-6・`0083`）。
   *
   * ⚠️ ★公開の一覧（`loadPublicRetired`）は ★**ログインしていなくても読めます**。
   *    ★だから ★未ログインでも ★**他人の馬は出ます**（★自分の馬の欄だけログインを促します）。
   * ⚠️ ★自分の馬の口（`loadRetiredScreen`）が失敗しても、★公開の一覧を ★**道連れにしません**
   *    （★2026-09-25 に `/entry` で同じ形の事故を起こしているので）。
   */
  const reload = useCallback((): void => {
    const minePromise = loadRetiredScreen()
      .then((data) => { setNeedsLogin(false); return data.horses.map((h) => h.id); })
      .catch((cause: unknown) => {
        if (cause instanceof SignInRequiredError) { setNeedsLogin(true); return []; }
        setError(cause instanceof Error ? cause.message : String(cause));
        return [];
      });

    void Promise.all([minePromise, loadPublicRetired()])
      .then(([mineIds, publicRows]) => {
        const ids = new Set(mineIds);
        // ★自分の馬を先に、★そのあと他の牧場（★並び順は view が決定論で返した順を保つ）
        const list = [
          ...publicRows.filter((r) => ids.has(r.horseId)).map((r) => toPublicRow(r, ids)),
          ...publicRows.filter((r) => !ids.has(r.horseId)).map((r) => toPublicRow(r, ids)),
        ];
        setRows(list);
        setSelected((cur) => (cur !== null && list.some((r) => r.id === cur) ? cur : list[0]?.id ?? null));
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : String(cause));
        setRows([]);
      });
  }, []);

  useEffect(() => { reload(); }, [reload]);

  // ★選んだ馬の生涯の記録（★公開の view から・★他人の馬でも読めます）
  useEffect(() => {
    if (selected === null) { setEvents([]); return; }
    let active = true;
    loadHorseStory(selected)
      .then((rs) => { if (active) setEvents(rs); })
      .catch(() => { if (active) setEvents([]); });
    return () => { active = false; };
  }, [selected]);

  /**
   * ★選んだ馬の発見度（★`0084`・D-108・D-116）。
   * ⚠️ ★**自分の馬だけ**です（★口が他人の馬を拒みます・★裁定の答え ⑤）。
   *    ★他人の馬を選んだときは ★**節そのものを出しません**（★空の枠を出して考えさせない）。
   */
  useEffect(() => {
    const row = rows?.find((r) => r.id === selected) ?? null;
    if (selected === null || row === null || !row.mine) { setDiscovery(null); return; }
    let active = true;
    loadDiscovery(selected)
      .then((ds) => { if (active) setDiscovery(ds); })
      .catch(() => { if (active) setDiscovery(null); });
    return () => { active = false; };
  }, [selected, rows]);

  const horse = rows?.find((r) => r.id === selected) ?? null;
  /** ★文も種類も週も、★`@star/training` の 1 か所から来ます（★画面で組み立てない） */
  const lines = storyLinesOf(events);
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

      {/* ★引退後の役割へ（★第 2 便 A-1） */}
      <div style={{ padding: '10px 16px 0' }}>
        <a href="/stable/roles" style={{ display: 'inline-flex', alignItems: 'center', minHeight: 44, padding: '0 14px', borderRadius: 10, background: '#dcf1ef', border: '2px solid #0e7a73', color: '#0e7a73', fontSize: 12.5, fontWeight: 900, textDecoration: 'none' }}>
          引退後の役割を選ぶ
        </a>
      </div>

      {/* ★読み込みの状態（★空を「0 頭」と言い切らない） */}
      {needsLogin && (
        <div role="status" style={{ padding: '12px 16px 0', fontSize: 12, fontWeight: 900, color: 'var(--a-ink-2)' }}>
          引退した馬を見るには、<a href="/login">ログイン</a>してください。
        </div>
      )}
      {error !== null && (
        <div role="status" style={{ padding: '12px 16px 0', fontSize: 12, fontWeight: 900, color: '#a3341f' }}>
          {error}
        </div>
      )}
      {rows === null && (
        <div role="status" style={{ padding: '12px 16px 0', fontSize: 12, fontWeight: 900, color: 'var(--a-ink-2)' }}>
          読み込んでいます…
        </div>
      )}
      {rows !== null && rows.length === 0 && !needsLogin && error === null && (
        <div role="status" style={{ padding: '12px 16px 0', fontSize: 12, fontWeight: 900, color: 'var(--a-ink-2)', lineHeight: 1.7 }}>
          引退した馬はまだいません。現役の馬が年を重ねると、ここに残ります。
        </div>
      )}

      {/* ★引退馬の一覧（★所有とは別の棚） */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 16px 0' }}>
        {(rows ?? []).map((h) => {
          const mine = h.mine;
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
              {/*
                ★LR-6: ★他人の馬は ★**牧場名まで**（★持ち主の表示名は view が返しません）。
                ★牧場名が無い馬（★NPC）は ★「持ち主なし」と出します（★空欄にして考えさせない）。
              */}
              {!mine && (
                <span style={{ fontSize: 10.5, fontWeight: 900, color: 'var(--a-ink-2)' }}>
                  {h.stableName ?? '持ち主なし'}
                </span>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ height: 1, background: 'var(--a-line)', margin: '22px 16px 0' }} />

      {/* ★1 頭の生涯（★選ばれている馬が無いときは出しません） */}
      {horse !== null && (
      <div style={{ padding: '22px 16px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <span className="a-chip" style={{ height: 24, padding: '0 10px', fontSize: 11.5 }}>引退</span>
          <span style={{ fontSize: 20, fontWeight: 900 }}>{horse.name}</span>
        </div>
        <div style={{ fontSize: 11, fontWeight: 900, color: 'var(--a-ink-3)', marginBottom: 14 }}>{horse.summary}</div>

        {/* ⚠️ ★記録が 0 件でも「無い」と言い切らない（★読めていないのかもしれない） */}
        {lines.length === 0 && (
          <div role="status" style={{ fontSize: 12, fontWeight: 900, color: 'var(--a-ink-2)' }}>
            この馬の記録はまだありません。
          </div>
        )}

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
      )}

      <div style={{ height: 1, background: 'var(--a-line)', margin: '26px 16px 0' }} />

      {/*
        ★D13-3 発見（★段だけ・素質の数値は出さない）
        ✅ ★2026-09-25: ★**本物に繋ぎ、軸を正典に合わせました**（★`0084`・裁定 `REVIEW_DISCOVERY_AXES_20260925.md`）。
        🔴 ★それまでは ★**見本のデータ**で、しかも ★**軸が違いました**
           （★スピード／スタミナ／パワー／賢さ ＝ **能力**。★正典 **D-116** は「距離・馬場・脚質・気性」）。
        ⚠️ ★気性は ★**出しません**（★`RUNAWAY_BASE` が 0 で永久に「？？？」になるため・裁定の答え ③）。
        ⚠️ ★**自分の馬だけ**（★他人の馬に強さの手がかりを配らない・D-114・裁定の答え ⑤）。
      */}
      {discovery !== null && (
      <div style={{ padding: '22px 16px 0' }}>
        <div style={{ fontSize: 15, fontWeight: 900, marginBottom: 4 }}>分かってきたこと</div>
        <div style={{ fontSize: 11, fontWeight: 900, color: 'var(--a-ink-2)', lineHeight: 1.7, marginBottom: 12 }}>
          レースを終えるたびに、少しずつ分かっていきます。
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          {discovery.map((d) => {
            /** ★段は `@star/sim-engine` が回数から決めます（★画面で決めない・D-108 ②） */
            const stage = discoveryStageOf(d.runs);
            const stages = ['unknown', 'hint', 'narrow', 'known'] as const;
            const reached = stages.indexOf(stage);
            const tone = ['#8a95a3', '#6b3fc4', '#1a6fd4', '#1e7a3a'][reached] ?? '#8a95a3';
            /**
             * ⚠️ ★脚質は ★**「試した回数」**です（★裁定の答え ④）。
             *    ★「向く」と書くと ★素質の手がかりになります（★D-114）。
             */
            const isStrategy = d.axis === 'strategy';
            return (
              <div key={`${d.axis}-${d.label}`} style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '12px 14px', borderRadius: 10, background: '#fff', border: '1.5px solid var(--a-line)' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 13, fontWeight: 900 }}>{d.label}</span>
                  {isStrategy ? (
                    // ★脚質は ★**事実だけ**（★段の言葉を出さない）
                    <span style={{ fontSize: 12.5, fontWeight: 900, color: 'var(--a-ink-3)' }}>
                      {d.runs} 回 試しました
                    </span>
                  ) : (
                    /* ★`known` のときだけ評価そのもの（★数値は段によらず出さない） */
                    <span style={{ fontSize: 12.5, fontWeight: 900, color: tone }}>{discoveryLabelOf(stage, '評価: A')}</span>
                  )}
                </div>
                {!isStrategy && (
                  <div style={{ display: 'flex', gap: 4 }}>
                    {stages.map((s, i) => (
                      <div key={s} style={{ flex: 1, height: 8, borderRadius: 4, background: i <= reached ? tone : '#e3ecf3', border: `1.5px solid ${i <= reached ? tone : 'var(--a-edge-soft)'}` }} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      )}

      {/*
        ★D13-4 他人の馬（★出るのは牧場名まで）
        ✅ ★2026-09-25: ★`0083` の `retired_horses_public` で ★**出るようになりました**。
           ★裁定 §4 条件 ④「口が出来たら画面の『準備しています』を同じ便で外す」→ ★外しました。
      */}
      <div style={{ margin: '20px 16px 0', padding: '13px 14px', borderRadius: 10, background: '#eaf3fb', border: '2px solid #9fc0dc' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 900 }}>他の牧場の馬</span>
          <span style={{ fontSize: 10.5, fontWeight: 900, color: 'var(--a-ink-3)' }}>見分け方: 牧場名が付いています</span>
        </div>
        <div style={{ fontSize: 10.5, fontWeight: 900, color: 'var(--a-ink-3)', lineHeight: 1.6 }}>
          出るのは牧場名まで。持ち主の表示名・個人情報は出しません
        </div>
      </div>
    </div>
  );
}
