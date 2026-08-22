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
   * ★ゴール前（`goalSec` 以降）。**既定は 1＝実時間**。
   *   ここを 1 より速くすると、決勝線に位置を合わせる都合で**脚がそのぶん速く回ります**。
   */
  readonly goal?: number;
  /** ★発走直後（`startRealSec` まで）。**既定は 1＝実時間** */
  readonly start?: number;
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
export const DEFAULT_PHASE_RATES: PhaseRates = { cruise: 1.8, spurt: 1, straight: 1 };
/**
 * ★直線を 0.7 → 1.0（実時間）に（2026-08-18・オーナー指示「ゴール前でスローにする必要はない」）。
 *   D-062 は「勝負所以降を実時間かそれ以上に伸ばす」なので 1.0 は範囲内。0.7 では決勝線付近で
 *   背景の流れと脚の周期が 0.7 倍のスローモーションになっていた（見た目速度は真の位置に一致させる区間のため）。
 */

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
  /**
   * ★**ゴール前の実時間区間**に入る時刻（残り `GOAL_REAL_TIME_M` m）。省略時は実時間区間なし。
   *
   *   【なぜ要るか（2026-08-21）】
   *   `visual-scroll.ts` は時間圧縮を打ち消して脚を実速に保ちますが、
   *   ★**決勝線のような世界固定物を映す区間では無効になります**（位置を合わせる必要があるため）。
   *   そのため 30 秒に圧縮すると、**ゴール前だけ脚が 1.85 倍速で回っていました**（実測）。
   *   ★オーナーが「走り方・サイズとも合格」と評価したゴール前は、
   *     **この区間が実時間だったとき**の画です。**そこだけ実時間に戻します。**
   */
  readonly goalSec?: number;
  /** ★発走直後の実時間区間が終わる時刻（`START_REAL_TIME_M` を走り終えるまで） */
  readonly startRealSec?: number;
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
  /**
   * ★**2026-08-21 にオーナー指示で短縮**（「レースは 30 秒にします」）。
   *
   *   ⚠️ 以前の折れ点（**短距離 35 秒 ／ マイル 45 秒**）も**オーナー指示**でした。
   *      ★**上書きです。** 前の指示を消したのではなく、新しい指示で置き換えています。
   *
   *   ⚠️ ★指示は「レースは 30 秒」で、**距離ごとの値までは指定されていません。**
   *      デモは 1600m なので **1600m = 30 秒**を確実に満たし、
   *      他の距離は**前と同じ形（なだらかな折れ線）を保ったまま**比率で縮めています
   *      （短距離 25 秒 ／ マイル 30 秒 ／ 長距離 35 秒）。
   *      ★短距離・長距離の値はこちらの仮置きです。**変えたい場合は指示ください。**
   */
  /**
   * ★**下限があります。** 等倍区間（勝負所＋直線）は距離によらず **21.4 秒**、
   *   道中の送りには**上限 8 倍**があるので、実現できる最短は
   *   `21.4 + 道中の実時間 ÷ 8` 秒です。実測（走破 15.6m/s 換算）:
   *
   *     1200m 24.6s ／ 1600m 27.8s ／ 2000m 31.0s ／ 2400m 34.2s ／ 3000m 39.0s ／ 3600m 43.8s
   *
   *   ⚠️ ★目標をこれより短く置くと、**上限で頭打ちになり黙って伸びます**（目標が守られません）。
   *      以前 1600m 30 秒 / 3000m 35 秒と置いたとき、3000m は 39 秒より短くできませんでした。
   *
   *   ⚠️ ★**上の実測値は古くなりました**（2026-08-22）。直線ぜんぶを実時間にしたので、
   *      等倍区間が 160m → 400m に伸びています。**1600m の実測は 37.1 秒**で、
   *      目標 30 秒には届きません。★「30 秒」はこの構成では**達成できない目標**です。
   *      （R-7: 較正した条件を明記する。条件が変わったので、値も意味も変わりました）
   *
   *   ★オーナー指示の **1600m = 30 秒**を満たし、他の距離は下限の上を通す折れ線にします。
   */
  /**
   * ⚠️ ★1200m 以下を**平らにしない**こと。平らにすると道中に使える秒数が距離によらず一定になり、
   *    道中の送り倍率だけが距離とともに上がって、**1200m の前後で 0.69 倍の段**ができます
   *    （＝似た距離のレースが違う速さで流れる。この関数がそもそも直した不具合）。
   */
  /**
   * ★**+7 秒しました**（2026-08-22・直線ぜんぶを実時間にしたため）
   *
   *   ⚠️ ★**目標は、達成できる値でなければ意味がありません。**
   *      直線を実時間にした結果、等倍区間だけで **29.6 秒**（距離によらず一定）になり、
   *      旧目標（1600m=30 秒）は**どの距離でも 9 秒以上足りません**。
   *      そのまま置くと `ratesForTarget` は毎回 8 倍の上限に張り付き、
   *      ★**この関数は何も制御しなくなります**（黙って効かない knob になる）。
   *
   *   実測した到達可能な最短（等倍 29.6 秒＋発走 3.9 秒＋道中÷8）:
   *     1200m 36.1 ／ 1600m 39.3 ／ 2000m 42.5 ／ 2400m 45.7 ／ 3000m 50.6
   *   ★折れ線の**形は変えず**、その上を通るように持ち上げています。
   */
  /**
   * ★実測の到達可能な最短は、距離にほぼ**線形**でした（等倍区間が距離によらず 29.6 秒で、
   *   道中だけが距離に比例して伸びるため）:
   *     1000m 33.7 ／ 1600m 38.5 ／ 2400m 44.9 ／ 3600m 54.6（傾き 0.00805 秒/m）
   *   ★その **0.8 秒上**を通す 1 本の直線にします。少しだけ上に置くのが要点で、
   *     ちょうど最短に置くと道中が上限に張り付き、この関数が**何も制御しなくなります**。
   */
  const d = Math.max(800, distanceMeter);
  return 34.5 + (d - 1000) * 0.008;   // 1200→36.1 / ★1600→39.3 / 2400→45.7 / 3600→55.3
}

