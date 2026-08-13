/**
 * ★**時間を情報量に比例して配る**（正典 D-062）
 *
 * > 道中は速く送り、勝負所以降を実時間かそれ以上に伸ばす。
 * > レースが1600m走るのは、実際の馬に脚があるからです。
 * > **STAR の画面はそれに縛られていません。**
 *
 * 【なぜ要るか — 実測】
 *   `tools/verify-readable.mjs`（1200レース）:
 *     残り1200m … 画面ボット 0.526 / 出走表ボット 0.747 → ★**−0.221**
 *   ★**道中は情報が負**でした。そこに実時間を配るのは、
 *     プレイヤーの時間を**読めないもの**に使わせることです。
 *
 * 【★この層が触らないもの】
 *   境界時刻・着順・ゲート（D-059 の「エンジン＝真実」）には**一切触れません**。
 *   ここがするのは **「表示の時計」から「レースの時計」への読み替え**だけです。
 *   ⚠️ だから**どんな配分にしても着順は変わりません**。
 *      それを機械で確かめるのが `time-warp.test.ts` です。
 *
 * 【★C-6 への副産物】（裁定より）
 *   > 勝負所の実時間が伸びれば、**人間が読んで押す余地が増えます**。
 *   ここを縮めると C-6 が難しくなります。**演出のつまみではありません。**
 */

/** 局面ごとの送り速さ。**レース秒 ÷ 表示秒** */
export interface PhaseRates {
  /**
   * 道中。★**1 より大きいと速送り**（3 なら 3倍速）。
   *   実測で情報が負だった区間なので、既定は速く送ります。
   */
  readonly cruise: number;
  /** 勝負所。★1 で実時間 */
  readonly spurt: number;
  /**
   * 直線。★**1 より小さいと引き伸ばし**（0.7 なら実時間の 1/0.7 倍かけて見せる）。
   *   ここが「決着」で、情報が最も濃い区間です。
   */
  readonly straight: number;
}

/**
 * ★既定の配分。
 *
 * ⚠️ **この数字を「良さそうだから」で決めていません。**
 *    実測した情報量（画面ボット − 出走表ボット）の符号に合わせています:
 *      道中   −0.221 → **速く送る**
 *      勝負所 −0.142 → 実時間（★ここはまだ負なので、伸ばす根拠がありません）
 *      直線   +0.181 → **伸ばす**
 *    ★数字そのものは V-16 で判定するので、**ここは出発点にすぎません。**
 */
export const DEFAULT_PHASE_RATES: PhaseRates = { cruise: 3, spurt: 1, straight: 0.7 };

/** 局面の折れ点（レースの時計）。★どの馬を基準に取るかは呼び出し側が決めます */
export interface PhaseKnots {
  readonly startSec: number;
  readonly spurtSec: number;
  readonly straightSec: number;
  readonly finishSec: number;
}

export interface TimeWarp {
  /** ★表示にかかる総秒数（レースの走破タイムとは違います） */
  readonly displaySec: number;
  /** 表示の時計 → レースの時計 */
  raceSecAt(displaySec: number): number;
  /** レースの時計 → 表示の時計（★検査と実況の同期に使います） */
  displaySecAt(raceSec: number): number;
}

/**
 * ★局面ごとに違う速さで送る時計を作る。
 *
 *   **折れ点では必ず一致します**（表示←→レースの往復で誤差ゼロ）。
 *   だから「勝負所に入った瞬間」が、配分を変えてもずれません。
 */
export function timeWarpFor(knots: PhaseKnots, rates: PhaseRates = DEFAULT_PHASE_RATES): TimeWarp {
  for (const [name, r] of [['cruise', rates.cruise], ['spurt', rates.spurt], ['straight', rates.straight]] as const) {
    if (!(r > 0) || !Number.isFinite(r)) {
      throw new Error(`送り速さは正の有限値でなければなりません: ${name}=${r}`);
    }
  }
  const { startSec, spurtSec, straightSec, finishSec } = knots;
  if (!(startSec <= spurtSec && spurtSec <= straightSec && straightSec <= finishSec)) {
    throw new Error('局面の折れ点が順序どおりではありません');
  }

  /** [レース秒の始点, レース秒の終点, 送り速さ] */
  const segs: readonly (readonly [number, number, number])[] = [
    [startSec, spurtSec, rates.cruise],
    [spurtSec, straightSec, rates.spurt],
    [straightSec, finishSec, rates.straight],
  ];

  // ★折れ点の表示時刻を先に積んでおく（往復で誤差が出ないように）
  const dKnots: number[] = [0];
  for (const [t0, t1, r] of segs) dKnots.push(dKnots[dKnots.length - 1]! + (t1 - t0) / r);
  const displaySec = dKnots[dKnots.length - 1]!;

  return {
    displaySec,
    raceSecAt(d: number): number {
      if (d <= 0) return startSec;
      if (d >= displaySec) return finishSec;
      for (let i = 0; i < segs.length; i += 1) {
        const [t0, , r] = segs[i]!;
        const d0 = dKnots[i]!;
        const d1 = dKnots[i + 1]!;
        if (d > d1) continue;
        return t0 + (d - d0) * r;
      }
      return finishSec;
    },
    displaySecAt(t: number): number {
      if (t <= startSec) return 0;
      if (t >= finishSec) return displaySec;
      for (let i = 0; i < segs.length; i += 1) {
        const [t0, t1, r] = segs[i]!;
        if (t > t1) continue;
        return dKnots[i]! + (t - t0) / r;
      }
      return displaySec;
    },
  };
}

/**
 * ★**基準になる馬の折れ点**を取り出す。
 *
 *   表示の時計は1本しかないので、**誰の局面に合わせるか**を決める必要があります。
 *   ⚠️ 馬ごとに折れ点は違います（逃げ馬は先に勝負所へ入ります）。
 *
 *   → **自馬**に合わせます。カメラ（`cameraFor`）が自馬の残り距離で
 *     局面を決めているので、**そことずれると「寄ったのに送りが速いまま」**になります。
 *     自馬を指定しないとき（観戦）は**先頭**に合わせます。
 */
export function knotsFor(
  boundaries: readonly (PhaseKnots & { readonly gate: number })[],
  ownGate?: number,
): PhaseKnots {
  const list = boundaries;
  if (list.length === 0) throw new Error('境界時刻がありません');
  const own = ownGate === undefined ? undefined : list.find((b) => b.gate === ownGate);
  const base = own ?? list.reduce((best, b) => (b.finishSec < best.finishSec ? b : best));
  /**
   * ★**終わりは「最後の1頭がゴールした時刻」です。**
   *
   *   ⚠️ 最初は基準の馬の `finishSec` をそのまま終点にしていました。
   *      → **自馬がゴールした瞬間に表示が終わり、後続がまだ走っている**状態になります。
   *        画面上は「自分が入った瞬間にレースが消える」ように見えます。
   *      ★検査が捕まえました（配分を変えても着順が動かないことを見る検査で、
   *        「表示の最後で全馬がゴール後」が偽になった）。
   *
   *   ★局面の折れ点は基準の馬に合わせ（カメラと揃えるため）、
   *     **終点だけは全体に合わせます**。
   */
  const lastFinish = list.reduce((mx, b) => (b.finishSec > mx ? b.finishSec : mx), base.finishSec);
  return {
    startSec: base.startSec,
    spurtSec: base.spurtSec,
    straightSec: base.straightSec,
    finishSec: lastFinish,
  };
}
