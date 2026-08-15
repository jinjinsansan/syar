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
export const DEFAULT_PHASE_RATES: PhaseRates = { cruise: 1.8, spurt: 1, straight: 0.7 };

/**
 * ★**道中を 3倍速から 1.8倍速に落としました。**
 *
 *   実測（`tools/diag-speed.mjs`）:
 *     3倍速   → 画面上の最高速 67.6 m/表示秒（実馬の4.2倍）。1280px を **0.3秒**で横切る
 *     1.8倍速 → 40.5 m/表示秒（2.5倍）
 *     1倍     → 22.5 m/表示秒（1.4倍）
 *   ★オーナーの指摘「**途中でグングンスピードが上がるが不自然**」。
 *     D-062 は「道中は速く送る」とだけ定めており、**倍率は決めていません**。
 *     ここは**見て決まる数字**なので、判断できる材料（上の実測）と一緒に置きます。
 */

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
/**
 * ★★**距離ごとの目標表示時間 [秒]**（`RACE_PRESENTATION_BASICS.md` §4）
 *
 * 【オーナー判定】「★**レースはおよそ45秒（短距離は短くてもいい）**」
 *
 * 【★なぜ距離で変えるか — 実測】
 *   送り速さを距離によらず固定すると、こうなりました:
 *   ```
 *   1200m  走破 76.4s → 表示 35.0s   ★合っている
 *   1600m      102.9s      44.7s     ★合っている
 *   2400m      157.6s      65.0s     ⚠️ 長い
 *   3000m      199.6s      80.5s     ⚠️ ★長すぎる
 *   ```
 *   ★**道中の実時間だけが距離とともに伸びる**ので、そこを吸収させます。
 */
export function targetDisplaySec(distanceMeter: number): number {
  /**
   * ⚠️ ★最初は距離帯（5段階）で段にしました。すると
   *    ★**1400m と 1500m で、道中の送りが 4.17倍 → 2.2倍 に跳びます**
   *    （目標が 35秒 → 45秒 に段で変わるため）。
   *    ★**ほとんど同じレースが、まったく違う速さで流れます。**
   * → **なだらかに繋ぎます。** 折れ点はオーナー指示の2つ:
   *    ★**短距離 35秒 ／ マイル 45秒**。そこから長距離へ緩やかに伸ばします。
   */
  const d = Math.max(800, distanceMeter);
  if (d <= 1200) return 35;
  if (d <= 1600) return 35 + ((d - 1200) / 400) * 10;   // 1200→35 / 1600→45
  if (d <= 3000) return 45 + ((d - 1600) / 1400) * 7;   // 1600→45 / 3000→52
  return 52;
}

/**
 * ★★**勝負所と直線の送り速さは、距離によらず一定**にします。
 *
 *   ★**ここが「レースの中身」で、C-6（仕掛け）が成立する場所**だからです。
 *   ⚠️ ここを距離で縮めると、**長距離ほど押す余地が減ります**。
 */
export const FIXED_SPURT_RATE = 2.25;
export const FIXED_STRAIGHT_RATE = 1.8;

/**
 * ★**目標の表示時間に収まるよう、道中の送りだけを逆算する。**
 *
 * ```
 * 道中の送り = 道中の実時間 ÷ (目標表示時間 − 勝負所と直線の表示時間)
 * ```
 *
 * ⚠️ ★**目標が「勝負所＋直線」より短いときは、そこで止めません**（映像が作れなくなるため）。
 *    ★**道中の送りに上限**を置き、**溢れたぶんは表示時間が延びる**ようにします。
 *    そのほうが「勝負所が消える」より害が小さいためです。
 */
