/** ★レース詳細の画面に渡す値（★`page.tsx` が読んで計算し ★`race-detail-view.tsx` が描く・★網 race-detail-view.test.ts も使う） */
export interface RaceDetailRow {
  readonly gate: number;
  readonly horseName: string;
  readonly ownerLabel: string;
  readonly strategy: string;
  readonly odds: number | null;
  readonly capped: boolean;
  readonly popularity: number | null;
  readonly place: number | null;
  readonly finishTime: string | null;
}

export interface RaceDetailProps {
  readonly id: string;
  readonly status: string;
  readonly title: string;
  readonly gradeLabel: string;
  readonly scheduledAtIso: string;
  readonly startClock: string;
  readonly distanceLabel: string;
  readonly conditionLabel: string;
  readonly purse: number;
  readonly rows: readonly RaceDetailRow[];
  readonly commit: string;
  readonly reveal: string | null;
  /** ★`verifyReveal` の結果（★null は まだ公開前） */
  readonly verified: boolean | null;
}
