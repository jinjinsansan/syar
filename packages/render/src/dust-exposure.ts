/**
 * ★**どの馬が、どれだけ砂を浴びてきたか**（2026-08-29・報告 §10-2「馬体・勝負服が汚れない」）
 *
 * 【★なぜ描画層に式を置かないか】
 *   ★正典 D-072 と同じ形です — ★**画面で式を作らない。**
 *   ★スタミナゲージを画面側で作ったとき、★**符号が逆**になった実例があります。
 *   → ★量はここで 1 か所だけ出し、描画層は**受け取った数を塗るだけ**にします。
 *
 * 【★なぜ「いまの位置」ではないか】
 *   ★汚れは**溜まるもの**です。★最後方から差してきた馬は、
 *   ★先頭に立った瞬間にきれいになったりしません。
 *   → ★**レースの初めからの積分**で出します。
 *
 * 【★なぜ描画の fps で積まないか（憲法 4）】
 *   ⚠️ ★毎フレーム前の値に足す形にすると、★**コマ落ちで結果が変わります。**
 *      ★同じシードで同じ絵にならなくなり、決定論が壊れます。
 *   → ★**描画とは無関係の固定の刻み**（`DUST_EXPOSURE_STEP_SEC`）で 1 度だけ表を作り、
 *      ★描画はそれを**引くだけ**にします。
 *
 * ⚠️ ★着順・タイム・着差・払戻には一切触れません。★**見た目だけ**です（憲法 3）。
 */

/**
 * ★砂煙が後ろへ伸びる長さ（m）。
 *   ⚠️ ★`perspective-draw.ts` の `PLUME_M` と**同じ値でなければ意味がありません**
 *      — ★絵に描かれていない砂で汚れたら、見ている人には理由が分かりません。
 *   ★同じ量を 2 か所で持つと必ず離れます（R-30）。★出どころはここ 1 か所です。
 */
export const DUST_PLUME_M = 6.0;

/**
 * ★砂煙の横の広がり（片側・m）。
 *   ★`perspective-draw.ts` の `lateral = (jig - 0.5) * (0.45 + age * 1.30)` の最大値。
 */
export const DUST_PLUME_HALF_WIDTH_M = 0.875;

/**
 * ★積分の刻み（秒）。★描画の fps とは無関係に固定する。
 *
 * 【★0.3 にした根拠（測ってから決めた・`tools/_soilstep.mjs`・seed 42/253/90）】
 *   ⚠️ ★最初 0.1 で書きました。★表を作るのに **119ms** かかります。
 *      ★過去に「映像は成立したが**初期化 +31%**」で本線に入れなかった案があるので、測りました。
 *
 *        刻み    費用          0.02 秒刻みとの最大の差
 *        0.1     110〜161ms    0.0045
 *        0.3     ★37〜54ms    ★0.0150
 *        0.5      23〜31ms     0.0554
 *
 *   ★0.3 なら**費用は 3 分の 1**、誤差 0.015。
 *   ★粒の数は `round(12 × soil)` なので、0.015 のずれで数が変わるのは**最大 0.18 個**
 *     ＝ ★**絵は実質変わりません。**
 *   ★0.5 は誤差 0.055（粒 0.66 個ぶん）で、たまに 1 個変わります。★費用の得も小さいので取りません。
 */
export const DUST_EXPOSURE_STEP_SEC = 0.3;

/**
 * ★**この秒数ぶん、真後ろに張り付いて浴び続けると 1.0（＝満量）**になる。
 *
 *   ★短くすると全馬がすぐ真っ黒になり、★見分けがつかなくなります。
 *   ★1 レースは 90〜100 秒なので、★**ずっと後ろにいた馬でようやく満量**になる長さにします。
 */
export const DUST_EXPOSURE_SATURATION_SEC = 45;

/** ★積分に渡す 1 頭ぶんの位置（走った距離と横位置だけ。★着順には触れない） */
export interface DustExposureHorse {
  readonly gate: number;
  /** ★走路に沿って進んだ距離（m） */
  readonly s: number;
  /** ★走路の横位置（m） */
  readonly w: number;
}