/**
 * ★★**勝負所と直線の送り速さは、距離によらず一定**にします。
 *
 *   ★**ここが「レースの中身」で、C-6（仕掛け）が成立する場所**だからです。
 *   ⚠️ ここを距離で縮めると、**長距離ほど押す余地が減ります**。
 */
/**
 * ★**2026-08-21 に 2.25 / 1.8 から引き上げ**（オーナー指示「レースは 30 秒」→ 案 B を採用）。
 *
 *   1600m の実時間は 道中 51.3s / 勝負所 25.6s / 直線 25.6s。
 *   ★**等倍区間（勝負所＋直線）だけで 25.6 秒**あり、30 秒にすると道中に 4.4 秒しか残りません。
 *   道中の送りには上限（8 倍・「速すぎると何が起きたか読めない」）があるため、
 *   ★**元の値のままでは 32.1 秒が下限**でした。
 *
 *   検討した 3 案（1600m・目標 30 秒）:
 *     A 道中の上限を 12 倍に  → 等倍 25.6s / 道中 **4.4s（11.8 倍）**
 *        ★却下: 合格した「1 角（前から）」「勝負所（真横）」が合計 4 秒台になり、**一瞬で消える**
 *     ★**B 勝負所 2.8 / 直線 2.1** → 等倍 **21.4s** / 道中 **8.6s（5.9 倍）**  ← 採用
 *     C 勝負所 3.2 / 直線 2.4  → 等倍 18.7s / 道中 11.3s（4.5 倍）
 *        ★却下: 等倍区間が 1.4 倍速くなり、「ここが仕掛けの場所」という設計判断への影響が大きい
 *
 *   ⚠️ B でも**等倍区間は 1.2 倍速くなります**。C-6（仕掛け）が成立するかは
 *      **映像で確認が要ります**（速すぎて押しどころが読めないなら戻すこと）。
 */
/**
 * ★**ゴール前を実時間で見せる距離**（m）。
 *
 *   決勝線は世界に固定されているので、この区間は**馬の真の位置に一致**させる必要があり、
 *   `visual-scroll.ts`（時間圧縮の打ち消し）が効きません。
 *   → **ここだけ表示を実時間にして、脚の回転を実物に戻します。**
 *
 *   ⚠️ 実測（1600m・30 秒のとき）: ゴール前の脚は**実物の 1.85 倍**で回っていました。
 *      ★オーナーが「走り方・サイズとも合格」と評価したゴール前は、
 *        **この区間が実時間だったとき**の画です。
 *
 * 【★160m → 400m（直線ぜんぶ）に拡げました（2026-08-22・オーナー指示）】
 *   オーナー指示「**実際の競馬中継を再現すべき**」。実際の中継は**最後の直線に圧縮をかけません。**
 *
 *   ⚠️ 160m のとき、**勝負どころが決着後より短い**配分になっていました（実測・シード 42）:
 *        差し切り（1338〜1410m・72m） **2.00 秒**
 *        決着後　（1479〜1600m・121m） **6.40 秒**  ← 3.2 倍
 *      ★いちばん盛り上がる場面が最も速く送られ、決まった後がいちばん長い、という逆の配分です。
 *
 *   400m（＝直線の長さ）にすると **差し切り 4.21 秒**（2.1 倍に）／決着後 6.91 秒（比 1.64 倍）。
 *
 *   ⚠️ ★**代償は総尺です。** 1600m のレース本編は 34.4 → **37.1 秒**（実測）。
 *      「レースは 30 秒」は**この構成では届きません**（下の下限の注記を参照）。
 *      ★オーナーは「実際の中継の再現」を優先すると判断しています。戻すならこの値を縮めます。
 */
