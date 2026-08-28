/**
 * ★**監査用にレースを 1 本組む**（読取専用）
 *
 *   規則は `apps/web/src/app/race/page.tsx` の `build()` と同じです。
 *   ⚠️ ★レース結果へ触れません。読むだけです（憲法 3）。
 *   ⚠️ ★乱数・時刻を使いません（憲法 4）。
 *
 * 【なぜここに置くか】
 *   同じ組み立てが `page.tsx` と `tools/shot-race-at.mjs` にもあります（以前からの重複）。
 *   共通部品は S3 の隔離で本線から外したので、**監査用の読取専用**として置き直します
 *   （`DEV_INSTRUCTIONS_P4_2D_MATERIAL_REPETITION_AUDIT_20260824.md` §2 が許す範囲）。
 *   ★式は増やしていません。既存の 2 か所と同じ値になることをテストで見ます。
 */
import { readFileSync } from 'node:fs';
import {
  DEFAULT_RACE_BALANCE, resolveRace, paceOf, replayOf, finalOrderMatches, laneAt,
} from '@star/race-engine';
import {
  DEMO_CONTEST_GAMMA, finishReplayAt, finishCrossDisplaySec, raceTotalDisplaySec,
  ovalCourse, replayPositionModel, finalOrderOf,
  knotsFor, ratesForTarget, targetDisplaySec, timeWarpFor, withFinishRunOut, finishSpeedsOf,
  broadcastV2StartLagM, broadcastV2FinishStyleOf, resolveBroadcastV2Scene,
  climaxDisplayPositions, CLIMAX_LEAD_COUNT,
} from '@star/render';

const POOL = JSON.parse(readFileSync('apps/web/src/lib/watch-pool.json', 'utf8'));
const STRATS = ['nige', 'senko', 'sashi', 'oikomi'];

/**
 * ★**本編のあとの区間**（`page.tsx` の `WINNER_FOLLOW_SEC` + `RESULTS_BOARD_SEC` と同じ値）。
 *   ⚠️ ★ページの私有定数の写しです。★ずれると道具だけが別の総尺で回ります（R-30）。
 */
export const AUDIT_WINNER_FOLLOW_SEC = 2.4;
export const AUDIT_RESULTS_BOARD_SEC = 6;
export const AUDIT_POST_RACE_SEC = AUDIT_WINNER_FOLLOW_SEC + AUDIT_RESULTS_BOARD_SEC;

/** ★画面と同じ総尺（イントロ＋本編＋勝馬・着順ボード＋ゴール前リプレイ） */
export function auditTotalDisplaySec(clock) {
  return raceTotalDisplaySec(clock.introSec, clock.warp.displaySec, AUDIT_POST_RACE_SEC);
}

/**
 * ★**画面の既定と同じ balance**（γ だけがエンジン既定と違う）。
 *   ★`DEMO_CONTEST_GAMMA` は `@star/render` が唯一の出どころです（同じ値を 2 か所に持たない）。
 */
export const AUDIT_SCREEN_BALANCE = DEMO_CONTEST_GAMMA === DEFAULT_RACE_BALANCE.TIME_GAP_SHAPE_GAMMA
  ? DEFAULT_RACE_BALANCE
  : { ...DEFAULT_RACE_BALANCE, TIME_GAP_SHAPE_GAMMA: DEMO_CONTEST_GAMMA };

/** ★`/race` の既定と同じ */
export const RACE_DEFAULTS = { seed: 42, ownGate: 3, distance: 1600, field: 12, trackWidthM: 20 };

