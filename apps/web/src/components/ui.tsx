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
  if (status === 'settled') return <span className="a-badge done">確定</span>;
  if (status === 'cancelled') return <span className="a-badge done">中止</span>;
  if (status === 'closed') return <span className="a-badge live">発走中</span>;
  return <span className="a-badge open">発売中</span>;
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

/** 金グロスの格バッジ（grade があれば grade、無ければ格ラベル） */
export function GradeBadge({ label, h = 26 }: { readonly label: string; readonly h?: number }): React.ReactElement {
  return (
    <span className="a-chip gold" style={{ height: h, padding: '0 12px', fontSize: 14, letterSpacing: '.04em' }}>
      {label}
    </span>
  );
}

/** 「わたしの馬」の金タグ（h18・11px） */
export function MyHorseTag(): React.ReactElement {
  return <span className="a-chip gold" style={{ marginLeft: 10, height: 22, fontSize: 11, padding: '0 8px', letterSpacing: '.1em' }}>わたしの馬</span>;
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
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
      <h1 className="a-band" style={{ height: 46, padding: '0 22px', borderRadius: 10, border: '2px solid var(--a-edge)', fontSize: 26, fontWeight: 900, letterSpacing: '.06em', textShadow: '0 2px 0 rgba(0,0,0,.3)', margin: 0 }}>{title}</h1>
      {sub !== undefined && <span style={{ fontSize: 14, fontWeight: 900, color: 'var(--a-ink-2)' }}>{sub}</span>}
      {right !== undefined && <span style={{ marginLeft: 'auto' }}>{right}</span>}
    </div>
  );
}

/** 読み取り失敗の表示（★空リストにしない。障害が「レースが無い」に見える） */
export function ReadError({ message }: { readonly message: string }): React.ReactElement {
  return <p style={{ color: 'var(--bad)', padding: '24px 40px' }}>読み取りに失敗しました: {message}</p>;
}

/** 素質 ★（0.5 刻み）。満 = 金／半 = 金を左 50% だけ重ねる／空 = 28%。数値は出さない */
export function Stars({ value, size = 15 }: { readonly value: number; readonly size?: number }): React.ReactElement {
  const items: React.ReactNode[] = [];
  for (let i = 1; i <= 5; i += 1) {
    if (value >= i) items.push(<span key={i} style={{ color: '#f2b012', textShadow: '0 1px 0 #8a5a06' }}>★</span>);
    else if (value >= i - 0.5) items.push(
      <span key={i} style={{ position: 'relative', display: 'inline-block' }}>
        <span style={{ color: '#c9d7e2' }}>★</span>
        <span style={{ position: 'absolute', left: 0, top: 0, width: '50%', overflow: 'hidden', color: '#f2b012', textShadow: '0 1px 0 #8a5a06' }}>★</span>
      </span>,
    );
    else items.push(<span key={i} style={{ color: '#c9d7e2' }}>★</span>);
  }
  return <span style={{ display: 'inline-flex', fontSize: size, letterSpacing: '.04em', lineHeight: 1 }}>{items}</span>;
}

/** 格チップ（h24）。重賞・オープン（classRank ≥ 5）は金ベタ、それ以下は薄地＋1px 罫 */
export function ClassChip({ label, classRank, h = 24, font = 12 }: { readonly label: string; readonly classRank: number; readonly h?: number; readonly font?: number }): React.ReactElement {
  const top = classRank >= 5;
  return (
    <span className={`a-chip${top ? ' gold' : ''}`} style={{ height: h, padding: '0 11px', fontSize: font, letterSpacing: '.04em' }}>{label}</span>
  );
}

/** 疲労バー（アーケード: 72×14・角丸 7px・地 #e3ecf3・縁 2px 濃青・塗りはグロス ≤30 緑／≤60 黄／>60 赤）＋数値 18px 同色 */
export function FatigueBar({ value, width = 72, color }: { readonly value: number; readonly width?: number; readonly color: string }): React.ReactElement {
  const v = Math.max(0, Math.min(100, value));
  const fill = v <= 30 ? 'var(--a-gloss-green)' : v <= 60 ? 'var(--a-gloss-yellow)' : 'var(--a-gloss-red)';
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ position: 'relative', width, height: 14, borderRadius: 7, overflow: 'hidden', background: '#e3ecf3', border: '2px solid var(--a-edge)' }}>
        <span style={{ display: 'block', width: `${v}%`, height: '100%', backgroundImage: fill }} />
      </span>
      <span className="a-num" style={{ fontSize: 18, color, width: 30, textAlign: 'right' }}>{value}</span>
    </span>
  );
}