export const GOAL_REAL_TIME_M = 400;
/**
 * ★**発走直後を実時間で見せる距離**（m）。
 *   発馬機も世界に固定されているので、ゴール前と同じ理屈で時間圧縮の打ち消しが効きません
 *   （実測: 発走の脚は**実物の 1.96 倍**）。★同じ扱いにします。
 */
export const START_REAL_TIME_M = 60;
/** ★ゴール前の送り速さ。**1 = 実時間**（脚が実物どおりに回る） */
export const GOAL_RATE = 1;
/** 直線の長さ（m）。`replayPositionModel` の `straightMetersLeft` と揃えること */
const STRAIGHT_M = 400;

/**
 * ★勝負所（残り 800〜400m）の送り速さ。**2.8 → 5.2**（2026-08-22）。
 *   直線ぜんぶを実時間にしたぶんの総尺（+7.4 秒）を、ここで取り戻しています
 *   （41.8 → 37.1 秒）。
 *   ⚠️ ★上げすぎると道中（8 倍）との差が無くなり、**勝負所が勝負所に見えません。**
 *      5.2 なら 道中 8 倍 → 勝負所 5.1 倍 → 直線 1 倍 と段階が残ります（実測値）。
 */
export const FIXED_SPURT_RATE = 5.2;
export const FIXED_STRAIGHT_RATE = 2.1;

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
  const startReal = knots.startRealSec;
  const hasStart = startReal !== undefined && startReal > knots.startSec && startReal < knots.spurtSec;
  const startRace = hasStart ? startReal - knots.startSec : 0;
  const cruiseRace = Math.max(0, knots.spurtSec - (hasStart ? startReal : knots.startSec));
  const spurtRace = Math.max(0, knots.straightSec - knots.spurtSec);
  /**
   * ★直線は**ゴール前の実時間区間**と、その手前とに分けて数えます。
   *   分けずに数えると、逆算した道中の倍率が**実際より遅く**なり、目標より長くなります。
   */
  const goal = knots.goalSec;
  /**
   * ⚠️ ★`>=` であること。`>` にすると「直線ぜんぶを実時間」（`goalSec === straightSec`）が
   *    **実時間区間なし**に化けます（上の注記と同じ縮退）。
   */
  const hasGoal = goal !== undefined && goal >= knots.straightSec && goal < knots.finishSec;
  const straightRace = Math.max(0, (hasGoal ? goal : knots.finishSec) - knots.straightSec);
  const goalRace = hasGoal ? Math.max(0, knots.finishSec - goal) : 0;
  const tail = startRace / GOAL_RATE + spurtRace / FIXED_SPURT_RATE
    + straightRace / FIXED_STRAIGHT_RATE + goalRace / GOAL_RATE;
  const room = targetSec - tail;
  /** ★道中の送りの上限。これ以上速いと**何が起きたか読めません** */
  const MAX_CRUISE = 8;
  const MIN_CRUISE = 1;
  if (cruiseRace <= 0) return { cruise: MIN_CRUISE, spurt: FIXED_SPURT_RATE, straight: FIXED_STRAIGHT_RATE, goal: GOAL_RATE, start: GOAL_RATE };
  const want = room > 0.5 ? cruiseRace / room : MAX_CRUISE;
  return {
    cruise: Math.max(MIN_CRUISE, Math.min(MAX_CRUISE, want)),
    spurt: FIXED_SPURT_RATE,
    straight: FIXED_STRAIGHT_RATE,
    goal: GOAL_RATE,
    start: GOAL_RATE,
  };
}

