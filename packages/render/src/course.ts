/**
 * ★コース幾何（Layer A）— **走路を2次元にする**
 *
 * 【なぜ要るか】
 *   ⚠️ ここまでの実装は **`meters` 1つ**しか持っていませんでした。
 *      つまり**ワールドに直線しか存在しません**。この状態では、
 *      どれだけ描画を工夫しても次のものは**原理的に発生しません**:
 *        ・コーナー、周回
 *        ・**内／外（ラチからの距離）による距離ロス**
 *        ・「外を回すと届かない」「ラチ沿いが有利」「4角で外に出すのは賭け」
 *
 *   ★**最も効くのは距離ロス**です。90度コーナーで内ラチ沿い(2m)と外(12m)の差は
 *     `10 × π/2 ≒ 15.7m ≒ 6.5馬身`。**これを入れるだけで競馬の物語構造が生まれます。**
 *
 * 【★この層の約束】
 *   **純粋関数**です。副作用も乱数も時刻もありません。
 *   ⚠️ **着順を決めません。** ここが出すのは「s と w から見た平面座標」だけです。
 *
 * 【★いま決めていないこと（照会中）】
 *   `w` が**実際の走破距離に効く**なら、それは**着順が変わる**ということです。
 *   → それは `resolveRace` の領域（正典・V-4 の較正）なので、**ここでは決めません**。
 *     この層は「**もし w を通ったら、どれだけ余計に走るか**」を**計算できる**ようにするだけです。
 */

/** ★1馬身。隊列の基準に使います */
export const HORSE_LENGTH_M = 2.4;

/**
 * ★発走から最初のコーナーまでの直線 [m]。
 *   ⚠️ ★`@star/race-engine` の `RUN_UP_M` と**同じ値**であること。
 */
export const RUN_UP_M = 250;

export interface CourseSegment {
  readonly type: 'straight' | 'corner';
  /** 中心線上の長さ [m] */
  readonly length: number;
  /** corner のみ。**中心線の**曲率半径 [m] */
  readonly radius?: number | undefined;
  /** 回り方向。日本の競馬場はコースごとに異なります */
  readonly turn?: 'left' | 'right' | undefined;
  readonly label: string;
}

export interface Course {
  /** レース距離 [m] */
  readonly distance: number;
  /** ★スタートからゴールまでを順に並べた区間 */
  readonly segments: readonly CourseSegment[];
  /** コース幅 [m]。`w` は 0（内ラチ）〜 widthM */
  readonly widthM: number;
  /** 直線（ゴール前）の長さ [m] */
  readonly homeStretchM: number;
  /**
   * ★**スタート地点の進行方向** [rad]。
   *
   *   ⚠️ これが無いと、コースが**斜めに寝ます**（実際に寝ました）。
   *   ★**ゴール前の直線が水平・右向きになる**ように、逆算して決めます。
   *     競馬場の俯瞰は、**決勝線のある直線を手前・水平**に置くのが作法です。
   */
  readonly startHeading: number;
}

export interface WorldPos {
  /** 上から見た平面座標 [m] */
  readonly x: number;
  readonly y: number;
  /** 進行方向 [rad]。0 = +x 方向 */
  readonly heading: number;
}

/**
 * ★**楕円コースを組む。**
 *
 *   2本の直線と2つの曲がりからなる周回コースを作り、
 *   **ゴール板を直線の終わりに置いて、そこから `distance` だけ戻った点をスタート**にします。
 *   ⚠️ 実在の競馬場の形状・名称は使いません（憲法 §0.1）。**幾何だけ**です。
 *
 * @param distance レース距離 [m]
 * @param opts.lapM 1周の長さ [m]（既定 2000）
 * @param opts.homeStretchM 直線の長さ [m]（既定 400）
 */
