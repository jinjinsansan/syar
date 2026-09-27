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
import { WEEKS_PER_YEAR } from '@star/scheduler';

/**
 * ★**性別と年齢**（「牡4」など）。★年齢は「いまの週」と生まれた週から出す（★`WEEKS_PER_YEAR` が唯一の出どころ）。
 * 🔴 ★2026-09-27: ★`entry-screen.ts` と `stable-repo.ts` に ★同じ規則が 2 か所あり、★出走登録の側だけ
 *    ★性別の置き換えが抜けて ★`female4` と生の値が出ていました（★オーナーの画面で発覚）。★ここ 1 か所に寄せました（D-052）。
 */
export function formatSexAge(sex: string, birthWeek: number | null, gameWeek: number): string {
  /**
   * ⚠️ ★DB は `sex in ('male', 'female')` だけ（★`0001:140`）。★知らない値を「セ」（騸馬）にすると ★**居ない馬を作る**ので、
   *    ★そのまま出します（★旧 `stable-repo.ts` は「セ」に倒していました）。
   */
  const label = sex === 'male' ? '牡' : sex === 'female' ? '牝' : sex;
  if (birthWeek === null) return label;
  return `${label}${Math.max(0, Math.floor((gameWeek - birthWeek) / WEEKS_PER_YEAR))}`;
}

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

/** 発走時刻の表示（HH:MM・日本時間で固定。サーバーの TZ に依存させない） */
export function formatClock(iso: string): string {
  return new Date(iso).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo' });
}

/** 走破タイム（秒 → m:ss.s） */
export function formatRaceTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return `${m}:${s < 10 ? '0' : ''}${s.toFixed(1)}`;
}

/** 券種名（正典 §9.1 の 6 券種） */
export const BET_TYPE_LABEL: Readonly<Record<string, string>> = {
  win: '単勝', place: '複勝', quinella_place: 'ワイド', quinella: '馬連', exacta: '馬単', trio: '三連複', trifecta: '三連単',
};

/** レース状態の表示（サーバーの status が正） */
export const STATUS_LABEL: Readonly<Record<string, string>> = {
  scheduled: '発売中', closed: '発走', settled: '確定', cancelled: '中止',
};
