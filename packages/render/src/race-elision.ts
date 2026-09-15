import type { PhaseKnots, TimeWarp } from './time-warp.js';
import { firstPassStraightsMOf, homeStretchMetersOf, leadingStraightMetersOf, type Course } from './course.js';

/**
 * ★**見せない区間を「飛ばす」**（★2026-09-12・オーナー指示）
 *
 * 【★なぜ要るか — ★私が 1 度間違えた話】
 *   ★オーナー指示「★1600m コースで 30 秒にしたい。★**不要な直線を削って**いけばいい」。
 *   ⚠️ ★私はこれを ★**「速く流す」**と読み替え、★送りを 8 倍にしました。
 *      ★オーナー評「★なぜ倍速にする？？ ★足が異常に早くなっています。★倍速にすると
 *      ★もうそれは別のゲームになりますし、★今まで苦労して JRA のレースに
 *      ★近づける意味もないです」。★取り消しました（`5d3b9db`）。
 *
 *   ★脚の回転は ★**進んだ距離**から決まります（`raceGaitPhase`）。★送りを n 倍にすると
 *   ★1 秒あたりの完歩も ★**そのまま n 倍**になります（★実測・較正値 2.86 完歩/秒）:
 *     ★1 倍 … 2.86 ／ ★2 倍 … 5.71 ／ ★8 倍 … ★**22.86 完歩/秒**
 *   ★＝ ★**尺は「速さ」では縮められません。** ★縮められるのは ★**見せる範囲**だけです。
 *
 * 【★どうするか】★実際の中継と同じ形にします。
 *   ★送りは ★**等速（1 倍）**のまま、★見せない区間を ★**時計から取り除きます**。
 *   ★取り除いた地点は ★**表示時間の跳び**になるので、★そこは ★**カットインで覆います**
 *   （★コーナーを覆うのと同じ仕掛け・`race-cutin.ts`）。
 *
 * ⚠️ ★**着順・走破タイム・位置モデルには触れません。** ★触るのは
 *    ★「表示秒 → レース秒」の対応だけです（★憲法 3）。
 * ⚠️ ★跳びは ★**覆われている所にしか置いてはいけません。** ★裸の跳びは
 *    ★「馬が瞬間移動した」に見えます。
 */

/** ★飛ばすレース秒の区間（★`from` 以上 `to` 未満） */
export interface RaceElision {
  readonly fromRaceSec: number;
  readonly toRaceSec: number;
}

/** ★重なりと逆順をならして、★昇順の並びにする */
function normalise(elisions: readonly RaceElision[]): RaceElision[] {
  const clean = elisions
    .map((e) => ({ fromRaceSec: Math.min(e.fromRaceSec, e.toRaceSec), toRaceSec: Math.max(e.fromRaceSec, e.toRaceSec) }))
    .filter((e) => Number.isFinite(e.fromRaceSec) && Number.isFinite(e.toRaceSec) && e.toRaceSec > e.fromRaceSec)
    .sort((a, b) => a.fromRaceSec - b.fromRaceSec);
  const out: RaceElision[] = [];
  for (const e of clean) {
    const last = out[out.length - 1];
    if (last !== undefined && e.fromRaceSec <= last.toRaceSec) {
      out[out.length - 1] = { fromRaceSec: last.fromRaceSec, toRaceSec: Math.max(last.toRaceSec, e.toRaceSec) };
      continue;
    }
    out.push(e);
  }
  return out;
}

/**
 * ★**時計から区間を取り除く**。★元の時計は書き換えません（★包むだけ）。
 *
 * ★`displaySec` は取り除いたぶん短くなります。
 * ★`raceSecAt` は跳びの地点で ★**不連続**になります（★それが「飛ばす」ということです）。
 * ★`displaySecAt` は、★飛ばした区間の中を渡されたら ★**その区間の入口**を返します。
 */