/**
 * ★**その瞬間、この馬が浴びている砂の強さ**（0＝浴びていない … 1＝真後ろに 1 頭）。
 *
 *   ★前を行く馬 1 頭ごとに 0〜1 を出して足します。★複数頭の後ろなら濃くなります。
 *   ★近いほど・真後ろほど濃い。★砂煙の外に出たら 0。
 *
 * ⚠️ ★**前の馬は汚れません。** 砂は後ろへ流れるので、★`ahead.s > me.s` のときだけ数えます。
 */
export function dustIntakeRate(
  me: DustExposureHorse,
  field: readonly DustExposureHorse[],
): number {
  let rate = 0;
  for (const other of field) {
    if (other.gate === me.gate) continue;
    const ds = other.s - me.s;
    /** ★前にいない馬の砂は浴びません（真横・後ろは 0） */
    if (!(ds > 0) || ds > DUST_PLUME_M) continue;
    const dw = Math.abs(other.w - me.w);
    if (dw > DUST_PLUME_HALF_WIDTH_M) continue;
    /** ★遠いほど薄い（砂煙は後ろほど薄れる。★`fade = (1-age)^2` と同じ落ち方） */
    const near = 1 - ds / DUST_PLUME_M;
    /** ★真後ろから外れるほど薄い */
    const aligned = 1 - dw / DUST_PLUME_HALF_WIDTH_M;
    rate += near * near * aligned;
  }
  return rate;
}

/**
 * ★**汚れの表を 1 度だけ作り、引く関数を返す。**
 *
 *   ★戻り値は `(レース秒, 枠番) => 0〜1`。★描画はこれを**引くだけ**です。
 *
 * ⚠️ ★**呼ぶ側は 1 レースにつき 1 回だけ呼ぶこと。** 毎フレーム呼ぶと表を作り直します。
 *
 * @param positionsAt ★その**レース秒**における全馬の位置。★**製品と同じ位置モデルを渡すこと**（R-30）
 *                    ⚠️ ★表示秒ではありません。★時間圧縮（D-062）が掛かる前の物理の秒です。
 * @param endSec      ★表を作る終わりの**レース秒**（★最後の馬が決勝線を通るところまで）
 */
export function dustExposureCurve(
  positionsAt: (tSec: number) => readonly DustExposureHorse[],
  endSec: number,
  opts?: {
    readonly stepSec?: number | undefined;
    readonly saturationSec?: number | undefined;
  },
): (tSec: number, gate: number) => number {
  const step = opts?.stepSec ?? DUST_EXPOSURE_STEP_SEC;
  const saturation = opts?.saturationSec ?? DUST_EXPOSURE_SATURATION_SEC;
  if (!(step > 0)) throw new Error('★刻みは正の秒数で渡してください');
  if (!(saturation > 0)) throw new Error('★満量までの秒数は正で渡してください');

  /** ★表: 何番目の刻みか → 枠番 → 積んだ量（秒） */
  const table: Map<number, number>[] = [];
  const running = new Map<number, number>();
  const steps = Math.max(1, Math.ceil(endSec / step));
  for (let i = 0; i <= steps; i += 1) {
    const t = i * step;
    const field = positionsAt(t);
    for (const h of field) {
      const add = dustIntakeRate(h, field) * step;
      running.set(h.gate, (running.get(h.gate) ?? 0) + add);
    }
    table.push(new Map(running));
  }

  return (tSec: number, gate: number): number => {
    if (!(tSec > 0)) return 0;
    /**
     * ★刻みの間は**線形に補間**します。
     *   ⚠️ ★丸めると、★**刻みをまたぐ瞬間に汚れが跳びます**
     *      （`DUST_EXPOSURE_STEP_SEC` ごとに段が出る）。
     */
    const x = Math.min(steps, tSec / step);
    const i0 = Math.floor(x);
    const i1 = Math.min(steps, i0 + 1);
    const k = x - i0;
    const a = table[i0]?.get(gate) ?? 0;
    const b = table[i1]?.get(gate) ?? a;
    const seconds = a + (b - a) * k;
    return Math.max(0, Math.min(1, seconds / saturation));
  };
}
