import type { Grade } from './programme.js';
import type { VenueSurface } from './venues.js';

/**
 * ★**重賞 50 鞍**（架空・正典 §0.1 / §10.3）
 *
 * 【★正典が空けていた穴】
 *   ★§10.3 の末尾:「レース名・競馬場名はすべて架空名（§0.1）。
 *   ★**年間カレンダー（クラシック三冠・古馬G1・ダート路線）は §12 執筆時に命名**」
 *   → ★ここを埋めます（★2026-08-30・オーナー指示）。
 *
 * 【★格の比 — ★オーナー判断「B案」】
 *   ⚠️ ★正典 §10.3 の週次頻度は **G1=3 / G2=8 / G3=20**（比 1 : 2.7 : 6.7）。
 *      ★これに合わせて 50 を割ると **G1 5 鞍**になり、★**同じ G1 が 1.7 週ごとに来ます。**
 *   ★実際の中央競馬の比は **GI 25 / GII 37 / GIII 68**（≒ 1 : 1.5 : 2.7）。
 *   → ★**B案を採用**: **G1 9 / G2 14 / G3 27**。★G1 は約 3 週に 1 回になります。
 *
 *   ★理由は 2 つ（どちらも正典に書いてあります）:
 *     ① ★§10.3 自身が「⚠️ 週3 G1 = 年156 G1 は現実より桁で多い」と**要検証**を立てている。
 *        ★§6.7 の種付上限 `20 + G1勝利数 × 10` に効き、★**D-026 の系統集中の経路を太らせる**
 *     ② ★§10.4 の D-020「育成の報酬は勝率ではなく**昇級**」— ★G1 が希少でないと、
 *        ★いちばん上の格に上がった実感が出ない
 *
 * ⚠️ 【★正典側の宿題】★**週次頻度（G1=3/週）とは噛み合っていません。**
 *    ★50 鞍の内訳を B案にしただけで、★**枠の側は正典のままです。**
 *    ★どちらに合わせるかは**正典の変更**なので、★照会に出します（開発側では決めません）。
 *
 * 【⚠️ ★名前について — ★憲法 §0.1 と、その担保の限界】
 *   ★実在レース名は使えません。★ところが ★**実在レース名の一覧をここに書くこともできません**
 *   — ★`name-blocklist.ts` の註記どおり、★**NG リストを平文で置くこと自体が違反**だからです。
 *   → ★**構造で守ります**: ★名前の多くを ★**架空の競馬場名から作ります**
 *     （「天河記念」— ★天河競馬場は存在しないので、実在レース名と衝突しえません）。
 *   ⚠️ ★それでも季節・天体の語を使う名は**偶然の一致がありえます**。
 *      ★開発側は**記憶で「実在しない」と断定できません。** ★オーナー・レビュー側の確認対象です。
 *   ★名前は**データの 1 フィールド**なので、★差し替えても構造は 1 ビットも動きません。
 */

/**
 * ⚠️ ★格の型は `programme.ts` の 1 か所から引きます（D-052）。
 *    ★ここで `'G1' | 'G2' | 'G3'` を定義し直すと、★**番組表と重賞表で別の型**になります。
 */
export type { Grade };
/** ★年齢条件。`'2'`=2歳 / `'3'`=3歳 / `'3+'`=3歳以上 */
export type AgeCondition = '2' | '3' | '3+';

export interface GradedRace {
  readonly id: string;
  /** ★架空名（§0.1） */
  readonly name: string;
  readonly venueId: string;
  readonly grade: Grade;
  readonly surface: VenueSurface;
  readonly distanceM: number;
  /** ★ゲーム内の月（1〜12）。★年間カレンダーの骨格 */
  readonly month: number;
  readonly age: AgeCondition;
  /** ★牝馬限定 */
  readonly fillies: boolean;
}

/**
 * ★**50 鞍**。
 *
 * ⚠️ ★`(競馬場, 馬場, 距離)` の組は **50 通りすべて違います**（検査で固定）。
 *    ★これが「種類豊富」の実体です — ★同じ組が 2 つあると、★その 2 鞍は**同じ画**になります。
 */