export function elidedWarp(base: TimeWarp, elisions: readonly RaceElision[]): TimeWarp {
  const spans = normalise(elisions).map((e) => {
    const enterDisplay = base.displaySecAt(e.fromRaceSec);
    const leaveDisplay = base.displaySecAt(e.toRaceSec);
    return { ...e, enterDisplay, removed: Math.max(0, leaveDisplay - enterDisplay) };
  });
  const removedTotal = spans.reduce((a, s) => a + s.removed, 0);
  const displaySec = Math.max(0, base.displaySec - removedTotal);
  /** ★飛ばした後の表示時間で見た、★各跳びの位置 */
  const marks = spans.map((s, i) => ({
    ...s, at: s.enterDisplay - spans.slice(0, i).reduce((a, p) => a + p.removed, 0),
  }));
  return {
    displaySec,
    raceSecAt(d: number): number {
      const t = Math.max(0, Math.min(displaySec, d));
      let extra = 0;
      for (const m of marks) {
        if (t < m.at) break;
        extra += m.removed;
      }
      return base.raceSecAt(t + extra);
    },
    displaySecAt(r: number): number {
      let d = base.displaySecAt(r);
      for (const s of spans) {
        if (r >= s.toRaceSec) { d -= s.removed; continue; }
        if (r > s.fromRaceSec) { d -= base.displaySecAt(r) - s.enterDisplay; }
      }
      return Math.max(0, Math.min(displaySec, d));
    },
  };
}

/**
 * ★**「発走 ＋ 最後の直線」だけ見せる編集**（★2026-09-12・オーナー選択）
 *
 *   ★オーナーに測った選択肢を出し、★「★発走 ＋ 最後の直線（約 30 秒）」が選ばれました。
 *   ★内訳（★1 倍・★seed 42・★実測）:
 *     ★発走 …………………………… 3.6 秒（★見せる）
 *     ★道中（向正面・真横）………… 45.8 秒（★**飛ばす** ← ご指摘の「不要な直線」）
 *     ★勝負所（残り 800〜400m）…… 26.8 秒（★**飛ばす**）
 *     ★最後の直線（残り 400m）…… 26.3 秒（★見せる）
 *   → ★表示 ★**約 30 秒**。★脚の回転は全区間で較正どおり（★2.86 完歩/秒）。
 *
 * ⚠️ ★**勝負所を飛ばします。** ★差し・追い込みの見せ場はそこで起きるので、
 *    ★`FINISH_CAMERA_BY_DEVELOPMENT` の展開別カメラは ★**最後の直線の中でだけ**働きます。
 *    ★これはオーナーが 30 秒を選んだ結果です（★選択肢にその旨を明記して確認済み）。
 * ⚠️ ★跳びは 1 か所だけです。★2 か所に分けると覆うカットインも 2 枚要り、
 *    ★30 秒のうち 4 秒がカットインになります。
 */
export function raceEditElisions(knots: PhaseKnots): readonly RaceElision[] {
  /**
   * ★`startRealSec` … 発走の等速が終わる地点 ／ `goalSec` … ゴール前の等速が始まる地点。
   * ⚠️ ★どちらも省略可の型です。★無ければ ★**何も飛ばしません**（★R-27・狭い側へ倒す）。
   */
  const from = knots.startRealSec;
  const to = knots.goalSec;
  if (from === undefined || to === undefined || !(to > from)) return [];
  return [{ fromRaceSec: from, toRaceSec: to }];
}


/**
 * ★**跳びが起きる表示秒**（★カットインで覆う場所）。
 *
 * ⚠️ ★画面はこの値から覆う窓を作ります。★画面側で `knots` から計算し直さないこと
 *    ★（★片方だけ直すと、★覆っていない跳びが出ます）。
 */
export function raceEditJumpDisplaySecs(
  elisions: readonly RaceElision[], warp: TimeWarp,
): readonly number[] {
  return normalise(elisions).map((e) => warp.displaySecAt(e.toRaceSec));
}

/** ★跳びの位置と、★**跳んだ先の区間名**（★カットインの見出しに使います） */
export interface RaceEditJump {
  readonly atDisplaySec: number;
  /** ★跳ぶ前のレース秒（★コース図で馬群を進める始点・★2026-09-14） */
  readonly fromRaceSec: number;
  /** ★跳んだ先のレース秒（★呼び出し側が区間名を引くのに使います） */
  readonly toRaceSec: number;
}

