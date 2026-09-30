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
  /**
   * ★**シリーズ**（★2026-09-15・演出の「三冠 第 1 戦」などの表示）。★明示のフィールドです。
   * ⚠️ ★レース名から推し量りません（★名前はデータの 1 フィールドで、差し替えても構造が動かないため）。
   */
  readonly series?: { readonly name: string; readonly leg: number } | undefined;
}

/**
 * ★**50 鞍**。
 *
 * ⚠️ ★`(競馬場, 馬場, 距離)` の組は **50 通りすべて違います**（検査で固定）。
 *    ★これが「種類豊富」の実体です — ★同じ組が 2 つあると、★その 2 鞍は**同じ画**になります。
 */
/**
 * ★**2026-09-30 に 実在の年間日程へ作り直した**（★オーナー「G3 以上を 50 レース・お正月の金杯から」「ＯＫです」・正典 D-125/D-126）。
 *   ★1 月の金杯から 12 月の有馬まで ★実在の中央競馬の重賞 50 鞍（★G1 24・G2 20・G3 6）を ★名前の規則（D-125）で置き換えた。
 *   ★場は ★実在の場を置き換えた場（`venues.ts`）・★距離は 番組の 7 距離に寄せた・★「4 歳以上」は「3 歳以上」に寄せた。
 *   ⚠️ ★オーナー承認で変わったこと: ★G1 9 → 24（★旧 B案）／★同じ（場・馬場・距離）の鞍が重なる（★旧「50 通りすべて違う」）。
 *   ⚠️ ★実在の名前との対応表は 公開しない（`private/research/`）。★一対一に近い名前は 公開前に L-9 で確認（D-125 ②）。
 */
