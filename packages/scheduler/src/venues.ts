/**
 * ★**競馬場**（架空・正典 §0.1 / §10.3「レース名・競馬場名はすべて架空名」）
 *
 * 【★なぜ 10 場も要るのか — ★オーナー要望「種類豊富にしたい。いつも同じレースだと飽きる」】
 *   ⚠️ ★**レース名の数では飽きは解消しません。** ★数で見ると:
 *      ★重賞は週 31 鞍（正典 §10.3）、★1 週 = リアル 4 時間（§7.1）。
 *      → ★50 レースを使い回すと、★**同じレースはリアル約 6.4 時間ごとに再来**します。
 *   ★プレイヤーが見分けているのは ★**競馬場の形・距離・芝ダート・回り**です。
 *   → ★そこを散らせば、同じレースが戻ってきても「また同じ」になりません。
 *
 * 【★形が違うと何が変わるか】
 *   ★`lapM`（1 周）と `homeStretchM`（直線）で ★**コーナーの半径**が決まります
 *   （`ovalCourse`: 曲がりの合計 = 1周 − 直線×2）。
 *   ★直線が長い競馬場は**長い追い比べ**に、★小回りは**コーナーの攻防**になります。
 *   ★回り（左/右）は**画の向きそのもの**を変えます。
 *
 * ⚠️ ★**素材は 1 セットを共有します**（オーナー判断 ①(a)）。
 *    ★走路の形・距離・馬場は場ごとに違いますが、★**スタンドと山並みは同じ**です。
 *    ★景色の焼き分けは別便（素材が 10 倍になり、承認も 10 回必要）。
 *
 * ⚠️ ★**名前はデータの 1 フィールド**です。★差し替えても構造は動きません。
 */

/** ★走路の馬場 */
export type VenueSurface = 'turf' | 'dirt';

export interface Venue {
  readonly id: string;
  /** ★架空名（正典 §0.1）。★実在競馬場名と重ならないこと */
  readonly name: string;
  /** ★1 周（m）。★`ovalCourse` の `lapM` */
  readonly lapM: number;
  /** ★ゴール前の直線（m）。★`homeStretchM * 2 < lapM` でなければ `ovalCourse` が投げます */
  readonly homeStretchM: number;
  /** ★走路の幅（m） */
  readonly widthM: number;
  /** ★回り。★競馬場ごとに固定です（実際の競馬場と同じ） */
  readonly turn: 'left' | 'right';
  /** ★その場に在る馬場。★両方ある場でも、レース側が 1 つを選びます */
  readonly surfaces: readonly VenueSurface[];
}

/**
 * ★**10 場**。★1 周・直線・幅・回りを**全部ばらして**あります。
 *   ⚠️ ★同じ形の場を 2 つ作らないこと。★作った瞬間、その 2 場は「同じ画」になります。
 */
export const VENUES: readonly Venue[] = [
  /** ★既存のデモがこの場です（`RACE_META.venue`）。★基準として動かしません */
  { id: 'star-park', name: 'スターパーク競馬場', lapM: 2000, homeStretchM: 400, widthM: 20, turn: 'left', surfaces: ['turf', 'dirt'] },
  /** ★いちばん長い直線（620m）＋**小さいコーナー**。★直線勝負の場 */
  { id: 'tenga', name: '天河競馬場', lapM: 2200, homeStretchM: 620, widthM: 22, turn: 'left', surfaces: ['turf', 'dirt'] },
  { id: 'aone', name: '青嶺競馬場', lapM: 1800, homeStretchM: 330, widthM: 18, turn: 'right', surfaces: ['turf', 'dirt'] },
  /** ★ダートの本場。★芝も 1 本だけ持つ */
  { id: 'shirasuna', name: '白砂競馬場', lapM: 1700, homeStretchM: 290, widthM: 18, turn: 'left', surfaces: ['dirt', 'turf'] },
  { id: 'shiokaze', name: '潮風競馬場', lapM: 1900, homeStretchM: 310, widthM: 20, turn: 'right', surfaces: ['turf', 'dirt'] },
  /** ⚠️ ★**いちばん小さい**（1 周 1500m）。★コーナーの半径 127m — ★深い曲がりが続きます */
  { id: 'tsukimi', name: '月見丘競馬場', lapM: 1500, homeStretchM: 350, widthM: 17, turn: 'right', surfaces: ['turf', 'dirt'] },
  { id: 'ginrei', name: '銀嶺競馬場', lapM: 2100, homeStretchM: 380, widthM: 21, turn: 'left', surfaces: ['turf', 'dirt'] },
  { id: 'youkou', name: '陽光台競馬場', lapM: 1750, homeStretchM: 430, widthM: 19, turn: 'left', surfaces: ['turf', 'dirt'] },
  { id: 'kirigahara', name: '霧ヶ原競馬場', lapM: 2000, homeStretchM: 470, widthM: 20, turn: 'right', surfaces: ['turf', 'dirt'] },
  /** ⚠️ ★**いちばん大きい**（1 周 2400m）。★コーナーの半径 210m — ★大きく回る長距離の舞台 */
  { id: 'ookawara', name: '大河原競馬場', lapM: 2400, homeStretchM: 540, widthM: 23, turn: 'left', surfaces: ['turf', 'dirt'] },
];

/** ★id から引く。★無ければ投げます（黙って既定の場へ落とさない・R-27） */
export function venueById(id: string): Venue {
  const v = VENUES.find((x) => x.id === id);
  if (v === undefined) throw new Error(`競馬場が見つかりません: ${id}`);
  return v;
}
