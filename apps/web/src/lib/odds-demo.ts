/**
 * ★**見本のオッズ**（★2026-09-17・オーナー指示
 *   ★「★デザイナーが作った全てのページをログイン認証なしで開発サーバーで見れるようにしてください」）
 *
 * 【★なぜ要るか】
 *   ★`/odds/[id]` は ★**実データを読むだけ**の画面です（★正典 §14.3）。★手元の接続先には
 *   ★いま発売中のレースが無く、★開くと「読み取りに失敗しました」だけが出て、
 *   ★**デザイナーの画面が 1 度も見られません**でした（★配信されている HTML で確認）。
 *
 * 【★この値の立場】
 *   ⚠️ ★**これは見た目を確かめるための見本です。** ★`?demo=1` のときだけ使います。
 *      ★実データの経路には ★**1 行も混ざりません**（★`page.tsx` で分岐し、★通常は読み取りのみ）。
 *   ⚠️ ★**ここでオッズを計算しません。** ★計算はサーバーの仕事です（★§14.3）。
 *      ★見本も ★**書かれた数字をそのまま**持ちます。
 *   ★馬名は ★`DEMO_BET_RACE` から引きます（★名簿を二重に持たない・★D-052）。
 *   ★実在の馬名・レース名・競馬場名は使いません（★憲法 §0.1）。
 */
import { DEMO_BET_RACE } from './game-demo';

/** ★見本のレース（★`/odds/demo` で出ます） */
export const DEMO_ODDS_RACE_ID = 'demo';

/**
 * ★単勝オッズ（★馬番順）。★支持の集まり方に合わせて書いた ★**固定の数字**です。
 * ⚠️ ★`DEMO_BET_RACE.horses` と ★**同じ頭数**でなければなりません（★下で確かめます）。
 */
const DEMO_WIN = [
  12.4, 5.8, 3.2, 6.9, 28.5, 44.0, 2.1, 9.6, 71.3, 4.7, 8.2, 132.0,
] as const;
/** ★複勝の下限と上限（★範囲表記・★資料 §8-9） */
const DEMO_PLACE: readonly (readonly [number, number])[] = [
  [3.1, 4.8], [1.9, 2.6], [1.4, 1.8], [2.2, 3.0], [5.4, 8.1], [7.8, 12.0],
  [1.1, 1.3], [2.8, 4.1], [11.2, 18.4], [1.7, 2.3], [2.5, 3.6], [18.9, 31.2],
];

export interface DemoOddsRow {
  readonly gate: number;
  readonly name: string;
  readonly popularity: number;
  readonly win: number;
  readonly placeLow: number;
  readonly placeHigh: number;
}

/**
 * ★見本の 1 レース分を組み立てます。
 *
 * ⚠️ ★人気は ★**単勝の安い順**で付けます（★これは整形であって予想ではありません）。
 * ⚠️ ★表の長さが頭数と合わなければ ★**投げます**（★足りないぶんを黙って `null` にしない・R-21）。
 */
export function demoOddsRows(): readonly DemoOddsRow[] {
  const horses = DEMO_BET_RACE.horses;
  if (DEMO_WIN.length !== horses.length || DEMO_PLACE.length !== horses.length) {
    throw new Error(`★見本のオッズの数が頭数と違います: 頭数 ${horses.length} / 単勝 ${DEMO_WIN.length} / 複勝 ${DEMO_PLACE.length}`);
  }
  const order = [...horses.map((h, i) => ({ i, win: DEMO_WIN[i]! }))].sort((a, b) => a.win - b.win);
  const rank = new Map<number, number>();
  order.forEach((o, n) => { rank.set(o.i, n + 1); });
  return horses.map((h, i) => ({
    gate: h.gate,
    name: h.name,
    popularity: rank.get(i)!,
    win: DEMO_WIN[i]!,
    placeLow: DEMO_PLACE[i]![0],
    placeHigh: DEMO_PLACE[i]![1],
  }));
}

/** ★見本のレースの見出し（★実在の競馬場名・レース名は使わない・憲法 §0.1） */
export const DEMO_ODDS_RACE = {
  id: DEMO_ODDS_RACE_ID,
  name: DEMO_BET_RACE.raceName,
  grade: null as string | null,
  classRank: 5,
  surface: 'turf',
  distance: 1600,
  trackCondition: 'good',
  status: 'scheduled',
};