export function ratesForTarget(knots: PhaseKnots, targetSec: number): PhaseRates {
  const cruiseRace = Math.max(0, knots.spurtSec - knots.startSec);
  const spurtRace = Math.max(0, knots.straightSec - knots.spurtSec);
  const straightRace = Math.max(0, knots.finishSec - knots.straightSec);
  const tail = spurtRace / FIXED_SPURT_RATE + straightRace / FIXED_STRAIGHT_RATE;
  const room = targetSec - tail;
  /** ★道中の送りの上限。これ以上速いと**何が起きたか読めません** */
  const MAX_CRUISE = 8;
  const MIN_CRUISE = 1;
  if (cruiseRace <= 0) return { cruise: MIN_CRUISE, spurt: FIXED_SPURT_RATE, straight: FIXED_STRAIGHT_RATE };
  const want = room > 0.5 ? cruiseRace / room : MAX_CRUISE;
  return {
    cruise: Math.max(MIN_CRUISE, Math.min(MAX_CRUISE, want)),
    spurt: FIXED_SPURT_RATE,
    straight: FIXED_STRAIGHT_RATE,
  };
}

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

  /**
   * ★**送り速さは、段で切り替えません。滑らかに変えます。**
   *
   * 【★実測で分かったこと（オーナー指摘 ⑤）】
   *   段で 3倍速 → 1倍 に切り替えたとき、**0.2秒のあいだに画面上の速さが 31.3m/s 変化**
   *   していました（残り804m の1点）。画面上の最高速は **72.3 m/表示秒＝実馬の4.3倍**で、
   *   1280px の画面を **0.32秒**で横切ります。
   *   ★「途中でグングンスピードが上がるが不自然」はこれです。
   *
   * 【★どうするか】
   *   速さを**時間の関数**にして、局面の境目で `smoothstep` で繋ぎます。
   *   ⚠️ 逆関数が要るので、**細かい格子で積分して表を持ちます**（単調なので二分探索できる）。
   *   ★端（スタート・ゴール）は動きません。**着順にも境界にも触れません。**
   */
  const TRANSITION_SEC = 6;
  const smooth = (x: number): number => {
    const t = Math.max(0, Math.min(1, x));
    return t * t * (3 - 2 * t);
  };
  /** レース時刻 t での送り速さ（レース秒 ÷ 表示秒） */
  const rateAt = (t: number): number => {
    const blend = (a2: number, b2: number, at: number): number => {
      const w = smooth((t - (at - TRANSITION_SEC / 2)) / TRANSITION_SEC);
      return a2 + (b2 - a2) * w;
    };
    if (t <= spurtSec - TRANSITION_SEC / 2) return rates.cruise;
    if (t <= spurtSec + TRANSITION_SEC / 2) return blend(rates.cruise, rates.spurt, spurtSec);
    if (t <= straightSec - TRANSITION_SEC / 2) return rates.spurt;
    if (t <= straightSec + TRANSITION_SEC / 2) return blend(rates.spurt, rates.straight, straightSec);
    return rates.straight;
  };

  /** ★台形則で「レース時刻 → 表示時刻」の表を作る（単調増加） */
  const N = 2048;
  const step = (finishSec - startSec) / N;
  const raceGrid = new Float64Array(N + 1);
  const dispGrid = new Float64Array(N + 1);
  raceGrid[0] = startSec;
  dispGrid[0] = 0;
  for (let i = 1; i <= N; i += 1) {
    const t0 = startSec + (i - 1) * step;
    const t1 = startSec + i * step;
    // 表示時間の増分 = レース時間の増分 ÷ 送り速さ
    const inc = step > 0 ? (step / 2) * (1 / rateAt(t0) + 1 / rateAt(t1)) : 0;
    raceGrid[i] = t1;
    dispGrid[i] = dispGrid[i - 1]! + inc;
  }
  const displaySec = dispGrid[N]!;

  /** 単調な表の逆引き（線形補間） */
  const lookup = (table: Float64Array, other: Float64Array, v: number): number => {
    if (v <= table[0]!) return other[0]!;
    if (v >= table[N]!) return other[N]!;
    let lo = 0, hi = N;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (table[mid]! <= v) lo = mid; else hi = mid;
    }
    const t0 = table[lo]!, t1 = table[hi]!;
    const k = t1 === t0 ? 0 : (v - t0) / (t1 - t0);
    return other[lo]! + (other[hi]! - other[lo]!) * k;
  };

  return {
    displaySec,
    raceSecAt: (d) => lookup(dispGrid, raceGrid, d),
    displaySecAt: (t) => lookup(raceGrid, dispGrid, t),
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
