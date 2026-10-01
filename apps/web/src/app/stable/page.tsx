'use client';

/**
 * ★**わたしの馬**（★持ち馬の一覧）— ★引き渡し資料 R-26 **D26-3 ①**（`out/r26/design_handoff_r26/README.md`・見本 `R26Screen.dc.html` の `stable`）
 *
 * 【★2026-10-01: ★馬物語の部品で組み直しました】（★R-26）
 *   ★`Backdrop`・`TopBar`（‹ 戻る → `/home`）・`RaceStrip`・★紙のカード・★下段の `BigButton`。
 *   ★`shell-routes.ts` の `OWN_HEADER` に入れて ★白い旧い枠を外しました。
 *   ★外したもの（★🔴 直すこと）:
 *     ① ★4 枚のカード（★アカウント・わたしの牧場・開催状況・ショートカット）— ★ホームと重なる
 *     ② ★「週を進める」（★R-24）
 *     ③ ★疲労のバーと ★「今週の消費予定 n EP」 → ★疲れは 3 段の言葉
 *     ④ ★厩舎の格の板（`StableGradePanel`）→ ★1 頭の詳細へ移す（★この画面からは外すだけ）
 *   ★変えていないもの: ★読み込み（`supabaseStableRepo.stable()`・★`useStableView` 経由）・★`sortStable` の並び・★行き先。
 *
 * 🔴 ★**見本に落とさない**（★2026-09-25・裁定 `REVIEW_OWNER_SCOPE_AND_STUD_FEE_20260925.md` §2）。
 *   ★未ログイン・牧場がまだ・読めなかった・0 頭は ★`NoHorseCard`（★D26-2・ホームと育成モードと同じ）。★馬は出しません。
 *
 * 【★この画面が持たないもの】
 *   ⚠️ ★**素質・能力・上限・★の数を出しません**（★D-114）。★調子は 5 段・疲れは 3 段の言葉だけ（★数字なし）。
 *   ⚠️ ★所有上限は `OWNERSHIP_LIMITS.active`（★画面に数を直書きしない・D-052）。
 *   ⚠️ ★毛色は `@star/render` の `coatOfHorseId` / `coatCssFilter`（★画面で色表を持たない）。
 *   ⚠️ ★`Date.now()` / `Math.random()` を使いません（★憲法 4）。
 */
import type React from 'react';
import { useEffect, useState } from 'react';
import { conditionView, fatigueStepOf, sortStable, type StableHorse } from '../../lib/stable';
import { loadRetiredScreen } from '../../lib/retired-screen';
import { SignInRequiredError } from '../../lib/stable-repo';
import { STABLE_GRADE_LABEL, type StableGrade } from '@star/training';
import { OWNERSHIP_LIMITS } from '@star/scheduler';
import { coatCssFilter, coatOfHorseId } from '@star/render';
import { Backdrop, BigButton, TextPanel, TopBar, useMotionPaused } from '../../components/uma/uma-parts';
import { RaceStrip } from '../../components/uma/race-strip';
import { useStableView } from '../../components/uma/use-stable-view';
import { NoHorseCard } from '../../components/uma/no-horse-card';

/**
 * ★**格ごとの色**（★D12-6・デザイナーのカード `components/stable-roster`・★R-26 でも「今の `GRADE_TONE`」）。
 * ⚠️ ★**名前（ブロンズ等）は持ちません** — ★`STABLE_GRADE_LABEL` から引きます（★D-052）。
 */
const GRADE_TONE: Readonly<Record<StableGrade, { readonly bg: string; readonly border: string; readonly color: string }>> = {
  bronze: { bg: '#f3e9dd', border: '#8a6a4a', color: '#5a4326' },
  silver: { bg: '#eef2f6', border: '#6b7d8c', color: '#33414c' },
  gold: { bg: '#fff3d6', border: '#a9741a', color: '#4a3105' },
};


/** ★今週の札（★未指示 ／ 指示済み ・ 献立 ／ 休養中） */
function weekPill(h: StableHorse): { readonly text: string; readonly bg: string; readonly ink: string } {
  if (h.week.kind === 'done') return { text: `指示済み ・ ${h.week.menu}`, bg: '#e4efe7', ink: '#1e7a3a' };
  if (h.week.kind === 'rest') return { text: '休養中', bg: '#e7e9ec', ink: '#4a5a66' };
  return { text: '未指示', bg: 'var(--u-gold-pale)', ink: 'var(--u-ink-dark)' };
}

