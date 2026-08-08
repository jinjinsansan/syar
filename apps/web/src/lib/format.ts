/**
 * 表示の整形（正典 §12）
 *
 * 【★憲法 §0.2 が UI に課すもの（§12.7）】
 *   - **EP に「購入」への導線を一切置かない**（存在しないものへの導線を作らない）
 *   - **PP に「換金」を想起させる文言を使わない**。景品交換のみ
 *   - **総資産的な合算表示をしない** — 投資商品の見えを作らない
 *
 *   → EP と PP を**足す関数をここに作りません**。作れてしまうと、いつか使われます。
 */

/** 参加ポイントの表示。★「購入」「チャージ」等の語を使わない */
export function formatEntryPoints(v: number): string {
  return `${v.toLocaleString('ja-JP')} EP`;
}

/** 賞金ポイントの表示。★「換金」「円」「価値」等の語を使わない */
export function formatPrizePoints(v: number): string {
  return `${v.toLocaleString('ja-JP')} PP`;
}

/** オッズ表示。§9.4 の上限に達したら明示する */
export function formatOdds(odds: number, capped: boolean): string {
  const s = odds.toFixed(1);
  return capped ? `${s}（上限）` : s;
}

/** 距離の表示 */
export function formatDistance(m: number): string {
  return `${m.toLocaleString('ja-JP')}m`;
}

/** 馬場の表示（★実在競馬場名を使わない・憲法 §0.1） */
export const SURFACE_LABEL: Readonly<Record<string, string>> = { turf: '芝', dirt: 'ダート' };
export const CONDITION_LABEL: Readonly<Record<string, string>> = {
  good: '良', yielding: '稍重', soft: '重', bad: '不良',
};

/** レースの格。★クラスは「格」で見せる（D-020・§12.3） */
export const CLASS_LABEL: readonly string[] = [
  '新馬・未勝利', '1勝クラス', '2勝クラス', '3勝クラス', 'オープン', '重賞',
];

export function formatRaceTitle(classRank: number, grade: string | null): string {
  if (grade !== null && grade !== '') return grade;
  return CLASS_LABEL[classRank - 1] ?? '?';
}