/**
 * ★**跳びを覆う画面で、コース図の馬群をどのレース秒まで進めるか**（★2026-09-14・オーナー判断）
 *
 *   > ★「コーナーを全てカットです。★ただしコース表ではコーナーを曲がるのは見せます」
 *
 *   ★覆う窓の入口と出口のレース秒の間を、★なだらかに進めます。
 *   ★入口では ★**直前まで映っていた位置**、★出口では ★**直後に映る位置**に一致するので、
 *   ★コース図と世界の間で馬が飛びません。
 * ⚠️ ★進めるのは ★**コース図の点だけ**です（★脚は描きません）。★倍速の脚（★オーナー却下）にはなりません。
 * ⚠️ ★位置は ★その秒の位置モデルを読むだけです（★着順・タイムに触れない・憲法 3）。
 */
export function raceEditSweepRaceSec(windowStartRaceSec: number, windowEndRaceSec: number, progress: number): number {
  const p = Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0));
  const e = p * p * (3 - 2 * p);
  return windowStartRaceSec + (windowEndRaceSec - windowStartRaceSec) * e;
}

/**
 * ★**跳びの位置と行き先**（★2026-09-13・オーナー指摘）
 *
 * ⚠️ ★見出しを ★**`'最後の直線へ'` に決め打ちしていました**（★オーナー評
 *    ★「★カットインで ★**最後の直線へ が常に出る**のはなぜですか？」）。
 *    ★3 角へ跳ぶときも 4 角へ跳ぶときも同じ見出しでした。
 * → ★跳んだ先のレース秒を返します。★区間名は ★**画面が出している関数**
 *   （`broadcastV2SectionLabel`）で引いてください（★別の訳語を作らない・★R-30）。
 */
export function raceEditJumps(
  elisions: readonly RaceElision[], warp: TimeWarp,
): readonly RaceEditJump[] {
  return normalise(elisions).map((e) => ({
    atDisplaySec: warp.displaySecAt(e.toRaceSec), fromRaceSec: e.fromRaceSec, toRaceSec: e.toRaceSec,
  }));
}

/**
 * ★**見せる範囲**（★2026-09-13・オーナー指示・★3 度目の改訂）
 *
 *   ★オーナー指示「★**カーブは最後の 4 コーナーのみで OK です。★最初のカーブはなし。**
 *   ★その代わりに、★**ゲート発送の瞬間〜陣地取り**をしっかりと見せてください」。
 *
 * 【★見せるもの】
 *   ★① ★**発走の直線ぜんぶ**（★走路の最初の直線区間・★桜星賞は 200m）
 *      ★＝ ゲートが開く瞬間と、★隊列が決まるまでの位置取り。
 *   ★② ★**最後のコーナーだけ**（★台本が貼ったコーナーのカットのうち ★最後の 1 つ）
 *   ★③ ★最後の直線（★残り `STRAIGHT_SHOWN_M`）
 *   ★それ以外（★向正面・★手前のコーナー）を飛ばします。
 *
 * ⚠️ ★指示の履歴（★どれも上書きです・★R-7）:
 *    ★2026-09-12 その1 … 道中と勝負所をまとめて飛ばす → ★コーナーが消えて不合格
 *    ★2026-09-12 その2 … ★**コーナーを全部**見せる
 *    ★2026-09-13      … ★**最後のコーナーだけ**。★代わりに発走〜位置取りを見せる
 * ⚠️ ★発走の長さを ★**秒で決めていません。** ★走路の最初の直線区間の長さから引きます。
 *    ★会場によって発走の直線は違うので、★秒で置くと会場ごとに切れ方が変わります。
 * ⚠️ ★`cornerSpansM` は ★**台本の境界から**渡してください（★`broadcastV2ScriptBoundariesM`）。
 *    ★ここで走路を読み直すと、★画面が出すコーナーと食い違います（★R-30）。
 */
export const STRAIGHT_SHOWN_M = 250;

/** ★発走を見せる長さの基準（m・★桜星賞 1600m の値）。★距離に比例して伸ばします（`sideOnlyShownMetersOf`） */
export const START_SHOWN_M = 200;
/** ★見せる長さの基準にする距離（m）。★桜星賞（オーナーが本編 約 30 秒で承認した鞍） */
export const SHOWN_REFERENCE_DISTANCE_M = 1600;

