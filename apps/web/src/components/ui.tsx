/**
 * Web（DOM）画面の共通部品 — 正本は design/hud-ds（program-board / race-detail / odds-board）
 *   ⚠️ 表示だけ。計算・判定を持たない（正典 §14.3）
 */
import type React from 'react';
import { frameRoleOf } from '@star/render';

/** 枠色付き馬番（枠は `frameRoleOf`＝業界共通の 8 色。必ず馬番と併記） */
export function FrameBadge({ gate, fieldSize, w = 28, h = 22, font = 15 }: {
  readonly gate: number; readonly fieldSize: number; readonly w?: number; readonly h?: number; readonly font?: number;
}): React.ReactElement {
  const bracket = frameRoleOf(gate, fieldSize).slice('frame-'.length);
  return (
    <span className={`frame f${bracket}`} style={{ width: w, height: h, fontSize: font }}><i>{gate}</i></span>
  );
}

/** レースの状態バッジ（サーバーの status が正） */
export function StatusBadge({ status }: { readonly status: string }): React.ReactElement {
  if (status === 'settled') return <span className="badge done">確定</span>;
  if (status === 'cancelled') return <span className="badge off">中止</span>;
  if (status === 'closed') return <span className="badge live">発走</span>;
  return <span className="badge open">発売中</span>;
}

/** 脚質チップ（逃げ #ff4d3d・先行 #f08219・差し #3fd0e0・追込 #7f9cf5） */
const STYLE_COLOR: Readonly<Record<string, string>> = {
  nige: '#ff4d3d', senko: '#f08219', sashi: '#3fd0e0', oikomi: '#7f9cf5',
};
const STYLE_LABEL: Readonly<Record<string, string>> = {
  nige: '逃げ', senko: '先行', sashi: '差し', oikomi: '追込',
};
export function StyleChip({ strategy }: { readonly strategy: string }): React.ReactElement {
  const c = STYLE_COLOR[strategy] ?? 'rgba(246,242,231,.6)';
  return <span className="style-chip" style={{ color: c, borderColor: `${c}66` }}>{STYLE_LABEL[strategy] ?? strategy}</span>;
}

/** 金ベタの格バッジ（grade があれば grade、無ければ格ラベル） */
export function GradeBadge({ label, h = 26 }: { readonly label: string; readonly h?: number }): React.ReactElement {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', height: h, padding: '0 12px', background: 'var(--gold)', color: 'var(--ink)', fontSize: 13, fontWeight: 900, letterSpacing: '.08em' }}>
      {label}
    </span>
  );
}

/** 「わたしの馬」の金タグ（h18・11px） */
export function MyHorseTag(): React.ReactElement {
  return <span style={{ marginLeft: 10, fontSize: 11, fontWeight: 900, background: 'var(--gold)', color: 'var(--ink)', padding: '2px 8px', letterSpacing: '.1em' }}>わたしの馬</span>;
}

/** 上縁 金 4px つきのパネル */
export function EdgePanel({ children, kind = 'panel', style }: {
  readonly children: React.ReactNode; readonly kind?: 'panel' | 'board'; readonly style?: React.CSSProperties;
}): React.ReactElement {
  return (
    <div className={kind} style={style}>
      <div className="edge" />
      {children}
    </div>
  );
}

/** ページ見出し行 */
export function PageTitle({ title, sub, right }: {
  readonly title: string; readonly sub?: string | undefined; readonly right?: React.ReactNode;
}): React.ReactElement {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, flexWrap: 'wrap' }}>
      <h1 style={{ fontSize: 34, fontWeight: 900, margin: 0 }}>{title}</h1>
      {sub !== undefined && <span style={{ fontSize: 14, color: 'var(--paper-70)' }}>{sub}</span>}
      {right !== undefined && <span style={{ marginLeft: 'auto' }}>{right}</span>}
    </div>
  );
}

/** 読み取り失敗の表示（★空リストにしない。障害が「レースが無い」に見える） */
export function ReadError({ message }: { readonly message: string }): React.ReactElement {
  return <p style={{ color: 'var(--bad)', padding: '24px 40px' }}>読み取りに失敗しました: {message}</p>;
}
