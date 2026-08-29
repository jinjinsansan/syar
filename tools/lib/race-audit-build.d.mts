/**
 * ★監査用のレース組み立ての型（本体は `race-audit-build.mjs`）。`any` を使わないために置く。
 *
 * ⚠️ ★**検査から使う分だけ**を書いています。★本体には他にも輸出があります。
 *    ★足りないものが出たら、**本体を見てからここへ足す**こと（推測で広げない）。
 */

/** ★画面に描かれる 1 頭。`s` は中心線の弧長（m）、`w` は走線（m） */
export interface AuditDrawnHorse {
  readonly gate: number;
  readonly s: number;
  readonly w: number;
}

/** ★カメラ。中身は `@star/render` の `Camera` と同じもの */
export interface AuditCamera {
  readonly eye: { readonly x: number; readonly y: number; readonly z: number };
  readonly target: { readonly x: number; readonly y: number; readonly z: number };
  readonly fovY: number;
  readonly width: number;
  readonly height: number;
}

export interface AuditScene {
  readonly shot: { readonly id: string };
  readonly camera: AuditCamera;
  readonly focusS: number;
  readonly focusW: number;
}

export interface AuditSceneResult {
  readonly scene: AuditScene;
  readonly drawn: readonly AuditDrawnHorse[];
  readonly raceDisplaySec: number;
}

/** ★走路。中身は `@star/render` の `Course` */
export interface AuditCourse {
  readonly distance: number;
  readonly widthM: number;
}

export interface AuditBuilt {
  readonly seed: number;
  readonly course: AuditCourse;
  readonly DIST: number;
  readonly FIELD: number;
}

export interface AuditClock {
  readonly introSec: number;
  readonly warp: { readonly displaySec: number; raceSecAt(displaySec: number): number };
}

export declare const RACE_DEFAULTS: {
  readonly seed: number; readonly ownGate: number;
  readonly distance: number; readonly field: number; readonly trackWidthM: number;
};

/**
 * ★レースを組む。★**引数を省くと画面の既定に落ちます**（台本も γ も・R-31）。
 * ⚠️ ★エンジン既定で測りたいときだけ `balance` を明示すること。
 */
export declare function buildAuditRace(opts?: {
  readonly seed?: number;
  readonly distanceMeter?: number;
  readonly fieldSize?: number;
  readonly balance?: unknown;
}): AuditBuilt;

export declare function auditClock(built: AuditBuilt, ownGate?: number): AuditClock;

/**
 * ★ある表示秒の場面を、★**画面と同じ経路**で解く（R-30）。
 * ⚠️ ★`script` を省くと画面の既定（`DEFAULT_RACE_SCRIPT`）に落ちます。
 */
export declare function auditSceneAt(
  built: AuditBuilt,
  clock: AuditClock,
  displaySec: number,
  viewport?: { readonly width: number; readonly height: number },
  script?: string | undefined,
  opts?: {
    readonly climax?: boolean;
    /**
     * ★注視点を「走線に沿った長さ」で置くか（残件 A-2 の候補 (b′)）。
     * ⚠️ ★省略すると**画面の既定**（`LANE_ALIGNED_FOCUS_DEFAULT`）へ落ちます（R-31）。
     */
    readonly laneAlignedFocus?: boolean;
  },
): AuditSceneResult;
