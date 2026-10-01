'use client';

import { useCallback, useEffect, useState } from 'react';
import { STABLE_GRADE_LABEL } from '@star/training';
import { conditionView, fatigueStepOf, type HorseDetail, type RaceRow, type TrainingRow } from '../../../lib/stable';
import { SetupRequiredError, SignInRequiredError, UNKNOWN_NAME, supabaseStableRepo } from '../../../lib/stable-repo';
import { loadDiscovery, type DiscoveryRow } from '../../../lib/discovery-screen';
import { Backdrop, BigButton, TextPanel, TopBar, useMotionPaused } from '../../../components/uma/uma-parts';
import { RaceStrip } from '../../../components/uma/race-strip';
import { HorseDetailDiscovery } from '../../../components/uma/horse-detail-discovery';
import { StableGradePanel } from '../../../components/stable-grade-panel';

/**
 * 🔴 ⚠️ ★**ここに `export const revalidate` を書かないこと。**
 *   ★これは ★`'use client'` の部品です。★Next は ★クライアント部品の `revalidate` を ★**拒みます**。
 *   ✔ ★2026-09-21 に ★`/stable` の `revalidate = 0` で ★**Vercel のビルドが落ち続け、
 *     ★本番が 31 コミット 古い版を配信していました**（★型検査は通ります ＝ 型としては正しい `number`）。
 *   → ★必要なら ★**殻（`page.tsx`・サーバー部品）**の側に書きます。
 */

/**
 * ★**1 頭の詳細**（★R-26・2026-10-01・引き渡し資料 `design_handoff_r26` D26-3 ②）
 *
 * 【★骨格】★`Backdrop`・`TopBar`（馬名・‹ 戻る → `/stable`）・`RaceStrip`・★紙と紺のパネル・★下段の `BigButton` 2 つ。
 *   ★スマホの「履歴書型」と PC の表を ★**分けず、1 つの作りで並びだけ変えます**（★`flex-wrap`）。
 *   ★1280 では ★上の板と「分かってきたこと」が左右、★表は全幅。
 *
 * 【🔴 ★R-26 で外したもの】（★素質や能力を数値で出さない・D-114 / D-116）
 *   ① ★「現在値」の 5 本のバー（value / cap）・★「合計 / 上限」・★「上限は素質★から決まります」
 *   ② ★「適性」の ◎○△（★素質の手がかり）→ ★かわりに「分かってきたこと」
 *   ③ ★インブリード係数の数値（★クロスの色分けと名前は残す）
 *   ④ ★調教の記録の「疲労 +12」→ ★疲れの札（言葉）
 *   ⑥ ★勝率 n%
 *   ★⑤ ★「調教を指示する」「出走登録」の準備中 → ★`/train`・`/entry` へ繋ぎました。
 *
 * ⚠️ ★表示だけ。★昇格の条件（`promotionHint`）はデータ層の文をそのまま出します（★画面で作らない）。
 * ⚠️ ★獲得賞金は PP・★出走料は EP（★合算しない・憲法 §0.2）。
 */

/** ★紙のパネル（★引き渡し資料 §0「表は紙パネル `#fbf7ec`」） */
const PAPER: React.CSSProperties = {
  flex: '0 0 auto', borderRadius: 12, background: 'var(--u-paper)', color: 'var(--u-ink-dark)',
  overflow: 'hidden', border: '2px solid rgba(246,194,28,.45)',
};
/** ★紙のパネルの見出し帯（★`#0a2340`＋金の下線 3px） */
const PAPER_HEAD: React.CSSProperties = {
  display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', padding: '9px 12px',
  background: 'var(--u-navy)', color: 'var(--u-ink-light)', borderBottom: '3px solid var(--u-gold)',
};
const PAPER_HEAD_SUB: React.CSSProperties = { fontSize: 11, fontWeight: 500, color: 'var(--u-ink-light-3)' };
/** ★パネルの下の「すべて見る」（★当たり 44px） */
const MORE: React.CSSProperties = {
  width: '100%', minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center',
  border: 'none', borderTop: '1px solid var(--u-rule-2)', background: 'var(--u-paper-2)', color: 'var(--u-edge)', fontSize: 12,
};
/** ★紺の板の札（★性齢・毛色・厩舎・父） */
const CHIP: React.CSSProperties = {
  padding: '3px 9px', borderRadius: 6, background: 'var(--u-navy-deep)', border: '1px solid rgba(251,247,236,.25)', fontSize: 11,
};
/** ★戦績の新しい順に出す行数・★調教の記録の週数（★引き渡し資料「新しい順に 4 行」「直近 4 週」） */
const RECENT_ROWS = 4;

