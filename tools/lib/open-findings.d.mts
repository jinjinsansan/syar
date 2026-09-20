/**
 * ★`open-findings.mjs` の型（★**NT-3**・2026-09-19）。
 *
 * ⚠️ ★`classification.d.mts` / `guard.d.mts` と同じ作法です — ★道具は `.mjs`、★型はここ。
 * ⚠️ ★**中身を写しません**（★一覧は `.mjs` が持ちます・D-052）。★ここは形だけです。
 */

/** ★担当（★宛先の無い指摘を作らない） */
export type FindingOwner = 'dev' | 'review' | 'owner';

/**
 * ★`stillOpen` に渡す道具（★**NT-4**）。
 * ⚠️ ★**数える道具だけ**を渡します（★述語は何かを直すものではありません）。
 */
export interface FindingHelpers {
  /** ★`packages` / `apps` / `tools` で、正規表現に当たる**ファイル数**を返す */
  grepCount(pattern: string, opts?: { exclude?: RegExp }): number;
}

export function defaultHelpers(): FindingHelpers;

export interface OpenFinding {
  /** ★短い識別子（★`M-8` / `AUDIT-TLS` など）。★重複を落とします */
  readonly id: string;
  /** ★何が開いているか */
  readonly what: string;
  /** ★なぜ開いているか（⚠️ ★「調査中」は理由ではありません） */
  readonly why: string;
  readonly owner: FindingOwner;
  /** ★いつまでか（★ISO の日付。★過ぎたら門が落ちます） */
  readonly until: string;
  /**
   * ★**まだ開いているか**を機械が確かめる述語（★**NT-4**・★任意）。
   * ★偽になったら「消し忘れ」として落ちます。
   * ⚠️ 🔴 ★**`() => true` を置かないこと** — ★「通るだけの述語」になります。★書けないなら書かない。
   */
  readonly stillOpen?: (helpers: FindingHelpers) => boolean;
}

export const OPEN_FINDINGS: readonly OpenFinding[];

/**
 * ★**閉じたが、戻る条件が在るもの**（★2026-09-20）。
 * 🔴 ★`returnWhen`（条件）と `reviewBy`（日付）の**両方**を持ちます —
 *    ★条件だけだと、その条件が来ない限り誰も読み返しません（★**DP-1** の罠）。
 */
export interface WatchingItem {
  readonly id: string;
  /** ★何を閉じたか */
  readonly what: string;
  /** ★なぜ閉じてよいか（★証拠） */
  readonly why: string;
  /** ★どうなったら開け直すか */
  readonly returnWhen: string;
  readonly owner: FindingOwner;
  /** ★条件が来なくても、この日には読み返す（★ISO の日付） */
  readonly reviewBy: string;
}

export const WATCHING: readonly WatchingItem[];

/**
 * ★期限切れと書き漏れを返す。
 * @param todayIso ★今日（★`Date.now()` を中で呼ばない・憲法 4）
 * @param registry ★差し替えられる（★そうしないと「落ちる側」を 1 度も試せません）
 *
 * ⚠️ 🔴 ★**`registry` はゆるい型です。** ★この関数の仕事は ★**書き漏れを見つけること**なので、
 *    ★`owner` が `'dev'|'review'|'owner'` でない値も ★**受け取れなければ試せません**
 *    （★受け取れない型にすると、★「落ちる側」を 1 度も試せなくなります・R-14）。
 */
export function diffOpenFindings(
  todayIso: string,
  registry?: readonly Readonly<Record<string, unknown>>[],
  helpers?: FindingHelpers,
): {
  readonly expired: string[];
  readonly missingFields: string[];
  /** ★`stillOpen` が偽 ＝ ★もう開いていない（★消し忘れ） */
  readonly closed: string[];
};
