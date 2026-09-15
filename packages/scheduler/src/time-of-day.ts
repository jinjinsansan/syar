/**
 * ★**時間帯**（★朝・昼・夕・夜・★2026-09-15・計画書 C-1・オーナー決定 2「発走の時刻から」）
 *
 * 【★何で決めるか】
 *   ★入力は ★**レースに保存された発走の時刻**（`scheduled_at`・ミリ秒）です。★**日本時間で固定**します。
 *   ★見る人の端末の時計は読みません（★同じレースを見ている人の間で画が変わらない・憲法 4）。
 *   ★レース名からは決めません（★レビュー側の回答 §4-1）。
 *
 * 【★対応表は 1 か所】（★D-052）
 *   ★何時〜何時を朝・昼・夕・夜とするかは ★`TIME_OF_DAY_BANDS` だけに書きます。
 *   ★G1 の枠（`G1_SLOTS`）は ★09:00＝朝・13:00＝昼・20:00＝夜 になります。
 *
 * ⚠️ ★着順・位置には触れません（★描画の見た目だけ・憲法 3）。
 */

export type TimeOfDay = 'morning' | 'day' | 'dusk' | 'night';

/** ★時間帯の一覧（★描画の色の表と ★同じ並び・同じ名前であることを検査が見ます） */
export const TIME_OF_DAYS: readonly TimeOfDay[] = ['morning', 'day', 'dusk', 'night'];

export const TIME_OF_DAY_LABELS: Readonly<Record<TimeOfDay, string>> = {
  morning: '朝', day: '昼', dusk: '夕', night: '夜',
};

/** ★日本時間のずれ（分）。★夏時間は無いので固定 */
export const JST_OFFSET_MINUTES = 9 * 60;

/**
 * ★**日本時間の何分から、どの時間帯か**（★開発側の仮置き・★オーナーの目で決める）。
 *   ★00:00 夜 ／ 05:00 朝 ／ 10:00 昼 ／ 16:30 夕 ／ 18:30 夜
 * ⚠️ ★昇順に並べること（★検査が見ます）。
 */
export const TIME_OF_DAY_BANDS: readonly { readonly fromMinute: number; readonly band: TimeOfDay }[] = [
  { fromMinute: 0, band: 'night' },
  { fromMinute: 5 * 60, band: 'morning' },
  { fromMinute: 10 * 60, band: 'day' },
  { fromMinute: 16 * 60 + 30, band: 'dusk' },
  { fromMinute: 18 * 60 + 30, band: 'night' },
];

/** ★日本時間の 1 日の何分目（0〜1439）→ 時間帯 */
export function timeOfDayAtJstMinute(minuteOfDay: number): TimeOfDay {
  if (!Number.isFinite(minuteOfDay)) throw new Error(`時刻が不正です: ${minuteOfDay}`);
  const m = ((Math.floor(minuteOfDay) % 1440) + 1440) % 1440;
  let band: TimeOfDay = TIME_OF_DAY_BANDS[0]!.band;
  for (const row of TIME_OF_DAY_BANDS) if (m >= row.fromMinute) band = row.band;
  return band;
}

/** ★**発走の時刻**（UTC のミリ秒）→ 時間帯（★日本時間で固定） */
export function timeOfDayOfScheduledAt(scheduledAtMs: number): TimeOfDay {
  if (!Number.isFinite(scheduledAtMs)) throw new Error(`発走の時刻が不正です: ${scheduledAtMs}`);
  const minutesUtc = Math.floor(scheduledAtMs / 60_000);
  return timeOfDayAtJstMinute(minutesUtc + JST_OFFSET_MINUTES);
}

/**
 * ★**デモの `/race` の時間帯**（★デモには発走の時刻が無い・★オーナー決定 2 の条件）。
 *   ★見比べの口 `?tod=morning|day|dusk|night` で切り替えます。★省くと ★昼（★従来の見た目のまま）。
 * ⚠️ ★知らない値は ★昼へ落とし、★落ちたことを返します（★R-27 の系・`raceSetupFromParam` と同じ形）。
 */
export const DEMO_TIME_OF_DAY: TimeOfDay = 'day';

export function timeOfDayFromParam(raw: string | null | undefined): { timeOfDay: TimeOfDay; fellBack: boolean } {
  if (raw === null || raw === undefined || raw === '') return { timeOfDay: DEMO_TIME_OF_DAY, fellBack: false };
  const found = (TIME_OF_DAYS as readonly string[]).includes(raw);
  return { timeOfDay: found ? (raw as TimeOfDay) : DEMO_TIME_OF_DAY, fellBack: !found };
}