/** ★調子のゲージの色（★5 段）と ★疲れのゲージの色（★3 段）・★空き */
const COND_ON = 'var(--u-ep)';
const FAT_ON = 'var(--u-orange)';
const GAUGE_OFF = 'rgba(251,247,236,.22)';

/** ★疲れの札の色（★疲れなし・少し残る・たまっている） */
const FAT_TAG: readonly { readonly bg: string; readonly ink: string }[] = [
  { bg: '#e4efe7', ink: '#1e7a3a' },
  { bg: '#f6e7cf', ink: '#6b4506' },
  { bg: '#f6ddd9', ink: '#8a1f16' },
];

/** ★重賞・オープンの格の札は金（★一覧と同じ見え方） */
const isTopGrade = (grade: string): boolean => grade.startsWith('重賞') || grade.startsWith('オープン');

/** ★5 代の血統表（★今の表をそのまま。★クロスは明るい地用の濃色 2 色まで） */
const PED_FLEX = ['1.3', '1.14', '1', '1', '1'];
/** 明るい地では 32 段も 12px（11px にしない） */
const PED_FONT = [15, 14, 13, 12, 12];
/** クロスの着色は明るい地用の濃色 2 色まで（文字・左バー／地）。3 組目以降は凡例に名前だけ */
const CROSS_PALETTE: readonly { readonly ink: string; readonly bg: string }[] = [
  { ink: '#0f6fb8', bg: '#e0eefa' },
  { ink: '#b3306e', bg: '#fbe4ee' },
];

