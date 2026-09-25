/**
 * ★**実レース 1 本を読む**（★段 2・2026-09-26・裁定 `REVIEW_RACE_WIRING_20260926.md` Q-RACE-2）
 *   ★計画 `PLAN_RACE_REAL_WIRING_20260926.md`・★正本 `DESIGN_LIVE_RACE_DATA_CONTRACT_20260921.md`
 *
 * 【🔴 ★この層が ★**決めないこと**】
 *   ★① ★**着順を決めません。** ★`finish_pos` を ★そのまま読みます（★憲法 3・サーバー権威）。
 *   ★② ★**馬番を作りません。** ★`gate` を ★そのまま読みます。
 *     ⚠️ ★`/race` は 2026-09-26 まで ★`horseId: String(i + 1)` で ★**index を馬番と言い張って**いました。
 *   ★③ ★**毛色を決めません。** ★`coatOfHorseId(horseId)`（`@star/render`）が唯一の出どころです。
 *
 * 【★なぜ `parseReplayRunners` を共有するか】
 *   ★契約 §実装前の判定 は ★「同じレース ID の常設表示と本編の馬番・位置・着順が一致する」を要求します。
 *   → ★★**同じ関数を通せば、★突き合わせではなく ★構造で一致します。**
 *   ★常設帯（`components/uma/race-strip.tsx`）と ★この層が ★同じ `parseReplayRunners` を呼びます。
 *   ⚠️ ★位置の式（★見せ方）は ★2 か所のままです（★簿 `RACE-POSITION-FORMULA-DUPLICATED`・
 *      ★裁定「着順と馬番を決めないなら、位置の式は見せ方に降格する」）。
 *
 * 【⚠️ ★確定済みだけ】
 *   ★走行は ★**`settled` のときだけ**出します（★契約 §暫定の録画表示）。
 *   ★発走前の公開データから確定着順は読めません（★`race_entries_public` が `settled` 以外で null）。
 */
import { parseReplayRunners, type ReplayRunner } from '../components/uma/race-replay';
import { readClient } from './supabase';

/** ★読めなかった理由（★画面はこれをそのまま出さず、★言葉に直して出します） */
export class RaceNotPlayableError extends Error {}

export interface RealRaceData {
  readonly id: string;
  readonly raceName: string;
  readonly status: string;
  readonly scheduledAt: string;
  /** ★出走馬（★枠番の順・★`parseReplayRunners` が検証済み） */
  readonly runners: readonly ReplayRunner[];
}

/**
 * ★**確定済みの 1 本を読む**。★読めないときは ★`RaceNotPlayableError` を投げます。
 * ⚠️ ★**空の一覧で「レースが無い」に見せません**（★R-16）。★投げます。
 */
export async function loadRealRace(raceId: string): Promise<RealRaceData> {
  const read = readClient();

  const raceRes = await read.from('races_public')
    .select('id, name, status, scheduled_at').eq('id', raceId).limit(1);
  if (raceRes.error !== null) {
    throw new RaceNotPlayableError(`レースを読めませんでした: ${raceRes.error.message}`);
  }
  const race = raceRes.data?.[0];
  if (race === undefined) throw new RaceNotPlayableError('そのレースはありません');
  const status = String(race.status);
  /**
   * 🔴 ★**確定前は走行を出しません**（★契約 §表示段階）。
   *   ⚠️ ★ここで見本の走行に落とすと ★**「そのレースを見た」と嘘になります**。
   */
  if (status !== 'settled') {
    throw new RaceNotPlayableError(`このレースはまだ確定していません（いまの状態: ${status}）`);
  }

  const entRes = await read.from('race_entries_public')
    .select('gate,horse_name,strategy,finish_pos,finish_time,horse_id')
    .eq('race_id', raceId).order('gate');
  if (entRes.error !== null) {
    throw new RaceNotPlayableError(`出走表を読めませんでした: ${entRes.error.message}`);
  }
  const rows = ((entRes.data ?? []) as Record<string, unknown>[])
    .filter((r) => r['finish_pos'] !== null && r['finish_pos'] !== undefined);

  /**
   * ⚠️ ★`parseReplayRunners` は ★**1 つでも噛み合わなければ空**を返します
   *    （★タイムの順と着順が合わない・★枠の重複・★`horse_id` が無い 等）。
   *    ★`0089` を当てていない環境では ★`horse_id` が来ないので ★ここで空になります。
   */
  const runners = parseReplayRunners(rows);
  if (runners.length === 0) {
    throw new RaceNotPlayableError(
      '出走表が揃っていません（★着順・走破タイム・馬 ID のどれかが欠けています。'
      + '★移行 0089 が当たっていない環境でも こうなります）',
    );
  }

  return {
    id: String(race.id),
    raceName: String(race.name),
    status,
    scheduledAt: String(race.scheduled_at),
    runners,
  };
}