export function buildAuditRace(opts = {}) {
  const seed = opts.seed ?? RACE_DEFAULTS.seed;
  const DIST = opts.distance ?? RACE_DEFAULTS.distance;
  const FIELD = opts.field ?? RACE_DEFAULTS.field;
  const course = ovalCourse(DIST, { widthM: opts.trackWidthM ?? RACE_DEFAULTS.trackWidthM, turn: 'left' });

  const start = (seed * 13) % Math.max(1, POOL.length - FIELD);
  const entrants = POOL.slice(start, start + FIELD).map((h, i) => ({
    horseId: String(i + 1), stats: h.stats, surfaceAptitude: h.surfaceAptitude,
    distanceCenter: h.distanceCenter, distanceRange: h.distanceRange,
    strategyAptitude: h.strategyAptitude, heavyAptitude: h.heavyAptitude,
    strategy: STRATS[(i + seed) % 4], condition: 3, fatigue: 20,
    weightKg: 55, gate: i + 1, age: 4, skillGenes: h.skillGenes,
  }));
  const conditions = {
    raceId: `r${seed}-turf-good`, distance: DIST, surface: 'turf',
    trackCondition: 'good', courseShape: 'oval', baseWeightKg: 55,
  };
  /**
   * ★**既定は「画面の既定」**です（2026-08-28・裁定 §6 の宿題 2 ・R-31）。
   *
   * ⚠️ ★以前ここは `DEFAULT_RACE_BALANCE`（＝エンジン既定の γ=1.0）でした。
   *    ★画面は 1.3 なので、★**balance を渡していない道具 24 本が全部
   *    オーナーと違う写像で測っていました。** 渡し忘れが**画面と違う側へ落ちる**形です。
   * → ★**渡さなければ画面と同じ側へ落ちます。** 比較のために差し替えたいときだけ `opts.balance`。
   * ⚠️ ★エンジン既定で測りたいときは `opts.balance: DEFAULT_RACE_BALANCE` を**明示**すること。
   */
  const balance = opts.balance ?? AUDIT_SCREEN_BALANCE;
  const result = resolveRace({ conditions, entrants, seed, balance });
  const { pace } = paceOf(entrants, balance);
  const boundaries = replayOf(result, (g) => entrants[g - 1].strategy, pace);
  if (!finalOrderMatches(result, boundaries)) throw new Error('★D-059: 着順が確定着順と違う');
  const model = replayPositionModel({
    distanceMeter: DIST, spurtMetersLeft: 800, straightMetersLeft: 400, boundaries,
    strategyOf: (g) => entrants[g - 1].strategy, pace, formationSeed: seed * 2654435761,
    laneOf: (gate, metersLeft) => laneAt(gate, FIELD, metersLeft, DIST, seed),
  });
  if (JSON.stringify(finalOrderOf(model)) !== JSON.stringify(result.order.map((e) => Number(e.horseId)))) {
    throw new Error('★D-059: 位置モデルの最終順が着順と違う');
  }
  return { seed, course, entrants, result, boundaries, model, pace, DIST, FIELD, balance };
}

/* ── ★画面と同じ経路で「表示秒 → 場面」を作る ─────────── */

/** ★`page.tsx` と同じ定数 */
const RACE_INTRO_RACE_START_SEC = 7.8;
const RACE_SPEED_MPS = 15.6;
const HORSE_LENGTH_M = 2.4;
/**
 * ★`page.tsx:152` と同じ値。★以前ここは 40 でした（実画面は 400）。
 *   ⚠️ 台本 v5 ではカット選択に効きません（`broadcastV2ShotAt` は台本の割合で決めます）が、
 *      `cutProgress`（＝コーナー 1 枚絵のパン量）が実画面の 10 倍速く進んでいました。
 */
const CORNER_CUT_M_WEB = 400;
const FOURTH_CORNER_FRONT_WEB = true;
/** ★`page.tsx:154` と同じ値。★以前ここは 0.55 でした（実画面は 0.6）＝ゴール後の流しが速すぎました */
const RUNOUT_SLOW = 0.6;
const startShownMeters = (meters, raceDisplaySec) =>
  Math.max(0, meters - broadcastV2StartLagM(raceDisplaySec, RACE_SPEED_MPS));

/**
 * ★**時間の対応と展開判定**を作る（`page.tsx` の `build()` と同じ順番・同じ公開 API）。
 * ⚠️ ★ここは `packages/render` の公開関数を同じ順に呼んでいるだけです。
 *    ページの私有関数は写していません。
 */
