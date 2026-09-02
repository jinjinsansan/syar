/**
 * ★監査用のレース組み立ての型（本体は `race-audit-build.mjs`）。`any` を使わないために置く。
 *
 * ⚠️ ★**検査から使う分だけ**を書いています。★本体には他にも輸出があります。
 *    ★足りないものが出たら、**本体を見てからここへ足す**こと（推測で広げない）。
 *
 * ⚠️ ★**2026-09-02 に 3 つの食い違いを直しました。** ★どれも「書いたときは要らなかった」もので、
 *    ★型が本体と離れていました（★宣言だけの嘘は、使うまで誰にも見えません）:
 *      ★① `buildAuditRace` の引数名が `distanceMeter` / `fieldSize` — ★本体は `distance` / `field`
 *      ★② `AuditScene` に `visibleHorses` が無い — ★描画に渡るのはこちらで、`drawn` ではない
 *      ★③ `AuditCourse` が 2 つの数だけ — ★実体は `@star/render` の `Course` そのもの
 */
import type { Course } from '@star/render';

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
  /**
   * ★**描画に渡る馬**（`drawPerspectiveHorses` の第 4 引数）。
   * ⚠️ ★`drawn` とは違います。★`drawn` は場面を解く前の全頭、
   *    ★`visibleHorses` は ★**そのカットが映すと決めた頭**です（`shot.maxVisible` で絞られます）。
   */
  readonly visibleHorses: readonly AuditDrawnHorse[];
}

export interface AuditSceneResult {
  readonly scene: AuditScene;
  readonly drawn: readonly AuditDrawnHorse[];
  readonly raceDisplaySec: number;
}

/**
 * ★走路。★**実体は `@star/render` の `Course` そのもの**です。
 * ⚠️ ★以前ここは `{ distance, widthM }` の 2 つだけを書いた別物でした。★名前は残します
 *    （★既に使っている検査があります）が、★中身は本体と同じものを指します。
 */
export type AuditCourse = Course;

export interface AuditBuilt {
  readonly seed: number;
  /** ★走路。★`@star/render` の `Course` そのもの（`posOf` にそのまま渡せます） */
  readonly course: Course;
  readonly DIST: number;
  readonly FIELD: number;
  readonly surface: 'turf' | 'dirt';
  readonly trackCondition: string;
  readonly turn: 'left' | 'right';
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
  readonly distance?: number;
  readonly field?: number;
  readonly surface?: 'turf' | 'dirt';
  readonly trackCondition?: string;
  readonly trackWidthM?: number;
  /**
   * ★**走路の形（競馬場）**。★渡すと ★エンジン・描画層・横位置の 3 つすべてに同じ形が入ります。
   * ⚠️ ★渡さないと 1 周 2000m / 直線 400m / 幅 20m（★既定の 1 鞍と同じ値）です。
   */
  readonly spec?: { readonly lapM: number; readonly homeStretchM: number; readonly widthM: number };
  readonly turn?: 'left' | 'right';
  readonly balance?: unknown;
}): AuditBuilt;

export declare function auditClock(built: AuditBuilt, ownGate?: number): AuditClock;

/** ★画面と同じ総尺（イントロ ＋ 本編 ＋ 勝馬・着順ボード ＋ ゴール前リプレイ） */
export declare function auditTotalDisplaySec(clock: AuditClock): number;

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
