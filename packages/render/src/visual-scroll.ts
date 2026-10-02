/**
 * ★**見た目の速度**（背景の流れ・脚の周期）を時間圧縮から切り離す。
 *
 * D-062 の時間圧縮（道中 1.8 倍速・直線 0.7 倍速）をそのまま世界に当てると、
 *   序盤: 背景が 28m/秒で流れ、脚は 4 完歩/秒（「小走り」）
 *   直線: 背景が 12m/秒、脚は 1.7 完歩/秒（スローモーション）
 * になる（実測: `tools/audit-race-motion.mjs`）。オーナー指摘「途中でグングン速くなるのが不自然」の正体。
 *
 * → 背景と脚には **真の走速（レース時計での m/秒）** を使い、順位の推移だけを圧縮する。
 *   実装は「表示時計での注視点の増分 × k」を積分した補正 Δ(d) で表す:
 *     見た目の進行距離 = focusS(d) + Δ(d),  dΔ = (k − 1)·dfocusS,  k = 1/rate（rate = dレース時計/d表示時計）
 *   ★決勝線・審判塔のように世界に固定した物体を映す区間では k → 1（重み w=1）にし、
 *     Δ をその区間で 0 に正規化する（物体と馬の位置が一致する）。
 *
 * ⚠️ 位置・時刻・着順には一切触れない。乱数も使わない（憲法4）。
 */
export interface VisualScrollSample {
  readonly displaySec: number;
  /** そのフレームの注視点（m・真の位置） */
  readonly focusS: number;
  /** dレース時計/d表示時計（時間圧縮の倍率） */
  readonly rate: number;
  /** 0=見た目の速度で流す, 1=真の位置に一致させる（`broadcastV2AnchorWeight`） */
  readonly anchorWeight: number;
  /**
   * ★このサンプルで ★カメラが切り替わった（★前のサンプルと別のショット）。
   *   ★切り替わりでは 注視点が ★数 m 跳ぶ（★ショットごとに構図が違う）。★30m 未満なので「跳び」と見なされず、
   *   ★Δ がその刻みの中で 跳んだ分を少しずつ打ち消し、★切り替わった直後のコマで ★芝が止まる・わずかに逆へ動いた
   *   （★2026-10-02 オーナー「今さっきのレースの芝の動きがおかしかった」・本番 d=51.75 homestretch-side「急変」-0.9m/秒）。
   *   ★切り替わりの刻みは ★跳びと同じ扱い（★見た目の速さを保ち・★刻みの中は芝の位置そのものを補間）。
   */
  readonly cut?: boolean;
}

export interface VisualScroll {
  /**
   * 補正 Δ（m）。見た目の進行距離 = focusS + Δ
   * ★`focusS`（そのコマの注視点）を渡すと、注視点が跳んだ区間では Δ を時間でなく注視点の進みで補間する。
   *   時間で補間すると、区間の途中で注視点だけ先に跳び Δ が遅れて付いてくるため、
   *   芝が 1 コマ前へ飛んで数コマで 1,000m 戻る（2026-09-29 オーナー「芝が後退していく」）。
   */
  deltaAt(displaySec: number, focusS?: number): number;
}

/** ★1 区間（表示 0.05 秒）で注視点がこれより動いたら「跳び」とみなす（★実馬の 20m/秒でも 1m） */
export const VISUAL_SCROLL_JUMP_M = 30;
/** ★これより速い時間の圧縮（★dレース時計/d表示時計）は ★区間を飛ばしている刻み（★ふだんは 0.7〜1.8） */
export const VISUAL_SCROLL_SKIP_RATE = 5;