export const GRADED_RACES: readonly GradedRace[] = [
  { id: 'g3-maku-kinpai', name: '幕張金杯', venueId: 'shiokaze', grade: 'G3', surface: 'turf', distanceM: 2000, month: 1, age: '3+', fillies: false },
  { id: 'g3-yodo-kinpai', name: '淀金杯', venueId: 'aone', grade: 'G3', surface: 'turf', distanceM: 1600, month: 1, age: '3+', fillies: false },
  { id: 'g2-shinshun', name: '新春ステークス', venueId: 'aone', grade: 'G2', surface: 'turf', distanceM: 2400, month: 1, age: '3+', fillies: false },
  /** ★元 2200m。★番組の 7 距離（V-18 の較正範囲）の 2000 に寄せた（★2026-09-30・オーナー承認・距離の寄せ方は 2026-09-29 裁定 C と同じ） */
  { id: 'g2-maku-jc', name: '幕張ジョッキークラブ杯', venueId: 'shiokaze', grade: 'G2', surface: 'turf', distanceM: 2000, month: 1, age: '3+', fillies: false },
  { id: 'g3-negishi', name: '根岸杯', venueId: 'ookawara', grade: 'G3', surface: 'dirt', distanceM: 1400, month: 2, age: '3+', fillies: false },
  { id: 'g3-soushun', name: '早春杯', venueId: 'ookawara', grade: 'G3', surface: 'turf', distanceM: 1800, month: 2, age: '3', fillies: false },
  /** ★元 2200m。★番組の 7 距離（V-18 の較正範囲）の 2000 に寄せた（★2026-09-30・オーナー承認・距離の寄せ方は 2026-09-29 裁定 C と同じ） */
  { id: 'g2-yodo-kinen', name: '淀記念', venueId: 'aone', grade: 'G2', surface: 'turf', distanceM: 2000, month: 2, age: '3+', fillies: false },
  { id: 'g1-february', name: 'フェブラリー杯', venueId: 'ookawara', grade: 'G1', surface: 'dirt', distanceM: 1600, month: 2, age: '3+', fillies: false },
  { id: 'g2-maku-kinen', name: '幕張記念', venueId: 'shiokaze', grade: 'G2', surface: 'turf', distanceM: 1800, month: 3, age: '3+', fillies: false },
  { id: 'g2-tulip', name: 'チューリップ杯', venueId: 'star-park', grade: 'G2', surface: 'turf', distanceM: 1600, month: 3, age: '3', fillies: true },
  { id: 'g2-yayoi', name: '弥生杯', venueId: 'shiokaze', grade: 'G2', surface: 'turf', distanceM: 2000, month: 3, age: '3', fillies: false },
  { id: 'g2-spring', name: 'スプリング杯', venueId: 'shiokaze', grade: 'G2', surface: 'turf', distanceM: 1800, month: 3, age: '3', fillies: false },
  { id: 'g2-kinshachi', name: '金鯱杯', venueId: 'youkou', grade: 'G2', surface: 'turf', distanceM: 2000, month: 3, age: '3+', fillies: false },
  { id: 'g2-nigawa-daishoten', name: '仁川大賞典', venueId: 'star-park', grade: 'G2', surface: 'turf', distanceM: 3000, month: 3, age: '3+', fillies: false },
  { id: 'g1-spring-sprint', name: '春のスプリント杯', venueId: 'youkou', grade: 'G1', surface: 'turf', distanceM: 1200, month: 3, age: '3+', fillies: false },
  { id: 'g1-naniwa', name: '浪速杯', venueId: 'star-park', grade: 'G1', surface: 'turf', distanceM: 2000, month: 4, age: '3+', fillies: false },
  { id: 'g2-nz', name: 'ニュージーランド杯', venueId: 'shiokaze', grade: 'G2', surface: 'turf', distanceM: 1600, month: 4, age: '3', fillies: false },
  { id: 'g1-ousei', name: '桜花杯', venueId: 'star-park', grade: 'G1', surface: 'turf', distanceM: 1600, month: 4, age: '3', fillies: true, series: { name: '牝馬三冠', leg: 1 } },
  { id: 'g1-satsuki', name: '皐月杯', venueId: 'shiokaze', grade: 'G1', surface: 'turf', distanceM: 2000, month: 4, age: '3', fillies: false, series: { name: '三冠', leg: 1 } },
  { id: 'g2-aoba', name: '青葉杯', venueId: 'ookawara', grade: 'G2', surface: 'turf', distanceM: 2400, month: 4, age: '3', fillies: false },
  { id: 'g2-flora', name: 'フローラ杯', venueId: 'ookawara', grade: 'G2', surface: 'turf', distanceM: 2000, month: 4, age: '3', fillies: true },
  /** ★元 3200m。★番組の 7 距離（V-18 の較正範囲）の 3000 に寄せた（★2026-09-30・オーナー承認・距離の寄せ方は 2026-09-29 裁定 C と同じ） */
  { id: 'g1-spring-emperor', name: '春の皇帝杯', venueId: 'aone', grade: 'G1', surface: 'turf', distanceM: 3000, month: 5, age: '3+', fillies: false },
  { id: 'g1-wakakoma-mile', name: '若駒マイル杯', venueId: 'ookawara', grade: 'G1', surface: 'turf', distanceM: 1600, month: 5, age: '3', fillies: false },
  { id: 'g1-victoria', name: 'ヴィクトリア杯', venueId: 'ookawara', grade: 'G1', surface: 'turf', distanceM: 1600, month: 5, age: '3+', fillies: true },
  { id: 'g1-fuchu-oaks', name: '府中オークス', venueId: 'ookawara', grade: 'G1', surface: 'turf', distanceM: 2400, month: 5, age: '3', fillies: true, series: { name: '牝馬三冠', leg: 2 } },
  { id: 'g1-fuchu-derby', name: '府中ダービー', venueId: 'ookawara', grade: 'G1', surface: 'turf', distanceM: 2400, month: 5, age: '3', fillies: false, series: { name: '三冠', leg: 2 } },
  { id: 'g1-shoka-mile', name: '初夏のマイル杯', venueId: 'ookawara', grade: 'G1', surface: 'turf', distanceM: 1600, month: 6, age: '3+', fillies: false },
  /** ★元 2200m。★番組の 7 距離（V-18 の較正範囲）の 2000 に寄せた（★2026-09-30・オーナー承認・距離の寄せ方は 2026-09-29 裁定 C と同じ） */
  { id: 'g1-takarazuka', name: '宝塚グランプリ', venueId: 'star-park', grade: 'G1', surface: 'turf', distanceM: 2000, month: 6, age: '3+', fillies: false },
  { id: 'g3-tanabata', name: '七夕杯', venueId: 'ginrei', grade: 'G3', surface: 'turf', distanceM: 2000, month: 7, age: '3+', fillies: false },
  { id: 'g2-ishikari', name: '石狩記念', venueId: 'tsukimi', grade: 'G2', surface: 'turf', distanceM: 2000, month: 8, age: '3+', fillies: false },
  { id: 'g3-echigo', name: '越後記念', venueId: 'tenga', grade: 'G3', surface: 'turf', distanceM: 2000, month: 8, age: '3+', fillies: false },
  /** ★元 2200m。★番組の 7 距離（V-18 の較正範囲）の 2000 に寄せた（★2026-09-30・オーナー承認・距離の寄せ方は 2026-09-29 裁定 C と同じ） */
  { id: 'g2-stlite', name: 'セントライト杯', venueId: 'shiokaze', grade: 'G2', surface: 'turf', distanceM: 2000, month: 9, age: '3', fillies: false },
  { id: 'g2-rose', name: 'ローズ杯', venueId: 'star-park', grade: 'G2', surface: 'turf', distanceM: 1800, month: 9, age: '3', fillies: true },
  { id: 'g2-kobe', name: '神戸杯', venueId: 'star-park', grade: 'G2', surface: 'turf', distanceM: 2400, month: 9, age: '3', fillies: false },
  { id: 'g1-sprinters', name: 'スプリンターズ杯', venueId: 'shiokaze', grade: 'G1', surface: 'turf', distanceM: 1200, month: 9, age: '3+', fillies: false },
  { id: 'g2-autumn-crown', name: '秋の王冠', venueId: 'ookawara', grade: 'G2', surface: 'turf', distanceM: 1800, month: 10, age: '3+', fillies: false },
  { id: 'g2-yodo-daishoten', name: '淀大賞典', venueId: 'aone', grade: 'G2', surface: 'turf', distanceM: 2400, month: 10, age: '3+', fillies: false },
  { id: 'g1-shuka', name: '秋華杯', venueId: 'aone', grade: 'G1', surface: 'turf', distanceM: 2000, month: 10, age: '3', fillies: true, series: { name: '牝馬三冠', leg: 3 } },
  { id: 'g1-kikka', name: '菊花杯', venueId: 'aone', grade: 'G1', surface: 'turf', distanceM: 3000, month: 10, age: '3', fillies: false, series: { name: '三冠', leg: 3 } },
  { id: 'g1-autumn-emperor', name: '秋の皇帝杯', venueId: 'ookawara', grade: 'G1', surface: 'turf', distanceM: 2000, month: 11, age: '3+', fillies: false },
  /** ★元 2500m。★番組の 7 距離（V-18 の較正範囲）の 2400 に寄せた（★2026-09-30・オーナー承認・距離の寄せ方は 2026-09-29 裁定 C と同じ） */
  { id: 'g2-argentina', name: 'アルゼンチン杯', venueId: 'ookawara', grade: 'G2', surface: 'turf', distanceM: 2400, month: 11, age: '3+', fillies: false },
  /** ★元 2200m。★番組の 7 距離（V-18 の較正範囲）の 2000 に寄せた（★2026-09-30・オーナー承認・距離の寄せ方は 2026-09-29 裁定 C と同じ） */
  { id: 'g1-autumn-queen', name: '秋の女王杯', venueId: 'aone', grade: 'G1', surface: 'turf', distanceM: 2000, month: 11, age: '3+', fillies: true },
  { id: 'g1-mile-champion', name: 'マイルチャンピオン杯', venueId: 'aone', grade: 'G1', surface: 'turf', distanceM: 1600, month: 11, age: '3+', fillies: false },
  { id: 'g2-fuchu-2yo', name: '府中2歳ステークス', venueId: 'ookawara', grade: 'G2', surface: 'turf', distanceM: 1800, month: 11, age: '2', fillies: false },
  { id: 'g1-japan-intl', name: 'ジャパン国際杯', venueId: 'ookawara', grade: 'G1', surface: 'turf', distanceM: 2400, month: 11, age: '3+', fillies: false },
  { id: 'g1-champions', name: 'チャンピオンズ杯', venueId: 'youkou', grade: 'G1', surface: 'dirt', distanceM: 1800, month: 12, age: '3+', fillies: false },
  { id: 'g1-nigawa-juvenile', name: '仁川ジュベナイル', venueId: 'star-park', grade: 'G1', surface: 'turf', distanceM: 1600, month: 12, age: '2', fillies: true },
  { id: 'g1-nigawa-futurity', name: '仁川フューチュリティ', venueId: 'star-park', grade: 'G1', surface: 'turf', distanceM: 1600, month: 12, age: '2', fillies: false },
  { id: 'g1-hopeful', name: 'ホープフル杯', venueId: 'shiokaze', grade: 'G1', surface: 'turf', distanceM: 2000, month: 12, age: '2', fillies: false },
  /** ★元 2500m。★番組の 7 距離（V-18 の較正範囲）の 2400 に寄せた（★2026-09-30・オーナー承認・距離の寄せ方は 2026-09-29 裁定 C と同じ） */
  { id: 'g1-arima', name: '有馬グランプリ', venueId: 'shiokaze', grade: 'G1', surface: 'turf', distanceM: 2400, month: 12, age: '3+', fillies: false },
];

/** ★格ごとの鞍数（B案）。★検査が `GRADED_RACES` と突き合わせます */
export const GRADED_COUNT_BY_GRADE: Readonly<Record<Grade, number>> = { G1: 24, G2: 20, G3: 6 };

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