export function ovalCourse(
  distance: number,
  opts?: {
    lapM?: number; homeStretchM?: number; widthM?: number; turn?: 'left' | 'right';
    /**
     * ★**コーナーごとの半径 [m]**（★`[1角, 2角, 3角, 4角]`・★2026-08-31・段階①「器」）。
     * ⚠️ ★省くと従来どおり（4 本とも同じ半径）。★省いたときの値は**1 ビットも変わりません**。
     * ⚠️ ★`@star/race-engine` の `OvalSpec.cornerRadiiM` と**同じ規則**であること
     *    （★あちらを import できません — ★この層は依存ゼロ・§14）。
     *    ★`packages/race-engine/test/lane-geometry.test.ts` が 44 通りで突き合わせます（R-33）。
     */
    cornerRadiiM?: readonly [number, number, number, number];
  },
): Course {
  const lapM = opts?.lapM ?? 2000;
  const homeStretchM = opts?.homeStretchM ?? 400;
  const widthM = opts?.widthM ?? 20;
  const turn = opts?.turn ?? 'left';
  if (!(distance > 0)) throw new Error(`距離が不正です: ${distance}`);
  if (!(homeStretchM * 2 < lapM)) throw new Error('直線が1周より長くなっています');

  /**
   * ★コーナー 4 本の半径と長さ。
   * ⚠️ ★**`@star/race-engine` の `ovalCornerPlan` と同じ規則**です（★写しであることを明示します）。
   */
  const plan = ((): { radii: readonly number[]; lengths: readonly number[] } => {
    const quarter = Math.PI / 2;
    const rs = opts?.cornerRadiiM;
    if (rs === undefined) {
      /** 曲がり2つ（各180度）の合計 = 1周 − 直線2本 */
      const bendTotal = lapM - homeStretchM * 2;
      const r = bendTotal / (2 * Math.PI);
      /** ★1つの「コーナー」は90度。4つで2つの曲がりになります */
      const len = bendTotal / 4;
      return { radii: [r, r, r, r], lengths: [len, len, len, len] };
    }
    for (const r of rs) if (!(r > 0)) throw new Error(`コーナーの半径は正の数であること: ${JSON.stringify(rs)}`);
    const derived = homeStretchM * 2 + quarter * rs.reduce((a, b) => a + b, 0);
    if (Math.abs(derived - lapM) > 1e-6 * Math.max(1, lapM)) {
      throw new Error(`1 周とコーナーの半径が食い違っています: lapM=${lapM} / 半径から導くと ${derived.toFixed(6)}`);
    }
    return { radii: rs, lengths: rs.map((r) => quarter * r) };
  })();

  /**
   * ★ゴールを起点に**逆向き**に並べ、最後に反転します。
   *   こうすると「ゴール前が直線」「その手前が4角」が**必ず**成り立ちます。
   */
  const backward: CourseSegment[] = [];
  /** ⚠️ ★逆向きに積むので 直線 → 4角 → 3角 → 向正面 → 2角 → 1角。★`plan` は `[1角..4角]` の順です */
  const corner = (i: number, label: string): CourseSegment =>
    ({ type: 'corner', length: plan.lengths[i]!, radius: plan.radii[i]!, turn, label });
  const ring: readonly CourseSegment[] = [
    { type: 'straight', length: homeStretchM, label: '直線' },
    corner(3, '4角'),
    corner(2, '3角'),
    { type: 'straight', length: homeStretchM, label: '向正面' },
    corner(1, '2角'),
    corner(0, '1角'),
  ];
  let left = distance;
  let i = 0;
  while (left > 1e-9) {
    const seg = ring[i % ring.length]!;
    const take = Math.min(seg.length, left);
    backward.push({ ...seg, length: take });
    left -= take;
    i += 1;
  }
  /**
   * ★**発走から最初のコーナーまでの直線**（引き込み線）。
   *   ⚠️ ★**コーナーの途中から発走させると、外枠が発走直後に大きく外を回ります。**
   *      実測で 枠とロスの相関が 直線発走 0.117 に対し**コーナー発走 0.539**。
   *   ★実際の競馬場が「コーナーの途中から発走させない」理由がこれです。
   *   ⚠️ ★`@star/race-engine` の `ovalSegments` と**同じ規則**であること
   *      （`lane-geometry.test.ts` が突き合わせます）。
   */
  const reversed = [...backward].reverse();
  const segments: CourseSegment[] = (() => {
    const out: CourseSegment[] = [];
    let straight = 0;
    for (let i = 0; i < reversed.length; i++) {
      const seg = reversed[i]!;
      if (seg.type !== 'corner') { straight += seg.length; out.push(seg); continue; }
      const need = RUN_UP_M - straight;
      if (need <= 1e-9) { out.push(...reversed.slice(i)); break; }
      const take = Math.min(seg.length, need);
      out.push({ type: 'straight', length: take, label: '発走' });
      straight += take;
      const rest = seg.length - take;
      if (rest > 1e-9) { out.push({ ...seg, length: rest }); out.push(...reversed.slice(i + 1)); break; }
    }
    return out.length > 0 ? out : reversed;
  })();

  /**
   * ★**ゴール前の直線が水平（heading = 0）になるように、スタートの向きを逆算します。**
   *   最後の直線までに曲がる角度の合計だけ、最初に戻しておきます。
   */
  let turned = 0;
  for (const seg of segments) {
    if (seg.type !== 'corner' || seg.radius === undefined || seg.radius <= 0) continue;
    turned += (seg.length / seg.radius) * (seg.turn === 'right' ? -1 : 1);
  }
  return { distance, segments, widthM, homeStretchM, startHeading: -turned };
}

