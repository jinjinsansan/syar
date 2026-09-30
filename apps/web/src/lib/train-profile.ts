/**
 * ★**育成モードで見せる「この馬の実力」**（★2026-09-30・オーナー「馬の実力を表すものを マイページではなく 育成ページで 全て一目で見えるように」）。
 *
 * 🔴 ★**能力の数値（`stats`）・素質（`potential`）は出しません**（★正典 §5.5・§12.4・D-114。★本人にも出さない）。
 *   ★D-114「★強さの手がかりは オッズと戦績だけ」・D-116（★状態／成長／発見／物語）に沿って、★出してよいものだけを集めます:
 *   ★戦績（出走・1〜3 着・G1 勝ち）／★最近の着順／★条件ごとの経験（距離・馬場・道悪・脚質）。
 * ⚠️ ★血統（父・母の名前）は ★まだ出していません — ★`my_horses` は `sire_id` と 系統の id（`sire_line`・内部の記号）しか持たず、★名前を出すには ビューの変更（移行）が要る。
 * ⚠️ ★読むのは 自分の馬の口だけ（`my_horses`・`my_runs`・`my_horse_discovery_runs`）。★他人の馬は RLS と口が拒みます。
 */
import { authClient } from './supabase';
import { SignInRequiredError } from './stable-repo';
import { loadDiscovery, type DiscoveryRow } from './discovery-screen';

export interface RecentRun {
  readonly raceName: string;
  readonly finishPos: number;
  readonly fieldSize: number;
}

export interface TrainProfile {
  readonly starts: number;
  readonly wins: number;
  readonly seconds: number;
  readonly thirds: number;
  readonly gradedWins: number;
  /** ★新しい順に最大 5 走 */
  readonly recent: readonly RecentRun[];
  readonly discovery: readonly DiscoveryRow[];
}

/** ★最近の着順を何走まで出すか（★一目で見える数） */
export const RECENT_RUNS = 5;

/** ★戦績を 1 か所で数える（★1 着・2 着・3 着・★`my_runs` は確定した走りだけ） */
export function placesOf(finishes: readonly number[]): { readonly wins: number; readonly seconds: number; readonly thirds: number } {
  return {
    wins: finishes.filter((p) => p === 1).length,
    seconds: finishes.filter((p) => p === 2).length,
    thirds: finishes.filter((p) => p === 3).length,
  };
}

export async function loadTrainProfile(horseId: string): Promise<TrainProfile> {
  const { data: sessionData } = await authClient().auth.getSession();
  if (sessionData.session === null) throw new SignInRequiredError();
  const [horseRes, runsRes, discovery] = await Promise.all([
    authClient().from('my_horses').select('starts, g1_wins').eq('id', horseId).limit(1),
    authClient().from('my_runs').select('race_name, finish_pos, field_size, scheduled_at').eq('horse_id', horseId)
      .order('scheduled_at', { ascending: false }),
    loadDiscovery(horseId),
  ]);
  if (horseRes.error !== null) throw new Error(`my_horses を読めませんでした: ${horseRes.error.message}`);
  if (runsRes.error !== null) throw new Error(`my_runs を読めませんでした: ${runsRes.error.message}`);
  const h = (horseRes.data ?? [])[0] as Record<string, unknown> | undefined;
  const runs = (runsRes.data ?? []) as Record<string, unknown>[];
  const finishes = runs.map((r) => Number(r['finish_pos']));
  const places = placesOf(finishes);
  return {
    /** ★出走数は ★`my_horses.starts`（★`horse_starts()`・画面の戦績と数え方を 1 つに） */
    starts: Number(h?.['starts'] ?? runs.length),
    ...places,
    gradedWins: Number(h?.['g1_wins'] ?? 0),
    recent: runs.slice(0, RECENT_RUNS).map((r) => ({
      raceName: String(r['race_name'] ?? ''),
      finishPos: Number(r['finish_pos']),
      fieldSize: Number(r['field_size']),
    })),
    discovery,
  };
}