export function timeWarpFor(knots: PhaseKnots, rates: PhaseRates = DEFAULT_PHASE_RATES): TimeWarp {
  for (const [name, r] of [['cruise', rates.cruise], ['spurt', rates.spurt], ['straight', rates.straight]] as const) {
    if (!(r > 0) || !Number.isFinite(r)) {
      throw new Error(`送り速さは正の有限値でなければなりません: ${name}=${r}`);
    }
  }
  const { startSec, spurtSec, straightSec, startRealSec, goalSec, finishSec } = knots;
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
    /**
     * ★発走直後も実時間（`startRealSec` まで）。発馬機が世界固定なので理屈はゴール前と同じ。
     *   繋ぎは他と同じ `smoothstep`。
     */
    if (startRealSec !== undefined && startRealSec > startSec) {
      const span = Math.min(TRANSITION_SEC, Math.max(0.2, startRealSec - startSec));
      if (t <= startRealSec - span / 2) return rates.start ?? 1;
      if (t <= startRealSec + span / 2) {
        const w = smooth((t - (startRealSec - span / 2)) / span);
        return (rates.start ?? 1) + (rates.cruise - (rates.start ?? 1)) * w;
      }
    }
    /**
     * ★**直線ぜんぶを実時間にできるようにする**（2026-08-22）
     *
     * ⚠️ ★`GOAL_REAL_TIME_M` を直線の長さ以上にすると `goalSec === straightSec` になり、
     *    下の `goalSec > straightSec` が偽になって★**実時間区間が丸ごと消えていました。**
     *    実測: 160m → 34.4 秒 ／ 320m → 39.5 秒 ／ **400m → 29.7 秒**（縮む）。
     *    ★値を大きくしたのに機能が止まる、という縮退です（R-27: 縮退は狭い側へ落とす）。
     * → 直線の頭から実時間にする、と読み替えます。
     */
    const wholeStraightIsReal = goalSec !== undefined && goalSec <= straightSec;
    const straightRate = wholeStraightIsReal ? (rates.goal ?? 1) : rates.straight;
    if (t <= spurtSec - TRANSITION_SEC / 2) return rates.cruise;
    if (t <= spurtSec + TRANSITION_SEC / 2) return blend(rates.cruise, rates.spurt, spurtSec);
    if (t <= straightSec - TRANSITION_SEC / 2) return rates.spurt;
    if (t <= straightSec + TRANSITION_SEC / 2) return blend(rates.spurt, straightRate, straightSec);
    if (wholeStraightIsReal) return straightRate;
    /**
     * ★ゴール前は実時間へ。**繋ぎ目は他と同じ `smoothstep`** にします
     *   （段で切り替えると「グングン速くなる」が再発します）。
     *   ⚠️ 繋ぎに使える時間が短いので、**残り時間の半分**を上限に幅を詰めます。
     */
    if (goalSec !== undefined && goalSec > straightSec) {
      const goalRate = rates.goal ?? 1;
      const span = Math.min(TRANSITION_SEC, Math.max(0.2, (goalSec - straightSec)));
      if (t <= goalSec - span / 2) return rates.straight;
      if (t <= goalSec + span / 2) {
        const w = smooth((t - (goalSec - span / 2)) / span);
        return rates.straight + (goalRate - rates.straight) * w;
      }
      return goalRate;
    }
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
  /**
   * ★ゴール前の実時間区間に入る時刻。
   *   直線は残り `STRAIGHT_M` から始まるので、残り `GOAL_REAL_TIME_M` に達するのは
   *   直線の経過のうち `1 - GOAL_REAL_TIME_M / STRAIGHT_M` を過ぎたあたり（等速の近似）。
   *   ⚠️ ★**基準の馬の `finishSec`** を使います（`lastFinish` は最後の 1 頭なので、
   *      それで割ると区間が後ろにずれます）。
   */
  const straightRace = Math.max(0, base.finishSec - base.straightSec);
  const goalSec = base.straightSec + straightRace * (1 - GOAL_REAL_TIME_M / STRAIGHT_M);
  /**
   * ★発走直後の実時間区間。
   *
   * ⚠️ ★`knotsFor` は**距離を知りません**（境界時刻しか受け取らない）。
   *    距離を推測して割ると、**距離が変わったとき黙って狂います。**
   *    → 直線（残り 400m）にかかった時間から **1m あたりの秒数**を求め、
   *      それで `START_REAL_TIME_M` を換算します。**距離に依存しません。**
   */
  const secPerM = straightRace / STRAIGHT_M;
  const startRealSec = base.startSec + START_REAL_TIME_M * secPerM;
  return {
    startSec: base.startSec,
    spurtSec: base.spurtSec,
    straightSec: base.straightSec,
    goalSec,
    startRealSec,
    finishSec: lastFinish,
  };
}