/**
 * ★**真横の直線だけ（台本 v9）で、発走と最後の直線を何 m 見せるか**（★2026-09-15・オーナー判断）
 *
 * 【★なぜ要るか】★オーナー評（流星大賞典・天河 2000m）:
 *   > ★これ 30 秒あります？ ★あまりにも短くないですか？ ★桜星賞で 1600m で 30 秒で作ってるので
 *   > ★2000m ならばもう少し長くなりませんか？
 *
 *   ⚠️ ★それまで発走は ★**走路の最初の区間の長さ**（`course.segments[0].length`）でした。
 *      ★引き込み線（`withRunUp`）は直線を ★**2 つの区間に割って**置くことがあり、★最初の区間は
 *      ★鞍によって ★**20m〜500m**（★流星大賞典 40m ＝ 2.5 秒・★桜星賞 200m ＝ 12.1 秒）でした。
 *      ★距離で尺を伸ばす決まりもありませんでした。
 *
 * 【★どう決めるか】★オーナー判断 2026-09-15「★距離に比例して伸ばす」:
 *   ★発走 … `START_SHOWN_M × 距離 ÷ 1600`。★ただし ★**発走からコーナーまで直線が続く長さ**まで。
 *   ★最後の直線 … `STRAIGHT_SHOWN_M × 距離 ÷ 1600`。★ただし ★**最後の直線の長さ**まで。
 *   → ★桜星賞は 200m・250m のまま（★1 ビットも変わりません）。★どちらも ★コーナーには掛かりません。
 */
export function sideOnlyShownMetersOf(course: Course): {
  readonly startShownM: number;
  readonly straightShownM: number;
  readonly firstPassSpansM: readonly { readonly fromM: number; readonly toM: number }[];
} {
  const scale = course.distance / SHOWN_REFERENCE_DISTANCE_M;
  return {
    startShownM: Math.min(leadingStraightMetersOf(course), START_SHOWN_M * scale),
    straightShownM: Math.min(homeStretchMetersOf(course), STRAIGHT_SHOWN_M * scale),
    /** ★1 周目のスタンド前（★長距離の 3 幕・`FIRST_PASS_SHOWN_M`） */
    firstPassSpansM: firstPassStraightsMOf(course).map((s) => ({
      fromM: Math.max(s.fromM, s.toM - FIRST_PASS_SHOWN_M), toM: s.toM,
    })),
  };
}

/**
 * ★**1 周目のスタンド前を何 m 見せるか**（★2026-09-15・計画書 R-5・★開発側の仮置き・★オーナーの目で決める）。
 *
 *   ★長距離の 4 鞍は ★最後の直線と同じ直線を ★ゴールの 1 周前にも通ります。★そこも ★**直線**なので、
 *   ★コーナーを映さずに真横で見せられます（★発走 → 1 周目のスタンド前 → 最後の直線 の 3 幕）。
 *   ★見せるのは ★**その直線の終わり（＝決勝線の前を通る所）までの 200m**（★約 12 秒）です。
 * ⚠️ ★レビュー側の条件（回答 §2）:
 *    ★① 跳びが 2 か所になる → ★検査は鞍ごとの跳びの数を見る（`side-only-script.test.ts` ②）
 *    ★② 1 周目は ★勢いのバー・展開の見出しを出さない（★勢いは残り 200m から・★ここは残り 2100m より手前）
 *    ★③ D-062「道中は情報が少ない」→ ★長く見せない（★何秒かは [EYES]）
 * ⚠️ ★距離では伸ばしません（★4 鞍とも 3000m 以上で、★伸ばすと道中が長くなる）。
 */
export const FIRST_PASS_SHOWN_M = 200;

