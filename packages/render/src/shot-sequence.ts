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
}

export interface RaceShot {
  readonly family: ShotFamily;
  readonly view: ShotView;
  readonly target: ShotTarget;
  readonly transition: 'cut' | 'blend';
  readonly transitionSec: number;
  readonly camera: ShotCameraPreset;
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
    family: 'start-wide', view: 'diag-rear', target: 'gate', transition: 'cut', transitionSec: 0,
    camera: { backM: 54, upM: 19, sideM: 11, fovDeg: 38 },
  },
  formation: {
    family: 'formation', view: 'diag-rear', target: 'pack', transition: 'blend', transitionSec: 0.8,
    camera: { backM: 43, upM: 15, sideM: 8, fovDeg: 34 },
  },
  'side-pack': {
    family: 'side-pack', view: 'side', target: 'pack', transition: 'cut', transitionSec: 0,
    camera: { backM: 48, upM: 17, sideM: 14, fovDeg: 30 },
  },
  'close-pack': {
    family: 'close-pack', view: 'diag-front', target: 'contenders', transition: 'cut', transitionSec: 0,
    camera: { backM: 27, upM: 11, sideM: 9, fovDeg: 28 },
  },
  'corner-wide': {
    family: 'corner-wide', view: 'high-diag', target: 'pack', transition: 'cut', transitionSec: 0,
    camera: { backM: 66, upM: 28, sideM: 18, fovDeg: 36 },
  },
  'corner-chase': {
    family: 'corner-chase', view: 'diag-rear', target: 'pack', transition: 'cut', transitionSec: 0,
    camera: { backM: 42, upM: 15, sideM: 9, fovDeg: 32 },
  },
  'straight-wide': {
    family: 'straight-wide', view: 'side', target: 'pack', transition: 'cut', transitionSec: 0,
    camera: { backM: 58, upM: 18, sideM: 18, fovDeg: 34 },
  },
  finish: {
    family: 'finish', view: 'diag-front', target: 'leader', transition: 'cut', transitionSec: 0,
    camera: { backM: 50, upM: 17, sideM: 10, fovDeg: 40 },
  },
  winner: {
    family: 'winner', view: 'diag-rear', target: 'winner', transition: 'blend', transitionSec: 0.7,
    camera: { backM: 22, upM: 9, sideM: 7, fovDeg: 25 },
  },
};

const LONG_DISTANCE_CAMERAS: Partial<Record<ShotFamily, ShotCameraPreset>> = {
  'corner-chase': { backM: 72, upM: 30, sideM: 10, fovDeg: 52 },
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