export function auditClock(built, ownGate = RACE_DEFAULTS.ownGate) {
  const knots = knotsFor(built.boundaries, ownGate);
  const warp = timeWarpFor(knots, ratesForTarget(knots, targetDisplaySec(built.DIST)));
  const finishSec = new Map(built.boundaries.map((b) => [b.gate, b.finishSec]));
  let finishStyle = 'solo';
  for (let sec = 0; sec <= warp.raceSecAt(warp.displaySec) + 1e-9; sec += 0.05) {
    const sortedM = built.model.at(sec).map((h) => h.meters).sort((a, b) => b - a);
    if ((sortedM[0] ?? 0) >= built.DIST - 80) { finishStyle = broadcastV2FinishStyleOf(sortedM, HORSE_LENGTH_M); break; }
  }
  /** ★各馬の通過時の速さ（`page.tsx` と同じ・リプレイで線の前後の速さを揃える） */
  const finishSpeeds = finishSpeedsOf(built.model, (g) => finishSec.get(g), [...finishSec.keys()]);
  return { warp, finishSec, finishSpeeds, finishStyle, introSec: RACE_INTRO_RACE_START_SEC };
}

/**
 * ★**その表示秒（イントロ込み）の場面と、描かれる馬の位置**を返す。
 *   `?auditSec=<d>` で撮った 1 コマと同じ状態になります。
 */
