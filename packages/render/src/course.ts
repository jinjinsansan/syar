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
  opts?: { lapM?: number; homeStretchM?: number; widthM?: number; turn?: 'left' | 'right' },
): Course {
  const lapM = opts?.lapM ?? 2000;
  const homeStretchM = opts?.homeStretchM ?? 400;
  const widthM = opts?.widthM ?? 20;
  const turn = opts?.turn ?? 'left';
  if (!(distance > 0)) throw new Error(`距離が不正です: ${distance}`);
  if (!(homeStretchM * 2 < lapM)) throw new Error('直線が1周より長くなっています');

  /** 曲がり2つ（各180度）の合計 = 1周 − 直線2本 */
  const bendTotal = lapM - homeStretchM * 2;
  const radius = bendTotal / (2 * Math.PI);
  /** ★1つの「コーナー」は90度。4つで2つの曲がりになります */
  const cornerLen = bendTotal / 4;

  /**
   * ★ゴールを起点に**逆向き**に並べ、最後に反転します。
   *   こうすると「ゴール前が直線」「その手前が4角」が**必ず**成り立ちます。
   */
  const backward: CourseSegment[] = [];
  const ring: readonly CourseSegment[] = [
    { type: 'straight', length: homeStretchM, label: '直線' },
    { type: 'corner', length: cornerLen, radius, turn, label: '4角' },
    { type: 'corner', length: cornerLen, radius, turn, label: '3角' },
    { type: 'straight', length: homeStretchM, label: '向正面' },
    { type: 'corner', length: cornerLen, radius, turn, label: '2角' },
    { type: 'corner', length: cornerLen, radius, turn, label: '1角' },
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
  return { distance, segments: [...backward].reverse(), widthM, homeStretchM };
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
  let x = 0, y = 0, heading = 0;

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
  return { x, y, heading };
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
