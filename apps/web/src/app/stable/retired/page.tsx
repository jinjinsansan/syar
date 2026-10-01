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
 *     ★③ 判明した能力（発見度）… `loadDiscovery()`（★`0084`・自分の馬だけ）
 *     ★④ 他の牧場の引退馬 … `loadPublicRetired()`（★`0083` の `retired_horses_public`）
 *
 * 【★2026-10-01: ★馬物語の画面の部品で組み直しました】（★デザイナー R-26 D26-3 ③）
 *   ★`Backdrop`・`TopBar`（‹ 戻る → `/stable`）・`RaceStrip`・★紺の板・★紙のパネル・`BigButton`。
 *   ★白い地・`a-band`・`a-chip` を外しました（★🔴 1）。★**新しい意匠は作っていません**（★引き渡し資料の値どおり）。
 *   ★名前は ★省略記号で切らず ★折り返します（★🔴 2）。
 *   ★下にあった「他の牧場の馬」の説明の箱は ★一覧の見出し 1 行にまとめました（★🔴 3）。
 *   ★中身（★読む口・`storyLinesOf`・`TYPE_TONE`・`discoveryStageOf`・★最初の 12 件）は ★そのままです。
 *   ★行の役割（★功労馬・繁殖牝馬・種牡馬）は ★`my_retired_horses()` が返す `retirement_role` から（★Q4 の答え: 返します）。
 */

import { useCallback, useEffect, useState } from 'react';
import { storyLinesOf, STORY_EVENT_LABEL, type StoryEvent } from '@star/training';
import { discoveryStageOf, discoveryLabelOf } from '@star/sim-engine';
import { loadDiscovery, type DiscoveryRow } from '../../../lib/discovery-screen';
import {
  loadHorseStory, loadPublicRetired, loadRetiredScreen,
  type PublicRetiredRow, type RetirementRole,
} from '../../../lib/retired-screen';
import { SignInRequiredError } from '../../../lib/stable-repo';
import { TYPE_TONE } from '../../../lib/story-tone';
import { Backdrop, BigButton, TextPanel, TopBar, useMotionPaused } from '../../../components/uma/uma-parts';
import { RaceStrip } from '../../../components/uma/race-strip';

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
  /** ★引退後の役割（★自分の馬だけ・`my_retired_horses()` の値。★他人の馬は `null`） */
  readonly role: RetirementRole | null;
}

/**
 * ★役割の呼び名（★`/stable/roles` の `ROLE_LABEL` と同じ語）。
 * ⚠️ ★表が 2 か所になっています（★ページのファイルからは export できないため）。★語を変えるときは両方を直すこと。
 */
const ROLE_LABEL: Readonly<Record<RetirementRole, string>> = {
  honored: '功労馬', broodmare: '繁殖牝馬', stallion: '種牡馬',
};

/** ★戦績の要約（★事実だけ。★評価や素質の数値を出しません・D-114） */
function summaryOf(starts: number, wins: number, g1Wins: number): string {
  return `${starts}戦${wins}勝${g1Wins > 0 ? `・G1 ${g1Wins}勝` : ''}`;
}

/**
 * ★公開の一覧の 1 行 → 画面の行（★`0083` の `retired_horses_public`）。
 * ⚠️ ★**同じ要約の式**を使います（★自分の馬と他人の馬で違う戦績を出さない・D-052）。
 */
function toPublicRow(r: PublicRetiredRow, mineRoles: ReadonlyMap<string, RetirementRole>): RetiredRow {
  return {
    id: r.horseId,
    name: r.horseName,
    summary: summaryOf(r.starts, r.wins, r.g1Wins),
    topGrade: r.g1Wins > 0,
    mine: mineRoles.has(r.horseId),
    stableName: r.stableName,
    role: mineRoles.get(r.horseId) ?? null,
  };
}

/**
 * ★種類ごとの色は ★**`lib/story-tone.ts` の 1 か所**にあります。
 *   ★`/stable/roles`（第 2 便 A-1）も同じ表を使うので、★片方だけ直せない形にしました。
 */

/** ★最初に見せる行数（★30〜40 行でも読めるように畳む・カードの指定） */
const FIRST_LINES = 12;

/** ★紙のパネル（★R-26 §0 の表の地） */
const PAPER: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', borderRadius: 12, background: '#fbf7ec', color: '#10243a',
  overflow: 'hidden', border: '2px solid rgba(246,194,28,.45)',
};

/** ★一覧の見出し（★芝の上なので影を付ける・R-26） */
const LIST_HEAD: React.CSSProperties = { fontSize: 13, textShadow: '0 2px 0 rgba(10,35,64,.6)' };

