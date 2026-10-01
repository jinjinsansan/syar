/**
 * ★**投票の履歴・投票の控えの小さな部品**（★2026-10-01・デザイナー引き渡し ② §2-1/§2-3/§2-4）
 *
 * ★`/vote/history` と `/vote/history/[betId]` の 2 枚が使います。★値は引き渡しの表のまま（★新しい意匠は作っていません）。
 * ⚠️ ★状態の札は ★必ず文字を付けます（★色だけで伝えない）。★外れた控えも「確定」です（§2-1）。
 */
import { VOTE_STATE_COLORS, VOTE_STATE_LABEL, type VoteState } from '../../lib/vote-history-view';

/** ★枠の色（★`/vote` の出馬表と同じ 8 色） */
export const FRAME_COLORS = ['#f5f5f5', '#191919', '#d62828', '#1446b4', '#fad728', '#148c46', '#f08219', '#f596be'] as const;
const DARK_TEXT_FRAMES = new Set([1, 5, 8]);

/** ★状態の札 */
export function StateTag({ state, size = 11 }: { readonly state: VoteState; readonly size?: number }): React.ReactElement {
  const c = VOTE_STATE_COLORS[state];
  return (
    <span style={{ flex: '0 0 auto', padding: size > 11 ? '3px 10px' : '2px 8px', borderRadius: 5, fontSize: size, whiteSpace: 'nowrap', background: c.bg, color: c.ink }}>
      {VOTE_STATE_LABEL[state]}
    </span>
  );
}

/** ★馬番の札（★地は枠の色・★数字は馬番）。★枠が分からなければ ★白地 */
export function GateBadge({ gate, frame, width = 22, height = 20 }: {
  readonly gate: number; readonly frame: number | null; readonly width?: number; readonly height?: number;
}): React.ReactElement {
  const bg = frame === null ? '#ffffff' : FRAME_COLORS[frame - 1] ?? '#ffffff';
  const ink = frame === null || DARK_TEXT_FRAMES.has(frame) ? '#111' : '#fff';
  return (
    <span className="u-num" style={{
      flex: '0 0 auto', width, height, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      borderRadius: 4, border: '2px solid #10243a', boxSizing: 'border-box', background: bg, color: ink, fontSize: width > 22 ? 13 : 12,
    }}>{gate}</span>
  );
}
