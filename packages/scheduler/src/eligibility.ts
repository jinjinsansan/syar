/**
 * ★**出走資格**（★戦績クラス）— 指示書 `DEV_INSTRUCTIONS_RACE_CLASS_20260918.md` **CL-1**
 *
 * 【★なぜこれが要るのか】
 *   ★正典 §10.3 は番組表を **新馬・1勝・2勝・3勝・オープン・重賞**に分けていますが、
 *   ★**その「クラス」が出走馬の選抜に一切効いていませんでした**
 *   （✔ `conditionsOf` は本体 1 行目で `void raceClass;` とクラスを捨てていました）。
 *   ★そこから 3 つの未決が生まれていました:
 *     - **Q-SETUP-05**: 新馬戦の出走資格の述語が存在しない
 *     - **Q-BAND-04**: 自馬がどのレースに申し込むかが決まらない（無差別 7.7% ／ 同格 41.0%）
 *     - **Q-BAND-01**: 帯の下限の線が引けない
 *
 * 【★この便で分けるもの】（裁定 §2）
 *   | 層 | 何で決まるか | 役割 |
 *   |---|---|---|
 *   | ★**資格** | ★**戦績（勝利数）** ＝ このファイル | ★**そのレースに出られるか** |
 *   | ★**選抜** | ★能力の帯（`races.class_rank`・`sortPoolByClass` の窓） | ★資格のある馬の中から誰を出走させるか |
 *
 *   ⚠️ ★**選抜の側は 1 行も変えません**（`0001_init.sql:161` の註記が
 *      「★無作為抽選にすると 1 番人気の勝率が 51% になり V-4 が壊れる」と**先に警告している**ため・D-018）。
 *
 * 【★勝利数はどこから来るか】
 *   ⚠️ ★**`horses` に勝利数の列はありません**（✔ `0001_init.sql:138` の `g1_wins` は **G1 勝利数のみ**）。
 *   → ★**`race_entries` の `finish_pos = 1` を数えます**（CL-1 の指示どおり。★重ければ列にする）。
 *   ★数える側（DB / シミュレータ）が違っても、★**段の決め方はこのファイルだけが持ちます**（D-052）。
 */

import type { RaceClass } from './programme.js';
import { LIFECYCLE_WEEKS } from './week.js';
import { WEEKS_PER_YEAR } from './birth-week.js';

/**
 * ★**勝利数 → 段**（★添字がそのまま勝利数）。
 * ★`maiden` 0 勝 ／ `win1` 1 勝 ／ `win2` 2 勝 ／ `win3` 3 勝 ／ ★4 勝以上は `open`。
 */
export const CLASS_BY_WINS: readonly RaceClass[] = ['maiden', 'win1', 'win2', 'win3'];

/**
 * ★その馬が**いま属する段**（正典 §10.3 のクラス）。
 *
 * ⚠️ ★**負の数・非整数は投げます**（R-27: 縮退は狭い側・安全な側へ）。
 *    ★黙って `maiden` に落とすと、★**数え方を壊した日に「全馬が新馬戦に出られる」**状態になります。
 */
export function raceClassOfWins(wins: number): RaceClass {
  if (!Number.isInteger(wins) || wins < 0) {
    throw new Error(`raceClassOfWins: 勝利数が整数の 0 以上ではありません（wins=${wins}）`);
  }
  return CLASS_BY_WINS[wins] ?? 'open';
}

/**
 * ★**そのクラスのレースに出られるか**。
 *
 * ★段は**ちょうど一致**で判定します（★1 勝の馬は 1 勝クラスにだけ出る）。
 *   ★これが「勝ち上がり」を流します — ★勝てば上の段へ動き、下の段には戻れません。
 *
 * ⚠️ ★**重賞（`graded`）はオープン馬（4 勝以上）が出る、と読みました**（★開発側の解釈）。
 *    ★正典 §10.3 は「**オープン特別・重賞**」を**1 行**で書いており、★段としては同じ層です。
 *    ★`RaceClass` には `graded` がありますが、★**馬の側の段に `graded` はありません**
 *    （★CL-1 が定める出力は `maiden`〜`open` の 5 つ）。
 *    ★**この 1 点だけ解釈しています。違うなら直します**（報告に明記）。
 */
export function isEligibleFor(raceClass: RaceClass, wins: number): boolean {
  const own = raceClassOfWins(wins);
  if (raceClass === 'graded') return own === 'open';
  return own === raceClass;
}

/**
 * ★**勝ち上がったか**（★段が上がる瞬間）。★流量の測定（CL-7）と物語（§18）で使えます。
 * ★`winsBefore` 勝から 1 勝増えたときに段が変わるなら true。
 */
export function isPromotion(winsBefore: number): boolean {
  return raceClassOfWins(winsBefore) !== raceClassOfWins(winsBefore + 1);
}

/**
 * ★段の順（★下から上へ）。★`graded` は馬の側では `open` と同じ層です（★上の註記）。
 */
const CLASS_RANK: Readonly<Record<RaceClass, number>> = {
  maiden: 0, win1: 1, win2: 2, win3: 3, open: 4, graded: 4,
};

/** ★その馬の段の高さ（★0 = 新馬）。★流量の測定（CL-7）でも使います */
export function rankOfWins(wins: number): number {
  return CLASS_RANK[raceClassOfWins(wins)];
}

/** ★資格で絞った結果（★広げたなら、その幅も返す） */
export interface EligibleSelection<T> {
  readonly pool: readonly T[];
  /** ★下へ何段広げたか（★0 ＝ 広げていない） */
  readonly widenedSteps: number;
}