/**
 * ★**その走路の「最後の直線」の長さ**（m）。
 *
 * ⚠️ ★`course.homeStretchM` を直接読まないこと。★あれは ★**1 周の作り方**の値で、
 *    ★レース距離が直線より短いときは ★**そこまで積まれていません**
 *    （`ovalCourse` はゴールから後ろ向きに積むので、最後の区間は `min(直線, 距離)`）。
 * ★時間割・台本・位置模型の 3 つが ★**同じ値**を見る必要があるので、ここから取ります。
 */
export function homeStretchMetersOf(course: Course): number {
  return Math.min(course.homeStretchM, course.distance);
}

/** ★`s`（スタートからの中心線距離）がどの区間にあるか */
export function segmentAt(course: Course, s: number): CourseSegment {
  let acc = 0;
  for (const seg of course.segments) {
    acc += seg.length;
    if (s <= acc + 1e-9) return seg;
  }
  const last = course.segments[course.segments.length - 1];
  if (last === undefined) throw new Error('区間がありません');
  return last;
}

/**
 * ★**コーナーで外を回ったときの、余計に走る距離** [m]
 *
 *   `Δs_actual = Δs_center + (w − w_center) × Δθ`
 *
 *   ★90度コーナー（Δθ = π/2）で、内ラチ沿い(w=2m)と外(w=12m)の差は
 *     `10 × π/2 ≒ 15.7m ≒ 6.5馬身`。
 *
 *   ⚠️ **符号に注意。** 左回りなら、内ラチは進行方向の左側です。
 *      `w` は**内ラチからの距離**なので、`w` が大きいほど外＝**必ず余計に走ります**。
 *
 * @returns 中心線を走った場合との差 [m]（★外なら正、内なら負）
 */
export function laneExtraMeters(course: Course, fromS: number, toS: number, w: number): number {
  if (toS <= fromS) return 0;
  const wCentre = course.widthM / 2;
  let extra = 0;
  let acc = 0;
  for (const seg of course.segments) {
    const segStart = acc;
    const segEnd = acc + seg.length;
    acc = segEnd;
    if (segEnd <= fromS || segStart >= toS) continue;
    if (seg.type !== 'corner' || seg.radius === undefined || seg.radius <= 0) continue;
    const covered = Math.min(segEnd, toS) - Math.max(segStart, fromS);
    // ★中心線の弧長 = R·Δθ なので Δθ = 弧長 / R
    const dTheta = covered / seg.radius;
    extra += (w - wCentre) * dTheta;
  }
  return extra;
}