export const GRADED_RACES: readonly GradedRace[] = [
  // ── G1（9 鞍）─────────────────────────────────────────────
  /** ★既存のデモがこのレースです。★名前を動かしません */
  { id: 'g1-ousei', name: '桜星賞', venueId: 'star-park', grade: 'G1', surface: 'turf', distanceM: 1600, month: 4, age: '3', fillies: false },
  /** ★三冠 ①（皐月の位置） */
  { id: 'g1-seikan', name: '星冠賞', venueId: 'kirigahara', grade: 'G1', surface: 'turf', distanceM: 2000, month: 4, age: '3', fillies: false },
  /** ★三冠 ②（ダービーの位置） */
  { id: 'g1-tenkyu', name: '天穹賞', venueId: 'tenga', grade: 'G1', surface: 'turf', distanceM: 2400, month: 5, age: '3', fillies: false },
  /** ★三冠 ③（菊花の位置・最長） */
  { id: 'g1-ginga', name: '銀河賞', venueId: 'ginrei', grade: 'G1', surface: 'turf', distanceM: 3000, month: 10, age: '3', fillies: false },
  { id: 'g1-ryusei', name: '流星大賞典', venueId: 'tenga', grade: 'G1', surface: 'turf', distanceM: 2000, month: 10, age: '3+', fillies: false },
  { id: 'g1-kyokko', name: '極光賞', venueId: 'ookawara', grade: 'G1', surface: 'turf', distanceM: 2500, month: 12, age: '3+', fillies: false },
  { id: 'g1-suisei', name: '彗星スプリント', venueId: 'shiokaze', grade: 'G1', surface: 'turf', distanceM: 1200, month: 9, age: '3+', fillies: false },
  /** ★ダート路線の頂点 */
  { id: 'g1-soukai', name: '蒼海賞', venueId: 'shirasuna', grade: 'G1', surface: 'dirt', distanceM: 1800, month: 12, age: '3+', fillies: false },
  { id: 'g1-gekko', name: '月虹賞', venueId: 'youkou', grade: 'G1', surface: 'turf', distanceM: 1800, month: 11, age: '3+', fillies: true },

  // ── G2（14 鞍）────────────────────────────────────────────
  { id: 'g2-shinsei', name: '新星賞', venueId: 'tsukimi', grade: 'G2', surface: 'turf', distanceM: 1600, month: 11, age: '2', fillies: false },
  { id: 'g2-gyoko', name: '暁光賞', venueId: 'aone', grade: 'G2', surface: 'turf', distanceM: 1800, month: 3, age: '3', fillies: false },
  { id: 'g2-hoshikuzu', name: '星屑ステークス', venueId: 'ginrei', grade: 'G2', surface: 'turf', distanceM: 1400, month: 5, age: '3+', fillies: false },
  { id: 'g2-hakuro', name: '白露賞', venueId: 'shirasuna', grade: 'G2', surface: 'dirt', distanceM: 1600, month: 9, age: '3+', fillies: false },
  { id: 'g2-aone', name: '青嶺記念', venueId: 'aone', grade: 'G2', surface: 'turf', distanceM: 2200, month: 6, age: '3+', fillies: false },
  { id: 'g2-shiokaze', name: '潮風カップ', venueId: 'shiokaze', grade: 'G2', surface: 'turf', distanceM: 1600, month: 4, age: '3+', fillies: false },
  { id: 'g2-tenga', name: '天河記念', venueId: 'tenga', grade: 'G2', surface: 'turf', distanceM: 2500, month: 3, age: '3+', fillies: false },
  { id: 'g2-ginrei', name: '銀嶺記念', venueId: 'ginrei', grade: 'G2', surface: 'dirt', distanceM: 2000, month: 2, age: '3+', fillies: false },
  { id: 'g2-youkou', name: '陽光賞', venueId: 'youkou', grade: 'G2', surface: 'turf', distanceM: 2000, month: 7, age: '3+', fillies: false },
  { id: 'g2-kirigahara', name: '霧ヶ原記念', venueId: 'kirigahara', grade: 'G2', surface: 'turf', distanceM: 1800, month: 8, age: '3+', fillies: false },
  { id: 'g2-tsukimi', name: '月見丘カップ', venueId: 'tsukimi', grade: 'G2', surface: 'dirt', distanceM: 1400, month: 1, age: '3+', fillies: false },
  { id: 'g2-ookawara', name: '大河原記念', venueId: 'ookawara', grade: 'G2', surface: 'turf', distanceM: 3200, month: 5, age: '3+', fillies: false },
  { id: 'g2-shirasuna', name: '白砂大賞典', venueId: 'shirasuna', grade: 'G2', surface: 'dirt', distanceM: 1900, month: 6, age: '3', fillies: false },
  { id: 'g2-seiga', name: '星河賞', venueId: 'star-park', grade: 'G2', surface: 'turf', distanceM: 2000, month: 6, age: '3+', fillies: true },

  // ── G3（27 鞍）────────────────────────────────────────────
  { id: 'g3-mebuki', name: '芽吹賞', venueId: 'star-park', grade: 'G3', surface: 'turf', distanceM: 1400, month: 2, age: '3', fillies: false },
  { id: 'g3-shunrai', name: '春雷カップ', venueId: 'tsukimi', grade: 'G3', surface: 'turf', distanceM: 1200, month: 3, age: '3+', fillies: false },
  { id: 'g3-sanae', name: '早苗賞', venueId: 'shirasuna', grade: 'G3', surface: 'turf', distanceM: 1800, month: 4, age: '3', fillies: false },
  { id: 'g3-ryofu', name: '涼風ステークス', venueId: 'shiokaze', grade: 'G3', surface: 'turf', distanceM: 1000, month: 7, age: '3+', fillies: false },
  { id: 'g3-semishigure', name: '蝉時雨賞', venueId: 'shirasuna', grade: 'G3', surface: 'dirt', distanceM: 1200, month: 7, age: '3+', fillies: false },
  { id: 'g3-touka', name: '灯火賞', venueId: 'kirigahara', grade: 'G3', surface: 'dirt', distanceM: 1700, month: 11, age: '3+', fillies: false },
  { id: 'g3-kouyou', name: '紅葉賞', venueId: 'ginrei', grade: 'G3', surface: 'turf', distanceM: 2000, month: 10, age: '3+', fillies: false },
  { id: 'g3-kogarashi', name: '木枯賞', venueId: 'aone', grade: 'G3', surface: 'turf', distanceM: 1600, month: 11, age: '3+', fillies: false },
  { id: 'g3-hatsushimo', name: '初霜カップ', venueId: 'ookawara', grade: 'G3', surface: 'dirt', distanceM: 1800, month: 12, age: '3+', fillies: false },
  { id: 'g3-kantsubaki', name: '寒椿賞', venueId: 'tenga', grade: 'G3', surface: 'turf', distanceM: 1400, month: 1, age: '3+', fillies: false },
  { id: 'g3-awayuki', name: '淡雪ステークス', venueId: 'aone', grade: 'G3', surface: 'dirt', distanceM: 1400, month: 2, age: '3+', fillies: false },
  { id: 'g3-kagerou', name: '陽炎カップ', venueId: 'youkou', grade: 'G3', surface: 'dirt', distanceM: 1600, month: 8, age: '3+', fillies: false },
  { id: 'g3-hoshimatsuri', name: '星祭賞', venueId: 'kirigahara', grade: 'G3', surface: 'turf', distanceM: 2400, month: 8, age: '3+', fillies: false },
  { id: 'g3-tencho', name: '天頂記念', venueId: 'shiokaze', grade: 'G3', surface: 'turf', distanceM: 2000, month: 9, age: '3+', fillies: false },
  { id: 'g3-hokuten', name: '北天賞', venueId: 'ookawara', grade: 'G3', surface: 'dirt', distanceM: 2400, month: 3, age: '3+', fillies: false },
  { id: 'g3-mutsuraboshi', name: '六連星カップ', venueId: 'ginrei', grade: 'G3', surface: 'turf', distanceM: 1200, month: 9, age: '2', fillies: false },
  { id: 'g3-orihime', name: '織姫賞', venueId: 'shiokaze', grade: 'G3', surface: 'dirt', distanceM: 1400, month: 7, age: '3+', fillies: true },
  { id: 'g3-natsuboshi', name: '夏星賞', venueId: 'star-park', grade: 'G3', surface: 'turf', distanceM: 1800, month: 8, age: '3+', fillies: false },
  { id: 'g3-hakko', name: '白光記念', venueId: 'ookawara', grade: 'G3', surface: 'turf', distanceM: 3600, month: 6, age: '3+', fillies: false },
  { id: 'g3-futagoboshi', name: '双子星ステークス', venueId: 'tsukimi', grade: 'G3', surface: 'dirt', distanceM: 1200, month: 10, age: '2', fillies: false },
  { id: 'g3-minamijuji', name: '南十字賞', venueId: 'kirigahara', grade: 'G3', surface: 'turf', distanceM: 2200, month: 5, age: '3', fillies: false },
  { id: 'g3-hokkyokusei', name: '北極星カップ', venueId: 'ginrei', grade: 'G3', surface: 'dirt', distanceM: 3000, month: 1, age: '3+', fillies: false },
  { id: 'g3-yoiyami', name: '宵闇賞', venueId: 'youkou', grade: 'G3', surface: 'dirt', distanceM: 1800, month: 12, age: '3+', fillies: false },
  { id: 'g3-reimei', name: '黎明ステークス', venueId: 'tsukimi', grade: 'G3', surface: 'turf', distanceM: 1800, month: 5, age: '3+', fillies: false },
  { id: 'g3-gunjo', name: '群青カップ', venueId: 'shiokaze', grade: 'G3', surface: 'dirt', distanceM: 2000, month: 2, age: '3+', fillies: false },
  { id: 'g3-shisui', name: '紫水賞', venueId: 'star-park', grade: 'G3', surface: 'turf', distanceM: 1200, month: 9, age: '3+', fillies: true },
  { id: 'g3-moegi', name: '萌黄賞', venueId: 'tenga', grade: 'G3', surface: 'dirt', distanceM: 1600, month: 12, age: '2', fillies: false },
];

/** ★格ごとの鞍数（B案）。★検査が `GRADED_RACES` と突き合わせます */
export const GRADED_COUNT_BY_GRADE: Readonly<Record<Grade, number>> = { G1: 9, G2: 14, G3: 27 };

/** ★id から引く。★無ければ投げます（黙って既定へ落とさない・R-27） */
export function gradedRaceById(id: string): GradedRace {
  const r = GRADED_RACES.find((x) => x.id === id);
  if (r === undefined) throw new Error(`重賞が見つかりません: ${id}`);
  return r;
}

/** ★`(競馬場, 馬場, 距離)` の鍵。★「同じ画」になる 2 鞍を作らないための識別子 */
export function raceLookKey(race: GradedRace): string {
  return `${race.venueId}/${race.surface}/${race.distanceM}`;
}
