/**
 * レース中継のショット選択。
 *
 * 着順や馬の位置を作る層ではない。PositionModelが返した現在位置を受け取り、
 * 「何を、どの向きから、どの大きさで見せるか」だけを決める純粋関数。
 */

export type ShotFamily =
  | 'start-wide'
  | 'formation'
  | 'side-pack'
  | 'close-pack'
  | 'corner-wide'
  | 'corner-chase'
  | 'straight-wide'
  | 'finish'
  | 'winner';

export type ShotView = 'side' | 'diag-front' | 'diag-rear' | 'rear' | 'high-diag';
export type ShotTarget = 'gate' | 'pack' | 'contenders' | 'leader' | 'winner';

export interface ShotCameraPreset {
  readonly backM: number;
  readonly upM: number;
  readonly sideM: number;
  readonly fovDeg: number;
  /**
   * ★横視点で、注視点より**後ろ**に置く距離（m）。大きいほどカメラが斜め前を向き、奥の馬ほど画面の進行方向側へ受ける。
   *   省略時は sideM×0.25（従来）。発走ショットは発馬機の描かれ方（奥の枠ほど右）に合わせて 10m。
   */
  readonly alongM?: number;
}

export interface RaceShot {
  readonly family: ShotFamily;
  readonly view: ShotView;
  readonly target: ShotTarget;
  readonly transition: 'cut' | 'blend';
  readonly transitionSec: number;
  readonly camera: ShotCameraPreset;
}

export interface ShotFocusGroups<T> {
  readonly all: readonly T[];
  readonly pack: readonly T[];
  readonly contenders: readonly T[];
  readonly leader: readonly T[];
  readonly winner: readonly T[];
}

/** Webと監査で同じ注視対象を選ぶ。gateは発馬地点ではなく発馬した全馬群を意味する。 */
export function focusForRaceShot<T>(shot: RaceShot, groups: ShotFocusGroups<T>): readonly T[] {
  if (shot.family === 'finish' || shot.target === 'gate') return groups.all;
  if (shot.target === 'leader') return groups.leader;
  if (shot.target === 'winner') return groups.winner;
  if (shot.target === 'contenders') return groups.contenders;
  return groups.pack;
}

export interface ShotSequenceInput {
  readonly distanceMeter: number;
  readonly leaderMeters: number;
  readonly displaySec: number;
  readonly displayDurationSec: number;
  readonly phase: 'start' | 'cruise' | 'spurt' | 'straight';
  readonly allFinished: boolean;
}

const SHOTS: Readonly<Record<ShotFamily, RaceShot>> = {
  'start-wide': {
    family: 'start-wide', view: 'side', target: 'gate', transition: 'cut', transitionSec: 0,
    camera: { backM: 40, upM: 11, sideM: 14, fovDeg: 32 },
  },
  formation: {
    family: 'formation', view: 'side', target: 'pack', transition: 'cut', transitionSec: 0,
    camera: { backM: 36, upM: 10, sideM: 12, fovDeg: 31 },
  },
  'side-pack': {
    family: 'side-pack', view: 'side', target: 'pack', transition: 'cut', transitionSec: 0,
    camera: { backM: 34, upM: 10, sideM: 12, fovDeg: 29 },
  },
  'close-pack': {
    family: 'close-pack', view: 'side', target: 'contenders', transition: 'cut', transitionSec: 0,
    camera: { backM: 27, upM: 8, sideM: 9, fovDeg: 28 },
  },
  'corner-wide': {
    family: 'corner-wide', view: 'side', target: 'pack', transition: 'cut', transitionSec: 0,
    camera: { backM: 44, upM: 13, sideM: 15, fovDeg: 34 },
  },
  'corner-chase': {
    family: 'corner-chase', view: 'side', target: 'pack', transition: 'cut', transitionSec: 0,
    camera: { backM: 34, upM: 10, sideM: 11, fovDeg: 32 },
  },
  'straight-wide': {
    family: 'straight-wide', view: 'side', target: 'pack', transition: 'cut', transitionSec: 0,
    camera: { backM: 38, upM: 11, sideM: 14, fovDeg: 32 },
  },
  finish: {
    family: 'finish', view: 'side', target: 'leader', transition: 'cut', transitionSec: 0,
    camera: { backM: 31, upM: 9, sideM: 10, fovDeg: 32 },
  },
  winner: {
    family: 'winner', view: 'side', target: 'winner', transition: 'cut', transitionSec: 0,
    camera: { backM: 23, upM: 7, sideM: 7, fovDeg: 25 },
  },
};

const LONG_DISTANCE_CAMERAS: Partial<Record<ShotFamily, ShotCameraPreset>> = {
  'corner-chase': { backM: 80, upM: 34, sideM: 10, fovDeg: 58 },
  'straight-wide': { backM: 96, upM: 34, sideM: 14, fovDeg: 52 },
  finish: { backM: 70, upM: 30, sideM: 8, fovDeg: 52 },
};

/** 1600mの寄りを保ちつつ、長距離で縦長になる隊列へ連続的に画角を適応する。 */
export function shotCameraForDistance(shot: RaceShot, distanceMeter: number): ShotCameraPreset {
  const far = LONG_DISTANCE_CAMERAS[shot.family];
  if (!far) return shot.camera;
  const t = Math.max(0, Math.min(1, (distanceMeter - 1600) / 1400));
  const mix = (a: number, b: number) => a + (b - a) * t;
  return {
    backM: mix(shot.camera.backM, far.backM),
    upM: mix(shot.camera.upM, far.upM),
    sideM: mix(shot.camera.sideM, far.sideM),
    fovDeg: mix(shot.camera.fovDeg, far.fovDeg),
  };
}

/** 同じ入力から必ず同じショットを返す。時刻・乱数・DOMへ依存しない。 */
export function raceShotAt(input: ShotSequenceInput): RaceShot {
  const distance = Math.max(1, input.distanceMeter);
  const run = Math.max(0, Math.min(distance, input.leaderMeters));
  const left = distance - run;
  if (input.allFinished) return SHOTS.winner;
  if (left <= 80) return SHOTS.finish;
  if (input.phase === 'straight') return SHOTS['straight-wide'];
  if (input.phase === 'spurt') return SHOTS['corner-chase'];
  if (run <= 120) return SHOTS['start-wide'];
  if (run <= 300) return SHOTS.formation;

  // 道中は一枚の連続パンにせず、参考と同じく引き・寄り・俯瞰を切り替える。
  // 表示時間を使うため、距離別の早送り率が変わっても視聴上のカット尺は安定する。
  const safeDuration = Math.max(1, input.displayDurationSec);
  const safeSec = Math.max(0, Math.min(safeDuration, input.displaySec));
  const slot = Math.floor(safeSec / 6) % 3;
  if (slot === 1) return SHOTS['close-pack'];
  if (slot === 2) return SHOTS['corner-wide'];
  return SHOTS['side-pack'];
}
