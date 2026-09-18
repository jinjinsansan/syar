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

/** 脚質チップ（アーケード: 濃色文字＋淡色地＋同色 2px 縁・h26・角丸 6px・12px 900 — MOTION_HANDOFF §6.5） */
const STYLE_COLOR: Readonly<Record<string, readonly [string, string]>> = {
  nige: ['#a81a13', '#ffe9e7'], senko: ['#a35a04', '#fff1de'], sashi: ['#0c5f9f', '#e0eefa'], oikomi: ['#4a4fa8', '#e8e9fb'],
};
const STYLE_LABEL: Readonly<Record<string, string>> = {
  nige: '逃げ', senko: '先行', sashi: '差し', oikomi: '追込',
};
export function StyleChip({ strategy, h = 26, font = 12 }: { readonly strategy: string; readonly h?: number; readonly font?: number }): React.ReactElement {
  const [c, bg] = STYLE_COLOR[strategy] ?? ['#4a6178', '#eef2f6'];
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', height: h, padding: `0 ${h > 26 ? 14 : 11}px`, borderRadius: h > 26 ? 8 : 6, background: bg, border: `2px solid ${c}`, color: c, fontSize: font, fontWeight: 900 }}>
      {STYLE_LABEL[strategy] ?? strategy}
    </span>
  );
}

/** 券種・馬・表のタブ（h42・上だけ角丸・選択中は青（または赤）グロス＋下辺を白にして板と繋ぐ／未選択は沈んだ白） */
export function TabButton({ label, selected, onClick, href, tone = 'blue' }: {
  readonly label: string; readonly selected: boolean; readonly onClick?: () => void; readonly href?: string; readonly tone?: 'blue' | 'red';
}): React.ReactElement {
  const style: React.CSSProperties = {
    display: 'flex', alignItems: 'center', height: 42, padding: '0 20px', cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'none',
    borderRadius: '10px 10px 0 0', border: '2px solid var(--a-edge)', borderBottom: selected ? '2px solid #fff' : '2px solid var(--a-edge)',
    backgroundImage: selected ? (tone === 'red' ? 'var(--a-gloss-red)' : 'var(--a-gloss-blue)') : 'linear-gradient(#fff,#e3ecf3)',
    color: selected ? '#fff' : 'var(--a-ink-2)', fontSize: 16, fontWeight: 900,
    boxShadow: selected ? 'var(--a-inset)' : 'inset 0 -3px 4px rgba(16,36,58,.12)', position: 'relative', zIndex: selected ? 2 : 1,
  };
  if (href !== undefined) return <a className="story-tab" aria-current={selected ? 'page' : undefined} href={href} style={style}>{label}</a>;
  return <button className="story-tab" aria-pressed={selected} type="button" onClick={onClick} style={style}>{label}</button>;
}

/** 現在値バー（明るい地: 地 #e3ecf3・縁 2px 濃青・塗り 青グロス・数値 青・右に「上限 nnn」12px） */
export function StatBar({ label, value, cap, delta, height = 16, valueSize = 24, rowHeight = 34, labelWidth = 72 }: {
  readonly label: string; readonly value: number; readonly cap: number; readonly delta?: number | undefined;
  readonly height?: number; readonly valueSize?: number; readonly rowHeight?: number; readonly labelWidth?: number;
}): React.ReactElement {
  const pct = cap > 0 ? Math.max(0, Math.min(100, (value / cap) * 100)) : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, height: rowHeight }}>
      <span style={{ width: labelWidth, flex: `0 0 ${labelWidth}px`, fontSize: 14, fontWeight: 900, color: 'var(--a-ink-2)' }}>{label}</span>
      <span style={{ position: 'relative', flex: 1, height, borderRadius: height / 2, background: '#e3ecf3', border: '2px solid var(--a-edge)', overflow: 'hidden' }}>
        <span style={{ display: 'block', width: `${pct}%`, height: '100%', backgroundImage: 'var(--a-gloss-blue)' }} />
      </span>
      <span className="a-num" style={{ width: 58, flex: '0 0 58px', textAlign: 'right', fontSize: valueSize, color: 'var(--a-num-time)' }}>{value}</span>
      <span style={{ width: 78, flex: '0 0 78px', textAlign: 'right', fontSize: 12, fontWeight: 900, color: 'var(--a-ink-3)' }}>上限 {cap}</span>
      {delta !== undefined && (
        <span className="a-num" style={{ width: 44, flex: '0 0 44px', textAlign: 'right', fontSize: 15, color: delta > 0 ? 'var(--a-green-d)' : delta < 0 ? 'var(--a-red-d)' : 'var(--a-ink-3)' }}>
          {delta > 0 ? `+${delta}` : delta === 0 ? '±0' : String(delta)}
        </span>
      )}
    </div>
  );
}

/** 白地カプセル（見出し右の「週 32」「現在 15:37」「未指示 2」など） */
export function Capsule({ label, value, unit, color = 'var(--a-num-time)', size = 26 }: {
  readonly label: string; readonly value: string; readonly unit?: string; readonly color?: string; readonly size?: number;
}): React.ReactElement {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, height: 40, padding: '0 16px', borderRadius: 10, background: '#fff', border: '2px solid var(--a-edge)', boxShadow: 'var(--a-shadow-sm)' }}>
      <span className="a-lbl">{label}</span>
      <span className="a-num" style={{ fontSize: size, color }}>{value}</span>
      {unit !== undefined && <span className="a-lbl">{unit}</span>}
    </span>
  );
}