/**
 * ★`(s, w)` → 上から見た平面座標。
 *
 *   ⚠️ `s` は**中心線上の距離**です。`w` は横位置で、**座標だけを動かします**
 *      （距離ロスは `laneExtraMeters` で別に計算します。**混ぜません**）。
 */
export function posOf(course: Course, s: number, w: number): WorldPos {
  const wCentre = course.widthM / 2;
  const off = w - wCentre;
  let acc = 0;
  let x = 0, y = 0, heading = course.startHeading;

  /**
   * ★**走路の前後に、接線方向の延長を持ちます。**
   *
   * ⚠️ ★以前は範囲の外で**1点に潰れていました**（`off` が効かず、
   *    どの `w` も同じ座標）。→ ★**決勝線の先で走路が消えました。**
   *    実際の動画で、ゴールの右側が芝ではなく地の色になっていました。
   *
   * ★実際の競馬場にも、発走の手前（引き込み線）とゴールの先（走路の続き）があります。
   *   **画面の外まで走路が続いていること**が、走路に見えるための条件です。
   */
  if (s < 0) {
    const nx = Math.sin(heading), ny = -Math.cos(heading);
    return { x: Math.cos(heading) * s + nx * off, y: Math.sin(heading) * s + ny * off, heading };
  }

  for (const seg of course.segments) {
    const segStart = acc;
    const segEnd = acc + seg.length;
    const within = Math.max(0, Math.min(seg.length, s - segStart));

    if (seg.type === 'straight') {
      if (s <= segEnd) {
        // ★進行方向の**右手**が +off 側（左回りなら外側）
        const nx = Math.sin(heading), ny = -Math.cos(heading);
        const sgn = seg.turn === 'right' ? -1 : 1;
        return {
          x: x + Math.cos(heading) * within + nx * off * sgn,
          y: y + Math.sin(heading) * within + ny * off * sgn,
          heading,
        };
      }
      x += Math.cos(heading) * seg.length;
      y += Math.sin(heading) * seg.length;
    } else {
      const R = seg.radius ?? 1;
      const sgn = seg.turn === 'right' ? -1 : 1;
      // 曲率中心（左回りなら進行方向の左手）
      const cx = x - Math.sin(heading) * R * sgn;
      const cy = y + Math.cos(heading) * R * sgn;
      const theta0 = Math.atan2(y - cy, x - cx);
      if (s <= segEnd) {
        const dTheta = (within / R) * sgn;
        const th = theta0 + dTheta;
        // ★外を回るほど半径が大きい
        const r = R + off * sgn;
        return {
          x: cx + Math.cos(th) * r,
          y: cy + Math.sin(th) * r,
          heading: heading + dTheta,
        };
      }
      const dTheta = (seg.length / R) * sgn;
      const th = theta0 + dTheta;
      x = cx + Math.cos(th) * R;
      y = cy + Math.sin(th) * R;
      heading += dTheta;
    }
    acc = segEnd;
  }
  // ★走路の終わりから先は、最後の向きにまっすぐ延ばす（★1点に潰さない）
  const over = s - acc;
  const nx = Math.sin(heading), ny = -Math.cos(heading);
  return {
    x: x + Math.cos(heading) * over + nx * off,
    y: y + Math.sin(heading) * over + ny * off,
    heading,
  };
}