/** ★名前は省略記号で切らず折り返す（★R-26 🔴 2・2 行まで） */
const NAME_WRAP: React.CSSProperties = { fontSize: 14, lineHeight: 1.3, overflowWrap: 'anywhere' };

export default function RetiredPage(): React.ReactElement {
  const [rows, setRows] = useState<readonly RetiredRow[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [events, setEvents] = useState<readonly StoryEvent[]>([]);
  /** ★発見度（★自分の馬のときだけ。★`null` は「出さない」） */
  const [discovery, setDiscovery] = useState<readonly DiscoveryRow[] | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paused, toggle] = useMotionPaused();

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
      .then((data) => { setNeedsLogin(false); return data.horses.map((h) => [h.id, h.role] as const); })
      .catch((cause: unknown) => {
        if (cause instanceof SignInRequiredError) { setNeedsLogin(true); return []; }
        setError(cause instanceof Error ? cause.message : String(cause));
        return [];
      });

    void Promise.all([minePromise, loadPublicRetired()])
      .then(([mine, publicRows]) => {
        const roles = new Map<string, RetirementRole>(mine);
        // ★自分の馬を先に、★そのあと他の牧場（★並び順は view が決定論で返した順を保つ）
        const list = [
          ...publicRows.filter((r) => roles.has(r.horseId)).map((r) => toPublicRow(r, roles)),
          ...publicRows.filter((r) => !roles.has(r.horseId)).map((r) => toPublicRow(r, roles)),
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
  const mineRows = (rows ?? []).filter((r) => r.mine);
  const otherRows = (rows ?? []).filter((r) => !r.mine);
  const pick = (id: string): void => { setSelected(id); setExpanded(false); };

  return (
    <div
      data-theme="uma" data-page-body
      className={paused ? 'u-paused' : undefined}
      style={{
        position: 'relative', width: '100%', minHeight: '100dvh', overflow: 'hidden',
        background: 'var(--u-navy)', display: 'flex', flexDirection: 'column',
      }}
    >
      <Backdrop />
      <TopBar title="馬物語帳" backHref="/stable" paused={paused} onToggle={toggle} />
      <RaceStrip />

      {/* ★読み込みの状態（★空を「0 頭」と言い切らない・★芝の上にじかに置かない） */}
      {needsLogin && (
        <TextPanel role="status" style={{ fontSize: 12 }}>
          引退した馬を見るには、<a href="/login" style={{ color: 'var(--u-gold)' }}>ログイン</a>してください。
        </TextPanel>
      )}
      {error !== null && (
        <TextPanel role="alert" style={{ fontSize: 12 }}>{error}</TextPanel>
      )}
      {rows === null && (
        <TextPanel role="status" style={{ fontSize: 12 }}>読み込んでいます…</TextPanel>
      )}
      {rows !== null && rows.length === 0 && !needsLogin && error === null && (
        <TextPanel role="status" style={{ fontSize: 12, lineHeight: 1.7 }}>
          引退した馬はまだいません。現役の馬が年を重ねると、ここに残ります。
        </TextPanel>
      )}

      <main style={{
        position: 'relative', flex: '1 1 auto', minHeight: 0, overflow: 'auto', padding: '10px 14px 0',
        width: '100%', maxWidth: 1220, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 12,
      }}>
        {/* ★LR-2: 所有ではないことを最初に言う（★不安にさせない）＋ ★引退後の役割へ（★第 2 便 A-1） */}
        <div style={{
          flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '10px 12px',
          borderRadius: 12, background: 'rgba(10,35,64,.9)', border: '2px solid rgba(251,247,236,.28)',
        }}>
          <div style={{ flex: '1 1 200px', fontSize: 12, fontWeight: 500, lineHeight: 1.6, color: '#e6eef6' }}>
            現役の 30 頭には数えません。記録は消えません。
          </div>
          <a href="/stable/roles" style={{
            minHeight: 44, display: 'flex', alignItems: 'center', padding: '0 12px', borderRadius: 10,
            background: '#dcf1ef', border: '2px solid #0e7a73', color: '#0e7a73', fontSize: 12, whiteSpace: 'nowrap', textDecoration: 'none',
          }}>
            引退後の役割を選ぶ ›
          </a>
        </div>

        {/* ★1280 は 一覧（1）と 生涯の記録（1.3）が左右・390 は縦に積む */}
        <div style={{ flex: '0 0 auto', display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-start' }}>
          {/* ★引退馬の一覧（★所有とは別の棚） */}
          <section style={{ flex: '1 1 300px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {mineRows.length > 0 && <div style={LIST_HEAD}>自分の牧場の馬</div>}
            {mineRows.map((h) => {
              const sel = h.id === selected;
              return (
                <button
                  type="button"
                  key={h.id}
                  aria-pressed={sel}
                  onClick={() => { pick(h.id); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, minHeight: 52, padding: '6px 12px', borderRadius: 10,
                    background: h.topGrade ? '#fff3d6' : '#fbf7ec', color: '#10243a', textAlign: 'left', font: 'inherit', cursor: 'pointer',
                    border: sel ? '3px solid #f6c21c' : h.topGrade ? '2px solid #a9741a' : '2px solid rgba(251,247,236,.22)',
                  }}
                >
                  <span style={{ flex: '1 1 auto', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={NAME_WRAP}>{h.name}</span>
                    {/* ★役割は `my_retired_horses()` の値をそのまま（★画面で決めない） */}
                    {h.role !== null && (
                      <span style={{ fontSize: 10, fontWeight: 500, color: '#4a6178' }}>{ROLE_LABEL[h.role]}</span>
                    )}
                  </span>
                  <span style={{ flex: '0 0 auto', fontSize: 11, color: h.topGrade ? '#8a5a06' : '#4a6178' }}>{h.summary}</span>
                </button>
              );
            })}

            {/*
              ★D13-4 他人の馬（★出るのは牧場名まで）
              ✅ ★2026-09-25: ★`0083` の `retired_horses_public` で ★**出るようになりました**。
              ★R-26 🔴 3: ★下にあった説明の箱は ★この見出し 1 行にまとめました（★2026-10-01）。
            */}
            {otherRows.length > 0 && (
              <div style={{ ...LIST_HEAD, marginTop: mineRows.length > 0 ? 6 : 0 }}>
                ほかの牧場の馬 <span style={{ fontSize: 10, fontWeight: 500, color: '#cfe0ee' }}>牧場名まで出します</span>
              </div>
            )}
            {otherRows.map((h) => {
              const sel = h.id === selected;
              return (
                <button
                  type="button"
                  key={h.id}
                  aria-pressed={sel}
                  onClick={() => { pick(h.id); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, minHeight: 52, padding: '6px 12px', borderRadius: 10,
                    background: 'rgba(10,35,64,.9)', color: 'var(--u-ink)', textAlign: 'left', font: 'inherit', cursor: 'pointer',
                    border: sel ? '3px solid #f6c21c' : '1px solid rgba(251,247,236,.25)',
                  }}
                >
                  <span style={{ flex: '1 1 auto', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={NAME_WRAP}>{h.name}</span>
                    {/*
                      ★LR-6: ★他人の馬は ★**牧場名まで**（★持ち主の表示名は view が返しません）。
                      ★牧場名が無い馬（★NPC）は ★「持ち主なし」と出します（★空欄にして考えさせない）。
                    */}
                    <span style={{ fontSize: 10, fontWeight: 500, color: '#cfe0ee' }}>{h.stableName ?? '持ち主なし'}</span>
                  </span>
                  <span style={{ flex: '0 0 auto', fontSize: 11, color: '#cfe0ee' }}>{h.summary}</span>
                </button>
              );
            })}
          </section>

          {/* ★1 頭の生涯（★選ばれている馬が無いときは出しません） */}
          {horse !== null && (
            <div style={{ flex: '1.3 1 340px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <section style={PAPER}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', background: '#0a2340', color: '#fbf7ec',
                  borderBottom: '3px solid #f6c21c', flexWrap: 'wrap',
                }}>
                  <span style={{ padding: '1px 8px', borderRadius: 4, background: '#e3e8ec', color: '#4a5a66', fontSize: 10 }}>引退</span>
                  <span style={{ fontSize: 15, overflowWrap: 'anywhere' }}>{horse.name}</span>
                  <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 500, color: '#cfe0ee' }}>{horse.summary}</span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', padding: '4px 12px 8px' }}>
                  {/* ⚠️ ★記録が 0 件でも「無い」と言い切らない（★読めていないのかもしれない） */}
                  {lines.length === 0 && (
                    <div role="status" style={{ padding: '10px 0', fontSize: 12, color: '#4a6178' }}>
                      この馬の記録はまだありません。
                    </div>
                  )}
                  {shown.map((l, i) => {
                    const tone = TYPE_TONE[l.type];
                    return (
                      <div key={`${l.type}-${l.week}-${i}`} style={{ display: 'flex', gap: 10 }}>
                        <div style={{ flex: '0 0 46px', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: l.sameWeekAsPrev ? 0 : 10 }}>
                          {/* ★同じ週の続きは週番号を出さない（★1 グループに見せる） */}
                          {!l.sameWeekAsPrev && <span className="u-num" style={{ fontSize: 14, color: '#4a6178' }}>{l.week}週</span>}
                          <div style={{ flex: '1 1 auto', width: 2, background: '#dcd7c6', marginTop: l.sameWeekAsPrev ? 0 : 4 }} />
                        </div>
                        <div style={{ flex: '1 1 auto', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4, padding: '10px 0' }}>
                          <span style={{ alignSelf: 'flex-start', padding: '1px 8px', borderRadius: 5, fontSize: 10, background: tone.bg, border: `1px solid ${tone.border}`, color: tone.color }}>
                            {STORY_EVENT_LABEL[l.type]}
                          </span>
                          {/* ★文はそのまま出すだけ（★画面で組み立てない・LR-4） */}
                          <span style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.55 }}>{l.text}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {rest > 0 && (
                  <button
                    type="button"
                    onClick={() => { setExpanded(true); }}
                    style={{
                      minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: '#123f6b',
                      background: '#f4f1e6', border: 'none', borderTop: '1px solid #dcd7c6', font: 'inherit', cursor: 'pointer',
                    }}
                  >
                    さらに {rest} 件を表示（全 {lines.length} 件）
                  </button>
                )}
              </section>

              {/*
                ★D13-3 発見（★段だけ・素質の数値は出さない）
                ✅ ★2026-09-25: ★**本物に繋ぎ、軸を正典に合わせました**（★`0084`・裁定 `REVIEW_DISCOVERY_AXES_20260925.md`）。
                🔴 ★それまでは ★**見本のデータ**で、しかも ★**軸が違いました**
                   （★スピード／スタミナ／パワー／賢さ ＝ **能力**。★正典 **D-116** は「距離・馬場・脚質・気性」）。
                ⚠️ ★気性は ★**出しません**（★`RUNAWAY_BASE` が 0 で永久に「？？？」になるため・裁定の答え ③）。
                ⚠️ ★**自分の馬だけ**（★他人の馬に強さの手がかりを配らない・D-114・裁定の答え ⑤）。
                ★R-26: ★1 頭の詳細（②）と同じ部品で ★生涯の記録の下に置きます。
              */}
              {discovery !== null && (
                <section style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 12, borderRadius: 12, background: '#fbf7ec', color: '#10243a' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 14 }}>分かってきたこと</span>
                    <span style={{ fontSize: 10, fontWeight: 500, color: '#4a6178' }}>レースを終えるたびに、少しずつ分かります</span>
                  </div>
                  {discovery.map((d) => {
                    /** ★段は `@star/sim-engine` が回数から決めます（★画面で決めない・D-108 ②） */
                    const stage = discoveryStageOf(d.runs);
                    const stages = ['unknown', 'hint', 'narrow', 'known'] as const;
                    const reached = stages.indexOf(stage);
                    const tone = ['#c3ccd4', '#6b3fc4', '#1a6fd4', '#1e7a3a'][reached] ?? '#c3ccd4';
                    /**
                     * ⚠️ ★脚質は ★**「試した回数」**です（★裁定の答え ④）。
                     *    ★「向く」と書くと ★素質の手がかりになります（★D-114）。
                     */
                    const isStrategy = d.axis === 'strategy';
                    return (
                      <div key={`${d.axis}-${d.label}`} style={{ display: 'flex', flexDirection: 'column', gap: 5, padding: '8px 10px', borderRadius: 8, background: '#fffdf6', border: '1px solid #dcd7c6' }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                          <span style={{ fontSize: 13 }}>{d.label}</span>
                          {isStrategy ? (
                            // ★脚質は ★**事実だけ**（★段の言葉を出さない）
                            <span style={{ marginLeft: 'auto', fontSize: 12, color: '#4a6178' }}>
                              {d.runs} 回 試しました
                            </span>
                          ) : (
                            /* ★`known` のときだけ評価そのもの（★数値は段によらず出さない） */
                            <span style={{ marginLeft: 'auto', fontSize: 12, color: tone }}>{discoveryLabelOf(stage, '評価: A')}</span>
                          )}
                        </div>
                        {!isStrategy && (
                          <div style={{ display: 'flex', gap: 4 }}>
                            {stages.map((s, i) => (
                              <div key={s} style={{ flex: '1 1 0', height: 7, borderRadius: 3, background: i <= reached ? tone : '#e3ecf3' }} />
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </section>
              )}
            </div>
          )}
        </div>
      </main>

      {/* ★下段（★戻るだけの画面・R-26 §0） */}
      <div style={{
        position: 'relative', flex: '0 0 auto', display: 'flex', flexWrap: 'wrap', gap: 10,
        padding: '10px 14px var(--u-safe-bottom)', width: '100%', maxWidth: 1220, margin: '0 auto',
      }}>
        <BigButton tone="ivory" label="わたしの馬" href="/stable" />
      </div>
    </div>
  );
}