/** 状態ピル（h26・角丸 6px・2px 縁）— green=緑グロス白／yellow=黄グロス／gold=金グロス／grey=白→灰／red=赤グロス白／blue=青グロス白 */
export function Pill({ tone, children }: { readonly tone: 'green' | 'yellow' | 'gold' | 'grey' | 'red' | 'blue'; readonly children: React.ReactNode }): React.ReactElement {
  const T: Readonly<Record<string, React.CSSProperties>> = {
    green: { backgroundImage: 'var(--a-gloss-green)', borderColor: 'var(--a-green-d)', color: '#fff' },
    yellow: { backgroundImage: 'var(--a-gloss-yellow)', borderColor: '#a9741a', color: '#4a3105' },
    gold: { backgroundImage: 'var(--a-gloss-gold)', borderColor: '#8a5a06', color: '#4a3105' },
    grey: { backgroundImage: 'linear-gradient(#fff,#e6edf4)', borderColor: 'var(--a-edge-soft)', color: 'var(--a-ink-3)' },
    red: { backgroundImage: 'var(--a-gloss-red)', borderColor: 'var(--a-red-d)', color: '#fff' },
    blue: { backgroundImage: 'var(--a-gloss-blue)', borderColor: 'var(--a-edge)', color: '#fff' },
  };
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', height: 26, padding: '0 12px', borderRadius: 6, border: '2px solid', fontSize: 12, fontWeight: 900, letterSpacing: '.06em', whiteSpace: 'nowrap', ...T[tone] }}>
      {children}
    </span>
  );
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

/** ページ見出し行 */
export function PageTitle({ title, sub, right }: {
  readonly title: string; readonly sub?: string | undefined; readonly right?: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="story-page-title" style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
      <h1 className="a-band" style={{ height: 46, padding: '0 22px', borderRadius: 10, border: '2px solid var(--a-edge)', fontSize: 26, fontWeight: 900, letterSpacing: '.06em', textShadow: '0 2px 0 rgba(0,0,0,.3)', margin: 0 }}>{title}</h1>
      {sub !== undefined && <span style={{ fontSize: 14, fontWeight: 900, color: 'var(--a-ink-2)' }}>{sub}</span>}
      {right !== undefined && <span style={{ marginLeft: 'auto' }}>{right}</span>}
    </div>
  );
}

/**
 * 読み取り失敗の表示（★空リストにしない。障害が「レースが無い」に見える）
 *
 * ⚠️ ★2026-09-17: ★これは ★**裸の `<p>`** でした。★`/odds/[id]` が読み取りに失敗すると、
 *    ★画面の中身が ★**この 1 行だけ**になり、★アーケードの共通帯の中に出ていました
 *    （★配信されている HTML で確認: `data-theme="uma"` が **0 回**）。
 *    ★つまり ★**デザイナーの画面が丸ごと消えて**いました。
 * → ★`theme` を渡せるようにし、★馬物語の画面では ★**その見た目のまま**出します。
 */
export function ReadError({ message, theme }: {
  readonly message: string;
  readonly theme?: 'uma';
}): React.ReactElement {
  if (theme !== 'uma') {
    return <p style={{ color: 'var(--bad)', padding: '24px 40px' }}>読み取りに失敗しました: {message}</p>;
  }
  return (
    <div data-theme="uma" style={{
      minHeight: '100dvh', background: 'var(--u-navy)', color: 'var(--u-ink-light)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
      fontFamily: "'M PLUS Rounded 1c', system-ui, sans-serif", fontWeight: 800,
    }}>
      <div style={{ textAlign: 'center', maxWidth: 560 }}>
        <p style={{ margin: 0, fontSize: 16 }}>いまこのレースの数字を読めませんでした。</p>
        <p style={{ margin: '8px 0 0', fontSize: 12, fontWeight: 500, color: 'var(--u-ink-light-3)', wordBreak: 'break-word' }}>
          {message}
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center', marginTop: 16 }}>
          <a href="/odds/demo?demo=1" style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: 44,
            padding: '0 18px', borderRadius: 10, border: '3px solid var(--u-navy)',
            backgroundImage: 'linear-gradient(#ffd84a,#f2b012)', color: 'var(--u-ink-dark)', fontSize: 14,
          }}>見本のオッズを見る</a>
          <a href="/home" style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: 44,
            padding: '0 18px', borderRadius: 10, border: '3px solid var(--u-navy)',
            backgroundImage: 'linear-gradient(#ffffff,#e6eef6)', color: 'var(--u-ink-dark)', fontSize: 14,
          }}>ダッシュボードへ</a>
        </div>
      </div>
    </div>
  );
}

/**
 * 🔴 ★**`Stars` の部品は 2026-09-18 に削除しました**（**D-114 ②** / T-10・AL-2）。
 *
 *   ★旧: ★`potential` を ★**★1〜5（半星あり）＝ 9 段**に丸めて画面に出していました。
 *   ★新: ★**素質は数値も段も出しません。** ★内部は 24 段で、★**帯としてだけ**使います。
 *   ★プレイヤーが強さを推し量る手がかりは ★**オッズと戦績だけ**です。
 *
 * ⚠️ ★**途中の形（「段を粗くして見せる」「帯の名前で見せる」）も取りません** —
 *    ★粗くしても「素質の代用品」になるだけです（D-116 ① と同じ警戒）。
 *    ★育った実感は ★**D-116 の 4 層**（状態／成長／発見／物語）が担います。
 *
 * ⚠️ ★**この部品を戻さないでください。** ★戻すなら正典の D-114 を先に改訂してください。
 */

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