/**
 * ★**走線 `w` に沿って実際に進む長さ**（残件 A-2 の候補 (b′)・2026-08-29）
 *
 * 【なぜ要るか】
 *   ⚠️ ★`s` は**中心線の弧長**です。★同じ `Δs` でも、**曲線では走線ごとに実移動が違います**:
 *
 *        w=0  0.9476   w=2.2  0.9592   w=10 1.0000（中心線）   w=20 1.0524
 *
 *   ★直線→曲線の境目でこの比が**1 コマで階段状に変わる**ため、
 *   ★カメラ（注視点）と馬が**別のコマで境目を越え**、その 1 コマだけ相対的に滑ります
 *   （実測 12.6px・`ff5a261` / `QUESTIONS_P4_SEAM_SLIP_20260829.md`）。
 *
 * 【★この層の約束】
 *   ★純粋関数です。★**着順にも `laneExtraM` にも触れません。**
 *   ⚠️ ★距離ロス（着順に効く）は `laneExtraMeters` の担当で、**あちらはエンジンが引きます**（D-071）。
 *      ★こちらは**描画がカメラを置くため**の量です。★2 つを混ぜないこと。
 *
 * 【★比の出どころは `posOf` と同じ式】
 *   ★曲線での実移動は `posOf` が使う半径 `r = R + off·sgn` に比例します。
 *   ★**同じ規則を 2 か所で持たないよう、ここに 1 本で書きます。**
 */
function laneRatioOf(seg: CourseSegment, offFromCentre: number): number {
  if (seg.type !== 'corner' || seg.radius === undefined || seg.radius <= 0) return 1;
  const sgn = seg.turn === 'right' ? -1 : 1;
  const r = seg.radius + offFromCentre * sgn;
  return r > 0 ? r / seg.radius : 0;
}

/**
 * ★`s`（中心線の弧長）までに、走線 `w` が実際に進む長さ [m]。
 *   ★走路の外（`s < 0` / 走路の終わりより先）は接線方向の延長なので比 1 です。
 */
export function laneArcLengthAt(course: Course, s: number, w: number): number {
  const off = w - course.widthM / 2;
  if (s <= 0) return s;
  let acc = 0;
  let out = 0;
  for (const seg of course.segments) {
    if (s <= acc) return out;
    const covered = Math.min(seg.length, s - acc);
    out += covered * laneRatioOf(seg, off);
    acc += seg.length;
  }
  /**
   * ★走路の終わりから先は最後の向きへまっすぐ（比 1）。
   *
   * ⚠️ ★**`Math.max(0, …)` が要ります。** ★これが無いと、`s` が走路の**内側**で終わったとき
   *    （＝ループが早期 return せずに抜けたとき）に **`s − 全長` という負の値**を足し、
   *    ★1600m の走路で `s=1500` が **100m 短く**返ります。
   *    ★実害: (b′) の注視点が **−410m** ずれ、★不変条件の検査が 329 コマで割れました
   *    （2026-08-29・裁定 §7 の「①を先に測れ」で捕まえた）。
   */
  return out + Math.max(0, s - acc);
}

/**
 * ★`laneArcLengthAt` の逆。★走線に沿った長さ `len` に対応する `s` を返す。
 *
 * ⚠️ ★二分探索ではなく**区間ごとに閉じた形**で解きます（★誤差を持ち込まないため）。
 * ★比は正（`r > 0`）なので単調増加で、逆は一意です。
 */
export function sAtLaneArcLength(course: Course, len: number, w: number): number {
  const off = w - course.widthM / 2;
  if (len <= 0) return len;
  let acc = 0;
  let seen = 0;
  for (const seg of course.segments) {
    const ratio = laneRatioOf(seg, off);
    const segLen = seg.length * ratio;
    if (ratio > 0 && len <= seen + segLen) return acc + (len - seen) / ratio;
    seen += segLen;
    acc += seg.length;
  }
  /** ★走路の終わりから先（比 1）。★`laneArcLengthAt` と同じく負を足さない */
  return acc + Math.max(0, len - seen);
}

/** ★区間の境目（俯瞰デバッグ表示と標識に使う） */
export function segmentStarts(course: Course): readonly { s: number; label: string }[] {
  const out: { s: number; label: string }[] = [];
  let acc = 0;
  for (const seg of course.segments) {
    out.push({ s: acc, label: seg.label });
    acc += seg.length;
  }
  return out;
}