function Pedigree5({ horse }: { readonly horse: HorseDetail }): React.ReactElement {
  const colorOf = new Map(horse.crosses.slice(0, CROSS_PALETTE.length).map((c, i) => [c.name, CROSS_PALETTE[i]!]));
  return (
    <>
      {/* ★クロスの凡例（★名前と組み合わせだけ。★係数の数値は出さない・R-26 🔴 3） */}
      {horse.crosses.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: '8px 12px', borderTop: '1px solid var(--u-rule-2)' }}>
          {horse.crosses.map((c, i) => {
            const pal = CROSS_PALETTE[i];
            return (
              <span key={c.name} style={{
                display: 'inline-flex', alignItems: 'center', minHeight: 26, padding: '0 10px', borderRadius: 6, fontSize: 12,
                background: pal?.bg ?? 'transparent', border: pal !== undefined ? `2px solid ${pal.ink}` : '1px solid var(--u-rule-2)',
                color: pal?.ink ?? 'var(--u-ink-dark-3)',
              }}>{c.name} {c.label}</span>
            );
          })}
        </div>
      )}
      {/* ★5 列は狭い幅で潰れるので、★表の中だけ横に送る（★ページは横に送らない） */}
      <div style={{ overflowX: 'auto', borderTop: '1px solid var(--u-rule-2)' }}>
        <div style={{ display: 'flex', height: 704, minWidth: 600 }}>
          {horse.pedigree.map((col, gi) => (
            <div key={gi} style={{ flex: PED_FLEX[gi] ?? '1', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              {col.map((name, i) => {
                // ★1 代目（父・母）には付けない
                const cross = gi === 0 ? undefined : colorOf.get(name);
                return (
                  <div key={i} style={{
                    flex: 1, display: 'flex', alignItems: 'center', padding: '0 8px', minWidth: 0,
                    borderLeft: '1px solid var(--u-rule-2)', borderBottom: '1px solid var(--u-rule-2)',
                    background: cross !== undefined ? cross.bg : i % 2 === 1 ? 'var(--u-paper-2)' : 'var(--u-paper-3)',
                    boxShadow: cross !== undefined ? `inset 4px 0 0 ${cross.ink}` : undefined,
                  }}>
                    <span style={{
                      fontSize: PED_FONT[gi] ?? 12, fontWeight: gi < 2 ? 800 : 700, color: cross !== undefined ? cross.ink : 'var(--u-ink-dark)',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>{name}</span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

/** ★2 代の血統（★父・母は大きく、★祖父母 4 頭は小さく・★縦線 2px） */
function Pedigree2({ horse }: { readonly horse: HorseDetail }): React.ReactElement {
  const parents = horse.pedigree[0] ?? [];
  const grand = horse.pedigree[1] ?? [];
  const PARENT_ROLE = ['父', '母'];
  const GRAND_ROLE = ['父の父', '父の母', '母の父', '母の母'];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)' }}>
      {[0, 1].map((p) => (
        <div key={p} style={{ display: 'contents' }}>
          <div style={{
            gridRow: 'span 2', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 2, padding: '10px 12px',
            borderRight: '2px solid var(--u-rule-2)', borderBottom: p === 0 ? '1px solid var(--u-rule-2)' : undefined, background: 'var(--u-paper-3)',
          }}>
            <span style={{ fontSize: 10, color: 'var(--u-ink-dark-2)' }}>{PARENT_ROLE[p]}</span>
            <span style={{ fontSize: 14, overflowWrap: 'anywhere' }}>{parents[p] ?? '—'}</span>
          </div>
          {[0, 1].map((g) => {
            const gi = p * 2 + g;
            return (
              <div key={gi} style={{ padding: '8px 12px', borderBottom: gi < 3 ? '1px solid var(--u-rule-2)' : undefined, background: '#f6f2e4' }}>
                <div style={{ fontSize: 10, color: 'var(--u-ink-dark-2)' }}>{GRAND_ROLE[gi]}</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--u-ink-dark-3)', overflowWrap: 'anywhere' }}>{grand[gi] ?? '—'}</div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/** ★数字を出さない段のゲージ（★調子 5 段・疲れ 3 段） */
function StepGauge({ steps, on, color }: { readonly steps: number; readonly on: number; readonly color: string }): React.ReactElement {
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {Array.from({ length: steps }, (_, i) => (
        <div key={i} style={{ flex: '1 1 0', height: 8, borderRadius: 2, background: i < on ? color : GAUGE_OFF }} />
      ))}
    </div>
  );
}

function RaceLine({ r, odd }: { readonly r: RaceRow; readonly odd: boolean }): React.ReactElement {
  const top = isTopGrade(r.grade);
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, minHeight: 50, padding: '5px 12px',
      borderBottom: '1px solid var(--u-rule)', background: odd ? 'var(--u-paper-2)' : 'var(--u-paper)',
    }}>
      <div style={{ flex: '0 0 34px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <span className="u-num" style={{ fontSize: 22, color: r.place === 1 ? 'var(--u-gold-ink)' : 'var(--u-ink-dark)' }}>{r.place}</span>
        <span style={{ fontSize: 9, color: 'var(--u-ink-dark-2)' }}>着</span>
      </div>
      <div style={{ flex: '1 1 auto', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 14 }}>{r.race}</span>
          <span style={{
            padding: '0 6px', borderRadius: 3, fontSize: 10, whiteSpace: 'nowrap',
            background: top ? 'var(--u-gold-pale)' : '#e8eef3', color: top ? '#4a3105' : 'var(--u-ink-dark-3)',
          }}>{r.grade}</span>
        </div>
        <span style={{ fontSize: 10, fontWeight: 500, color: 'var(--u-ink-dark-2)' }}>{r.week ?? '—'}週 ・ {r.cond} ・ {r.time}</span>
      </div>
      {/* ⚠️ ★1 走の賞金が読めない間（`null`）は ★欄ごと出さない（★0 PP と書くと「賞金なし」に見える・PR-1） */}
      {r.prizePP !== null && (
        <div style={{ flex: '0 0 auto', display: 'flex', alignItems: 'baseline', gap: 2 }}>
          <span className="u-num" style={{ fontSize: 16, color: r.prizePP > 0 ? 'var(--u-ink-dark)' : '#9fb0bd' }}>{r.prizePP.toLocaleString('ja-JP')}</span>
          <span style={{ fontSize: 9, color: 'var(--u-ink-dark-2)' }}>PP</span>
        </div>
      )}
    </div>
  );
}

/**
 * ★調教の記録の 1 行。
 * ⚠️ ★行が持つのは ★**疲れの増減（`fatigueDelta`）だけ**で、★その週の疲れの段（水準）は持っていません。
 *    ★増減を `fatigueStepOf` の境目（★水準の 30／60）に当てると ★**意味が違う数を比べる**ことになるので当てません。
 *    → ★札は ★**向きだけを言葉で**出します（★数値は出さない・R-26 🔴 4）。★段で出すには ★行に水準が要ります。
 */
function TrainingLine({ t }: { readonly t: TrainingRow }): React.ReactElement {
  const tag = t.fatigueDelta > 0 ? { word: '疲れが残る', ...FAT_TAG[1]! } : { word: '疲れが抜けた', ...FAT_TAG[0]! };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, padding: '4px 12px', borderBottom: '1px solid var(--u-rule)', fontSize: 12 }}>
      <span className="u-num" style={{ flex: '0 0 54px', fontSize: 14, color: 'var(--u-ink-dark-2)' }}>{t.week}週</span>
      <span style={{ flex: '0 0 92px', fontSize: 13 }}>{t.menu}</span>
      <span style={{ flex: '1 1 auto', minWidth: 0, fontWeight: 500, color: 'var(--u-ink-dark-3)' }}>{t.note}</span>
      <span style={{ flex: '0 0 auto', padding: '1px 7px', borderRadius: 4, fontSize: 10, background: tag.bg, color: tag.ink }}>{tag.word}</span>
    </div>
  );
}

export function HorseDetailView({ horseId }: { readonly horseId: string }): React.ReactElement {
  const [h, setH] = useState<HorseDetail | null>(null);
  const [discovery, setDiscovery] = useState<readonly DiscoveryRow[] | null>(null);
  /** ★4 つの状態（★空を「無い」と言い切らない・★裁定 §5 条件 2） */
  const [state, setState] = useState<'loading' | 'ok' | 'login' | 'setup' | 'missing' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [allRaces, setAllRaces] = useState(false);
  const [ped5, setPed5] = useState(false);
  const [paused, toggle] = useMotionPaused();

  const reload = useCallback((): void => {
    supabaseStableRepo.horse(horseId)
      .then((fresh) => {
        if (fresh === null) { setState('missing'); return; }
        setH(fresh); setState('ok');
      })
      .catch((cause: unknown) => {
        if (cause instanceof SignInRequiredError) { setState('login'); return; }
        if (cause instanceof SetupRequiredError) { setState('setup'); return; }
        setError(cause instanceof Error ? cause.message : String(cause));
        setState('error');
      });
  }, [horseId]);

  useEffect(() => { reload(); }, [reload]);

  /**
   * ★発見の行（★`0084`・D-108・D-116）。
   * ⚠️ ★口が ★**自分の馬だけ**を許します。★他人の馬なら落ちるので、★節を出しません
   *    （★裁定 §5 条件 3「他人の馬に素質や発見度を出さない」）。
   */
  useEffect(() => {
    if (state !== 'ok') { setDiscovery(null); return; }
    let active = true;
    loadDiscovery(horseId)
      .then((ds) => { if (active) setDiscovery(ds); })
      .catch(() => { if (active) setDiscovery(null); });
    return () => { active = false; };
  }, [state, horseId]);

  /** ★骨格（★どの状態でも芝＋紺・上段バー・帯） */
  const frame = (title: string, body: React.ReactNode, buttons: React.ReactNode): React.ReactElement => (
    <div data-theme="uma" data-page-body className={paused ? 'u-paused' : undefined} style={{
      position: 'relative', width: '100%', minHeight: '100dvh', overflow: 'hidden', background: 'var(--u-navy)',
      display: 'flex', flexDirection: 'column',
    }}>
      <Backdrop />
      <TopBar title={title} backHref="/stable" paused={paused} onToggle={toggle} />
      <RaceStrip />
      {body}
      {buttons}
    </div>
  );

  if (h === null || state !== 'ok') {
    const note = state === 'loading' ? '読み込んでいます…'
      : state === 'login' ? <>この馬を見るには、<a href="/login" style={{ color: 'var(--u-gold)' }}>ログイン</a>してください。</>
        : state === 'setup' ? <>牧場の初回設定が必要です。<a href="/setup" style={{ color: 'var(--u-gold)' }}>設定へ</a></>
          : state === 'missing' ? 'この馬は見つかりませんでした。'
            : (error ?? '読み込めませんでした。');
    return frame('馬の詳細', <TextPanel role={state === 'error' ? 'alert' : 'status'} style={{ padding: 14 }}>{note}</TextPanel>, null);
  }

  const cond = conditionView(h.condition);
  const fat = fatigueStepOf(h.fatigue);
  /** ★父の名前が読めなかった枠（`UNKNOWN_NAME`）は ★札にしない（★「父 —」を出さない） */
  const sireRaw = h.pedigree[0]?.[0];
  const sire = sireRaw === UNKNOWN_NAME ? undefined : sireRaw;
  /** ★新しい順（★週の大きい順） */
  /** ★週の無い行（★`0046` より前）は末尾へ（★`sort` は安定なので ★データ層の新しい順を保つ） */
  const races = [...h.races].sort((a, b) => (b.week ?? -1) - (a.week ?? -1));
  /** ★5 代の表は ★3 代より先が在るときだけ開ける（★本物は 2 代まで・`pedigreeRowsOf`） */
  const hasPed5 = h.pedigree.length > 2;
  const shownRaces = allRaces ? races : races.slice(0, RECENT_ROWS);
  const training = [...h.training].sort((a, b) => b.week - a.week).slice(0, RECENT_ROWS);

  const body = (
    <div style={{
      position: 'relative', flex: '1 1 auto', minHeight: 0, display: 'flex', flexDirection: 'column', gap: 12,
      padding: '10px 14px 0', width: '100%', maxWidth: 1220, margin: '0 auto', overflow: 'auto',
    }}>
      {/* ★上の段（★1280 では 上の板と「分かってきたこと」が左右） */}
      <div style={{ flex: '0 0 auto', display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-start' }}>
        <section style={{
          flex: '1 1 320px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10, padding: 12,
          borderRadius: 12, background: 'rgba(10,35,64,.92)', border: '2px solid rgba(246,194,28,.55)',
        }}>
          {/* ★板の最初の要素は格（★馬名より先に読ませる）。★次の格の条件は `promotionHint` の文をそのまま */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{
              height: 30, padding: '0 12px', display: 'flex', alignItems: 'center', borderRadius: 7, border: '2px solid var(--u-navy)',
              backgroundImage: 'var(--u-gold-plate)', color: 'var(--u-ink-dark)', fontSize: 15, whiteSpace: 'nowrap',
            }}>{h.classLabel}</span>
            {h.nextClassLabel !== null && (
              <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--u-ink-light-3)' }}>
                次の格 {h.nextClassLabel}{h.promotionHint !== null && <> — {h.promotionHint}</>}
              </span>
            )}
          </div>
          <h1 style={{ margin: 0, fontSize: 26, lineHeight: 1.2, fontWeight: 800, overflowWrap: 'anywhere' }}>{h.name}</h1>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {/* ★厩舎の格（★`StableGradePanel` を移した・R-26 D26-3 ① 🔴 4）。★名前は `@star/training` から */}
            {[h.sexAge, h.coat, h.stableName, `厩舎の格 ${STABLE_GRADE_LABEL[h.stableGrade]}`, ...(sire !== undefined ? [`父 ${sire}`] : [])].filter((t) => t !== '').map((t) => (
              <span key={t} style={CHIP}>{t}</span>
            ))}
          </div>
          {/* ⚠️ ★素質の行は 2026-09-18 に取りました（★D-114 ②）。★勝率も出しません（★R-26 🔴 6） */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {/**
              * ★獲得賞金は ★0 のとき出さない（★2026-10-01）。★賞金の合計を読む口が まだ無く（★`horse_total_prize_pp` は閉じている）
              *   ★常に 0 が来るので、★全頭に「0 PP」と出ていた（★事実と違う）。★読めるようになれば 賞金のある馬にだけ出る。
              */}
            {h.prizePP > 0 && <div style={{
              flex: '1 1 140px', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 10,
              border: '2px solid var(--u-gold)', background: 'rgba(30,22,4,.82)',
            }}>
              <span style={{ flex: '0 0 auto', width: 11, height: 11, transform: 'rotate(45deg)', border: '3px solid var(--u-gold)' }} />
              <span style={{ flex: '1 1 auto', fontSize: 11, color: '#fff3cd' }}>獲得賞金</span>
              <span className="u-num" style={{ fontSize: 22, color: '#fff3cd' }}>{h.prizePP.toLocaleString('ja-JP')}</span>
              <span style={{ fontSize: 10, color: '#fff3cd' }}>PP</span>
            </div>}
            <div style={{
              flex: '1 1 140px', display: 'flex', alignItems: 'baseline', gap: 4, padding: '8px 10px', borderRadius: 10,
              background: 'var(--u-navy-deep)', border: '1px solid rgba(251,247,236,.22)', flexWrap: 'wrap',
            }}>
              <span style={{ fontSize: 11, color: 'var(--u-ink-light-3)', marginRight: 'auto' }}>戦績</span>
              <span className="u-num" style={{ fontSize: 22 }}>{h.starts}</span><span style={{ fontSize: 11 }}>戦</span>
              <span className="u-num" style={{ fontSize: 22, color: 'var(--u-gold-pale)' }}>{h.wins}</span><span style={{ fontSize: 11 }}>勝</span>
              <span style={{ fontSize: 10, color: 'var(--u-ink-light-3)', marginLeft: 4 }}>2着 {h.seconds} ・ 3着 {h.thirds}</span>
            </div>
          </div>
          {/* ★調子 5 段・疲れ 3 段（★言葉とゲージだけ・数字は出さない） */}
          <div style={{
            display: 'grid', gridTemplateColumns: 'auto minmax(0,1fr) auto', gap: '8px 10px', alignItems: 'center',
            padding: 10, borderRadius: 10, background: 'var(--u-navy-deep)',
          }}>
            <span style={{ fontSize: 11, color: 'var(--u-ink-light-3)' }}>調子</span>
            <StepGauge steps={5} on={h.condition} color={COND_ON} />
            <span style={{ fontSize: 12 }}>{cond.label}</span>
            <span style={{ fontSize: 11, color: 'var(--u-ink-light-3)' }}>疲れ</span>
            <StepGauge steps={3} on={fat.steps} color={FAT_ON} />
            <span style={{ fontSize: 12 }}>{fat.word}</span>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 12, fontWeight: 700, color: 'var(--u-ink-light-3)' }}>
            <span>今週 <span style={{ color: 'var(--u-ink-light)' }}>{h.week.kind === 'done' ? h.week.menu : h.week.kind === 'rest' ? '休養' : '未指示'}</span></span>
            <span>次走 <span style={{ color: 'var(--u-ink-light)' }}>{h.nextRace ?? '未定'}</span></span>
            {h.entryFeeEP !== null && (
              <span>出走料 <span className="u-num" style={{ fontSize: 15, color: 'var(--u-ink-light)' }}>{h.entryFeeEP.toLocaleString('ja-JP')}</span> EP</span>
            )}
          </div>
        </section>

        {/* ★分かってきたこと（★自分の馬だけ。★口が他人の馬を拒むと `null` のまま ＝ 出さない） */}
        {discovery !== null && discovery.length > 0 && <HorseDetailDiscovery rows={discovery} />}
      </div>

      {/* ★戦績（★新しい順に 4 行 ＋ すべて見る） */}
      <section style={PAPER}>
        <div style={PAPER_HEAD}>
          <span style={{ fontSize: 14 }}>戦績</span>
          <span style={PAPER_HEAD_SUB}>新しい順 ・ {h.starts} 戦</span>
        </div>
        {shownRaces.map((r, i) => <RaceLine key={`${r.week}-${i}`} r={r} odd={i % 2 === 1} />)}
        {races.length === 0 && <p style={{ margin: 0, padding: '12px', fontSize: 13 }}>まだ出走していません。出走登録から初戦を選べます</p>}
        {races.length > RECENT_ROWS && (
          <button type="button" onClick={() => { setAllRaces((v) => !v); }} aria-expanded={allRaces} style={MORE}>
            {allRaces ? '新しい 4 戦だけにする' : `戦績をすべて見る（${h.starts} 戦）`}
          </button>
        )}
      </section>

      {/* ★血統表（★2 代 ＋ 5 代は今の表を開く・★クロスの色分けは残す） */}
      <section style={PAPER}>
        <div style={PAPER_HEAD}>
          <span style={{ fontSize: 14 }}>血統表</span>
          <span style={PAPER_HEAD_SUB}>{ped5 && hasPed5 ? '5 代' : hasPed5 ? '2 代まで ・ 5 代は「すべて見る」' : '2 代まで'}</span>
        </div>
        {h.pedigree.length === 0 ? (
          <p style={{ margin: 0, padding: '12px', fontSize: 13 }}>血統情報が登録されていません</p>
        ) : (
          <>
            {ped5 && hasPed5 ? <Pedigree5 horse={h} /> : <Pedigree2 horse={h} />}
            {/* ⚠️ ★3 代より先が無いのに 5 代の表を開くと ★2 列だけの表になる（★押せるのに中身が無い）→ ★出さない */}
            {hasPed5 && (
              <button type="button" onClick={() => { setPed5((v) => !v); }} aria-expanded={ped5} style={MORE}>
                {ped5 ? '2 代の表にもどす' : '5 代の血統表を見る'}
              </button>
            )}
          </>
        )}
      </section>

      {/*
        ★調教の記録（★直近 4 週・★疲れは札の言葉）。
        ⚠️ ★行が無いときは ★節ごと出しません（★2026-10-01）。★本物の詳細は ★調教の記録を読む口が無く ★いつも空で、
           ★「今週が最初の週です」と出すと ★**調教してきた馬にも嘘**になります（★`stable-repo.ts` の `MISSING`）。
      */}
      {training.length > 0 && (
        <section style={PAPER}>
          <div style={PAPER_HEAD}>
            <span style={{ fontSize: 14 }}>調教の記録</span>
            <span style={PAPER_HEAD_SUB}>直近 4 週</span>
          </div>
          {training.map((t, i) => <TrainingLine key={`${t.week}-${i}`} t={t} />)}
        </section>
      )}

      {/*
        ★厩舎の格（★`/stable` から移した・R-26 D26-3 ① 🔴 4）。
        ⚠️ ★部品はそのまま使います（★倍率・値段は `@star/training` から引く・★画面に表を持たない）。
      */}
      <section style={{ ...PAPER, padding: '0 12px 14px' }}>
        <StableGradePanel horseName={h.name} grade={h.stableGrade} />
      </section>
    </div>
  );

  /** ★下段（★調教は育成モードで・★出走登録は `/entry` で） */
  const buttons = (
    <div style={{
      position: 'relative', flex: '0 0 auto', display: 'flex', flexWrap: 'wrap', gap: 10,
      padding: '10px 14px var(--u-safe-bottom)', width: '100%', maxWidth: 1220, margin: '0 auto',
    }}>
      <BigButton tone="gold" label={h.week.kind === 'done' ? '指示を変更する' : '調教を指示する'} sub="育成モードで" href="/train" grow="1.4 1 210px" />
      <BigButton tone="ivory" label="出走登録" sub="次走を選ぶ" href="/entry" grow="1 1 140px" />
    </div>
  );

  return frame(h.name, body, buttons);
}
