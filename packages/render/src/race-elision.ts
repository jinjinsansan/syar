import type { PhaseKnots, TimeWarp } from './time-warp.js';

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

/**
 * ★**コーナーは全部見せ、★直線だけ削る**（★2026-09-12・オーナー指示・★2 度目の改訂）
 *
 *   ★オーナー指示「★**コーナーはそのまま入れてください。** ★4 コーナーだけではなく、
 *   ★コーナーを走る部分はコーナー＆カットインを入れればいいです」。
 *
 * ⚠️ ★1 度目（`raceEditElisions`）は ★**道中と勝負所をまとめて飛ばす**ものでした。
 *    ★コーナーもその中に入るので、★コーナーが消えました（★オーナー評
 *    ★「カーブはなくしたのですね？」）。
 *
 * 【★見せるもの】
 *   ★① 発走（★`startRealSec` まで）
 *   ★② ★**走路のコーナーのカット**（★台本が貼った区間そのまま・★右回り左回りの別なく）
 *   ★③ 最後の直線（★`goalSec` から）
 *   ★それ以外（★向正面などの直線）を飛ばします。
 *
 * ⚠️ ★飛ばす地点は ★**コーナーの入口と出口**になります。★入口は台本のコーナーのカットインが
 *    ★覆い、★出口は `raceEditJumpDisplaySecs` の窓が覆います。★どちらも同じ絵なので
 *    ★重なっても害はありません。
 * ⚠️ ★`cornerSpansM` は ★**台本の境界から**渡してください（★`broadcastV2ScriptBoundariesM`）。
 *    ★ここで走路を読み直すと、★画面が出すコーナーと食い違います（★R-30）。
 */
export function raceEditElisionsFor(
  knots: PhaseKnots,
  cornerSpansM: readonly { readonly fromM: number; readonly toM: number }[],
  raceSecAtMeters: (meters: number) => number,
): readonly RaceElision[] {
  const startEnd = knots.startRealSec;
  const goal = knots.goalSec;
  if (startEnd === undefined || goal === undefined || !(goal > startEnd)) return [];
  /** ★見せる区間（★レース秒）。★発走 ＋ コーナー ＋ 最後の直線 */
  const shown: { from: number; to: number }[] = [{ from: 0, to: startEnd }];
  for (const span of cornerSpansM) {
    const from = Math.max(startEnd, raceSecAtMeters(span.fromM));
    const to = Math.min(goal, raceSecAtMeters(span.toM));
    if (to > from) shown.push({ from, to });
  }
  shown.push({ from: goal, to: knots.finishSec });
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