/**
 * ★**発見度の行**（★正典 **D-108**・**D-116**「発見＝距離・馬場・脚質・気性の判明」）
 *   ★裁定 `REVIEW_DISCOVERY_AXES_20260925.md`（2026-09-25）・移行 `0084_my_horse_discovery_runs.sql`
 *
 * 【🔴 ★何を直したのか】
 *   ★`/stable/retired` の「判明した能力」は ★**見本のデータ**で、しかも
 *   ★**軸が正典と違っていました**（★スピード／スタミナ／パワー／賢さ ＝ **能力**）。
 *   ✔ ★正典 **D-116**: 「★発見＝**距離・馬場・脚質・気性**の判明」
 *   → ★軸を正典に合わせ、★回数はサーバーから取り、★段は `discoveryStageOf` に決めさせます。
 *
 * 【★どこが何を決めるか】（★D-052。★2 か所で決めない）
 *   ★回数 … ★SQL（`my_horse_discovery_runs`）。★**生の条件ごと**に返る
 *   ★距離の帯 … ★`DISTANCE_BANDS` / `distanceBandOf`（`@star/race-engine`・正典 §8.2）
 *   ★「道悪」… ★製品の宣言（★`good` は係数 1.0 ＝ 適性が効かない → ★**good 以外が道悪**）
 *   ★段 … ★`discoveryStageOf`（`@star/sim-engine`）。★**ここでも SQL でも決めません**
 *
 * 【★気性は出しません】（★裁定の答え ③）
 *   ★`RUNAWAY_BASE` が 0 なので、★暴走の回数で数えると ★**永久に「？？？」**になります。
 *   ★簿の戻る条件は「★**D-112 が入ったら**」。
 *
 * 【⚠️ ★脚質は「試した回数」です】（★裁定の答え ④）
 *   ★「逃げを 6 回 試しました」は事実ですが、★「逃げが向く」とは ★**違います**。
 *   → ★画面に ★**「向く」と書かないこと**。★素質の手がかりになります（★D-114）。
 */
import { DISTANCE_BANDS, distanceBandOf, type DistanceBand } from '@star/race-engine';
import type { Strategy } from '@star/sim-engine';
import { authClient } from './supabase';
import { SignInRequiredError } from './stable-repo';

/** ★口が返す 1 行（★生の条件ごとの回数） */
interface RunRow {
  readonly surface: string;
  readonly trackCondition: string;
  readonly distance: number;
  readonly strategy: string;
  readonly runs: number;
}

/** ★画面に出す 1 行（★段は画面で `discoveryStageOf` に渡します） */
export interface DiscoveryRow {
  /** ★軸（★`distance` / `surface` / `condition` / `strategy`） */
  readonly axis: 'distance' | 'surface' | 'condition' | 'strategy';
  /** ★画面に出す名前（★「〜1400m」「芝」「道悪」「逃げ」） */
  readonly label: string;
  /** ★その条件で走った回数（★`discoveryStageOf` に渡す値） */
  readonly runs: number;
}

/** ★距離の帯の見せ方（★`DISTANCE_BANDS` の順を保つ） */
const BAND_LABEL: Readonly<Record<DistanceBand, string>> = {
  sprint: '〜1400m',
  mile: '1401〜1800m',
  intermediate: '1801〜2200m',
  long: '2201〜2800m',
  extended: '2801m〜',
};

/** ★馬場の種類（★DB の値 → 画面の言葉） */
const SURFACE_LABEL: Readonly<Record<string, string>> = { turf: '芝', dirt: 'ダート' };

/** ★脚質（★DB の値 → 画面の言葉） */
const STRATEGY_LABEL: Readonly<Record<Strategy, string>> = {
  nige: '逃げ', senko: '先行', sashi: '差し', oikomi: '追い込み',
};

/**
 * 🔴 ★**「道悪」は good 以外**。
 * ⚠️ ★私が決めた線ではありません。★製品が既に宣言しています:
 *    ✔ `packages/race-engine/src/coefficients.ts:107` … ★`good` は 1.0（★適性が効かない）
 *    ✔ `packages/race-engine/src/balance.ts:72` … 「★稍重・重・不良でのみ heavy_aptitude が効く（4 段）」
 */
export const GOOD_TRACK = 'good';

/**
 * ★回数を軸ごとに束ねます。
 * ⚠️ ★**0 回の行も出します**（★「まだ試していない」＝「？？？」であることに意味があるため）。
 *    ★出さないと「★その条件が存在しない」と読めてしまいます。
 */
export function toDiscoveryRows(rows: readonly RunRow[]): readonly DiscoveryRow[] {
  const out: DiscoveryRow[] = [];

  // ★① 距離（★帯は `DISTANCE_BANDS` の順。★帯の境目をここで書かない）
  for (const { band } of DISTANCE_BANDS) {
    const runs = rows
      .filter((r) => distanceBandOf(r.distance) === band)
      .reduce((n, r) => n + r.runs, 0);
    out.push({ axis: 'distance', label: BAND_LABEL[band], runs });
  }

  // ★② 馬場の種類（★裁定の答え ②「種類と状態の両方・画面では 2 行に分ける」）
  for (const [value, label] of Object.entries(SURFACE_LABEL)) {
    const runs = rows.filter((r) => r.surface === value).reduce((n, r) => n + r.runs, 0);
    out.push({ axis: 'surface', label, runs });
  }

  // ★③ 馬場の状態（★道悪 ＝ good 以外）
  const heavy = rows.filter((r) => r.trackCondition !== GOOD_TRACK).reduce((n, r) => n + r.runs, 0);
  out.push({ axis: 'condition', label: '道悪', runs: heavy });

  // ★④ 脚質（★「試した回数」。★「向く」とは書かない）
  for (const [value, label] of Object.entries(STRATEGY_LABEL)) {
    const runs = rows.filter((r) => r.strategy === value).reduce((n, r) => n + r.runs, 0);
    out.push({ axis: 'strategy', label, runs });
  }

  return out;
}

/** ★自分の馬の発見度の素を読みます（★他人の馬は口が拒みます） */
export async function loadDiscovery(horseId: string): Promise<readonly DiscoveryRow[]> {
  const { data: sessionData } = await authClient().auth.getSession();
  if (sessionData.session === null) throw new SignInRequiredError();
  const { data, error } = await authClient().rpc('my_horse_discovery_runs', { p_horse_id: horseId });
  if (error !== null) throw new Error(error.message);
  const rows: RunRow[] = (Array.isArray(data) ? data : []).map((row: Record<string, unknown>) => ({
    surface: String(row['surface']),
    trackCondition: String(row['track_condition']),
    distance: Number(row['distance']),
    strategy: String(row['strategy']),
    runs: Number(row['runs']),
  }));
  return toDiscoveryRows(rows);
}