/**
 * ★**資格のある馬だけを取り出す**（CL-3）。★足りなければ**下の段へ 1 段ずつ広げます**。
 *
 * 【★枯渇したときの振る舞い】（★指示書 CL-3・D-079 ⑦ と同じ形）
 *   ★**黙って広げません。** ★広げた幅を返すので、★呼ぶ側が**記録し、警報を出します**。
 *   ★広げる向きは ★**下だけ**です（★格上挑戦は現実にありますが、
 *   ★**上の段の馬を下の段に降ろすと「賞金の刈り取り」**になります）。
 *
 * ⚠️ ★**選抜（能力の帯・`classBand` の窓）には触りません** — ★ここは**資格の層だけ**です。
 *    ★D-018 の註記「無作為抽選にすると V-4 が壊れる」は、★その下の層の話です。
 *
 * @param minSize これを下回る間だけ広げる（★呼ぶ側の出走頭数の下限）
 */
export function selectEligible<T>(
  raceClass: RaceClass,
  horses: readonly T[],
  winsOf: (h: T) => number,
  minSize: number,
): EligibleSelection<T> {
  const target = CLASS_RANK[raceClass];
  const ranked = horses.map((h) => ({ h, r: rankOfWins(winsOf(h)) }));
  let widenedSteps = 0;
  let pool = ranked.filter((x) => x.r === target);
  while (pool.length < minSize && widenedSteps < target) {
    widenedSteps += 1;
    const floor = target - widenedSteps;
    pool = ranked.filter((x) => x.r >= floor && x.r <= target);
  }
  return { pool: pool.map((x) => x.h), widenedSteps };
}

/** ★そのクラスのレースに出るために要る勝利数の範囲（★`max` が null なら上限なし） */
export interface WinsRange {
  readonly min: number;
  readonly max: number | null;
}

/**
 * ★**そのクラスのレースの「必要な勝利数」**（★DB に書くための形・CL-4）。
 *
 * 【★なぜ範囲で持つのか】
 *   ★`enter_race`（SQL）でも資格を効かせる必要がありますが、★**段の決め方を SQL に写すと二重帳簿**になります
 *   （★D-052。★この案件は同じ形で 5 回失敗しています）。
 *   → ★**段 → 範囲の変換はここ（TypeScript）だけが持ち**、★DB には**数（min/max）だけ**を書きます。
 *   ★SQL は「その数の内側か」を見るだけになり、★**段の定義を知りません**。
 */
export function winsRangeFor(raceClass: RaceClass): WinsRange {
  if (raceClass === 'open' || raceClass === 'graded') return { min: CLASS_BY_WINS.length, max: null };
  const min = CLASS_BY_WINS.indexOf(raceClass);
  if (min < 0) throw new Error(`winsRangeFor: 未知のクラス（${raceClass}）`);
  return { min, max: min };
}

/**
 * ★**重賞の出走条件（年齢・牝馬限定）**（★2026-09-30・正典 D-129 ①・オーナー「完成品にすること」）。
 *
 * 【★なぜ要るか】
 *   ★重賞の暦（`graded-races.ts`）は ★`age`（2 歳／3 歳／3 歳以上）と ★`fillies`（牝馬限定）を持つが、
 *   ★**選抜はそれを 1 度も見ていなかった**（★読んでいたのは見本の画面だけ）。
 *   ★名前を実在に寄せた（D-125）ので ★「桜花杯」「府中2歳ステークス」は ★**名前そのものが条件を言う**。
 *   → ★名前が言うことを ★仕組みが裏付ける（★ここ 1 か所・D-052。★選抜〔worker〕と登録〔enter_race の行の数〕が同じ値を使う）。
 *
 * ★齢の帯は ★`LIFECYCLE_WEEKS.raceableFrom`（2 歳の始まり）と ★`WEEKS_PER_YEAR` から導く（★数を書き写さない）。
 *   ★2 歳 ＝ [raceableFrom, raceableFrom + 1 年) ／ ★3 歳 ＝ [＋1 年, ＋2 年) ／ ★3 歳以上 ＝ [＋1 年, 上限なし)。
 *   ★重賞でない鞍は ★出走できる齢（raceableFrom）以上だけ。
 */
export interface RaceEntryConditions {
  /** ★その週の齢（週）の下限（★含む） */
  readonly minAgeWeeks: number;
  /** ★上限（★含まない）。★null は上限なし */
  readonly maxAgeWeeks: number | null;
  /** ★牝馬限定 */
  readonly filliesOnly: boolean;
}

export function entryConditionsOf(race: { readonly age: '2' | '3' | '3+'; readonly fillies: boolean } | null): RaceEntryConditions {
  const two = LIFECYCLE_WEEKS.raceableFrom;
  const three = two + WEEKS_PER_YEAR;
  if (race === null) return { minAgeWeeks: two, maxAgeWeeks: null, filliesOnly: false };
  const band = race.age === '2' ? { minAgeWeeks: two, maxAgeWeeks: three }
    : race.age === '3' ? { minAgeWeeks: three, maxAgeWeeks: three + WEEKS_PER_YEAR }
      : { minAgeWeeks: three, maxAgeWeeks: null };
  return { ...band, filliesOnly: race.fillies };
}

/** ★その馬が条件を満たすか（★齢はその週の齢・週） */
export function meetsEntryConditions(c: RaceEntryConditions, horse: { readonly sex: 'male' | 'female'; readonly ageWeeks: number }): boolean {
  if (horse.ageWeeks < c.minAgeWeeks) return false;
  if (c.maxAgeWeeks !== null && horse.ageWeeks >= c.maxAgeWeeks) return false;
  if (c.filliesOnly && horse.sex !== 'female') return false;
  return true;
}
