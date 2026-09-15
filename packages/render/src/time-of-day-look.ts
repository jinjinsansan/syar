import type { Tint } from './season-look.js';

/**
 * ★**時間帯の色味**（★朝・昼・夕・夜・★2026-09-15・計画書 C-1）
 *
 *   ★どの時間帯かは ★`@star/scheduler` の `timeOfDayOfScheduledAt`（★発走の時刻・日本時間）が決めます。
 *   ★ここは ★**その時間帯に何色を重ねるか**だけを持ちます（★描画層は時刻を読みません）。
 *
 * 【★見やすさの線】（★レビュー側の回答 §4-3・計画書 L-5）
 *   ★重ねるのは ★**背景の板（空・木・スタンド・地面）だけ**です。★**馬・勝負服・枠番・HUD には掛けません**（★馬より先に描く）。
 *   ★濃さの上限は ★`TIME_OF_DAY_TINT_MAX`。★夜は景色を暗くしないと夜に見えないので ★季節（0.12）より高くしてあります。
 *   ★介入する人の見せ方では ★介入の局面（★残り 900m〜）で ★`TIME_OF_DAY_INTERVENE_FACTOR` 倍に弱めます（★条件 3）。
 *
 * ⚠️ ★**昼は何も重ねません**（★デモの既定・★従来の見た目のまま 1 画素も変わらない）。
 * ⚠️ ★色は開発側の仮置きです（★オーナーの目で決める）。
 */

/** ★時間帯（★`@star/scheduler` の `TimeOfDay` と同じ名前・★検査が突き合わせます） */
export type TimeOfDayKey = 'morning' | 'day' | 'dusk' | 'night';

/** ★重ねる色の濃さの上限（★夜の景色） */
export const TIME_OF_DAY_TINT_MAX = 0.5;

/** ★介入の局面で弱める倍率 */
export const TIME_OF_DAY_INTERVENE_FACTOR = 0.5;

export interface TimeOfDayLook {
  readonly label: string;
  /** ★地面（芝・ダート）に重ねる色（★無ければ重ねない） */
  readonly ground?: Tint | undefined;
  /** ★景色（空・木・スタンド）に重ねる色（★無ければ重ねない） */
  readonly scenery?: Tint | undefined;
}

export const TIME_OF_DAY_LOOKS: Readonly<Record<TimeOfDayKey, TimeOfDayLook>> = {
  morning: {
    label: '朝', ground: { color: '#fff1d6', alpha: 0.05 }, scenery: { color: '#ffe2b8', alpha: 0.12 },
  },
  day: { label: '昼' },
  dusk: {
    label: '夕', ground: { color: '#d8743a', alpha: 0.12 }, scenery: { color: '#ff8a3d', alpha: 0.26 },
  },
  night: {
    label: '夜', ground: { color: '#0a1230', alpha: 0.32 }, scenery: { color: '#070d26', alpha: 0.5 },
  },
};

/**
 * ★**描画に渡す時間帯の色**（★画面も検査もここを通る）。
 * @param weaken ★介入の局面か（★`true` なら濃さを `TIME_OF_DAY_INTERVENE_FACTOR` 倍）
 */
export function timeOfDayTintsOf(key: TimeOfDayKey, weaken = false): { readonly ground: readonly Tint[]; readonly scenery: readonly Tint[] } {
  const look = TIME_OF_DAY_LOOKS[key];
  const k = weaken ? TIME_OF_DAY_INTERVENE_FACTOR : 1;
  const scaled = (t: Tint | undefined): Tint[] => (t === undefined || !(t.alpha > 0) ? [] : [{ color: t.color, alpha: t.alpha * k }]);
  return { ground: scaled(look.ground), scenery: scaled(look.scenery) };
}