export interface RaceEditPlan {
  /** ★台本が貼ったコーナーのカット（★`broadcastV2ScriptBoundariesM` の `-corner-` の行） */
  readonly cornerSpansM: readonly { readonly fromM: number; readonly toM: number }[];
  /** ★m → レース秒（★位置モデルから） */
  readonly raceSecAtMeters: (meters: number) => number;
  /** ★レースの距離（m） */
  readonly distanceMeter: number;
  /** ★発走を何 m まで見せるか（★走路の最初の直線区間の長さ） */
  readonly startShownM: number;
  /** ★最後の直線を残り何 m から見せるか */
  readonly straightShownM?: number;
  /**
   * ★**最後のコーナーだけ見せるか**（★既定 `true`・★2026-09-13 のオーナー指示）。
   *   ★`false` にすると全部のコーナーを見せます（★2026-09-12 の形）。
   */
  readonly lastCornerOnly?: boolean;
  /**
   * ★**最後の直線の長さ**（m・★2026-09-14）。★見せる直線を ★**これより長くしません**。
   * ⚠️ ★渡さないと、★直線が `straightShownM` より短い走路（★最短 290m は足りるが、★距離の短い鞍）で
   *    ★**4 角の出口を真横で映します**。★オーナー判断「コーナーを全てカット」に反します。
   */
  readonly homeStretchM?: number;
  /**
   * ★**残り何 m からゴールまでを飛ばさないか**（★2026-09-14・オーナー判断 O-1「見せ方を変えます」）。
   *   ★自馬で介入する人は、★残り `EARLY_SPURT_METER`（900m）→ ゴールの間に
   *   ★「仕掛け」「追う」の局面があります（★正典 §8b・D-066）。★ここを飛ばすと ★介入の瞬間が消えます。
   * ⚠️ ★渡さなければ ★観戦だけの人の見せ方（★発走 ＋ 最後の直線）です。
   * ⚠️ ★コーナーは ★**飛ばさずに覆います**（★画面がコース図の画面で覆う）。★この関数は時計だけを決めます。
   */
  readonly keepFromMetersLeft?: number;
  /**
   * ★**道中で見せる直線**（m・★2026-09-15・計画書 R-5「1 周目のスタンド前」）。★`sideOnlyShownMetersOf` の `firstPassSpansM` を渡します。
   * ⚠️ ★渡さなければ ★**1 ビットも変わりません**（★発走 ＋ 最後の直線）。
   */
  readonly midShownSpansM?: readonly { readonly fromM: number; readonly toM: number }[];
}

export function raceEditElisionsFor(knots: PhaseKnots, plan: RaceEditPlan): readonly RaceElision[] {
  const startEnd = knots.startRealSec;
  const goal = knots.goalSec;
  if (startEnd === undefined || goal === undefined || !(goal > startEnd)) return [];
  /** ★見せる直線は ★**最後の直線より長くしない**（★`homeStretchM` の註記） */
  const straightShownM = Math.min(plan.straightShownM ?? STRAIGHT_SHOWN_M,
    plan.homeStretchM !== undefined && plan.homeStretchM > 0 ? plan.homeStretchM : Number.POSITIVE_INFINITY);
  /**
   * ★発走を見せ終わるレース秒。★走路の最初の直線の終わりまで。
   * ⚠️ ★`startRealSec`（★発走の等速が終わる地点）より ★**手前にはしません**。
   */
  const startShownTo = Math.max(startEnd, plan.raceSecAtMeters(Math.max(0, plan.startShownM)));
  /** ★最後の直線を見せ始めるレース秒 */
  const straightFromShown = Math.max(goal,
    plan.raceSecAtMeters(Math.max(0, plan.distanceMeter - straightShownM)));
  /** ★介入する人の見せ方は、★残り `keepFromMetersLeft` から見せ続ける（★`keepFromMetersLeft` の註記） */
  const straightFrom = plan.keepFromMetersLeft === undefined || !(plan.keepFromMetersLeft > 0)
    ? straightFromShown
    : Math.min(straightFromShown, plan.raceSecAtMeters(Math.max(0, plan.distanceMeter - plan.keepFromMetersLeft)));
  /** ★見せるコーナー。★既定は ★**最後の 1 つだけ** */
  const corners = plan.lastCornerOnly === false ? plan.cornerSpansM : plan.cornerSpansM.slice(-1);
  /** ★見せる区間（★レース秒） */
  const shown: { from: number; to: number }[] = [{ from: 0, to: startShownTo }];
  for (const span of [...corners, ...(plan.midShownSpansM ?? [])]) {
    const from = Math.max(startShownTo, plan.raceSecAtMeters(span.fromM));
    const to = Math.min(straightFrom, plan.raceSecAtMeters(span.toM));
    if (to > from) shown.push({ from, to });
  }
  shown.push({ from: straightFrom, to: knots.finishSec });
  shown.sort((a, b) => a.from - b.from);
  /** ★見せる区間の隙間が、★飛ばす区間 */
  const out: RaceElision[] = [];
  for (let i = 1; i < shown.length; i += 1) {
    const gapFrom = shown[i - 1]!.to;
    const gapTo = shown[i]!.from;
    if (gapTo > gapFrom) out.push({ fromRaceSec: gapFrom, toRaceSec: gapTo });
  }
  return out;
}
