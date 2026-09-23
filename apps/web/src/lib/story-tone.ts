/**
 * ★**生涯の記録の札の色**（★デザイナー決定・★2 つの画面が同じ色を使う）
 *
 * 【★なぜ画面から出したか】
 *   ★`/stable/retired`（馬物語帳）と ★`/stable/roles`（引退後の役割・第 2 便 A-1）が ★**同じ色の表**を使います。
 *   ★片方だけ直した日に、★同じ出来事が 2 つの色で出ます。★色の出どころは 1 つにします。
 *
 * ⚠️ ★**文から種類を推測しません**（★色は `StoryLine.type` から引く）。
 * ⚠️ ★色を増やす・変えるのは ★**デザイナーの決定**です（★開発側で足さない）。
 */
import type { StoryEventType } from '@star/training';

export interface StoryTone {
  readonly bg: string;
  readonly border: string;
  readonly color: string;
}

/** ★種類ごとの色（★絵文字を使わず、色分けした角丸ラベル・カードの指定） */
export const TYPE_TONE: Readonly<Record<StoryEventType, StoryTone>> = {
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
  // ★デザイナー決定（★第 2 便 `design_handoff_breed_v2/README.md` §2・2026-09-23）
  'breeding-role-changed': { bg: '#dcf1ef', border: '#0e7a73', color: '#0e7a73' },
};