export function buildVisualScroll(samples: readonly VisualScrollSample[]): VisualScroll {
  if (samples.length === 0) return { deltaAt: () => 0 };
  const times = new Float64Array(samples.length);
  const deltas = new Float64Array(samples.length);
  const focuses = new Float64Array(samples.length);
  /** ★刻み（i−1→i）が「跳び」か（★注視点が 30m 超・★カメラの切り替わり） */
  const jumpy = new Uint8Array(samples.length);
  for (let i = 0; i < samples.length; i++) focuses[i] = samples[i]!.focusS;
  times[0] = samples[0]!.displaySec;
  deltas[0] = 0;
  for (let i = 1; i < samples.length; i++) {
    const cur = samples[i]!;
    const prev = samples[i - 1]!;
    if (!(cur.displaySec > prev.displaySec)) throw new Error('visual scroll: samples must be increasing in displaySec');
    const rate = cur.rate > 0 && Number.isFinite(cur.rate) ? cur.rate : 1;
    const w = Math.max(0, Math.min(1, cur.anchorWeight));
    const k = w + (1 - w) / rate;
    times[i] = cur.displaySec;
    const df = cur.focusS - prev.focusS;
    /**
     * 🔴 ★**跳び（区間を飛ばす）の区間は 見た目の速さを 前の区間のまま保つ**（★2026-10-01・オーナー「最後の直線で 芝が逆に動く・急に超高速・急に超スロー」）。
     *   ★旧: ★`(k − 1)·df` のまま。★跳びの刻みの rate は極端（★表示 0.05 秒で 1,150m）なので ★芝が その刻みで 毎秒 30m 前後に跳ねた。
     *   ★新: ★Δ の変化を「跳んだ分を打ち消し ＋ 前の区間の見た目の速さ × 刻みの秒」にする（★芝の速さが 跳びの前後で つながる）。
     */
    /**
     * ★跳びの隣の刻みも同じ扱い（★2026-10-01 の測り直し: ★跳びの後の刻みは rate が極端（★表示 1 秒あたり レース数十秒）で
     *   ★k ≈ 0 → ★芝が 約 0.1 秒 止まった）。★ふだんの rate は 0.7〜1.8 なので ★`VISUAL_SCROLL_SKIP_RATE` を超えたら 跳びと同じ。
     */
    const cutHere = cur.cut === true && df !== 0;
    if (Math.abs(df) > VISUAL_SCROLL_JUMP_M || cutHere) jumpy[i] = 1;
    if ((Math.abs(df) > VISUAL_SCROLL_JUMP_M || cutHere || rate > VISUAL_SCROLL_SKIP_RATE) && i >= 2) {
      const prevVisual = (focuses[i - 1]! + deltas[i - 1]!) - (focuses[i - 2]! + deltas[i - 2]!);
      const prevDt = times[i - 1]! - times[i - 2]!;
      const dt = cur.displaySec - prev.displaySec;
      deltas[i] = deltas[i - 1]! - df + (prevDt > 0 ? (prevVisual / prevDt) * dt : 0);
    } else {
      deltas[i] = deltas[i - 1]! + (k - 1) * df;
    }
  }
  // ★固定物体の区間で Δ=0 になるよう正規化（最初に w=1 になった点を基準にする）
  const anchorIndex = samples.findIndex((sample) => sample.anchorWeight >= 0.999);
  const base = anchorIndex >= 0 ? deltas[anchorIndex]! : 0;
  for (let i = 0; i < deltas.length; i++) deltas[i] = deltas[i]! - base;
  return {
    deltaAt(displaySec: number, focusS?: number): number {
      if (displaySec <= times[0]!) return deltas[0]!;
      const last = times.length - 1;
      if (displaySec >= times[last]!) return deltas[last]!;
      let lo = 0, hi = last;
      while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (times[mid]! <= displaySec) lo = mid; else hi = mid; }
      const jump = focuses[hi]! - focuses[lo]!;
      const t = (displaySec - times[lo]!) / (times[hi]! - times[lo]!);
      /**
       * 🔴 ★**跳びの刻みの中は ★芝の位置そのものを 時間で補間する**（★2026-10-01）。★Δ ＝ その位置 − 注視点。
       *   ★旧（2026-09-29）: ★Δ を ★注視点の進みで補間 → ★注視点が跳ぶ前のコマで Δ だけが少しずつ下がり、
       *     ★芝が 3 コマ止まって 跳んだコマで 毎秒 95m 相当に跳ねた（★本番の見本のレースで実測 d≈44.6）。
       *   ★新: ★芝の位置は 刻みの両端を まっすぐ結ぶ → ★注視点が どのコマで跳んでも 芝は止まらず 跳ねない（★09-29 の「1,000m 戻る」も起きない）。
       */
      if (focusS !== undefined && Number.isFinite(focusS) && (Math.abs(jump) > VISUAL_SCROLL_JUMP_M || jumpy[hi] === 1)) {
        const xLo = focuses[lo]! + deltas[lo]!;
        const xHi = focuses[hi]! + deltas[hi]!;
        return xLo + (xHi - xLo) * t - focusS;
      }
      return deltas[lo]! + (deltas[hi]! - deltas[lo]!) * t;
    },
  };
}

