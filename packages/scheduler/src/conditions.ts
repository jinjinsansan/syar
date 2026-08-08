/**
 * レース条件の決定（正典 §10.3・§10.4）
 *
 * 【なぜサイクル番号だけから決めるのか】
 *   乱数で決めると、再起動やロック競合のたびに条件が変わりえます。
 *   すると **seed_commit を公開した後にレース条件が変わる**経路ができ、
 *   §8.6 の検証が成立しなくなります（commit は条件を含む前提で公開される）。
 *   → 番組表と同じく、**サイクル番号だけから決まる**ようにします。
 *
 * ⚠️ 馬場状態（track_condition）は本来 §10.4 の分布から引きますが、
 *    その分布（TRACK_CONDITION_CDF）は検証ハーネス側にあります。
 *    ここでは**同じ分布を再実装せず**、呼び出し側が渡す形にします
 *    （2つ目の置き場を作ると片方だけ更新される・L-2）。
 */

import type { Grade, RaceClass } from './programme.js';

export type Surface = 'turf' | 'dirt';

/** 距離帯（正典 §8.2）。番組表がここから距離を選ぶ */
export const DISTANCE_MENU: readonly number[] = [1200, 1400, 1600, 1800, 2000, 2400, 3000];

/** ダート開催の割合（正典 §10.3 に規定が無いため暫定。照会中） */
export const DIRT_RATIO = 3 / 8;

/** コースID（架空名・憲法 §0.1）。実在競馬場名を使わない */
export const COURSE_IDS: readonly string[] = ['C1', 'C2', 'C3', 'C4'];

export interface RaceConditions {
  readonly surface: Surface;
  readonly distance: number;
  readonly courseId: string;
}

/**
 * サイクル番号からレース条件を決める。
 *
 * ★互いに素な間隔でずらすことで、距離・馬場・コースの組が偏らないようにします。
 *   同じ番号からは必ず同じ条件が出ます（A-2・§8.6 の前提）。
 */
export function conditionsOf(cycleIndex: number, raceClass: RaceClass, grade: Grade | null): RaceConditions {
  const i = ((cycleIndex % 1_000_000) + 1_000_000) % 1_000_000;

  // ★重賞は距離を長めに寄せる（格上のレースが短距離ばかりになるのを避ける）
  const menu = grade !== null ? DISTANCE_MENU.slice(2) : DISTANCE_MENU;
  const distance = menu[i % menu.length]!;

  // ★ダートの割合。7 と 8 は互いに素なので距離と独立に回る
  const surface: Surface = (i * 3) % 8 < DIRT_RATIO * 8 ? 'dirt' : 'turf';

  // ★新馬・未勝利は特定コースに偏らせない（デビューの機会を均す・§10.3）
  const courseId = COURSE_IDS[(i + (raceClass === 'maiden' ? 1 : 0)) % COURSE_IDS.length]!;

  return { surface, distance, courseId };
}