export function auditSceneAt(built, clock, displaySec, viewport = { width: 1280, height: 720 }, script = undefined, opts = {}) {
  const raceD = Math.max(0, displaySec - clock.introSec);
  const clampedD = Math.min(raceD, clock.warp.displaySec);
  /**
   * ★**ゴール前のリプレイ**（`finish-replay.ts`・`page.tsx` と同じ関数を通します・R-30）。
   *   ⚠️ ★本編の時間軸には触れません。区間に入ったときだけ、時間を巻き戻して
   *      同じ位置モデルをもう一度読み、専用のカットへ固定します。
   */
  /** ★並びは 本編 → 勝馬の寄り → リプレイ → 着順ボード（`page.tsx` と同じ・指摘④） */
  /** ★勝馬が決勝線を通る表示秒（`page.tsx` と同じ・本編の終わりとは違う） */
  const winnerGateForReplay = built.entrants.find(
    (e) => e.horseId === built.result.order[0].horseId,
  )?.gate;
  const crossD = finishCrossDisplaySec(
    (d) => built.model.at(clock.warp.raceSecAt(d)).find((h) => h.gate === winnerGateForReplay)?.meters ?? 0,
    built.DIST, clock.warp.displaySec,
  );
  const replay = finishReplayAt(raceD, clock.warp.displaySec, AUDIT_WINNER_FOLLOW_SEC, crossD);
  /**
   * ★**リプレイ中は「本編の表示秒」を差し替えるだけ**（`page.tsx` と同じ・R-30）。
   *   ★時間ワープ・位置モデル・発走の遅れ・ゴール後の流しが本編と同じ経路を通ります。
   */
  const sourceD = replay.active ? replay.sourceDisplaySec : clampedD;
  /** ⚠️ ★`raceSecAt` は本編の範囲までしか答えません。★超えると NaN になります（実測） */
  const sec = clock.warp.raceSecAt(Math.min(sourceD, clock.warp.displaySec));
  const at = built.model.at(sec);
  /**
   * ★流しの起点は、本編なら本編の終わり、リプレイなら勝馬の通過（`page.tsx` と同じ）。
   * ★リプレイでは各馬が**自分の速さ**で線を通り抜けます（2 着以降の跳びを消すため）。
   */
  const runoutFrom = replay.active ? crossD : clock.warp.displaySec;
  const visual = replay.active
    ? withFinishRunOut(at, (g) => clock.finishSec.get(g), sec, built.DIST, 0, 14,
      (g) => clock.finishSpeeds.get(g))
    : withFinishRunOut(at, (g) => clock.finishSec.get(g), sec, built.DIST,
      Math.max(0, sourceD - runoutFrom) * RUNOUT_SLOW);
  /**
   * ★**勝馬がゴールしたか**。`page.tsx:1558` と同じ判定です（R-30）。
   *   ⚠️ ★以前ここは `false` 固定でした。そのため**勝馬クローズアップが監査に一度も出ず**、
   *      指示書 §5 の「定義が残っているだけで完了としない」に該当していました。
   */
  const winnerGate = (() => {
    const row = built.result.order[0];
    return built.entrants.find((e) => e.horseId === row.horseId)?.gate;
  })();
  const winnerDone = (at.find((h) => h.gate === winnerGate)?.meters ?? 0) >= built.DIST - 1e-6;
  const base = visual.map((h) => ({
    gate: h.gate,
    s: startShownMeters(h.meters, raceD),
    w: h.w ?? built.course.widthM / 2,
    finished: h.meters >= built.DIST - 1e-6,
  }));
  /**
   * ★**最後の直線の攻防（表示専用）**。`page.tsx` と**同じ関数・同じ引数**を通します（R-30）。
   *   ⚠️ ★**既定は「使わない」**です（2026-08-27）。`climax: true` を渡したときだけ入ります。
   *      ★画面の既定（`page.tsx` の `climaxDisabled`）と**同じ側**に揃えてあります（R-30）。
   *      ★以前は逆（渡さなければ入る）で、画面が v5 既定で演出を入れていた頃と対でした。
   *      演出が既定から外れたので、測定器もこちら側へ移します。
   *   ⚠️ ★着順は `built.result.order` の**確定着順**から取ります。見た目の順位ではありません。
   */
  const finishPositionOf = new Map(built.result.order.map((row, i) => {
    const gate = built.entrants.find((e) => e.horseId === row.horseId)?.gate;
    return [gate, row.finishPosition ?? i + 1];
  }));
  const posed = climaxDisplayPositions(
    base.map((h) => ({ gate: h.gate, s: h.s, finishPosition: finishPositionOf.get(h.gate) ?? 99 })),
    { seed: built.seed, distanceM: built.DIST, disabled: opts.climax !== true },
  );
  const offsetByGate = new Map(posed.map((p) => [p.gate, p.offsetM]));
  const drawn = base.map((h, i) => ({ ...h, s: posed[i].s }));
  /**
   * ★**主役群の馬番**（確定着順の上位 5 頭）。`page.tsx` と同じ渡し方です（R-30）。
   *   ⚠️ ★カメラが着外の馬に引っ張られて引かないようにするためだけの情報で、
   *      ★着順にも馬の位置にも触れません（憲法3・指示書 §4-4）。
   */
  const leadGates = [...finishPositionOf.entries()]
    .filter(([, place]) => place >= 1 && place <= CLIMAX_LEAD_COUNT)
    .sort((a, b) => a[1] - b[1])
    .map(([gate]) => gate);
  const scene = resolveBroadcastV2Scene(built.course, drawn, viewport, winnerDone, {
    ...(replay.active ? { forceShotId: 'finish-replay' } : {}),
    finishStyle: clock.finishStyle, cornerCutM: CORNER_CUT_M_WEB,
    raceDisplaySec: raceD, fourthCornerFront: FOURTH_CORNER_FRONT_WEB, winnerRear: false,
    leadGates,
    /** ★`climax` を渡さない／`true` 以外は**カメラ側の直しも**切ります（`page.tsx` と同じ・§8-B） */
    climaxCameraDisabled: opts.climax !== true,
    /**
     * ★**台本 v6 は `finish-line` の「引く」枠取りを外します**（`page.tsx:1790` と同じ・R-30）。
     *
     * ⚠️ ★以前ここは**呼ぶ側が渡したときだけ**効いていました。ところが画面は
     *    ★**台本が v6 なら必ず外します。** そのため渡し忘れた道具は
     *    ★**画面より広い画角で測って**いました（実測: ゴール前の画角 26.0°／画面は 15°）。
     *    ★2026-08-28、オーナー指摘「ゴール前で急に迫力がなくなる」を追う過程で発覚。
     * → ★**台本から決めます。** 呼ぶ側の明示があればそちらを優先します。
     */
    ...(opts.noContenderFrameShots ?? (script === 'v6' ? ['finish-line'] : undefined)
      ? { noContenderFrameShots: opts.noContenderFrameShots ?? ['finish-line'] } : {}),
    ...(script === undefined ? {} : { script }),
  });
  return { raceSec: sec, raceDisplaySec: raceD, drawn, base, offsetByGate, winnerDone, scene };
}