/**
 * ★**芝の最後の安全網**（★2026-10-02 オーナー「今のレース 芝がおかしい」・本番 race 344d9140: ★同じカメラのまま 1 コマだけ 毎秒 37m／91m）。
 *
 * 【★なぜ】
 *   ★表（`buildVisualScroll`）は 0.05 秒刻みの注視点から作る。★画面のカメラの切り替わりは ★実際の馬の位置（なめらかにした値）で決まるので、
 *   ★表の切り替わりと ★1 刻みずれることがある → ★同じカメラのコマに ★切り替わりの分の補正が入り、芝が 1 コマだけ跳ねた／止まった。
 *   ★原因を 1 つずつ潰してきたが（09-29・10-01・10-02 の 3 回）、★次の形がまた出る。★見た目の約束（★芝は 1 コマで跳ねない・止まらない・戻らない）を ★ここで直接守る。
 *
 * 【★やること】
 *   ★毎コマ「表どおりの芝の位置」の進みを 前のコマの速さと比べ、★カメラの切り替わり・逆走・急な跳ね／止まり なら ★前のコマの速さで進め、差を ★ずれ（offset）として持ち越す。
 *   ★芝の模様の ★絶対の位置は 画面に意味が無い（★繰り返し模様）ので ★ずれは足したままでよい。★0.4 秒以上続く変化は ★本当の変化として受け入れる。
 *   ★時計が戻った・0.5 秒より跳んだ（★見直し・巻き戻し）ら ★測り直す（★ずれは保つ）。
 */
export interface GroundSmoother {
  /** ★このコマの芝の位置（★表どおりの位置 `raw` ＋ ずれ）。★`cut` はカメラが切り替わったコマ */
  step(displaySec: number, raw: number, cut: boolean): number;
}

/** ★1 コマの速さの変化が これを超えたら「急変」（★毎秒 m・★前のコマの速さの 50% と 5m/秒 の大きい方・`[race-ground]` と同じ境目） */
const GROUND_JUMP_RATIO = 0.5;
const GROUND_JUMP_MIN = 5;
/** ★これより長く続く変化は 本当の変化（★秒） */
const GROUND_ACCEPT_SEC = 0.4;

export function createGroundSmoother(): GroundSmoother {
  let prevD: number | null = null;
  let prevRaw = 0;
  let prevSpeed: number | null = null;
  let offset = 0;
  let oddSec = 0;
  return {
    step(d: number, raw: number, cut: boolean): number {
      if (prevD === null || !(d > prevD) || d - prevD > 0.5) {
        prevD = d; prevRaw = raw; prevSpeed = null; oddSec = 0;
        return raw + offset;
      }
      const dt = d - prevD;
      const rawSpeed = (raw - prevRaw) / dt;
      const odd = cut || rawSpeed < 0
        || (prevSpeed !== null && Math.abs(rawSpeed - prevSpeed) > Math.max(GROUND_JUMP_MIN, Math.abs(prevSpeed) * GROUND_JUMP_RATIO));
      oddSec = odd ? oddSec + dt : 0;
      if (odd && !(oddSec > GROUND_ACCEPT_SEC && !cut) && prevSpeed !== null) {
        /** ★前のコマの速さで進める（★表どおりとの差は ずれへ） */
        offset += prevSpeed * dt - (raw - prevRaw);
      } else {
        prevSpeed = rawSpeed;
      }
      prevD = d; prevRaw = raw;
      return raw + offset;
    },
  };
}