/** ★上の丸札（★紺の地・`padding:7px 12px; border-radius:999px`） */
const PILL: React.CSSProperties = {
  display: 'flex', alignItems: 'baseline', gap: 5, padding: '7px 12px', borderRadius: 999,
  background: 'var(--u-panel-strong)',
};

/** ★1 頭のカード（★押すと 1 頭の詳細へ） */
function HorseCard({ horse: h }: { readonly horse: StableHorse }): React.ReactElement {
  const todo = h.week.kind === 'todo';
  const rest = h.week.kind === 'rest';
  const pill = weekPill(h);
  const tone = GRADE_TONE[h.stableGrade];
  /** ★毛色の丸: ★地は鹿毛（★素材そのもの）・★毛色の差は `coatCssFilter` が掛ける（★`/train` の馬と同じ式） */
  const coatFilter = coatCssFilter(coatOfHorseId(h.id));
  return (
    <a href={`/stable/${h.id}`} style={{
      display: 'flex', gap: 10, alignItems: 'stretch', padding: '10px 12px', borderRadius: 12,
      background: 'var(--u-paper)', color: 'var(--u-ink-dark)',
      border: todo ? '3px solid var(--u-gold)' : '3px solid rgba(251,247,236,.22)',
      boxShadow: todo ? '0 4px 0 var(--u-gold-ink)' : 'var(--u-shadow-card)',
      opacity: rest ? 0.75 : 1,
    }}>
      <span aria-hidden style={{ flex: '0 0 auto', width: 44, height: 44, borderRadius: '50%', border: '3px solid var(--u-ink-dark)', overflow: 'hidden' }}>
        <span style={{ display: 'block', width: '100%', height: '100%', background: '#86502f', ...(coatFilter === undefined ? {} : { filter: coatFilter }) }} />
      </span>
      <span style={{ flex: '1 1 auto', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 5 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {/* ★名前は省略記号で切らない（★2 行まで折り返す） */}
          <span style={{ fontSize: 16, lineHeight: 1.3, overflowWrap: 'anywhere' }}>{h.name}</span>
          <span style={{ padding: '1px 7px', borderRadius: 4, background: 'var(--u-navy)', color: 'var(--u-gold-pale)', fontSize: 10, whiteSpace: 'nowrap' }}>{h.classLabel}</span>
          {/* ★厩舎の格（★D12-6）。★名前は `@star/training` から引く（★画面に表を持たない） */}
          <span style={{ padding: '1px 7px', borderRadius: 4, background: tone.bg, border: `1px solid ${tone.border}`, color: tone.color, fontSize: 10, whiteSpace: 'nowrap' }}>
            {STABLE_GRADE_LABEL[h.stableGrade]}
          </span>
        </span>
        {/* ★調子は 5 段・疲れは 3 段の言葉だけ（★数字は出さない・D-114・R-24） */}
        <span style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', fontSize: 11, fontWeight: 700, color: 'var(--u-ink-dark-2)' }}>
          <span>{h.sexAge}</span>
          <span>調子 <span style={{ color: 'var(--u-ink-dark)' }}>{conditionView(h.condition).label}</span></span>
          <span>疲れ <span style={{ color: 'var(--u-ink-dark)' }}>{fatigueStepOf(h.fatigue).word}</span></span>
        </span>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--u-ink-dark-2)' }}>
          次走 <span style={{ color: 'var(--u-ink-dark)' }}>{h.nextRace ?? (h.classLabel === '新馬' ? 'デビュー戦 未定' : '未定')}</span>
        </span>
      </span>
      <span style={{ flex: '0 0 auto', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'space-between', gap: 6 }}>
        <span style={{ padding: '2px 7px', borderRadius: 4, fontSize: 10, whiteSpace: 'nowrap', background: pill.bg, color: pill.ink }}>{pill.text}</span>
        <span aria-hidden style={{ fontSize: 18, color: 'var(--u-ink-dark-2)' }}>›</span>
      </span>
    </a>
  );
}

export default function StablePage(): React.ReactElement {
  const [paused, toggle] = useMotionPaused();
  const { view, loading, error, needsSetup, needsLogin, refresh } = useStableView();
  /**
   * ★**引退した馬の頭数**（★馬物語帳への行・`my_retired_horses()`）。
   * ⚠️ ★読めなかったら ★数を出しません（★「0 頭」と嘘をつかない・R-16）。★行そのものは出します。
   */
  const [retiredCount, setRetiredCount] = useState<number | null>(null);
  const hasHorses = view !== null && view.horses.length > 0;
  useEffect(() => {
    if (!hasHorses) return undefined;
    let alive = true;
    loadRetiredScreen().then(
      (d) => { if (alive) setRetiredCount(d.horses.length); },
      (e: unknown) => {
        // ★未ログインは 誤りではない（★数を出さないだけ・★上の `useStableView` が案内を出す）
        if (e instanceof SignInRequiredError) return;
        console.error('[stable] 引退した馬の頭数を読めませんでした', e);
      },
    );
    return () => { alive = false; };
  }, [hasHorses]);

  const shell = (children: React.ReactNode): React.ReactElement => (
    <div data-theme="uma" data-page-body className={paused ? 'u-paused' : undefined} style={{
      position: 'relative', width: '100%', minHeight: '100dvh', overflow: 'hidden',
      background: 'var(--u-navy)', display: 'flex', flexDirection: 'column',
    }}>
      <Backdrop />
      <TopBar title="わたしの馬" backHref="/home" paused={paused} onToggle={toggle} />
      <RaceStrip />
      {children}
    </div>
  );

  // ★馬がいない・入れない（★D26-2 の案内・★ホームと育成モードと同じカード）
  if (view === null || view.horses.length === 0) {
    return shell(loading
      ? <TextPanel role="status" style={{ padding: 16 }}>厩舎を読み込み中…</TextPanel>
      : <div style={{ position: 'relative', display: 'flex', justifyContent: 'center', padding: '24px 14px' }}>
        <NoHorseCard needsLogin={needsLogin} needsSetup={needsSetup} error={view === null ? error : null} onRetry={refresh} />
      </div>);
  }

  const horses = sortStable(view.horses);
  const todoCount = horses.filter((h) => h.week.kind === 'todo').length;

  return shell(<>
    <main style={{
      position: 'relative', flex: '1 1 auto', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 12,
      padding: '10px 14px 0', width: '100%', maxWidth: 1220, margin: '0 auto',
    }}>
      {/* ★上の札 2 つ（★上限は `OWNERSHIP_LIMITS.active`・D-104） */}
      <div style={{ flex: '0 0 auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ ...PILL, border: '2px solid rgba(251,247,236,.28)' }}>
          <span style={{ fontSize: 11, color: 'var(--u-ink-light-3)' }}>現役</span>
          <span className="u-num" style={{ fontSize: 18 }}>{view.horses.length}</span>
          <span style={{ fontSize: 11, color: 'var(--u-ink-light-3)' }}>/ {OWNERSHIP_LIMITS.active} 頭</span>
        </span>
        <span style={{ ...PILL, border: '2px solid var(--u-gold)' }}>
          <span style={{ fontSize: 11, color: 'var(--u-ink-light-3)' }}>まだ指示していない</span>
          <span className="u-num" style={{ fontSize: 18, color: 'var(--u-gold-pale)' }}>{todoCount}</span>
          <span style={{ fontSize: 11 }}>頭</span>
        </span>
      </div>

      {/* ★一覧（★並びは `sortStable` のまま: 未指示 → 指示済み → 休養中） */}
      <div style={{ flex: '0 0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(340px, 100%), 1fr))', gap: 8 }}>
        {horses.map((h) => <HorseCard key={h.id} horse={h} />)}
      </div>

      {/* ★馬物語帳への行（★引退した馬・記録は消えない） */}
      <a href="/stable/retired" style={{
        flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 10, minHeight: 52, padding: '0 14px',
        borderRadius: 12, background: 'var(--u-panel-strong)', border: '2px solid rgba(251,247,236,.28)',
      }}>
        <span style={{ fontSize: 14 }}>引退した馬（馬物語帳）</span>
        <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--u-ink-light-3)' }}>
          {retiredCount === null ? '記録は消えません' : `${retiredCount} 頭 ・ 記録は消えません`}
        </span>
        <span aria-hidden style={{ marginLeft: 'auto', fontSize: 18, color: 'var(--u-gold-pale)' }}>›</span>
      </a>
    </main>

    {/* ★下段（★育成モードへ 金 ／ 馬市場を見る ivory） */}
    <div style={{
      position: 'relative', flex: '0 0 auto', display: 'flex', flexWrap: 'wrap', gap: 10,
      padding: '10px 14px var(--u-safe-bottom)', width: '100%', maxWidth: 1220, margin: '0 auto',
    }}>
      <BigButton
        tone="gold" label="育成モードへ" href="/train" grow="1.4 1 210px"
        sub={todoCount > 0 ? `あと ${todoCount} 頭に指示する` : '今週の指示を見る'}
      />
      <BigButton tone="ivory" label="馬市場を見る" sub="馬を迎える" href="/stable/market" grow="1 1 140px" />
    </div>
  </>);
}
